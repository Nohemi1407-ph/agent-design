import { NextRequest, NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fetchKieBalance, logUsage } from "@/lib/credits";
import { now } from "@/lib/utils";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const KIE_BASE = "https://api.kie.ai";
const KIE_FILE_UPLOAD = "https://kieai.redpandaai.co/api/file-base64-upload";
const POLL_TIMEOUT_MS = 180_000;
const MAX_INPUT_IMAGES = 16;

// Credit safety thresholds — refuse to start a task if balance is too low
const MIN_CREDITS_FOR_1K = 40;   // typical 1K image-to-image cost is ~35-45 credits
const MIN_CREDITS_FOR_2K = 90;
const MIN_CREDITS_FOR_4K = 200;

// Adaptive polling: fast at the start (jobs often finish quickly),
// back off after the typical generation window
function nextPollInterval(elapsedMs: number): number {
  if (elapsedMs < 20_000) return 1500;  // first 20s: poll fast
  if (elapsedMs < 60_000) return 2500;  // next 40s: normal
  return 4000;                          // after 60s: relax
}

// Persistent cache: local /uploads/<file> + mtime → kie.ai public URL.
// Avoids re-uploading the same reference/logo for every slide in a batch.
import { readDataSafe, writeData } from "@/lib/data";
const UPLOAD_CACHE_FILE = "kie-upload-cache.json";
interface UploadCacheData {
  entries: Record<string, { url: string; mtime: number; uploadedAt: string }>;
}
async function getCachedUrl(key: string, mtime: number): Promise<string | null> {
  const data = await readDataSafe<UploadCacheData>(UPLOAD_CACHE_FILE, { entries: {} });
  const entry = data.entries[key];
  if (entry && entry.mtime === mtime) return entry.url;
  return null;
}
async function setCachedUrl(key: string, mtime: number, url: string): Promise<void> {
  const data = await readDataSafe<UploadCacheData>(UPLOAD_CACHE_FILE, { entries: {} });
  data.entries[key] = { url, mtime, uploadedAt: new Date().toISOString() };
  await writeData(UPLOAD_CACHE_FILE, data);
}

const VALID_RATIOS = new Set([
  "auto", "1:1", "3:2", "2:3", "4:3", "3:4", "5:4", "4:5",
  "16:9", "9:16", "2:1", "1:2", "3:1", "1:3", "21:9", "9:21",
]);

const MIME_BY_EXT: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
};

export async function resolveInputUrl(input: string, apiKey: string): Promise<string> {
  if (/^https?:\/\//i.test(input)) return input;

  const rel = input.replace(/^\//, "");
  if (!rel.startsWith("uploads/")) {
    throw new Error(`Input image must be an /uploads/ path or a URL: ${input}`);
  }
  const filePath = path.join(process.cwd(), "public", path.normalize(rel));
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`Unsupported image type: ${ext}`);

  // Check the persistent cache first — avoids re-uploading the same file.
  const stat = await fs.stat(filePath);
  const cached = await getCachedUrl(rel, stat.mtimeMs);
  if (cached) return cached;

  const buffer = await fs.readFile(filePath);
  const res = await fetch(KIE_FILE_UPLOAD, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      base64Data: `data:${mime};base64,${buffer.toString("base64")}`,
      uploadPath: "agent-design",
      fileName: path.basename(filePath),
    }),
  });
  const data = await res.json().catch(() => null);
  const url = data?.data?.downloadUrl;
  if (!res.ok || !url) {
    throw new Error(`Failed to upload input image: ${data?.msg || res.status}`);
  }
  await setCachedUrl(rel, stat.mtimeMs, url);
  return url;
}

export async function POST(request: NextRequest) {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "KIE_API_KEY not configured. Add it to .env.local" },
      { status: 503 }
    );
  }

  let body: {
    prompt?: string;
    aspectRatio?: string;
    resolution?: string;
    inputImages?: string[];
    carouselId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length > 20000) {
    return NextResponse.json({ error: "Invalid prompt" }, { status: 400 });
  }

  const aspectRatio =
    body.aspectRatio && VALID_RATIOS.has(body.aspectRatio)
      ? body.aspectRatio
      : "auto";
  // Credit optimization: default to 1K (Instagram only needs 1080px).
  // Caller must explicitly opt-in to 2K/4K when truly needed.
  const supportsHighRes = aspectRatio !== "auto" && aspectRatio !== "1:1";
  const resolution = !supportsHighRes
    ? "1K"
    : body.resolution && ["1K", "2K", "4K"].includes(body.resolution)
      ? body.resolution
      : "1K";

  const rawInputs = Array.isArray(body.inputImages)
    ? body.inputImages.filter((s) => typeof s === "string" && s.trim()).slice(0, MAX_INPUT_IMAGES)
    : [];

  let inputUrls: string[] = [];
  if (rawInputs.length > 0) {
    try {
      inputUrls = await Promise.all(
        rawInputs.map((img) => resolveInputUrl(img.trim(), apiKey))
      );
    } catch (err) {
      return NextResponse.json(
        { error: err instanceof Error ? err.message : "Failed to prepare input images" },
        { status: 400 }
      );
    }
  }

  const isImageToImage = inputUrls.length > 0;
  const model = isImageToImage
    ? "gpt-image-2-image-to-image"
    : "gpt-image-2-text-to-image";
  const input: Record<string, unknown> = {
    prompt,
    aspect_ratio: aspectRatio,
    resolution,
  };
  if (isImageToImage) input.input_urls = inputUrls;

  // 🛡️ SAFETY 1 — Pre-flight balance check.
  // Refuse to create the task if balance can't cover it. Prevents partial charges.
  const balanceBefore = await fetchKieBalance();
  const minRequired =
    resolution === "4K" ? MIN_CREDITS_FOR_4K :
    resolution === "2K" ? MIN_CREDITS_FOR_2K :
    MIN_CREDITS_FOR_1K;

  if (balanceBefore !== null && balanceBefore < minRequired) {
    return NextResponse.json(
      {
        error: `Insufficient credits: you have ${balanceBefore.toFixed(1)} credits, minimum ${minRequired} required for ${resolution} generation. Recharge at https://kie.ai before continuing.`,
        code: "INSUFFICIENT_CREDITS",
        balance: balanceBefore,
        required: minRequired,
      },
      { status: 402 }
    );
  }

  const createRes = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({ model, input }),
  });

  const createData = await createRes.json().catch(() => null);
  if (!createRes.ok || createData?.code !== 200 || !createData?.data?.taskId) {
    return NextResponse.json(
      { error: `Image task creation failed: ${createData?.msg || createRes.status}` },
      { status: 502 }
    );
  }

  const taskId: string = createData.data.taskId;
  const start = Date.now();
  const deadline = start + POLL_TIMEOUT_MS;
  let imageUrl: string | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, nextPollInterval(Date.now() - start)));

    const pollRes = await fetch(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } }
    );
    const pollData = await pollRes.json().catch(() => null);
    if (!pollData || pollData.code !== 200) continue;

    const state: string = pollData.data?.state || "";
    if (state === "fail") {
      return NextResponse.json(
        { error: `Image generation failed: ${pollData.data?.failMsg || "unknown error"}` },
        { status: 502 }
      );
    }
    if (state === "success") {
      try {
        const result = JSON.parse(pollData.data?.resultJson || "{}");
        imageUrl = result.resultUrls?.[0] || null;
      } catch {
        // fall through
      }
      break;
    }
  }

  // 🛡️ SAFETY 2 — On timeout or failure AFTER credits may have been charged,
  // log the taskId so the user can recover the image manually from kie.ai.
  const logFailedAttempt = async (reason: string) => {
    const balanceNow = await fetchKieBalance();
    const spent =
      balanceBefore !== null && balanceNow !== null
        ? Math.max(0, balanceBefore - balanceNow)
        : 0;
    if (spent > 0) {
      await logUsage({
        taskId,
        mode: isImageToImage ? "image-to-image" : "text-to-image",
        resolution,
        aspectRatio,
        creditsUsed: spent,
        carouselId: body.carouselId,
        createdAt: now(),
      });
    }
    return { taskId, reason, creditsCharged: spent, balanceAfter: balanceNow };
  };

  if (!imageUrl) {
    const failInfo = await logFailedAttempt("timeout");
    return NextResponse.json(
      {
        error: `Image generation timed out. Task ID: ${taskId}. If credits were charged, you can retry fetching the result from kie.ai directly with this taskId.`,
        code: "TIMEOUT",
        ...failInfo,
      },
      { status: 504 }
    );
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    const failInfo = await logFailedAttempt("download_failed");
    return NextResponse.json(
      {
        error: `Task succeeded but download failed. The image is at ${imageUrl}. Task ID: ${taskId}.`,
        code: "DOWNLOAD_FAILED",
        remoteUrl: imageUrl,
        ...failInfo,
      },
      { status: 502 }
    );
  }
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const filename = `${crypto.randomUUID()}.png`;
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });
  await fs.writeFile(path.join(uploadsDir, filename), buffer);

  // Snapshot balance AFTER and log the real credits used.
  const balanceAfter = await fetchKieBalance();
  const creditsUsed =
    balanceBefore !== null && balanceAfter !== null
      ? Math.max(0, balanceBefore - balanceAfter)
      : 0;

  if (creditsUsed > 0) {
    await logUsage({
      taskId,
      mode: isImageToImage ? "image-to-image" : "text-to-image",
      resolution,
      aspectRatio,
      creditsUsed,
      carouselId: body.carouselId,
      createdAt: now(),
    });
  }

  return NextResponse.json({
    path: `/uploads/${filename}`,
    taskId,
    mode: isImageToImage ? "image-to-image" : "text-to-image",
    creditsUsed,
    balanceAfter,
  });
}

import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { fetchKieBalance, logUsage } from "@/lib/credits";
import { now } from "@/lib/utils";
import { getBalance, recordTx } from "@/lib/credits-ledger";
import { SLIDE_COST } from "@/lib/db";
import { uploadToR2 } from "@/lib/r2";
import { readDataSafe, writeData } from "@/lib/data";

const OWNER_ID = "owner";
const KIE_BASE = "https://api.kie.ai";
const KIE_FILE_UPLOAD = "https://kieai.redpandaai.co/api/file-base64-upload";
const POLL_TIMEOUT_MS = 270_000;
const MAX_INPUT_IMAGES = 16;
const MIN_CREDITS_FOR_1K = 12;
const MIN_CREDITS_FOR_2K = 30;
const MIN_CREDITS_FOR_4K = 70;

const UPLOAD_CACHE_FILE = "kie-upload-cache.json";
interface UploadCacheData {
  entries: Record<string, { url: string; mtime: number; uploadedAt: string }>;
}

function nextPollInterval(elapsedMs: number): number {
  if (elapsedMs < 20_000) return 1500;
  if (elapsedMs < 60_000) return 2500;
  return 4000;
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

async function uploadBufferToKie(
  buffer: Buffer,
  mime: string,
  fileName: string,
  apiKey: string,
): Promise<string> {
  const res = await fetch(KIE_FILE_UPLOAD, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      base64Data: `data:${mime};base64,${buffer.toString("base64")}`,
      uploadPath: "agent-design",
      fileName,
    }),
  });
  const data = await res.json().catch(() => null);
  const url = data?.data?.downloadUrl;
  if (!res.ok || !url) {
    throw new Error(`Failed to upload input image: ${data?.msg || res.status}`);
  }
  return url;
}

function mimeFromExt(ext: string): string {
  return MIME_BY_EXT[ext.toLowerCase()] || "image/png";
}

// Whether kie.ai can fetch this URL directly. It can fetch its own storage; for
// everything else we re-host the image on kie so the reference is guaranteed to
// be pulled into the image-to-image job (parity with the old flow, where every
// reference was uploaded to kie via KIE_FILE_UPLOAD).
function isKieHostedUrl(u: string): boolean {
  try {
    const host = new URL(u).hostname.toLowerCase();
    return host.endsWith("kie.ai") || host.endsWith("redpandaai.co");
  } catch {
    return false;
  }
}

export async function resolveInputUrl(input: string, apiKey: string): Promise<string> {
  const localhostMatch = input.match(/^https?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0)(?::\d+)?(\/.+)$/i);
  if (localhostMatch) {
    input = localhostMatch[1];
  } else if (/^https?:\/\//i.test(input)) {
    // Already kie-hosted → hand it back directly.
    if (isKieHostedUrl(input)) return input;

    // External URL (e.g. R2). Cache by URL, then download + re-upload to kie
    // so the reference is served from kie's own storage — matches the old
    // /uploads/ flow and prevents kie from silently skipping references it
    // can't fetch cleanly.
    const cached = await getCachedUrl(input, 0);
    if (cached) return cached;

    const dl = await fetch(input);
    if (!dl.ok) {
      throw new Error(`Failed to download reference image (${dl.status}): ${input}`);
    }
    const buf = Buffer.from(await dl.arrayBuffer());
    const urlPath = (() => {
      try { return new URL(input).pathname; } catch { return input; }
    })();
    const ext = path.extname(urlPath).toLowerCase() || ".png";
    const mime = mimeFromExt(ext);
    const fileName = path.basename(urlPath) || `ref-${crypto.randomUUID()}${ext}`;
    const kieUrl = await uploadBufferToKie(buf, mime, fileName, apiKey);
    await setCachedUrl(input, 0, kieUrl);
    return kieUrl;
  }

  const rel = input.replace(/^\//, "");
  if (!rel.startsWith("uploads/")) {
    throw new Error(`Input image must be an /uploads/ path or a URL: ${input}`);
  }
  const filePath = path.join(process.cwd(), "public", path.normalize(rel));
  const ext = path.extname(filePath).toLowerCase();
  const mime = MIME_BY_EXT[ext];
  if (!mime) throw new Error(`Unsupported image type: ${ext}`);

  const stat = await fs.stat(filePath);
  const cached = await getCachedUrl(rel, stat.mtimeMs);
  if (cached) return cached;

  const buffer = await fs.readFile(filePath);
  const kieUrl = await uploadBufferToKie(buffer, mime, path.basename(filePath), apiKey);
  await setCachedUrl(rel, stat.mtimeMs, kieUrl);
  return kieUrl;
}

export interface GenerateImageInput {
  prompt: string;
  aspectRatio?: string;
  resolution?: string;
  inputImages?: string[];
  carouselId?: string;
}

export interface GenerateImageResult {
  ok: true;
  path: string;
  taskId: string;
  mode: "image-to-image" | "text-to-image";
  creditsUsed: number;
  balanceAfter: number | null;
  userCreditsCharged: number;
  userBalanceAfter: number;
}

export interface GenerateImageError {
  ok: false;
  status: number;
  error: string;
  code?: string;
  [k: string]: unknown;
}

export async function generateImage(
  body: GenerateImageInput,
): Promise<GenerateImageResult | GenerateImageError> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return { ok: false, status: 503, error: "KIE_API_KEY not configured. Add it to .env.local" };
  }

  const prompt = body.prompt?.trim();
  if (!prompt || prompt.length > 20000) {
    return { ok: false, status: 400, error: "Invalid prompt" };
  }

  const aspectRatio =
    body.aspectRatio && VALID_RATIOS.has(body.aspectRatio) ? body.aspectRatio : "auto";
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
      inputUrls = await Promise.all(rawInputs.map((img) => resolveInputUrl(img.trim(), apiKey)));
    } catch (err) {
      return {
        ok: false,
        status: 400,
        error: err instanceof Error ? err.message : "Failed to prepare input images",
      };
    }
  }

  const isImageToImage = inputUrls.length > 0;
  const model = isImageToImage ? "gpt-image-2-image-to-image" : "gpt-image-2-text-to-image";
  const input: Record<string, unknown> = { prompt, aspect_ratio: aspectRatio, resolution };
  if (isImageToImage) input.input_urls = inputUrls;

  const userId = OWNER_ID;
  const slideCost = SLIDE_COST[resolution as keyof typeof SLIDE_COST] ?? SLIDE_COST["1K"];
  await getBalance(userId); // maintained for parity

  const balanceBefore = await fetchKieBalance();
  const minRequired =
    resolution === "4K" ? MIN_CREDITS_FOR_4K :
    resolution === "2K" ? MIN_CREDITS_FOR_2K :
    MIN_CREDITS_FOR_1K;

  if (balanceBefore !== null && balanceBefore < minRequired) {
    return {
      ok: false,
      status: 503,
      error: "The platform is temporarily out of generation capacity. Please try again in a few minutes.",
      code: "SERVICE_UNAVAILABLE",
    };
  }

  const createRes = await fetch(`${KIE_BASE}/api/v1/jobs/createTask`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({ model, input }),
  });
  const createData = await createRes.json().catch(() => null);
  if (!createRes.ok || createData?.code !== 200 || !createData?.data?.taskId) {
    return {
      ok: false,
      status: 502,
      error: `Image task creation failed: ${createData?.msg || createRes.status}`,
    };
  }

  const taskId: string = createData.data.taskId;
  const start = Date.now();
  const deadline = start + POLL_TIMEOUT_MS;
  let imageUrl: string | null = null;

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, nextPollInterval(Date.now() - start)));
    const pollRes = await fetch(
      `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
      { headers: { Authorization: `Bearer ${apiKey}` } },
    );
    const pollData = await pollRes.json().catch(() => null);
    if (!pollData || pollData.code !== 200) continue;

    const state: string = pollData.data?.state || "";
    if (state === "fail") {
      return {
        ok: false,
        status: 502,
        error: `Image generation failed: ${pollData.data?.failMsg || "unknown error"}`,
      };
    }
    if (state === "success") {
      try {
        const result = JSON.parse(pollData.data?.resultJson || "{}");
        imageUrl = result.resultUrls?.[0] || null;
      } catch {}
      break;
    }
  }

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
    return {
      ok: false,
      status: 504,
      error: `Image generation timed out. Task ID: ${taskId}.`,
      code: "TIMEOUT",
      ...failInfo,
    };
  }

  const imgRes = await fetch(imageUrl);
  if (!imgRes.ok) {
    const failInfo = await logFailedAttempt("download_failed");
    return {
      ok: false,
      status: 502,
      error: `Task succeeded but download failed. Task ID: ${taskId}.`,
      code: "DOWNLOAD_FAILED",
      remoteUrl: imageUrl,
      ...failInfo,
    };
  }
  const buffer = Buffer.from(await imgRes.arrayBuffer());
  const filename = `${crypto.randomUUID()}.png`;
  const publicUrl = await uploadToR2(filename, buffer, "image/png");

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

  const userTx = await recordTx({
    userId,
    type: "USAGE",
    amount: -slideCost,
    reason: `Slide ${resolution} · ${isImageToImage ? "image-to-image" : "text-to-image"}`,
    taskId,
    carouselId: body.carouselId,
  });

  return {
    ok: true,
    path: publicUrl,
    taskId,
    mode: isImageToImage ? "image-to-image" : "text-to-image",
    creditsUsed,
    balanceAfter,
    userCreditsCharged: slideCost,
    userBalanceAfter: userTx.balanceAfter,
  };
}

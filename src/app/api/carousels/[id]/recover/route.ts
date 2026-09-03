import { NextResponse } from "next/server";
import fs from "fs/promises";
import path from "path";
import crypto from "crypto";
import { readDataSafe } from "@/lib/data";
import { addSlide, getCarousel } from "@/lib/carousels";

const KIE_BASE = "https://api.kie.ai";

interface CreditLogEntry {
  taskId: string;
  carouselId?: string;
  createdAt: string;
}
interface CreditsData {
  log: CreditLogEntry[];
}

/**
 * Recovers slides for a carousel whose taskIds were logged but the images
 * never landed (e.g. because the poll timed out client-side even though
 * kie.ai finished generating).
 *
 * POST /api/carousels/:id/recover
 * Body: { taskIds?: string[] }  // optional, defaults to all tasks logged for this carousel
 * Response: { recovered: [{ taskId, slideId, path }], pending: [taskId], failed: [{taskId, reason}] }
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: carouselId } = await params;
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "KIE_API_KEY not configured" }, { status: 503 });
  }

  const carousel = await getCarousel(carouselId);
  if (!carousel) {
    return NextResponse.json({ error: "Carousel not found" }, { status: 404 });
  }

  let requestedIds: string[] | undefined;
  try {
    const body = await request.json().catch(() => ({}));
    if (Array.isArray(body.taskIds)) requestedIds = body.taskIds;
  } catch {}

  // If no taskIds passed, pull all tasks ever logged for this carousel
  let taskIds: string[] = requestedIds ?? [];
  if (taskIds.length === 0) {
    const credits = await readDataSafe<CreditsData>("credits.json", { log: [] });
    taskIds = credits.log
      .filter((e) => e.carouselId === carouselId)
      .map((e) => e.taskId);
  }

  // Skip tasks whose image is already saved as a slide (by matching the path fragment)
  const existingPaths = new Set(
    carousel.slides
      .map((s) => {
        const m = s.html.match(/\/uploads\/([a-f0-9-]+\.png)/);
        return m ? m[1] : "";
      })
      .filter(Boolean)
  );

  const recovered: { taskId: string; slideId: string; path: string }[] = [];
  const pending: string[] = [];
  const failed: { taskId: string; reason: string }[] = [];
  const uploadsDir = path.join(process.cwd(), "public", "uploads");
  await fs.mkdir(uploadsDir, { recursive: true });

  for (const taskId of taskIds) {
    try {
      const res = await fetch(
        `${KIE_BASE}/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`,
        { headers: { Authorization: `Bearer ${apiKey}` } }
      );
      const data = await res.json().catch(() => null);
      const state: string = data?.data?.state ?? "?";

      if (state === "generating" || state === "waiting") {
        pending.push(taskId);
        continue;
      }
      if (state !== "success") {
        failed.push({ taskId, reason: state });
        continue;
      }

      const result = JSON.parse(data.data.resultJson || "{}");
      const url: string | undefined = result.resultUrls?.[0];
      if (!url) {
        failed.push({ taskId, reason: "no_result_url" });
        continue;
      }

      const imgRes = await fetch(url);
      if (!imgRes.ok) {
        failed.push({ taskId, reason: `download ${imgRes.status}` });
        continue;
      }
      const buf = Buffer.from(await imgRes.arrayBuffer());
      const filename = `${crypto.randomUUID()}.png`;
      await fs.writeFile(path.join(uploadsDir, filename), buf);

      // Skip if a slide with a similar image already exists (best-effort by content length)
      // Simpler: always add — user can delete duplicates.
      if (existingPaths.has(filename)) continue;

      const html = `<img src="/uploads/${filename}" style="width:100%;height:100%;object-fit:cover;display:block;" />`;
      const slide = await addSlide(carouselId, html, `Recovered from task ${taskId.slice(0, 8)}`);
      if (slide) {
        recovered.push({ taskId, slideId: slide.id, path: `/uploads/${filename}` });
      } else {
        failed.push({ taskId, reason: "addSlide_failed" });
      }
    } catch (err) {
      failed.push({ taskId, reason: err instanceof Error ? err.message : String(err) });
    }
  }

  return NextResponse.json({
    carouselId,
    scanned: taskIds.length,
    recovered,
    pending,
    failed,
  });
}

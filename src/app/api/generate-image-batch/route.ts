import { NextRequest, NextResponse } from "next/server";
import { fetchKieBalance } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Estimated credit cost per slide (rough, based on observed kie.ai charges)
const ESTIMATED_COST = {
  "1K": 45,
  "2K": 95,
  "4K": 210,
} as const;

interface BatchSlide {
  slideId?: string;
  prompt: string;
  inputImages?: string[];
  aspectRatio?: string;
  resolution?: string;
  carouselId?: string;
}

/**
 * Fires N slide generations in parallel by calling the single /api/generate-image
 * endpoint concurrently. Total wall time ≈ max(each generation) instead of sum.
 *
 * Request: { slides: BatchSlide[] }
 * Response: { results: [{ slideId?, ok, path?, taskId?, error?, creditsUsed?, balanceAfter? }] }
 */
export async function POST(request: NextRequest) {
  let body: { slides?: BatchSlide[] };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const slides = Array.isArray(body.slides) ? body.slides : [];
  if (slides.length === 0) {
    return NextResponse.json({ error: "No slides provided" }, { status: 400 });
  }
  if (slides.length > 10) {
    return NextResponse.json({ error: "Max 10 slides per batch" }, { status: 400 });
  }

  // 🛡️ Pre-flight balance check for the ENTIRE batch
  // Refuse to start if there's not enough for all N slides. Prevents partial carousels.
  const balance = await fetchKieBalance();
  if (balance !== null) {
    const totalEstimated = slides.reduce((sum, s) => {
      const res = (s.resolution || "1K") as keyof typeof ESTIMATED_COST;
      return sum + (ESTIMATED_COST[res] ?? ESTIMATED_COST["1K"]);
    }, 0);

    if (balance < totalEstimated) {
      return NextResponse.json(
        {
          error: `Not enough credits for ${slides.length} slides: balance ${balance.toFixed(1)}, estimated need ${totalEstimated}. Recharge at https://kie.ai first.`,
          code: "INSUFFICIENT_CREDITS",
          balance,
          estimatedCost: totalEstimated,
          slides: slides.length,
        },
        { status: 402 }
      );
    }
  }

  const origin = request.nextUrl.origin;

  const results = await Promise.all(
    slides.map(async (slide) => {
      try {
        const res = await fetch(`${origin}/api/generate-image`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            prompt: slide.prompt,
            inputImages: slide.inputImages,
            aspectRatio: slide.aspectRatio,
            resolution: slide.resolution,
            carouselId: slide.carouselId,
          }),
        });
        const data = await res.json().catch(() => null);
        if (!res.ok || !data?.path) {
          return {
            slideId: slide.slideId,
            ok: false,
            error: data?.error || `HTTP ${res.status}`,
          };
        }
        return {
          slideId: slide.slideId,
          ok: true,
          path: data.path,
          taskId: data.taskId,
          creditsUsed: data.creditsUsed,
          balanceAfter: data.balanceAfter,
          mode: data.mode,
        };
      } catch (err) {
        return {
          slideId: slide.slideId,
          ok: false,
          error: err instanceof Error ? err.message : "Unknown error",
        };
      }
    })
  );

  return NextResponse.json({ results });
}

import { NextRequest, NextResponse } from "next/server";
import { fetchKieBalance } from "@/lib/credits";
import { auth } from "@/auth";
import { getBalance } from "@/lib/credits-ledger";
import { SLIDE_COST } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Kie.ai internal cost per slide (admin-facing, for capacity checks)
const ESTIMATED_KIE_COST = {
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

  // 🛡️ USER-level pre-flight: does the logged-in user have enough internal credits?
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const userId = session.user.id;
  const totalUserCost = slides.reduce((sum, s) => {
    const res = (s.resolution || "1K") as keyof typeof SLIDE_COST;
    return sum + (SLIDE_COST[res] ?? SLIDE_COST["1K"]);
  }, 0);
  const userBalance = await getBalance(userId);
  if (userBalance < totalUserCost) {
    return NextResponse.json(
      {
        error: `Créditos insuficientes: tienes ${userBalance}, este carrusel de ${slides.length} slides cuesta ${totalUserCost} créditos.`,
        code: "INSUFFICIENT_CREDITS",
        balance: userBalance,
        required: totalUserCost,
      },
      { status: 402 }
    );
  }

  // 🛡️ MASTER-level pre-flight on kie.ai capacity
  const balance = await fetchKieBalance();
  if (balance !== null) {
    const totalEstimated = slides.reduce((sum, s) => {
      const res = (s.resolution || "1K") as keyof typeof ESTIMATED_KIE_COST;
      return sum + (ESTIMATED_KIE_COST[res] ?? ESTIMATED_KIE_COST["1K"]);
    }, 0);

    if (balance < totalEstimated) {
      return NextResponse.json(
        {
          error: `La plataforma está temporalmente sin capacidad. Reintenta en unos minutos.`,
          code: "SERVICE_UNAVAILABLE",
        },
        { status: 503 }
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

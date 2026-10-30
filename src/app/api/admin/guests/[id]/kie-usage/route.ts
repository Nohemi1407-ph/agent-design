import { NextRequest, NextResponse } from "next/server";
import { readFile } from "fs/promises";
import path from "path";
import { currentUserId } from "@/lib/user-context";
import { getGuest, isValidGuestId } from "@/lib/guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if ((await currentUserId()) !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isValidGuestId(id)) {
    return NextResponse.json({ error: "Invalid guest id" }, { status: 400 });
  }
  const g = await getGuest(id);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const DATA_DIR = path.resolve(process.cwd(), "data");
  const file = path.join(DATA_DIR, `${id}_credits.json`);
  try {
    const raw = await readFile(file, "utf-8");
    const data = JSON.parse(raw) as {
      log?: Array<{
        taskId: string;
        mode: string;
        resolution: string;
        aspectRatio: string;
        creditsUsed: number;
        carouselId?: string;
        createdAt: string;
      }>;
    };
    const log = data.log || [];
    const total = log.reduce((s, e) => s + e.creditsUsed, 0);
    return NextResponse.json({
      guestName: g.name,
      totalCreditsUsed: total,
      count: log.length,
      avgPerImage: log.length > 0 ? total / log.length : 0,
      recent: log.slice(-30).reverse(),
    });
  } catch {
    return NextResponse.json({
      guestName: g.name,
      totalCreditsUsed: 0,
      count: 0,
      note: "Sin historial — archivo no existe",
    });
  }
}

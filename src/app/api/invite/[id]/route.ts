import { NextRequest, NextResponse } from "next/server";
import { getGuest, isValidGuestId } from "@/lib/guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isValidGuestId(id)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  const g = await getGuest(id);
  if (!g || g.archivedAt) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  return NextResponse.json({ ok: true, name: g.name });
}

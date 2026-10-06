import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { isValidGuestId, regeneratePin } from "@/lib/guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
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
  const result = await regeneratePin(id);
  if (!result) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true, plaintextPin: result.plaintextPin });
}

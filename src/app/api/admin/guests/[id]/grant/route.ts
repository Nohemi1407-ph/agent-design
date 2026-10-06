import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { recordTx } from "@/lib/credits-ledger";
import { getGuest, isValidGuestId } from "@/lib/guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
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

  let body: { amount?: number; reason?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const amount = Number(body.amount);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000) {
    return NextResponse.json({ error: "Invalid amount" }, { status: 400 });
  }

  const result = await recordTx({
    userId: id,
    type: "GRANT",
    amount: Math.floor(amount),
    reason: body.reason || "Owner top-up",
  });

  return NextResponse.json({ ok: true, ...result });
}

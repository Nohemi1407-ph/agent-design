import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { recordTx } from "@/lib/credits-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  if (userId !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

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
    userId: "guest",
    type: "GRANT",
    amount: Math.floor(amount),
    reason: body.reason || "Owner top-up",
  });

  return NextResponse.json({ ok: true, ...result });
}

import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { recordTx } from "@/lib/credits-ledger";
import { getGuest, isValidGuestId, listGuests } from "@/lib/guests";
import { fetchKieBalance } from "@/lib/credits";
import { db } from "@/lib/db";

function getGuestCap(): number {
  const raw = process.env.GUEST_CREDIT_CAP;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 500;
}

async function guestBalance(id: string): Promise<number> {
  const [usage, grants] = await Promise.all([
    db.creditTx.aggregate({ where: { userId: id, type: "USAGE" }, _sum: { amount: true } }),
    db.creditTx.aggregate({ where: { userId: id, type: "GRANT" }, _sum: { amount: true } }),
  ]);
  const cap = getGuestCap() + (grants._sum.amount ?? 0);
  return Math.max(0, cap - Math.abs(usage._sum.amount ?? 0));
}

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

  // Enforce: owner can only grant what's available from their kie.ai pool.
  // available = kie.ai balance - sum of all active guest balances.
  const kieBalance = await fetchKieBalance();
  if (kieBalance == null) {
    return NextResponse.json(
      { error: "Cannot read kie.ai balance right now, try again" },
      { status: 503 },
    );
  }
  const actives = await listGuests({ includeArchived: false });
  const reserved = (
    await Promise.all(actives.map((g) => guestBalance(g.id)))
  ).reduce((a, b) => a + b, 0);
  const available = Math.max(0, kieBalance - reserved);
  if (amount > available) {
    return NextResponse.json(
      {
        error: `Not enough credits available. You can allocate up to ${Math.floor(available)} right now (kie.ai: ${Math.floor(kieBalance)}, already reserved for guests: ${Math.floor(reserved)}).`,
      },
      { status: 400 },
    );
  }

  const result = await recordTx({
    userId: id,
    type: "GRANT",
    amount: Math.floor(amount),
    reason: body.reason || "Owner top-up",
  });

  return NextResponse.json({ ok: true, ...result });
}

import { NextResponse } from "next/server";
import { getBalance } from "@/lib/credits-ledger";
import { currentUserId } from "@/lib/user-context";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getGuestCap(): number {
  const raw = process.env.GUEST_CREDIT_CAP;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 500;
}

export async function GET() {
  const userId = await currentUserId();
  const isAdmin = userId === "owner";

  let balance = 0;
  let cap: number | null = null;

  if (userId === "guest") {
    const [usageAgg, grantAgg] = await Promise.all([
      db.creditTx
        .aggregate({ where: { userId, type: "USAGE" }, _sum: { amount: true } })
        .catch(() => ({ _sum: { amount: 0 } })),
      db.creditTx
        .aggregate({ where: { userId, type: "GRANT" }, _sum: { amount: true } })
        .catch(() => ({ _sum: { amount: 0 } })),
    ]);
    const used = Math.abs(usageAgg._sum.amount ?? 0);
    cap = getGuestCap() + (grantAgg._sum.amount ?? 0);
    balance = Math.max(0, cap - used);
  } else {
    balance = await getBalance(userId).catch(() => 0);
  }

  return NextResponse.json({
    id: userId,
    userId,
    role: isAdmin ? "ADMIN" : "GUEST",
    isAdmin,
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    balance,
    cap,
  });
}

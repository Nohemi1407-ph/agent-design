import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { getBalance } from "@/lib/credits-ledger";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Returns the current user's internal credit balance and recent usage.
 * Multi-tenant: each user only sees their own credits.
 */
export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ balance: 0, enabled: false, today: 0, total: 0, recent: [] });
  }

  const userId = session.user.id;
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  const [balance, todayAgg, totalUsageAgg, recent] = await Promise.all([
    getBalance(userId),
    db.creditTx.aggregate({
      where: { userId, type: "USAGE", createdAt: { gte: startOfToday } },
      _sum: { amount: true },
    }),
    db.creditTx.aggregate({
      where: { userId, type: "USAGE" },
      _sum: { amount: true },
    }),
    db.creditTx.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
  ]);

  return NextResponse.json({
    balance,
    enabled: true,
    // usage values are stored negative in the ledger — invert for display
    today: Math.abs(todayAgg._sum.amount ?? 0),
    total: Math.abs(totalUsageAgg._sum.amount ?? 0),
    recent,
  });
}

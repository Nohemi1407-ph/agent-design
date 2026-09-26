import { NextResponse } from "next/server";
import { getBalance } from "@/lib/credits-ledger";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = "owner";
  try {
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
      today: Math.abs(todayAgg._sum.amount ?? 0),
      total: Math.abs(totalUsageAgg._sum.amount ?? 0),
      recent,
    });
  } catch (err) {
    console.error("[credits] error", err);
    return NextResponse.json({ balance: 0, enabled: false, today: 0, total: 0, recent: [] });
  }
}

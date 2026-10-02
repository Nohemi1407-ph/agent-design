import { NextResponse } from "next/server";
import { fetchKieBalance } from "@/lib/credits";
import { db } from "@/lib/db";
import { currentUserId } from "@/lib/user-context";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const userId = await currentUserId();
  try {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);

    const isGuest = userId === "guest";
    const [balance, todayAgg, totalUsageAgg, recent] = await Promise.all([
      isGuest ? Promise.resolve(null) : fetchKieBalance(),
      db.creditTx.aggregate({
        where: { userId, type: "USAGE", createdAt: { gte: startOfToday } },
        _sum: { amount: true },
      }),
      db.creditTx.aggregate({
        where: { userId, type: "USAGE" },
        _sum: { amount: true },
      }),
      db.creditTx.findMany({
        where: { userId, type: "USAGE" },
        orderBy: { createdAt: "desc" },
        take: 20,
      }),
    ]);

    let effectiveBalance = balance ?? 0;
    let enabled = balance !== null;
    if (isGuest) {
      const raw = process.env.GUEST_CREDIT_CAP;
      const parsed = raw ? parseInt(raw, 10) : NaN;
      const baseCap = Number.isFinite(parsed) && parsed > 0 ? parsed : 500;
      const grantAgg = await db.creditTx
        .aggregate({ where: { userId, type: "GRANT" }, _sum: { amount: true } })
        .catch(() => ({ _sum: { amount: 0 } }));
      const cap = baseCap + (grantAgg._sum.amount ?? 0);
      const used = Math.abs(totalUsageAgg._sum.amount ?? 0);
      effectiveBalance = Math.max(0, cap - used);
      enabled = true;
    }

    return NextResponse.json({
      balance: effectiveBalance,
      enabled,
      today: Math.abs(todayAgg._sum.amount ?? 0),
      total: Math.abs(totalUsageAgg._sum.amount ?? 0),
      recent,
    });
  } catch (err) {
    console.error("[credits] error", err);
    return NextResponse.json({ balance: 0, enabled: false, today: 0, total: 0, recent: [] });
  }
}

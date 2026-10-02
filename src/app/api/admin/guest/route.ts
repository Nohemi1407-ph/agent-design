import { NextResponse } from "next/server";
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
  if (userId !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const [usageAgg, grantAgg, recent] = await Promise.all([
    db.creditTx.aggregate({ where: { userId: "guest", type: "USAGE" }, _sum: { amount: true } }),
    db.creditTx.aggregate({ where: { userId: "guest", type: "GRANT" }, _sum: { amount: true } }),
    db.creditTx.findMany({ where: { userId: "guest" }, orderBy: { createdAt: "desc" }, take: 20 }),
  ]);

  const used = Math.abs(usageAgg._sum.amount ?? 0);
  const cap = getGuestCap() + (grantAgg._sum.amount ?? 0);
  const balance = Math.max(0, cap - used);

  return NextResponse.json({ used, cap, balance, recent });
}

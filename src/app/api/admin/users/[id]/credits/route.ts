import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { recordTx } from "@/lib/credits-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/admin/users/[id]/credits
 * Body: { amount: number, reason?: string, type?: "GRANT" | "ADJUSTMENT" }
 * Admin-only. Positive amount = give credits; negative = remove.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  if (!session?.user?.id) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  if (session.user.role !== "ADMIN") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { id: userId } = await params;
  const body = await request.json().catch(() => null);
  const amount = Number(body?.amount);
  if (!Number.isFinite(amount) || amount === 0) {
    return NextResponse.json({ error: "amount must be a non-zero number" }, { status: 400 });
  }

  const type = body?.type === "ADJUSTMENT" ? "ADJUSTMENT" : "GRANT";
  const reason = typeof body?.reason === "string" ? body.reason.slice(0, 500) : "";

  const result = await recordTx({
    userId,
    type,
    amount: Math.trunc(amount),
    reason: reason || `${type.toLowerCase()} by admin ${session.user.email}`,
  });

  return NextResponse.json({ ok: true, ...result });
}

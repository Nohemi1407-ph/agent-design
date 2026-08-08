import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) return { error: "Unauthorized" as const, status: 401 };
  if (session.user.role !== "ADMIN") return { error: "Forbidden" as const, status: 403 };
  return { session };
}

export async function GET() {
  const check = await requireAdmin();
  if ("error" in check) return NextResponse.json({ error: check.error }, { status: check.status });

  const users = await db.user.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      createdAt: true,
      _count: { select: { carousels: true } },
      creditTxs: {
        select: { amount: true },
      },
    },
    take: 200,
  });

  const withBalance = users.map((u) => {
    const balance = u.creditTxs.reduce((s, t) => s + t.amount, 0);
    return {
      id: u.id,
      email: u.email,
      name: u.name,
      role: u.role,
      createdAt: u.createdAt,
      carouselCount: u._count.carousels,
      balance,
    };
  });

  return NextResponse.json({ users: withBalance });
}

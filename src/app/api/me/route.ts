import { NextResponse } from "next/server";
import { auth } from "@/auth";
import { db } from "@/lib/db";
import { getBalance } from "@/lib/credits-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const [user, balance] = await Promise.all([
    db.user.findUnique({
      where: { id: session.user.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        anthropicKey: true,
        createdAt: true,
      },
    }),
    getBalance(session.user.id),
  ]);

  return NextResponse.json({
    ...user,
    hasAnthropicKey: !!user?.anthropicKey,
    anthropicKey: undefined, // never expose the raw key
    balance,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session?.user?.id) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const body = await request.json().catch(() => null);
  const updates: { name?: string; anthropicKey?: string } = {};

  if (typeof body?.name === "string") updates.name = body.name.trim().slice(0, 120);
  if (typeof body?.anthropicKey === "string") {
    // Store as-is for now. In production this should be encrypted at rest.
    const key = body.anthropicKey.trim();
    if (key && !key.startsWith("sk-ant-")) {
      return NextResponse.json(
        { error: "Anthropic API key must start with sk-ant-" },
        { status: 400 }
      );
    }
    updates.anthropicKey = key || null as unknown as string;
  }

  await db.user.update({
    where: { id: session.user.id },
    data: updates,
  });

  return NextResponse.json({ ok: true });
}

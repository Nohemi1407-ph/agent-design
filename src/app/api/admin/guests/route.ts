import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { db } from "@/lib/db";
import { createGuest, listGuests, type Guest } from "@/lib/guests";
import { getTokenSummary } from "@/lib/anthropic-usage";
import { fetchKieBalance } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function getGuestCap(): number {
  const raw = process.env.GUEST_CREDIT_CAP;
  const n = raw ? parseInt(raw, 10) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 500;
}

async function requireOwner() {
  const uid = await currentUserId();
  return uid === "owner";
}

async function summarizeGuest(g: Guest) {
  const [usageAgg, grantAgg, recent, tokens] = await Promise.all([
    db.creditTx.aggregate({
      where: { userId: g.id, type: "USAGE" },
      _sum: { amount: true },
    }),
    db.creditTx.aggregate({
      where: { userId: g.id, type: "GRANT" },
      _sum: { amount: true },
    }),
    db.creditTx.findMany({
      where: { userId: g.id },
      orderBy: { createdAt: "desc" },
      take: 10,
    }),
    getTokenSummary(g.id),
  ]);
  const used = Math.abs(usageAgg._sum.amount ?? 0);
  const cap = getGuestCap() + (grantAgg._sum.amount ?? 0);
  const balance = Math.max(0, cap - used);
  return {
    id: g.id,
    name: g.name,
    createdAt: g.createdAt,
    archivedAt: g.archivedAt ?? null,
    used,
    cap,
    balance,
    recent,
    tokens,
  };
}

export async function GET(request: NextRequest) {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const includeArchived = request.nextUrl.searchParams.get("includeArchived") === "1";
  const guests = await listGuests({ includeArchived });
  const summaries = await Promise.all(guests.map(summarizeGuest));
  const ownerTokens = await getTokenSummary("owner");

  // Owner's "available to allocate" = kie.ai balance - credits already
  // committed to active (non-archived) guests. Each guest's current
  // balance (cap - used) is a reserved slice of the owner's pool.
  const activeGuests = await listGuests({ includeArchived: false });
  const activeSummaries = await Promise.all(activeGuests.map(summarizeGuest));
  const reserved = activeSummaries.reduce((sum, g) => sum + g.balance, 0);
  const kieBalance = await fetchKieBalance();
  const ownerPool = {
    kieBalance,
    reserved,
    available: kieBalance != null ? Math.max(0, kieBalance - reserved) : null,
  };

  return NextResponse.json({ guests: summaries, ownerTokens, ownerPool });
}

export async function POST(request: NextRequest) {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  let body: { name?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name || "").trim();
  if (!name) return NextResponse.json({ error: "Name required" }, { status: 400 });
  const password = typeof body.password === "string" ? body.password.trim() : "";
  try {
    const { guest, plaintextPin } = await createGuest({
      name,
      password: password || undefined,
    });
    return NextResponse.json({ ok: true, guest, plaintextPin });
  } catch (err) {
    return NextResponse.json(
      { error: (err as Error).message || "Failed to create guest" },
      { status: 400 },
    );
  }
}

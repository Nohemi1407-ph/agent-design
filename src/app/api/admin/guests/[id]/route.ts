import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { getGuest, isValidGuestId, renameGuest } from "@/lib/guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function requireOwner() {
  const uid = await currentUserId();
  return uid === "owner";
}

export async function PATCH(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isValidGuestId(id)) {
    return NextResponse.json({ error: "Invalid guest id" }, { status: 400 });
  }
  let body: { name?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  if (typeof body.name !== "string" || !body.name.trim()) {
    return NextResponse.json({ error: "Invalid name" }, { status: 400 });
  }
  try {
    const g = await renameGuest(id, body.name);
    if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
    return NextResponse.json({ ok: true, guest: g });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
}

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if (!(await requireOwner())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isValidGuestId(id)) {
    return NextResponse.json({ error: "Invalid guest id" }, { status: 400 });
  }
  const g = await getGuest(id);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ guest: g });
}

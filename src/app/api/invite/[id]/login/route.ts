import { NextRequest, NextResponse } from "next/server";
import { authenticateGuestWithPin, isValidGuestId } from "@/lib/guests";
import { createSessionCookie, SESSION_COOKIE } from "@/lib/session";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  const { id } = await ctx.params;
  if (!isValidGuestId(id)) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  let body: { pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const pin = (body.pin || "").toString().trim();
  const guest = await authenticateGuestWithPin(id, pin);
  if (!guest) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const value = await createSessionCookie(guest.id);
  const res = NextResponse.json({ ok: true });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

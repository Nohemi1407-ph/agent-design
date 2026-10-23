import { NextRequest, NextResponse } from "next/server";
import { authenticateGuestWithPin, isValidGuestId } from "@/lib/guests";
import { createSessionCookie, SESSION_COOKIE } from "@/lib/session";
import { hasGuestKieKey, hasGuestAnthropicKey } from "@/lib/guest-secrets";

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
    // Distinguish pending-approval vs invalid pin for better UX
    const { getGuest } = await import("@/lib/guests");
    const g = await getGuest(id).catch(() => null);
    if (g?.status === "pending") {
      return NextResponse.json(
        { ok: false, error: "Esperando aprobación" },
        { status: 403 },
      );
    }
    return NextResponse.json({ ok: false }, { status: 401 });
  }
  const [hasKie, hasAnthropic] = await Promise.all([
    hasGuestKieKey(guest.id).catch(() => false),
    hasGuestAnthropicKey(guest.id).catch(() => false),
  ]);
  const value = await createSessionCookie(guest.id);
  const res = NextResponse.json({
    ok: true,
    redirect: hasKie && hasAnthropic ? "/" : "/connect",
  });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

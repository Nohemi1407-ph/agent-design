import { NextRequest, NextResponse } from "next/server";
import { getGuest, isValidGuestId, setGuestPin } from "@/lib/guests";
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

  const g = await getGuest(id);
  if (!g || g.archivedAt) {
    return NextResponse.json({ ok: false }, { status: 404 });
  }
  // Only allow self-setup when admin has cleared the PIN.
  if (g.pin) {
    return NextResponse.json(
      { ok: false, error: "Este invitado ya tiene un PIN. Pídele al admin que lo resetee." },
      { status: 400 },
    );
  }
  if (g.status === "pending") {
    return NextResponse.json({ ok: false, error: "Esperando aprobación" }, { status: 403 });
  }

  let body: { pin?: string; confirm?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }
  const pin = (body.pin || "").toString().trim();
  const confirm = (body.confirm || "").toString().trim();
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json(
      { ok: false, error: "El PIN debe ser 6 dígitos" },
      { status: 400 },
    );
  }
  if (pin !== confirm) {
    return NextResponse.json(
      { ok: false, error: "Los PINs no coinciden" },
      { status: 400 },
    );
  }

  const updated = await setGuestPin(id, pin);
  if (!updated) {
    return NextResponse.json({ ok: false }, { status: 500 });
  }

  // Log them in automatically after a successful setup.
  const [hasKie, hasAnthropic] = await Promise.all([
    hasGuestKieKey(id).catch(() => false),
    hasGuestAnthropicKey(id).catch(() => false),
  ]);
  const redirect = hasKie && hasAnthropic ? "/" : "/connect";

  const value = await createSessionCookie(id);
  const res = NextResponse.json({ ok: true, redirect });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  });
  return res;
}

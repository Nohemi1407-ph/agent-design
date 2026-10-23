import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie, SESSION_COOKIE } from "@/lib/session";
import { authenticateGuest } from "@/lib/guests";
import { hasGuestKieKey, hasGuestAnthropicKey } from "@/lib/guest-secrets";

const DEFAULT_ADMIN_USERNAME = "Nohemi1407";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { username?: string; password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const username = (body.username || "").toString().trim();
  const password = (body.password || "").toString();
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const adminPw = process.env.ADMIN_PASSWORD;
  const adminUser = process.env.ADMIN_USERNAME || DEFAULT_ADMIN_USERNAME;

  let userId: string | null = null;
  if (adminPw && username === adminUser && password === adminPw) {
    userId = "owner";
  } else {
    const guest = await authenticateGuest(password);
    if (guest) userId = guest.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Invalid credentials" }, { status: 401 });
  }

  let redirect = "/";
  if (userId !== "owner") {
    const [hasKie, hasAnthropic] = await Promise.all([
      hasGuestKieKey(userId).catch(() => false),
      hasGuestAnthropicKey(userId).catch(() => false),
    ]);
    if (!hasKie || !hasAnthropic) redirect = "/connect";
  }

  const value = await createSessionCookie(userId);
  const res = NextResponse.json({ ok: true, userId, redirect });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

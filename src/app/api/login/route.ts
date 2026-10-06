import { NextRequest, NextResponse } from "next/server";
import { createSessionCookie, SESSION_COOKIE } from "@/lib/session";
import { authenticateGuest } from "@/lib/guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  let body: { password?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  }

  const password = (body.password || "").toString();
  if (!password) {
    return NextResponse.json({ error: "Password required" }, { status: 400 });
  }

  const adminPw = process.env.ADMIN_PASSWORD;

  let userId: string | null = null;
  if (adminPw && password === adminPw) {
    userId = "owner";
  } else {
    const guest = await authenticateGuest(password);
    if (guest) userId = guest.id;
  }

  if (!userId) {
    return NextResponse.json({ error: "Invalid password" }, { status: 401 });
  }

  const value = await createSessionCookie(userId);
  const res = NextResponse.json({ ok: true, userId });
  res.cookies.set(SESSION_COOKIE, value, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 30, // 30 days
  });
  return res;
}

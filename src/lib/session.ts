import type { NextRequest } from "next/server";
import type { UserId } from "./user-context";

export const SESSION_COOKIE = "session";

/** Allowed userId shapes in a session cookie. Keep in sync with guests.ts GUEST_ID_RE. */
const SESSION_USER_ID_RE = /^(owner|guest|g_[A-Za-z0-9]{8,16})$/;

function getSecret(): string {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return s;
}

function toHex(buf: ArrayBuffer): string {
  const bytes = new Uint8Array(buf);
  let out = "";
  for (let i = 0; i < bytes.length; i++) {
    out += bytes[i].toString(16).padStart(2, "0");
  }
  return out;
}

/** HMAC-SHA256 via Web Crypto (works on both Edge middleware and Node runtime). */
async function sign(payload: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(getSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(payload));
  return toHex(sig);
}

export async function createSessionCookie(userId: UserId): Promise<string> {
  const sig = await sign(userId);
  return `${userId}.${sig}`;
}

export async function verifySessionValue(raw: string | undefined | null): Promise<UserId | null> {
  if (!raw) return null;
  const dot = raw.lastIndexOf(".");
  if (dot < 1) return null;
  const userId = raw.slice(0, dot);
  const sig = raw.slice(dot + 1);
  if (!SESSION_USER_ID_RE.test(userId)) return null;
  const expected = await sign(userId);
  // constant-time comparison
  if (expected.length !== sig.length) return null;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) {
    diff |= expected.charCodeAt(i) ^ sig.charCodeAt(i);
  }
  if (diff !== 0) return null;
  return userId;
}

/** For Node runtime API routes. */
export async function getSessionFromRequest(req: Request): Promise<{ userId: UserId } | null> {
  const cookie = req.headers.get("cookie") || "";
  const match = cookie.split(/;\s*/).find((c) => c.startsWith(`${SESSION_COOKIE}=`));
  if (!match) return null;
  const raw = decodeURIComponent(match.slice(SESSION_COOKIE.length + 1));
  const uid = await verifySessionValue(raw);
  return uid ? { userId: uid } : null;
}

/** For Edge middleware. */
export async function getSessionFromNextRequest(
  req: NextRequest,
): Promise<{ userId: UserId } | null> {
  const raw = req.cookies.get(SESSION_COOKIE)?.value;
  const uid = await verifySessionValue(raw);
  return uid ? { userId: uid } : null;
}

export function isAdmin(userId: UserId): boolean {
  return userId === "owner";
}

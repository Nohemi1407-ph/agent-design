import { headers } from "next/headers";
import { AsyncLocalStorage } from "async_hooks";

export type UserId = "owner" | "guest";

interface Ctx {
  userId: UserId;
}

/** Fallback ALS when a route explicitly wraps work with runAsUser (e.g. non-request code paths). */
const storage = new AsyncLocalStorage<Ctx>();

export function runAsUser<T>(userId: UserId, fn: () => Promise<T> | T): Promise<T> | T {
  return storage.run({ userId }, fn);
}

/**
 * Resolve the current user id.
 *   1) ALS (if a caller wrapped execution)
 *   2) x-user-id request header forwarded by middleware
 *   3) "owner" as legacy default
 */
export async function currentUserId(): Promise<UserId> {
  const als = storage.getStore()?.userId;
  if (als) return als;
  try {
    const h = await headers();
    const u = h.get("x-user-id");
    if (u === "owner" || u === "guest") return u;
  } catch {
    // headers() not available (build time, non-request); fall through
  }
  return "owner";
}

/** Scope a filename to the current user. Owner uses the legacy (unprefixed) filename. */
export async function scopedFilename(filename: string): Promise<string> {
  const uid = await currentUserId();
  return uid === "owner" ? filename : `${uid}_${filename}`;
}

import { NextResponse } from "next/server";
import { getSessionFromRequest } from "./session";
import { runAsUser, type UserId } from "./user-context";

/**
 * Wrap an API route handler so it runs inside the user's AsyncLocalStorage context.
 * The handler receives the resolved userId. Middleware already blocks unauthed callers,
 * but we re-check here as a defense-in-depth and so each route is self-contained.
 */
export function withUser<T>(
  handler: (userId: UserId, ...rest: unknown[]) => Promise<T>,
) {
  return async (request: Request, ctx?: unknown) => {
    const session = await getSessionFromRequest(request);
    if (!session) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    return runAsUser(session.userId, () => handler(session.userId, request, ctx)) as Promise<T>;
  };
}

/** Read-only userId resolution for a handler that keeps its original signature. */
export async function resolveUserId(request: Request): Promise<UserId | null> {
  const s = await getSessionFromRequest(request);
  return s?.userId ?? null;
}

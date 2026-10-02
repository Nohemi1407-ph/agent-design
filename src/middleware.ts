import { NextRequest, NextResponse } from "next/server";
import { getSessionFromNextRequest } from "@/lib/session";

const PUBLIC_PATHS = new Set(["/login", "/api/login", "/api/logout"]);

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  if (
    PUBLIC_PATHS.has(pathname) ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    // Still forward x-user-id when a session happens to be present (e.g. /login after auth),
    // but the simple path is just: pass through.
    return NextResponse.next();
  }

  const session = await getSessionFromNextRequest(req);
  if (!session) {
    if (pathname.startsWith("/api/")) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = "/login";
    url.search = "";
    return NextResponse.redirect(url);
  }

  const forwarded = new Headers(req.headers);
  forwarded.set("x-user-id", session.userId);
  return NextResponse.next({ request: { headers: forwarded } });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

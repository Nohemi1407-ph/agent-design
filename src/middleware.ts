import { NextResponse } from "next/server";
import { auth } from "@/auth";

// Publicly accessible paths (no auth needed)
const PUBLIC_PATHS = ["/login", "/login/check-email"];
const PUBLIC_API_PREFIXES = ["/api/auth"];

export default auth((req) => {
  const { pathname } = req.nextUrl;

  // Allow public paths
  if (PUBLIC_PATHS.includes(pathname)) return NextResponse.next();
  if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Everything else requires a session
  if (!req.auth) {
    const loginUrl = new URL("/login", req.nextUrl);
    loginUrl.searchParams.set("next", pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Admin-only routes
  if (pathname.startsWith("/admin")) {
    if (req.auth.user?.role !== "ADMIN") {
      return NextResponse.redirect(new URL("/", req.nextUrl));
    }
  }

  return NextResponse.next();
});

export const config = {
  // Skip static assets and Next internals
  matcher: ["/((?!_next|favicon.ico|uploads|.*\\..*).*)"],
};

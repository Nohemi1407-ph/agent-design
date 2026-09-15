import type { NextAuthConfig } from "next-auth";

// Publicly accessible paths (no auth needed)
const PUBLIC_PATHS = new Set([
  "/login",
  "/login/check-email",
]);
const PUBLIC_API_PREFIXES = ["/api/auth"];

/**
 * Edge-safe NextAuth config — used by middleware.
 * Contains NO Prisma adapter, NO Node-only APIs.
 * The full config in ./auth.ts spreads this and adds the adapter + providers.
 */
export const authConfig = {
  pages: {
    signIn: "/login",
    verifyRequest: "/login/check-email",
  },
  callbacks: {
    /**
     * Runs on every request in middleware.
     * Return true → allow, false → redirect to signIn.
     */
    authorized({ request, auth }) {
      const { pathname } = request.nextUrl;

      // Public paths always allowed
      if (PUBLIC_PATHS.has(pathname)) return true;
      if (PUBLIC_API_PREFIXES.some((p) => pathname.startsWith(p))) return true;

      // Not logged in → NextAuth redirects to signIn page automatically
      if (!auth) return false;

      // Admin-only routes
      if (pathname.startsWith("/admin")) {
        const role = (auth.user as { role?: string } | undefined)?.role;
        return role === "ADMIN";
      }

      return true;
    },
  },
  providers: [], // populated in auth.ts (Resend)
} satisfies NextAuthConfig;

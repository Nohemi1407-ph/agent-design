import NextAuth from "next-auth";
import { authConfig } from "./auth.config";

/**
 * Edge-safe middleware — no Prisma, no Node-only APIs.
 * The `authorized` callback in authConfig decides allow/redirect.
 */
export const { auth: middleware } = NextAuth(authConfig);

export default middleware;

export const config = {
  // Skip static assets, Next internals, and public uploads
  matcher: ["/((?!_next|favicon.ico|uploads|.*\\..*).*)"],
};

import NextAuth from "next-auth";
import { PrismaAdapter } from "@auth/prisma-adapter";
import Resend from "next-auth/providers/resend";
import { db } from "@/lib/db";
import { authConfig } from "./auth.config";

// Emails that get admin role automatically on first sign-in
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "mandaloyaonline1314@gmail.com")
  .split(",")
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  adapter: PrismaAdapter(db),
  session: { strategy: "database" },
  providers: [
    Resend({
      apiKey: process.env.RESEND_API_KEY,
      from: process.env.EMAIL_FROM || "onboarding@resend.dev",
    }),
  ],
  callbacks: {
    ...authConfig.callbacks,
    async session({ session, user }) {
      if (session.user) {
        session.user.id = user.id;
        (session.user as { role?: string }).role = (user as { role?: string }).role;
      }
      return session;
    },
  },
  events: {
    async signIn({ user }) {
      if (user?.email && ADMIN_EMAILS.includes(user.email.toLowerCase())) {
        await db.user.update({
          where: { id: user.id! },
          data: { role: "ADMIN" },
        });
      }
    },
  },
});

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      email?: string | null;
      name?: string | null;
      image?: string | null;
      role?: "USER" | "ADMIN";
    };
  }
}

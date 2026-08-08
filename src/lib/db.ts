import { PrismaClient } from "@prisma/client";

// Reuse the Prisma client across hot reloads in dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

// -------- Credit pricing (internal credits, not kie.ai credits) --------
// One internal credit is what the user buys. The app charges these credits
// for each generation, and the app itself pays kie.ai from the master key.

// Cost the USER pays in internal credits per slide
export const SLIDE_COST = {
  "1K": 10,
  "2K": 25,
  "4K": 60,
} as const;

// Credit packages the user can purchase (shown in the store)
export const CREDIT_PACKAGES = [
  { id: "starter", credits: 100, priceUSD: 10, badge: null },
  { id: "growth",  credits: 300, priceUSD: 25, badge: "Popular" },
  { id: "pro",     credits: 700, priceUSD: 50, badge: "Mejor valor" },
] as const;

export type PackageId = (typeof CREDIT_PACKAGES)[number]["id"];

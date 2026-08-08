import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";

// Reuse the Prisma client across hot reloads in dev
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

// Lazy singleton — the client is only instantiated the first time it's used.
// This lets Next.js build without DATABASE_URL being set, since routes only
// query the DB at request time.
let _client: PrismaClient | null = null;
function getClient(): PrismaClient {
  if (_client) return _client;
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error(
      "DATABASE_URL is not set. Configure it in .env.local (dev) or Railway variables (prod)."
    );
  }
  const adapter = new PrismaPg({ connectionString });
  _client =
    globalForPrisma.prisma ??
    new PrismaClient({
      adapter,
      log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
    });
  if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = _client;
  return _client;
}

// Proxy that forwards every property access to the lazily-created client.
// Downstream code keeps using `db.user.findMany()` naturally.
export const db = new Proxy({} as PrismaClient, {
  get(_target, prop) {
    const client = getClient() as unknown as Record<string | symbol, unknown>;
    return client[prop];
  },
});

// -------- Credit pricing (internal credits, not kie.ai credits) --------
export const SLIDE_COST = {
  "1K": 10,
  "2K": 25,
  "4K": 60,
} as const;

export const CREDIT_PACKAGES = [
  { id: "starter", credits: 100, priceUSD: 10, badge: null },
  { id: "growth",  credits: 300, priceUSD: 25, badge: "Popular" },
  { id: "pro",     credits: 700, priceUSD: 50, badge: "Mejor valor" },
] as const;

export type PackageId = (typeof CREDIT_PACKAGES)[number]["id"];

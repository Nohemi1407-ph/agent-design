import { readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Mutex } from "async-mutex";

const DATA_DIR = path.resolve(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "signup_tokens.json");
const mutex = new Mutex();

export interface SignupToken {
  token: string;
  createdAt: string;
  expiresAt: string;
  maxUses: number;
  uses: number;
  consumedBy?: string;
}

interface Store {
  tokens: SignupToken[];
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.tokens)) return parsed as Store;
  } catch {}
  return { tokens: [] };
}

async function writeStore(s: Store): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(s, null, 2), "utf-8");
  await rename(tmp, FILE);
}

export async function createSignupToken(opts: { maxUses?: number; expiresInDays?: number } = {}): Promise<SignupToken> {
  const token = crypto.randomBytes(18).toString("base64url").slice(0, 24);
  const now = new Date();
  const expires = new Date(now.getTime() + (opts.expiresInDays ?? 7) * 86400_000);
  const t: SignupToken = {
    token,
    createdAt: now.toISOString(),
    expiresAt: expires.toISOString(),
    maxUses: opts.maxUses ?? 10,
    uses: 0,
  };
  await mutex.runExclusive(async () => {
    const s = await readStore();
    s.tokens.push(t);
    await writeStore(s);
  });
  return t;
}

export async function listSignupTokens(): Promise<SignupToken[]> {
  const s = await readStore();
  return s.tokens;
}

export async function revokeSignupToken(token: string): Promise<boolean> {
  return await mutex.runExclusive(async () => {
    const s = await readStore();
    const before = s.tokens.length;
    s.tokens = s.tokens.filter((t) => t.token !== token);
    if (s.tokens.length === before) return false;
    await writeStore(s);
    return true;
  });
}

export function isTokenUsable(t: SignupToken): boolean {
  if (new Date(t.expiresAt).getTime() < Date.now()) return false;
  if (t.uses >= t.maxUses) return false;
  return true;
}

export async function getUsableToken(token: string): Promise<SignupToken | null> {
  const s = await readStore();
  const t = s.tokens.find((x) => x.token === token);
  if (!t || !isTokenUsable(t)) return null;
  return t;
}

export async function consumeSignupToken(token: string, guestId: string): Promise<SignupToken | null> {
  return await mutex.runExclusive(async () => {
    const s = await readStore();
    const t = s.tokens.find((x) => x.token === token);
    if (!t || !isTokenUsable(t)) return null;
    t.uses += 1;
    t.consumedBy = guestId;
    await writeStore(s);
    return t;
  });
}

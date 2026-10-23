import { readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";

const DATA_DIR = path.resolve(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "guest_secrets.json");

interface Entry {
  kieApiKey: string; // encrypted blob: `${iv}:${tag}:${ciphertext}` base64
  updatedAt: string;
}
interface Store {
  [guestId: string]: Entry;
}

function deriveKey(): Buffer {
  const s = process.env.AUTH_SECRET;
  if (!s) throw new Error("AUTH_SECRET is not set");
  return crypto.createHash("sha256").update(s).digest();
}

function encrypt(plaintext: string): string {
  const key = deriveKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function decrypt(blob: string): string | null {
  try {
    const [ivB64, tagB64, encB64] = blob.split(":");
    if (!ivB64 || !tagB64 || !encB64) return null;
    const key = deriveKey();
    const iv = Buffer.from(ivB64, "base64");
    const tag = Buffer.from(tagB64, "base64");
    const enc = Buffer.from(encB64, "base64");
    const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
    return dec.toString("utf8");
  } catch {
    return null;
  }
}

async function readStore(): Promise<Store> {
  try {
    const raw = await readFile(FILE, "utf-8");
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed ? (parsed as Store) : {};
  } catch {
    return {};
  }
}

async function writeStore(s: Store): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(s, null, 2), "utf-8");
  await rename(tmp, FILE);
}

export async function getGuestKieKey(guestId: string): Promise<string | null> {
  const s = await readStore();
  const e = s[guestId];
  if (!e?.kieApiKey) return null;
  return decrypt(e.kieApiKey);
}

export async function setGuestKieKey(guestId: string, plaintext: string): Promise<void> {
  const s = await readStore();
  s[guestId] = { kieApiKey: encrypt(plaintext), updatedAt: new Date().toISOString() };
  await writeStore(s);
}

export async function deleteGuestKieKey(guestId: string): Promise<void> {
  const s = await readStore();
  if (s[guestId]) {
    delete s[guestId];
    await writeStore(s);
  }
}

export async function hasGuestKieKey(guestId: string): Promise<boolean> {
  const s = await readStore();
  return !!s[guestId]?.kieApiKey;
}

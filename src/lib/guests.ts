import { readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";
import crypto from "crypto";
import { Mutex } from "async-mutex";

const DATA_DIR = path.resolve(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "guests.json");
const mutex = new Mutex();

export interface Guest {
  id: string;
  name: string;
  passwordHash: string;
  createdAt: string;
  archivedAt?: string;
}

interface Store {
  guests: Guest[];
}

export const GUEST_ID_RE = /^(guest|g_[A-Za-z0-9]{8,16})$/;

export function isValidGuestId(id: string): boolean {
  return GUEST_ID_RE.test(id);
}

export function sha256(s: string): string {
  return crypto.createHash("sha256").update(s, "utf-8").digest("hex");
}

export function randomGuestId(): string {
  return "g_" + crypto.randomBytes(6).toString("hex"); // 12 hex chars
}

export function randomPassword(): string {
  // 16-char URL-safe
  return crypto.randomBytes(12).toString("base64url").slice(0, 16);
}

async function readStoreRaw(): Promise<Store | null> {
  try {
    const raw = await readFile(FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.guests)) return parsed as Store;
    return { guests: [] };
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw err;
  }
}

async function writeStore(s: Store): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(s, null, 2), "utf-8");
  await rename(tmp, FILE);
}

/**
 * Load the guest store, seeding a legacy guest from GUEST_PASSWORD env var
 * the first time (userId = "guest" so existing scoped files remain reachable).
 */
async function loadStore(): Promise<Store> {
  const existing = await readStoreRaw();
  if (existing) return existing;
  const legacyPw = process.env.GUEST_PASSWORD;
  const store: Store = { guests: [] };
  if (legacyPw) {
    store.guests.push({
      id: "guest",
      name: "Invitado",
      passwordHash: sha256(legacyPw),
      createdAt: new Date().toISOString(),
    });
  }
  await writeStore(store);
  return store;
}

export async function listGuests(opts: { includeArchived?: boolean } = {}): Promise<Guest[]> {
  const store = await loadStore();
  const guests = store.guests;
  return opts.includeArchived ? guests : guests.filter((g) => !g.archivedAt);
}

export async function getGuest(id: string): Promise<Guest | null> {
  const store = await loadStore();
  return store.guests.find((g) => g.id === id) ?? null;
}

export async function createGuest(input: {
  name: string;
  password?: string;
}): Promise<{ guest: Guest; plaintextPassword: string }> {
  const name = (input.name || "").trim().slice(0, 60);
  if (!name) throw new Error("Name required");
  const plaintext = (input.password && input.password.trim()) || randomPassword();
  return await mutex.runExclusive(async () => {
    const store = await loadStore();
    let id = randomGuestId();
    // extremely unlikely collision but be safe
    while (store.guests.some((g) => g.id === id)) id = randomGuestId();
    const guest: Guest = {
      id,
      name,
      passwordHash: sha256(plaintext),
      createdAt: new Date().toISOString(),
    };
    store.guests.push(guest);
    await writeStore(store);
    return { guest, plaintextPassword: plaintext };
  });
}

export async function renameGuest(id: string, name: string): Promise<Guest | null> {
  const trimmed = (name || "").trim().slice(0, 60);
  if (!trimmed) throw new Error("Invalid name");
  return await mutex.runExclusive(async () => {
    const store = await loadStore();
    const g = store.guests.find((x) => x.id === id);
    if (!g) return null;
    g.name = trimmed;
    await writeStore(store);
    return g;
  });
}

export async function regeneratePassword(
  id: string,
): Promise<{ guest: Guest; plaintextPassword: string } | null> {
  const plaintext = randomPassword();
  return await mutex.runExclusive(async () => {
    const store = await loadStore();
    const g = store.guests.find((x) => x.id === id);
    if (!g) return null;
    g.passwordHash = sha256(plaintext);
    await writeStore(store);
    return { guest: g, plaintextPassword: plaintext };
  });
}

export async function setArchived(id: string, archived: boolean): Promise<Guest | null> {
  return await mutex.runExclusive(async () => {
    const store = await loadStore();
    const g = store.guests.find((x) => x.id === id);
    if (!g) return null;
    if (archived) g.archivedAt = new Date().toISOString();
    else delete g.archivedAt;
    await writeStore(store);
    return g;
  });
}

export async function authenticateGuest(password: string): Promise<Guest | null> {
  if (!password) return null;
  const hash = sha256(password);
  const guests = await listGuests({ includeArchived: false });
  for (const g of guests) {
    if (g.passwordHash === hash) return g;
  }
  return null;
}

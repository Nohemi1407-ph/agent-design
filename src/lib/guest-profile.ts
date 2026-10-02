import { readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";

const DATA_DIR = path.resolve(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "guest_profile.json");

export interface GuestProfile {
  name: string;
}

const DEFAULT: GuestProfile = { name: "Invitado" };

export async function getGuestProfile(): Promise<GuestProfile> {
  try {
    const raw = await readFile(FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && typeof parsed.name === "string" && parsed.name.trim()) {
      return { name: parsed.name };
    }
    return DEFAULT;
  } catch {
    return DEFAULT;
  }
}

export async function setGuestProfile(p: GuestProfile): Promise<GuestProfile> {
  const name = (p.name || "").trim().slice(0, 60) || "Invitado";
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify({ name }, null, 2), "utf-8");
  await rename(tmp, FILE);
  return { name };
}

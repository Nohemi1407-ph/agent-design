import { readdir, unlink, readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";
import { deleteGuest } from "./guests";
import { deleteGuestSecrets } from "./guest-secrets";
import { db } from "./db";

const DATA_DIR = path.resolve(process.cwd(), "data");

async function removeAnthropicUsageEntries(guestId: string): Promise<void> {
  const file = path.join(DATA_DIR, "anthropic_usage.json");
  try {
    const raw = await readFile(file, "utf-8");
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.entries)) return;
    const before = parsed.entries.length;
    parsed.entries = parsed.entries.filter(
      (e: { userId?: string }) => e.userId !== guestId,
    );
    if (parsed.entries.length === before) return;
    await mkdir(DATA_DIR, { recursive: true });
    const tmp = file + ".tmp";
    await writeFile(tmp, JSON.stringify(parsed, null, 2), "utf-8");
    await rename(tmp, file);
  } catch {
    /* missing file is fine */
  }
}

async function removeScopedFiles(guestId: string): Promise<void> {
  try {
    const entries = await readdir(DATA_DIR);
    const prefix = `${guestId}_`;
    await Promise.all(
      entries
        .filter((n) => n.startsWith(prefix))
        .map((n) =>
          unlink(path.join(DATA_DIR, n)).catch(() => {
            /* best effort */
          }),
        ),
    );
  } catch {
    /* ignore */
  }
}

/**
 * Hard-delete a guest and every artifact tied to them:
 * - guests.json row
 * - guest_secrets.json row (kie + anthropic keys)
 * - anthropic_usage.json entries
 * - CreditTx rows (Prisma)
 * - any ${guestId}_*.json scoped files under /data
 */
export async function hardDeleteGuest(guestId: string): Promise<boolean> {
  const removed = await deleteGuest(guestId);
  await Promise.allSettled([
    deleteGuestSecrets(guestId),
    removeAnthropicUsageEntries(guestId),
    db.creditTx.deleteMany({ where: { userId: guestId } }).catch(() => undefined),
    removeScopedFiles(guestId),
  ]);
  return removed;
}

import { readDataSafe, writeData } from "./data";
import { now } from "./utils";

const KIE_BALANCE_URL = "https://api.kie.ai/api/v1/chat/credit";
const FILE = "credits.json";

export interface CreditLogEntry {
  taskId: string;
  mode: "text-to-image" | "image-to-image";
  resolution: string;
  aspectRatio: string;
  creditsUsed: number;
  carouselId?: string;
  createdAt: string;
}

export interface CreditsData {
  log: CreditLogEntry[];
}

export async function fetchKieBalance(): Promise<number | null> {
  const apiKey = process.env.KIE_API_KEY;
  if (!apiKey) return null;
  try {
    const res = await fetch(KIE_BALANCE_URL, {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return null;
    const data = await res.json();
    if (data?.code === 200 && typeof data.data === "number") {
      return data.data;
    }
    return null;
  } catch {
    return null;
  }
}

export async function logUsage(entry: CreditLogEntry): Promise<void> {
  const data = await readDataSafe<CreditsData>(FILE, { log: [] });
  data.log.push(entry);
  // Keep only the last 500 entries to avoid unbounded growth
  if (data.log.length > 500) {
    data.log.splice(0, data.log.length - 500);
  }
  await writeData(FILE, data);
}

export async function getUsageSummary(): Promise<{
  total: number;
  today: number;
  byCarousel: Record<string, number>;
  recent: CreditLogEntry[];
}> {
  const data = await readDataSafe<CreditsData>(FILE, { log: [] });
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);

  let total = 0;
  let today = 0;
  const byCarousel: Record<string, number> = {};

  for (const e of data.log) {
    total += e.creditsUsed;
    if (new Date(e.createdAt) >= startOfToday) {
      today += e.creditsUsed;
    }
    if (e.carouselId) {
      byCarousel[e.carouselId] = (byCarousel[e.carouselId] || 0) + e.creditsUsed;
    }
  }

  const recent = data.log.slice(-20).reverse();
  return { total, today, byCarousel, recent };
}

// Re-export for convenience
export { now };

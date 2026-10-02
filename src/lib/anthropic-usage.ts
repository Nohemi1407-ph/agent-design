import { readFile, writeFile, rename, mkdir } from "fs/promises";
import path from "path";
import { Mutex } from "async-mutex";

const DATA_DIR = path.resolve(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "anthropic_usage.json");
const MAX_ENTRIES = 1000;
const mutex = new Mutex();

// Claude Sonnet 4.5 pricing (per 1M tokens)
const INPUT_PRICE_PER_MTOK = 3;
const OUTPUT_PRICE_PER_MTOK = 15;

export interface TokenEntry {
  userId: string;
  timestamp: string;
  inputTokens: number;
  outputTokens: number;
}

interface Data {
  entries: TokenEntry[];
}

async function readAll(): Promise<Data> {
  try {
    const raw = await readFile(FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) return parsed as Data;
  } catch {}
  return { entries: [] };
}

async function writeAll(d: Data): Promise<void> {
  await mkdir(DATA_DIR, { recursive: true });
  const tmp = FILE + ".tmp";
  await writeFile(tmp, JSON.stringify(d, null, 2), "utf-8");
  await rename(tmp, FILE);
}

export async function logTokenUsage(params: {
  userId: string;
  inputTokens: number;
  outputTokens: number;
}): Promise<void> {
  const inputTokens = Math.max(0, Math.floor(params.inputTokens || 0));
  const outputTokens = Math.max(0, Math.floor(params.outputTokens || 0));
  if (inputTokens === 0 && outputTokens === 0) return;
  await mutex.runExclusive(async () => {
    const data = await readAll();
    data.entries.push({
      userId: params.userId,
      timestamp: new Date().toISOString(),
      inputTokens,
      outputTokens,
    });
    if (data.entries.length > MAX_ENTRIES) {
      data.entries.splice(0, data.entries.length - MAX_ENTRIES);
    }
    await writeAll(data);
  });
}

export interface TokenSummary {
  inputTokens: number;
  outputTokens: number;
  estimatedUsd: number;
}

export async function getTokenSummary(userId?: string): Promise<TokenSummary> {
  const data = await readAll();
  let input = 0;
  let output = 0;
  for (const e of data.entries) {
    if (userId && e.userId !== userId) continue;
    input += e.inputTokens;
    output += e.outputTokens;
  }
  const estimatedUsd =
    (input / 1_000_000) * INPUT_PRICE_PER_MTOK +
    (output / 1_000_000) * OUTPUT_PRICE_PER_MTOK;
  return { inputTokens: input, outputTokens: output, estimatedUsd };
}

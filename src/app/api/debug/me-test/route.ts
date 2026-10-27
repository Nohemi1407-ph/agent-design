import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { currentUserId } from "@/lib/user-context";
import { getGuestAnthropicKey } from "@/lib/guest-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const PRIMARY = process.env.ANTHROPIC_MODEL || "claude-sonnet-4-5";
const FALLBACK = "claude-3-5-sonnet-20241022";

interface TestResult {
  model: string;
  ok: boolean;
  status?: number;
  errorType?: string;
  error?: string;
}

async function testModel(client: Anthropic, model: string): Promise<TestResult> {
  try {
    await client.messages.create({
      model,
      max_tokens: 1,
      messages: [{ role: "user", content: "hi" }],
    });
    return { model, ok: true };
  } catch (err) {
    const e = err as {
      status?: number;
      error?: { type?: string; message?: string };
      message?: string;
    };
    return {
      model,
      ok: false,
      status: e?.status,
      errorType: e?.error?.type,
      error: e?.error?.message || e?.message || String(err),
    };
  }
}

export async function GET() {
  const uid = await currentUserId();
  let apiKey: string | null | undefined;
  if (uid === "owner") {
    apiKey = process.env.ANTHROPIC_API_KEY;
  } else {
    apiKey = await getGuestAnthropicKey(uid).catch(() => null);
  }
  if (!apiKey) {
    return NextResponse.json(
      { ok: false, error: "No Anthropic API key for current user", userId: uid },
      { status: 428 },
    );
  }

  const client = new Anthropic({ apiKey });
  const primary = await testModel(client, PRIMARY);
  const result: {
    ok: boolean;
    userId: string;
    primary: TestResult;
    fallback?: TestResult;
    recommendation?: string;
  } = { ok: primary.ok, userId: uid, primary };

  if (!primary.ok && primary.status !== 401 && PRIMARY !== FALLBACK) {
    const fb = await testModel(client, FALLBACK);
    result.fallback = fb;
    result.ok = fb.ok;
    if (fb.ok) {
      result.recommendation = `Primary model '${PRIMARY}' not available for this key. Fallback '${FALLBACK}' works — chat route will auto-fallback.`;
    }
  } else if (primary.status === 401) {
    result.recommendation = "Key rejected (401). User should reconnect at /connect.";
  }

  return NextResponse.json(result);
}

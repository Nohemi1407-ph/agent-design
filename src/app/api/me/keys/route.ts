import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { setGuestKieKey, setGuestAnthropicKey } from "@/lib/guest-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function validateKieKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.kie.ai/api/v1/chat/credit", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.code === 200;
  } catch {
    return false;
  }
}

async function validateAnthropicKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-latest",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    // Only 401 means invalid key. 403/404 (model restricted or renamed),
    // 429 (rate limited), 400 (shape), 5xx (overloaded) — key is still valid.
    return res.status !== 401;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  if (userId === "owner") {
    return NextResponse.json({ error: "Owner uses env vars" }, { status: 400 });
  }
  let body: { kieApiKey?: string; anthropicApiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const kie = (body.kieApiKey || "").toString().trim();
  const anthropic = (body.anthropicApiKey || "").toString().trim();
  if (!kie || !anthropic) {
    return NextResponse.json(
      { error: "Ambas keys son obligatorias" },
      { status: 400 },
    );
  }
  const [kieOk, anthropicOk] = await Promise.all([
    validateKieKey(kie),
    validateAnthropicKey(anthropic),
  ]);
  if (!kieOk) {
    return NextResponse.json({ error: "kie.ai API key inválida" }, { status: 401 });
  }
  if (!anthropicOk) {
    return NextResponse.json({ error: "Anthropic API key inválida" }, { status: 401 });
  }
  await setGuestKieKey(userId, kie);
  await setGuestAnthropicKey(userId, anthropic);
  return NextResponse.json({ ok: true });
}

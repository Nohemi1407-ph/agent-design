import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { getGuest, isValidGuestId } from "@/lib/guests";
import {
  setGuestKieKey,
  setGuestAnthropicKey,
} from "@/lib/guest-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function validateKie(apiKey: string): Promise<boolean> {
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

async function validateAnthropic(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "claude-haiku-4-5-20251001",
        max_tokens: 1,
        messages: [{ role: "user", content: "hi" }],
      }),
    });
    // 200 = valid; 400 = valid key but request shape issue (still valid key); 401 = invalid key
    return res.status === 200 || res.status === 400;
  } catch {
    return false;
  }
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ id: string }> },
) {
  if ((await currentUserId()) !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isValidGuestId(id)) {
    return NextResponse.json({ error: "Invalid guest id" }, { status: 400 });
  }
  const g = await getGuest(id);
  if (!g) return NextResponse.json({ error: "Not found" }, { status: 404 });

  let body: { kieApiKey?: string; anthropicApiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const kie = (body.kieApiKey || "").trim();
  const anthropic = (body.anthropicApiKey || "").trim();

  if (!kie && !anthropic) {
    return NextResponse.json({ error: "No keys provided" }, { status: 400 });
  }

  const errors: string[] = [];
  if (kie) {
    if (!(await validateKie(kie))) {
      errors.push("Clave kie.ai inválida");
    } else {
      await setGuestKieKey(id, kie);
    }
  }
  if (anthropic) {
    if (!(await validateAnthropic(anthropic))) {
      errors.push("Clave Anthropic inválida");
    } else {
      await setGuestAnthropicKey(id, anthropic);
    }
  }

  if (errors.length > 0) {
    return NextResponse.json({ error: errors.join(", ") }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}

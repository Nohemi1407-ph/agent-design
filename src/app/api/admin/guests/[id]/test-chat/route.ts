import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { currentUserId } from "@/lib/user-context";
import { getGuest, isValidGuestId } from "@/lib/guests";
import { getGuestAnthropicKey } from "@/lib/guest-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const MODELS_TO_TRY = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-haiku-5-5",
  "claude-sonnet-5",
  "claude-sonnet-5-5",
  "claude-opus-4-6",
];

type ModelResult =
  | { model: string; ok: true }
  | { model: string; ok: false; status?: number; error: string; errorType?: string };

export async function POST(
  _request: NextRequest,
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

  const apiKey = await getGuestAnthropicKey(id).catch(() => null);
  if (!apiKey) {
    return NextResponse.json({ ok: false, reason: "Guest has no Anthropic key stored" }, { status: 400 });
  }

  const client = new Anthropic({ apiKey });
  const results: ModelResult[] = [];
  let workingModel: string | null = null;

  for (const model of MODELS_TO_TRY) {
    try {
      await client.messages.create({
        model,
        max_tokens: 10,
        messages: [{ role: "user", content: "hi" }],
      });
      results.push({ model, ok: true });
      workingModel = model;
      break;
    } catch (err) {
      const e = err as { status?: number; message?: string; error?: { type?: string; message?: string } };
      results.push({
        model,
        ok: false,
        status: e.status,
        error: e.error?.message || e.message || String(err),
        errorType: e.error?.type,
      });
    }
  }

  // Also try tool_use capability on the working model (if any)
  let toolUseOk = false;
  let toolUseError: string | undefined;
  if (workingModel) {
    try {
      await client.messages.create({
        model: workingModel,
        max_tokens: 50,
        tools: [
          {
            name: "say_hello",
            description: "Say hello",
            input_schema: { type: "object", properties: {}, required: [] },
          },
        ],
        messages: [{ role: "user", content: "Call the say_hello tool" }],
      });
      toolUseOk = true;
    } catch (err) {
      const e = err as { message?: string; error?: { message?: string } };
      toolUseError = e.error?.message || e.message || String(err);
    }
  }

  return NextResponse.json({
    guestId: id,
    guestName: g.name,
    hasKey: true,
    workingModel,
    toolUseOk,
    toolUseError,
    results,
    recommendation: workingModel
      ? toolUseOk
        ? `✓ Todo OK. Usa modelo ${workingModel}.`
        : `⚠️ Modelo ${workingModel} funciona para texto pero NO soporta tool_use. Esto es por qué el chat no crea slides. Error: ${toolUseError}`
      : "✗ Ningún modelo funciona con esta key. Verifica el plan de Anthropic o reconecta.",
  });
}

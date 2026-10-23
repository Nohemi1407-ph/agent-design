import { NextRequest, NextResponse } from "next/server";
import { consumeSignupToken, getUsableToken } from "@/lib/signup-tokens";
import { createPendingGuest } from "@/lib/guests";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const t = await getUsableToken(token);
  if (!t) return NextResponse.json({ ok: false }, { status: 404 });
  return NextResponse.json({ ok: true });
}

export async function POST(
  request: NextRequest,
  ctx: { params: Promise<{ token: string }> },
) {
  const { token } = await ctx.params;
  const t = await getUsableToken(token);
  if (!t) {
    return NextResponse.json(
      { error: "Invitación no válida o expirada" },
      { status: 404 },
    );
  }
  let body: { name?: string; pin?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const name = (body.name || "").toString().trim();
  const pin = (body.pin || "").toString().trim();
  if (!name) return NextResponse.json({ error: "Nombre requerido" }, { status: 400 });
  if (!/^\d{6}$/.test(pin)) {
    return NextResponse.json({ error: "PIN debe tener 6 dígitos" }, { status: 400 });
  }
  let guest;
  try {
    guest = await createPendingGuest({ name, pin });
  } catch (err) {
    return NextResponse.json({ error: (err as Error).message }, { status: 400 });
  }
  await consumeSignupToken(token, guest.id);
  return NextResponse.json({
    ok: true,
    message: "Esperando aprobación del administrador",
  });
}

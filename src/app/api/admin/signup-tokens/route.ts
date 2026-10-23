import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { createSignupToken, listSignupTokens } from "@/lib/signup-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if ((await currentUserId()) !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const tokens = await listSignupTokens();
  return NextResponse.json({ tokens });
}

export async function POST() {
  if ((await currentUserId()) !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const t = await createSignupToken();
  return NextResponse.json({ ok: true, token: t });
}

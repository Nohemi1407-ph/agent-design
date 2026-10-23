import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { revokeSignupToken } from "@/lib/signup-tokens";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ token: string }> },
) {
  if ((await currentUserId()) !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { token } = await ctx.params;
  const ok = await revokeSignupToken(token);
  if (!ok) return NextResponse.json({ error: "Not found" }, { status: 404 });
  return NextResponse.json({ ok: true });
}

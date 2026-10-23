import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { isValidGuestId } from "@/lib/guests";
import { deleteGuestKieKey } from "@/lib/guest-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(
  _request: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  const uid = await currentUserId();
  if (uid !== "owner") {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }
  const { id } = await ctx.params;
  if (!isValidGuestId(id) && id !== "guest") {
    return NextResponse.json({ error: "Invalid guest id" }, { status: 400 });
  }
  await deleteGuestKieKey(id);
  return NextResponse.json({ ok: true });
}

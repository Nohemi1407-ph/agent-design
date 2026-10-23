import { NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { isValidGuestId } from "@/lib/guests";
import { getGuestKieKey } from "@/lib/guest-secrets";
import { fetchKieBalance } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
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
  const key = await getGuestKieKey(id);
  if (!key) {
    return NextResponse.json({ hasKey: false, balance: null });
  }
  const balance = await fetchKieBalance(key);
  return NextResponse.json({ hasKey: true, balance });
}

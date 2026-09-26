import { NextResponse } from "next/server";
import { getBalance } from "@/lib/credits-ledger";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Single-user app: no auth, just report the "owner" balance.
export async function GET() {
  const balance = await getBalance("owner").catch(() => 0);
  return NextResponse.json({
    id: "owner",
    email: null,
    name: "Owner",
    role: "ADMIN",
    hasAnthropicKey: !!process.env.ANTHROPIC_API_KEY,
    balance,
  });
}

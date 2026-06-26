import { NextResponse } from "next/server";
import { fetchKieBalance, getUsageSummary } from "@/lib/credits";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const [balance, summary] = await Promise.all([
    fetchKieBalance(),
    getUsageSummary(),
  ]);
  return NextResponse.json({
    balance,
    enabled: !!process.env.KIE_API_KEY,
    ...summary,
  });
}

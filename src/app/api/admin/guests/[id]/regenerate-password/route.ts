import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  return NextResponse.json(
    { error: "Gone. Use /api/admin/guests/[id]/regenerate-pin." },
    { status: 410 },
  );
}

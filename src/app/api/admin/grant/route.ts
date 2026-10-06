import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deprecated. Use /api/admin/guests/[id]/grant instead.
export async function POST() {
  return NextResponse.json(
    { error: "Gone — use /api/admin/guests/[id]/grant" },
    { status: 410 },
  );
}

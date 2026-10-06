import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Deprecated single-guest endpoint. Use /api/admin/guests instead.
export async function GET() {
  return NextResponse.json(
    { error: "Gone — use /api/admin/guests" },
    { status: 410 },
  );
}

export async function PATCH() {
  return NextResponse.json(
    { error: "Gone — use /api/admin/guests/[id]" },
    { status: 410 },
  );
}

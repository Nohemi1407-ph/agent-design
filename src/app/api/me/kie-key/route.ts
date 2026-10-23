import { NextRequest, NextResponse } from "next/server";
import { currentUserId } from "@/lib/user-context";
import { setGuestKieKey, deleteGuestKieKey } from "@/lib/guest-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function validateKey(apiKey: string): Promise<boolean> {
  try {
    const res = await fetch("https://api.kie.ai/api/v1/chat/credit", {
      headers: { Authorization: `Bearer ${apiKey}` },
      cache: "no-store",
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return data?.code === 200;
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  const userId = await currentUserId();
  if (userId === "owner") {
    return NextResponse.json({ error: "Owner uses env var" }, { status: 400 });
  }
  let body: { apiKey?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }
  const apiKey = (body.apiKey || "").toString().trim();
  if (!apiKey) return NextResponse.json({ error: "apiKey required" }, { status: 400 });
  const ok = await validateKey(apiKey);
  if (!ok) {
    return NextResponse.json({ error: "Invalid kie.ai API key" }, { status: 401 });
  }
  await setGuestKieKey(userId, apiKey);
  return NextResponse.json({ ok: true });
}

export async function DELETE() {
  const userId = await currentUserId();
  if (userId === "owner") {
    return NextResponse.json({ error: "Owner uses env var" }, { status: 400 });
  }
  await deleteGuestKieKey(userId);
  return NextResponse.json({ ok: true });
}

import { NextRequest, NextResponse } from "next/server";
import { generateImage } from "@/lib/generate-image";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

export async function POST(request: NextRequest) {
  let body: {
    prompt?: string;
    aspectRatio?: string;
    resolution?: string;
    inputImages?: string[];
    carouselId?: string;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const result = await generateImage({
    prompt: body.prompt || "",
    aspectRatio: body.aspectRatio,
    resolution: body.resolution,
    inputImages: body.inputImages,
    carouselId: body.carouselId,
  });

  if (!result.ok) {
    const { ok: _ok, status, ...rest } = result;
    void _ok;
    return NextResponse.json(rest, { status });
  }

  const { ok: _ok2, ...payload } = result;
  void _ok2;
  return NextResponse.json(payload);
}

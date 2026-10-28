import { NextRequest, NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { buildSystemPrompt } from "@/lib/chat-system-prompt";
import { getBrand, updateBrand } from "@/lib/brand";
import {
  addSlide,
  updateSlide,
  deleteSlide,
  reorderSlides,
  getCarousel,
  listCarousels,
  createCarousel,
} from "@/lib/carousels";
import { getPreset } from "@/lib/style-presets";
import { generateImage } from "@/lib/generate-image";
import type { AspectRatio } from "@/types/carousel";
import { currentUserId } from "@/lib/user-context";
import { logTokenUsage } from "@/lib/anthropic-usage";
import { getGuestAnthropicKey } from "@/lib/guest-secrets";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

const MODEL = process.env.ANTHROPIC_MODEL || "claude-haiku-4-5";
const FALLBACK_MODEL = "claude-sonnet-4-6";
// Current valid model IDs — the `claude-sonnet-4-5` and `claude-3-5-*`
// IDs used before didn't exist on most accounts, which was why guest
// chats returned 404 for every fallback. These are the IDs from the
// Anthropic API model catalog (table in the claude-api skill).
const FALLBACK_MODELS = [
  "claude-haiku-4-5",
  "claude-sonnet-4-6",
  "claude-haiku-5-5",
  "claude-sonnet-5",
  "claude-sonnet-5-5",
  "claude-opus-4-6",
];

function isModelNotAvailableError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { status?: number; error?: { type?: string }; message?: string };
  const msg = (e.message || "").toLowerCase();
  if (e.status === 404) return true;
  if (e.error?.type === "not_found_error") return true;
  if (msg.includes("not_found_error") || msg.includes("model") && msg.includes("not")) return true;
  return false;
}

function isVisionUnsupportedError(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { message?: string; error?: { message?: string } };
  const msg = ((e.message || "") + " " + (e.error?.message || "")).toLowerCase();
  return (
    msg.includes("vision") ||
    msg.includes("image") && (msg.includes("not supported") || msg.includes("unsupported") || msg.includes("not allowed"))
  );
}

const tools: Anthropic.Tool[] = [
  {
    name: "create_slide",
    description:
      "Add a new slide to a carousel. HTML is body-level only (no <html>/<head>). Typically an <img> tag pointing to a generated /uploads/...png. Returns the created slide with its id.",
    input_schema: {
      type: "object",
      properties: {
        carouselId: { type: "string" },
        html: { type: "string" },
        notes: { type: "string" },
      },
      required: ["carouselId", "html"],
    },
  },
  {
    name: "update_slide",
    description: "Replace a slide's HTML and/or notes.",
    input_schema: {
      type: "object",
      properties: {
        carouselId: { type: "string" },
        slideId: { type: "string" },
        html: { type: "string" },
        notes: { type: "string" },
      },
      required: ["carouselId", "slideId"],
    },
  },
  {
    name: "delete_slide",
    description: "Delete a slide from a carousel.",
    input_schema: {
      type: "object",
      properties: {
        carouselId: { type: "string" },
        slideId: { type: "string" },
      },
      required: ["carouselId", "slideId"],
    },
  },
  {
    name: "reorder_slides",
    description: "Reorder slides in a carousel by giving the complete list of slide IDs in the new order.",
    input_schema: {
      type: "object",
      properties: {
        carouselId: { type: "string" },
        slideIds: { type: "array", items: { type: "string" } },
      },
      required: ["carouselId", "slideIds"],
    },
  },
  {
    name: "list_slides",
    description: "Return the current slides (id, order, notes, html length) for a carousel.",
    input_schema: {
      type: "object",
      properties: { carouselId: { type: "string" } },
      required: ["carouselId"],
    },
  },
  {
    name: "generate_image",
    description:
      "Generate an image with GPT Image-2 via kie.ai. CRITICAL: whenever the carousel has reference images (see 'Reference images' in the system prompt), you MUST pass their URLs in inputImages so kie.ai runs in image-to-image mode and faithfully copies the reference style. Only skip inputImages if the carousel truly has no references. Returns {url, mode, creditsUsed}. mode='text-to-image' means references were NOT used — if that happens by mistake, retry with inputImages.",
    input_schema: {
      type: "object",
      properties: {
        prompt: { type: "string" },
        aspectRatio: {
          type: "string",
          description: "e.g. '1:1', '4:5', '9:16'. Defaults to 'auto'.",
        },
        resolution: { type: "string", enum: ["1K", "2K", "4K"] },
        inputImages: {
          type: "array",
          items: { type: "string" },
          description:
            "Array of full HTTPS URLs of reference images to condition the generation on (image-to-image mode). REQUIRED when the carousel has reference images uploaded. Pass the reference URLs from the system prompt's 'Reference images' section verbatim. Include the brand logo URL too when generating slide 1 or the last slide.",
        },
        carouselId: { type: "string" },
      },
      required: ["prompt"],
    },
  },
  {
    name: "get_brand",
    description: "Get the current brand configuration.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "update_brand",
    description: "Partially update the brand configuration.",
    input_schema: {
      type: "object",
      properties: {
        name: { type: "string" },
        logoPath: { type: "string" },
        styleKeywords: { type: "array", items: { type: "string" } },
        colors: {
          type: "object",
          properties: {
            primary: { type: "string" },
            secondary: { type: "string" },
            accent: { type: "string" },
            background: { type: "string" },
          },
        },
        fonts: {
          type: "object",
          properties: {
            heading: { type: "string" },
            body: { type: "string" },
          },
        },
        socials: {
          type: "object",
          properties: {
            instagram: { type: "string" },
            website: { type: "string" },
            tiktok: { type: "string" },
            youtube: { type: "string" },
          },
        },
      },
    },
  },
  {
    name: "get_carousel",
    description: "Return a carousel with its slides and reference images.",
    input_schema: {
      type: "object",
      properties: { carouselId: { type: "string" } },
      required: ["carouselId"],
    },
  },
  {
    name: "list_carousels",
    description: "Return a summary of all carousels (id, name, aspectRatio, slide count).",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "create_carousel",
    description: "Create a new empty carousel.",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string" },
        aspectRatio: { type: "string", enum: ["1:1", "4:5", "9:16"] },
      },
      required: ["title", "aspectRatio"],
    },
  },
];

async function executeTool(
  name: string,
  input: Record<string, unknown>,
): Promise<string> {
  console.log(`[chat.tool] ${name}`, JSON.stringify(input).slice(0, 500));
  try {
    switch (name) {
      case "create_slide": {
        const slide = await addSlide(
          String(input.carouselId),
          String(input.html),
          input.notes ? String(input.notes) : "",
        );
        if (!slide) return JSON.stringify({ error: "Failed to add slide (carousel not found or at max)" });
        return JSON.stringify({ ok: true, slide });
      }
      case "update_slide": {
        const updates: { html?: string; notes?: string } = {};
        if (typeof input.html === "string") updates.html = input.html;
        if (typeof input.notes === "string") updates.notes = input.notes;
        const slide = await updateSlide(String(input.carouselId), String(input.slideId), updates);
        if (!slide) return JSON.stringify({ error: "Slide not found" });
        return JSON.stringify({ ok: true, slide });
      }
      case "delete_slide": {
        const ok = await deleteSlide(String(input.carouselId), String(input.slideId));
        return JSON.stringify({ ok });
      }
      case "reorder_slides": {
        const ok = await reorderSlides(
          String(input.carouselId),
          (input.slideIds as string[]) || [],
        );
        return JSON.stringify({ ok });
      }
      case "list_slides": {
        const c = await getCarousel(String(input.carouselId));
        if (!c) return JSON.stringify({ error: "Carousel not found" });
        return JSON.stringify({
          slides: c.slides.map((s) => ({
            id: s.id,
            order: s.order,
            notes: s.notes,
            htmlLength: s.html.length,
          })),
        });
      }
      case "generate_image": {
        const result = await generateImage({
          prompt: String(input.prompt || ""),
          aspectRatio: input.aspectRatio ? String(input.aspectRatio) : undefined,
          resolution: input.resolution ? String(input.resolution) : undefined,
          inputImages: Array.isArray(input.inputImages) ? (input.inputImages as string[]) : undefined,
          carouselId: input.carouselId ? String(input.carouselId) : undefined,
        });
        if (!result.ok) return JSON.stringify({ error: result.error, code: result.code });
        return JSON.stringify({
          url: result.path,
          creditsUsed: result.creditsUsed,
          userCreditsCharged: result.userCreditsCharged,
          userBalanceAfter: result.userBalanceAfter,
          mode: result.mode,
        });
      }
      case "get_brand": {
        return JSON.stringify(await getBrand());
      }
      case "update_brand": {
        const updated = await updateBrand(input as Parameters<typeof updateBrand>[0]);
        return JSON.stringify({ ok: true, brand: updated });
      }
      case "get_carousel": {
        const c = await getCarousel(String(input.carouselId));
        if (!c) return JSON.stringify({ error: "Carousel not found" });
        return JSON.stringify(c);
      }
      case "list_carousels": {
        const list = await listCarousels();
        return JSON.stringify(
          list.map((c) => ({
            id: c.id,
            name: c.name,
            aspectRatio: c.aspectRatio,
            slideCount: c.slides.length,
          })),
        );
      }
      case "create_carousel": {
        const c = await createCarousel(
          String(input.title),
          String(input.aspectRatio) as AspectRatio,
        );
        return JSON.stringify({ ok: true, carousel: c });
      }
      default:
        return JSON.stringify({ error: `Unknown tool: ${name}` });
    }
  } catch (err) {
    console.error(`[chat.tool] ${name} ERROR`, err);
    return JSON.stringify({ error: err instanceof Error ? err.message : String(err) });
  }
}

export async function POST(request: NextRequest) {
  const uid = await currentUserId();
  let apiKey: string | null | undefined;
  if (uid === "owner") {
    apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return NextResponse.json({ error: "ANTHROPIC_API_KEY not configured" }, { status: 503 });
    }
  } else {
    apiKey = await getGuestAnthropicKey(uid).catch(() => null);
    if (!apiKey) {
      return NextResponse.json(
        { error: "Falta Anthropic API key. Conéctala en /connect." },
        { status: 428 },
      );
    }
  }

  let body: {
    message?: string;
    sessionId?: string;
    carouselId?: string;
    stylePresetId?: string;
    history?: { role: "user" | "assistant"; content: string }[];
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const { message, sessionId, carouselId, stylePresetId, history } = body;

  if (!message || typeof message !== "string" || !message.trim() || message.length > 10000) {
    return NextResponse.json({ error: "Invalid message" }, { status: 400 });
  }

  const brand = await getBrand();
  const carousel = carouselId ? await getCarousel(carouselId) : null;
  const stylePreset = stylePresetId ? await getPreset(stylePresetId) : null;
  const systemPrompt = buildSystemPrompt(brand, carousel, stylePreset);

  const messages: Anthropic.MessageParam[] = [];
  if (Array.isArray(history)) {
    for (const m of history) {
      if (m && (m.role === "user" || m.role === "assistant") && m.content?.trim()) {
        messages.push({ role: m.role, content: m.content });
      }
    }
  }

  // Attach reference images (and logo) as vision blocks so the model can
  // actually SEE what it's supposed to reproduce. The old Claude CLI flow
  // used the Read tool which fed image bytes to the model; without this the
  // SDK loop only saw URLs, which is why generations stopped matching the
  // uploaded reference.
  type ImgSrc = { url: string; label: string };
  const refSources: ImgSrc[] = [];
  if (carousel?.referenceImages?.length) {
    carousel.referenceImages.forEach((r, i) => {
      if (r?.url && /^https?:\/\//i.test(r.url)) {
        refSources.push({ url: r.url, label: `Image ${i + 1}: reference "${r.name}" (${r.url})` });
      }
    });
  }
  if (brand.logoPath && /^https?:\/\//i.test(brand.logoPath)) {
    refSources.push({
      url: brand.logoPath,
      label: `Image ${refSources.length + 1}: brand logo (${brand.logoPath})`,
    });
  }

  const refBlocks: Anthropic.ImageBlockParam[] = [];
  for (const src of refSources) {
    try {
      // Hard timeout so a slow R2 fetch can't hang the entire chat
      // request (symptom: user sees a blank chat for minutes).
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10_000);
      let dl: Response;
      try {
        dl = await fetch(src.url, { signal: controller.signal });
      } finally {
        clearTimeout(timer);
      }
      if (!dl.ok) continue;
      const ct = dl.headers.get("content-type") || "image/png";
      const media: Anthropic.ImageBlockParam.Source["media_type"] =
        ct.includes("jpeg") || ct.includes("jpg")
          ? "image/jpeg"
          : ct.includes("webp")
            ? "image/webp"
            : ct.includes("gif")
              ? "image/gif"
              : "image/png";
      const buf = Buffer.from(await dl.arrayBuffer());
      // Anthropic caps image inputs at 5MB; skip oversized refs.
      if (buf.byteLength > 5 * 1024 * 1024) {
        console.warn(`[chat] skipping oversized reference image (${buf.byteLength} bytes): ${src.url}`);
        continue;
      }
      refBlocks.push({
        type: "image",
        source: { type: "base64", media_type: media, data: buf.toString("base64") },
      });
    } catch (e) {
      console.warn("[chat] failed to attach reference image", src.url, e);
    }
  }

  if (refBlocks.length > 0) {
    messages.push({
      role: "user",
      content: [
        ...refBlocks,
        {
          type: "text",
          text:
            `The images above are your visual references for THIS carousel. Study their palette, typography, composition, lighting, material and mood — every slide you generate must reproduce this visual language faithfully. When you call generate_image, pass these exact URLs as inputImages so kie.ai runs in image-to-image mode:\n${refSources.map((s) => s.label).join("\n")}`,
        },
      ],
    });
  }

  messages.push({ role: "user", content: message });

  const client = new Anthropic({ apiKey });
  const encoder = new TextEncoder();
  const chatUserId = await currentUserId();

  const stream = new ReadableStream({
    async start(controller) {
      const resolvedSessionId = sessionId || `sess_${Date.now()}`;
      const send = (obj: unknown) => {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(obj)}\n\n`));
      };
      // SSE comment keepalive every 15s so Railway/CDN proxies don't
      // kill an idle connection during long image-gen tool calls.
      const keepalive = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(`: keepalive ${Date.now()}\n\n`));
        } catch {}
      }, 15_000);
      let fullText = "";
      let totalInputTokens = 0;
      let totalOutputTokens = 0;
      const MAX_ITERATIONS = 20;

      let activeModel = MODEL;
      let visionDisabled = false;
      // Build an exhaustive model-fallback list once, starting with the
      // configured primary, then every known-good fallback.
      const triedModels = new Set<string>();
      const nextModel = (current: string): string | null => {
        for (const m of FALLBACK_MODELS) {
          if (m !== current && !triedModels.has(m)) return m;
        }
        return null;
      };
      try {
        for (let iter = 0; iter < MAX_ITERATIONS; iter++) {
          let stream: ReturnType<typeof client.messages.stream>;
          let finalMsg: Anthropic.Message;
          let attempt = 0;
          const MAX_ATTEMPTS = 6;
          // eslint-disable-next-line no-constant-condition
          while (true) {
            try {
              triedModels.add(activeModel);
              stream = client.messages.stream({
                model: activeModel,
                max_tokens: 8192,
                system: systemPrompt,
                tools,
                messages,
              });
              for await (const event of stream) {
                if (
                  event.type === "content_block_delta" &&
                  event.delta.type === "text_delta"
                ) {
                  const text = event.delta.text;
                  fullText += text;
                  send({ type: "token", text });
                }
              }
              finalMsg = await stream.finalMessage();
              break;
            } catch (err) {
              // Only attempt fallbacks on the first outer iteration and only
              // when we haven't yet produced text.
              if (iter !== 0 || attempt >= MAX_ATTEMPTS || fullText.length > 0) throw err;
              if (isModelNotAvailableError(err)) {
                const next = nextModel(activeModel);
                if (next) {
                  console.warn(
                    `[chat] model ${activeModel} unavailable, trying ${next}`,
                    err instanceof Error ? err.message : err,
                  );
                  send({
                    type: "token",
                    text: `_(cambiando a ${next} porque tu plan no tiene acceso al modelo anterior)_\n`,
                  });
                  activeModel = next;
                  attempt++;
                  continue;
                }
                throw err;
              }
              if (isVisionUnsupportedError(err) && !visionDisabled && refBlocks.length > 0) {
                console.warn(
                  "[chat] vision not supported on this key, retrying without image blocks",
                  err instanceof Error ? err.message : err,
                );
                // Strip the vision user message we injected earlier.
                for (let i = messages.length - 1; i >= 0; i--) {
                  const m = messages[i];
                  if (
                    m.role === "user" &&
                    Array.isArray(m.content) &&
                    m.content.some((c) => c.type === "image")
                  ) {
                    messages.splice(i, 1);
                  }
                }
                visionDisabled = true;
                attempt++;
                continue;
              }
              throw err;
            }
          }
          if (finalMsg.usage) {
            totalInputTokens += finalMsg.usage.input_tokens || 0;
            totalOutputTokens += finalMsg.usage.output_tokens || 0;
          }

          if (finalMsg.stop_reason !== "tool_use") {
            break;
          }

          // Execute tool calls in parallel — image generations are independent
          const toolUseBlocks = finalMsg.content.filter(
            (b): b is Extract<typeof b, { type: "tool_use" }> => b.type === "tool_use",
          );
          for (const block of toolUseBlocks) {
            send({ type: "tool", name: block.name, input: block.input });
          }
          const toolResults: Anthropic.ToolResultBlockParam[] = await Promise.all(
            toolUseBlocks.map(async (block) => {
              const result = await executeTool(
                block.name,
                block.input as Record<string, unknown>,
              );
              let ok = true;
              try {
                const parsed = JSON.parse(result);
                if (parsed && typeof parsed === "object" && "error" in parsed) ok = false;
              } catch {}
              send({ type: "tool_result", name: block.name, ok });
              return {
                type: "tool_result" as const,
                tool_use_id: block.id,
                content: result,
              };
            }),
          );

          messages.push({ role: "assistant", content: finalMsg.content });
          messages.push({ role: "user", content: toolResults });
        }

        send({ type: "result", text: fullText });
        controller.enqueue(
          encoder.encode(
            `event: done\ndata: ${JSON.stringify({ sessionId: resolvedSessionId, exitCode: 0 })}\n\n`,
          ),
        );
        controller.close();
      } catch (err) {
        console.error("[chat] Anthropic SDK error", err);
        const msg = err instanceof Error ? err.message : String(err);
        const status = (err as { status?: number } | null)?.status;
        const code =
          status === 401
            ? "ANTHROPIC_AUTH_FAILED"
            : isModelNotAvailableError(err)
              ? "ANTHROPIC_MODEL_UNAVAILABLE"
              : undefined;
        // Surface the error inline as a token so the user sees SOMETHING
        // instead of silence when the SSE error event isn't rendered.
        const userMsg =
          code === "ANTHROPIC_AUTH_FAILED"
            ? "⚠️ Tu clave Anthropic no autoriza. Ve a /connect para reconectarla."
            : code === "ANTHROPIC_MODEL_UNAVAILABLE"
              ? `⚠️ Tu plan de Anthropic no tiene acceso a ningún modelo compatible. Prueba con una clave de un plan Build/Scale. Error: ${msg}`
              : `⚠️ Error del chat: ${msg}`;
        try {
          send({ type: "token", text: `\n\n${userMsg}\n` });
          send({ type: "result", text: fullText + "\n\n" + userMsg });
          controller.enqueue(
            encoder.encode(
              `event: error\ndata: ${JSON.stringify({ error: msg, code, status })}\n\n`,
            ),
          );
          controller.enqueue(
            encoder.encode(
              `event: done\ndata: ${JSON.stringify({ sessionId: resolvedSessionId, exitCode: 1 })}\n\n`,
            ),
          );
          controller.close();
        } catch {}
      } finally {
        clearInterval(keepalive);
        try {
          await logTokenUsage({
            userId: chatUserId,
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          });
        } catch (e) {
          console.warn("[chat] failed to log token usage", e);
        }
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

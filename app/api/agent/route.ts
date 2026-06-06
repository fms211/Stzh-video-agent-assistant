import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

type AgentResponse = {
  requestId: string;
  createdAt: string;
  videoUrl?: string;
  imageUrls?: string[];
};

const hashToUint32 = (input: string) => {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
};

const buildTargetUrl = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed.endsWith("/api/agent")) return trimmed;
  return `${trimmed.replace(/\/$/, "")}/api/agent`;
};

const buildMockImageUrl = (prompt: string) => {
  const encodedPrompt = encodeURIComponent(prompt);
  return `https://coreva-normal.trae.ai/api/ide/v1/text_to_image?prompt=${encodedPrompt}&image_size=landscape_4_3`;
};

export async function POST(req: NextRequest) {
  const backendUrl = process.env.AGENT_BACKEND_URL;
  const contentType = req.headers.get("content-type") ?? "";

  let prompt = "";
  let history: unknown[] = [];
  let files: { name: string; type: string; size: number }[] = [];
  let bodyForForward: BodyInit | null = null;
  let forwardHeaders: Record<string, string> = {};

  if (contentType.includes("multipart/form-data")) {
    const fd = await req.formData();
    prompt = String(fd.get("prompt") ?? "").trim();
    try { history = JSON.parse(String(fd.get("history") ?? "[]")); } catch { history = []; }
    const rawFiles = fd.getAll("files");
    files = rawFiles
      .filter((f): f is File => f instanceof File)
      .map((f) => ({ name: f.name, type: f.type, size: f.size }));

    if (backendUrl) {
      const upstreamFd = new FormData();
      upstreamFd.append("prompt", prompt);
      upstreamFd.append("history", JSON.stringify(history));
      for (const raw of rawFiles) {
        if (raw instanceof File) upstreamFd.append("files", raw);
      }
      bodyForForward = upstreamFd;
    }
  } else {
    const body = await req.json().catch(() => null);
    prompt = body && typeof body === "object" && body !== null && "prompt" in body
      ? String((body as { prompt?: unknown }).prompt ?? "").trim()
      : "";
    history = Array.isArray((body as any)?.history) ? (body as any).history : [];

    if (backendUrl) {
      bodyForForward = JSON.stringify({ prompt, history });
      forwardHeaders["content-type"] = "application/json";
    }
  }

  // Forward to real backend
  if (backendUrl && bodyForForward) {
    const targetUrl = buildTargetUrl(backendUrl);
    const apiKey = process.env.AGENT_API_KEY;
    try {
      const upstream = await fetch(targetUrl, {
        method: "POST",
        headers: {
          accept: "application/json",
          ...(apiKey ? { "X-API-Key": apiKey } : {}),
          ...forwardHeaders,
        },
        body: bodyForForward,
      });
      const text = await upstream.text();
      return new NextResponse(text, {
        status: upstream.status,
        headers: { "content-type": upstream.headers.get("content-type") ?? "application/json" },
      });
    } catch (error) {
      return NextResponse.json(
        { error: { message: error instanceof Error ? error.message : "Failed to reach backend" } },
        { status: 502 },
      );
    }
  }

  // Mock mode — no backend configured
  const requestId = globalThis.crypto?.randomUUID?.() ?? String(Date.now());
  const createdAt = new Date().toISOString();

  if (/[视频vV]ideo/.test(prompt)) {
    return NextResponse.json({
      requestId, createdAt,
      videoUrl: "https://interactive-examples.mdn.mozilla.net/media/cc0-videos/flower.mp4",
    } satisfies AgentResponse);
  }

  const seed = hashToUint32(prompt || requestId);
  const basePrompt = prompt || "a landscape photo";
  const imageCount = files.length > 0 ? Math.min(3, files.length) : 6;
  return NextResponse.json({
    requestId, createdAt,
    imageUrls: Array.from({ length: imageCount }, (_, idx) => {
      const imgSeed = (seed + idx * 1013) % 100000;
      return buildMockImageUrl(`${basePrompt} (variant ${idx + 1}, seed ${imgSeed})`);
    }),
  } satisfies AgentResponse);
}

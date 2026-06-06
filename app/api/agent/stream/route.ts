import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const buildTargetUrl = (raw: string) => {
  const trimmed = raw.trim();
  if (trimmed.endsWith("/api/agent/stream")) return trimmed;
  return `${trimmed.replace(/\/$/, "")}/api/agent/stream`;
};

export async function POST(req: NextRequest) {
  const backendUrl = process.env.AGENT_BACKEND_URL;
  if (!backendUrl) {
    return NextResponse.json(
      { error: { message: "AGENT_BACKEND_URL not configured" } },
      { status: 503 }
    );
  }

  const apiKey = process.env.AGENT_API_KEY;
  const targetUrl = buildTargetUrl(backendUrl);

  try {
    const body = await req.json();
    const upstream = await fetch(targetUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { "X-API-Key": apiKey } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(10 * 60 * 1000),
    });

    if (!upstream.ok) {
      const text = await upstream.text().catch(() => "");
      return new NextResponse(text, {
        status: upstream.status,
        headers: { "content-type": "application/json" },
      });
    }

    // 转发 SSE 流
    if (!upstream.body) {
      return NextResponse.json(
        { error: { message: "No response body from backend" } },
        { status: 502 }
      );
    }

    return new NextResponse(upstream.body, {
      headers: {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        "Connection": "keep-alive",
        "X-Accel-Buffering": "no",
      },
    });
  } catch (error) {
    return NextResponse.json(
      { error: { message: error instanceof Error ? error.message : "Failed to reach backend" } },
      { status: 502 }
    );
  }
}

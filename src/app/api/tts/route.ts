import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";

// POST /api/tts
// body: { text: string, voice?: string }
// returns: audio/wav binary
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { text, voice } = body as { text?: string; voice?: string };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    // Truncate very long texts — TTS has practical limits and long monologues
    // are annoying anyway. ~600 chars ≈ 1 minute of speech.
    const truncated = text.slice(0, 1200);

    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: truncated,
      voice: voice || "tongtong",
      response_format: "wav",
      stream: false,
    });

    if (!response.ok) {
      console.error("[/api/tts] upstream error:", response.status);
      return NextResponse.json(
        { error: "TTS upstream failed" },
        { status: 502 }
      );
    }

    const arrayBuffer = await response.arrayBuffer();
    return new NextResponse(arrayBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(arrayBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/tts]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { preprocessForTTS } from "@/lib/aria/tts-preprocess";

export const runtime = "nodejs";

// POST /api/tts
// body: { text: string, voice?: string, speed?: number, raw?: boolean }
// returns: audio/wav binary
//
// speed: 0.5 - 2.0 (default 0.9 for warmer, more human cadence)
// raw: if true, skip preprocessing (useful for testing)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      voice,
      speed,
      raw,
    } = body as {
      text?: string;
      voice?: string;
      speed?: number;
      raw?: boolean;
    };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    // Preprocess — strip markdown, symbols, emoji, expand abbreviations.
    // This is the single biggest lever for "more human" TTS.
    const cleaned = raw ? text : preprocessForTTS(text);

    if (!cleaned.trim()) {
      return NextResponse.json(
        { error: "Nothing to speak after preprocessing" },
        { status: 422 }
      );
    }

    // Truncate very long texts — TTS has practical limits and long
    // monologues are annoying anyway. ~1200 chars ≈ 1 minute of speech.
    const truncated = cleaned.slice(0, 1200);

    // Clamp speed
    const safeSpeed =
      typeof speed === "number" && speed >= 0.5 && speed <= 2.0
        ? speed
        : 0.9; // default 0.9 — slightly slower = more human

    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: truncated,
      voice: voice || "tongtong", // only voice available in this API
      response_format: "wav",
      stream: false,
      speed: safeSpeed,
    });

    if (!response.ok) {
      console.error("[/api/tts] upstream error:", response.status);
      const errBody = await response.text().catch(() => "");
      return NextResponse.json(
        { error: `TTS upstream failed: ${errBody.slice(0, 200)}` },
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

import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { preprocessForTTS } from "@/lib/aria/tts-preprocess";
import {
  processVoice,
  VOICE_PRESETS,
  type VoicePreset,
} from "@/lib/aria/voice-process";

export const runtime = "nodejs";

// POST /api/tts
// body: {
//   text: string,
//   voice?: string,       // unused — only "tongtong" available
//   speed?: number,       // 0.5-2.0, default 0.9
//   preset?: VoicePreset, // "default" | "friday" | "warm" | "crisp" | "deep"
//   raw?: boolean         // skip preprocessing
// }
// returns: audio/wav binary (post-processed for the chosen preset)
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      text,
      voice,
      speed,
      preset,
      raw,
    } = body as {
      text?: string;
      voice?: string;
      speed?: number;
      preset?: VoicePreset;
      raw?: boolean;
    };

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json(
        { error: "text is required" },
        { status: 400 }
      );
    }

    // Preprocess — strip markdown, symbols, emoji, expand abbreviations.
    const cleaned = raw ? text : preprocessForTTS(text);

    if (!cleaned.trim()) {
      return NextResponse.json(
        { error: "Nothing to speak after preprocessing" },
        { status: 422 }
      );
    }

    // Truncate very long texts — ~1200 chars ≈ 1 minute of speech.
    const truncated = cleaned.slice(0, 1200);

    // Clamp speed
    const safeSpeed =
      typeof speed === "number" && speed >= 0.5 && speed <= 2.0
        ? speed
        : 0.9;

    // Validate preset
    const safePreset: VoicePreset =
      preset && preset in VOICE_PRESETS ? preset : "friday";

    const zai = await ZAI.create();
    const response = await zai.audio.tts.create({
      input: truncated,
      voice: voice || "tongtong",
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
    const inputBuffer = Buffer.from(arrayBuffer);

    // Apply voice post-processing (pitch shift, EQ, reverb) for the chosen
    // preset. This is how we get closer to a "Friday" voice even though
    // the underlying TTS only has one voice.
    let outputBuffer: Buffer;
    try {
      outputBuffer = await processVoice(inputBuffer, safePreset);
    } catch (procErr) {
      console.error("[/api/tts] voice processing failed, returning raw:", procErr);
      outputBuffer = inputBuffer;
    }

    return new NextResponse(outputBuffer, {
      status: 200,
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(outputBuffer.byteLength),
        "Cache-Control": "no-store",
        "X-Voice-Preset": safePreset,
      },
    });
  } catch (err) {
    console.error("[/api/tts]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

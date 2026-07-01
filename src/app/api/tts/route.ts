import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";
import { preprocessForTTS } from "@/lib/aria/tts-preprocess";
import { processVoice } from "@/lib/aria/voice-process";
import type { VoicePreset } from "@/lib/aria/voice-presets";

export const runtime = "nodejs";

interface TtsRequestBody {
  text: string;
  speed?: number;
  provider?: "zai" | "elevenlabs";
  voiceId?: string;
  apiKey?: string;
  preset?: VoicePreset;
  raw?: boolean;
}

// POST /api/tts — server-side TTS for providers that need it (zai, elevenlabs).
// Web Speech API runs client-side and never hits this route.
export async function POST(req: NextRequest) {
  try {
    const body = (await req.json()) as TtsRequestBody;
    const {
      text,
      speed,
      provider = "zai",
      voiceId,
      apiKey,
      preset,
      raw,
    } = body;

    if (!text || typeof text !== "string" || !text.trim()) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const cleaned = raw ? text : preprocessForTTS(text);
    if (!cleaned.trim()) {
      return NextResponse.json(
        { error: "Nothing to speak after preprocessing" },
        { status: 422 }
      );
    }
    const truncated = cleaned.slice(0, 1200);

    let audioBuffer: Buffer;
    let contentType = "audio/wav";

    if (provider === "elevenlabs") {
      if (!apiKey) {
        return NextResponse.json(
          { error: "ElevenLabs API key required. Add it in voice settings." },
          { status: 401 }
        );
      }
      const result = await synthesizeElevenLabs(
        truncated,
        apiKey,
        voiceId,
        speed
      );
      audioBuffer = result.buffer;
      contentType = result.contentType;
    } else {
      // Z.ai (default)
      const safeSpeed =
        typeof speed === "number" && speed >= 0.5 && speed <= 2.0 ? speed : 0.9;
      const safePreset: VoicePreset =
        preset && ["default", "friday", "warm", "crisp", "deep"].includes(preset)
          ? preset
          : "friday";

      const zai = await ZAI.create();
      const response = await zai.audio.tts.create({
        input: truncated,
        voice: "tongtong",
        response_format: "wav",
        stream: false,
        speed: safeSpeed,
      });

      if (!response.ok) {
        const errBody = await response.text().catch(() => "");
        return NextResponse.json(
          { error: `TTS upstream failed: ${errBody.slice(0, 200)}` },
          { status: 502 }
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      const inputBuffer = Buffer.from(arrayBuffer);

      try {
        audioBuffer = await processVoice(inputBuffer, safePreset);
      } catch {
        audioBuffer = inputBuffer;
      }
    }

    return new NextResponse(audioBuffer, {
      status: 200,
      headers: {
        "Content-Type": contentType,
        "Content-Length": String(audioBuffer.byteLength),
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    console.error("[/api/tts]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

// ElevenLabs TTS — requires API key from the user.
// Docs: https://elevenlabs.io/docs/api-reference/text-to-speech
async function synthesizeElevenLabs(
  text: string,
  apiKey: string,
  voiceId?: string,
  speed?: number
): Promise<{ buffer: Buffer; contentType: string }> {
  // Default to "Rachel" — a warm female voice — if no voiceId given
  const vId = voiceId || "21m00Tcm4TlvDq8ikWAM"; // Rachel
  const safeSpeed =
    typeof speed === "number" && speed >= 0.5 && speed <= 2.0 ? speed : 1.0;

  const res = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${vId}?output_format=mp3_44100_128`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        Accept: "audio/mpeg",
      },
      body: JSON.stringify({
        text,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
          style: 0.0,
          use_speaker_boost: true,
          speed: safeSpeed,
        },
      }),
    }
  );

  if (!res.ok) {
    const errBody = await res.text().catch(() => "");
    if (res.status === 401) {
      throw new Error("Invalid ElevenLabs API key");
    }
    throw new Error(`ElevenLabs error (${res.status}): ${errBody.slice(0, 200)}`);
  }

  const arrayBuffer = await res.arrayBuffer();
  return {
    buffer: Buffer.from(arrayBuffer),
    contentType: "audio/mpeg",
  };
}

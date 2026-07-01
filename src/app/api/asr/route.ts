import { NextRequest, NextResponse } from "next/server";
import ZAI from "z-ai-web-dev-sdk";

export const runtime = "nodejs";

// POST /api/asr
// body: { audio: string (base64-encoded audio data), format?: string }
// returns: { text: string }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { audio, format } = body as {
      audio?: string;
      format?: string;
    };

    if (!audio || typeof audio !== "string") {
      return NextResponse.json(
        { error: "audio (base64) is required" },
        { status: 400 }
      );
    }

    // Strip data URI prefix if present
    const base64 = audio.replace(/^data:[^;]+;base64,/, "");

    const zai = await ZAI.create();
    const response = await zai.audio.asr.create({
      file_base64: base64,
    });

    const text: string =
      (response as { text?: string })?.text ??
      (response as { choices?: { text?: string }[] })?.choices?.[0]?.text ??
      "";

    void format; // reserved for future format-specific handling

    if (!text) {
      return NextResponse.json(
        { error: "Could not transcribe audio" },
        { status: 422 }
      );
    }

    return NextResponse.json({ text });
  } catch (err) {
    console.error("[/api/asr]", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

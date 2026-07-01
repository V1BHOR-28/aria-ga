import { NextRequest, NextResponse } from "next/server";
import { createASR } from "@/lib/aria/zai-client";

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

    // Strip data URI prefix if present.
    let base64 = audio;
    const marker = ";base64,";
    const markerIdx = audio.indexOf(marker);
    if (markerIdx >= 0) {
      base64 = audio.slice(markerIdx + marker.length);
    }

    // Sanity check: base64 should only contain A-Z, a-z, 0-9, +, /, =, and whitespace
    if (!/^[A-Za-z0-9+/=\s]+$/.test(base64)) {
      console.error(
        "[/api/asr] not valid base64 — first 80 chars:",
        base64.slice(0, 80)
      );
      return NextResponse.json(
        { error: "Audio data is not valid base64" },
        { status: 400 }
      );
    }

    const response = await createASR({ file_base64: base64 });

    const text: string = response.text ?? "";
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

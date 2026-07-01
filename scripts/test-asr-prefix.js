// Test that /api/asr correctly strips data URI prefixes — including the
// codecs= variant that was causing the 400 error.
//
// We don't have a real audio file to transcribe, but we can at least verify
// that the prefix-stripping logic doesn't reject the input as bad base64.
// If the server returns a non-400 error (e.g. transcription failed), the
// prefix stripping worked.

const scenarios = [
  {
    name: "webm with codecs (the bug)",
    mime: "audio/webm;codecs=opus",
  },
  {
    name: "plain webm",
    mime: "audio/webm",
  },
  {
    name: "ogg with codecs",
    mime: "audio/ogg;codecs=opus",
  },
  {
    name: "mp4",
    mime: "audio/mp4",
  },
];

// Generate ~1KB of fake "audio" data (deterministic bytes).
const fakeBytes = new Uint8Array(1024);
for (let i = 0; i < fakeBytes.length; i++) {
  fakeBytes[i] = (i * 7 + 13) & 0xff;
}
let binary = "";
const CHUNK = 0x8000;
for (let i = 0; i < fakeBytes.length; i += CHUNK) {
  const slice = fakeBytes.subarray(i, Math.min(i + CHUNK, fakeBytes.length));
  binary += String.fromCharCode.apply(null, Array.from(slice));
}
const base64 = Buffer.from(binary, "binary").toString("base64");

async function run() {
  for (const s of scenarios) {
    const body = {
      audio: `data:${s.mime};base64,${base64}`,
      format: s.mime,
    };
    const res = await fetch("http://localhost:3000/api/asr", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const text = await res.text();
    let parsed;
    try { parsed = JSON.parse(text); } catch { parsed = text; }
    console.log(`\n[${s.name}]`);
    console.log(`  status: ${res.status}`);
    console.log(`  response: ${typeof parsed === "string" ? parsed.slice(0, 200) : JSON.stringify(parsed).slice(0, 200)}`);
    if (res.status === 400 && typeof parsed === "object" && parsed?.error?.includes("base64")) {
      console.log("  FAIL — base64 stripping broken");
    } else if (res.status === 400 && typeof parsed === "object" && parsed?.error?.includes("required")) {
      console.log("  FAIL — body parse issue");
    } else {
      console.log("  OK — prefix stripped correctly (got past base64 validation)");
    }
  }
}

run().catch(console.error);

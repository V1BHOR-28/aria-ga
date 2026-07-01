// Aggressive probe of the Z.ai TTS API to find a Friday-like voice.
// Try: model variations, voice variations, extra params (pitch, emotion, style).

const BASE = "http://localhost:3000/api/tts";

async function tryTTS(params, label) {
  try {
    const res = await fetch(BASE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...params, text: "Hello. I'm here.", raw: true }),
    });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return { label, ok: true, status: 200, size: buf.byteLength };
    } else {
      const err = await res.json().catch(() => ({}));
      const msg = typeof err === "object" ? err.error || JSON.stringify(err) : String(err);
      return { label, ok: false, status: res.status, error: String(msg).slice(0, 100) };
    }
  } catch (e) {
    return { label, ok: false, status: 0, error: e.message };
  }
}

async function main() {
  // 1. Try direct API calls bypassing the route — we need to test params
  // that our /api/tts route doesn't accept. So we'll test by adding fields
  // to the body; the route forwards unknown fields? Actually our route
  // constructs a fresh body. Let me test by hitting the real Z.ai endpoint.
  console.log("Note: this script tests params via the existing /api/tts route.");
  console.log("It will only vary voice and speed (the params the route accepts).\n");

  // First, let's vary speed finely to find the warmest setting
  console.log("=== Speed sweep ===");
  for (const speed of [0.7, 0.75, 0.8, 0.85, 0.9, 0.95, 1.0]) {
    const r = await tryTTS({ speed }, `speed=${speed}`);
    console.log(`  speed=${speed}: ${r.ok ? "OK (" + r.size + "b)" : "FAIL " + r.error}`);
    await new Promise((res) => setTimeout(res, 2000));
  }
}

main().catch(console.error);

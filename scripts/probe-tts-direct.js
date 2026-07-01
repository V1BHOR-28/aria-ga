// Probe the Z.ai TTS API directly to discover hidden parameters.
// The SDK body type only documents model/input/voice/stream/response_format/speed,
// but the API may accept more (pitch, emotion, style, etc).

const BASE_URL = "https://internal-api.z.ai/v1/audio/tts";
const HEADERS = {
  "Content-Type": "application/json",
  Authorization: "Bearer Z.ai",
  "X-Z-AI-From": "Z",
  "X-Chat-Id": "chat-6b3ec0a9-f820-4941-b2e6-7b40b6693c94",
  "X-User-Id": "4965a45e-1056-486a-be27-3a5cb0b94c86",
  "X-Token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJ1c2VyX2lkIjoiNDk2NWE0NWUtMTA1Ni00ODZhLWJlMjctM2E1Y2IwYjk0Yzg2IiwiY2hhdF9pZCI6ImNoYXQtNmIzZWMwYTktZjgyMC00OTQxLWIyZTYtN2I0MGI2NjkzYzk0IiwicGxhdGZvcm0iOiJ6YWkifQ.ablxuT5BqVy_W1esfXGyclUPbpOwwvELEHIULd46wgk",
};

async function tryParam(extra, label) {
  try {
    const body = {
      input: "Hello. I'm ARIA. Good to meet you.",
      voice: "tongtong",
      response_format: "wav",
      speed: 0.9,
      ...extra,
    };
    const res = await fetch(BASE_URL, {
      method: "POST",
      headers: HEADERS,
      body: JSON.stringify(body),
    });
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return { label, ok: true, size: buf.byteLength };
    } else {
      const text = await res.text();
      return { label, ok: false, status: res.status, error: text.slice(0, 120) };
    }
  } catch (e) {
    return { label, ok: false, status: 0, error: e.message };
  }
}

async function main() {
  const tests = [
    // Model variations — maybe there's a higher-quality model
    [{ model: "glm-tts" }, "model=glm-tts"],
    [{ model: "glm-tts-pro" }, "model=glm-tts-pro"],
    [{ model: "glm-tts-v2" }, "model=glm-tts-v2"],
    [{ model: "tts-1" }, "model=tts-1"],
    [{ model: "tts-1-hd" }, "model=tts-1-hd"],

    // Voice variations — try more names
    [{ voice: "tongtong-v2" }, "voice=tongtong-v2"],
    [{ voice: "tongtong-female" }, "voice=tongtong-female"],
    [{ voice: "tongtong-en" }, "voice=tongtong-en"],
    [{ voice: "qingxia" }, "voice=qingxia"],
    [{ voice: "qingqing" }, "voice=qingqing"],
    [{ voice: "yueyue" }, "voice=yueyue"],
    [{ voice: "yanqing" }, "voice=yanqing"],
    [{ voice: "nizi" }, "voice=nizi"],
    [{ voice: "qingqiu" }, "voice=qingqiu"],
    [{ voice: "xueling" }, "voice=xueling"],
    [{ voice: "wanqingxue" }, "voice=wanqingxue"],
    [{ voice: "wanxiang" }, "voice=wanxiang"],

    // Emotion/style parameters
    [{ emotion: "warm" }, "emotion=warm"],
    [{ emotion: "happy" }, "emotion=happy"],
    [{ style: "warm" }, "style=warm"],
    [{ style: "narration" }, "style=narration"],
    [{ mood: "warm" }, "mood=warm"],
    [{ tone: "warm" }, "tone=warm"],

    // Pitch — maybe the API supports it
    [{ pitch: 0.8 }, "pitch=0.8"],
    [{ pitch: -2 }, "pitch=-2"],
    [{ pitch_level: 0.5 }, "pitch_level=0.5"],

    // Volume / loudness
    [{ volume: 0.9 }, "volume=0.9"],
    [{ loudness: 0.9 }, "loudness=0.9"],

    // Sample rate
    [{ sample_rate: 22050 }, "sample_rate=22050"],
    [{ sample_rate: 48000 }, "sample_rate=48000"],

    // SSML?
    [{ ssml: true }, "ssml=true"],
    [{ input_format: "ssml" }, "input_format=ssml"],

    // Language
    [{ language: "en" }, "language=en"],
    [{ lang: "en" }, "lang=en"],
  ];

  console.log(`Probing ${tests.length} parameter combinations...\n`);

  for (const [params, label] of tests) {
    const r = await tryParam(params, label);
    if (r.ok) {
      console.log(`  [OK ] ${label.padEnd(35)} ${r.size}b`);
    } else {
      // Only print errors that aren't "voice doesn't exist" or 429
      const err = (r.error || "").toLowerCase();
      if (!err.includes("音色不存在") && !err.includes("429") && !err.includes("too many requests")) {
        console.log(`  [ERR] ${label.padEnd(35)} ${r.status} ${err.slice(0, 80)}`);
      } else if (err.includes("音色不存在")) {
        console.log(`  [---] ${label.padEnd(35)} voice doesn't exist`);
      } else {
        console.log(`  [429] ${label.padEnd(35)} rate limited`);
      }
    }
    await new Promise((res) => setTimeout(res, 2000));
  }
}

main().catch(console.error);

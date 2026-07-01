// Test voices one at a time with long delays to avoid rate limits.
// Only test the candidates that haven't already returned "voice doesn't exist".

const VOICES_TO_TRY = [
  "tongtong",   // confirmed default — sanity check
  "yifeng",     // male, common
  "jiantao",    // male
  "xiaoyu",     // female-sounding
  "yunxi",      // Alibaba-style name
  "xiaoxiao",   // Microsoft Azure name
  "yunyang",    // Microsoft Azure name
  "xiaoyi",     // common
  "yaoyao",     // female-sounding
  "yuanqi",     // male
  "guiji",      // rare
];

async function tryVoice(voice) {
  const start = Date.now();
  try {
    const res = await fetch("http://localhost:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Hey, I'm glad you asked. Let me think about that for a second.",
        voice,
        speed: 0.9,
      }),
    });
    const elapsed = Date.now() - start;
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return { voice, ok: true, status: res.status, size: buf.byteLength, elapsed };
    } else {
      const errText = await res.json().catch(() => ({}));
      return {
        voice,
        ok: false,
        status: res.status,
        error: typeof errText === "object" ? (errText.error || JSON.stringify(errText)).slice(0, 100) : String(errText).slice(0, 100),
        elapsed,
      };
    }
  } catch (e) {
    return { voice, ok: false, status: 0, error: e.message, elapsed: Date.now() - start };
  }
}

async function main() {
  console.log(`Testing ${VOICES_TO_TRY.length} voices (3s delay between each)...\n`);
  const results = [];
  for (const v of VOICES_TO_TRY) {
    const r = await tryVoice(v);
    const mark = r.ok ? "OK " : "FAIL";
    const detail = r.ok
      ? `${r.size}b in ${r.elapsed}ms`
      : `(${r.status}) ${r.error}`;
    console.log(`  [${mark}] ${r.voice.padEnd(15)} ${detail}`);
    results.push(r);
    await new Promise((r) => setTimeout(r, 3000));
  }
  console.log("\n=== Working voices ===");
  const working = results.filter((r) => r.ok);
  for (const r of working) {
    console.log(`  - ${r.voice}  (${r.size}b, ${r.elapsed}ms)`);
  }
}

main().catch(console.error);

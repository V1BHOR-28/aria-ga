// Test which TTS voices are available in the z-ai-web-dev-sdk.
// We try a list of common voice names and report which ones return 200.

const VOICES_TO_TRY = [
  // Common Chinese TTS voice names (pinyin)
  "tongtong",    // default
  "yifeng",
  "yifan",
  "xueyuan",
  "yangyang",
  "jingjing",
  "jiantao",
  "xiaoyu",
  "yunxi",
  "xiaoxiao",
  "yunyang",
  "xiaoyi",
  "guiji",
  "yuanqi",
  "yaoyao",
  // English-ish names that might exist
  "emma",
  "olivia",
  "sophia",
  "ava",
  "charlotte",
  "mia",
  "amelia",
  "harper",
  "ella",
  "luna",
  // Friday-themed names just in case
  "friday",
  "jarvis",
  // Generic
  "female",
  "male",
  "default",
  "warm",
];

async function tryVoice(voice) {
  const start = Date.now();
  try {
    const res = await fetch("http://localhost:3000/api/tts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: "Hello, I am ARIA. It is good to meet you.",
        voice,
      }),
    });
    const elapsed = Date.now() - start;
    if (res.ok) {
      const buf = await res.arrayBuffer();
      return { voice, ok: true, status: res.status, size: buf.byteLength, elapsed };
    } else {
      const err = await res.json().catch(() => ({}));
      return {
        voice,
        ok: false,
        status: res.status,
        error: typeof err === "object" ? err.error : JSON.stringify(err).slice(0, 120),
        elapsed,
      };
    }
  } catch (e) {
    return { voice, ok: false, status: 0, error: e.message, elapsed: Date.now() - start };
  }
}

async function main() {
  console.log(`Testing ${VOICES_TO_TRY.length} voices...\n`);
  const results = [];
  // Run in parallel batches of 4 to avoid rate limits
  const BATCH = 4;
  for (let i = 0; i < VOICES_TO_TRY.length; i += BATCH) {
    const batch = VOICES_TO_TRY.slice(i, i + BATCH);
    const batchResults = await Promise.all(batch.map(tryVoice));
    results.push(...batchResults);
    // Log as we go
    for (const r of batchResults) {
      const mark = r.ok ? "OK " : "FAIL";
      const detail = r.ok
        ? `${r.size}b in ${r.elapsed}ms`
        : `(${r.status}) ${(r.error || "").slice(0, 80)}`;
      console.log(`  [${mark}] ${r.voice.padEnd(15)} ${detail}`);
    }
    // Small delay between batches
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log("\n=== Working voices ===");
  const working = results.filter((r) => r.ok);
  for (const r of working) {
    console.log(`  - ${r.voice}  (${r.size}b, ${r.elapsed}ms)`);
  }
  console.log(`\n${working.length} of ${results.length} voices worked.`);
}

main().catch(console.error);

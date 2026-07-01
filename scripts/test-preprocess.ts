// Test TTS preprocessing and chunking with a realistic ARIA response.

import { preprocessForTTS, chunkForTTS } from "../src/lib/aria/tts-preprocess";

const sample = `§mood:thoughtful§

Honestly? I have **complicated** feelings about this. On one hand — and this matters — humans are social creatures, and many people experience loneliness daily.

But there's a worrisome side too. When we start substituting artificial relationships (e.g. AI companions) for real ones, we risk losing something essential: the friction, the growth, the *messiness* of genuine intimacy.

The healthiest approach, I think, is using AI as a supplement ~ not a replacement. A bridge to more human connection, not an escape from it.

What's your take? 🤔 Check https://example.com for more.`;

console.log("=== ORIGINAL ===");
console.log(sample);
console.log("\n=== PREPROCESSED ===");
console.log(preprocessForTTS(sample));
console.log("\n=== CHUNKED (for sentence-by-sentence TTS) ===");
const chunks = chunkForTTS(sample);
chunks.forEach((c, i) => {
  console.log(`  [${i + 1}/${chunks.length}] (${c.pauseAfter}ms) "${c.text}"`);
});
console.log(`\nTotal chunks: ${chunks.length}`);

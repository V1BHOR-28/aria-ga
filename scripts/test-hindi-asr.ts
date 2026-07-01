// Round-trip test: generate Hindi audio with TTS, then feed it to ASR.
// This verifies that Hindi voice input will work when the user speaks Hindi.

import ZAI from "z-ai-web-dev-sdk";
import { writeFile, readFile } from "fs/promises";

async function main() {
  const zai = await ZAI.create();

  // Step 1: Generate Hindi audio with TTS
  const hindiText = "नमस्ते, मैं एरिया हूँ। आप कैसे हैं?";
  console.log("Step 1: Generating Hindi audio with TTS...");
  console.log(`  Text: ${hindiText}`);

  const ttsRes = await zai.audio.tts.create({
    input: hindiText,
    voice: "tongtong",
    response_format: "wav",
    stream: false,
    speed: 1.0,
  });

  if (!ttsRes.ok) {
    console.error("TTS failed:", ttsRes.status);
    process.exit(1);
  }

  const audioBuffer = Buffer.from(await ttsRes.arrayBuffer());
  console.log(`  Audio: ${audioBuffer.length} bytes`);
  await writeFile("/tmp/hindi-test.wav", audioBuffer);

  // Step 2: Feed the audio back to ASR
  console.log("\nStep 2: Feeding audio to ASR (speech-to-text)...");

  // Test 1: Default (no language hint)
  console.log("\n  Test A: No language hint (auto-detect)");
  const base64 = audioBuffer.toString("base64");
  try {
    const resultA = await zai.audio.asr.create({
      file_base64: base64,
    });
    console.log("  Result:", JSON.stringify(resultA).slice(0, 300));
  } catch (e) {
    console.log("  Error:", e.message);
  }

  await new Promise((r) => setTimeout(r, 3000));

  // Test 2: With language hint
  console.log("\n  Test B: With language=hi hint");
  try {
    const resultB = await zai.audio.asr.create({
      file_base64: base64,
      language: "hi",
    } as any);
    console.log("  Result:", JSON.stringify(resultB).slice(0, 300));
  } catch (e) {
    console.log("  Error:", e.message);
  }

  await new Promise((r) => setTimeout(r, 3000));

  // Test 3: With model variations
  console.log("\n  Test C: With model=whisper-large");
  try {
    const resultC = await zai.audio.asr.create({
      file_base64: base64,
      model: "whisper-large",
    } as any);
    console.log("  Result:", JSON.stringify(resultC).slice(0, 300));
  } catch (e) {
    console.log("  Error:", e.message);
  }

  console.log("\nDone. Compare the transcriptions to the original Hindi text.");
}

main().catch(console.error);

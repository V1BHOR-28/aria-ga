// Test the voice processing by generating one TTS sample and running it
// through each preset. Save outputs to /home/z/my-project/download/voices/
// so we can listen to them.

import { mkdtemp, mkdir, writeFile, rm, readFile } from "fs/promises";
import { join } from "path";
import { tmpdir } from "os";
import { spawn } from "child_process";
import ZAI from "z-ai-web-dev-sdk";
import {
  VOICE_PRESETS,
  processVoice,
  type VoicePreset,
} from "../src/lib/aria/voice-process";

const OUT_DIR = "/home/z/my-project/download/voices";

async function generateSample(): Promise<Buffer> {
  const zai = await ZAI.create();
  const res = await zai.audio.tts.create({
    input:
      "Hey. I'm ARIA. I'm here to think with you, not just answer for you. So, what's on your mind today?",
    voice: "tongtong",
    response_format: "wav",
    stream: false,
    speed: 0.9,
  });
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function main() {
  await mkdir(OUT_DIR, { recursive: true });

  console.log("Generating TTS sample...");
  const sample = await generateSample();
  console.log(`  sample size: ${sample.length} bytes`);
  await writeFile(join(OUT_DIR, "00-original.wav"), sample);

  const presets: VoicePreset[] = ["default", "friday", "warm", "crisp", "deep"];

  for (const preset of presets) {
    console.log(`\nProcessing preset: ${preset}`);
    const cfg = VOICE_PRESETS[preset];
    console.log(`  config: pitch=${cfg.pitch}, tempo=${cfg.tempo}, reverb=${cfg.reverb}, bass=${cfg.bass}, treble=${cfg.treble}`);
    try {
      const processed = await processVoice(sample, preset);
      const outPath = join(OUT_DIR, `${preset}.wav`);
      await writeFile(outPath, processed);
      console.log(`  saved: ${outPath} (${processed.length} bytes)`);
    } catch (e) {
      console.error(`  FAILED: ${e.message}`);
    }
  }

  console.log("\nDone. Audio files saved to:");
  console.log(`  ${OUT_DIR}/`);
  console.log("  00-original.wav  — raw tongtong");
  console.log("  default.wav      — same as original");
  console.log("  friday.wav       — Friday-style (lower, warmer, slight reverb)");
  console.log("  warm.wav         — Soft intimate");
  console.log("  crisp.wav        — Bright and clear");
  console.log("  deep.wav         — Lower and slower");
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

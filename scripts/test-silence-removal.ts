// Test silence removal — generate TTS, process, and measure silence
// before and after processing to verify pauses are being trimmed.

import ZAI from "z-ai-web-dev-sdk";
import { processVoice } from "../src/lib/aria/voice-process";
import { writeFile } from "fs/promises";
import { execSync } from "child_process";

async function main() {
  const zai = await ZAI.create();
  const text = "Hey, I am ARIA. I am here to think with you — not just answer for you. So, what is on your mind today?";
  const res = await zai.audio.tts.create({
    input: text,
    voice: "tongtong",
    response_format: "wav",
    stream: false,
    speed: 0.95,
  });
  const raw = Buffer.from(await res.arrayBuffer());
  await writeFile("/tmp/raw.wav", raw);

  const processed = await processVoice(raw, "friday");
  await writeFile("/tmp/processed.wav", processed);

  console.log("=== RAW TTS ===");
  console.log("Duration:", execSync("ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/raw.wav").toString().trim());
  console.log("Silence periods (>50ms below -40dB):");
  try {
    const out = execSync(
      "ffmpeg -i /tmp/raw.wav -af silencedetect=n=-40dB:d=0.05 -f null - 2>&1"
    ).toString();
    const starts = (out.match(/silence_start: [\d.]+/g) || []);
    const ends = (out.match(/silence_end: [\d.]+/g) || []);
    for (let i = 0; i < starts.length; i++) {
      const s = parseFloat(starts[i].split(": ")[1]);
      const e = parseFloat((ends[i] || "").split(": ")[1] || "0");
      console.log(`  pause ${i + 1}: ${s.toFixed(2)}s → ${e.toFixed(2)}s (${((e - s) * 1000).toFixed(0)}ms)`);
    }
    if (starts.length === 0) console.log("  (none detected)");
  } catch (e) { console.log("  error:", e.message); }

  console.log("\n=== PROCESSED (Friday preset) ===");
  console.log("Duration:", execSync("ffprobe -v error -show_entries format=duration -of csv=p=0 /tmp/processed.wav").toString().trim());
  console.log("Silence periods (>50ms below -40dB):");
  try {
    const out = execSync(
      "ffmpeg -i /tmp/processed.wav -af silencedetect=n=-40dB:d=0.05 -f null - 2>&1"
    ).toString();
    const starts = (out.match(/silence_start: [\d.]+/g) || []);
    const ends = (out.match(/silence_end: [\d.]+/g) || []);
    for (let i = 0; i < starts.length; i++) {
      const s = parseFloat(starts[i].split(": ")[1]);
      const e = parseFloat((ends[i] || "").split(": ")[1] || "0");
      console.log(`  pause ${i + 1}: ${s.toFixed(2)}s → ${e.toFixed(2)}s (${((e - s) * 1000).toFixed(0)}ms)`);
    }
    if (starts.length === 0) console.log("  (none detected — all pauses < 50ms)");
  } catch (e) { console.log("  error:", e.message); }

  console.log("\n=== VOLUME ===");
  const rawVol = execSync("ffmpeg -i /tmp/raw.wav -af volumedetect -f null - 2>&1").toString();
  const procVol = execSync("ffmpeg -i /tmp/processed.wav -af volumedetect -f null - 2>&1").toString();
  const rawMean = rawVol.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)?.[1];
  const rawMax = rawVol.match(/max_volume:\s*(-?[\d.]+)\s*dB/)?.[1];
  const procMean = procVol.match(/mean_volume:\s*(-?[\d.]+)\s*dB/)?.[1];
  const procMax = procVol.match(/max_volume:\s*(-?[\d.]+)\s*dB/)?.[1];
  console.log(`Raw:   mean ${rawMean} dB, max ${rawMax} dB`);
  console.log(`Proc:  mean ${procMean} dB, max ${procMax} dB`);
}

main().catch(console.error);

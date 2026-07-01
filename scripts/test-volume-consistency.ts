// Test that the Friday voice produces consistent loudness across different
// text samples — short, long, with lots of punctuation, etc.

import ZAI from "z-ai-web-dev-sdk";
import { processVoice } from "../src/lib/aria/voice-process";
import { spawn } from "child_process";
import { mkdtemp, writeFile, rm } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";

async function generateTTS(text: string): Promise<Buffer> {
  const zai = await ZAI.create();
  const res = await zai.audio.tts.create({
    input: text,
    voice: "tongtong",
    response_format: "wav",
    stream: false,
    speed: 0.95,
  });
  const ab = await res.arrayBuffer();
  return Buffer.from(ab);
}

async function analyzeVolume(buffer: Buffer, label: string) {
  const dir = await mkdtemp(join(tmpdir(), "vol-"));
  const file = join(dir, "test.wav");
  await writeFile(file, buffer);

  return new Promise<{ label: string; mean: string; max: string; duration: string }>((resolve, reject) => {
    const proc = spawn("ffmpeg", [
      "-i", file,
      "-af", "volumedetect",
      "-f", "null", "-",
    ], { stdio: ["ignore", "pipe", "pipe"] });
    let stderr = "";
    proc.stderr.on("data", (d) => (stderr += d.toString()));
    proc.on("close", () => {
      rm(dir, { recursive: true, force: true }).catch(() => {});
      const meanMatch = stderr.match(/mean_volume:\s*(-?\d+\.?\d*)\s*dB/);
      const maxMatch = stderr.match(/max_volume:\s*(-?\d+\.?\d*)\s*dB/);
      const durMatch = stderr.match(/Duration:\s*(\d+:\d+:\d+\.\d+)/);
      resolve({
        label,
        mean: meanMatch ? `${meanMatch[1]} dB` : "?",
        max: maxMatch ? `${maxMatch[1]} dB` : "?",
        duration: durMatch ? durMatch[1] : "?",
      });
    });
    proc.on("error", reject);
  });
}

async function main() {
  const samples = [
    {
      label: "Short (1 sentence)",
      text: "Hey.",
    },
    {
      label: "Medium (2 sentences, comma)",
      text: "Hey, I'm ARIA. Good to meet you.",
    },
    {
      label: "Long (4 sentences, lots of punctuation)",
      text: "Hey, I'm ARIA. I'm here to think with you — not just answer for you. So, what's on your mind today? Tell me anything.",
    },
    {
      label: "Question heavy",
      text: "What do you think? Why does that matter? How can I help?",
    },
    {
      label: "Single word",
      text: "Yes.",
    },
  ];

  console.log("Generating TTS + processing with new Friday preset...\n");
  console.log("Sample".padEnd(35) + "Mean".padEnd(12) + "Max".padEnd(12) + "Duration");
  console.log("-".repeat(75));

  for (const s of samples) {
    try {
      const raw = await generateTTS(s.text);
      const processed = await processVoice(raw, "friday");
      const analysis = await analyzeVolume(processed, s.label);
      console.log(
        s.label.padEnd(35) +
        analysis.mean.padEnd(12) +
        analysis.max.padEnd(12) +
        analysis.duration
      );
    } catch (e) {
      console.log(`${s.label.padEnd(35)} FAILED: ${e.message}`);
    }
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log("\nGoal: mean volume should be consistent across all samples (~-15 to -20 dB)");
  console.log("     max should be close to -1 to -3 dB (limiter ceiling)");
}

main().catch(console.error);

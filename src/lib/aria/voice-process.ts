// ARIA — Voice post-processing (SERVER ONLY)
//
// The Z.ai TTS API only has one voice ("tongtong"). To get closer to a
// Friday-from-Iron-Man sound, we post-process the audio with ffmpeg's
// rubberband filter: lower the pitch, preserve formants (so it stays
// female, not mannish), and add subtle reverb for an intimate feel.
//
// This module uses Node.js APIs (child_process, fs) and must NOT be
// imported from client components. Import preset definitions from
// voice-presets.ts instead.

import { spawn } from "child_process";
import { tmpdir } from "os";
import { join } from "path";
import { mkdtemp, readFile, rm, writeFile } from "fs/promises";
import { VOICE_PRESETS, type VoicePreset } from "./voice-presets";

export { VOICE_PRESETS, type VoicePreset };

/**
 * Post-process TTS audio using ffmpeg with rubberband for pitch shifting.
 * Returns a Buffer of WAV audio.
 *
 * Pitch shifting uses rubberband's "preserve formant" mode so the voice
 * stays female (formants preserved) even when pitched down.
 */
export async function processVoice(
  inputBuffer: Buffer,
  preset: VoicePreset = "friday"
): Promise<Buffer> {
  const cfg = VOICE_PRESETS[preset] ?? VOICE_PRESETS.friday;

  // Default preset = no processing
  if (
    preset === "default" ||
    (cfg.pitch === 0 &&
      cfg.tempo === 1.0 &&
      cfg.reverb === 0 &&
      cfg.treble === 0 &&
      cfg.bass === 0 &&
      cfg.gain === 0)
  ) {
    return inputBuffer;
  }

  const workDir = await mkdtemp(join(tmpdir(), "aria-voice-"));
  const inputFile = join(workDir, "input.wav");
  const outputFile = join(workDir, "output.wav");

  try {
    await writeFile(inputFile, inputBuffer);

    const args = [
      "-y",
      "-i", inputFile,
      "-af", buildFilterChain(cfg),
      "-ar", "24000",
      "-ac", "1",
      outputFile,
    ];

    await runFfmpeg(args);

    const output = await readFile(outputFile);
    return output;
  } finally {
    await rm(workDir, { recursive: true, force: true }).catch(() => {});
  }
}

function buildFilterChain(cfg: typeof VOICE_PRESETS["friday"]): string {
  const filters: string[] = [];

  // 1. Pitch shift + tempo via rubberband (formant-preserving)
  //    transients=crisp preserves transient sounds at punctuation boundaries
  //    instead of smearing across them (fixes "stuck on punctuations").
  if (cfg.pitch !== 0 || cfg.tempo !== 1.0) {
    const pitchMult = Math.pow(2, cfg.pitch / 12);
    const tempoMult = cfg.tempo;
    filters.push(
      `rubberband=tempo=${tempoMult.toFixed(4)}:pitch=${pitchMult.toFixed(4)}:formant=preserved:transients=crisp:phase=laminar:channels=together:pitchq=quality`
    );
  }

  // 2. EQ: bass + treble
  if (cfg.bass !== 0) {
    filters.push(`bass=f=200:gain=${cfg.bass}`);
  }
  if (cfg.treble !== 0) {
    filters.push(`treble=f=4000:gain=${cfg.treble}`);
  }

  // 3. Reverb — aecho with short delays and decays for a small room feel
  if (cfg.reverb > 0) {
    const mix = cfg.reverb / 100;
    const inGain = 1 - mix * 0.3;
    const outGain = mix * 0.6;
    filters.push(
      `aecho=${inGain.toFixed(3)}:${outGain.toFixed(3)}:30|45|60:0.3|0.2|0.15`
    );
  }

  // 4. Trim excessive pauses at punctuation.
  //    The TTS engine generates natural pauses at commas/periods, and the
  //    rubberband tempo stretch lengthens them. silenceremove detects
  //    silence below -40dB and caps each pause at 120ms — so punctuation
  //    still gets a natural micro-pause but not a long gap.
  //    window_samples=82 (~3ms at 24kHz) for precise detection.
  filters.push(
    "silenceremove=window=0.03:stop_periods=-1:stop_silence=0.12:stop_threshold=-40dB:detection=peak"
  );

  // 5. Gain
  if (cfg.gain !== 0) {
    filters.push(`volume=${cfg.gain > 0 ? "+" : ""}${cfg.gain}dB`);
  }

  // 6. Compressor — reduces dynamic range so quiet and loud passages
  //    are closer in volume. This is the key to consistent loudness.
  //
  //    compand params:
  //    - attacks=0:decays=100ms (fast attack, smooth release)
  //    - points: -80/-80|-60/-30|-40/-20|-20/-12|0/-3
  //      Below -60dB: leave alone (silence / background noise)
  //      -60→-30: huge boost (very quiet speech → audible)
  //      -40→-20: boost (quiet speech → normal)
  //      -20→-12: slight boost (normal speech → louder)
  //      0→-3: slight attenuation (loud peaks → controlled)
  filters.push(
    "compand=attacks=0:decays=0.1:points=-80/-80|-60/-30|-40/-20|-20/-12|0/-3:soft-knee=6"
  );

  // 7. Loudness normalization (single-pass mode).
  //    loudnorm measures the integrated loudness and adjusts to a target.
  //    I=-16 LUFS is broadcast standard for speech. TP=-1.5 is true-peak
  //    ceiling. LRA=11 is the loudness range target.
  //    Single-pass mode (no second measurement file needed) is less
  //    precise than two-pass but works fine for TTS and is fast.
  filters.push("loudnorm=I=-16:TP=-1.5:LRA=11:print_format=none");

  return filters.join(",");
}

function runFfmpeg(args: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const proc = spawn("ffmpeg", args, {
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stderr = "";
    proc.stderr.on("data", (d) => {
      stderr += d.toString();
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`ffmpeg exited ${code}: ${stderr.slice(-500)}`));
    });
  });
}

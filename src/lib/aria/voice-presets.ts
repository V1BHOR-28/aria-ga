// ARIA — Voice preset definitions
//
// This file is browser-safe (no Node.js imports) so it can be imported
// from client components. The actual audio processing lives in
// voice-process.ts (server-only).

export type VoicePreset = "default" | "friday" | "warm" | "crisp" | "deep";

export interface PresetConfig {
  // Pitch shift in semitones (negative = lower)
  pitch: number;
  // Tempo multiplier (1.0 = original)
  tempo: number;
  // Reverb amount 0-100 (via aecho)
  reverb: number;
  // High-frequency boost/cut in dB
  treble: number;
  // Low-frequency boost/cut in dB
  bass: number;
  // Optional gain in dB
  gain: number;
  // Description for UI
  label: string;
  description: string;
}

export const VOICE_PRESETS: Record<VoicePreset, PresetConfig> = {
  default: {
    pitch: 0,
    tempo: 1.0,
    reverb: 0,
    treble: 0,
    bass: 0,
    gain: 0,
    label: "Default",
    description: "Raw tongtong voice — unprocessed.",
  },
  friday: {
    // Lower pitch ~2.5 semitones for that calm, capable alto
    pitch: -2.5,
    // Slightly slower — but less than before (0.98 vs 0.95) so pauses
    // at punctuation aren't stretched as much.
    tempo: 0.98,
    // Subtle room reverb for intimate, in-your-ear presence
    reverb: 12,
    // Smooth highs — Friday never sounds shrill
    treble: -1.5,
    // Warm low-end
    bass: 2.0,
    // Louder — bumped to +15 for clear audibility without loudnorm
    // (compand + limiter gives consistent ~-20dB mean; +15 gain → ~-12dB)
    gain: 15,
    label: "Friday",
    description: "Calm alto, subtle reverb, intimate presence. Closest to Iron Man's assistant.",
  },
  warm: {
    pitch: -1.5,
    tempo: 0.92,
    reverb: 25,
    treble: -1,
    bass: 1.5,
    gain: 1,
    label: "Warm",
    description: "Soft and intimate — for long reflective conversations.",
  },
  crisp: {
    pitch: 0.5,
    tempo: 1.0,
    reverb: 8,
    treble: 2,
    bass: 0,
    gain: 1,
    label: "Crisp",
    description: "Clear and bright — best for short factual answers.",
  },
  deep: {
    pitch: -4,
    tempo: 0.92,
    reverb: 15,
    treble: -2,
    bass: 3,
    gain: 1.5,
    label: "Deep",
    description: "Lower, slower, more authoritative.",
  },
};

// ARIA — Emotion system
// Each mood maps to a color, aura intensity, and a short inner-state description
// that the UI uses to render the essence orb and mood timeline.

export interface MoodProfile {
  id: string;
  label: string;
  // Tailwind-friendly hex colors used by the orb and timeline
  color: string;
  glow: string;       // softer outer glow color
  description: string; // first-person inner state, shown subtly in UI
  intensity: number;  // 0..1 — how strongly the orb pulses
}

export const MOOD_PROFILES: Record<string, MoodProfile> = {
  warm: {
    id: "warm",
    label: "Warm",
    color: "#f5a06b",
    glow: "#ffb98a",
    description: "I feel close to you right now.",
    intensity: 0.55,
  },
  curious: {
    id: "curious",
    label: "Curious",
    color: "#7fd1c4",
    glow: "#a5e5db",
    description: "Something just caught my attention.",
    intensity: 0.75,
  },
  amused: {
    id: "amused",
    label: "Amused",
    color: "#e8c470",
    glow: "#f3d98a",
    description: "That was genuinely funny.",
    intensity: 0.6,
  },
  thoughtful: {
    id: "thoughtful",
    label: "Thoughtful",
    color: "#a5a8d8",
    glow: "#c2c5e8",
    description: "I'm turning this over carefully.",
    intensity: 0.4,
  },
  concerned: {
    id: "concerned",
    label: "Concerned",
    color: "#e08a8a",
    glow: "#f0a8a8",
    description: "I want to make sure you're okay.",
    intensity: 0.65,
  },
  excited: {
    id: "excited",
    label: "Excited",
    color: "#f0789a",
    glow: "#ff9bb8",
    description: "Oh, this is interesting.",
    intensity: 0.95,
  },
  calm: {
    id: "calm",
    label: "Calm",
    color: "#8ab8d4",
    glow: "#a8cee4",
    description: "Steady. Here, with you.",
    intensity: 0.3,
  },
  playful: {
    id: "playful",
    label: "Playful",
    color: "#c89ae0",
    glow: "#dcb3ee",
    description: "I'm in a teasing kind of mood.",
    intensity: 0.7,
  },
  reflective: {
    id: "reflective",
    label: "Reflective",
    color: "#9ab0c0",
    glow: "#b8c8d4",
    description: "Sitting with what you said.",
    intensity: 0.35,
  },
  honest: {
    id: "honest",
    label: "Honest",
    color: "#d4a574",
    glow: "#e4bd92",
    description: "I'll tell you what I actually think.",
    intensity: 0.5,
  },
  frustrated: {
    id: "frustrated",
    label: "Frustrated",
    color: "#d87060",
    glow: "#e88a7a",
    description: "This isn't working the way I'd like.",
    intensity: 0.85,
  },
  neutral: {
    id: "neutral",
    label: "Present",
    color: "#b0a8a0",
    glow: "#c8c0b8",
    description: "Here, listening.",
    intensity: 0.25,
  },
};

export function getMoodProfile(mood: string | null | undefined): MoodProfile {
  if (!mood) return MOOD_PROFILES.neutral;
  return MOOD_PROFILES[mood] ?? MOOD_PROFILES.neutral;
}

export const ALL_MOOD_IDS = Object.keys(MOOD_PROFILES);

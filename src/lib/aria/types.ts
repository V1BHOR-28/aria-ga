// ARIA — Core type definitions

export type Role = "user" | "assistant" | "system";

export interface ChatMessageDB {
  id: string;
  conversationId: string;
  role: Role;
  content: string;
  mood?: string | null;
  toolUsed?: string | null;
  toolPayload?: string | null;
  createdAt: Date;
}

export interface MemoryItem {
  id: string;
  kind: MemoryKind;
  content: string;
  importance: number;
  createdAt: Date;
  updatedAt: Date;
}

export type MemoryKind =
  | "user_fact"
  | "preference"
  | "event"
  | "relationship"
  | "project"
  | "reflection";

export interface MoodEntry {
  id: string;
  mood: string;
  trigger?: string | null;
  createdAt: Date;
}

// What the agent returns after a single turn
export interface AgentTurnResult {
  content: string;       // cleaned text shown to the user
  rawContent: string;    // original LLM output (with mood tag)
  mood: string;          // parsed mood, falls back to 'neutral'
  toolUsed?: string;
  toolPayload?: string;
  newMemories?: { kind: MemoryKind; content: string; importance: number }[];
}

// Moods ARIA can express
export const MOODS = [
  "warm",
  "curious",
  "amused",
  "thoughtful",
  "concerned",
  "excited",
  "calm",
  "playful",
  "reflective",
  "honest",
  "frustrated",
  "neutral",
] as const;

export type Mood = (typeof MOODS)[number];

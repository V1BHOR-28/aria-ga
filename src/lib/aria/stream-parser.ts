// ARIA — Incremental stream parser
//
// The LLM output looks like:
//   §mood:curious§
//   Some visible text ...
//   §memory:user_fact|Some fact|7§
//   more visible text §memory:project|X|5§
//
// When streaming token-by-token, we can't just regex the whole string at
// once — we have to hold back any text that *might* be the start of a
// §...§ tag until we know whether it completes into one. This module does
// that incrementally so the caller can display/speak text as it arrives
// without ever leaking a raw tag to the user.

import type { MemoryKind } from "./types";

export interface StreamMemory {
  kind: MemoryKind;
  content: string;
  importance: number;
}

const MOOD_PREFIX_RE = /^\s*§\s*mood\s*:\s*([a-z]+)\s*§\s*/i;
// Matches one *complete* memory tag anywhere in the buffer.
const MEMORY_TAG_RE = /§\s*memory\s*:\s*([a-z_]+)\s*\|([^|]*)\|(\d+)\s*§/gi;

export interface AriaStreamParser {
  /** Feed a raw token/delta from the LLM. Returns newly-safe-to-show text (may be ""). */
  push(token: string): string;
  /** Call once the stream ends. Returns any remaining safe text. */
  flush(): string;
  getMood(): string;
  getMemories(): StreamMemory[];
}

export function createAriaStreamParser(): AriaStreamParser {
  let buffer = "";
  let moodExtracted = false;
  let mood = "neutral";
  const memories: StreamMemory[] = [];

  function extractMemories() {
    buffer = buffer.replace(MEMORY_TAG_RE, (_full, kind, content, importance) => {
      memories.push({
        kind: kind.toLowerCase() as MemoryKind,
        content: String(content).trim(),
        importance: Math.min(10, Math.max(1, parseInt(importance, 10) || 5)),
      });
      return "";
    });
  }

  // Also strip complete tool tags — they're executed server-side after
  // the stream completes, so they should never appear in the visible text.
  const TOOL_TAG_RE = /§\s*tool\s*:\s*[a-z_]+\s*\|[^§]*§/gi;
  function extractToolTags() {
    buffer = buffer.replace(TOOL_TAG_RE, "");
  }

  function process(flushing: boolean): string {
    // 1. Mood tag sits at the very start. Hold everything until we either
    //    confirm it or confirm the buffer definitely isn't a mood tag.
    if (!moodExtracted) {
      const m = buffer.match(MOOD_PREFIX_RE);
      if (m) {
        mood = m[1].toLowerCase();
        buffer = buffer.slice(m[0].length);
        moodExtracted = true;
      } else if (!flushing) {
        // A mood tag is short ("§mood:curious§" ~ 16 chars). If we don't
        // have enough characters yet to rule it in or out, wait.
        if (buffer.length < 24) return "";
        // Long enough and still doesn't match -> the model skipped the tag.
        // Treat everything as visible content from here on.
        moodExtracted = true;
      } else {
        moodExtracted = true;
      }
    }

    // 2. Pull out any *complete* memory and tool tags wherever they appear.
    extractMemories();
    extractToolTags();

    // 3. Don't emit a trailing partial tag (e.g. buffer ends in "...§mem").
    if (flushing) {
      const out = buffer;
      buffer = "";
      return out;
    }
    const lastMarker = buffer.lastIndexOf("§");
    if (lastMarker === -1) {
      const out = buffer;
      buffer = "";
      return out;
    }
    const out = buffer.slice(0, lastMarker);
    buffer = buffer.slice(lastMarker);
    return out;
  }

  return {
    push(token: string) {
      buffer += token;
      return process(false);
    },
    flush() {
      return process(true);
    },
    getMood: () => mood,
    getMemories: () => memories,
  };
}

// --- Incremental sentence splitter ---------------------------------------
// Feeds visible text in and yields complete sentences as soon as they're
// ready, so the caller can kick off TTS per-sentence instead of waiting
// for the full response.

export interface SentenceSplitter {
  push(text: string): string[];
  flush(): string[];
}

export function createSentenceSplitter(): SentenceSplitter {
  let buffer = "";
  const SENTENCE_END_RE = /[.!?]+(?=\s|$)/;

  function extractComplete(): string[] {
    const out: string[] = [];
    while (true) {
      const match = buffer.match(SENTENCE_END_RE);
      if (!match || match.index === undefined) break;
      const end = match.index + match[0].length;
      // Don't split on things like "3.5" or "Mr." followed immediately by
      // a lowercase letter (likely an abbreviation, not a sentence end).
      const rest = buffer.slice(end);
      if (/^[a-z0-9]/.test(rest.trimStart())) {
        // Ambiguous — wait for more text before deciding.
        if (rest.length < 3) break;
      }
      const sentence = buffer.slice(0, end).trim();
      if (sentence) out.push(sentence);
      buffer = buffer.slice(end);
    }
    return out;
  }

  return {
    push(text: string) {
      buffer += text;
      return extractComplete();
    },
    flush() {
      const out = extractComplete();
      const rest = buffer.trim();
      buffer = "";
      if (rest) out.push(rest);
      return out;
    },
  };
}

// --- Tiny async queue -------------------------------------------------------
// Lets a producer (SSE reader) push items as they arrive and a consumer
// (TTS playback loop) pull them via `for await`, without polling. Browser-safe.

export interface AsyncQueue<T> {
  push(item: T): void;
  close(): void;
  [Symbol.asyncIterator](): AsyncIterator<T>;
}

export function createAsyncQueue<T>(): AsyncQueue<T> {
  const items: T[] = [];
  let closed = false;
  let waiter: (() => void) | null = null;

  const wake = () => {
    if (waiter) {
      const w = waiter;
      waiter = null;
      w();
    }
  };

  return {
    push(item: T) {
      items.push(item);
      wake();
    },
    close() {
      closed = true;
      wake();
    },
    [Symbol.asyncIterator]() {
      return {
        async next(): Promise<IteratorResult<T>> {
          while (items.length === 0) {
            if (closed) return { value: undefined, done: true };
            await new Promise<void>((resolve) => {
              waiter = resolve;
            });
          }
          const value = items.shift() as T;
          return { value, done: false };
        },
      };
    },
  };
}

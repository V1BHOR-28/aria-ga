// ARIA — TTS text preprocessing
//
// The TTS engine sounds robotic when it reads markdown, symbols, emoji,
// URLs, and long run-on sentences. This module cleans the text before
// sending it to the TTS API so ARIA sounds more like a person talking.

// Common emoji → word replacements (skip the hundreds we don't need)
const EMOJI_MAP: Record<string, string> = {
  "\u{1F60A}": "smiling",    // 😊
  "\u{1F604}": "laughing",   // 😄
  "\u{1F602}": "laughing",   // 😂
  "\u{1F642}": "smiling",    // 🙂
  "\u{1F609}": "winking",    // 😉
  "\u{1F60E}": "cool",       // 😎
  "\u{1F914}": "hmm",        // 🤔
  "\u{1F605}": "ha",         // 😅
  "\u{1F606}": "ha",         // 😆
  "\u{2764}\u{FE0F}": "love",// ❤️
  "\u{1F44D}": "yes",        // 👍
  "\u{1F44E}": "no",         // 👎
  "\u{1F44F}": "clap",       // 👏
  "\u{1F64C}": "yes",        // 🙌
  "\u{1F64F}": "thanks",     // 🙏
  "\u{2728}": "",            // ✨
  "\u{1F525}": "",           // 🔥
  "\u{1F4AF}": "",           // 💯
  "\u{2B50}": "",            // ⭐
  "\u{1F389}": "",           // 🎉
  "\u{1F4A1}": "",           // 💡
  "\u2192": "to",            // →
  "\u2190": "from",          // ←
  "\u2191": "up",            // ↑
  "\u2193": "down",          // ↓
  "\u2014": ",",             // —
  "\u2013": ",",             // –
  "\u2026": "...",           // …
  "\u2018": "'",             // '
  "\u2019": "'",             // '
  "\u201C": "",              // "
  "\u201D": "",              // "
  "\u00AB": "",              // «
  "\u00BB": "",              // »
};

// Abbreviations the TTS might mispronounce — expand them
const ABBREVIATIONS: [RegExp, string][] = [
  [/\be\.g\./gi, "for example"],
  [/\bi\.e\./gi, "that is"],
  [/\betc\./gi, "etcetera"],
  [/\bvs\./gi, "versus"],
  [/\bapprox\./gi, "approximately"],
  [/\bfig\./gi, "figure"],
  [/\bref\./gi, "reference"],
  [/\bmin\./gi, "minutes"],
  [/\bmax\./gi, "maximum"],
  [/\bapprox\./gi, "approximately"],
  [/\bMr\./g, "Mister"],
  [/\bMrs\./g, "Missus"],
  [/\bMs\./g, "Miz"],
  [/\bDr\./g, "Doctor"],
  [/\bProf\./g, "Professor"],
];

// Symbols → words
const SYMBOL_MAP: [RegExp, string][] = [
  [/&/g, " and "],
  [/@/g, " at "],
  [/#/g, " "],  // hashtag → space (strip)
  [/\*/g, " "], // asterisk → space
  [/_/g, " "],  // underscore → space
  [/`/g, " "],  // backtick → space
  [/\|/g, " "], // pipe → space
  [/~\s*/g, "about "],
  [/\+\s*/g, "plus "],
  [/\s+\/\s+/g, " or "],  // " / " → " or "
  [/->/g, " to "],
  [/<-/g, " from "],
  [/=>/g, " so "],
  [/<=?\s*/g, "less than or equal to "],
  [/>=\s*/g, "greater than or equal to "],
  [/<\s*/g, "less than "],
  [/>/g, " greater than "],
  [/=/g, " equals "],
  [/%/g, " percent"],
  [/\$/g, " dollars "],
  [/\u00B0/g, " degrees "],
];

export interface PreprocessOptions {
  stripMarkdown?: boolean; // default true
  expandAbbreviations?: boolean; // default true
  replaceSymbols?: boolean; // default true
  stripEmoji?: boolean; // default true
  stripUrls?: boolean; // default true
  normalizePunctuation?: boolean; // default true
}

export function preprocessForTTS(
  text: string,
  options: PreprocessOptions = {}
): string {
  const {
    stripMarkdown = true,
    expandAbbreviations = true,
    replaceSymbols = true,
    stripEmoji = true,
    stripUrls = true,
    normalizePunctuation = true,
  } = options;

  let out = text;

  // 1. Strip URLs — replace with "link"
  if (stripUrls) {
    out = out.replace(/https?:\/\/[^\s)]+/gi, "link");
    out = out.replace(/\bwww\.[^\s)]+/gi, "link");
  }

  // 2. Strip markdown
  if (stripMarkdown) {
    // Code blocks → "code"
    out = out.replace(/```[\s\S]*?```/g, " code ");
    // Inline code
    out = out.replace(/`([^`]+)`/g, "$1");
    // Bold/italic markers
    out = out.replace(/\*\*([^*]+)\*\*/g, "$1");
    out = out.replace(/__([^_]+)__/g, "$1");
    out = out.replace(/\*([^*]+)\*/g, "$1");
    out = out.replace(/_([^_]+)_/g, "$1");
    // Headings (# Heading → Heading)
    out = out.replace(/^#{1,6}\s+/gm, "");
    // Links [text](url) → text
    out = out.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
    // Images ![alt](url) → alt
    out = out.replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1");
    // Blockquotes
    out = out.replace(/^>\s+/gm, "");
    // Horizontal rules
    out = out.replace(/^---+$/gm, "");
    // List markers (-, *, 1.)
    out = out.replace(/^[\s]*[-*+]\s+/gm, "");
    out = out.replace(/^[\s]*\d+\.\s+/gm, "");
    // Strikethrough
    out = out.replace(/~~([^~]+)~~/g, "$1");
  }

  // 3. Replace emoji and special unicode
  if (stripEmoji) {
    // Replace known emoji first
    for (const [emoji, word] of Object.entries(EMOJI_MAP)) {
      out = out.split(emoji).join(word);
    }
    // Remove any remaining emoji (U+1F000-U+1FAFF, U+2600-U+27BF, U+FE00-U+FE0F)
    out = out.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F1E6}-\u{1F1FF}\u{1F900}-\u{1F9FF}]/gu, "");
  }

  // 4. Expand abbreviations
  if (expandAbbreviations) {
    for (const [re, replacement] of ABBREVIATIONS) {
      out = out.replace(re, replacement);
    }
  }

  // 5. Replace symbols
  if (replaceSymbols) {
    for (const [re, replacement] of SYMBOL_MAP) {
      out = out.replace(re, replacement);
    }
  }

  // 6. Normalize punctuation
  if (normalizePunctuation) {
    // Multiple exclamation/question marks → single
    out = out.replace(/!{2,}/g, "!");
    out = out.replace(/\?{2,}/g, "?");
    // Multiple periods (not ellipsis) → single
    out = out.replace(/\.{4,}/g, ".");
    out = out.replace(/\.\.\./g, "...");
    // Comma splice cleanup
    out = out.replace(/,\s*,/g, ",");
    // Whitespace before punctuation
    out = out.replace(/\s+([,.;:!?])/g, "$1");
    // Ensure space after punctuation
    out = out.replace(/([,;:])(?=[^\s])/g, "$1 ");
    // Multiple spaces → single
    out = out.replace(/\s{2,}/g, " ");
  }

  // 7. Strip mood/memory tags if they leaked through
  out = out.replace(/§\s*mood\s*:\s*[a-z]+\s*§/gi, "");
  out = out.replace(/§\s*memory\s*:\s*[a-z_]+\s*\|[^|]*\|?\d*\s*§/gi, "");
  out = out.replace(
    /^(warm|curious|amused|thoughtful|concerned|excited|calm|playful|reflective|honest|frustrated|neutral)\s*[:\-]\s*/i,
    ""
  );

  // 8. Trim
  out = out.trim();

  return out;
}

// Split text into TTS-friendly chunks (sentences). Each chunk will be a
// separate TTS call so we can play them with natural pauses between.
// Returns array of { text, pauseAfter } where pauseAfter is in ms.
export interface TtsChunk {
  text: string;
  pauseAfter: number; // ms
}

export function chunkForTTS(text: string, maxLen = 1200): TtsChunk[] {
  const cleaned = preprocessForTTS(text);
  if (!cleaned) return [];

  // The Z.ai TTS API rate-limits aggressively — each API call can take
  // 2-20s due to rate-limit retries. To avoid inter-chunk gaps, we
  // minimize the number of chunks.
  //
  // Strategy:
  // - Responses under 1000 chars: SINGLE chunk (one API call, no gaps)
  // - Responses 1000+ chars: split into 2 chunks (first sentence + rest)
  //   with prefetching so the second chunk loads while the first plays.
  if (cleaned.length <= 1000) {
    return [{ text: cleaned, pauseAfter: 0 }];
  }

  // For long responses: first sentence as own chunk (fast TTS start),
  // then the rest as a single chunk.
  const sentences = cleaned.match(/[^.!?]+[.!?]+|\S[^.!?]*$/g) ?? [cleaned];
  const trimmedSentences = sentences.map((s) => s.trim()).filter(Boolean);
  if (trimmedSentences.length === 0) return [{ text: cleaned, pauseAfter: 0 }];

  const chunks: TtsChunk[] = [
    {
      text: trimmedSentences[0],
      pauseAfter: 120, // tight conversational pause
    },
  ];

  const rest = trimmedSentences.slice(1).join(" ");
  if (rest) {
    chunks.push({ text: rest, pauseAfter: 0 });
  }

  return chunks;
}

"use client";

import type { TtsVoice } from "./tts-providers";

// Web Speech API TTS provider
// Runs entirely in the browser — no server call, no rate limits.
// Voice quality depends on OS/browser:
//   - Chrome on Windows: Microsoft voices (good)
//   - Chrome on Mac: Apple voices (good)
//   - Chrome on Linux: limited (often only Google voices)
//   - Edge: Microsoft voices (best)
//   - Safari: Apple voices
//   - Firefox: limited support

let cachedVoices: SpeechSynthesisVoice[] = [];

export function isWebSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function getWebSpeechVoices(): TtsVoice[] {
  if (!isWebSpeechSupported()) return [];
  const voices = window.speechSynthesis.getVoices();
  cachedVoices = voices;
  return voices
    .filter((v) => v.lang.startsWith("en"))
    .map((v) => {
      // Heuristic: detect gender from voice name
      const name = v.name.toLowerCase();
      const femaleIndicators = [
        "female", "woman", "samantha", "victoria", "karen", "moira",
        "tessa", "serena", "fiona", "veena", "kate", "zira", "hazel",
        "susan", "allison", "ava", "samantha", "jenny", "aria", "jessa",
        "michelle", "emma", "google uk english female", "google us english",
      ];
      const maleIndicators = [
        "male", "man", "daniel", "alex", "fred", "tom", "david", "mark",
        "george", "rishi", "google uk english male",
      ];
      let gender: "female" | "male" | "unknown" = "unknown";
      if (femaleIndicators.some((s) => name.includes(s))) gender = "female";
      else if (maleIndicators.some((s) => name.includes(s))) gender = "male";

      // Clean up name (e.g. "Google US English" -> "Google US English")
      const cleanName = v.name
        .replace(/Microsoft\s+/i, "")
        .replace(/Online \(Natural\)/i, "Natural")
        .replace(/\s*-\s*English.*$/i, "")
        .trim();

      return {
        id: v.voiceURI,
        label: cleanName,
        description: `${v.lang}${v.localService ? " · local" : " · cloud"}${gender !== "unknown" ? ` · ${gender}` : ""}`,
        provider: "web-speech" as const,
        lang: v.lang,
        gender,
      };
    })
    .sort((a, b) => {
      // Sort: female first, then by name
      if (a.gender === "female" && b.gender !== "female") return -1;
      if (a.gender !== "female" && b.gender === "female") return 1;
      return a.label.localeCompare(b.label);
    });
}

export interface WebSpeechSpeakOptions {
  voiceId?: string;
  speed?: number;
  pitch?: number; // 0-2, default 1
  onEnd?: () => void;
  onStart?: () => void;
  onError?: (err: string) => void;
}

/**
 * Speak text using Web Speech API. Returns a stop function.
 */
export function speakWithWebSpeech(
  text: string,
  options: WebSpeechSpeakOptions = {}
): () => void {
  if (!isWebSpeechSupported()) {
    options.onError?.("Web Speech API not supported in this browser");
    return () => {};
  }

  // Cancel any ongoing speech
  window.speechSynthesis.cancel();

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.rate = options.speed ?? 1.0;
  utterance.pitch = options.pitch ?? 1.0;
  utterance.volume = 1.0;

  // Pick voice
  const voices = cachedVoices.length ? cachedVoices : window.speechSynthesis.getVoices();
  if (options.voiceId) {
    const v = voices.find((v) => v.voiceURI === options.voiceId);
    if (v) utterance.voice = v;
  } else {
    // Auto-pick best female English voice
    const preferredNames = [
      "Google UK English Female",
      "Microsoft Aria Online (Natural) - English (United States)",
      "Microsoft Jenny Online (Natural) - English (United States)",
      "Samantha",
      "Microsoft Zira",
      "Google US English",
    ];
    for (const name of preferredNames) {
      const v = voices.find((v) => v.name === name);
      if (v) {
        utterance.voice = v;
        break;
      }
    }
  }

  utterance.onstart = () => options.onStart?.();
  utterance.onend = () => options.onEnd?.();
  utterance.onerror = (e) => {
    if (e.error !== "canceled" && e.error !== "interrupted") {
      options.onError?.(e.error);
    }
  };

  window.speechSynthesis.speak(utterance);

  return () => {
    window.speechSynthesis.cancel();
  };
}

export function stopWebSpeech(): void {
  if (isWebSpeechSupported()) {
    window.speechSynthesis.cancel();
  }
}

// Preload voices — they load async in some browsers
export function primeWebSpeechVoices(): Promise<void> {
  return new Promise((resolve) => {
    if (!isWebSpeechSupported()) {
      resolve();
      return;
    }
    const existing = window.speechSynthesis.getVoices();
    if (existing.length > 0) {
      cachedVoices = existing;
      resolve();
      return;
    }
    let resolved = false;
    const handler = () => {
      if (resolved) return;
      resolved = true;
      cachedVoices = window.speechSynthesis.getVoices();
      resolve();
    };
    window.speechSynthesis.onvoiceschanged = handler;
    // Fallback timeout — some browsers never fire the event
    setTimeout(() => {
      if (resolved) return;
      resolved = true;
      cachedVoices = window.speechSynthesis.getVoices();
      resolve();
    }, 1500);
  });
}

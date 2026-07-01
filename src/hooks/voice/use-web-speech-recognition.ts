"use client";

import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API type declarations (not in default TS lib)
interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionResultList {
  length: number;
  [index: number]: SpeechRecognitionResult;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: SpeechRecognitionResultList;
}
interface SpeechRecognitionErrorEvent extends Event {
  error: string;
  message: string;
}
interface SpeechRecognition extends EventTarget {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onend: ((this: SpeechRecognition, ev: Event) => void) | null;
  onerror:
    | ((this: SpeechRecognition, ev: SpeechRecognitionErrorEvent) => void)
    | null;
  onresult:
    | ((this: SpeechRecognition, ev: SpeechRecognitionEvent) => void)
    | null;
  onspeechstart: ((this: SpeechRecognition, ev: Event) => void) | null;
  onspeechend: ((this: SpeechRecognition, ev: Event) => void) | null;
}
type SpeechRecognitionConstructor = new () => SpeechRecognition;

declare global {
  interface Window {
    SpeechRecognition?: SpeechRecognitionConstructor;
    webkitSpeechRecognition?: SpeechRecognitionConstructor;
  }
}

export function isWebSpeechRecognitionSupported(): boolean {
  if (typeof window === "undefined") return false;
  return !!(window.SpeechRecognition || window.webkitSpeechRecognition);
}

export type RecognitionLang = "en-IN" | "hi-IN" | "en-US";

interface UseWebSpeechRecognitionOptions {
  lang?: RecognitionLang;
  onFinalResult?: (text: string) => void;
  onError?: (err: string) => void;
}

interface UseWebSpeechRecognitionReturn {
  supported: boolean;
  recording: boolean;
  error: string | null;
  interimText: string;
  finalText: string;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

/**
 * Browser-native speech recognition via the Web Speech API.
 * Supports Hindi (hi-IN), Indian English (en-IN), and US English (en-US).
 * Runs in real-time with interim results — much better UX than batch ASR.
 *
 * Chrome/Edge: fully supported (uses Google's speech engine)
 * Safari: supported (uses Apple's speech engine)
 * Firefox: not supported
 */
export function useWebSpeechRecognition({
  lang = "en-IN",
  onFinalResult,
  onError,
}: UseWebSpeechRecognitionOptions = {}): UseWebSpeechRecognitionReturn {
  const supported = isWebSpeechRecognitionSupported();
  const [recording, setRecording] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [interimText, setInterimText] = useState("");
  const [finalText, setFinalText] = useState("");

  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const langRef = useRef<RecognitionLang>(lang);
  const shouldRestartRef = useRef(false);
  const onFinalRef = useRef(onFinalResult);
  const onErrorRef = useRef(onError);

  useEffect(() => {
    langRef.current = lang;
    // Update lang on active recognition
    if (recognitionRef.current) {
      recognitionRef.current.lang = lang;
    }
  }, [lang]);

  useEffect(() => {
    onFinalRef.current = onFinalResult;
    onErrorRef.current = onError;
  }, [onFinalResult, onError]);

  const createRecognition = useCallback((): SpeechRecognition | null => {
    if (!supported) return null;
    const Ctor = window.SpeechRecognition || window.webkitSpeechRecognition!;
    const recognition = new Ctor();
    recognition.lang = langRef.current;
    recognition.continuous = true; // keep listening until stopped
    recognition.interimResults = true; // show partial results as you speak
    recognition.maxAlternatives = 1;

    recognition.onstart = () => {
      setRecording(true);
      setError(null);
    };

    recognition.onresult = (event: SpeechRecognitionEvent) => {
      let interim = "";
      let final = "";
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const transcript = result[0].transcript;
        if (result.isFinal) {
          final += transcript;
        } else {
          interim += transcript;
        }
      }
      if (interim) setInterimText(interim);
      if (final) {
        setFinalText((prev) => prev + final);
        setInterimText("");
        onFinalRef.current?.(final.trim());
      }
    };

    recognition.onerror = (event: SpeechRecognitionErrorEvent) => {
      if (event.error === "no-speech" || event.error === "aborted") {
        // These are normal — don't show as errors
        return;
      }
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setError("Microphone permission denied. Allow mic access to use voice mode.");
      } else if (event.error === "network") {
        setError("Network error during speech recognition.");
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
      onErrorRef.current?.(event.error);
    };

    recognition.onend = () => {
      setRecording(false);
      setInterimText("");
      // Auto-restart if we're still supposed to be listening (Chrome
      // stops after ~60s of silence or on certain errors)
      if (shouldRestartRef.current) {
        try {
          recognition.start();
        } catch {
          // Will fail if already started — ignore
        }
      }
    };

    return recognition;
  }, [supported]);

  const start = useCallback(() => {
    if (!supported) {
      setError("Web Speech API not supported. Try Chrome or Edge.");
      return;
    }
    setError(null);
    setInterimText("");
    setFinalText("");

    // Create fresh recognition instance
    if (recognitionRef.current) {
      try {
        recognitionRef.current.abort();
      } catch {
        // ignore
      }
    }
    recognitionRef.current = createRecognition();
    if (!recognitionRef.current) return;

    shouldRestartRef.current = true;
    try {
      recognitionRef.current.start();
    } catch (e) {
      // "already started" error — ignore
    }
  }, [supported, createRecognition]);

  const stop = useCallback(() => {
    shouldRestartRef.current = false;
    if (recognitionRef.current) {
      try {
        recognitionRef.current.stop();
      } catch {
        // ignore
      }
    }
    setRecording(false);
    setInterimText("");
  }, []);

  const toggle = useCallback(() => {
    if (recording) {
      stop();
    } else {
      start();
    }
  }, [recording, start, stop]);

  useEffect(() => {
    return () => {
      shouldRestartRef.current = false;
      if (recognitionRef.current) {
        try {
          recognitionRef.current.abort();
        } catch {
          // ignore
        }
      }
    };
  }, []);

  return {
    supported,
    recording,
    error,
    interimText,
    finalText,
    start,
    stop,
    toggle,
  };
}

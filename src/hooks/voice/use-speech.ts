"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechReturn {
  speaking: boolean;
  loading: boolean; // fetching TTS audio
  currentId: string | null; // id of message currently being spoken
  error: string | null;
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  toggle: (id: string, text: string) => Promise<void>;
}

/**
 * Plays TTS audio for ARIA's responses. Manages a single audio element
 * so starting a new utterance stops the previous one.
 *
 * State machine: idle -> loading -> speaking -> idle
 * Errors are surfaced via `error` so the UI can show them.
 */
export function useSpeech(): UseSpeechReturn {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  // Track current id in a ref so async callbacks can read the latest value
  // without stale closures.
  const currentIdRef = useRef<string | null>(null);

  const stop = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }
    setSpeaking(false);
    setLoading(false);
    setCurrentId(null);
    currentIdRef.current = null;
  }, []);

  const speak = useCallback(async (id: string, text: string) => {
    // Stop anything currently playing
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const clean = text.trim();
    if (!clean) return;

    setError(null);
    setLoading(true);
    setCurrentId(id);
    currentIdRef.current = id;

    const controller = new AbortController();
    abortRef.current = controller;

    try {
      const res = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: clean }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `TTS failed (${res.status})`);
      }

      const blob = await res.blob();
      if (blob.size === 0) {
        throw new Error("TTS returned empty audio");
      }
      const url = URL.createObjectURL(blob);

      // Reuse a single audio element
      if (!audioRef.current) {
        audioRef.current = new Audio();
      }
      const audio = audioRef.current;
      audio.src = url;
      audio.crossOrigin = "anonymous";

      // Attach handlers BEFORE play() so we don't miss events
      const onPlay = () => {
        // Only update state if this is still the current utterance
        if (currentIdRef.current === id) {
          setSpeaking(true);
          setLoading(false);
        }
      };
      const onEnded = () => {
        if (currentIdRef.current === id) {
          setSpeaking(false);
          setCurrentId(null);
          currentIdRef.current = null;
        }
        URL.revokeObjectURL(url);
        cleanup();
      };
      const onError = () => {
        if (currentIdRef.current === id) {
          setSpeaking(false);
          setLoading(false);
          setCurrentId(null);
          currentIdRef.current = null;
          setError("Audio playback failed");
        }
        URL.revokeObjectURL(url);
        cleanup();
      };
      const cleanup = () => {
        audio.removeEventListener("play", onPlay);
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
      };
      audio.addEventListener("play", onPlay);
      audio.addEventListener("ended", onEnded);
      audio.addEventListener("error", onError);

      // play() returns a Promise that rejects if autoplay is blocked
      try {
        await audio.play();
      } catch (playErr) {
        // If autoplay is blocked, we can't do much — surface the error
        if ((playErr as Error).name === "NotAllowedError") {
          setError(
            "Browser blocked autoplay. Click the speaker icon to play."
          );
        } else if ((playErr as Error).name === "AbortError") {
          // Expected when stopping / interrupting
        } else {
          setError(`Playback failed: ${(playErr as Error).name}`);
        }
        setSpeaking(false);
        setLoading(false);
        if (currentIdRef.current === id) {
          setCurrentId(null);
          currentIdRef.current = null;
        }
        cleanup();
        URL.revokeObjectURL(url);
      }
    } catch (err) {
      if ((err as Error).name === "AbortError") return;
      console.error("[useSpeech]", err);
      const msg = err instanceof Error ? err.message : "TTS failed";
      setError(msg);
      setSpeaking(false);
      setLoading(false);
      if (currentIdRef.current === id) {
        setCurrentId(null);
        currentIdRef.current = null;
      }
    } finally {
      if (abortRef.current === controller) abortRef.current = null;
    }
  }, []);

  const toggle = useCallback(
    async (id: string, text: string) => {
      if (currentIdRef.current === id && (speaking || loading)) {
        stop();
      } else {
        await speak(id, text);
      }
    },
    [speaking, loading, speak, stop]
  );

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return { speaking, loading, currentId, error, speak, stop, toggle };
}

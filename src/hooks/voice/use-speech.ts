"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunkForTTS } from "@/lib/aria/tts-preprocess";

interface UseSpeechReturn {
  speaking: boolean;
  loading: boolean; // fetching first TTS chunk
  currentId: string | null;
  error: string | null;
  progress: { current: number; total: number } | null;
  speed: number;
  setSpeed: (s: number) => void;
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  toggle: (id: string, text: string) => Promise<void>;
}

const DEFAULT_SPEED = 0.9;

/**
 * Plays TTS audio for ARIA's responses — chunked sentence-by-sentence
 * for natural cadence. Each sentence is a separate TTS call, and we
 * insert a small pause between them so ARIA sounds like she's talking,
 * not reading.
 *
 * State machine: idle -> loading -> speaking -> idle
 */
export function useSpeech(): UseSpeechReturn {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [speed, setSpeedState] = useState(DEFAULT_SPEED);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const stoppedRef = useRef<boolean>(false);
  const speedRef = useRef<number>(DEFAULT_SPEED);

  // Keep speedRef in sync with state so async loops read the latest value
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  const setSpeed = useCallback((s: number) => {
    const clamped = Math.min(1.5, Math.max(0.5, s));
    setSpeedState(clamped);
  }, []);

  const stop = useCallback(() => {
    stoppedRef.current = true;
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
    setProgress(null);
  }, []);

  const fetchChunk = useCallback(
    async (text: string, signal: AbortSignal): Promise<Blob | null> => {
      const MAX_RETRIES = 3;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (signal.aborted) return null;
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ text, speed: speedRef.current }),
            signal,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const errMsg =
              typeof err === "object" ? err.error || "" : String(err);

            // 429 = rate limited — retry with exponential backoff
            if (res.status === 500 && /429|Too many requests/i.test(errMsg)) {
              if (attempt < MAX_RETRIES) {
                const delay = 800 * Math.pow(2, attempt); // 800ms, 1.6s, 3.2s
                await new Promise((r) => setTimeout(r, delay));
                continue;
              }
            }
            throw new Error(errMsg || `TTS failed (${res.status})`);
          }
          const blob = await res.blob();
          if (blob.size === 0) return null;
          return blob;
        } catch (err) {
          if ((err as Error).name === "AbortError") return null;
          if (attempt < MAX_RETRIES) {
            const delay = 800 * Math.pow(2, attempt);
            await new Promise((r) => setTimeout(r, delay));
            continue;
          }
          throw err;
        }
      }
      return null;
    },
    []
  );

  const playBlob = useCallback(
    (blob: Blob): Promise<void> => {
      return new Promise((resolve, reject) => {
        if (stoppedRef.current) {
          resolve();
          return;
        }
        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        const url = URL.createObjectURL(blob);
        audio.src = url;

        const cleanup = () => {
          audio.removeEventListener("play", onPlay);
          audio.removeEventListener("ended", onEnded);
          audio.removeEventListener("error", onError);
          URL.revokeObjectURL(url);
        };
        const onPlay = () => {
          // state already set by caller
        };
        const onEnded = () => {
          cleanup();
          resolve();
        };
        const onError = (e: Event) => {
          cleanup();
          reject(new Error("Audio playback failed"));
          void e;
        };
        audio.addEventListener("play", onPlay);
        audio.addEventListener("ended", onEnded);
        audio.addEventListener("error", onError);

        audio.play().catch((playErr) => {
          cleanup();
          if ((playErr as Error).name === "AbortError") {
            resolve();
          } else if ((playErr as Error).name === "NotAllowedError") {
            reject(new Error("Browser blocked autoplay. Click speak to play."));
          } else {
            reject(playErr);
          }
        });
      });
    },
    []
  );

  const speak = useCallback(
    async (id: string, text: string) => {
      // Stop anything currently playing
      stoppedRef.current = true;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
      // Small wait to let prior audio settle
      await new Promise((r) => setTimeout(r, 50));
      stoppedRef.current = false;

      const chunks = chunkForTTS(text);
      if (chunks.length === 0) return;

      setError(null);
      setLoading(true);
      setCurrentId(id);
      currentIdRef.current = id;
      setProgress({ current: 0, total: chunks.length });

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        for (let i = 0; i < chunks.length; i++) {
          if (stoppedRef.current) break;

          const chunk = chunks[i];
          setProgress({ current: i, total: chunks.length });

          // Fetch this chunk (with built-in retry for rate limits)
          const blob = await fetchChunk(chunk.text, controller.signal);
          if (!blob || stoppedRef.current) break;

          // First chunk — flip from loading to speaking
          if (i === 0) {
            setLoading(false);
            setSpeaking(true);
          }

          // Play it
          await playBlob(blob);
          if (stoppedRef.current) break;

          // Natural pause between sentences — also serves as rate-limit buffer
          if (chunk.pauseAfter > 0 && i < chunks.length - 1) {
            await new Promise((r) => setTimeout(r, chunk.pauseAfter));
          }
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "TTS failed";
        if (!stoppedRef.current) {
          setError(msg);
        }
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
        if (!stoppedRef.current) {
          setSpeaking(false);
          setLoading(false);
          setCurrentId(null);
          currentIdRef.current = null;
          setProgress(null);
        }
      }
    },
    [fetchChunk, playBlob]
  );

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
      stoppedRef.current = true;
      if (abortRef.current) abortRef.current.abort();
      if (audioRef.current) audioRef.current.pause();
    };
  }, []);

  return {
    speaking,
    loading,
    currentId,
    error,
    progress,
    speed,
    setSpeed,
    speak,
    stop,
    toggle,
  };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseSpeechReturn {
  speaking: boolean;
  loading: boolean; // fetching TTS audio
  currentId: string | null; // id of message currently being spoken
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  toggle: (id: string, text: string) => Promise<void>;
}

/**
 * Plays TTS audio for ARIA's responses. Manages a single audio element
 * so starting a new utterance stops the previous one.
 */
export function useSpeech(): UseSpeechReturn {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

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
  }, []);

  const speak = useCallback(
    async (id: string, text: string) => {
      // Stop anything currently playing
      if (abortRef.current) abortRef.current.abort();
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }

      // Skip empty / very short text
      const clean = text.trim();
      if (!clean) return;

      setLoading(true);
      setCurrentId(id);

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
          throw new Error(err.error || "TTS failed");
        }

        const blob = await res.blob();
        const url = URL.createObjectURL(blob);

        // Reuse a single audio element
        if (!audioRef.current) {
          audioRef.current = new Audio();
        }
        const audio = audioRef.current;
        audio.src = url;

        audio.onplay = () => {
          setSpeaking(true);
          setLoading(false);
        };
        audio.onended = () => {
          setSpeaking(false);
          setCurrentId(null);
          URL.revokeObjectURL(url);
        };
        audio.onerror = () => {
          setSpeaking(false);
          setLoading(false);
          setCurrentId(null);
          URL.revokeObjectURL(url);
        };

        await audio.play();
      } catch (err) {
        // Aborts are expected when stopping / interrupting
        if ((err as Error).name === "AbortError") return;
        console.error("[useSpeech]", err);
        setSpeaking(false);
        setLoading(false);
        setCurrentId(null);
      } finally {
        if (abortRef.current === controller) abortRef.current = null;
      }
    },
    []
  );

  const toggle = useCallback(
    async (id: string, text: string) => {
      if (currentId === id && (speaking || loading)) {
        stop();
      } else {
        await speak(id, text);
      }
    },
    [currentId, speaking, loading, speak, stop]
  );

  useEffect(() => {
    return () => {
      if (abortRef.current) abortRef.current.abort();
      if (audioRef.current) {
        audioRef.current.pause();
      }
    };
  }, []);

  return { speaking, loading, currentId, speak, stop, toggle };
}

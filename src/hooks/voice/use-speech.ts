"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { chunkForTTS } from "@/lib/aria/tts-preprocess";
import {
  loadVoiceSettings,
  saveVoiceSettings,
  TTS_PROVIDERS,
  type TtsProviderId,
  type VoiceSettings,
} from "@/lib/aria/tts-providers";
import {
  isWebSpeechSupported,
  primeWebSpeechVoices,
  speakWithWebSpeech,
  stopWebSpeech,
} from "@/lib/aria/tts-web-speech";

interface UseSpeechReturn {
  speaking: boolean;
  loading: boolean;
  currentId: string | null;
  error: string | null;
  progress: { current: number; total: number } | null;
  // settings
  settings: VoiceSettings;
  updateSettings: (patch: Partial<VoiceSettings>) => void;
  // actions
  speak: (id: string, text: string) => Promise<void>;
  stop: () => void;
  toggle: (id: string, text: string) => Promise<void>;
}

export function useSpeech(): UseSpeechReturn {
  const [speaking, setSpeaking] = useState(false);
  const [loading, setLoading] = useState(false);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [settings, setSettings] = useState<VoiceSettings>(DEFAULT_SETTINGS);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const currentIdRef = useRef<string | null>(null);
  const stoppedRef = useRef<boolean>(false);
  const settingsRef = useRef<VoiceSettings>(DEFAULT_SETTINGS);
  const webSpeechStopRef = useRef<(() => void) | null>(null);

  // Load settings from localStorage on mount
  useEffect(() => {
    const loaded = loadVoiceSettings();
    setSettings(loaded);
    settingsRef.current = loaded;
    // Prime Web Speech voices if needed
    if (loaded.provider === "web-speech") {
      void primeWebSpeechVoices();
    }
  }, []);

  // Keep settingsRef in sync
  useEffect(() => {
    settingsRef.current = settings;
  }, [settings]);

  const updateSettings = useCallback((patch: Partial<VoiceSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      saveVoiceSettings(next);
      return next;
    });
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
    if (webSpeechStopRef.current) {
      webSpeechStopRef.current();
      webSpeechStopRef.current = null;
    } else {
      stopWebSpeech();
    }
    setSpeaking(false);
    setLoading(false);
    setCurrentId(null);
    currentIdRef.current = null;
    setProgress(null);
  }, []);

  // ----- Web Speech provider (client-side) -----
  const speakWithWebSpeechProvider = useCallback(
    async (id: string, text: string) => {
      const chunks = chunkForTTS(text);
      if (chunks.length === 0) return;

      setError(null);
      setLoading(true);
      setCurrentId(id);
      currentIdRef.current = id;
      setProgress({ current: 0, total: chunks.length });
      stoppedRef.current = false;

      try {
        for (let i = 0; i < chunks.length; i++) {
          if (stoppedRef.current) break;
          const chunk = chunks[i];
          setProgress({ current: i, total: chunks.length });

          await new Promise<void>((resolve, reject) => {
            if (i === 0) {
              setLoading(false);
              setSpeaking(true);
            }
            const stopFn = speakWithWebSpeech(chunk.text, {
              voiceId: settingsRef.current.voiceId,
              speed: settingsRef.current.speed,
              onEnd: () => resolve(),
              onError: (err) => reject(new Error(err)),
            });
            webSpeechStopRef.current = stopFn;
          });

          if (stoppedRef.current) break;

          // Pause between chunks
          if (chunk.pauseAfter > 0 && i < chunks.length - 1) {
            await new Promise((r) => setTimeout(r, chunk.pauseAfter));
          }
        }
      } catch (err) {
        if (!stoppedRef.current) {
          const msg = err instanceof Error ? err.message : "Web Speech failed";
          setError(msg);
        }
      } finally {
        webSpeechStopRef.current = null;
        if (!stoppedRef.current) {
          setSpeaking(false);
          setLoading(false);
          setCurrentId(null);
          currentIdRef.current = null;
          setProgress(null);
        }
      }
    },
    []
  );

  // ----- Server-based providers (zai, elevenlabs) -----
  const fetchChunk = useCallback(
    async (text: string, signal: AbortSignal): Promise<Blob | null> => {
      const MAX_RETRIES = 3;
      const s = settingsRef.current;
      for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
        if (signal.aborted) return null;
        try {
          const res = await fetch("/api/tts", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              text,
              speed: s.speed,
              provider: s.provider,
              voiceId: s.voiceId,
              apiKey: s.apiKeys[s.provider],
            }),
            signal,
          });
          if (!res.ok) {
            const err = await res.json().catch(() => ({}));
            const errMsg =
              typeof err === "object" ? err.error || "" : String(err);
            if (res.status === 500 && /429|Too many requests/i.test(errMsg)) {
              if (attempt < MAX_RETRIES) {
                await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
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
            await new Promise((r) => setTimeout(r, 800 * Math.pow(2, attempt)));
            continue;
          }
          throw err;
        }
      }
      return null;
    },
    []
  );

  const playBlob = useCallback((blob: Blob): Promise<void> => {
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
        audio.removeEventListener("ended", onEnded);
        audio.removeEventListener("error", onError);
        URL.revokeObjectURL(url);
      };
      const onEnded = () => {
        cleanup();
        resolve();
      };
      const onError = () => {
        cleanup();
        reject(new Error("Audio playback failed"));
      };
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
  }, []);

  const speakWithServerProvider = useCallback(
    async (id: string, text: string) => {
      stoppedRef.current = true;
      if (abortRef.current) {
        abortRef.current.abort();
        abortRef.current = null;
      }
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current.currentTime = 0;
      }
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

          const blob = await fetchChunk(chunk.text, controller.signal);
          if (!blob || stoppedRef.current) break;

          if (i === 0) {
            setLoading(false);
            setSpeaking(true);
          }

          await playBlob(blob);
          if (stoppedRef.current) break;

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

  // Main speak function — routes to the right provider
  const speak = useCallback(
    async (id: string, text: string) => {
      const s = settingsRef.current;

      // Stop anything currently playing
      stop();
      await new Promise((r) => setTimeout(r, 80));
      stoppedRef.current = false;

      if (s.provider === "web-speech") {
        if (!isWebSpeechSupported()) {
          setError("Web Speech API not supported. Try Chrome or Edge.");
          return;
        }
        await speakWithWebSpeechProvider(id, text);
      } else {
        await speakWithServerProvider(id, text);
      }
    },
    [stop, speakWithWebSpeechProvider, speakWithServerProvider]
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
      stopWebSpeech();
    };
  }, []);

  return {
    speaking,
    loading,
    currentId,
    error,
    progress,
    settings,
    updateSettings,
    speak,
    stop,
    toggle,
  };
}

const DEFAULT_SETTINGS: VoiceSettings = {
  provider: "web-speech",
  voiceId: "",
  speed: 1.0,
  apiKeys: {},
};

// Re-export for components
export { TTS_PROVIDERS, type TtsProviderId };

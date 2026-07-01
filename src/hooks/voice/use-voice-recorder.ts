"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface UseVoiceRecorderOptions {
  onTranscribed?: (text: string) => void;
  onError?: (err: Error) => void;
}

interface UseVoiceRecorderReturn {
  recording: boolean;
  loading: boolean;
  error: string | null;
  start: () => Promise<void>;
  stop: () => void;
  toggle: () => Promise<void>;
  audioLevel: number; // 0..1 for visual feedback
}

/**
 * Records audio from the microphone, sends it to /api/asr on stop,
 * and returns the transcribed text via onTranscribed callback.
 */
export function useVoiceRecorder({
  onTranscribed,
  onError,
}: UseVoiceRecorderOptions = {}): UseVoiceRecorderReturn {
  const [recording, setRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState(0);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const rafRef = useRef<number | null>(null);

  const cleanupStream = useCallback(() => {
    if (rafRef.current) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((t) => t.stop());
      streamRef.current = null;
    }
    if (audioCtxRef.current) {
      void audioCtxRef.current.close();
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    setAudioLevel(0);
  }, []);

  useEffect(() => {
    return () => cleanupStream();
  }, [cleanupStream]);

  const monitorLevel = useCallback(() => {
    const analyser = analyserRef.current;
    if (!analyser) return;
    const data = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteTimeDomainData(data);
    let sum = 0;
    for (let i = 0; i < data.length; i++) {
      const v = (data[i] - 128) / 128;
      sum += v * v;
    }
    const rms = Math.sqrt(sum / data.length);
    setAudioLevel(Math.min(1, rms * 3));
    rafRef.current = requestAnimationFrame(monitorLevel);
  }, []);

  const start = useCallback(async () => {
    setError(null);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
          channelCount: 1,
          sampleRate: 16000,
        },
      });
      streamRef.current = stream;

      // Set up audio level monitoring
      const audioCtx = new AudioContext({ sampleRate: 16000 });
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      source.connect(analyser);
      analyserRef.current = analyser;
      monitorLevel();

      // Pick the best available mime type
      const mimeTypes = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/mp4",
      ];
      const mimeType = mimeTypes.find((t) => MediaRecorder.isTypeSupported(t));

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const blob = new Blob(chunksRef.current, {
          type: mimeType || "audio/webm",
        });
        chunksRef.current = [];
        cleanupStream();

        if (blob.size === 0) {
          setError("Didn't catch any audio. Try again?");
          return;
        }

        setLoading(true);
        try {
          // Convert to base64
          const arrayBuffer = await blob.arrayBuffer();
          const base64 = btoa(
            new Uint8Array(arrayBuffer).reduce(
              (data, byte) => data + String.fromCharCode(byte),
              ""
            )
          );

          const res = await fetch("/api/asr", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              audio: `data:${blob.type};base64,${base64}`,
              format: blob.type,
            }),
          });
          const data = await res.json();
          if (!res.ok) {
            throw new Error(data.error || "Transcription failed");
          }
          if (data.text?.trim()) {
            onTranscribed?.(data.text.trim());
          } else {
            setError("I couldn't make out what you said.");
          }
        } catch (err) {
          console.error("[useVoiceRecorder]", err);
          const msg = err instanceof Error ? err.message : "Transcription failed";
          setError(msg);
          onError?.(err instanceof Error ? err : new Error(msg));
        } finally {
          setLoading(false);
        }
      };

      recorder.start();
      mediaRecorderRef.current = recorder;
      setRecording(true);
    } catch (err) {
      console.error("[useVoiceRecorder] start failed:", err);
      const msg =
        err instanceof Error ? err.message : "Could not access microphone";
      setError(msg);
      onError?.(err instanceof Error ? err : new Error(msg));
      cleanupStream();
    }
  }, [cleanupStream, monitorLevel, onTranscribed, onError]);

  const stop = useCallback(() => {
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    }
    setRecording(false);
  }, []);

  const toggle = useCallback(async () => {
    if (recording) {
      stop();
    } else {
      await start();
    }
  }, [recording, start, stop]);

  return {
    recording,
    loading,
    error,
    start,
    stop,
    toggle,
    audioLevel,
  };
}

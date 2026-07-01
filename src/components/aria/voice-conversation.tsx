"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Mic, Square, Loader2, Volume2, Globe } from "lucide-react";
import { useVoiceRecorder } from "@/hooks/voice/use-voice-recorder";
import {
  useWebSpeechRecognition,
  isWebSpeechRecognitionSupported,
  type RecognitionLang,
} from "@/hooks/voice/use-web-speech-recognition";
import { useSpeech } from "@/hooks/voice/use-speech";
import { EssenceOrb } from "@/components/aria/essence-orb";
import { getMoodProfile } from "@/lib/aria/emotions";
import type { VoiceSettings } from "@/lib/aria/tts-providers";

interface VoiceExchange {
  id: string;
  userText: string;
  ariaText: string;
  mood?: string;
  timestamp: number;
}

interface VoiceConversationProps {
  speech: ReturnType<typeof useSpeech>;
  currentMood: string;
  onMoodChange: (mood: string) => void;
  settings: VoiceSettings;
  onSettingsChange: (patch: Partial<VoiceSettings>) => void;
}

const LANG_LABELS: Record<RecognitionLang, string> = {
  "en-IN": "EN",
  "hi-IN": "HI",
  "en-US": "US",
};

const LANG_FULL: Record<RecognitionLang, string> = {
  "en-IN": "English (India)",
  "hi-IN": "हिंदी",
  "en-US": "English (US)",
};

/**
 * Voice conversation mode — push to talk, ARIA hears, thinks, replies.
 * Uses the browser's Web Speech API for recognition (supports Hindi!)
 * with fallback to Z.ai ASR for browsers that don't support it.
 */
export function VoiceConversation({
  speech,
  currentMood,
  onMoodChange,
  settings,
  onSettingsChange,
}: VoiceConversationProps) {
  const [exchanges, setExchanges] = useState<VoiceExchange[]>([]);
  const [thinking, setThinking] = useState(false);
  const [partialUserText, setPartialUserText] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [conversationId, setConversationId] = useState<string | null>(null);

  const historyRef = useRef<HTMLDivElement>(null);
  const recognitionLang = settings.recognitionLang;

  const handleUserSpeech = useCallback(
    async (text: string) => {
      if (!text.trim()) return;
      setError(null);
      setThinking(true);
      setPartialUserText(text);

      try {
        const res = await fetch("/api/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            conversationId: conversationId ?? undefined,
            message: text,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Request failed");

        if (!conversationId) setConversationId(data.conversationId);

        const exchange: VoiceExchange = {
          id: data.message.id,
          userText: text,
          ariaText: data.message.content,
          mood: data.message.mood,
          timestamp: Date.now(),
        };
        setExchanges((prev) => [...prev, exchange]);
        setPartialUserText("");

        if (data.message.mood) onMoodChange(data.message.mood);

        void speech.speak(data.message.id, data.message.content);
      } catch (err) {
        console.error(err);
        setError(err instanceof Error ? err.message : "Something broke");
      } finally {
        setThinking(false);
      }
    },
    [conversationId, speech, onMoodChange]
  );

  // Web Speech recognition (browser-native, supports Hindi) — preferred
  const webSpeechSupported = isWebSpeechRecognitionSupported();
  const webRecognition = useWebSpeechRecognition({
    lang: recognitionLang,
    onFinalResult: (text) => {
      void handleUserSpeech(text);
    },
    onError: (err) => {
      if (err === "not-allowed") {
        setError("Mic permission denied. Allow mic access in your browser.");
      }
    },
  });

  // Z.ai ASR fallback (MediaRecorder + server transcription)
  const zaiRecorder = useVoiceRecorder({
    onTranscribed: (text) => {
      void handleUserSpeech(text);
    },
  });

  // Use whichever recognition is available
  const useWebSpeech = webSpeechSupported;
  const recording = useWebSpeech
    ? webRecognition.recording
    : zaiRecorder.recording;
  const loading = useWebSpeech ? false : zaiRecorder.loading;
  const recognitionError = useWebSpeech
    ? webRecognition.error
    : zaiRecorder.error;

  const handleMicToggle = useCallback(() => {
    if (useWebSpeech) {
      webRecognition.toggle();
    } else {
      void zaiRecorder.toggle();
    }
  }, [useWebSpeech, webRecognition, zaiRecorder]);

  // Auto-scroll history
  useEffect(() => {
    if (historyRef.current) {
      historyRef.current.scrollTo({
        top: historyRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  }, [
    exchanges,
    thinking,
    partialUserText,
    webRecognition.interimText,
  ]);

  // Cycle through languages: en-IN → hi-IN → en-US → en-IN
  const cycleLanguage = useCallback(() => {
    const langs: RecognitionLang[] = ["en-IN", "hi-IN", "en-US"];
    const currentIdx = langs.indexOf(recognitionLang);
    const nextLang = langs[(currentIdx + 1) % langs.length];
    onSettingsChange({ recognitionLang: nextLang });
  }, [recognitionLang, onSettingsChange]);

  const mp = getMoodProfile(currentMood);

  return (
    <div className="flex flex-col h-full bg-[#1a1614]">
      {/* Header */}
      <div className="px-4 py-3 border-b border-white/5 flex items-center justify-between">
        <div>
          <div className="text-sm font-medium tracking-wide">Voice mode</div>
          <div className="text-[10px] text-[#8a7d72]">
            {useWebSpeech
              ? "Browser voice recognition · Hindi supported"
              : "Server voice recognition · English only"}
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Language toggle */}
          {useWebSpeech && (
            <button
              onClick={cycleLanguage}
              className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider transition-colors border bg-[#3a2e28] border-[#7fd1c4]/40 text-[#7fd1c4] hover:bg-[#4a3a32]"
              title={`Recognition language: ${LANG_FULL[recognitionLang]}`}
            >
              <Globe className="w-3 h-3" />
              {LANG_LABELS[recognitionLang]}
            </button>
          )}
          {speech.speaking && (
            <div
              className="flex items-center gap-1.5 text-[10px]"
              style={{ color: mp.color }}
            >
              <Volume2 className="w-3 h-3" />
              speaking
            </div>
          )}
        </div>
      </div>

      {/* Conversation history */}
      <div
        ref={historyRef}
        className="flex-1 overflow-y-auto px-4 py-4 space-y-3"
      >
        {exchanges.length === 0 &&
          !partialUserText &&
          !thinking &&
          !webRecognition.interimText && (
            <div className="h-full flex flex-col items-center justify-center text-center px-6">
              <p className="text-sm text-[#8a7d72] leading-relaxed mb-2">
                Tap the mic and just talk.
              </p>
              <p className="text-[11px] text-[#5a4a42] leading-relaxed max-w-xs">
                {useWebSpeech
                  ? `Speak in ${LANG_FULL[recognitionLang]}. ARIA listens, thinks, and replies by voice.`
                  : "ARIA listens, thinks, and replies by voice. Your exchange shows up here as a transcript."}
              </p>
              {!useWebSpeech && (
                <p className="text-[10px] text-amber-400/60 mt-3 max-w-xs">
                  For Hindi voice input, use Chrome or Edge browser.
                </p>
              )}
            </div>
          )}

        {exchanges.map((ex) => (
          <div key={ex.id} className="space-y-1.5">
            {/* User line */}
            <div className="flex justify-end">
              <div className="max-w-[80%] bg-[#3a2e28] text-[#e8e2db] rounded-2xl rounded-tr-md px-3 py-2 text-xs leading-relaxed">
                {ex.userText}
              </div>
            </div>
            {/* ARIA line */}
            <div className="flex gap-2">
              <div
                className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 flex items-center justify-center text-[9px] font-bold"
                style={{
                  background: `linear-gradient(135deg, ${getMoodProfile(ex.mood).color}, ${getMoodProfile(ex.mood).glow})`,
                  color: "#1a1614",
                }}
              >
                A
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5 mb-0.5">
                  <span className="text-[10px] font-medium text-[#e8e2db]">
                    ARIA
                  </span>
                  <span
                    className="text-[9px] italic"
                    style={{ color: getMoodProfile(ex.mood).color }}
                  >
                    {getMoodProfile(ex.mood).label.toLowerCase()}
                  </span>
                </div>
                <div className="text-xs leading-relaxed text-[#d4cabd]">
                  {ex.ariaText}
                </div>
              </div>
            </div>
          </div>
        ))}

        {/* Live interim transcript (Web Speech only) */}
        {useWebSpeech && webRecognition.interimText && !thinking && (
          <div className="flex justify-end">
            <div className="max-w-[80%] bg-[#3a2e28]/40 text-[#8a7d72] rounded-2xl rounded-tr-md px-3 py-2 text-xs italic">
              {webRecognition.interimText}
              <span className="inline-block w-1 h-3 ml-0.5 bg-[#8a7d72] animate-pulse" />
            </div>
          </div>
        )}

        {/* Partial user transcript while ARIA thinks */}
        <AnimatePresence>
          {partialUserText && (
            <motion.div
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex justify-end"
            >
              <div className="max-w-[80%] bg-[#3a2e28]/60 text-[#8a7d72] rounded-2xl rounded-tr-md px-3 py-2 text-xs italic">
                {partialUserText}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Thinking indicator */}
        {thinking && (
          <div className="flex gap-2">
            <div className="w-6 h-6 rounded-full flex-shrink-0 mt-0.5 bg-gradient-to-br from-[#7fd1c4] to-[#5a9b8f] flex items-center justify-center text-[9px] font-bold text-[#1a1614]">
              A
            </div>
            <div className="flex items-center gap-1.5 py-2">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8a7d72] animate-bounce [animation-delay:-0.3s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#8a7d72] animate-bounce [animation-delay:-0.15s]" />
              <span className="w-1.5 h-1.5 rounded-full bg-[#8a7d72] animate-bounce" />
            </div>
          </div>
        )}

        {error && (
          <div className="text-xs text-red-300 px-3 py-2 rounded-md bg-red-900/20 border border-red-400/20">
            {error}
          </div>
        )}
        {recognitionError && !error && (
          <div className="text-xs text-amber-300 px-3 py-2 rounded-md bg-amber-900/20 border border-amber-400/20">
            {recognitionError}
          </div>
        )}
      </div>

      {/* Orb + Mic control */}
      <div className="border-t border-white/5 px-4 py-4">
        {/* Live recording indicator */}
        {recording && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#3a2e28] border border-red-400/30">
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2 w-2 bg-red-400" />
            </span>
            <span className="text-xs text-[#e8e2db]">
              {useWebSpeech ? "listening" : "recording"}…
            </span>
            {useWebSpeech && webRecognition.interimText && (
              <span className="text-[10px] text-[#8a7d72] italic flex-1 truncate">
                {webRecognition.interimText}
              </span>
            )}
            <button
              onClick={handleMicToggle}
              className="text-[10px] uppercase tracking-wider text-red-300 hover:text-red-200"
            >
              stop
            </button>
          </div>
        )}

        {loading && (
          <div className="mb-3 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#3a2e28] border border-white/5">
            <Loader2 className="w-3 h-3 animate-spin text-[#7fd1c4]" />
            <span className="text-xs text-[#8a7d72]">transcribing…</span>
          </div>
        )}

        {/* Big mic button + orb */}
        <div className="flex items-center justify-center gap-6">
          <div className="hidden sm:block">
            <EssenceOrb
              mood={currentMood}
              thinking={thinking}
              size={80}
              showLabel={false}
            />
          </div>

          <button
            onClick={handleMicToggle}
            disabled={thinking || loading || speech.speaking}
            className={`relative w-20 h-20 rounded-full flex items-center justify-center transition-all disabled:opacity-40 ${
              recording
                ? "bg-red-500/20 border-2 border-red-400"
                : "bg-[#3a2e28] border-2 border-[#7fd1c4]/40 hover:border-[#7fd1c4] hover:scale-105"
            }`}
            title={recording ? "Stop" : "Push to talk"}
            aria-label={recording ? "Stop recording" : "Start voice input"}
          >
            {recording ? (
              <Square className="w-7 h-7 fill-red-400 text-red-400" />
            ) : (
              <Mic className="w-8 h-8" style={{ color: mp.color }} />
            )}
            {!recording && !thinking && (
              <span
                className="absolute inset-0 rounded-full animate-ping opacity-20"
                style={{ background: mp.color, animationDuration: "3s" }}
              />
            )}
          </button>

          <div className="hidden sm:block w-20">
            {speech.speaking && (
              <div className="text-center">
                <div
                  className="flex gap-0.5 items-end h-3 justify-center"
                  aria-hidden
                >
                  {[0, 1, 2, 3].map((i) => (
                    <span
                      key={i}
                      className="w-0.5 rounded-sm animate-pulse"
                      style={{
                        height: `${30 + Math.sin(i) * 30 + 40}%`,
                        background: mp.color,
                        animationDelay: `${i * 0.1}s`,
                        animationDuration: "0.6s",
                      }}
                    />
                  ))}
                </div>
                <div
                  className="text-[9px] mt-1 uppercase tracking-wider"
                  style={{ color: mp.color }}
                >
                  speaking
                </div>
              </div>
            )}
          </div>
        </div>

        <div className="text-center mt-3 text-[10px] text-[#8a7d72]">
          {recording
            ? useWebSpeech
              ? "Listening — speak naturally"
              : "Tap stop when you're done talking"
            : thinking
              ? "ARIA is thinking…"
              : speech.speaking
                ? "ARIA is replying…"
                : `Tap mic and speak · ${LANG_FULL[recognitionLang]}`}
        </div>
      </div>
    </div>
  );
}

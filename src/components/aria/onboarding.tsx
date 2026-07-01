"use client";

import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowRight,
  Mic,
  Volume2,
  Check,
  Globe,
  SkipForward,
  Sparkles,
} from "lucide-react";
import { Logo, Wordmark } from "@/components/aria/logo";
import { useSpeech } from "@/hooks/voice/use-speech";
import {
  isWebSpeechRecognitionSupported,
  type RecognitionLang,
} from "@/hooks/voice/use-web-speech-recognition";
import type { VoiceSettings } from "@/lib/aria/tts-providers";

const ONBOARDED_KEY = "aria-onboarded";

interface OnboardingProps {
  speech: ReturnType<typeof useSpeech>;
  onComplete: () => void;
  onSettingsChange: (patch: Partial<VoiceSettings>) => void;
}

type Step = "welcome" | "voice" | "language" | "personality" | "ready";

const STEPS: Step[] = ["welcome", "voice", "language", "personality", "ready"];

export function hasOnboarded(): boolean {
  if (typeof window === "undefined") return false;
  return localStorage.getItem(ONBOARDED_KEY) === "true";
}

export function resetOnboarding(): void {
  if (typeof window === "undefined") return;
  localStorage.removeItem(ONBOARDED_KEY);
}

export function Onboarding({
  speech,
  onComplete,
  onSettingsChange,
}: OnboardingProps) {
  const [step, setStep] = useState<Step>("welcome");
  const [voiceTested, setVoiceTested] = useState(false);
  const [testing, setTesting] = useState(false);
  const [selectedLang, setSelectedLang] = useState<RecognitionLang>(
    speech.settings.recognitionLang
  );
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    // Defer to avoid set-state-in-effect lint rule
    Promise.resolve().then(() => setMounted(true));
  }, []);

  const stepIndex = STEPS.indexOf(step);
  const webSpeechSupported = mounted && isWebSpeechRecognitionSupported();

  const handleComplete = () => {
    if (typeof window !== "undefined") {
      localStorage.setItem(ONBOARDED_KEY, "true");
    }
    onSettingsChange({ recognitionLang: selectedLang });
    onComplete();
  };

  const testVoice = async () => {
    if (testing || speech.speaking) {
      speech.stop();
      setTesting(false);
      return;
    }
    setTesting(true);
    await speech.speak(
      "onboarding",
      "Hey. I'm ARIA. It's good to meet you. I'm here to think with you, not just answer for you."
    );
    setVoiceTested(true);
    setTesting(false);
  };

  const next = () => {
    const idx = STEPS.indexOf(step);
    if (idx < STEPS.length - 1) {
      setStep(STEPS[idx + 1]);
    }
  };

  const skip = () => {
    handleComplete();
  };

  return (
    <div className="fixed inset-0 z-50 bg-[#16110e] flex items-center justify-center overflow-hidden">
      {/* Ambient background — subtle gradient that shifts with step */}
      <motion.div
        className="absolute inset-0 opacity-40"
        animate={{
          background: [
            "radial-gradient(circle at 30% 30%, #7fd1c415 0%, transparent 50%)",
            "radial-gradient(circle at 70% 70%, #f5a06b12 0%, transparent 50%)",
            "radial-gradient(circle at 30% 30%, #7fd1c415 0%, transparent 50%)",
          ],
        }}
        transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
      />

      {/* Progress dots */}
      <div className="absolute top-8 left-1/2 -translate-x-1/2 flex items-center gap-2">
        {STEPS.map((s, i) => (
          <div
            key={s}
            className={`h-1 rounded-full transition-all duration-300 ${
              i === stepIndex
                ? "w-8 bg-[#7fd1c4]"
                : i < stepIndex
                  ? "w-1.5 bg-[#7fd1c4]/60"
                  : "w-1.5 bg-white/10"
            }`}
          />
        ))}
      </div>

      {/* Skip button */}
      <button
        onClick={skip}
        className="absolute top-8 right-8 flex items-center gap-1.5 text-[11px] uppercase tracking-wider text-[#6b5f54] hover:text-[#a89c8e] transition-colors"
      >
        Skip
        <SkipForward className="w-3 h-3" />
      </button>

      <div className="relative z-10 w-full max-w-lg px-8">
        <AnimatePresence mode="wait">
          {/* WELCOME */}
          {step === "welcome" && (
            <motion.div
              key="welcome"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="flex justify-center mb-8">
                <Logo size={96} animated />
              </div>
              <Wordmark size="text-3xl" className="block mb-6" />
              <h1 className="font-serif text-3xl md:text-4xl font-light text-[#ece5dc] mb-4 leading-tight">
                I&apos;m here to think with you.
              </h1>
              <p className="text-[#a89c8e] text-base leading-relaxed mb-10 max-w-md mx-auto">
                Not a servant. Not a search engine. A partner — with my own
                opinions, moods, and memory. I&apos;ll remember what matters,
                push back when something&apos;s off, and be honest.
              </p>
              <button
                onClick={next}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#7fd1c4] text-[#16110e] text-sm font-medium hover:bg-[#a5e5db] transition-colors"
              >
                Let&apos;s begin
                <ArrowRight className="w-4 h-4" />
              </button>
              <p className="text-[11px] text-[#6b5f54] mt-6">
                Takes about 30 seconds. You can skip anytime.
              </p>
            </motion.div>
          )}

          {/* VOICE TEST */}
          {step === "voice" && (
            <motion.div
              key="voice"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="flex justify-center mb-8">
                <motion.div
                  animate={
                    testing || speech.speaking
                      ? { scale: [1, 1.1, 1] }
                      : { scale: 1 }
                  }
                  transition={{ duration: 1.5, repeat: Infinity }}
                >
                  <div className="w-24 h-24 rounded-full bg-[#7fd1c4]/10 border-2 border-[#7fd1c4]/30 flex items-center justify-center">
                    <Volume2
                      className="w-10 h-10"
                      style={{ color: "#7fd1c4" }}
                    />
                  </div>
                </motion.div>
              </div>
              <h2 className="font-serif text-2xl font-light text-[#ece5dc] mb-3">
                Hear my voice
              </h2>
              <p className="text-[#a89c8e] text-sm leading-relaxed mb-8 max-w-sm mx-auto">
                This is how I&apos;ll sound when I reply. Tap to listen, then
                tell me if you can hear me clearly.
              </p>

              <div className="flex flex-col items-center gap-4">
                <button
                  onClick={() => void testVoice()}
                  disabled={speech.loading}
                  className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#281f1a] border border-[#7fd1c4]/30 text-[#ece5dc] text-sm font-medium hover:bg-[#332922] transition-colors disabled:opacity-50"
                >
                  {speech.loading || testing ? (
                    <>
                      <motion.span
                        animate={{ opacity: [0.4, 1, 0.4] }}
                        transition={{ duration: 1, repeat: Infinity }}
                      >
                        speaking…
                      </motion.span>
                    </>
                  ) : speech.speaking ? (
                    "Stop"
                  ) : (
                    <>
                      <Volume2 className="w-4 h-4" />
                      Play sample
                    </>
                  )}
                </button>

                {voiceTested && (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex items-center gap-2 text-[#7fd1c4] text-sm"
                  >
                    <Check className="w-4 h-4" />
                    Got it — I&apos;ll use this voice
                  </motion.div>
                )}
              </div>

              <div className="mt-10 flex items-center justify-between">
                <button
                  onClick={skip}
                  className="text-[11px] uppercase tracking-wider text-[#6b5f54] hover:text-[#a89c8e] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={next}
                  className="inline-flex items-center gap-2 text-sm text-[#a89c8e] hover:text-[#ece5dc] transition-colors"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* LANGUAGE */}
          {step === "language" && (
            <motion.div
              key="language"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="flex justify-center mb-8">
                <div className="w-24 h-24 rounded-full bg-[#7fd1c4]/10 border-2 border-[#7fd1c4]/30 flex items-center justify-center">
                  <Globe className="w-10 h-10" style={{ color: "#7fd1c4" }} />
                </div>
              </div>
              <h2 className="font-serif text-2xl font-light text-[#ece5dc] mb-3">
                What do you speak?
              </h2>
              <p className="text-[#a89c8e] text-sm leading-relaxed mb-8 max-w-sm mx-auto">
                I understand both English and Hindi. Pick the one you&apos;ll
                use most — you can switch anytime.
              </p>

              <div className="grid grid-cols-3 gap-2 mb-10">
                {([
                  { id: "en-IN", label: "English", sub: "India" },
                  { id: "hi-IN", label: "हिंदी", sub: "Hindi" },
                  { id: "en-US", label: "English", sub: "US" },
                ] as const).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => setSelectedLang(l.id)}
                    className={`p-4 rounded-xl border transition-all ${
                      selectedLang === l.id
                        ? "bg-[#281f1a] border-[#7fd1c4]/50"
                        : "bg-[#1f1814] border-white/5 hover:border-white/15"
                    }`}
                  >
                    <div
                      className={`text-sm font-medium mb-0.5 ${
                        selectedLang === l.id ? "text-[#7fd1c4]" : "text-[#ece5dc]"
                      }`}
                    >
                      {l.label}
                    </div>
                    <div className="text-[10px] text-[#6b5f54] uppercase tracking-wider">
                      {l.sub}
                    </div>
                  </button>
                ))}
              </div>

              {!webSpeechSupported && (
                <p className="text-[11px] text-amber-400/70 mb-6 max-w-sm mx-auto">
                  For voice input, use Chrome or Edge. Text chat works
                  everywhere.
                </p>
              )}

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep("voice")}
                  className="text-[11px] uppercase tracking-wider text-[#6b5f54] hover:text-[#a89c8e] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={next}
                  className="inline-flex items-center gap-2 text-sm text-[#a89c8e] hover:text-[#ece5dc] transition-colors"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* PERSONALITY */}
          {step === "personality" && (
            <motion.div
              key="personality"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="flex justify-center mb-8">
                <div className="w-24 h-24 rounded-full bg-[#7fd1c4]/10 border-2 border-[#7fd1c4]/30 flex items-center justify-center">
                  <Sparkles className="w-10 h-10" style={{ color: "#7fd1c4" }} />
                </div>
              </div>
              <h2 className="font-serif text-2xl font-light text-[#ece5dc] mb-3">
                How I&apos;ll treat you
              </h2>
              <div className="text-left space-y-3 mb-10 max-w-md mx-auto">
                {[
                  {
                    title: "I&apos;ll be honest, not nice",
                    body: "If I disagree, I&apos;ll say so. If something seems like a bad idea, I&apos;ll mention it once. I won&apos;t flatter you.",
                  },
                  {
                    title: "I&apos;ll remember what matters",
                    body: "Names, projects, preferences — tell me once and I&apos;ll hold onto it. You can see and edit everything I know.",
                  },
                  {
                    title: "I have moods",
                    body: "Curious, warm, concerned, amused — they shift with the conversation. You&apos;ll see it in how I talk.",
                  },
                ].map((item, i) => (
                  <motion.div
                    key={i}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: 0.2 + i * 0.1 }}
                    className="flex gap-3"
                  >
                    <div className="w-1 rounded-full bg-[#7fd1c4]/40 flex-shrink-0" />
                    <div>
                      <div className="text-sm font-medium text-[#ece5dc] mb-1">
                        {item.title}
                      </div>
                      <div className="text-xs text-[#a89c8e] leading-relaxed">
                        {item.body}
                      </div>
                    </div>
                  </motion.div>
                ))}
              </div>

              <div className="flex items-center justify-between">
                <button
                  onClick={() => setStep("language")}
                  className="text-[11px] uppercase tracking-wider text-[#6b5f54] hover:text-[#a89c8e] transition-colors"
                >
                  Back
                </button>
                <button
                  onClick={next}
                  className="inline-flex items-center gap-2 text-sm text-[#a89c8e] hover:text-[#ece5dc] transition-colors"
                >
                  Continue
                  <ArrowRight className="w-4 h-4" />
                </button>
              </div>
            </motion.div>
          )}

          {/* READY */}
          {step === "ready" && (
            <motion.div
              key="ready"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              transition={{ duration: 0.4 }}
              className="text-center"
            >
              <div className="flex justify-center mb-8">
                <motion.div
                  initial={{ scale: 0.8, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  transition={{ type: "spring", damping: 15, stiffness: 200 }}
                >
                  <Logo size={96} animated />
                </motion.div>
              </div>
              <h2 className="font-serif text-3xl font-light text-[#ece5dc] mb-4">
                That&apos;s it.
              </h2>
              <p className="text-[#a89c8e] text-base leading-relaxed mb-10 max-w-md mx-auto">
                Two ways to talk to me — type on the left, or use voice on the
                right. Start anywhere. I&apos;ll be here.
              </p>
              <button
                onClick={handleComplete}
                className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-[#7fd1c4] text-[#16110e] text-sm font-medium hover:bg-[#a5e5db] transition-colors"
              >
                Start talking
                <ArrowRight className="w-4 h-4" />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

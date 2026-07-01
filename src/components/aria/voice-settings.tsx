"use client";

import { useState } from "react";
import { Settings2, Play, Square, Loader2 } from "lucide-react";
import { useSpeech } from "@/hooks/voice/use-speech";
import { VOICE_PRESETS, type VoicePreset } from "@/lib/aria/voice-presets";

interface VoiceSettingsProps {
  speech: ReturnType<typeof useSpeech>;
}

const PRESET_ORDER: VoicePreset[] = [
  "friday",
  "warm",
  "default",
  "crisp",
  "deep",
];

/**
 * Voice settings popover — preset picker, speed slider, test button.
 */
export function VoiceSettings({ speech }: VoiceSettingsProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);

  const testVoice = async () => {
    if (speech.speaking || testing) {
      speech.stop();
      setTesting(false);
      return;
    }
    setTesting(true);
    await speech.speak(
      "voice-test",
      "Hey. I'm ARIA. If I sound off, try a different preset — each one is a slightly different voice."
    );
    setTesting(false);
  };

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] uppercase tracking-wider transition-colors border ${
          open
            ? "bg-[#3a2e28] border-white/15 text-[#e8e2db]"
            : "bg-transparent border-white/5 text-[#8a7d72] hover:text-[#e8e2db] hover:bg-white/5"
        }`}
        title="Voice settings"
        aria-label="Voice settings"
      >
        <Settings2 className="w-3 h-3" />
        <span className="hidden sm:inline">voice</span>
      </button>

      {open && (
        <>
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-80 z-40 rounded-xl bg-[#221c19] border border-white/10 shadow-2xl p-4 max-h-[80vh] overflow-y-auto">
            <div className="text-xs font-medium text-[#e8e2db] mb-1">
              Voice preset
            </div>
            <div className="text-[10px] text-[#8a7d72] mb-4">
              The base TTS has one voice. We post-process it with pitch shift,
              EQ, and reverb to get closer to different characters.
            </div>

            {/* Preset picker */}
            <div className="space-y-1.5 mb-4">
              {PRESET_ORDER.map((p) => {
                const cfg = VOICE_PRESETS[p];
                const active = speech.preset === p;
                return (
                  <button
                    key={p}
                    onClick={() => speech.setPreset(p)}
                    className={`w-full text-left px-3 py-2 rounded-md border transition-colors ${
                      active
                        ? "bg-[#3a2e28] border-[#7fd1c4]/40"
                        : "bg-white/[0.02] border-white/5 hover:bg-white/5"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`text-xs font-medium ${
                          active ? "text-[#7fd1c4]" : "text-[#e8e2db]"
                        }`}
                      >
                        {cfg.label}
                      </span>
                      {active && (
                        <span className="text-[9px] uppercase tracking-wider text-[#7fd1c4]">
                          active
                        </span>
                      )}
                    </div>
                    <div className="text-[10px] text-[#8a7d72] mt-0.5 leading-snug">
                      {cfg.description}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Speed slider */}
            <div className="mb-4 pt-3 border-t border-white/5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] uppercase tracking-wider text-[#8a7d72]">
                  Speed
                </label>
                <span className="text-[10px] text-[#e8e2db] font-mono">
                  {speech.speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={speech.speed}
                onChange={(e) => speech.setSpeed(parseFloat(e.target.value))}
                className="w-full accent-[#7fd1c4]"
              />
              <div className="flex justify-between text-[9px] text-[#8a7d72] mt-1">
                <span>slower</span>
                <span>faster</span>
              </div>
            </div>

            {/* Progress */}
            {speech.progress && (
              <div className="mb-3 text-[10px] text-[#8a7d72]">
                speaking chunk {speech.progress.current + 1} of{" "}
                {speech.progress.total}
              </div>
            )}

            <button
              onClick={() => void testVoice()}
              disabled={speech.loading}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-md bg-[#3a2e28] hover:bg-[#4a3a32] text-xs text-[#e8e2db] transition-colors disabled:opacity-50"
            >
              {speech.loading ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : speech.speaking ? (
                <Square className="w-3 h-3 fill-current" />
              ) : (
                <Play className="w-3 h-3 fill-current" />
              )}
              {speech.speaking || speech.loading ? "Stop" : "Test voice"}
            </button>

            <div className="mt-3 pt-3 border-t border-white/5 text-[10px] text-[#8a7d72] leading-relaxed">
              Friday preset is the closest to Iron Man&apos;s assistant —
              lower pitch, subtle reverb, intimate presence.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

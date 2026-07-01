"use client";

import { useState } from "react";
import { Settings2, Play, Square, Loader2 } from "lucide-react";
import { useSpeech } from "@/hooks/voice/use-speech";

interface VoiceSettingsProps {
  speech: ReturnType<typeof useSpeech>;
}

/**
 * Compact voice settings popover — speed slider, test button.
 * Lets the user tune ARIA's voice in real time.
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
      "Hey. I'm ARIA. If I sound off, slow me down a little — that usually helps."
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
          {/* backdrop to close on outside click */}
          <div
            className="fixed inset-0 z-30"
            onClick={() => setOpen(false)}
          />
          <div className="absolute right-0 top-full mt-2 w-72 z-40 rounded-xl bg-[#221c19] border border-white/10 shadow-2xl p-4">
            <div className="text-xs font-medium text-[#e8e2db] mb-1">
              Voice
            </div>
            <div className="text-[10px] text-[#8a7d72] mb-4">
              Tongtong · the only voice on this API. Tune speed for warmth.
            </div>

            <div className="mb-4">
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
                <span>slower / warmer</span>
                <span>faster</span>
              </div>
            </div>

            {speech.progress && (
              <div className="mb-3 text-[10px] text-[#8a7d72]">
                speaking sentence {speech.progress.current + 1} of{" "}
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
              Tip: 0.85-0.95 usually sounds most natural. Slower isn't always
              warmer — too slow sounds drugged.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

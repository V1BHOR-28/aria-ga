"use client";

import { useEffect, useState } from "react";
import { Settings2, Play, Square, Loader2, ExternalLink } from "lucide-react";
import { useSpeech } from "@/hooks/voice/use-speech";
import {
  TTS_PROVIDERS,
  type TtsProviderId,
  type VoiceSettings as VoiceSettingsType,
} from "@/lib/aria/tts-providers";
import {
  getWebSpeechVoices,
  isWebSpeechSupported,
  primeWebSpeechVoices,
} from "@/lib/aria/tts-web-speech";

interface VoiceSettingsProps {
  speech: ReturnType<typeof useSpeech>;
}

export function VoiceSettings({ speech }: VoiceSettingsProps) {
  const [open, setOpen] = useState(false);
  const [testing, setTesting] = useState(false);
  const [webSpeechVoices, setWebSpeechVoices] = useState<
    ReturnType<typeof getWebSpeechVoices>
  >([]);

  const { settings } = speech;

  useEffect(() => {
    if (open && settings.provider === "web-speech") {
      void primeWebSpeechVoices().then(() => {
        setWebSpeechVoices(getWebSpeechVoices());
      });
    }
  }, [open, settings.provider]);

  const testVoice = async () => {
    if (speech.speaking || testing) {
      speech.stop();
      setTesting(false);
      return;
    }
    setTesting(true);
    await speech.speak(
      "voice-test",
      "Hey. I'm ARIA. If I sound off, try a different voice in settings."
    );
    setTesting(false);
  };

  const update = (patch: Partial<VoiceSettingsType>) => {
    speech.updateSettings(patch);
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
          <div className="fixed inset-0 z-30" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-2 w-96 z-40 rounded-xl bg-[#221c19] border border-white/10 shadow-2xl p-4 max-h-[80vh] overflow-y-auto">
            <div className="text-xs font-medium text-[#e8e2db] mb-1">
              Voice provider
            </div>
            <div className="text-[10px] text-[#8a7d72] mb-4">
              Pick a TTS engine. Browser voices are free and run locally — try
              those first.
            </div>

            {/* Provider picker */}
            <div className="space-y-1.5 mb-4">
              {(Object.keys(TTS_PROVIDERS) as TtsProviderId[]).map((pid) => {
                const cfg = TTS_PROVIDERS[pid];
                const active = settings.provider === pid;
                const disabled = pid === "web-speech" && !isWebSpeechSupported();
                return (
                  <button
                    key={pid}
                    onClick={() => !disabled && update({ provider: pid, voiceId: "" })}
                    disabled={disabled}
                    className={`w-full text-left px-3 py-2 rounded-md border transition-colors disabled:opacity-40 ${
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
                      <div className="flex items-center gap-1.5">
                        {cfg.runsClientSide && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-[#7fd1c4]/10 text-[#7fd1c4]">
                            free
                          </span>
                        )}
                        {cfg.requiresApiKey && (
                          <span className="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                            API key
                          </span>
                        )}
                        {active && (
                          <span className="text-[9px] uppercase tracking-wider text-[#7fd1c4]">
                            active
                          </span>
                        )}
                      </div>
                    </div>
                    <div className="text-[10px] text-[#8a7d72] mt-0.5 leading-snug">
                      {cfg.description}
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Voice picker — Web Speech */}
            {settings.provider === "web-speech" && (
              <div className="mb-4 pt-3 border-t border-white/5">
                <label className="text-[10px] uppercase tracking-wider text-[#8a7d72] mb-1.5 block">
                  Voice
                </label>
                {!isWebSpeechSupported() ? (
                  <p className="text-[10px] text-red-300">
                    Web Speech API not supported in this browser. Try Chrome or
                    Edge.
                  </p>
                ) : webSpeechVoices.length === 0 ? (
                  <p className="text-[10px] text-[#8a7d72]">
                    Loading voices…
                  </p>
                ) : (
                  <select
                    value={settings.voiceId}
                    onChange={(e) => update({ voiceId: e.target.value })}
                    className="w-full bg-[#1a1614] border border-white/10 rounded-md px-2 py-1.5 text-xs text-[#e8e2db] focus:outline-none focus:ring-1 focus:ring-[#7fd1c4]"
                  >
                    <option value="">Auto (best female English voice)</option>
                    {webSpeechVoices.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.label} ({v.description})
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-[10px] text-[#8a7d72] mt-1.5">
                  Tip: &quot;Aria&quot; or &quot;Jenny&quot; voices (Microsoft)
                  sound most Friday-like.
                </p>
              </div>
            )}

            {/* API key — ElevenLabs (stored encrypted server-side) */}
            {settings.provider === "elevenlabs" && (
              <div className="mb-4 pt-3 border-t border-white/5">
                <label className="text-[10px] uppercase tracking-wider text-[#8a7d72] mb-1.5 block">
                  ElevenLabs API Key
                </label>
                <ElevenLabsKeyInput />
                <a
                  href="https://elevenlabs.io/app/settings/api-keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] text-[#7fd1c4] hover:underline mt-1.5 inline-flex items-center gap-1"
                >
                  Get an API key <ExternalLink className="w-2.5 h-2.5" />
                </a>
                <p className="text-[10px] text-[#8a7d72] mt-1.5">
                  Stored encrypted on the server. Never sent to the browser after saving.
                </p>
                <label className="text-[10px] uppercase tracking-wider text-[#8a7d72] mb-1.5 mt-3 block">
                  Voice ID (optional)
                </label>
                <input
                  type="text"
                  value={settings.voiceId}
                  onChange={(e) => update({ voiceId: e.target.value })}
                  placeholder="21m00Tcm4TlvDq8ikWAM (Rachel)"
                  className="w-full bg-[#1a1614] border border-white/10 rounded-md px-2 py-1.5 text-xs text-[#e8e2db] focus:outline-none focus:ring-1 focus:ring-[#7fd1c4]"
                />
                <p className="text-[10px] text-[#8a7d72] mt-1.5">
                  Find voice IDs in the ElevenLabs Voice Library.
                </p>
              </div>
            )}

            {/* Voice input language (for speech recognition) */}
            <div className="mb-4 pt-3 border-t border-white/5">
              <label className="text-[10px] uppercase tracking-wider text-[#8a7d72] mb-1.5 block">
                Voice input language
              </label>
              <p className="text-[10px] text-[#8a7d72] mb-2 leading-snug">
                What language do you speak to ARIA? (Browser voice recognition only — Chrome/Edge)
              </p>
              <div className="flex gap-1.5">
                {([
                  { id: "en-IN", label: "English (India)" },
                  { id: "hi-IN", label: "हिंदी" },
                  { id: "en-US", label: "English (US)" },
                ] as const).map((l) => (
                  <button
                    key={l.id}
                    onClick={() => update({ recognitionLang: l.id })}
                    className={`flex-1 px-2 py-1.5 rounded-md text-[10px] transition-colors border ${
                      settings.recognitionLang === l.id
                        ? "bg-[#3a2e28] border-[#7fd1c4]/40 text-[#7fd1c4]"
                        : "bg-white/[0.02] border-white/5 text-[#8a7d72] hover:bg-white/5"
                    }`}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Speed slider */}
            <div className="mb-4 pt-3 border-t border-white/5">
              <div className="flex items-center justify-between mb-1.5">
                <label className="text-[10px] uppercase tracking-wider text-[#8a7d72]">
                  Speed
                </label>
                <span className="text-[10px] text-[#e8e2db] font-mono">
                  {settings.speed.toFixed(2)}x
                </span>
              </div>
              <input
                type="range"
                min={0.5}
                max={1.5}
                step={0.05}
                value={settings.speed}
                onChange={(e) =>
                  update({ speed: parseFloat(e.target.value) })
                }
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
              Browser Voices are the fastest path to a Friday-like sound —
              Microsoft&apos;s &quot;Aria&quot; or &quot;Jenny&quot; voices (in
              Edge / Chrome on Windows) are very close.
            </div>
          </div>
        </>
      )}
    </div>
  );
}

/**
 * ElevenLabs API key input — stores the key encrypted on the server.
 * The plaintext key is never stored in localStorage and never returned
 * to the browser after saving.
 */
function ElevenLabsKeyInput() {
  const [keyInput, setKeyInput] = useState("");
  const [configured, setConfigured] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Check if a key is already configured on the server
  useEffect(() => {
    void fetch("/api/settings/keys")
      .then((r) => r.json())
      .then((data) => {
        if (data.providers?.includes("elevenlabs")) {
          setConfigured(true);
        }
      })
      .catch(() => {});
  }, []);

  const save = async () => {
    if (!keyInput.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/settings/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ provider: "elevenlabs", key: keyInput.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to save key");
      }
      setConfigured(true);
      setKeyInput(""); // Clear the input — key is on the server now
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    setSaving(true);
    try {
      await fetch("/api/settings/keys?provider=elevenlabs", {
        method: "DELETE",
      });
      setConfigured(false);
    } catch {
      // ignore
    } finally {
      setSaving(false);
    }
  };

  if (configured) {
    return (
      <div className="flex items-center gap-2">
        <div className="flex-1 px-3 py-1.5 rounded-md bg-[#7fd1c4]/10 border border-[#7fd1c4]/20 text-xs text-[#7fd1c4]">
          ✓ Key configured (stored encrypted on server)
        </div>
        <button
          onClick={() => void remove()}
          disabled={saving}
          className="px-2 py-1.5 rounded-md text-[10px] uppercase tracking-wider text-red-400 hover:bg-red-400/10 transition-colors disabled:opacity-50"
        >
          Remove
        </button>
      </div>
    );
  }

  return (
    <div>
      <div className="flex gap-1.5">
        <input
          type="password"
          value={keyInput}
          onChange={(e) => setKeyInput(e.target.value)}
          placeholder="sk-..."
          className="flex-1 bg-[#1a1614] border border-white/10 rounded-md px-2 py-1.5 text-xs text-[#e8e2db] focus:outline-none focus:ring-1 focus:ring-[#7fd1c4]"
        />
        <button
          onClick={() => void save()}
          disabled={saving || !keyInput.trim()}
          className="px-3 py-1.5 rounded-md text-[10px] uppercase tracking-wider bg-[#7fd1c4] text-[#1a1614] hover:bg-[#a5e5db] transition-colors disabled:opacity-50"
        >
          {saving ? "…" : "Save"}
        </button>
      </div>
      {error && (
        <p className="text-[10px] text-red-400 mt-1">{error}</p>
      )}
    </div>
  );
}

// ARIA — TTS Provider abstraction
//
// Pluggable TTS system. Each provider implements the same interface.
// The active provider is chosen in voice settings and persisted in
// localStorage.

export type TtsProviderId = "web-speech" | "zai" | "elevenlabs";

export interface TtsVoice {
  id: string;
  label: string;
  description: string;
  provider: TtsProviderId;
  // Optional metadata
  lang?: string;
  gender?: "female" | "male" | "unknown";
}

export interface TtsProviderConfig {
  id: TtsProviderId;
  label: string;
  description: string;
  requiresApiKey: boolean;
  apiKeyLabel?: string;
  apiKeyName?: string;
  runsClientSide: boolean; // true = no server call needed
}

export const TTS_PROVIDERS: Record<TtsProviderId, TtsProviderConfig> = {
  "web-speech": {
    id: "web-speech",
    label: "Browser Voices",
    description:
      "Built into your browser. Free, no API key, multiple voices. Quality varies by OS — Chrome on desktop has the best voices.",
    requiresApiKey: false,
    runsClientSide: true,
  },
  zai: {
    id: "zai",
    label: "Z.ai (Friday preset)",
    description:
      "Z.ai TTS with ffmpeg post-processing for the Friday voice. Server-side, rate-limited, one base voice.",
    requiresApiKey: false,
    runsClientSide: false,
  },
  elevenlabs: {
    id: "elevenlabs",
    label: "ElevenLabs",
    description:
      "Highest quality voices, including voice cloning. Requires API key from elevenlabs.io. Server-side.",
    requiresApiKey: true,
    apiKeyLabel: "ElevenLabs API Key",
    apiKeyName: "elevenlabs_api_key",
    runsClientSide: false,
  },
};

// Persisted voice settings — stored in localStorage
// NOTE: API keys are NOT stored here. They're stored encrypted server-side
// via /api/settings/keys. The client only knows which providers have keys
// configured (fetched from the server), never the key values themselves.
export interface VoiceSettings {
  provider: TtsProviderId;
  voiceId: string; // provider-specific voice id
  speed: number; // 0.5 - 1.5
  // Recognition language for voice input
  recognitionLang: "en-IN" | "hi-IN" | "en-US";
}

const STORAGE_KEY = "aria-voice-settings";

export const DEFAULT_VOICE_SETTINGS: VoiceSettings = {
  provider: "web-speech", // Browser TTS — free, no rate limits
  voiceId: "", // empty = pick best female English voice automatically
  speed: 1.0,
  recognitionLang: "en-IN", // auto-detect English/Hindi (Indian context)
};

export function loadVoiceSettings(): VoiceSettings {
  if (typeof window === "undefined") return DEFAULT_VOICE_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_VOICE_SETTINGS;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_VOICE_SETTINGS, ...parsed };
  } catch {
    return DEFAULT_VOICE_SETTINGS;
  }
}

export function saveVoiceSettings(settings: VoiceSettings): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore quota errors
  }
}

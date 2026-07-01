# ARIA — Your AI Partner

A partner-style AI companion with voice (text-to-speech + speech-to-text), Hindi support, emotional moods, long-term memory, and a Friday-inspired voice.

## Quick Start

1. **Extract the archive:**
   ```bash
   tar -xzf aria-source-code.tar.gz
   cd aria
   ```

2. **Install dependencies:**
   ```bash
   npm install
   # or: bun install / pnpm install
   ```

3. **Set up the database:**
   ```bash
   npx prisma db push
   ```

4. **Set up Z.ai API access:**

   Create a `.z-ai-config` file in your home directory (`~/.z-ai-config`) or project root:
   ```json
   {
     "baseUrl": "https://api.z.ai/v1",
     "apiKey": "YOUR_ZAI_API_KEY"
   }
   ```
   Get your API key from [z.ai](https://z.ai).

5. **Install ffmpeg** (for the Friday voice post-processing):
   ```bash
   # macOS
   brew install ffmpeg
   # Ubuntu/Debian
   sudo apt install ffmpeg
   ```

6. **Run the dev server:**
   ```bash
   npm run dev
   ```

7. **Open** http://localhost:3000

## What's Inside

### Core Features
- **Two-column UI** — text chat (left) + voice conversation (right)
- **Voice** — TTS (ARIA speaks) + ASR (you speak, she hears)
- **Friday voice preset** — pitch-shifted, warm, British-leaning alto
- **Hindi support** — speak or type in Hindi, ARIA responds in kind
- **Emotional moods** — 12 moods (warm, curious, amused, concerned, etc.) that color ARIA's responses
- **Long-term memory** — ARIA remembers facts, preferences, projects across conversations
- **Onboarding flow** — 5-step first-run experience

### Tech Stack
- **Framework**: Next.js 16 (App Router)
- **Language**: TypeScript 5
- **Styling**: Tailwind CSS 4 + shadcn/ui
- **Database**: Prisma + SQLite
- **AI**: Z.ai SDK (chat completions, TTS, ASR, web search)
- **Voice**: Z.ai TTS + Web Speech API (browser-native, for Hindi)
- **Audio processing**: ffmpeg with rubberband (pitch shift, formant preserve)
- **Animations**: Framer Motion

### Project Structure
```
src/
├── app/
│   ├── api/              # API routes (chat, tts, asr, conversations, memory, moods)
│   ├── layout.tsx        # Root layout with fonts
│   ├── page.tsx          # Main two-column app
│   └── globals.css
├── components/
│   ├── aria/             # ARIA-specific components
│   │   ├── logo.tsx              # Brand logo + wordmark
│   │   ├── onboarding.tsx        # First-run flow
│   │   ├── essence-orb.tsx       # Pulsing mood orb
│   │   ├── text-chat.tsx         # Left column
│   │   ├── voice-conversation.tsx # Right column
│   │   └── voice-settings.tsx    # Provider/language/speed settings
│   └── ui/               # shadcn/ui components
├── hooks/
│   └── voice/
│       ├── use-speech.ts              # TTS playback (multi-provider)
│       ├── use-voice-recorder.ts      # Z.ai ASR recorder
│       └── use-web-speech-recognition.ts # Browser STT (Hindi support)
└── lib/
    ├── aria/
    │   ├── persona.ts          # ARIA's personality system prompt
    │   ├── agent.ts            # Core agent loop (mood, memory, tools)
    │   ├── emotions.ts         # 12 mood definitions
    │   ├── voice-process.ts    # ffmpeg post-processing (Friday voice)
    │   ├── voice-presets.ts    # Voice preset configs
    │   ├── tts-preprocess.ts   # Text cleaning for TTS
    │   ├── tts-providers.ts    # TTS provider abstraction
    │   ├── tts-web-speech.ts   # Browser TTS provider
    │   ├── brand.ts            # Design tokens
    │   └── types.ts
    └── db.ts                   # Prisma client
prisma/
└── schema.prisma               # Conversation, Message, Memory, MoodLog models
```

## Voice Settings

Open the gear icon in the header to configure:

- **Provider**: Browser Voices (free, Hindi) / Z.ai Friday preset / ElevenLabs (best quality, needs API key)
- **Voice input language**: English (India) / हिंदी / English (US)
- **Speed**: 0.5x – 1.5x

## Browser Support

- **Chrome / Edge** — full support including Hindi voice input (Web Speech API)
- **Safari** — supported, Apple voices
- **Firefox** — text chat works, voice input falls back to Z.ai ASR (English only)

## Deploy

### Vercel (recommended)
1. Push to GitHub
2. Import at [vercel.com](https://vercel.com)
3. Add environment variables (or rely on `~/.z-ai-config`)
4. Deploy

### Self-hosted
```bash
npm run build
npm run start
```
Make sure ffmpeg is installed on the server.

## Customization

- **Personality**: Edit `src/lib/aria/persona.ts`
- **Voice presets**: Edit `src/lib/aria/voice-presets.ts` (pitch, tempo, reverb, gain)
- **Moods**: Edit `src/lib/aria/emotions.ts`
- **Brand colors**: Edit `src/lib/aria/brand.ts`
- **Logo**: Edit `src/components/aria/logo.tsx`

## License

This is your personal build. Do whatever you want with it.

---

Built with care. ARIA is a partner, not a product.

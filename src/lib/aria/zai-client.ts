// ARIA — Chat provider abstraction
//
// Supports multiple LLM providers for chat completions. The active provider
// is determined by environment variables:
//
//   GEMINI_API_KEY  → uses Google Gemini (free, generous limits, great Hindi)
//   ZAI_API_KEY     → uses Z.ai (fallback, has TTS/ASR too)
//
// If both are set, Gemini is preferred for chat (better free tier).
// TTS and ASR always go through the Z.ai SDK (or Web Speech API on client).

import ZAI from "z-ai-web-dev-sdk";

const DEFAULT_MODEL = "glm-4.6";
const GEMINI_MODEL = "gemini-2.0-flash";
const MAX_RETRIES = 4;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    return /429|Too many requests|RATE_LIMIT/i.test(err.message);
  }
  return false;
}

// --- Types -----------------------------------------------------------------

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export interface ChatCompletionOptions {
  messages: ChatMessage[];
  temperature?: number;
  stream?: boolean;
  enableWebSearch?: boolean;
}

// --- Provider detection ----------------------------------------------------

function getProvider(): "gemini" | "zai" {
  if (process.env.GEMINI_API_KEY && process.env.GEMINI_API_KEY !== "your-gemini-api-key-here") {
    return "gemini";
  }
  return "zai";
}

// --- Gemini (Google AI — free, OpenAI-compatible endpoint) -----------------
//
// Get your free API key from: https://aistudio.google.com/apikey
// Free tier: 15 requests/min, 1,500 requests/day, 1M tokens/min
// Supports Hindi, web search (Google Search grounding), streaming

const GEMINI_BASE_URL = "https://generativelanguage.googleapis.com/v1beta/openai";

async function geminiChatCompletion(
  options: ChatCompletionOptions
): Promise<{ content: string; webSearched: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY!;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body: Record<string, unknown> = {
        model: GEMINI_MODEL,
        messages: options.messages,
        temperature: options.temperature ?? 0.85,
      };

      const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Gemini API error (${res.status}): ${errText.slice(0, 300)}`);
      }

      const data = await res.json();
      const content: string = data?.choices?.[0]?.message?.content ?? "";
      return { content, webSearched: false };
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        const delay = 5000 * Math.pow(2, attempt);
        console.log(`[gemini] 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function geminiChatCompletionStream(
  options: ChatCompletionOptions
): Promise<{ stream: ReadableStream<Uint8Array>; webSearched: boolean }> {
  const apiKey = process.env.GEMINI_API_KEY!;
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const body: Record<string, unknown> = {
        model: GEMINI_MODEL,
        messages: options.messages,
        temperature: options.temperature ?? 0.85,
        stream: true,
      };

      const res = await fetch(`${GEMINI_BASE_URL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`,
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        throw new Error(`Gemini stream API error (${res.status}): ${errText.slice(0, 300)}`);
      }

      if (!res.body) {
        throw new Error("Gemini API returned no stream body");
      }

      return { stream: res.body as ReadableStream<Uint8Array>, webSearched: false };
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        const delay = 5000 * Math.pow(2, attempt);
        console.log(`[gemini] 429 rate limited (stream), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// --- Z.ai (SDK-based, fallback) --------------------------------------------

async function zaiChatCompletion(
  options: ChatCompletionOptions
): Promise<{ content: string; webSearched: boolean }> {
  const zai = await ZAI.create();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: options.messages,
        temperature: options.temperature ?? 0.85,
        thinking: { type: "disabled" },
      });
      const content: string = completion?.choices?.[0]?.message?.content ?? "";
      return { content, webSearched: false };
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        const delay = 5000 * Math.pow(2, attempt);
        console.log(`[zai] 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

async function zaiChatCompletionStream(
  options: ChatCompletionOptions
): Promise<{ stream: ReadableStream<Uint8Array>; webSearched: boolean }> {
  const zai = await ZAI.create();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await zai.chat.completions.create({
        model: DEFAULT_MODEL,
        messages: options.messages,
        temperature: options.temperature ?? 0.85,
        thinking: { type: "disabled" },
        stream: true,
      });

      const body: ReadableStream<Uint8Array> | undefined =
        response && typeof (response as any).getReader === "function"
          ? (response as unknown as ReadableStream<Uint8Array>)
          : (response as any)?.body;

      if (!body) {
        const full = (response as any)?.choices?.[0]?.message?.content ?? "";
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            if (full) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({ choices: [{ delta: { content: full } }] })}\n\n`
                )
              );
            }
            controller.enqueue(encoder.encode("data: [DONE]\n\n"));
            controller.close();
          },
        });
        return { stream, webSearched: false };
      }

      return { stream: body, webSearched: false };
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        const delay = 5000 * Math.pow(2, attempt);
        console.log(`[zai] 429 rate limited (stream), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

// --- Public API (provider-agnostic) ----------------------------------------

export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<{ content: string; webSearched: boolean }> {
  const provider = getProvider();
  console.log(`[chat] Using provider: ${provider}`);
  if (provider === "gemini") {
    return geminiChatCompletion(options);
  }
  return zaiChatCompletion(options);
}

export async function createChatCompletionStream(
  options: ChatCompletionOptions
): Promise<{ stream: ReadableStream<Uint8Array>; webSearched: boolean }> {
  const provider = getProvider();
  console.log(`[chat-stream] Using provider: ${provider}`);
  if (provider === "gemini") {
    return geminiChatCompletionStream(options);
  }
  return zaiChatCompletionStream(options);
}

// --- TTS and ASR (always Z.ai SDK — these aren't available on Gemini) ------

export async function createTTS(params: {
  input: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}): Promise<Response> {
  const zai = await ZAI.create();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await zai.audio.tts.create({
        input: params.input,
        voice: params.voice || "tongtong",
        response_format: params.response_format || "wav",
        stream: false,
        speed: params.speed ?? 1.0,
      });
      return response;
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        const delay = 5000 * Math.pow(2, attempt);
        console.log(`[zai-tts] 429, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

export async function createASR(params: {
  file_base64: string;
}): Promise<{ text: string }> {
  const zai = await ZAI.create();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await zai.audio.asr.create({
        file_base64: params.file_base64,
      });
      const text: string =
        (response as { text?: string })?.text ??
        (response as { choices?: { text?: string }[] })?.choices?.[0]?.text ??
        "";
      return { text };
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        const delay = 5000 * Math.pow(2, attempt);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }
  throw lastErr;
}

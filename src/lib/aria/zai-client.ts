// ARIA — Z.ai API client
//
// Uses the z-ai-web-dev-sdk internally. Includes automatic retry with
// exponential backoff for 429 (rate limit) errors.

import ZAI from "z-ai-web-dev-sdk";

const DEFAULT_MODEL = "glm-4.6";
const MAX_RETRIES = 4;

function getModel(): string {
  return process.env.ZAI_MODEL || DEFAULT_MODEL;
}

async function getClient(): Promise<ZAI> {
  return ZAI.create();
}

// Sleep helper
function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

// Check if an error is a rate-limit (429) error
function isRateLimitError(err: unknown): boolean {
  if (err instanceof Error) {
    return /429|Too many requests/i.test(err.message);
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

// --- Chat completions (non-streaming, with retry) ---------------------------

export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<{ content: string; webSearched: boolean }> {
  const zai = await getClient();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const completion = await zai.chat.completions.create({
        model: getModel(),
        messages: options.messages,
        temperature: options.temperature ?? 0.85,
        thinking: { type: "disabled" },
      });

      const content: string =
        completion?.choices?.[0]?.message?.content ?? "";

      return { content, webSearched: false };
    } catch (err) {
      lastErr = err;
      if (isRateLimitError(err) && attempt < MAX_RETRIES) {
        // Exponential backoff: 2s, 4s, 8s
        const delay = 5000 * Math.pow(2, attempt);
        console.log(`[zai-client] 429 rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

// --- Chat completions (streaming via SSE, with retry) -----------------------

export async function createChatCompletionStream(
  options: ChatCompletionOptions
): Promise<{
  stream: ReadableStream<Uint8Array>;
  webSearched: boolean;
}> {
  const zai = await getClient();
  let lastErr: unknown;

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await zai.chat.completions.create({
        model: getModel(),
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
        // Fallback: provider didn't stream — treat as single delta
        const full = (response as any)?.choices?.[0]?.message?.content ?? "";
        const encoder = new TextEncoder();
        const stream = new ReadableStream<Uint8Array>({
          start(controller) {
            if (full) {
              controller.enqueue(
                encoder.encode(
                  `data: ${JSON.stringify({
                    choices: [{ delta: { content: full } }],
                  })}\n\n`
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
        console.log(`[zai-client] 429 rate limited (stream), retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

// --- Text-to-speech (with retry) -------------------------------------------

export async function createTTS(params: {
  input: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}): Promise<Response> {
  const zai = await getClient();
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
        console.log(`[zai-client] TTS 429, retrying in ${delay}ms (attempt ${attempt + 1}/${MAX_RETRIES})`);
        await sleep(delay);
        continue;
      }
      throw err;
    }
  }

  throw lastErr;
}

// --- Speech-to-text (ASR, with retry) --------------------------------------

export async function createASR(params: {
  file_base64: string;
}): Promise<{ text: string }> {
  const zai = await getClient();
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

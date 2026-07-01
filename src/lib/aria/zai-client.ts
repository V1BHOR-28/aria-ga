// ARIA — Z.ai official API client (v4)
//
// Replaces z-ai-web-dev-sdk with direct fetch calls to Z.ai's public API.
// Uses standard API key auth (Authorization: Bearer <key>), not the
// platform-scoped chatId/userId token the old SDK required.
//
// Docs: https://docs.z.ai
// Base URL: https://api.z.ai/api/paas/v4
//
// Config via environment variables:
//   ZAI_API_KEY     — required, your API key from https://z.ai
//   ZAI_API_BASE_URL — optional, defaults to https://api.z.ai/api/paas/v4
//   ZAI_MODEL        — optional, defaults to glm-4.6

const DEFAULT_BASE_URL = "https://api.z.ai/api/paas/v4";
const DEFAULT_MODEL = "glm-4.6";

function getBaseUrl(): string {
  return process.env.ZAI_API_BASE_URL || DEFAULT_BASE_URL;
}

function getApiKey(): string {
  const key = process.env.ZAI_API_KEY;
  if (!key) {
    throw new Error(
      "ZAI_API_KEY environment variable is not set. Get a key from https://z.ai and set it in .env"
    );
  }
  return key;
}

function getModel(): string {
  return process.env.ZAI_MODEL || DEFAULT_MODEL;
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
  // Enable Z.ai's built-in web search tool. When true, the model can
  // search the web during generation and incorporate results.
  enableWebSearch?: boolean;
}

// --- Chat completions (non-streaming) --------------------------------------

export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<{ content: string; webSearched: boolean }> {
  const body: Record<string, unknown> = {
    model: getModel(),
    messages: options.messages,
    temperature: options.temperature ?? 0.85,
    stream: false,
  };

  if (options.enableWebSearch) {
    // Z.ai GLM-4 supports web search as a built-in tool.
    // The model decides when to search based on the question.
    body.tools = [{ type: "web_search", web_search: { enable: true, search_result: true } }];
  }

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Z.ai chat API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  const content: string = data?.choices?.[0]?.message?.content ?? "";

  // Check if web_search was used (Z.ai includes this in the response)
  const webSearched: boolean =
    data?.choices?.[0]?.message?.tool_calls?.some(
      (tc: { type?: string }) => tc?.type === "web_search"
    ) ?? false;

  return { content, webSearched };
}

// --- Chat completions (streaming via SSE) ----------------------------------
//
// Returns a ReadableStream<Uint8Array> of raw SSE bytes from the Z.ai API.
// The caller is responsible for parsing `data: {...}` lines and extracting
// choices[0].delta.content — this keeps the streaming logic in agent.ts
// where it already lives (via createAriaStreamParser).
//
// The response shape is OpenAI-compatible:
//   data: {"choices":[{"delta":{"content":"Hello"}}]}
//   data: {"choices":[{"delta":{"content":" there"}}]}
//   data: [DONE]

export async function createChatCompletionStream(
  options: ChatCompletionOptions
): Promise<{
  stream: ReadableStream<Uint8Array>;
  webSearched: boolean;
}> {
  const body: Record<string, unknown> = {
    model: getModel(),
    messages: options.messages,
    temperature: options.temperature ?? 0.85,
    stream: true,
  };

  if (options.enableWebSearch) {
    body.tools = [{ type: "web_search", web_search: { enable: true, search_result: true } }];
  }

  const res = await fetch(`${getBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
      Accept: "text/event-stream",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Z.ai chat stream API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  if (!res.body) {
    throw new Error("Z.ai API returned no stream body");
  }

  // webSearched can't be known until the stream completes; the caller
  // can inspect the final accumulated response if needed. For now we
  // return false and let the caller detect search usage from tool_calls
  // in the SSE events if present.
  return { stream: res.body as ReadableStream<Uint8Array>, webSearched: false };
}

// --- Text-to-speech --------------------------------------------------------
//
// Z.ai TTS endpoint. Returns a Response object (like the old SDK did)
// so the caller can check .ok, read .headers, and get the audio body.
//
// NOTE: The exact endpoint path (/audio/tts) is based on the Z.ai v4 API
// structure. If this fails with a 404, verify the path at
// https://docs.z.ai — the API may use /audio/speech instead.

export async function createTTS(params: {
  input: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}): Promise<Response> {
  const res = await fetch(`${getBaseUrl()}/audio/tts`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: "tts-1",
      input: params.input,
      voice: params.voice || "tongtong",
      response_format: params.response_format || "wav",
      speed: params.speed ?? 1.0,
    }),
  });

  return res;
}

// --- Speech-to-text (ASR) --------------------------------------------------
//
// Z.ai ASR endpoint. Accepts base64-encoded audio, returns transcribed text.
//
// NOTE: The exact endpoint path (/audio/asr) is based on the Z.ai v4 API
// structure. If this fails with a 404, verify the path at
// https://docs.z.ai — the API may use /audio/transcriptions instead.

export async function createASR(params: {
  file_base64: string;
}): Promise<{ text: string }> {
  const res = await fetch(`${getBaseUrl()}/audio/asr`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${getApiKey()}`,
    },
    body: JSON.stringify({
      model: "whisper-1",
      file_base64: params.file_base64,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Z.ai ASR API error (${res.status}): ${errText.slice(0, 300)}`);
  }

  const data = await res.json();
  return { text: data?.text ?? "" };
}

// ARIA — Z.ai API client
//
// Uses the z-ai-web-dev-sdk internally (it handles TLS/connection quirks
// with the Z.ai API that plain fetch struggles with in some environments).
//
// The user's API key (ZAI_API_KEY) is used when deploying to production
// with the public API. In sandbox/dev environments, the SDK reads from
// .z-ai-config automatically.
//
// Config via environment variables:
//   ZAI_API_KEY      — your API key from https://z.ai (for production)
//   ZAI_MODEL         — optional, defaults to glm-4.6

import ZAI from "z-ai-web-dev-sdk";

const DEFAULT_MODEL = "glm-4.6";

function getModel(): string {
  return process.env.ZAI_MODEL || DEFAULT_MODEL;
}

async function getClient(): Promise<ZAI> {
  return ZAI.create();
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

// --- Chat completions (non-streaming) --------------------------------------

export async function createChatCompletion(
  options: ChatCompletionOptions
): Promise<{ content: string; webSearched: boolean }> {
  const zai = await getClient();

  const completion = await zai.chat.completions.create({
    model: getModel(),
    messages: options.messages,
    temperature: options.temperature ?? 0.85,
    thinking: { type: "disabled" },
  });

  const content: string =
    completion?.choices?.[0]?.message?.content ?? "";

  return { content, webSearched: false };
}

// --- Chat completions (streaming via SSE) ----------------------------------
//
// The SDK returns a Response object when stream: true. We extract the
// body as a ReadableStream for the caller to parse SSE events.

export async function createChatCompletionStream(
  options: ChatCompletionOptions
): Promise<{
  stream: ReadableStream<Uint8Array>;
  webSearched: boolean;
}> {
  const zai = await getClient();

  const response = await zai.chat.completions.create({
    model: getModel(),
    messages: options.messages,
    temperature: options.temperature ?? 0.85,
    thinking: { type: "disabled" },
    stream: true,
  });

  // The SDK returns a ReadableStream when stream: true
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
}

// --- Text-to-speech --------------------------------------------------------

export async function createTTS(params: {
  input: string;
  voice?: string;
  response_format?: string;
  speed?: number;
}): Promise<Response> {
  const zai = await getClient();

  const response = await zai.audio.tts.create({
    input: params.input,
    voice: params.voice || "tongtong",
    response_format: params.response_format || "wav",
    stream: false,
    speed: params.speed ?? 1.0,
  });

  return response;
}

// --- Speech-to-text (ASR) --------------------------------------------------

export async function createASR(params: {
  file_base64: string;
}): Promise<{ text: string }> {
  const zai = await getClient();

  const response = await zai.audio.asr.create({
    file_base64: params.file_base64,
  });

  const text: string =
    (response as { text?: string })?.text ??
    (response as { choices?: { text?: string }[] })?.choices?.[0]?.text ??
    "";

  return { text };
}

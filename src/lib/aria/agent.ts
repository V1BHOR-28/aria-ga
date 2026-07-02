// ARIA — Agent core
// Handles: memory recall, LLM call, mood parsing, memory extraction,
// tool execution, persistence. One function: runTurn().

import { db } from "@/lib/db";
import { ARIA_SYSTEM_PROMPT } from "./persona";
import { createAriaStreamParser } from "./stream-parser";
import {
  createChatCompletion,
  createChatCompletionStream,
} from "./zai-client";
import { executeTool, TOOL_DESCRIPTIONS, type ToolName } from "./tools";
import type { AgentTurnResult, MemoryKind } from "./types";

// --- Mood tag parsing ----------------------------------------------------

// Lenient: allows leading whitespace, optional space after colon, and any
// whitespace/newline after the closing §. The LLM doesn't always return
// the tag exactly as specified — we'd rather extract than miss it.
const MOOD_TAG_RE = /^\s*§\s*mood\s*:\s*([a-z]+)\s*§\s*/i;
const MEMORY_TAG_RE = /§\s*memory\s*:\s*([a-z_]+)\s*\|([^|]*)\|(\d+)\s*§/g;

export function parseMoodTag(raw: string): { mood: string; content: string } {
  const match = raw.match(MOOD_TAG_RE);
  if (!match) {
    return { mood: "neutral", content: raw.trim() };
  }
  const mood = match[1].toLowerCase();
  return { mood, content: raw.slice(match[0].length).trim() };
}

export function parseMemoryTags(content: string): {
  cleaned: string;
  memories: { kind: MemoryKind; content: string; importance: number }[];
} {
  const memories: { kind: MemoryKind; content: string; importance: number }[] =
    [];
  let m: RegExpExecArray | null;
  MEMORY_TAG_RE.lastIndex = 0;
  while ((m = MEMORY_TAG_RE.exec(content)) !== null) {
    const kind = m[1].toLowerCase() as MemoryKind;
    const text = m[2].trim();
    const importance = Math.min(10, Math.max(1, parseInt(m[3], 10) || 5));
    memories.push({ kind, content: text, importance });
  }
  // Strip the memory lines from the visible content
  const cleaned = content.replace(MEMORY_TAG_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, memories };
}

// --- Tool tag parsing ------------------------------------------------------

const TOOL_TAG_RE = /§\s*tool\s*:\s*([a-z_]+)\s*\|([^§]*)§/gi;

export function parseToolTags(content: string): {
  cleaned: string;
  toolCalls: { name: ToolName; args: string }[];
} {
  const toolCalls: { name: ToolName; args: string }[] = [];
  let m: RegExpExecArray | null;
  TOOL_TAG_RE.lastIndex = 0;
  while ((m = TOOL_TAG_RE.exec(content)) !== null) {
    const name = m[1].toLowerCase() as ToolName;
    const args = m[2].trim();
    toolCalls.push({ name, args });
  }
  const cleaned = content.replace(TOOL_TAG_RE, "").replace(/\n{3,}/g, "\n\n").trim();
  return { cleaned, toolCalls };
}

// Execute all tool calls and return a summary string for the conversation
async function executeToolCalls(
  toolCalls: { name: ToolName; args: string }[]
): Promise<{ summary: string; toolUsed: string | undefined }> {
  if (toolCalls.length === 0) return { summary: "", toolUsed: undefined };

  const results: string[] = [];
  let toolUsed: string | undefined;

  for (const call of toolCalls) {
    const result = await executeTool(call.name, call.args);
    results.push(`[Tool: ${call.name}] ${result.result}`);
    if (result.success) {
      toolUsed = toolUsed
        ? `${toolUsed},${call.name}`
        : call.name;
    }
  }

  return {
    summary: results.join("\n"),
    toolUsed,
  };
}

// --- Memory recall -------------------------------------------------------

async function recallRelevantMemories(userMessage: string): Promise<string> {
  // Lightweight keyword extraction — no embedding model needed for v1.
  const stop = new Set([
    "the", "a", "an", "and", "or", "but", "is", "are", "was", "were",
    "i", "you", "we", "they", "he", "she", "it", "to", "of", "in", "on",
    "for", "with", "at", "by", "from", "as", "that", "this", "these",
    "those", "my", "your", "our", "their", "me", "him", "her", "them",
    "do", "does", "did", "can", "could", "would", "should", "will", "be",
    "have", "has", "had", "what", "when", "where", "why", "how", "who",
    "just", "really", "very", "so", "too", "also", "about", "into",
  ]);
  const words = userMessage
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter((w) => w.length > 3 && !stop.has(w))
    .slice(0, 6);

  // Only approved memories are included in recall. Pending memories
  // (not yet reviewed by the user) are never sent to the LLM.
  if (words.length === 0) {
    // Fall back to most important recent approved memories
    const recent = await db.memory.findMany({
      where: { status: "approved" },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 5,
    });
    return formatMemories(recent);
  }

  // OR query across content for any keyword, approved only
  const orClauses = words.map((w) => ({ content: { contains: w } }));
  const matches = await db.memory.findMany({
    where: { status: "approved", OR: orClauses },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 8,
  });

  // Always include top 3 most important approved memories as background
  if (matches.length < 5) {
    const topPicks = await db.memory.findMany({
      where: { status: "approved" },
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 5,
    });
    const existing = new Set(matches.map((m) => m.id));
    for (const t of topPicks) {
      if (!existing.has(t.id)) matches.push(t);
      if (matches.length >= 8) break;
    }
  }

  return formatMemories(matches);
}

function formatMemories(
  memories: { id: string; kind: string; content: string; importance: number }[]
): string {
  if (memories.length === 0) return "";
  const lines = memories.map(
    (m) => `  - [${m.kind}, imp=${m.importance}] ${m.content}`
  );
  return `# What you remember about the human (use if relevant, don't dump)\n${lines.join("\n")}`;
}

// --- Shared turn setup -----------------------------------------------------
// Steps 1-3 are identical whether we're going to call the LLM in streaming
// or non-streaming mode, so both runTurn() and runTurnStream() share them.
//
// Web search is now handled by the model's built-in web_search tool
// (passed via tools parameter in the chat completion request). The model
// decides when to search based on the question — no more regex pre-filter.

interface PreparedTurn {
  messages: { role: "user" | "assistant" | "system"; content: string }[];
  toolUsed?: string;
  toolPayload?: string;
}

async function prepareTurn(
  conversationId: string,
  userMessage: string
): Promise<PreparedTurn> {
  const history = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 12,
  });

  const memoryBlock = await recallRelevantMemories(userMessage);

  const systemContent = [ARIA_SYSTEM_PROMPT, TOOL_DESCRIPTIONS, memoryBlock]
    .filter(Boolean)
    .join("\n\n---\n\n");

  const messages = [
    { role: "system" as const, content: systemContent },
    ...history.map((h) => ({
      role: h.role as "user" | "assistant" | "system",
      content:
        h.role === "assistant" && h.mood
          ? `§mood:${h.mood}§\n${h.content}`
          : h.content,
    })),
    { role: "user" as const, content: userMessage },
  ];

  return { messages };
}

// Persist memories, mood log, and (if it's the first turn) the conversation
// title. Shared by both the streaming and non-streaming paths.
async function finalizeTurn(args: {
  conversationId: string;
  userMessage: string;
  mood: string;
  memories: { kind: MemoryKind; content: string; importance: number }[];
}): Promise<void> {
  const { conversationId, userMessage, mood, memories } = args;

  if (memories.length > 0) {
    for (const mem of memories) {
      const existing = await db.memory.findFirst({
        where: { content: { contains: mem.content.slice(0, 40) } },
      });
      if (!existing) {
        // New memories land as "pending" — the user must approve them
        // before they're included in recall. No silent auto-approval.
        await db.memory.create({
          data: {
            kind: mem.kind,
            content: mem.content,
            importance: mem.importance,
            status: "pending",
          },
        });
      }
    }
  }

  await db.moodLog.create({
    data: { mood, trigger: userMessage.slice(0, 200) },
  });

  const msgCount = await db.message.count({
    where: { conversationId },
  });
  if (msgCount <= 1) {
    const title =
      userMessage.slice(0, 50).trim() + (userMessage.length > 50 ? "…" : "");
    await db.conversation.update({
      where: { id: conversationId },
      data: { title },
    });
  }
}

// --- Main turn loop (non-streaming) ----------------------------------------

export interface RunTurnArgs {
  conversationId: string;
  userMessage: string;
}

export async function runTurn({
  conversationId,
  userMessage,
}: RunTurnArgs): Promise<AgentTurnResult> {
  const { messages } = await prepareTurn(conversationId, userMessage);

  const { content: rawContent, webSearched } = await createChatCompletion({
    messages,
    temperature: 0.85,
    enableWebSearch: true,
  });

  const { mood, content: moodStripped } = parseMoodTag(rawContent);
  const { cleaned: memCleaned, memories } = parseMemoryTags(moodStripped);
  const { cleaned, toolCalls } = parseToolTags(memCleaned);

  // Execute any tool calls
  let toolUsed: string | undefined = webSearched ? "web_search" : undefined;
  let toolPayload: string | undefined;
  if (toolCalls.length > 0) {
    const toolResult = await executeToolCalls(toolCalls);
    if (toolResult.toolUsed) {
      toolUsed = toolUsed
        ? `${toolUsed},${toolResult.toolUsed}`
        : toolResult.toolUsed;
    }
    toolPayload = toolResult.summary.slice(0, 500);
  }

  await finalizeTurn({ conversationId, userMessage, mood, memories });

  return {
    content: cleaned,
    rawContent,
    mood,
    toolUsed,
    toolPayload,
    newMemories: memories,
  };
}

// --- Main turn loop (streaming) ---------------------------------------------
// Same overall behavior as runTurn(), but calls onMood() the instant the
// mood tag is known and onDelta() for every chunk of newly-visible text as
// it streams in — so the caller can start TTS on sentence 1 while sentence
// 4 hasn't been generated yet, instead of waiting for the whole reply.

export interface RunTurnStreamCallbacks {
  onMood?: (mood: string) => void;
  onDelta?: (text: string) => void;
}

export async function runTurnStream(
  { conversationId, userMessage }: RunTurnArgs,
  callbacks: RunTurnStreamCallbacks = {}
): Promise<AgentTurnResult> {
  const { messages } = await prepareTurn(conversationId, userMessage);

  const { stream: body, webSearched } = await createChatCompletionStream({
    messages,
    temperature: 0.85,
    stream: true,
    enableWebSearch: true,
  });

  const parser = createAriaStreamParser();
  let rawContent = "";
  let moodAnnounced = false;

  const reader = body.getReader();
  const decoder = new TextDecoder();
  let sseBuffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    sseBuffer += decoder.decode(value, { stream: true });

    const lines = sseBuffer.split("\n");
    sseBuffer = lines.pop() ?? ""; // keep the last (possibly partial) line

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed.startsWith("data:")) continue;
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr || jsonStr === "[DONE]") continue;

      let parsed: any;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        continue; // skip a malformed SSE chunk rather than kill the turn
      }

      const delta: string | undefined =
        parsed?.choices?.[0]?.delta?.content ??
        parsed?.choices?.[0]?.message?.content;
      if (!delta) continue;

      rawContent += delta;
      const visible = parser.push(delta);

      if (!moodAnnounced && parser.getMood()) {
        callbacks.onMood?.(parser.getMood());
        moodAnnounced = true;
      }
      if (visible) callbacks.onDelta?.(visible);
    }
  }

  const finalVisible = parser.flush();
  if (!moodAnnounced) {
    callbacks.onMood?.(parser.getMood());
    moodAnnounced = true;
  }
  if (finalVisible) callbacks.onDelta?.(finalVisible);

  const mood = parser.getMood();
  const memories = parser.getMemories();

  await finalizeTurn({ conversationId, userMessage, mood, memories });

  // Rebuild the final cleaned text the same way parseMemoryTags() would,
  // for callers that want the full string (e.g. to persist as a message
  // row) rather than just the incremental deltas.
  const { content: moodStripped } = parseMoodTag(rawContent);
  const { cleaned: memCleaned } = parseMemoryTags(moodStripped);
  const { cleaned, toolCalls } = parseToolTags(memCleaned);

  // Execute any tool calls
  let toolUsed: string | undefined = webSearched ? "web_search" : undefined;
  let toolPayload: string | undefined;
  if (toolCalls.length > 0) {
    const toolResult = await executeToolCalls(toolCalls);
    if (toolResult.toolUsed) {
      toolUsed = toolUsed
        ? `${toolUsed},${toolResult.toolUsed}`
        : toolResult.toolUsed;
    }
    toolPayload = toolResult.summary.slice(0, 500);
  }

  return {
    content: cleaned,
    rawContent,
    mood,
    toolUsed,
    toolPayload,
    newMemories: memories,
  };
}

// ARIA — Agent core
// Handles: memory recall, web search decisions, LLM call, mood parsing,
// memory extraction, persistence. One function: runTurn().

import ZAI from "z-ai-web-dev-sdk";
import { db } from "@/lib/db";
import { ARIA_SYSTEM_PROMPT } from "./persona";
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

  if (words.length === 0) {
    // Fall back to most important recent memories
    const recent = await db.memory.findMany({
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
      take: 5,
    });
    return formatMemories(recent);
  }

  // OR query across content for any keyword
  const orClauses = words.map((w) => ({ content: { contains: w } }));
  const matches = await db.memory.findMany({
    where: { OR: orClauses },
    orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    take: 8,
  });

  // Always include top 3 most important memories as background
  if (matches.length < 5) {
    const topPicks = await db.memory.findMany({
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

// --- Web search decision -------------------------------------------------

// Conservative: only search when the user is clearly asking about something
// current or factual that the model wouldn't reliably know. Common life
// phrases like "this year" or "today" in casual chat should NOT trigger.
const SEARCH_TRIGGER =
  /\b(latest|recently|right now|current (news|events|price|weather|score)|news (today|this week)|stock price|weather (in|today|forecast)|election results|who won|what time is it in)\b/i;

export function shouldSearch(userMessage: string): boolean {
  return SEARCH_TRIGGER.test(userMessage);
}

async function runWebSearch(query: string): Promise<{
  results: { title: string; snippet: string; url: string }[];
  summary: string;
}> {
  try {
    const zai = await ZAI.create();
    const results = await zai.functions.invoke("web_search", {
      query,
      num: 5,
      recency_days: 30,
    });
    if (!Array.isArray(results) || results.length === 0) {
      return { results: [], summary: "" };
    }
    const mapped = results.map((r: { name?: string; title?: string; snippet?: string; url?: string }) => ({
      title: r.name || r.title || "",
      snippet: r.snippet || "",
      url: r.url || "",
    }));
    const summary = mapped
      .map((r: { title: string; snippet: string; url: string }, i: number) => `${i + 1}. ${r.title}\n   ${r.snippet}\n   ${r.url}`)
      .join("\n\n");
    return { results: mapped, summary };
  } catch (err) {
    console.error("[ARIA] web_search failed:", err);
    return { results: [], summary: "" };
  }
}

// --- Main turn loop ------------------------------------------------------

export interface RunTurnArgs {
  conversationId: string;
  userMessage: string;
}

export async function runTurn({
  conversationId,
  userMessage,
}: RunTurnArgs): Promise<AgentTurnResult> {
  // 1. Fetch recent conversation history (last 12 messages)
  const history = await db.message.findMany({
    where: { conversationId },
    orderBy: { createdAt: "asc" },
    take: 12,
  });

  // 2. Recall long-term memories
  const memoryBlock = await recallRelevantMemories(userMessage);

  // 3. Decide on web search
  let toolUsed: string | undefined;
  let toolPayload: string | undefined;
  let searchContext = "";

  if (shouldSearch(userMessage)) {
    const search = await runWebSearch(userMessage);
    if (search.summary) {
      toolUsed = "web_search";
      toolPayload = JSON.stringify(
        search.results.slice(0, 3).map((r) => ({ title: r.title, url: r.url }))
      );
      searchContext = `# Fresh web context (just searched, may use)\n${search.summary}`;
    }
  }

  // 4. Build the messages array
  const systemContent = [ARIA_SYSTEM_PROMPT, memoryBlock, searchContext]
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

  // 5. Call the LLM
  const zai = await ZAI.create();
  const completion = await zai.chat.completions.create({
    messages,
    thinking: { type: "disabled" },
    temperature: 0.85,
  });

  const rawContent: string =
    completion?.choices?.[0]?.message?.content ?? "";

  // 6. Parse mood + memory directives
  const { mood, content: moodStripped } = parseMoodTag(rawContent);
  const { cleaned, memories } = parseMemoryTags(moodStripped);

  // 7. Persist new memories
  if (memories.length > 0) {
    for (const mem of memories) {
      // Dedup: skip if a very similar memory exists
      const existing = await db.memory.findFirst({
        where: { content: { contains: mem.content.slice(0, 40) } },
      });
      if (!existing) {
        await db.memory.create({
          data: {
            kind: mem.kind,
            content: mem.content,
            importance: mem.importance,
          },
        });
      }
    }
  }

  // 8. Log mood
  await db.moodLog.create({
    data: { mood, trigger: userMessage.slice(0, 200) },
  });

  // 9. Update conversation title if it's the first message
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

  return {
    content: cleaned,
    rawContent,
    mood,
    toolUsed,
    toolPayload,
    newMemories: memories,
  };
}

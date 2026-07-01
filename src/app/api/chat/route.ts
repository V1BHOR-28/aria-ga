import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { runTurn } from "@/lib/aria/agent";

export const runtime = "nodejs";

// POST /api/chat
// body: { conversationId?: string, message: string }
// returns: { conversationId, message: { id, role, content, mood, toolUsed, createdAt }, userMessage: {...} }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { conversationId, message } = body as {
      conversationId?: string;
      message?: string;
    };

    if (!message || typeof message !== "string" || !message.trim()) {
      return NextResponse.json(
        { error: "Message is required" },
        { status: 400 }
      );
    }

    // Resolve or create conversation
    let convId = conversationId;
    if (!convId) {
      const conv = await db.conversation.create({ data: {} });
      convId = conv.id;
    } else {
      const exists = await db.conversation.findUnique({
        where: { id: convId },
      });
      if (!exists) {
        const conv = await db.conversation.create({ data: { id: convId } });
        convId = conv.id;
      }
    }

    // Persist user message
    const userMsg = await db.message.create({
      data: {
        conversationId: convId,
        role: "user",
        content: message,
      },
    });

    // Run the agent turn
    const result = await runTurn({ conversationId: convId, userMessage: message });

    // Persist assistant message
    const assistantMsg = await db.message.create({
      data: {
        conversationId: convId,
        role: "assistant",
        content: result.content,
        mood: result.mood,
        toolUsed: result.toolUsed ?? null,
        toolPayload: result.toolPayload ?? null,
      },
    });

    return NextResponse.json({
      conversationId: convId,
      userMessage: userMsg,
      message: assistantMsg,
      newMemories: result.newMemories ?? [],
    });
  } catch (err) {
    console.error("[/api/chat] error:", err);
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

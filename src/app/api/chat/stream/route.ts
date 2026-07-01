import { NextRequest } from "next/server";
import { db } from "@/lib/db";
import { runTurnStream } from "@/lib/aria/agent";

export const runtime = "nodejs";

// POST /api/chat/stream
// body: { conversationId?: string, message: string }
//
// Server-Sent Events. Each event is one line: `data: {...}\n\n`.
//   { type: "conversation", conversationId }
//   { type: "mood", mood }
//   { type: "delta", text }               -- may fire many times
//   { type: "done", messageId, mood, content, newMemories }
//   { type: "error", error }
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const conversationId: string | undefined = body?.conversationId;
  const message: string | undefined = body?.message;

  if (!message || typeof message !== "string" || !message.trim()) {
    return new Response(
      `data: ${JSON.stringify({ type: "error", error: "Message is required" })}\n\n`,
      { status: 400, headers: { "Content-Type": "text/event-stream" } }
    );
  }

  const encoder = new TextEncoder();

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`)
        );
      };

      try {
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

        send({ type: "conversation", conversationId: convId });

        await db.message.create({
          data: { conversationId: convId, role: "user", content: message },
        });

        const result = await runTurnStream(
          { conversationId: convId, userMessage: message },
          {
            onMood: (mood) => send({ type: "mood", mood }),
            onDelta: (text) => send({ type: "delta", text }),
          }
        );

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

        send({
          type: "done",
          messageId: assistantMsg.id,
          mood: result.mood,
          content: result.content,
          newMemories: result.newMemories ?? [],
        });
      } catch (err) {
        console.error("[/api/chat/stream]", err);
        const msg = err instanceof Error ? err.message : "Unknown error";
        send({ type: "error", error: msg });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}

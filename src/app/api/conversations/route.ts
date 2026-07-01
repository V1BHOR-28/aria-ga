import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/conversations — list all conversations
// GET /api/conversations?id=... — get one conversation with its messages
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");

    if (id) {
      const conv = await db.conversation.findUnique({
        where: { id },
        include: {
          messages: { orderBy: { createdAt: "asc" } },
        },
      });
      if (!conv) {
        return NextResponse.json(
          { error: "Conversation not found" },
          { status: 404 }
        );
      }
      return NextResponse.json({ conversation: conv });
    }

    const conversations = await db.conversation.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
      include: {
        messages: {
          orderBy: { createdAt: "asc" },
          take: 1,
        },
      },
    });
    return NextResponse.json({ conversations });
  } catch (err) {
    console.error("[/api/conversations]", err);
    return NextResponse.json(
      { error: "Failed to fetch conversations" },
      { status: 500 }
    );
  }
}

// DELETE /api/conversations?id=...
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await db.conversation.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/conversations DELETE]", err);
    return NextResponse.json(
      { error: "Failed to delete conversation" },
      { status: 500 }
    );
  }
}

// POST /api/conversations — create a new empty conversation
export async function POST() {
  try {
    const conv = await db.conversation.create({ data: {} });
    return NextResponse.json({ conversation: conv });
  } catch (err) {
    console.error("[/api/conversations POST]", err);
    return NextResponse.json(
      { error: "Failed to create conversation" },
      { status: 500 }
    );
  }
}

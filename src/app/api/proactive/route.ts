import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/proactive — list unread proactive messages
export async function GET() {
  try {
    const messages = await db.proactiveMessage.findMany({
      where: { read: false },
      orderBy: { createdAt: "desc" },
      take: 10,
    });
    return NextResponse.json({ messages });
  } catch (err) {
    console.error("[/api/proactive GET]", err);
    return NextResponse.json({ error: "Failed to fetch proactive messages" }, { status: 500 });
  }
}

// PATCH /api/proactive?id=... — mark as read
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await db.proactiveMessage.update({
      where: { id },
      data: { read: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/proactive PATCH]", err);
    return NextResponse.json({ error: "Failed to mark as read" }, { status: 500 });
  }
}

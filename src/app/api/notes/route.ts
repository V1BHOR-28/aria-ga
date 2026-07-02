import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/notes — list notes
export async function GET() {
  try {
    const notes = await db.note.findMany({
      orderBy: { updatedAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ notes });
  } catch (err) {
    console.error("[/api/notes GET]", err);
    return NextResponse.json({ error: "Failed to fetch notes" }, { status: 500 });
  }
}

// DELETE /api/notes?id=... — delete a note
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await db.note.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/notes DELETE]", err);
    return NextResponse.json({ error: "Failed to delete note" }, { status: 500 });
  }
}

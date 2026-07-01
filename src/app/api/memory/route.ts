import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/memory — list all memories
export async function GET() {
  try {
    const memories = await db.memory.findMany({
      orderBy: [{ importance: "desc" }, { updatedAt: "desc" }],
    });
    return NextResponse.json({ memories });
  } catch (err) {
    console.error("[/api/memory GET]", err);
    return NextResponse.json(
      { error: "Failed to fetch memories" },
      { status: 500 }
    );
  }
}

// DELETE /api/memory?id=... — delete a single memory
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await db.memory.delete({ where: { id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/memory DELETE]", err);
    return NextResponse.json(
      { error: "Failed to delete memory" },
      { status: 500 }
    );
  }
}

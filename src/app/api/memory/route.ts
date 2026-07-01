import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/memory — list memories
// Query params:
//   ?status=pending  — only pending memories (for review queue)
//   ?status=approved — only approved memories
//   (no status param) — all memories
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const status = searchParams.get("status");

    const where = status ? { status } : undefined;

    const memories = await db.memory.findMany({
      where,
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

// PATCH /api/memory?id=...&status=approved|rejected
// Approve or reject a pending memory.
export async function PATCH(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    const status = searchParams.get("status");

    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    if (status !== "approved" && status !== "rejected") {
      return NextResponse.json(
        { error: "status must be 'approved' or 'rejected'" },
        { status: 400 }
      );
    }

    const updated = await db.memory.update({
      where: { id },
      data: { status },
    });
    return NextResponse.json({ memory: updated });
  } catch (err) {
    console.error("[/api/memory PATCH]", err);
    return NextResponse.json(
      { error: "Failed to update memory status" },
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

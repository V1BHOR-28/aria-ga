import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/reminders — list upcoming reminders
export async function GET() {
  try {
    const now = new Date();
    const reminders = await db.reminder.findMany({
      where: {
        completed: false,
        triggerAt: { gte: new Date(now.getTime() - 60 * 60 * 1000) }, // include recently due
      },
      orderBy: { triggerAt: "asc" },
    });
    return NextResponse.json({ reminders });
  } catch (err) {
    console.error("[/api/reminders GET]", err);
    return NextResponse.json({ error: "Failed to fetch reminders" }, { status: 500 });
  }
}

// DELETE /api/reminders?id=... — complete a reminder
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const id = searchParams.get("id");
    if (!id) {
      return NextResponse.json({ error: "id required" }, { status: 400 });
    }
    await db.reminder.update({
      where: { id },
      data: { completed: true },
    });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/reminders DELETE]", err);
    return NextResponse.json({ error: "Failed to complete reminder" }, { status: 500 });
  }
}

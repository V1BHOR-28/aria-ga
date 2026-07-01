import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const runtime = "nodejs";

// GET /api/moods — recent mood log entries (default: last 50)
export async function GET() {
  try {
    const moods = await db.moodLog.findMany({
      orderBy: { createdAt: "desc" },
      take: 50,
    });
    return NextResponse.json({ moods });
  } catch (err) {
    console.error("[/api/moods]", err);
    return NextResponse.json(
      { error: "Failed to fetch moods" },
      { status: 500 }
    );
  }
}

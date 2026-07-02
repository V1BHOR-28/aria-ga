import { NextResponse } from "next/server";

export const runtime = "nodejs";

// GET /api/auth/check — returns 200 if authenticated (middleware handles 401)
// This route is matched by the middleware's matcher (it's under /api/ and
// not under /api/auth/login or /api/auth/logout), so unauthenticated
// requests get 401 before reaching this handler.
export async function GET() {
  return NextResponse.json({ ok: true });
}

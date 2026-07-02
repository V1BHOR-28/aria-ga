// ARIA — Authentication proxy (Next.js 16 convention, replaces middleware.ts)
//
// Gates all /api/* routes except /api/auth/login and /api/auth/logout.
// Rejects unauthenticated requests with 401 BEFORE any route handler
// or DB/LLM call runs.

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

// Match all /api/* routes EXCEPT /api/auth/login and /api/auth/logout
export const config = {
  matcher: ["/api/((?!auth/login|auth/logout).*)"],
};

export async function proxy(req: NextRequest) {
  const cookieHeader = req.headers.get("cookie");

  if (!(await isAuthenticated(cookieHeader))) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

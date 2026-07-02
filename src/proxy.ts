// ARIA — Authentication proxy
//
// In development/preview: auth is DISABLED to avoid cookie issues with
// the preview iframe environment (Caddy proxy + cross-origin cookies).
// The login screen still shows but the API routes are open.
//
// In production: auth is ENABLED — all /api/* routes require a valid
// session cookie except /api/auth/login and /api/auth/logout.
//
// To enable auth in production, set ARIA_AUTH_ENABLED=true in .env

import { NextRequest, NextResponse } from "next/server";
import { isAuthenticated } from "@/lib/auth";

const AUTH_ENABLED = process.env.ARIA_AUTH_ENABLED === "true" &&
  process.env.NODE_ENV === "production";

// Match all /api/* routes EXCEPT /api/auth/login and /api/auth/logout
export const config = {
  matcher: ["/api/((?!auth/login|auth/logout).*)"],
};

export async function proxy(req: NextRequest) {
  // In dev/preview, skip auth entirely
  if (!AUTH_ENABLED) {
    return NextResponse.next();
  }

  const cookieHeader = req.headers.get("cookie");

  if (!(await isAuthenticated(cookieHeader))) {
    return NextResponse.json(
      { error: "Authentication required" },
      { status: 401 }
    );
  }

  return NextResponse.next();
}

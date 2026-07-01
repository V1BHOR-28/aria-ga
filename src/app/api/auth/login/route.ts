import { NextRequest, NextResponse } from "next/server";
import {
  createSessionCookie,
  SESSION_COOKIE_NAME,
} from "@/lib/auth";
import { verifyPassword } from "@/lib/auth-password";

export const runtime = "nodejs";

// POST /api/auth/login
// body: { password: string }
// returns: 200 { ok: true } + sets HTTP-only session cookie
//          401 { error: "Invalid password" }
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { password } = body as { password?: string };

    if (!password || typeof password !== "string") {
      return NextResponse.json(
        { error: "Password is required" },
        { status: 400 }
      );
    }

    const storedHash = process.env.ARIA_AUTH_PASSWORD_HASH;
    if (!storedHash) {
      return NextResponse.json(
        {
          error:
            "Authentication not configured. Set ARIA_AUTH_PASSWORD_HASH in .env (use scripts/generate-password-hash.ts to generate it).",
        },
        { status: 500 }
      );
    }

    if (!verifyPassword(password, storedHash)) {
      return NextResponse.json(
        { error: "Invalid password" },
        { status: 401 }
      );
    }

    // Set HTTP-only, Secure, SameSite=Strict cookie
    const cookieValue = await createSessionCookie();
    const res = NextResponse.json({ ok: true });
    res.cookies.set(SESSION_COOKIE_NAME, cookieValue, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge: 7 * 24 * 60 * 60, // 7 days (seconds)
    });
    return res;
  } catch (err) {
    console.error("[/api/auth/login]", err);
    return NextResponse.json(
      { error: "Login failed" },
      { status: 500 }
    );
  }
}

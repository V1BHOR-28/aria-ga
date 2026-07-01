import { NextRequest, NextResponse } from "next/server";
import {
  setProviderKey,
  deleteProviderKey,
  listConfiguredProviders,
} from "@/lib/aria/api-keys";

export const runtime = "nodejs";

// GET /api/settings/keys — returns which providers have keys configured.
// NEVER returns the actual key values — only provider names.
export async function GET() {
  try {
    const providers = await listConfiguredProviders();
    return NextResponse.json({ providers });
  } catch (err) {
    console.error("[/api/settings/keys GET]", err);
    return NextResponse.json(
      { error: "Failed to list provider keys" },
      { status: 500 }
    );
  }
}

// POST /api/settings/keys — store a provider API key (encrypted server-side)
// body: { provider: string, key: string }
// The key is encrypted and stored; the plaintext is never logged or returned.
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, key } = body as { provider?: string; key?: string };

    if (!provider || typeof provider !== "string") {
      return NextResponse.json(
        { error: "provider is required" },
        { status: 400 }
      );
    }
    if (!key || typeof key !== "string" || !key.trim()) {
      return NextResponse.json(
        { error: "key is required" },
        { status: 400 }
      );
    }

    await setProviderKey(provider, key.trim());

    // Return success — do NOT return the key back
    return NextResponse.json({ ok: true, provider });
  } catch (err) {
    console.error("[/api/settings/keys POST]", err);
    return NextResponse.json(
      { error: "Failed to store provider key" },
      { status: 500 }
    );
  }
}

// DELETE /api/settings/keys?provider=elevenlabs — remove a stored key
export async function DELETE(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const provider = searchParams.get("provider");
    if (!provider) {
      return NextResponse.json(
        { error: "provider query param required" },
        { status: 400 }
      );
    }
    await deleteProviderKey(provider);
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error("[/api/settings/keys DELETE]", err);
    return NextResponse.json(
      { error: "Failed to delete provider key" },
      { status: 500 }
    );
  }
}

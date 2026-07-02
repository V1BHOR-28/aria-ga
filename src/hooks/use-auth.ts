"use client";

import { useCallback, useEffect, useState } from "react";

interface UseAuthReturn {
  authenticated: boolean | null; // null = checking, true = logged in, false = need login
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

/**
 * Tracks authentication state.
 *
 * In development (preview environment): auth is disabled — the app
 * loads directly without a login screen. This avoids cookie issues
 * with the Caddy proxy + cross-origin iframe.
 *
 * In production: auth is enabled — pings /api/auth/check to verify
 * the session cookie, shows login screen if not authenticated.
 */
export function useAuth(): UseAuthReturn {
  // In dev mode, always authenticated — skip the login flow entirely
  const isDev = process.env.NODE_ENV !== "production";
  const [authenticated, setAuthenticated] = useState<boolean | null>(
    isDev ? true : null
  );

  // Check auth status on mount (production only)
  useEffect(() => {
    if (isDev) return; // skip in dev

    let cancelled = false;
    fetch("/api/auth/check", { credentials: "same-origin" })
      .then((r) => {
        if (cancelled) return;
        setAuthenticated(r.ok);
      })
      .catch(() => {
        if (!cancelled) setAuthenticated(false);
      });
    return () => {
      cancelled = true;
    };
  }, [isDev]);

  const login = useCallback(
    async (password: string): Promise<boolean> => {
      if (isDev) return true; // always succeed in dev
      try {
        const res = await fetch("/api/auth/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          credentials: "same-origin",
          body: JSON.stringify({ password }),
        });
        if (res.ok) {
          setAuthenticated(true);
          return true;
        }
        return false;
      } catch {
        return false;
      }
    },
    [isDev]
  );

  const logout = useCallback(async (): Promise<void> => {
    if (isDev) return; // no-op in dev
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // ignore
    }
    setAuthenticated(false);
  }, [isDev]);

  return { authenticated, login, logout };
}

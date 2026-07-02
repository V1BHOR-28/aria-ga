"use client";

import { useCallback, useEffect, useState } from "react";

interface UseAuthReturn {
  authenticated: boolean | null; // null = checking, true = logged in, false = need login
  login: (password: string) => Promise<boolean>;
  logout: () => Promise<void>;
}

/**
 * Tracks authentication state.
 * - On mount, pings /api/auth/check to see if the session cookie is valid.
 * - login() posts to /api/auth/login and returns true on success.
 * - logout() posts to /api/auth/logout.
 */
export function useAuth(): UseAuthReturn {
  const [authenticated, setAuthenticated] = useState<boolean | null>(null);

  // Check auth status on mount
  useEffect(() => {
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
  }, []);

  const login = useCallback(async (password: string): Promise<boolean> => {
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
  }, []);

  const logout = useCallback(async (): Promise<void> => {
    try {
      await fetch("/api/auth/logout", {
        method: "POST",
        credentials: "same-origin",
      });
    } catch {
      // ignore
    }
    setAuthenticated(false);
  }, []);

  return { authenticated, login, logout };
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { track } from "@/lib/analytics";
import type { Profile } from "@/lib/agent/types";

// GETs /api/profile on mount and whenever refreshKey changes (the dashboard passes the tick count).
export function useProfile(refreshKey: number) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [nonce, setNonce] = useState(0);
  const lastPolicy = useRef("");

  useEffect(() => {
    const c = new AbortController();
    fetch("/api/profile", { signal: c.signal, cache: "no-store" })
      .then(async (r) => {
        if (!r.ok) throw new Error(((await r.json().catch(() => null)) as { error?: string } | null)?.error ?? `Profile request failed (${r.status})`);
        return (await r.json()) as Profile;
      })
      .then((p) => {
        setProfile(p);
        setError(null);
        const key = JSON.stringify(p.policy);
        if (key !== lastPolicy.current) {
          lastPolicy.current = key;
          track("policy_seen", { autonomy: p.policy.autonomy, recallGuard: p.policy.recallGuard, source: p.policy.source });
        }
      })
      .catch((e: unknown) => {
        if (!c.signal.aborted) setError(e instanceof Error ? e.message : "Could not load the profile");
      });
    return () => c.abort();
  }, [refreshKey, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { profile, error, reload };
}
export type ProfileApi = ReturnType<typeof useProfile>;

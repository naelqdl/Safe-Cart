"use client";

import { useSyncExternalStore } from "react";

// Server snapshot is false so hydration matches; the real value applies right after mount.
export function useMedia(query: string): boolean {
  return useSyncExternalStore(
    (cb) => {
      const mq = window.matchMedia(query);
      mq.addEventListener("change", cb);
      return () => mq.removeEventListener("change", cb);
    },
    () => window.matchMedia(query).matches,
    () => false,
  );
}

export const useCompact = () => useMedia("(max-width: 719px)");

'use client';

import { useEffect, useState } from 'react';
import { useVisibilityAwareInterval } from '@/hooks/useVisibilityAwareInterval';

/**
 * ============================================================================
 * Helm Bridge · RelativeTime (M1, bridge-chrome)
 * ----------------------------------------------------------------------------
 * "updated Ns ago" / "updated Nm ago" from an epoch-ms timestamp, ticking on
 * a visibility-aware 10s interval (the same `useVisibilityAwareInterval` hook
 * `AutoRefresh` uses — paused while the tab isn't visible, no point re-
 * rendering chrome nobody's looking at).
 *
 * Same fix as `LocalTime.tsx` (React #418 — confirmed root cause of the
 * 6:47:57 PM Overview incident, 2026-07-02): `Date.now()` resolves
 * differently on the server vs. the client's first render if read directly
 * during render, which is a guaranteed text mismatch for a 'use client'
 * component. Render a deterministic placeholder on both the server AND the
 * client's first pass, then swap to the real relative label from a
 * post-hydration effect (a normal update, not a hydration disagreement).
 * ========================================================================== */

function formatSince(sinceMs: number, nowMs: number): string {
  const seconds = Math.max(0, Math.round((nowMs - sinceMs) / 1000));
  if (seconds < 60) return `${seconds}s ago`;
  const minutes = Math.round(seconds / 60);
  return `${minutes}m ago`;
}

export function RelativeTime({
  sinceMs,
  intervalMs = 10_000,
  className,
}: {
  /** Epoch ms the freshness clock counts up from. */
  sinceMs: number;
  intervalMs?: number;
  className?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    setLabel(formatSince(sinceMs, Date.now()));
  }, [sinceMs]);

  useVisibilityAwareInterval(() => {
    setLabel(formatSince(sinceMs, Date.now()));
  }, intervalMs);

  return (
    <span className={className} suppressHydrationWarning>
      updated {label ?? '—'}
    </span>
  );
}

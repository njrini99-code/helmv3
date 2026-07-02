'use client';

import { useEffect, useState } from 'react';

export type LocalTimeVariant = 'time' | 'datetime';

/**
 * Renders a timestamp in the VIEWER's local timezone without causing a
 * hydration mismatch (React #418 — confirmed root cause of the 6:47:57 PM
 * Overview incident, 2026-07-02).
 *
 * `toLocaleTimeString()` / `toLocaleString()` resolve against the RUNTIME's
 * default timezone. Vercel's serverless functions run in UTC; an admin's
 * phone resolves its own local zone. Calling either directly inside a
 * *Client* Component's render body means the string is computed TWICE for
 * the same instant — once server-side (baked into the SSR HTML, UTC) and
 * once client-side during hydration (the browser's local zone) — which is a
 * guaranteed, deterministic text mismatch, not a timing race. (Plain Server
 * Components don't have this problem — they render once and their output is
 * embedded as-is; the bug only bites 'use client' components, or Client
 * Components rendering server-supplied data, that format dates inline.)
 *
 * Fix: render the SAME deterministic placeholder on the server and the
 * client's first pass (nothing for hydration to disagree about), then swap
 * to the localized string from a `useEffect` — a normal post-hydration
 * update, not a hydration check. `suppressHydrationWarning` is the same
 * belt-and-suspenders already used for time text elsewhere in this codebase
 * (see src/components/golf/tasks/ReminderBadge.tsx).
 */
export function LocalTime({
  iso,
  variant = 'time',
  fallback = '—',
}: {
  iso: string;
  variant?: LocalTimeVariant;
  fallback?: string;
}) {
  const [label, setLabel] = useState<string | null>(null);

  useEffect(() => {
    const d = new Date(iso);
    setLabel(variant === 'time' ? d.toLocaleTimeString() : d.toLocaleString());
  }, [iso, variant]);

  return <span suppressHydrationWarning>{label ?? fallback}</span>;
}

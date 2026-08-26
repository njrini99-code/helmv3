'use client';

import { useLayoutEffect, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { Eyebrow } from '@/components/fairway';

const STORAGE_KEY = 'helm-bridge-posture-open';

/**
 * The collapsed "Posture" section — KPI StatStrip, SignalBoard, DeployRail,
 * FeatureHealthPanel, and the saved command views. Everything an operator
 * wants for a slower "how healthy overall" look, but not what answers "is
 * anything on fire right now" — that lives ABOVE this, in Action lanes /
 * Triage / Regressed, permanently visible and never behind a click.
 *
 * A native `<details>`/`<summary>` — no client React state for open/closed
 * at all; the browser owns that, `group-open:` styles the chevron straight
 * off the native `[open]` attribute, and the content stays in the DOM
 * (just `display:none` while closed) either way, so collapsing this never
 * changes what the server fetched or when it fetched it. The only
 * client-side job is remembering the viewer's own choice: read
 * localStorage once on mount (useLayoutEffect — before first paint, so a
 * returning viewer who left it open doesn't see a flash of collapsed), and
 * write it back on every native `toggle` event. Both wrapped in try/catch —
 * a blocked or unavailable localStorage (private browsing, cleared site
 * data, a storage-access exception in a preview iframe) just means every
 * visit defaults to collapsed, never a crash.
 */
export function PostureDisclosure({ children }: { children: React.ReactNode }) {
  const ref = useRef<HTMLDetailsElement>(null);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    try {
      el.open = window.localStorage.getItem(STORAGE_KEY) === '1';
    } catch {
      // Unavailable — the default closed state (no `open` attribute in the
      // server-rendered markup) already stands; nothing else to do.
    }
  }, []);

  const handleToggle = () => {
    try {
      window.localStorage.setItem(STORAGE_KEY, ref.current?.open ? '1' : '0');
    } catch {
      // Best-effort only — the toggle itself still worked for this visit.
    }
  };

  return (
    <details
      ref={ref}
      onToggle={handleToggle}
      className="group rounded-2xl border border-warm-200 bg-surface"
    >
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 rounded-2xl px-4 py-3 [&::-webkit-details-marker]:hidden">
        <Eyebrow as="span" tone="secondary">Posture</Eyebrow>
        <span className="flex items-center gap-2 text-caption text-warm-500">
          <span className="hidden sm:inline">KPIs · signals · deploys · feature health</span>
          <ChevronDown
            size={16}
            aria-hidden
            className="shrink-0 motion-safe:transition-transform group-open:rotate-180"
          />
        </span>
      </summary>
      <div className="space-y-4 border-t border-warm-200 px-4 py-4">{children}</div>
    </details>
  );
}

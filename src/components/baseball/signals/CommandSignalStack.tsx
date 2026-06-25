'use client';

// =============================================================================
// src/components/baseball/signals/CommandSignalStack.tsx
//
// Packet: signal-inbox — the compact Signal Stack embedded in the Coach Command
// Center (V10 §Command Center "Signal Stack: grouped by urgency"). Shows the top
// open, source-backed signals with severity + source chip + confidence, and a
// link into the full Signals workspace. Read-only here (triage + conversion
// happen on /signals); this is the 20-second "what changed" surface.
//
// Cream/green GolfHelm look (Card + Badge + SourceTrustBadge). NO golf labels.
// Every async surface has a skeleton (loading), a friendly error, and a genuine
// empty state. Entrance motion is reduced-motion-safe.
// =============================================================================

import Link from 'next/link';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/ui/empty-state';
import { Skeleton } from '@/components/ui/skeleton';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import {
  IconShieldAlert,
  IconArrowRight,
  IconAlertCircle,
  IconWarning,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  DURATION,
  EASE_CINEMATIC,
  STAGGER_STEP,
  useReducedMotionGuard,
} from '@/lib/coachhelm/v3/motion';
import type { SignalInboxRow } from '@/lib/baseball/read-models/signal-inbox';
import { getSeverityPresentation, getCategoryLabel } from './signal-presentation';

export interface CommandSignalStackProps {
  /** Pre-ordered top open signals (read model feed order, already sliced). */
  signals: SignalInboxRow[];
  playerNames: Record<string, string>;
  /** Total open count, for the "view all" affordance. */
  openCount: number;
  /** Honest degraded-feed error from the read model. */
  error?: string | null;
  /** True while the read model is still resolving (server normally passes false). */
  loading?: boolean;
  /** Max to render inline (default 5). */
  limit?: number;
}

// -----------------------------------------------------------------------------
// Shell — shared chrome so loading / error / empty / data all read identically.
// -----------------------------------------------------------------------------

function StackShell({
  openCount,
  children,
}: {
  openCount: number;
  children: React.ReactNode;
}) {
  return (
    <Card variant="overlay" hover={false} padding="md" className="border-warm-200/60">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-lg bg-warm-100 text-warm-500">
            <IconShieldAlert size={14} />
          </span>
          <h2 className="text-xs font-semibold uppercase tracking-wide text-warm-800">
            Signal Stack
          </h2>
          {openCount > 0 && (
            <Badge tone="primary" appearance="soft" size="sm">
              {openCount} open
            </Badge>
          )}
        </div>
        <Link
          href="/baseball/dashboard/signals"
          className="group inline-flex items-center gap-1 rounded-md px-1 -mx-1 text-xs font-medium text-primary-600 transition-colors hover:text-primary-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40 focus-visible:ring-offset-1 focus-visible:ring-offset-cream-50"
        >
          Triage all
          <IconArrowRight
            size={13}
            className="transition-transform duration-200 ease-out group-hover:translate-x-0.5"
          />
        </Link>
      </div>
      {children}
    </Card>
  );
}

function StackRowSkeleton() {
  return (
    <li className="flex items-start gap-3 rounded-xl border border-warm-200/50 bg-cream-100/70 p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton variant="circular" className="h-5 w-5 flex-shrink-0" />
    </li>
  );
}

export function CommandSignalStack({
  signals,
  playerNames,
  openCount,
  error = null,
  loading = false,
  limit = 5,
}: CommandSignalStackProps) {
  const reduce = useReducedMotionGuard();
  const shown = signals.slice(0, limit);

  // ── Loading — matched-shape skeleton, never a spinner ───────────────────────
  if (loading) {
    return (
      <StackShell openCount={openCount}>
        <ul className="space-y-2" aria-hidden>
          {[0, 1, 2].map((i) => (
            <StackRowSkeleton key={i} />
          ))}
        </ul>
        <span className="sr-only">Loading signals…</span>
      </StackShell>
    );
  }

  // ── Error — friendly, source-honest, never a bare red string ───────────────
  if (error) {
    return (
      <StackShell openCount={openCount}>
        <div className="flex items-start gap-2.5 rounded-xl border border-amber-200/70 bg-amber-50/70 px-3 py-3">
          <IconWarning size={15} className="mt-0.5 flex-shrink-0 text-amber-500" />
          <div className="min-w-0">
            <p className="text-sm font-medium text-amber-800">
              Couldn&apos;t load the latest signals
            </p>
            <p className="mt-0.5 text-xs leading-relaxed text-amber-700">{error}</p>
          </div>
        </div>
      </StackShell>
    );
  }

  // ── Empty — genuinely reassuring, not a dead end ───────────────────────────
  if (shown.length === 0) {
    return (
      <StackShell openCount={openCount}>
        <EmptyState
          variant="minimal"
          icon={<IconShieldAlert size={20} />}
          title="No open signals"
          description="You're clear. New signals appear here when fresh data lands."
        />
      </StackShell>
    );
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  return (
    <StackShell openCount={openCount}>
      <LazyMotion features={domAnimation} strict>
        <ul className="space-y-2">
          {shown.map((s, i) => {
            const sev = getSeverityPresentation(s.severity);
            return (
              <m.li
                key={s.id}
                initial={reduce ? false : { opacity: 0, y: 6 }}
                animate={reduce ? false : { opacity: 1, y: 0 }}
                transition={{
                  duration: DURATION.short,
                  ease: EASE_CINEMATIC,
                  delay: i * STAGGER_STEP,
                }}
                className="group relative flex items-start gap-3 overflow-hidden rounded-xl border border-warm-200/50 bg-cream-100/70 p-3 transition-colors duration-200 ease-out hover:border-warm-200 hover:bg-cream-50"
              >
                <span
                  aria-hidden
                  className={cn('absolute left-0 top-0 bottom-0 w-1', sev.accentClass)}
                />
                <div className="min-w-0 flex-1 pl-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                    <Badge tone={sev.tone} appearance="soft" size="sm">
                      {sev.label}
                    </Badge>
                    <Badge tone="warm" appearance="outline" size="sm">
                      {getCategoryLabel(s.category)}
                    </Badge>
                    {s.sampleTooSmall && (
                      <span className="flex items-center gap-0.5 text-eyebrow uppercase tracking-wide text-warm-500">
                        <IconAlertCircle size={11} /> small sample
                      </span>
                    )}
                  </div>
                  <p className="truncate text-sm font-medium leading-snug text-warm-900">
                    {s.title}
                  </p>
                  <p className="mt-0.5 text-xs text-warm-500">
                    {s.playerId ? (playerNames[s.playerId] ?? 'Player') : 'Team-wide'}
                  </p>
                </div>
                <div className="flex-shrink-0">
                  <SourceTrustBadge
                    trust={s.trust}
                    provenance={s.provenance}
                    size="sm"
                    iconOnly
                  />
                </div>
              </m.li>
            );
          })}
        </ul>
      </LazyMotion>
    </StackShell>
  );
}

'use client';

// =============================================================================
// src/components/baseball/signals/CommandSignalStack.tsx
//
// Packet: signal-inbox — the compact Signal Stack meant for embedding in the
// Coach Command Center (V10 §Command Center "Signal Stack: grouped by
// urgency"). Shows the top open, source-backed signals with severity + source
// chip, and a link into the full Signals workspace. Read-only here (triage +
// conversion happen on /signals); this is the 20-second "what changed" surface.
//
// A self-contained `<PaperCard>` so it composes cleanly wherever it's mounted —
// including a green (`team`) Pressbox page — without forcing the host page's
// lane. Severity itself stays `pursuit` ink per spec §4.2 rule 2 ("hot
// signals" are a sanctioned clay use even outside the War Room). Every async
// surface has a skeleton (loading), a friendly error, and a genuine empty
// state — never a yellow/amber box. Entrance motion is reduced-motion-safe via
// the shared `<Reveal>` primitive.
//
// NOTE (collision guard, docs/baseball/ui-migration-execution-plan.md §3.2
// signals row): this component is not currently imported by the Command
// Center (`CommandCenterFairway.tsx` reuses `RiskFeedStrip` verbatim instead —
// verified via repo-wide grep before this change). The prop contract below is
// kept STABLE (`signals, playerNames, openCount, error, loading, limit`) so a
// future embed keeps working either way.
// =============================================================================

import type { ReactNode } from 'react';
import Link from 'next/link';
import {
  PaperCard,
  InkBadge,
  Eyebrow,
  EditorsLetter,
  Reveal,
  HoverReveal,
} from '@/components/baseball/living-annual';
import { InlineNotice, Skeleton } from '@/components/fairway';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import { IconShieldAlert, IconArrowRight, IconAlertCircle } from '@/components/icons';
import { cn } from '@/lib/utils';
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
  children: ReactNode;
}) {
  return (
    <PaperCard className="p-5">
      <div className="mb-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="inline-flex h-6 w-6 items-center justify-center rounded-fw-sm bg-[color:var(--hairline)]/40 text-text-tertiary">
            <IconShieldAlert size={14} aria-hidden />
          </span>
          <Eyebrow as="h2" ink="pursuit">
            Signal Stack
          </Eyebrow>
          {openCount > 0 && <InkBadge label={`${openCount} open`} tone="pursuit" />}
        </div>
        <HoverReveal
          reveal={
            <IconArrowRight
              size={13}
              aria-hidden
              className="translate-x-0 text-pursuit transition-transform duration-200 ease-out"
            />
          }
        >
          <Link
            href="/baseball/dashboard/signals"
            className="rounded-fw-sm font-annual text-body-sm font-medium text-pursuit outline-none focus-visible:ring-2 focus-visible:ring-pursuit focus-visible:ring-offset-1"
          >
            Triage all
          </Link>
        </HoverReveal>
      </div>
      {children}
    </PaperCard>
  );
}

function StackRowSkeleton() {
  return (
    <li className="flex items-start gap-3 rounded-fw-sm border border-[color:var(--hairline)] bg-[var(--paper)] p-3">
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex items-center gap-1.5">
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-16" />
        </div>
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-3 w-1/3" />
      </div>
      <Skeleton circle className="h-5 w-5 flex-shrink-0" />
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
        <InlineNotice tone="warning" title="Couldn't load the latest signals">
          {error}
        </InlineNotice>
      </StackShell>
    );
  }

  // ── Empty — a genuinely reassuring "you're clear," not a mismatched ticker
  //    line (this is a triage inbox, not a commit/offer wire — the shared
  //    `EmptyIssue` 'signals' preset is copy-mismatched for this surface, so
  //    this composes `<EditorsLetter>` directly with the correct framing). ──
  if (shown.length === 0) {
    return (
      <StackShell openCount={openCount}>
        <EditorsLetter
          ink="pursuit"
          title="All clear on the signal stack."
          body="New signals surface here the moment fresh data lands — imports, readiness check-ins, or a schedule conflict."
        />
      </StackShell>
    );
  }

  // ── Data ───────────────────────────────────────────────────────────────────
  // `role="list"`/`role="listitem"` (not literal <ul>/<li>) so each row can be
  // a <Reveal> (a <div> wrapper) without producing invalid <div> children of a
  // real <ul> — list semantics for assistive tech are preserved via ARIA.
  return (
    <StackShell openCount={openCount}>
      <div role="list" className="space-y-2">
        {shown.map((s, i) => {
          const sev = getSeverityPresentation(s.severity);
          return (
            <Reveal key={s.id} staggerIndex={i}>
              <div
                role="listitem"
                className="relative flex items-start gap-3 overflow-hidden rounded-fw-sm border border-[color:var(--hairline)] bg-[var(--paper)] p-3"
              >
                <span aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-[3px]', sev.ruleClass)} />
                <div className="min-w-0 flex-1 pl-1">
                  <div className="mb-0.5 flex flex-wrap items-center gap-1.5">
                    <InkBadge label={sev.label} tone={sev.tone} variant={sev.variant} />
                    <InkBadge label={getCategoryLabel(s.category)} tone="neutral" />
                    {s.sampleTooSmall && (
                      <span className="flex items-center gap-0.5 font-annual text-eyebrow uppercase tracking-wide text-text-tertiary">
                        <IconAlertCircle size={11} aria-hidden /> small sample
                      </span>
                    )}
                  </div>
                  <p className="truncate font-annual text-body-sm font-medium leading-snug text-text-primary">
                    {s.title}
                  </p>
                  <p className="mt-0.5 font-annual text-eyebrow text-text-tertiary">
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
              </div>
            </Reveal>
          );
        })}
      </div>
    </StackShell>
  );
}

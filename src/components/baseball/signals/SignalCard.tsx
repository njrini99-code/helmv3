'use client';

// =============================================================================
// src/components/baseball/signals/SignalCard.tsx
//
// Packet: signal-inbox — the core source-backed signal unit (V10 §Signals
// "Signal Fields" + "Interactions"). Rendered by the feed (full), compact
// (dense), grouped, and board views. Cream/green GolfHelm look; reuses Card +
// Badge + Button + the Foundations SourceTrustBadge VERBATIM. NO golf labels.
//
// HONESTY (binding):
//   * Source chip is the shared SourceTrustBadge (real provenance + confidence,
//     never a fabricated 100%; opens the source drawer).
//   * A dedicated 'Source' trigger button (min 44px touch target, chevron icon)
//     opens <SignalSourceDrawer> with the signal's sourceChips, confidence, and
//     limitation. Per spec §3.4: no source data → "Source not yet attached —
//     this signal cannot be acted upon".
//   * `sampleTooSmall` renders a first-class "Sample too small" banner and the
//     recommended action is shown as ADVISORY (not a directive) — a
//     source-starved signal is never authoritative.
//   * confidence shows "—" when null; never a fake 0%.
//   * Interactions are capability-aware: when `canManage` is false the card is
//     read-only (no triage / convert buttons).
//   * Table fallback: if the signal has no chart data, `evidence` is rendered
//     as a plain text list rather than leaving a blank chart area.
// =============================================================================

import * as React from 'react';
import { LazyMotion, domAnimation, m } from 'framer-motion';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import { SignalSourceDrawer } from '@/components/baseball/source-trust/SourceDrawer';
import {
  IconCheck,
  IconX,
  IconBolt,
  IconClipboardList,
  IconAlertCircle,
  IconChevronRight,
  IconTrendingUp,
  IconTrendingDown,
  IconInfo,
  IconList,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import {
  DURATION,
  EASE_CINEMATIC,
  useReducedMotionGuard,
} from '@/lib/coachhelm/v3/motion';
import type { SignalInboxRow, SignalActionRow } from '@/lib/baseball/read-models/signal-inbox';
import {
  getSeverityPresentation,
  getDispositionPresentation,
  getCategoryLabel,
  getActionTypeLabel,
} from './signal-presentation';

/**
 * Evidence table fallback (spec §4.x). When a signal has no chart or numeric
 * data to display, render its evidence string as a plain readable list.
 * Splits on semicolons or line breaks (common generator patterns), falls back
 * to a single paragraph. Honest empty guard: returns null when evidence is
 * absent — never a blank area.
 */
function EvidenceList({ evidence }: { evidence: string }) {
  const trimmed = evidence.trim();
  if (!trimmed) return null;

  // Split on "; " or "\n" boundaries to detect a multi-item string.
  const parts = trimmed
    .split(/(?:;\s*|\n+)/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return (
      <p className="mt-1.5 text-xs text-warm-500 leading-relaxed">{trimmed}</p>
    );
  }

  return (
    <ul className="mt-1.5 space-y-0.5" aria-label="Signal evidence">
      {parts.map((item, i) => (
        <li key={i} className="flex items-start gap-2 text-xs text-warm-500 leading-relaxed">
          <IconList
            size={11}
            aria-hidden
            className="mt-0.5 flex-shrink-0 text-warm-400"
          />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The did-it-move verdict pill for a converted action (V10 outcome ledger).
 * Honest: 'too_early'/'insufficient_sample' render neutral, never as a win; only
 * a measured direction (with ≥2 after-window games) earns green/red.
 */
function ActionVerdictBadge({ action }: { action: SignalActionRow }) {
  const v = action.outcomeVerdict;
  if (!v) return null;
  if (v === 'improved') {
    return (
      <Badge tone="emerald" appearance="soft" size="sm">
        <IconTrendingUp size={11} />
        Improved
      </Badge>
    );
  }
  if (v === 'regressed') {
    return (
      <Badge tone="red" appearance="soft" size="sm">
        <IconTrendingDown size={11} />
        Regressed
      </Badge>
    );
  }
  if (v === 'too_early') {
    return (
      <Badge tone="amber" appearance="soft" size="sm">
        Too early
      </Badge>
    );
  }
  if (v === 'no_change') {
    return (
      <Badge tone="neutral" appearance="soft" size="sm">
        No change
      </Badge>
    );
  }
  // insufficient_sample → not measurable; stay neutral + quiet.
  return null;
}

export interface SignalCardProps {
  signal: SignalInboxRow;
  /** Player display name for the subject, if resolvable. */
  playerName?: string | null;
  /** Dense single-line-ish layout (compact + board column variant). */
  variant?: 'full' | 'compact';
  /** Capability gate — false renders read-only. */
  canManage?: boolean;
  /** Whether a mutation is in flight for this card (disables buttons). */
  pending?: boolean;
  onAcknowledge?: (signalId: string) => void;
  onDismiss?: (signalId: string) => void;
  onResolve?: (signalId: string) => void;
  onConvert?: (signal: SignalInboxRow) => void;
  onFeedback?: (signalId: string, feedback: 'useful' | 'not_useful' | 'wrong') => void;
}

function confidenceText(confidence: number | null): string {
  if (confidence === null) return '—';
  return `${Math.round(confidence * 100)}%`;
}

export function SignalCard({
  signal,
  playerName,
  variant = 'full',
  canManage = true,
  pending = false,
  onAcknowledge,
  onDismiss,
  onResolve,
  onConvert,
  onFeedback,
}: SignalCardProps) {
  const [sourceDrawerOpen, setSourceDrawerOpen] = React.useState(false);
  const reduce = useReducedMotionGuard();
  const sev = getSeverityPresentation(signal.severity);
  const disp = getDispositionPresentation(signal.disposition);
  const isOpen =
    signal.disposition === 'new' ||
    signal.disposition === 'acknowledged' ||
    signal.disposition === 'sample_too_small';
  const compact = variant === 'compact';

  // Derive the limitation text from sample-too-small flag for the source drawer.
  const limitation = signal.sampleTooSmall
    ? `Sample too small${signal.sampleN != null ? ` (n=${signal.sampleN})` : ''}. Treat as a watch item, not a confident finding.`
    : null;

  return (
    <LazyMotion features={domAnimation} strict>
      <m.div
        initial={reduce ? false : { opacity: 0, y: 6 }}
        animate={reduce ? false : { opacity: 1, y: 0 }}
        transition={{ duration: DURATION.short, ease: EASE_CINEMATIC }}
      >
        <Card
          variant="overlay"
          hover={false}
          padding="none"
          aria-busy={pending || undefined}
          className={cn(
            'relative overflow-hidden border-warm-200/60 transition-[box-shadow,border-color,opacity] duration-200 ease-out hover:border-warm-200 hover:shadow-glass-hover',
            pending && 'opacity-60',
          )}
        >
          {/* Severity accent bar */}
          <span
            aria-hidden
            className={cn('absolute left-0 top-0 bottom-0 w-1', sev.accentClass)}
          />

          <div className={cn('pl-4', compact ? 'p-3 pl-4' : 'p-4 pl-5')}>
        {/* ── Header row ──────────────────────────────────────────── */}
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-1.5 mb-1">
              <Badge tone={sev.tone} appearance="soft" size="sm">
                {sev.label}
              </Badge>
              <Badge tone="warm" appearance="outline" size="sm">
                {getCategoryLabel(signal.category)}
              </Badge>
              <Badge tone={disp.tone} appearance="soft" size="sm">
                {disp.label}
              </Badge>
            </div>
            <h3
              className={cn(
                'font-semibold text-warm-900 leading-snug',
                compact ? 'text-sm' : 'text-body',
              )}
            >
              {signal.title}
            </h3>
            {(playerName || signal.playerId == null) && (
              <p className="text-xs text-warm-500 mt-0.5">
                {playerName ?? 'Team-wide'}
              </p>
            )}
          </div>

          {/* Source chip + Source drawer trigger (min 44px touch target). */}
          <div className="flex-shrink-0 flex items-center gap-1.5">
            <SourceTrustBadge
              trust={signal.trust}
              provenance={signal.provenance}
              size="sm"
            />
            {/* Dedicated 'Source' button per spec — opens SignalSourceDrawer
                with sourceChips / confidence / limitation. 44px minimum. */}
            <Button
              variant="ghost"
              type="button"
              onClick={() => setSourceDrawerOpen(true)}
              aria-label="View signal source details"
              aria-haspopup="dialog"
              className="inline-flex items-center gap-1 min-h-[44px] min-w-[44px] justify-center rounded-lg px-2 text-xs font-medium text-warm-500 hover:text-warm-900 hover:bg-warm-50"
            >
              <IconInfo size={13} aria-hidden />
              <span className="hidden sm:inline">Source</span>
              <IconChevronRight size={11} aria-hidden className="text-warm-400" />
            </Button>
          </div>
        </div>

        {/* ── Sample-too-small first-class banner ─────────────────── */}
        {signal.sampleTooSmall && (
          <div className="mt-2.5 flex items-start gap-2 rounded-lg bg-warm-50 border border-warm-200/70 px-3 py-2">
            <IconAlertCircle size={14} className="text-warm-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-warm-600 leading-relaxed">
              Sample too small
              {signal.sampleN != null ? ` (n=${signal.sampleN})` : ''} — treat as
              a watch item, not a confident finding.
            </p>
          </div>
        )}

        {/* ── Why it matters + evidence (full only) ───────────────── */}
        {!compact && signal.whyItMatters && (
          <p className="mt-2.5 text-sm text-warm-700 leading-relaxed">
            {signal.whyItMatters}
          </p>
        )}
        {/* Evidence table fallback: no chart data → render evidence as a plain
            text list per spec. If evidence is absent, render nothing rather than
            leaving a blank area. */}
        {!compact && signal.evidence && (
          <EvidenceList evidence={signal.evidence} />
        )}

        {/* ── Confidence + recommended action ─────────────────────── */}
        <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs">
          <span className="text-warm-500">
            Confidence{' '}
            <span className="font-semibold tabular-nums text-warm-700">
              {confidenceText(signal.confidence)}
            </span>
          </span>
          {signal.recommendedActionType && signal.recommendedActionType !== 'none' && (
            <span className="text-warm-500">
              {signal.sampleTooSmall ? 'Possible step' : 'Recommended'}:{' '}
              <span className="font-medium text-warm-700">
                {signal.recommendedActionLabel ??
                  getActionTypeLabel(signal.recommendedActionType)}
              </span>
            </span>
          )}
        </div>

        {/* ── Already-converted actions + did-it-move verdict ──────── */}
        {signal.actions.length > 0 && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5">
            {signal.actions.map((a) => (
              <span key={a.id} className="inline-flex items-center gap-1">
                <Badge tone="primary" appearance="soft" size="sm">
                  <IconClipboardList size={11} />
                  {getActionTypeLabel(a.actionType)}
                  {a.status === 'completed' ? ' · done' : ''}
                </Badge>
                <ActionVerdictBadge action={a} />
              </span>
            ))}
          </div>
        )}

        {/* ── Interactions (capability-aware) ─────────────────────── */}
        {canManage && (
          <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-warm-100 pt-3">
            {isOpen && (
              <>
                {signal.disposition === 'new' && (
                  <Button
                    variant="ghost"
                    onClick={() => onAcknowledge?.(signal.id)}
                    disabled={pending}
                    className="h-8 gap-1.5 px-3 text-xs font-medium text-warm-600 hover:text-warm-900"
                  >
                    <IconCheck size={13} /> Acknowledge
                  </Button>
                )}
                <Button
                  variant="primary"
                  onClick={() => onConvert?.(signal)}
                  disabled={pending}
                  className="h-8 gap-1.5 px-3 text-xs font-semibold"
                >
                  <IconBolt size={13} /> Convert to action
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onResolve?.(signal.id)}
                  disabled={pending}
                  className="h-8 gap-1.5 px-3 text-xs font-medium text-warm-600 hover:text-primary-700"
                >
                  Resolve
                </Button>
                <Button
                  variant="ghost"
                  onClick={() => onDismiss?.(signal.id)}
                  disabled={pending}
                  className="h-8 gap-1.5 px-3 text-xs font-medium text-warm-500 hover:text-red-600"
                >
                  <IconX size={13} /> Dismiss
                </Button>
              </>
            )}

            {/* useful / not-useful / wrong feedback */}
            <div
              role="group"
              aria-label="Was this signal useful?"
              className="ml-auto flex items-center gap-1"
            >
              {(['useful', 'not_useful', 'wrong'] as const).map((f) => (
                <Button
                  key={f}
                  variant="ghost"
                  onClick={() => onFeedback?.(signal.id, f)}
                  disabled={pending}
                  aria-pressed={signal.feedback === f}
                  className={cn(
                    'h-7 px-2 text-eyebrow font-medium uppercase tracking-wide transition-colors',
                    signal.feedback === f
                      ? 'text-primary-700'
                      : 'text-warm-500 hover:text-warm-800',
                  )}
                >
                  {f === 'useful' ? 'Useful' : f === 'not_useful' ? 'Not useful' : 'Wrong'}
                </Button>
              ))}
            </div>
          </div>
        )}

            {!canManage && signal.actions.length === 0 && (
              <p className="mt-3 flex items-center gap-1 text-eyebrow uppercase tracking-wide text-warm-500">
                Read-only <IconChevronRight size={11} />
              </p>
            )}
          </div>
        </Card>
      </m.div>

      {/* Signal source drawer — opened by the 'Source' trigger button above.
          Passes sourceChips, confidence, and limitation from the signal. Per
          spec §3.4: when all three are null the drawer shows "Source not yet
          attached — this signal cannot be acted upon". */}
      <SignalSourceDrawer
        open={sourceDrawerOpen}
        onOpenChange={setSourceDrawerOpen}
        trust={signal.trust}
        provenance={signal.provenance}
        sourceChips={signal.sourceRefs.length > 0 ? signal.sourceRefs : null}
        signalConfidence={signal.confidence}
        limitation={limitation}
      />
    </LazyMotion>
  );
}

'use client';

// =============================================================================
// src/components/baseball/signals/SignalCard.tsx
//
// Packet: signal-inbox — the core source-backed signal unit (V10 §Signals
// "Signal Fields" + "Interactions"), composed from the "Living Annual" kit
// (spec: docs/baseball/design-system-living-annual.md; plan:
// docs/baseball/ui-migration-execution-plan.md §3.2 signals row). Rendered by
// the feed (full), compact (dense), grouped, and board views. THE WAR ROOM lane
// (`pursuit`/clay ink) — this is a triage inbox, NOT a ticker: no CommitSeal
// anywhere on this card. PRESENTATION ONLY — every read/write path below is
// untouched. NO golf labels.
//
// HONESTY (binding):
//   * Source chip is the shared SourceTrustBadge (real provenance + confidence,
//     never a fabricated 100%; opens the source drawer) — reused verbatim.
//   * A dedicated 'Source' trigger button (min 44px touch target) opens
//     <SignalSourceDrawer> with the signal's sourceChips, confidence, and
//     limitation. Per spec §3.4: no source data → "Source not yet attached —
//     this signal cannot be acted upon".
//   * `sampleTooSmall` renders a first-class advisory banner (InkNotice, the
//     baseball kit's pursuit-ink strip — never an amber/yellow box) and the
//     recommended action is shown as ADVISORY (not a directive) — a
//     source-starved signal is never authoritative.
//   * confidence shows "—" when null; never a fake 0%.
//   * Interactions are capability-aware: when `canManage` is false the card is
//     read-only (no triage / convert buttons).
//   * Table fallback: if the signal has no chart data, `evidence` is rendered
//     as a plain text list rather than leaving a blank chart area.
//
// Ink doctrine (spec §4.2 rule 2 — "clay/oxblood … hot signals"): severity uses
// `pursuit` InkBadge weight (solid=critical, soft=warning), never red/amber.
// =============================================================================

import * as React from 'react';
import {
  PaperCard,
  InkBadge,
  InkNotice,
  StatReadout,
  Reveal,
  HoverReveal,
} from '@/components/baseball/living-annual';
import { Button, IconButton, SelectablePill } from '@/components/fairway';
import { SourceTrustBadge } from '@/components/baseball/source-trust';
import { SignalSourceDrawer } from '@/components/baseball/source-trust/SourceDrawer';
import { SignalDrillDown } from './SignalDrillDown';
import {
  IconCheck,
  IconX,
  IconBolt,
  IconChevronRight,
  IconInfo,
  IconList,
} from '@/components/icons';
import { cn } from '@/lib/utils';
import type { SignalInboxRow, SignalActionRow } from '@/lib/baseball/read-models/signal-inbox';
import {
  getSeverityPresentation,
  getDispositionPresentation,
  getVerdictPresentation,
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

  const parts = trimmed
    .split(/(?:;\s*|\n+)/)
    .map((s) => s.trim())
    .filter(Boolean);

  if (parts.length <= 1) {
    return (
      <p className="mt-1.5 font-annual text-body-sm leading-relaxed text-text-tertiary">
        {trimmed}
      </p>
    );
  }

  return (
    <ul className="mt-1.5 space-y-0.5" aria-label="Signal evidence">
      {parts.map((item, i) => (
        <li
          key={i}
          className="flex items-start gap-2 font-annual text-body-sm leading-relaxed text-text-tertiary"
        >
          <IconList size={11} aria-hidden className="mt-0.5 flex-shrink-0 text-text-tertiary" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/**
 * The did-it-move verdict stamp for a converted action (V10 outcome ledger).
 * Honest: 'too_early'/'insufficient_sample' render neutral, never as a win; only
 * a measured direction (with ≥2 after-window games) earns team/pursuit ink.
 */
function ActionVerdictBadge({ action }: { action: SignalActionRow }) {
  const v = getVerdictPresentation(action.outcomeVerdict);
  if (!v) return null;
  return <InkBadge label={v.label} tone={v.tone} variant={v.variant} />;
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
  /** Stagger index for the entrance settle (Reveal). */
  index?: number;
  onAcknowledge?: (signalId: string) => void;
  onDismiss?: (signalId: string) => void;
  onResolve?: (signalId: string) => void;
  onConvert?: (signal: SignalInboxRow) => void;
  onFeedback?: (signalId: string, feedback: 'useful' | 'not_useful' | 'wrong') => void;
}

function confidenceText(confidence: number | null): { pct: number | string } {
  if (confidence === null) return { pct: '—' };
  return { pct: Math.round(confidence * 100) };
}

export function SignalCard({
  signal,
  playerName,
  variant = 'full',
  canManage = true,
  pending = false,
  index = 0,
  onAcknowledge,
  onDismiss,
  onResolve,
  onConvert,
  onFeedback,
}: SignalCardProps) {
  const [sourceDrawerOpen, setSourceDrawerOpen] = React.useState(false);
  const [drillDownOpen, setDrillDownOpen] = React.useState(false);
  const sev = getSeverityPresentation(signal.severity);
  const disp = getDispositionPresentation(signal.disposition);
  const isOpen =
    signal.disposition === 'new' ||
    signal.disposition === 'acknowledged' ||
    signal.disposition === 'sample_too_small';
  const compact = variant === 'compact';
  const confidence = confidenceText(signal.confidence);

  return (
    <>
      <Reveal staggerIndex={Math.min(index, 10)}>
        <PaperCard
          className={cn(
            'relative',
            pending && 'opacity-60',
          )}
          aria-busy={pending || undefined}
        >
          {/* Severity accent — a thin lane-ink rule, never a saturated red/amber bar. */}
          <span aria-hidden className={cn('absolute left-0 top-0 bottom-0 w-[3px]', sev.ruleClass)} />

          <div className={cn('pl-4', compact ? 'p-3 pl-4' : 'p-4 pl-5')}>
            {/* ── Header row ──────────────────────────────────────────── */}
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <div className="mb-1 flex flex-wrap items-center gap-1.5">
                  <InkBadge label={sev.label} tone={sev.tone} variant={sev.variant} />
                  <InkBadge label={getCategoryLabel(signal.category)} tone="neutral" />
                  <InkBadge label={disp.label} tone={disp.tone} variant={disp.variant} />
                </div>
                <h3
                  className={cn(
                    'font-annual font-semibold leading-snug text-text-primary',
                    compact ? 'text-body-sm' : 'text-body-lg',
                  )}
                >
                  {signal.title}
                </h3>
                {(playerName || signal.playerId == null) && (
                  <p className="mt-0.5 font-annual text-body-sm text-text-tertiary">
                    {playerName ?? 'Team-wide'}
                  </p>
                )}
              </div>

              {/* Source chip + Source drawer trigger + Detail slide-over trigger (min 44px). */}
              <div className="flex flex-shrink-0 items-center gap-1">
                <SourceTrustBadge trust={signal.trust} provenance={signal.provenance} size="sm" />
                <IconButton
                  variant="ghost"
                  size="sm"
                  onClick={() => setSourceDrawerOpen(true)}
                  aria-label="View signal source details"
                  aria-haspopup="dialog"
                  className="min-h-[44px] min-w-[44px]"
                >
                  <IconInfo size={15} aria-hidden />
                </IconButton>
                {!compact && (
                  <HoverReveal
                    reveal={<IconChevronRight size={13} aria-hidden className="text-pursuit" />}
                  >
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setDrillDownOpen(true)}
                      aria-label="View full signal detail"
                      aria-haspopup="dialog"
                      className="min-h-[44px]"
                    >
                      Detail
                    </Button>
                  </HoverReveal>
                )}
              </div>
            </div>

            {/* ── Sample-too-small first-class advisory ────────────────── */}
            {signal.sampleTooSmall && (
              <InkNotice ink="pursuit" role="status" className="mt-2.5">
                Sample too small
                {signal.sampleN != null ? ` (n=${signal.sampleN})` : ''} — treat as a
                watch item, not a confident finding.
              </InkNotice>
            )}

            {/* ── Why it matters + evidence (full only) ───────────────── */}
            {!compact && signal.whyItMatters && (
              <p className="mt-2.5 font-annual text-body-sm leading-relaxed text-text-secondary">
                {signal.whyItMatters}
              </p>
            )}
            {!compact && signal.evidence && <EvidenceList evidence={signal.evidence} />}

            {/* ── Confidence + recommended action ─────────────────────── */}
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-1.5">
              <span className="inline-flex items-baseline gap-1.5 font-annual text-eyebrow uppercase tracking-[0.12em] text-text-tertiary">
                Confidence
                <StatReadout
                  value={confidence.pct}
                  suffix={typeof confidence.pct === 'number' ? '%' : undefined}
                  className="text-body-sm font-semibold normal-case tracking-normal text-text-primary"
                  ariaLabel="Confidence"
                />
              </span>
              {signal.recommendedActionType && signal.recommendedActionType !== 'none' && (
                <span className="font-annual text-body-sm text-text-tertiary">
                  {signal.sampleTooSmall ? 'Possible step' : 'Recommended'}:{' '}
                  <span className="font-medium text-text-primary">
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
                    <InkBadge
                      label={`${getActionTypeLabel(a.actionType)}${a.status === 'completed' ? ' · done' : ''}`}
                      tone="team"
                    />
                    <ActionVerdictBadge action={a} />
                  </span>
                ))}
              </div>
            )}

            {/* ── Interactions (capability-aware) ─────────────────────── */}
            {canManage && (
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-[color:var(--hairline)] pt-3">
                {isOpen && (
                  <>
                    {signal.disposition === 'new' && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onAcknowledge?.(signal.id)}
                        disabled={pending}
                        leftIcon={<IconCheck size={13} />}
                      >
                        Acknowledge
                      </Button>
                    )}
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => onConvert?.(signal)}
                      disabled={pending}
                      leftIcon={<IconBolt size={13} />}
                    >
                      Convert to action
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onResolve?.(signal.id)}
                      disabled={pending}
                    >
                      Resolve
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => onDismiss?.(signal.id)}
                      disabled={pending}
                      leftIcon={<IconX size={13} />}
                    >
                      Dismiss
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
                    <SelectablePill
                      key={f}
                      shape="round"
                      selected={signal.feedback === f}
                      disabled={pending}
                      onClick={() => onFeedback?.(signal.id, f)}
                      className="min-h-[28px] px-2.5 text-eyebrow font-medium uppercase tracking-wide"
                    >
                      {f === 'useful' ? 'Useful' : f === 'not_useful' ? 'Not useful' : 'Wrong'}
                    </SelectablePill>
                  ))}
                </div>
              </div>
            )}

            {!canManage && signal.actions.length === 0 && (
              <p className="mt-3 flex items-center gap-1 font-annual text-eyebrow uppercase tracking-wide text-text-tertiary">
                Read-only <IconChevronRight size={11} aria-hidden />
              </p>
            )}
          </div>
        </PaperCard>
      </Reveal>

      {/* Signal source drawer — opened by the 'Source' trigger button above.
          Passes sourceChips, confidence, and limitation from the signal. Per
          spec §3.4: when all three are null the drawer shows "Source not yet
          attached — this signal cannot be acted upon". Reused verbatim. */}
      <SignalSourceDrawer
        open={sourceDrawerOpen}
        onOpenChange={setSourceDrawerOpen}
        trust={signal.trust}
        provenance={signal.provenance}
        sourceChips={signal.sourceRefs.length > 0 ? signal.sourceRefs : null}
        signalConfidence={signal.confidence}
        limitation={
          signal.sampleTooSmall
            ? `Sample too small${signal.sampleN != null ? ` (n=${signal.sampleN})` : ''}. Treat as a watch item, not a confident finding.`
            : null
        }
      />

      {/* [W6c] Full signal drill-down — why it matters, evidence, recommended
          action label, limitation, and structured source refs. A right-panel
          Sheet (Fairway overlay kit) — focus trap + Escape are Sheet defaults. */}
      <SignalDrillDown
        signal={signal}
        playerName={playerName}
        open={drillDownOpen}
        onOpenChange={setDrillDownOpen}
      />
    </>
  );
}

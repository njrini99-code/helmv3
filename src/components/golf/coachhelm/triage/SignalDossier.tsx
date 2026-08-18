'use client';

/**
 * ============================================================================
 * SignalDossier — the triage detail pane (Triage Desk spec §3)
 * ----------------------------------------------------------------------------
 * Claim headline, severity + category chips, an evidence block, stroke
 * impact in mono, a WORKING action row (Mark reviewed, Dismiss, Prescribe via
 * `PromoteToFocusAreaButton`, "View stats"), then a RELATED CONTEXT region:
 * this player's other open signals, active focus areas, active goals, and a
 * recent-trend chip. Never dead-ends: every action is wired to
 * `reviewSignal`/`dismissSignal`/`createFocusAreaFromInsight` with an
 * optimistic update owned by `TriageDesk`, this component only renders state
 * + fires callbacks.
 *
 * Layout: on the desktop split (`min-[940px]:`) `TriageDesk`'s grid stretches
 * this column to match the queue's height (`items-stretch`, the CSS Grid
 * default) — this root fills that stretched height (`h-full`) and scrolls
 * its OWN content independently of the queue instead of leaving a blank
 * canvas gap below the action row (the live-QA "~700-800px dead space"
 * finding). Below the breakpoint only one pane shows at a time full-width,
 * so there's no sibling to match height against — the root falls back to its
 * natural content height and the page scrolls normally, same as before.
 * ========================================================================== */

import type { ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft } from 'lucide-react';
import { Badge, Button, EmptyState, PressTarget, StatusPill, TrendGlyph } from '@/components/fairway';
import type { PlayersGridFocusArea, PlayersGridStats } from '@/components/fairway';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { EvidencePanel } from '@/components/golf/coachhelm/insights/EvidencePanel';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { formatCategoryLabel } from './buildTriageViewModel';
import { SeverityChip } from './SignalRow';
import { PromoteToFocusAreaButton } from './PromoteToFocusAreaButton';
import { toCoachVoice } from '@/lib/golf/claim-voice';
import { formatScoringAverage } from '@/lib/golf/format-scoring-average';

export interface SignalDossierEntry {
  signal: GroupedSignal;
  group: SignalGroup;
}

export interface SignalDossierProps {
  entry: SignalDossierEntry | null;
  coachId: string;
  pending: boolean;
  onReview: (signal: GroupedSignal) => void;
  onDismiss: (signal: GroupedSignal) => void;
  onPromoted: (signal: GroupedSignal) => void;
  onBack: () => void;
  /** Fires when the coach picks one of the "other open signals" rows below —
   *  same signal-id contract `TriageDesk.navigate({ signal: id })` uses for
   *  the queue itself. Omitted (row still renders, just non-interactive) if
   *  the caller doesn't wire it. */
  onSelectSignal?: (id: string) => void;
  /** This player's OTHER open focus areas (active/in_progress), filtered by
   *  the caller to `entry.group.playerId`. Defaults to []. */
  playerFocusAreas?: PlayersGridFocusArea[];
  /** This player's active goals + live standing, same shape PlayersGridView
   *  reads. Defaults to []. */
  playerGoals?: FairwayGoalCardData[];
  /** This player's roster-row stats (recent_trend, avg_score) for the
   *  "recent trend" chip. `null`/omitted when there's no player scope. */
  playerStats?: PlayersGridStats | null;
}

function DossierSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-2 rounded-fw-md border border-border-subtle bg-surface-sunken p-4">
      <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-text-tertiary">{title}</p>
      {children}
    </div>
  );
}

const FOCUS_STATUS_TONE: Record<string, 'accent' | 'success' | 'warning' | 'neutral'> = {
  active: 'accent',
  in_progress: 'accent',
  proposed: 'warning',
  completed: 'success',
  declined: 'neutral',
};

export function SignalDossier({
  entry,
  coachId,
  pending,
  onReview,
  onDismiss,
  onPromoted,
  onBack,
  onSelectSignal,
  playerFocusAreas = [],
  playerGoals = [],
  playerStats = null,
}: SignalDossierProps) {
  if (!entry) {
    return (
      <div className="flex items-center justify-center rounded-fw-lg border border-border-subtle bg-surface p-6 min-[940px]:h-full">
        <EmptyState
          variant="subtle"
          title="Select a signal"
          description="Pick a row from the queue to see the full evidence and act on it."
        />
      </div>
    );
  }

  const { signal, group } = entry;
  const otherSignals = group.signals.filter((s) => s.id !== signal.id);
  const activeFocusAreas = playerFocusAreas.filter(
    (fa) => fa.status === 'active' || fa.status === 'in_progress',
  );

  return (
    <div className="flex flex-col gap-4 rounded-fw-lg border border-border-subtle bg-surface p-5 sm:p-6 min-[940px]:h-full min-[940px]:overflow-y-auto">
      <PressTarget
        onClick={onBack}
        className="inline-flex w-fit items-center gap-1.5 rounded-full border border-accent-200 bg-accent-50 px-3 py-1.5 text-caption font-bold text-accent-700 transition-colors [transition-duration:150ms] hover:bg-accent-100 min-[940px]:hidden"
      >
        <ArrowLeft className="h-3.5 w-3.5" aria-hidden="true" />
        Back to queue
      </PressTarget>

      <div className="flex flex-wrap items-center gap-2">
        <SeverityChip severity={signal.severity} />
        <Badge tone="neutral" size="sm">
          {formatCategoryLabel(signal.category)}
        </Badge>
        {group.playerId ? (
          <Badge tone="accent" size="sm">
            {group.playerName}
          </Badge>
        ) : null}
        {/*
          The age was REMOVED, deliberately, rather than corrected.

          It read `formatAgeDays(signal.ageDays)`, and `ageDays` is derived from
          `golf_coach_insights.created_at` — the row's INSERT date. Insights
          upsert by `signature`, so `created_at` never moves: 68% of live rows
          are June-born and a row whose content was recomputed this morning
          rendered as "55d ago". It was a confident, precise, wrong number on
          the surface a coach uses to decide what to act on.

          It cannot simply be re-pointed at `updated_at` either: a DB trigger
          bumps that column on ANY write, including the dismissals and
          acknowledgements in insight-management.ts, so an insight would appear
          freshest immediately after a coach dismissed it.

          Neither column carries content freshness, so nothing here can tell the
          truth yet. Showing nothing is the honest state until an explicit
          `content_generated_at` exists; then this is where the line goes, worded
          "computed {n}d ago" to match the chat surface's existing idiom.
        */}
      </div>

      <h3 className="font-fw-display text-h3 font-semibold text-text-primary">{signal.title}</h3>

      <div className="flex flex-col gap-2 rounded-fw-md border border-border-subtle bg-surface-sunken p-4">
        <p className="font-fw-display text-eyebrow uppercase tracking-[0.13em] text-text-tertiary">Evidence</p>
        <p className="font-fw-sans text-body-sm text-text-secondary">
          {/* Retold in the third person — the coach is the reader, the
              player is the subject (audit M12). */}
          {signal.claim ? toCoachVoice(signal.claim, group.playerName) : 'No further detail recorded.'}
        </p>
        {/*
          The section was called "Evidence" and contained only prose. Every
          other insight surface renders the sample size, observation window and
          benchmark from the `evidence` JSON; the Triage Desk — the one surface
          a coach uses to DECIDE — showed none of it. A coach who cannot see
          that "47%" came from 43 attempts over 18 rounds cannot judge the
          claim, and had no way to ask.

          Reused rather than rebuilt, so this inherits the panel's existing
          "too few to read reliably" handling. Renders nothing for patterns and
          for pre-evidence v2 rows, which is why it needs no guard here.
        */}
        <EvidencePanel evidence={signal.evidence as InsightEvidence | null} compact />
        <div className="mt-1 flex flex-wrap gap-x-5 gap-y-1 font-fw-mono text-caption tabular-nums text-text-tertiary">
          <span>
            Status <span className="text-text-secondary">{signal.status}</span>
          </span>
          {signal.supersededCount > 0 ? (
            <span>
              Occurrences <span className="text-text-secondary">{signal.supersededCount + 1}</span>
            </span>
          ) : null}
        </div>
      </div>

      {signal.strokeImpact !== null ? (
        <p className="font-fw-mono text-body-lg font-semibold tabular-nums text-text-primary">
          {signal.strokeImpact > 0 ? '+' : ''}
          {signal.strokeImpact.toFixed(2)} strokes
        </p>
      ) : null}

      <div className="flex flex-wrap gap-2 pt-1">
        {/* A roster roll-up has no row to acknowledge. Its id is a synthetic
            `team:<metric>`, so the server actions cannot act on it — and there
            is nothing coherent for them to mean, since dismissing the summary
            would not touch any of the leaks it summarizes (each of which has
            its own card below). Rendering disabled-looking buttons that
            silently no-op is worse than not rendering them. */}
        {signal.kind !== 'team_synthesis' ? (
          <>
            <Button variant="secondary" size="sm" busy={pending} disabled={pending} onClick={() => onReview(signal)}>
              Mark reviewed
            </Button>
            <Button variant="ghost" size="sm" busy={pending} disabled={pending} onClick={() => onDismiss(signal)}>
              Dismiss
            </Button>
          </>
        ) : null}
        <PromoteToFocusAreaButton
          signal={signal}
          coachId={coachId}
          onPromoted={() => onPromoted(signal)}
          playerName={group.playerName}
          playerStats={playerStats}
        />
        {group.playerId ? (
          <Button variant="ghost" size="sm" asChild>
            <Link href={`/golf/dashboard/stats?player=${group.playerId}`}>View stats</Link>
          </Button>
        ) : null}
      </div>

      {/* Related context — fills the height the action row used to leave
          blank instead of a real signal-to-player narrative. */}
      {group.playerId ? (
        <div className="flex flex-col gap-3 border-t border-border-subtle pt-4">
          <DossierSection title="Recent trend">
            {playerStats?.recent_trend ? (
              <div className="flex items-center gap-2">
                <TrendGlyph direction={playerStats.recent_trend} />
                {playerStats.avg_score != null ? (
                  <span className="font-fw-mono text-caption tabular-nums text-text-tertiary">
                    {formatScoringAverage(playerStats.avg_score)} avg score
                  </span>
                ) : null}
              </div>
            ) : (
              <p className="font-fw-sans text-body-sm text-text-tertiary">
                Not enough recent rounds for a trend yet.
              </p>
            )}
          </DossierSection>

          <DossierSection title={`Other open signals for ${group.playerName}`}>
            {otherSignals.length === 0 ? (
              <p className="font-fw-sans text-body-sm text-text-tertiary">No other open signals for this player.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {otherSignals.map((s) => (
                  <li key={s.id}>
                    <PressTarget
                      onClick={() => onSelectSignal?.(s.id)}
                      className="flex w-full items-center gap-2 rounded-fw-sm px-2 py-1.5 text-left hover:bg-surface"
                    >
                      <SeverityChip severity={s.severity} />
                      <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-secondary">
                        {s.title}
                      </span>
                    </PressTarget>
                  </li>
                ))}
              </ul>
            )}
          </DossierSection>

          <DossierSection title="Focus areas">
            {activeFocusAreas.length === 0 ? (
              <p className="font-fw-sans text-body-sm text-text-tertiary">No active focus areas yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {activeFocusAreas.slice(0, 3).map((fa) => (
                  <li key={fa.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-secondary">
                      {fa.title || formatCategoryLabel(fa.area_type)}
                    </span>
                    <StatusPill tone={FOCUS_STATUS_TONE[fa.status ?? ''] ?? 'neutral'} size="sm">
                      {fa.status ?? 'active'}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </DossierSection>

          <DossierSection title="Active goals">
            {playerGoals.length === 0 ? (
              <p className="font-fw-sans text-body-sm text-text-tertiary">No active goals yet.</p>
            ) : (
              <ul className="flex flex-col gap-1.5">
                {playerGoals.slice(0, 3).map(({ goal }) => (
                  <li key={goal.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-secondary">
                      {goal.title}
                    </span>
                    <StatusPill tone={goal.state === 'active' ? 'accent' : 'neutral'} size="sm">
                      {goal.state}
                    </StatusPill>
                  </li>
                ))}
              </ul>
            )}
          </DossierSection>
        </div>
      ) : null}
    </div>
  );
}

'use client';

/**
 * ============================================================================
 * SignalDossier — The Lab's detail pane
 * ----------------------------------------------------------------------------
 * One signal, read top to bottom the way a coach decides on it:
 *
 *   1. Whose it is (portrait, name, severity) on the deep-green card plinth.
 *   2. The claim, retold in the third person, and its title.
 *   3. The numbers it rests on: the estimated stroke impact (framed as an
 *      estimate), then the shared evidence block (sample, window, benchmark).
 *      A roster roll-up shows the per-player leaks it was summed from instead,
 *      each one a way into that player's own signal.
 *   4. A working action row: Prescribe, Mark reviewed, Dismiss, View stats.
 *   5. Related context for the player: recent trend, focus areas, goals and
 *      their other open signals, each with an honest line when empty.
 *
 * Every action is wired to `reviewSignal`/`dismissSignal`/
 * `createFocusAreaFromInsight` with the optimistic update owned by
 * `TriageDesk`; this component only renders state and fires callbacks.
 *
 * Layout: on the desktop split (`min-[940px]:`) the Lab's grid gives this
 * pane a fixed height; the root fills it (`h-full`) and scrolls its OWN
 * content (`overflow-y-auto`) so the queue beside it keeps its place. Below
 * the breakpoint the Lab shows one pane at a time and the root takes its
 * natural height, with a Back control in the header.
 *
 * The "undefined putts · undefined days" / "undefined You · undefined" bug
 * (screenshot 26): a roster roll-up's evidence is only { metric, metric_label,
 * strokes_impact, players_affected }, and it was handed to `EvidencePanel`
 * as if it were a full insight blob. A roll-up now renders its own block from
 * the fields it really has, and `EvidencePanel` gates every fact on its field.
 * ========================================================================== */

import { useId, type ReactNode } from 'react';
import Link from 'next/link';
import { ArrowLeft, Users } from 'lucide-react';
import { Avatar, Button, EmptyState, PressTarget, StatusPill, TrendGlyph } from '@/components/fairway';
import type { PlayersGridFocusArea, PlayersGridStats } from '@/components/fairway';
import type { FairwayGoalCardData } from '@/components/fairway/pages/coachhelm/FairwayGoalCard';
import type { GroupedSignal, SignalGroup } from '@/lib/coachhelm/signal-grouping';
import { EvidencePanel, evidenceHasFacts } from '@/components/golf/coachhelm/insights/EvidencePanel';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';
import { cn } from '@/lib/utils';
import { formatCategoryLabel } from './buildTriageViewModel';
import { SeverityChip } from './SignalRow';
import { PromoteToFocusAreaButton } from './PromoteToFocusAreaButton';
import { toCoachVoice } from '@/lib/golf/claim-voice';
import { formatScoringAverage } from '@/lib/golf/format-scoring-average';

export interface SignalDossierEntry {
  signal: GroupedSignal;
  group: SignalGroup;
}

/** One per-player leak a roster roll-up was summed from. */
export interface RollupContributor {
  signalId: string;
  playerId: string;
  playerName: string;
  avatarUrl: string | null;
  /** |strokes_impact| of that player's own signal, per round. */
  strokeImpact: number;
}

export interface SignalDossierProps {
  entry: SignalDossierEntry | null;
  coachId: string;
  pending: boolean;
  onReview: (signal: GroupedSignal) => void;
  onDismiss: (signal: GroupedSignal) => void;
  onPromoted: (signal: GroupedSignal) => void;
  onBack: () => void;
  /** Fires when the coach picks one of the "other open signals" rows or a
   *  roll-up contributor — same signal-id contract `TriageDesk.navigate({
   *  signal: id })` uses for the queue. Omitted, the rows still render. */
  onSelectSignal?: (id: string) => void;
  /** This player's focus areas, filtered by the caller to the player. */
  playerFocusAreas?: PlayersGridFocusArea[];
  /** This player's active goals + live standing. */
  playerGoals?: FairwayGoalCardData[];
  /** This player's roster-row stats (recent_trend, avg_score). */
  playerStats?: PlayersGridStats | null;
  /** The player's portrait for the header; null falls back to initials. */
  playerAvatarUrl?: string | null;
  /** Roster roll-ups only: the per-player signals the total was summed from,
   *  largest first. Resolved by the caller from the groups it holds. */
  rollupContributors?: RollupContributor[];
}

const FOCUS_STATUS_TONE: Record<string, 'accent' | 'success' | 'warning' | 'neutral'> = {
  active: 'accent',
  in_progress: 'accent',
  proposed: 'warning',
  completed: 'success',
  declined: 'neutral',
};

const TWO_DECIMALS = new Intl.NumberFormat('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

function sentenceCase(value: string): string {
  const spaced = value.replace(/_/g, ' ').trim();
  return spaced ? spaced.charAt(0).toUpperCase() + spaced.slice(1) : spaced;
}

function RelatedBlock({ title, children, className }: { title: string; children: ReactNode; className?: string }) {
  return (
    <section className={cn('flex min-w-0 flex-col gap-2', className)}>
      <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">{title}</h4>
      {children}
    </section>
  );
}

function QuietLine({ children }: { children: ReactNode }) {
  return <p className="font-fw-sans text-body-sm text-text-tertiary">{children}</p>;
}

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
  playerAvatarUrl = null,
  rollupContributors = [],
}: SignalDossierProps) {
  const titleId = useId();

  if (!entry) {
    return (
      <div className="flex items-center justify-center rounded-fw-lg border border-border-subtle bg-surface p-6 shadow-soft min-[940px]:h-full">
        <EmptyState
          variant="subtle"
          title="Select a signal"
          description="Pick a row from the queue to see the full evidence and act on it."
        />
      </div>
    );
  }

  const { signal, group } = entry;
  const isRollup = signal.kind === 'team_synthesis';
  const otherSignals = group.signals.filter((s) => s.id !== signal.id);
  const activeFocusAreas = playerFocusAreas.filter(
    (fa) => fa.status === 'active' || fa.status === 'in_progress',
  );
  const evidence = isRollup ? null : ((signal.evidence ?? null) as InsightEvidence | null);
  const showEvidence = evidenceHasFacts(evidence, { omitImpact: true });
  const impact = signal.strokeImpact === null ? null : Math.abs(signal.strokeImpact);
  const rollupMetricLabel = isRollup ? readMetricLabel(signal) : null;
  // The synthesis always writes `players_affected`; a count read off a
  // contributor list we could not resolve would be a fabricated zero.
  const rollupPlayers = isRollup
    ? (readPlayersAffected(signal) ?? (rollupContributors.length > 0 ? rollupContributors.length : null))
    : null;

  const stats: Array<{ key: string; label: string; value: ReactNode; wide?: boolean }> = [];
  if (impact !== null) {
    stats.push({
      key: 'impact',
      label: isRollup ? 'Combined impact' : 'Est. impact',
      value: (
        <>
          {TWO_DECIMALS.format(impact)} est. strokes
          <span className="font-normal text-text-secondary"> per round</span>
        </>
      ),
      wide: true,
    });
  }
  if (isRollup) {
    if (rollupPlayers !== null) stats.push({ key: 'players', label: 'Players', value: rollupPlayers });
  } else {
    stats.push({ key: 'status', label: 'Status', value: sentenceCase(signal.status) });
  }
  stats.push(
    signal.supersededCount > 0
      ? { key: 'occurrences', label: 'Occurrences', value: signal.supersededCount + 1 }
      : {
          key: 'area',
          label: 'Area',
          value: isRollup && rollupMetricLabel ? rollupMetricLabel : formatCategoryLabel(signal.category),
        },
  );

  const headerMeta = isRollup
    ? [rollupPlayers !== null ? `${rollupPlayers} player${rollupPlayers === 1 ? '' : 's'}` : null, rollupMetricLabel]
        .filter(Boolean)
        .join(' · ') || 'Roster total'
    : [
        formatCategoryLabel(signal.category),
        signal.kind === 'pattern' ? 'Pattern' : null,
        otherSignals.length > 0
          ? `${otherSignals.length} other open signal${otherSignals.length === 1 ? '' : 's'}`
          : null,
      ]
        .filter(Boolean)
        .join(' · ');

  return (
    <article
      aria-labelledby={titleId}
      className="flex flex-col overflow-hidden rounded-fw-lg border border-border-subtle bg-surface shadow-soft min-[940px]:h-full min-[940px]:overflow-y-auto"
    >
      {/* ── Whose signal this is, on the deep-green plinth every CoachHelm
            card header uses. `fw-plinth-green` rescopes the ink tokens, so
            the name and meta read cream on green. ── */}
      <header className="fw-plinth-green flex items-center gap-3 px-3 py-3 sm:px-4 min-[940px]:sticky min-[940px]:top-0 min-[940px]:z-10">
        <PressTarget
          onClick={onBack}
          aria-label="Back to queue"
          className="-my-1 inline-flex min-h-[44px] min-w-[44px] shrink-0 items-center justify-center gap-1 rounded-full px-2 font-fw-sans text-body-sm font-medium text-text-primary hover:bg-surface-sunken min-[940px]:hidden"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          <span className="sr-only sm:not-sr-only">Queue</span>
        </PressTarget>
        {isRollup || !group.playerId ? (
          <span
            aria-hidden="true"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border-subtle bg-surface-sunken text-text-primary"
          >
            <Users className="h-[18px] w-[18px]" />
          </span>
        ) : (
          <Avatar src={playerAvatarUrl} name={group.playerName} size="md" decorative />
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate font-fw-sans text-body font-semibold text-text-primary">
            {isRollup ? 'Team roll-up' : group.playerId ? group.playerName : 'Team'}
          </p>
          <p className="truncate font-fw-sans text-caption text-text-secondary">{headerMeta}</p>
        </div>
        <span className="shrink-0">
          <SeverityChip severity={signal.severity} />
        </span>
        {/*
          No age here, deliberately. `ageDays` is `golf_coach_insights.created_at`
          (the insert batch, frozen by upsert-by-signature), so it printed
          "55d ago" for content recomputed that morning, and `updated_at` moves
          on every dismissal. Nothing carries content freshness yet; the line
          returns with `content_generated_at`, worded "computed {n}d ago".
        */}
      </header>

      <div className="flex flex-col gap-6 p-4 sm:p-6">
        <div className="flex flex-col gap-2">
          <h3 id={titleId} className="font-fw-display text-h3 font-semibold text-text-primary [text-wrap:balance]">
            {signal.title}
          </h3>
          {/* Retold in the third person: the coach is the reader, the player
              is the subject (audit M12). */}
          <p className="max-w-prose font-fw-sans text-body-sm text-text-secondary [text-wrap:pretty]">
            {signal.claim ? toCoachVoice(signal.claim, group.playerName) : 'No further detail recorded.'}
          </p>
        </div>

        {/* ── The numbers. The impact is a generation-time ESTIMATE (the same
              field the pressure map sums as "est. strokes"), so it says so. ── */}
        {/* A hairline-divided strip: the 1px gap shows the border colour
            between cells, and every row's cells grow to fill it, so no
            breakpoint leaves an empty slot. */}
        <dl className="flex flex-wrap gap-px overflow-hidden rounded-fw-md border border-border-subtle bg-border-subtle">
          {stats.map((stat) => (
            <div
              key={stat.key}
              className={cn(
                'flex min-w-0 grow flex-col gap-0.5 bg-surface-sunken px-4 py-3',
                stat.wide ? 'basis-full sm:basis-[15rem]' : 'basis-[8rem]',
              )}
            >
              <dt className="font-fw-sans text-caption text-text-tertiary">{stat.label}</dt>
              <dd className="truncate font-fw-sans text-body font-semibold tabular-nums text-text-primary">{stat.value}</dd>
            </div>
          ))}
        </dl>

        {isRollup ? (
          <RollupBreakdown
            contributors={rollupContributors}
            total={impact}
            playersAffected={rollupPlayers}
            onSelectSignal={onSelectSignal}
          />
        ) : showEvidence ? (
          <section className="flex flex-col gap-1">
            <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Evidence</h4>
            {/* Shared with every insight surface: sample, window and benchmark
                from the `evidence` JSON, with its own "too few to read"
                handling. The impact fact is headlined above, so it is left
                out here rather than printed twice. */}
            <EvidencePanel evidence={evidence} compact omitImpact />
          </section>
        ) : null}

        <div className="flex flex-wrap items-center gap-2">
          {/* A roster roll-up has no row to acknowledge: its id is a synthetic
              `team:<metric>`, and dismissing the summary would not touch any
              of the leaks it summarizes (each has its own signal). Buttons
              that silently no-op are worse than none. */}
          <PromoteToFocusAreaButton
            signal={signal}
            coachId={coachId}
            onPromoted={() => onPromoted(signal)}
            playerName={group.playerName}
            playerStats={playerStats}
          />
          {!isRollup ? (
            <>
              <Button variant="secondary" size="sm" busy={pending} disabled={pending} onClick={() => onReview(signal)}>
                Mark reviewed
              </Button>
              <Button variant="ghost" size="sm" busy={pending} disabled={pending} onClick={() => onDismiss(signal)}>
                Dismiss
              </Button>
            </>
          ) : null}
          {group.playerId ? (
            <Button variant="ghost" size="sm" asChild>
              <Link href={`/golf/dashboard/stats?player=${group.playerId}`}>View stats</Link>
            </Button>
          ) : null}
        </div>

        {/* ── Related context: what else is true about this player, so the
              decision above is not made in isolation. ── */}
        {group.playerId && !isRollup ? (
          <div className="grid grid-cols-1 gap-x-8 gap-y-6 border-t border-border-subtle pt-5 sm:grid-cols-2">
            <RelatedBlock title="Recent trend">
              {playerStats?.recent_trend ? (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <TrendGlyph direction={playerStats.recent_trend} className="text-body-sm" />
                  {playerStats.avg_score != null ? (
                    <span className="font-fw-sans text-caption tabular-nums text-text-tertiary">
                      {formatScoringAverage(playerStats.avg_score)} avg score
                    </span>
                  ) : null}
                </div>
              ) : (
                <QuietLine>Not enough recent rounds for a trend yet.</QuietLine>
              )}
            </RelatedBlock>

            <RelatedBlock title="Focus areas">
              {activeFocusAreas.length === 0 ? (
                <QuietLine>No active focus areas yet.</QuietLine>
              ) : (
                <ul className="flex flex-col gap-2">
                  {activeFocusAreas.slice(0, 3).map((fa) => (
                    <li key={fa.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-secondary">
                        {fa.title || formatCategoryLabel(fa.area_type)}
                      </span>
                      <StatusPill tone={FOCUS_STATUS_TONE[fa.status ?? ''] ?? 'neutral'} size="sm">
                        {sentenceCase(fa.status ?? 'active')}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </RelatedBlock>

            <RelatedBlock title="Active goals">
              {playerGoals.length === 0 ? (
                <QuietLine>No active goals yet.</QuietLine>
              ) : (
                <ul className="flex flex-col gap-2">
                  {playerGoals.slice(0, 3).map(({ goal }) => (
                    <li key={goal.id} className="flex items-center justify-between gap-3">
                      <span className="min-w-0 flex-1 truncate font-fw-sans text-body-sm text-text-secondary">
                        {goal.title}
                      </span>
                      <StatusPill tone={goal.state === 'active' ? 'accent' : 'neutral'} size="sm">
                        {sentenceCase(goal.state)}
                      </StatusPill>
                    </li>
                  ))}
                </ul>
              )}
            </RelatedBlock>

            <RelatedBlock title={`Other open signals for ${group.playerName}`} className="sm:col-span-2">
              {otherSignals.length === 0 ? (
                <QuietLine>No other open signals for this player.</QuietLine>
              ) : (
                <ul className="-mx-2 flex flex-col">
                  {otherSignals.map((s) => (
                    <li key={s.id}>
                      <PressTarget
                        onClick={() => onSelectSignal?.(s.id)}
                        className="flex min-h-[44px] w-full items-center gap-3 rounded-fw-sm px-2 py-2 text-left hover:bg-surface-sunken"
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
            </RelatedBlock>
          </div>
        ) : null}
      </div>
    </article>
  );
}

/**
 * A roster roll-up's own evidence: the per-player leaks it was summed from,
 * largest first, each a way into that player's signal. The bar is each
 * player's share of the combined total, so the rows add up to the headline.
 */
function RollupBreakdown({
  contributors,
  total,
  playersAffected,
  onSelectSignal,
}: {
  contributors: readonly RollupContributor[];
  total: number | null;
  playersAffected: number | null;
  onSelectSignal?: (id: string) => void;
}) {
  const sum = contributors.reduce((acc, c) => acc + c.strokeImpact, 0);
  const denominator = total && total > 0 ? total : sum;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-3">
        <h4 className="font-fw-sans text-body-sm font-semibold text-text-primary">Where it comes from</h4>
        {contributors.length > 0 ? (
          <p className="font-fw-sans text-caption text-text-tertiary">Est. strokes per round</p>
        ) : null}
      </div>
      {contributors.length === 0 ? (
        <QuietLine>
          {playersAffected !== null && playersAffected > 0
            ? `${playersAffected} players carry this leak. Each has their own signal in the queue.`
            : 'Each player carrying this leak has their own signal in the queue.'}
        </QuietLine>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {contributors.map((c) => {
            const share = denominator > 0 ? Math.min(1, c.strokeImpact / denominator) : 0;
            return (
              <li key={c.signalId}>
                <PressTarget
                  onClick={() => onSelectSignal?.(c.signalId)}
                  aria-label={`${c.playerName}, ${TWO_DECIMALS.format(c.strokeImpact)} estimated strokes per round. Open their signal.`}
                  className="grid min-h-[52px] w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 rounded-fw-sm px-2 py-2 text-left hover:bg-surface-sunken"
                >
                  <Avatar name={c.playerName} src={c.avatarUrl} size="sm" decorative />
                  <span className="flex min-w-0 flex-col gap-1.5">
                    <span className="truncate font-fw-sans text-body-sm font-medium text-text-primary">{c.playerName}</span>
                    <span aria-hidden="true" className="block h-1.5 overflow-hidden rounded-full bg-surface-sunken">
                      <span
                        className="block h-full rounded-full bg-fw-warning"
                        style={{ width: `${Math.max(4, Math.round(share * 100))}%` }}
                      />
                    </span>
                  </span>
                  <span className="font-fw-sans text-body-sm font-semibold tabular-nums text-text-primary">
                    {TWO_DECIMALS.format(c.strokeImpact)}
                  </span>
                </PressTarget>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

function readMetricLabel(signal: GroupedSignal): string | null {
  const ev = signal.evidence;
  if (!ev || typeof ev !== 'object') return null;
  const label = (ev as Record<string, unknown>).metric_label;
  return typeof label === 'string' && label.trim() ? label : null;
}

function readPlayersAffected(signal: GroupedSignal): number | null {
  const ev = signal.evidence;
  if (!ev || typeof ev !== 'object') return null;
  const n = (ev as Record<string, unknown>).players_affected;
  return typeof n === 'number' && Number.isFinite(n) ? n : null;
}

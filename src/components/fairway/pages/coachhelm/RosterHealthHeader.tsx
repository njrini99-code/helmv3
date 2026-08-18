'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · RosterHealthHeader — the "Who needs your attention"
 * roster-health instrument.
 * ----------------------------------------------------------------------------
 * Extracted from `PlayersGridView.tsx` (Wave 2) so the SAME triage instrument
 * — coverage, outcome mix, micro-readouts, ranked "who needs a look" list —
 * can lead BOTH the Players sub-tab (`/dashboard/intelligence?view=players`)
 * AND the canonical Roster page (`/dashboard/roster`), instead of the richer
 * instrument sitting orphaned on a hidden route while the visible Roster page
 * showed only one stat per player. Pure computation + presentation, no data
 * fetching — every caller feeds it props derived from data it already has.
 *
 *   PRIMARY (focal) — a ranked "who needs a look" list (declining, or with
 *     rounds but no active focus area), never just an abstract percentage.
 *   SECONDARY rail — the OUTCOME MIX SegmentBar (improved / no change /
 *     worsened from recorded focus-area outcomes — the closed-loop payoff).
 *   TERTIARY foot row — micro Readouts: players on roster, active focus
 *     areas, completed focus areas, players with recent rounds.
 *
 * Honest: a starved instrument dims to "awaiting", never a fabricated 0.
 * ========================================================================== */

import { InstrumentPanel } from '@/components/fairway/instrument/InstrumentPanel';
import { InstrumentCluster } from '@/components/fairway/instrument/InstrumentCluster';
import { Readout } from '@/components/fairway/instrument/Readout';
import { SegmentBar, type SegmentBarPart } from '@/components/fairway/charts/SegmentBar';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { Button } from '@/components/fairway/controls/button';
import { formatScoringAverage } from '@/lib/golf/format-scoring-average';
import type { PlayersGridPlayer, PlayersGridFocusArea, PlayersGridStats, RosterRow } from './PlayersGridView';

/** "Who needs your attention" shows only the top N by priority — the big
 *  number stays the HONEST total (`needs.length`), but the list itself was
 *  silently truncated with no indication it was a "top 5", making the
 *  header count and the visible list disagree (observed live: "7 players to
 *  look at" heading a list of 5). Named so the cap and its caption below
 *  can't drift apart. */
export const NEEDS_ATTENTION_LIST_CAP = 5;

function playerName(p?: PlayersGridPlayer | null): string {
  if (!p) return 'Player';
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

export interface RosterHealth {
  totalPlayers: number;
  playersWithActive: number;
  coverage: number;
  activeAreas: number;
  completedAreas: number;
  playersWithRounds: number;
  outcomeTally: { improved: number; noChange: number; worsened: number };
  totalOutcomes: number;
}

/** A roster row flagged for coach triage, with a ranked priority + plain reason. */
export interface NeedRow {
  row: RosterRow;
  priority: number;
  reason: string;
}

/**
 * Derive the roster-health metrics (coverage, active/completed focus-area
 * counts, outcome mix) from props a caller already has — players, their
 * focus areas, and a rounds_played-bearing stats record. No new fetch.
 */
export function computeRosterHealth(
  players: PlayersGridPlayer[],
  focusAreas: PlayersGridFocusArea[],
  playerStats: Record<string, PlayersGridStats>,
): RosterHealth {
  const totalPlayers = players.length;

  // Players carrying at least one active/in-progress focus area → coverage.
  const playersWithActive = new Set(
    focusAreas
      .filter((fa) => fa.status === 'active' || fa.status === 'in_progress')
      .map((fa) => fa.player_id),
  ).size;

  const activeAreas = focusAreas.filter(
    (fa) => fa.status === 'active' || fa.status === 'in_progress',
  ).length;
  const completedAreas = focusAreas.filter((fa) => fa.status === 'completed').length;

  // Players with at least one recorded round (props-fed stats; no recompute).
  const playersWithRounds = players.filter(
    (p) => (playerStats[p.id]?.rounds_played ?? 0) > 0,
  ).length;

  // Recorded focus-area outcomes → the closed-loop payoff (verbatim verdicts).
  const outcomeTally = focusAreas.reduce(
    (acc, fa) => {
      switch (fa.outcome_status) {
        case 'improved':
          acc.improved += 1;
          break;
        case 'no_change':
          acc.noChange += 1;
          break;
        case 'worsened':
          acc.worsened += 1;
          break;
        default:
          break;
      }
      return acc;
    },
    { improved: 0, noChange: 0, worsened: 0 },
  );

  return {
    totalPlayers,
    playersWithActive,
    coverage: totalPlayers > 0 ? playersWithActive / totalPlayers : 0,
    activeAreas,
    completedAreas,
    playersWithRounds,
    outcomeTally,
    totalOutcomes: outcomeTally.improved + outcomeTally.noChange + outcomeTally.worsened,
  };
}

/**
 * Coach triage: who needs a look, ranked. Declining (esp. uncoached) first,
 * then players with rounds but no active focus area. Real `recent_trend` +
 * `activeCount` from the SAME rosterRows a caller already built — no fetch.
 */
export function computeNeedsAttention(rosterRows: RosterRow[]): NeedRow[] {
  return rosterRows
    .map((row): NeedRow => {
      const trend = row.stats?.recent_trend ?? null;
      const rounds = row.stats?.rounds_played ?? 0;
      const uncoached = row.activeCount === 0;
      if (trend === 'declining' && uncoached)
        return { row, priority: 3, reason: 'Trending down · no focus area' };
      if (trend === 'declining') return { row, priority: 2, reason: 'Trending down' };
      if (rounds > 0 && uncoached) return { row, priority: 1, reason: 'No focus area yet' };
      return { row, priority: 0, reason: '' };
    })
    .filter((n) => n.priority > 0)
    .sort(
      (a, b) =>
        b.priority - a.priority ||
        (b.row.stats?.avg_score ?? 0) - (a.row.stats?.avg_score ?? 0),
    );
}

/* ---------------------------------------------------------------------------
 * RosterHealthHeader — the hero instrument cluster (ranked focal → secondary →
 * tertiary). Reads from precomputed props ONLY (no fetch). Honest: a starved
 * figure dims to "awaiting", never a fabricated 0.
 * ------------------------------------------------------------------------- */

export function RosterHealthHeader({
  health,
  needs,
  onAdd,
}: {
  health: RosterHealth;
  needs: NeedRow[];
  /** "Add focus area" affordance for a needs-attention row. Callers that own
   *  a create-modal pass a playerId-preselecting opener; callers without one
   *  (e.g. the Roster page) can navigate to the Players/Focus-areas drill
   *  instead — both are a valid "add a focus area for this player" action. */
  onAdd: (playerId?: string) => void;
}) {
  const {
    totalPlayers,
    playersWithActive,
    activeAreas,
    completedAreas,
    playersWithRounds,
    outcomeTally,
    totalOutcomes,
  } = health;

  /** A roster with zero focus areas — active OR completed — is a program that
   *  hasn't started, not one that has fallen behind. Every player with rounds
   *  matches `rounds > 0 && uncoached`, so the triage framing greets a brand-new
   *  coach by calling their whole squad problems. Measured in production
   *  2026-08-18: EVERY non-demo team has zero rows in `golf_player_focus_areas`
   *  — Hampden-Sydney 15 players, Guilford 12, Shenandoah 12, Lynchburg 10, UNC
   *  Wilmington 10, Shenandoah Women's 6, Denison 1 — so all 66 real players
   *  were being flagged. Only the two demo teams have any areas at all (11, 14).
   *  The ranked list is still the useful part and stays; only the framing
   *  changes, from a backlog to a starting point. */
  const areasPrescribed = activeAreas + completedAreas;
  const noAreasYet = areasPrescribed === 0;

  // FOCAL — coach triage: WHO needs a look (trending down or uncoached), ranked.
  // The program-coverage stat is demoted to a subtext line; the eye lands on the
  // players, not an abstract percentage. Honest: dims to "awaiting" with no roster.
  const coveredText =
    totalPlayers > 0
      ? `${playersWithActive} of ${totalPlayers} player${totalPlayers === 1 ? '' : 's'} have an active focus area`
      : 'No players on the roster yet';
  const primary = (
    <InstrumentPanel
      depth="raised"
      padding="lg"
      header="Who needs your attention"
      as="section"
      className="flex flex-col gap-4"
    >
      {needs.length > 0 ? (
        <>
          <div className="flex flex-wrap items-end gap-x-3 gap-y-1">
            <span className="font-fw-mono text-stat-lg font-semibold leading-none tabular-nums text-text-primary">
              {needs.length}
            </span>
            <span className="mb-2 font-fw-sans text-body-sm text-text-secondary">
              {noAreasYet
                ? `player${needs.length === 1 ? '' : 's'} ready for a focus area — none set on this roster yet.`
                : `player${needs.length === 1 ? '' : 's'} to look at — trending down or without a focus area.`}
            </span>
          </div>
          <ul className="flex flex-col">
            {needs.slice(0, NEEDS_ATTENTION_LIST_CAP).map(({ row, reason }) => (
              <li
                key={row.player.id}
                className="border-t border-border-subtle py-2.5 first:border-t-0"
              >
                {/* Shared identity; the warning reason is this surface's meta and
                    the avg stat + "Add focus area" are its trailing affordances. */}
                <PlayerIdentity
                  name={playerName(row.player)}
                  avatarUrl={row.player.avatar_url}
                  size="sm"
                  meta={
                    <span className="font-fw-sans text-caption font-medium text-fw-warning-ink">
                      {reason}
                    </span>
                  }
                  trailing={
                    <div className="flex items-center gap-1.5">
                      {row.stats?.avg_score != null ? (
                        <span className="hidden font-fw-mono text-caption tabular-nums text-text-tertiary sm:inline">
                          {formatScoringAverage(row.stats.avg_score)} avg
                        </span>
                      ) : null}
                      <Button variant="ghost" size="sm" onClick={() => onAdd(row.player.id)}>
                        Add focus area
                      </Button>
                    </div>
                  }
                />
              </li>
            ))}
          </ul>
          {needs.length > NEEDS_ATTENTION_LIST_CAP ? (
            <span className="font-fw-sans text-caption text-text-tertiary">
              +{needs.length - NEEDS_ATTENTION_LIST_CAP} more player
              {needs.length - NEEDS_ATTENTION_LIST_CAP === 1 ? '' : 's'} need a look — showing the top{' '}
              {NEEDS_ATTENTION_LIST_CAP} by priority.
            </span>
          ) : null}
          <span className="font-fw-sans text-caption text-text-tertiary">{coveredText}.</span>
        </>
      ) : (
        <div className="flex flex-col gap-2">
          <span className="font-fw-mono text-stat-lg font-semibold leading-none tabular-nums text-text-primary">
            {/* An em-dash, not a "0", when there is nothing to evaluate. Zero
                reads as a measured result; this is the absence of measurement. */}
            {totalPlayers > 0 && playersWithRounds > 0 ? '0' : '—'}
          </span>
          <span className="font-fw-sans text-body-sm text-text-secondary">
            {totalPlayers === 0
              ? 'Awaiting roster — add players to start tracking who needs attention.'
              : playersWithRounds === 0
                ? // A roster with no rounds is not a covered roster. This branch
                  // used to fall through to the all-clear below, which is
                  // VACUOUSLY true — "everyone with rounds" is nobody — and reads
                  // to a coach as an assurance that their squad has been assessed.
                  // Shenandoah has 9 and 6 players and zero rounds between them,
                  // so the all-clear is the first thing both new coaches saw.
                  'Nothing to assess yet — attention flags appear once players start logging rounds.'
                : 'Roster’s covered — everyone with rounds has a focus area and no one’s trending down.'}
          </span>
          <span className="font-fw-sans text-caption text-text-tertiary">{coveredText}.</span>
        </div>
      )}
    </InstrumentPanel>
  );

  // SECONDARY — the closed-loop outcome mix + a recorded-outcomes readout.
  const outcomeParts: SegmentBarPart[] = [
    { label: 'Improved', value: outcomeTally.improved, tone: 'good' },
    { label: 'No change', value: outcomeTally.noChange, tone: 'neutral' },
    { label: 'Worsened', value: outcomeTally.worsened, tone: 'caution' },
  ];

  const outcomeInstrument =
    totalOutcomes > 0 ? (
      <SegmentBar
        title="Did the coaching land?"
        takeaway={`${totalOutcomes} focus-area outcome${totalOutcomes === 1 ? '' : 's'} recorded across the roster.`}
        parts={outcomeParts}
        primary="good"
      />
    ) : (
      <InstrumentPanel
        depth="base"
        header="Did the coaching land?"
        className="flex h-full flex-col justify-center"
      >
        {/* The denominator was a hardcoded `need: 1`, which rendered
            "AWAITING OUTCOMES — 0 OF 1" on a roster with nothing prescribed —
            reading as one verdict already overdue. With no focus areas there is
            nothing to grade, so the readout carries no denominator at all; once
            areas DO exist, every one of them is genuinely awaiting a verdict, so
            the denominator is their count. */}
        <Readout
          label="Outcomes recorded"
          size="md"
          state="awaiting"
          samples={noAreasYet ? undefined : { have: 0, need: areasPrescribed }}
          awaitingLabel={noAreasYet ? 'No focus areas yet' : 'Awaiting outcomes'}
        />
        <p className="mt-3 font-fw-sans text-caption text-text-tertiary">
          {noAreasYet
            ? 'Set a focus area for a player, then mark it improved / no change / worsened to start the effectiveness loop.'
            : 'Mark a focus area improved / no change / worsened to start the effectiveness loop.'}
        </p>
      </InstrumentPanel>
    );

  return (
    <InstrumentCluster
      ariaLabel="Roster development health"
      balance="focal"
      tertiaryColumns={4}
      primary={primary}
      secondary={[outcomeInstrument]}
      /* These four are plain counts, not sampled measurements, so none of them
         carries a `samples` denominator. Each used to pass `{ have: 0, need: 1 }`
         when empty, rendering "NONE ACTIVE — 0 OF 1" / "NONE YET — 0 OF 1" — a
         threshold of one that nothing in the product defines, reading as one
         item already pending. The awaiting label alone says it honestly. */
      tertiary={[
        <InstrumentPanel key="players" depth="base" padding="md" className="h-full">
          <Readout
            value={totalPlayers}
            format={{ maximumFractionDigits: 0 }}
            label="Players"
            size="md"
            state={totalPlayers > 0 ? 'live' : 'awaiting'}
            awaitingLabel="No roster"
          />
        </InstrumentPanel>,
        <InstrumentPanel key="active" depth="base" padding="md" className="h-full">
          <Readout
            value={activeAreas}
            format={{ maximumFractionDigits: 0 }}
            label="Active focus areas"
            size="md"
            state={activeAreas > 0 ? 'live' : 'awaiting'}
            awaitingLabel="None active"
          />
        </InstrumentPanel>,
        <InstrumentPanel key="completed" depth="base" padding="md" className="h-full">
          <Readout
            value={completedAreas}
            format={{ maximumFractionDigits: 0 }}
            label="Completed"
            size="md"
            state={completedAreas > 0 ? 'live' : 'awaiting'}
            awaitingLabel="None yet"
          />
        </InstrumentPanel>,
        <InstrumentPanel key="rounds" depth="base" padding="md" className="h-full">
          <Readout
            value={playersWithRounds}
            format={{ maximumFractionDigits: 0 }}
            label="With recent rounds"
            size="md"
            state={playersWithRounds > 0 ? 'live' : 'awaiting'}
            awaitingLabel="No rounds"
          />
        </InstrumentPanel>,
      ]}
    />
  );
}

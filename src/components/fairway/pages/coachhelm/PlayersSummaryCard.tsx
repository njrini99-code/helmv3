'use client';

/**
 * ============================================================================
 * Fairway · CoachHelm · Players summary cards
 * ----------------------------------------------------------------------------
 * Summary first (owner direction 2026-09-25): the Players tab opens on one
 * card — the key number, a one-line takeaway, and one visual — with the
 * detail (who needs a look, the outcome mix) behind closed disclosures.
 * Reads the SAME precomputed `RosterHealth` / `NeedRow[]` the roster page's
 * `RosterHealthHeader` uses; no fetch, no re-derived scoring.
 * ========================================================================== */

import { Eyebrow } from '@/components/fairway/controls/eyebrow';
import { Button } from '@/components/fairway/controls/button';
import { PlayerIdentity } from '@/components/fairway/controls/PlayerIdentity';
import { Disclosure } from '@/components/golf/coachhelm/root-map/Disclosure';
import { formatScoringAverage } from '@/lib/golf/format-scoring-average';
import { cn } from '@/lib/utils';
import type { NeedRow, RosterHealth } from './RosterHealthHeader';
import type { PlayersGridPlayer } from './PlayersGridView';

function plural(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

function nameOf(p?: PlayersGridPlayer | null): string {
  if (!p) return 'Player';
  return `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim() || 'Player';
}

/** The one-line roster takeaway. Never an all-clear on a roster with nothing
 *  to assess (no players, or no rounds logged). */
export function rosterTakeaway(health: RosterHealth, needs: ReadonlyArray<NeedRow>): string {
  if (health.totalPlayers === 0) return 'No players on the roster yet.';
  if (health.playersWithRounds === 0) return 'Nothing to assess yet. Flags appear once players log rounds.';
  if (needs.length === 0) {
    return 'Every player with rounds has a focus area, and none is trending down.';
  }
  if (health.activeAreas + health.completedAreas === 0) {
    return `${plural(needs.length, 'player')} with rounds ready for a first focus area; none set on this roster yet.`;
  }
  const declining = needs.filter((n) => n.priority >= 2).length;
  const uncoached = needs.filter((n) => n.priority === 3 || n.priority === 1).length;
  const parts = [
    declining > 0 ? `${declining} trending down` : null,
    uncoached > 0 ? `${uncoached} without a focus area` : null,
  ].filter(Boolean);
  return `${parts.join(', ')}.`;
}

/** A single horizontal share bar (role="img", counts in the label). */
function ShareBar({ have, of, label }: { have: number; of: number; label: string }) {
  const pct = of > 0 ? Math.round((have / of) * 100) : 0;
  return (
    <div
      role="img"
      aria-label={label}
      className="flex h-3 w-full overflow-hidden rounded-full bg-surface-sunken"
    >
      <span
        className="h-full rounded-full bg-accent-500 motion-safe:transition-[width] motion-safe:duration-500"
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * RosterSummaryCard — the Players (Roster) tab's opening card.
 * ------------------------------------------------------------------------- */

export function RosterSummaryCard({ health, needs }: { health: RosterHealth; needs: ReadonlyArray<NeedRow> }) {
  const { totalPlayers, playersWithActive, playersWithRounds } = health;
  const assessable = totalPlayers > 0 && playersWithRounds > 0;
  const coverage = `${playersWithActive} of ${plural(totalPlayers, 'player')} with an active focus area`;

  return (
    <section
      aria-label="Roster summary"
      data-slot="players-roster-summary"
      className="flex flex-col gap-5 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <Eyebrow as="p">
          {`Roster · ${plural(totalPlayers, 'player')} · ${playersWithRounds} with rounds`}
        </Eyebrow>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-fw-mono text-display tabular-nums text-text-primary" data-slot="players-needs-count">
            {assessable ? needs.length : '—'}
          </p>
          <p className="text-body-sm text-text-secondary">
            {assessable ? `${needs.length === 1 ? 'player' : 'players'} to look at` : 'awaiting rounds'}
          </p>
        </div>
        <p className="text-body text-text-secondary" data-slot="players-takeaway">
          {rosterTakeaway(health, needs)}
        </p>
      </div>
      {totalPlayers > 0 ? (
        <div className="flex flex-col gap-2">
          <ShareBar have={playersWithActive} of={totalPlayers} label={`${coverage}.`} />
          <p className="font-fw-mono text-caption tabular-nums text-text-tertiary">{coverage}</p>
        </div>
      ) : null}
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Roster detail — closed disclosures under the roster table.
 * ------------------------------------------------------------------------- */

export function RosterDetail({
  health,
  needs,
  onAdd,
}: {
  health: RosterHealth;
  needs: ReadonlyArray<NeedRow>;
  onAdd: (playerId?: string) => void;
}) {
  const { outcomeTally, totalOutcomes, activeAreas, completedAreas } = health;
  const prescribed = activeAreas + completedAreas;
  const parts = [
    { key: 'improved', label: 'Improved', value: outcomeTally.improved, className: 'bg-accent-500' },
    { key: 'no-change', label: 'No change', value: outcomeTally.noChange, className: 'bg-text-tertiary' },
    { key: 'worsened', label: 'Worsened', value: outcomeTally.worsened, className: 'bg-fw-warning' },
  ];

  return (
    <div className="flex flex-col">
      <Disclosure
        title="Who needs a look"
        slot="players-needs"
        meta={
          <span className="font-fw-mono text-caption font-normal tabular-nums text-text-secondary">
            {needs.length}
          </span>
        }
      >
        {needs.length === 0 ? (
          <p className="text-body-sm text-text-secondary">No player is trending down or without a focus area.</p>
        ) : (
          <ul className="flex flex-col">
            {needs.map(({ row, reason }) => (
              <li key={row.player.id} className="border-t border-border-subtle py-2.5 first:border-t-0">
                <PlayerIdentity
                  name={nameOf(row.player)}
                  avatarUrl={row.player.avatar_url}
                  size="sm"
                  meta={<span className="text-caption font-medium text-fw-warning-ink">{reason}</span>}
                  trailing={
                    <div className="flex items-center gap-1.5">
                      {row.stats?.avg_score != null ? (
                        <span className="hidden font-fw-mono text-caption tabular-nums text-text-tertiary sm:inline">
                          {formatScoringAverage(row.stats.avg_score)} avg · {row.stats.rounds_played ?? 0} rds
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
        )}
      </Disclosure>

      <Disclosure
        title="Did the coaching land?"
        slot="players-outcomes"
        meta={
          <span className="font-fw-mono text-caption font-normal tabular-nums text-text-secondary">
            {totalOutcomes} of {prescribed}
          </span>
        }
      >
        {totalOutcomes === 0 ? (
          <p className="text-body-sm text-text-secondary">
            {prescribed === 0
              ? 'No focus areas set yet. Outcomes are recorded once an area is marked improved, no change or worsened.'
              : `No outcomes recorded yet on ${plural(prescribed, 'focus area')}.`}
          </p>
        ) : (
          <div className="flex flex-col gap-3">
            <div
              role="img"
              aria-label={`${outcomeTally.improved} improved, ${outcomeTally.noChange} no change, ${outcomeTally.worsened} worsened, of ${totalOutcomes} recorded outcomes.`}
              className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
            >
              {parts
                .filter((p) => p.value > 0)
                .map((p) => (
                  <span
                    key={p.key}
                    className={cn('h-full', p.className)}
                    style={{ width: `${(p.value / totalOutcomes) * 100}%` }}
                  />
                ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
              {parts.map((p) => (
                <li key={p.key} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn('h-2 w-2 rounded-full', p.className)} />
                  {p.label}{' '}
                  <span className="font-fw-mono tabular-nums text-text-primary">{p.value}</span>
                </li>
              ))}
            </ul>
            <p className="text-caption text-text-tertiary">
              {`${totalOutcomes} of ${plural(prescribed, 'focus area')} have a recorded outcome.`}
            </p>
          </div>
        )}
      </Disclosure>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * FocusAreasSummaryCard — the Focus areas (development) tab's opening card.
 * Counts use the board's own status split: proposed and declined are not
 * active work.
 * ------------------------------------------------------------------------- */

export interface FocusAreaCounts {
  total: number;
  active: number;
  proposed: number;
  completed: number;
  declined: number;
  players: number;
  improved: number;
  recorded: number;
}

export function countFocusAreas(
  areas: ReadonlyArray<{ status?: string | null; player_id: string; outcome_status?: string | null }>,
): FocusAreaCounts {
  let active = 0;
  let proposed = 0;
  let completed = 0;
  let declined = 0;
  let improved = 0;
  let recorded = 0;
  for (const a of areas) {
    if (a.status === 'proposed') proposed += 1;
    else if (a.status === 'declined') declined += 1;
    else if (a.status === 'completed') completed += 1;
    else active += 1;
    if (a.outcome_status === 'improved' || a.outcome_status === 'no_change' || a.outcome_status === 'worsened') {
      recorded += 1;
      if (a.outcome_status === 'improved') improved += 1;
    }
  }
  return {
    total: areas.length,
    active,
    proposed,
    completed,
    declined,
    players: new Set(areas.map((a) => a.player_id)).size,
    improved,
    recorded,
  };
}

/** One plain line: what is due, what is waiting on a player, what landed. */
export function focusAreasTakeaway(
  c: FocusAreaCounts,
  due: { due: number; overdue: number },
  scopeName: string | null,
): string {
  if (c.total === 0) {
    return scopeName ? `No focus areas set for ${scopeName} yet.` : 'No focus areas set on this roster yet.';
  }
  const parts: string[] = [];
  if (due.due > 0) {
    parts.push(`${due.due} due for review${due.overdue > 0 ? ` (${due.overdue} overdue)` : ''}`);
  }
  if (c.proposed > 0) parts.push(`${c.proposed} awaiting the player's acceptance`);
  if (c.recorded > 0) parts.push(`${c.improved} of ${c.recorded} recorded outcomes improved`);
  if (parts.length === 0) {
    return c.active > 0 ? `${c.active} in progress; none due for review this week.` : 'Nothing in progress right now.';
  }
  const line = parts.join('; ');
  return `${line.charAt(0).toUpperCase()}${line.slice(1)}.`;
}

export function FocusAreasSummaryCard({
  counts,
  due,
  scopeName,
}: {
  counts: FocusAreaCounts;
  due: { due: number; overdue: number };
  scopeName: string | null;
}) {
  const parts = [
    { key: 'active', label: 'Active', value: counts.active, className: 'bg-accent-500' },
    { key: 'proposed', label: 'Proposed', value: counts.proposed, className: 'bg-accent-300' },
    { key: 'completed', label: 'Completed', value: counts.completed, className: 'bg-text-tertiary' },
    { key: 'declined', label: 'Declined', value: counts.declined, className: 'bg-border-strong' },
  ];
  const eyebrow = scopeName
    ? `${scopeName} · ${plural(counts.total, 'focus area')}`
    : `Focus areas · ${counts.total} across ${plural(counts.players, 'player')}`;

  return (
    <section
      aria-label="Focus areas summary"
      data-slot="players-areas-summary"
      className="flex flex-col gap-5 rounded-fw-lg border border-border-subtle bg-surface p-5 md:p-6"
    >
      <div className="flex flex-col gap-1">
        <Eyebrow as="p">{eyebrow}</Eyebrow>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <p className="font-fw-mono text-display tabular-nums text-text-primary" data-slot="players-areas-active">
            {counts.total > 0 ? counts.active : '—'}
          </p>
          <p className="text-body-sm text-text-secondary">active</p>
        </div>
        <p className="text-body text-text-secondary" data-slot="players-areas-takeaway">
          {focusAreasTakeaway(counts, due, scopeName)}
        </p>
      </div>
      {counts.total > 0 ? (
        <div className="flex flex-col gap-3">
          <div
            role="img"
            aria-label={`${counts.active} active, ${counts.proposed} proposed, ${counts.completed} completed, ${counts.declined} declined, of ${plural(counts.total, 'focus area')}.`}
            className="flex h-3 w-full gap-0.5 overflow-hidden rounded-full bg-surface-sunken"
          >
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <span
                  key={p.key}
                  className={cn('h-full', p.className)}
                  style={{ width: `${(p.value / counts.total) * 100}%` }}
                />
              ))}
          </div>
          <ul className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-text-secondary">
            {parts
              .filter((p) => p.value > 0)
              .map((p) => (
                <li key={p.key} className="flex items-center gap-1.5">
                  <span aria-hidden className={cn('h-2 w-2 rounded-full', p.className)} />
                  {p.label} <span className="font-fw-mono tabular-nums text-text-primary">{p.value}</span>
                </li>
              ))}
          </ul>
        </div>
      ) : null}
    </section>
  );
}

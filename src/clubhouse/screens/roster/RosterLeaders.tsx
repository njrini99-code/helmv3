'use client';

import { CircleAlert, TrendingUp, Trophy, type LucideIcon } from 'lucide-react';
import type { ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { formatFixed, formatSigned } from '../../lib/format';
import { FormBars } from '../../ui/FormLine';
import { leaderPicks, ROSTER_EARLY_FLOOR, yearKeyOf, type RosterClock, type RosterLeader } from './format';

/**
 * Each card's name and the window its figure covers, on the card itself (prod audit 2026-11-15, ROSTER-01 and ROSTER-08):
 * the season average over three or more counting rounds, the mean of the last three, and strokes gained a round this season.
 */
const KIND: Record<RosterLeader['kind'], { label: string; icon: LucideIcon; unit: string }> = {
  low: { label: 'Lowest average', icon: Trophy, unit: 'season' },
  heater: { label: 'Best last 3', icon: TrendingUp, unit: 'last 3 avg' },
  look: { label: 'Needs a look', icon: CircleAlert, unit: 'SG a round' },
};

/**
 * The leaders row, coach only (06 7.3): cards in each player's year colour, a sideways snap row on the phone and across the top on
 * desktop. Tapping one opens that player. Absent when nobody qualifies.
 */
export function RosterLeaders({ players, statsError, clock, onOpen }: { players: ChRosterPlayer[]; statsError: boolean; clock: RosterClock; onOpen: (id: string) => void }) {
  const picks = leaderPicks(players, statsError);
  if (picks.length === 0) return null;
  // W24: the cards count only active players with three counting rounds, so a player with a lower average and fewer rounds
  // is not "Lowest average"; the list ranks by the same rule (sort.ts). The row says its rule once, under it.
  return (
    <>
    <div className="ch-rs-ldrs">
      {picks.map(({ kind, player: p, value }) => {
        const k = KIND[kind];
        const year = yearKeyOf(p.gradYear, clock);
        // The figure is always a number with its window; Needs a look says why in words under the name (prod audit
        // 2026-11-15, ROSTER-08: the reason set as a 24px amber "figure" read as a number and was cut at the edge).
        const reason = kind === 'look' ? p.attention?.text ?? null : null;
        const figure = kind === 'look' ? formatSigned(value) : formatFixed(value);
        return (
          <button key={kind} type="button" className="ch-rs-ldr" data-year={year ?? undefined} data-ch-press-scale=".97" aria-label={`${k.label}, ${p.name}, ${figure} ${k.unit}${reason ? `, ${reason}` : ''}. Open profile`} onClick={() => onOpen(p.id)}>
            <span className="ch-rs-ldr__k">
              {k.label}
              <Icon icon={k.icon} size={15} />
            </span>
            <span className={'ch-rs-ldr__v ch-num' + (kind === 'look' ? ' is-loss' : '')}>
              {figure}
              <small>{k.unit}</small>
            </span>
            <span className="ch-rs-ldr__p">
              <Avatar name={p.name} id={p.id} size="sm" year={year} />
              <b>{p.name}</b>
            </span>
            {reason && <span className="ch-rs-ldr__why">{reason}</span>}
            {p.trend.length >= 3 && (
              <span className="ch-rs-ldr__bars">
                <FormBars data={p.trend} mean={p.avg} />
              </span>
            )}
          </button>
        );
      })}
    </div>
    <p className="ch-rs-ldrs__rule">Leaders count active players with {ROSTER_EARLY_FLOOR}+ counting rounds.</p>
    </>
  );
}

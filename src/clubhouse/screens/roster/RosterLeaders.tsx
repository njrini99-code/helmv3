'use client';

import { CircleAlert, TrendingUp, Trophy, type LucideIcon } from 'lucide-react';
import type { ChRosterPlayer } from '../../data/roster';
import { Avatar } from '../../ui/Avatar';
import { Icon } from '../../ui/Icon';
import { formatFixed, formatSigned } from '../../lib/format';
import { leaderPicks, yearKeyOf, type RosterClock, type RosterLeader } from './format';

const KIND: Record<RosterLeader['kind'], { label: string; icon: LucideIcon; unit: string | null }> = {
  low: { label: 'Low average', icon: Trophy, unit: null },
  heater: { label: 'On a heater', icon: TrendingUp, unit: 'last 3' },
  look: { label: 'Needs a look', icon: CircleAlert, unit: 'SG / rd' },
};

/**
 * The leaders row, coach only (06 7.3): cards in each player's year colour, a sideways snap row on the phone and across the top on
 * desktop. Tapping one opens that player. Absent when nobody qualifies.
 */
export function RosterLeaders({ players, statsError, clock, onOpen }: { players: ChRosterPlayer[]; statsError: boolean; clock: RosterClock; onOpen: (id: string) => void }) {
  const picks = leaderPicks(players, statsError);
  if (picks.length === 0) return null;
  return (
    <div className="ch-rs-ldrs">
      {picks.map(({ kind, player: p, value }) => {
        const k = KIND[kind];
        const year = yearKeyOf(p.gradYear, clock);
        const figure = kind === 'look' ? formatSigned(value) : formatFixed(value);
        return (
          <button key={kind} type="button" className="ch-rs-ldr" data-year={year ?? undefined} data-ch-press-scale=".97" aria-label={`${k.label}, ${p.name}, ${figure}. Open profile`} onClick={() => onOpen(p.id)}>
            <span className="ch-rs-ldr__k">
              {k.label}
              <Icon icon={k.icon} size={15} />
            </span>
            <span className={'ch-rs-ldr__v ch-num' + (kind === 'look' ? ' is-loss' : '')}>
              {figure}
              {k.unit && <small>{k.unit}</small>}
            </span>
            <span className="ch-rs-ldr__p">
              <Avatar name={p.name} id={p.id} size="sm" year={year} />
              <b>{p.name}</b>
            </span>
          </button>
        );
      })}
    </div>
  );
}

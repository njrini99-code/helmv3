'use client';

import { BarChart3, CalendarPlus, MessageSquare, TriangleAlert } from 'lucide-react';
import type { ReactNode } from 'react';
import { formatFixed, formatToPar, NO_DATA } from '../lib/format';
import { rebuiltHref } from '../shell/nav';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { PeekTarget, type PeekAction } from './Peek';

/**
 * The player peek (P003-C1, owner 2026-10-08): wherever a coach sees a player's name, a hold (phone) or a rest of the
 * pointer (desktop) shows who they are and how they are playing, with Message (prefilled, never sent), View stats and
 * Plan 1:1. Pages map what they already loaded into `ChPlayerPeek`; the peek reads nothing of its own.
 */
export interface ChPlayerPeek {
  id: string;
  name: string;
  /** "Junior", "Class of 2027"; null to leave the line out. */
  sub?: string | null;
  lastRound?: { score: number; toPar: number | null; label: string } | null;
  /** Scoring average; null when there are no countable rounds. */
  avg?: number | null;
  /** Oldest to newest 18-hole scores, for the word-sized line. */
  trend?: number[];
  /** Why the coach should look ("No round in 9 days"); null when nothing needs a look. */
  reason?: string | null;
}

/** Message opens Messages with the player as the recipient (the coach writes and sends); the others open the page. */
export function playerPeekActions(p: Pick<ChPlayerPeek, 'id'>): PeekAction[] {
  const id = encodeURIComponent(p.id);
  return [
    { label: 'Message', icon: MessageSquare, href: rebuiltHref(`/golf/dashboard/messages?player=${id}`) },
    { label: 'View stats', icon: BarChart3, href: rebuiltHref(`/golf/dashboard/stats?player=${id}`) },
    { label: 'Plan 1:1', icon: CalendarPlus, href: rebuiltHref(`/golf/dashboard/calendar?new=1&with=${id}`) },
  ];
}

/** Wraps a player's name (a link or a row) so it peeks. The child keeps its own tap. */
export function PlayerPeek({ player, children }: { player: ChPlayerPeek; children: ReactNode }) {
  return (
    <PeekTarget label={player.name} card={() => <PlayerPeekCard p={player} />} actions={playerPeekActions(player)}>
      {children}
    </PeekTarget>
  );
}

export function PlayerPeekCard({ p }: { p: ChPlayerPeek }) {
  const last = p.lastRound ?? null;
  return (
    <div className="ch-ppeek" data-ch-code="CH-1832">
      <div className="ch-ppeek__head">
        <Avatar name={p.name} size={44} />
        <div className="ch-ppeek__who">
          <b>{p.name}</b>
          {p.sub && <span>{p.sub}</span>}
        </div>
      </div>
      {p.reason && (
        <p className="ch-ppeek__why">
          <Icon icon={TriangleAlert} size={14} />
          <span>{p.reason}</span>
        </p>
      )}
      <dl className="ch-ppeek__figs">
        <div>
          <dt>Last round</dt>
          <dd className="ch-num">
            {last ? (
              <>
                {last.score}
                {last.toPar != null && <small> {formatToPar(last.toPar)}</small>}
              </>
            ) : (
              NO_DATA
            )}
          </dd>
          {last && <span className="ch-ppeek__m">{last.label}</span>}
        </div>
        <div>
          <dt>Average</dt>
          <dd className="ch-num">{formatFixed(p.avg ?? null)}</dd>
          {p.trend && p.trend.length >= 2 && <TrendLine scores={p.trend} />}
        </div>
      </dl>
    </div>
  );
}

/** A word-sized line of the last scores, lower drawn higher (fewer strokes is better), the latest as a dot. */
export function TrendLine({ scores }: { scores: number[] }) {
  const w = 72;
  const h = 18;
  const lo = Math.min(...scores);
  const hi = Math.max(...scores);
  const span = hi - lo || 1;
  const pts = scores.map((v, i) => [(i * (w - 4)) / (scores.length - 1) + 2, 2 + ((v - lo) / span) * (h - 4)] as const);
  const last = pts[pts.length - 1]!;
  const change = scores[scores.length - 1]! - scores[0]!;
  const word = change < -0.5 ? 'coming down' : change > 0.5 ? 'going up' : 'steady';
  return (
    <svg className="ch-ppeek__line" viewBox={`0 0 ${w} ${h}`} width={w} height={h} role="img" aria-label={`Last ${scores.length} scores, ${word}`}>
      <polyline points={pts.map((p) => p.join(',')).join(' ')} fill="none" />
      <circle cx={last[0]} cy={last[1]} r={2.2} />
    </svg>
  );
}

'use client';

import { ChartColumn, Flag, MessageSquare, Radio } from 'lucide-react';
import type { ReactNode } from 'react';
import { messagesPrefillHref } from '../screens/messages/prefill';
import { firstName } from '../lib/names';
import { rebuiltHref } from '../shell/nav';
import { PeekTarget, type PeekAction } from '../ui/Peek';
import { HoleBeads, useRing } from './HoleBeads';
import { LIVE_COPY, LIVE_ROUTE } from './copy';
import { MomentumLine } from './MomentumLine';
import { laneAria, laneFreshness, laneSubline, nextHole, thruText, toParText, type LaneFreshness, type LiveLane } from './model';
import type { LaneChange } from './use-live-rounds';

/**
 * The lane (4.1, 3a): one player's round as one quiet row. Compact on Home (48 px: disc, name and what they are on,
 * the last six marks, to-par, thru); full in the live view (every hole, a momentum line on a wide row, and how fresh the
 * lane is). No stripe or border on the left of anything. The to-par takes its new value in place (D-100): the changed
 * wash is a layer on the to-par cell that fades out, never a crossfade of the figure. A lane that has gone quiet keeps
 * full contrast and says so in words (Must 3).
 */

export interface PlayerLaneProps {
  lane: LiveLane;
  density: 'compact' | 'full';
  /** Epoch ms; null before hydration, when every lane reads as fresh so the server and first client paint agree. */
  now: number | null;
  hours: '12' | '24';
  change?: LaneChange;
  reduced: boolean;
  selected?: boolean;
  /** The coach's lane opens the player's sheet; omitted, the lane is plain information (a teammate's own row). */
  onOpen?: (lane: LiveLane) => void;
  /** The long-press and hover actions (coach only). */
  actions?: boolean;
  /** The hit area takes the roving tab stop's marker. */
  rowAttr?: boolean;
}

/** What the sub line says: the lane's freshness when it is not fresh, else where the player is. */
function subFor(lane: LiveLane, f: LaneFreshness, hours: '12' | '24'): { code: string; text: string; tone: 'info' | 'warn' | 'quiet' } {
  if (f.kind === 'stopped') return { code: 'CH-16674', text: LIVE_COPY.stopped(f.thru), tone: 'quiet' };
  if (lane.phase === 'finished') return { code: 'CH-16675', text: LIVE_COPY.finishedNotPosted, tone: 'info' };
  if (f.kind === 'stale') return { code: 'CH-16672', text: LIVE_COPY.lastUpdate(f.minutes), tone: 'warn' };
  if (f.kind === 'quiet') return { code: 'CH-16673', text: LIVE_COPY.noUpdateSince(f.since, hours), tone: 'quiet' };
  const s = laneSubline(lane);
  return { code: s.code, text: s.text, tone: 'info' };
}

export function PlayerLane({ lane, density, now, hours, change, reduced, selected = false, onOpen, actions = false, rowAttr = true }: PlayerLaneProps) {
  const f: LaneFreshness = now == null ? { kind: 'fresh' } : laneFreshness(lane, now);
  const sub = subFor(lane, f, hours);
  const ring = useRing(reduced ? change?.n : undefined);
  const under = lane.toPar != null && lane.toPar < 0;
  const posted = lane.phase === 'posted';
  const stopped = f.kind === 'stopped';
  const thru = stopped ? 'Stopped' : posted ? (lane.strokes != null ? String(lane.strokes) : 'Posted') : thruText(lane);
  const label = laneAria(lane, now ?? Date.parse(lane.heardAt), hours);
  const wash = !reduced && change?.wash ? change.wash : undefined;

  const body: ReactNode = (
    <>
      <span className="ch-lv-disc" aria-hidden="true">
        {lane.initials}
      </span>
      <span className="ch-lv-id">
        <span className="ch-lv-name">{lane.name || 'Player'}</span>
        <span className="ch-lv-sub" data-tone={sub.tone} data-ch-code={sub.code}>
          {sub.text}
        </span>
      </span>
      <HoleBeads lane={lane} density={density} change={change} reduced={reduced} />
      {density === 'full' && (
        <span className="ch-lv-momentum">
          <MomentumLine lane={lane} freshN={change?.n} />
        </span>
      )}
      <span
        // A new change remounts the cell's layer so the wash runs again.
        key={change ? `par-${change.n}` : 'par'}
        className={'ch-lv-par ch-num' + (under ? ' is-under' : '')}
        data-wash={wash}
        data-ring={ring ? '' : undefined}
      >
        {toParText(lane.toPar)}
      </span>
      <span className="ch-lv-thru ch-num" data-final={posted || lane.phase === 'finished' ? '' : undefined}>
        {thru}
      </span>
    </>
  );

  const hit = onOpen ? (
    <button
      type="button"
      className="ch-lv-hit"
      aria-label={label}
      aria-current={selected ? 'true' : undefined}
      data-ch-row={rowAttr ? '' : undefined}
      onClick={() => onOpen(lane)}
    >
      {body}
    </button>
  ) : (
    <div className="ch-lv-hit is-static" role="group" aria-label={label}>
      {body}
    </div>
  );

  return (
    <li className={'ch-lv-lane' + (selected ? ' is-selected' : '')} data-density={density} data-phase={lane.phase} data-freshness={f.kind} data-round={lane.roundId}>
      {actions && onOpen ? (
        <PeekTarget label={lane.name} card={() => <LanePeekCard lane={lane} />} actions={peekActions(lane)}>
          {hit}
        </PeekTarget>
      ) : (
        hit
      )}
    </li>
  );
}

/** Message (prefilled, never sent), the round, and for a qualifier the qualifier (6). */
export function peekActions(lane: LiveLane): PeekAction[] {
  const out: PeekAction[] = [];
  const msg = messagesPrefillHref({ players: [lane.playerId], draft: '', title: lane.name });
  if (msg) out.push({ label: `Message ${firstName(lane.name)}`, icon: MessageSquare, href: rebuiltHref(msg, 'coach') });
  // A round still in progress (out, or in and not posted) is followed on Live: its review would only send the coach there.
  // A posted round, and one the player stopped, has a review that opens.
  if (lane.phase === 'on_course' || lane.phase === 'finished') out.push({ label: 'Follow on Live', icon: Radio, href: `${LIVE_ROUTE}?player=${encodeURIComponent(lane.playerId)}` });
  else out.push({ label: 'Open round', icon: ChartColumn, href: rebuiltHref(`/golf/dashboard/rounds/${lane.roundId}`, 'coach') });
  if (lane.roundType === 'qualifier' && lane.qualifierId) out.push({ label: 'Open qualifier', icon: Flag, href: rebuiltHref(`/golf/dashboard/qualifiers/${lane.qualifierId}`, 'coach') });
  return out;
}

function LanePeekCard({ lane }: { lane: LiveLane }) {
  const next = nextHole(lane);
  return (
    <div className="ch-lv-peek">
      <b>{lane.name}</b>
      <span className="ch-num">
        {toParText(lane.toPar)} · {thruText(lane)}
      </span>
      {next && <span>{LIVE_COPY.nextHole(next.hole, next.par, next.yds)}</span>}
    </div>
  );
}

'use client';

import { useMemo } from 'react';
import { OWN_COPY } from '../../live/copy';
import { holeKind, laneFreshness, nextHole, orderedHoles, thruText, toParText, toParWords, type HoleKind, type LiveLane, type LiveSnapshot } from '../../live/model';
import { useLiveRounds } from '../../live/use-live-rounds';
import { formatSigned } from '../../lib/format';
import { useNow } from '../../lib/use-now';
import { rebuiltHref } from '../../shell/nav';
import { Button } from '../../ui/Button';
import { NoData } from '../../ui/NoData';
import type { OwnLegs } from '../../data/live-rounds';
import '../../styles/live.css';

/** What a bead means, for the one sentence that stands in for the marks (they are hidden from a screen reader). */
const KIND_WORDS: Record<HoleKind, string> = { eagle: 'eagle or better', birdie: 'birdie', par: 'par', bogey: 'bogey', double: 'double bogey or worse', unplayed: 'not played', unknown: 'played' };

/** The last three holes with a score, in the order the round is played. */
export function lastHoles(lane: Pick<LiveLane, 'holesPlanned' | 'startPosition' | 'holes'>, count = 3) {
  return orderedHoles(lane)
    .filter((h) => h.score != null)
    .slice(-count);
}

/**
 * The player's own live card (4.4): shown on Home while they have a round in progress, of any type. To-par, how far
 * through, the last three holes, the next hole, and Resume round. For a practice round the strokes gained by leg
 * come from the shots so far. A qualifier or a tournament shows none (owner call 2: no strokes gained on a live
 * competitive round). Its data (`toPar`, `thru`, the last holes, the next hole) is the Lock Screen contract (8.18).
 */
export function OwnLiveCard({
  initial,
  playerId,
  legs,
  frozen = false,
  now: frozenNow,
}: {
  initial: LiveSnapshot;
  playerId: string;
  legs?: OwnLegs | null;
  frozen?: boolean;
  /** The preview and the tests: a fixed clock (epoch ms). */
  now?: number;
}) {
  const live = useLiveRounds({ initial, role: 'player', playerId, frozen });
  const ticking = useNow();
  const now = frozenNow ?? ticking?.getTime() ?? null;
  const lane = live.lanes.find((l) => l.playerId === playerId && (l.phase === 'on_course' || l.phase === 'finished')) ?? null;
  const href = lane ? rebuiltHref(`/golf/dashboard/rounds/continue/${lane.roundId}`, 'player') : null;
  const recent = useMemo(() => (lane ? lastHoles(lane) : []), [lane]);
  if (!lane || !href) return null;

  const next = nextHole(lane);
  const f = now == null ? { kind: 'fresh' as const } : laneFreshness(lane, now);
  const minutes = now == null ? null : Math.max(0, Math.floor((now - Date.parse(lane.heardAt)) / 60_000));
  const showLegs = lane.roundType === 'practice' && legs != null;
  const marks = recent.map((h) => `hole ${h.n}, ${KIND_WORDS[holeKind(h.score, h.par)]}`).join('; ');

  return (
    <section className="ch-lv-own" aria-labelledby="ch-lv-own-title">
      <h2 id="ch-lv-own-title" className="ch-lv-own__title" data-ch-code="CH-16680">
        {OWN_COPY.title}
      </h2>
      <div className="ch-lv-own__figure">
        <span className={'ch-lv-own__par ch-num' + (lane.toPar != null && lane.toPar < 0 ? ' is-under' : '')} role="img" aria-label={toParWords(lane.toPar)}>
          {toParText(lane.toPar)}
        </span>
        <span className="ch-lv-own__thru ch-num">{thruText(lane)}</span>
      </div>
      {recent.length > 0 && (
        <div className="ch-lv-own__marks" role="img" aria-label={`Last holes: ${marks}`}>
          {recent.map((h) => (
            <span key={h.n} className="ch-lv-own__mark" aria-hidden="true">
              <span className="ch-num">{h.n}</span>
              <span className="ch-lv-bead" data-kind={holeKind(h.score, h.par)} />
            </span>
          ))}
        </div>
      )}
      {next && (
        <p className="ch-lv-own__next ch-num" data-ch-code="CH-16681">
          {OWN_COPY.next(next.hole, next.par, next.yds)}
        </p>
      )}
      {(f.kind === 'stale' || f.kind === 'quiet') && minutes != null && (
        <p className="ch-lv-note" data-tone="warn" data-ch-code="CH-16683">
          {OWN_COPY.lastSaved(minutes)}
        </p>
      )}
      {showLegs && (
        <dl className="ch-lv-own__legs">
          {(['tee', 'approach', 'short', 'putting'] as const).map((k) => (
            <div key={k}>
              <dt>{OWN_COPY.legs[k]}</dt>
              <dd className="ch-num">{legs[k] == null ? <NoData /> : formatSigned(legs[k])}</dd>
            </div>
          ))}
        </dl>
      )}
      <Button variant="primary" href={href} className="ch-lv-own__resume">
        {OWN_COPY.resume}
      </Button>
    </section>
  );
}

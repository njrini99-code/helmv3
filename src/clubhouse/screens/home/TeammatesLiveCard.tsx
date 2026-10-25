'use client';

import { useState } from 'react';
import { LIVE_COPY, OWN_COPY } from '../../live/copy';
import { isOnCourse, sortLanes, type LiveSnapshot } from '../../live/model';
import { LiveAnnouncer } from '../../live/LiveAnnouncer';
import { PlayerLane } from '../../live/PlayerLane';
import { useLiveRounds } from '../../live/use-live-rounds';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useChClock } from '../../lib/use-clock';
import { useNow } from '../../lib/use-now';
import { PlayerLiveSheet } from '../live/PlayerLiveSheet';
import '../../styles/live.css';

const LIMIT = 4;

/**
 * Player Home, "Teammates on the course · n" (4.5, CH-16682): the teammates who chose to show their round to the team,
 * as compact lanes. It is drawn only while the viewer has no round of their own on the course (their own round hides
 * the team's, Rule 4.3a) and at least one teammate is sharing. A lane opens a read-only sheet: no Message, no
 * qualifier link. Four lanes, then "See all n" opens the rest here (a player has no live view of their own).
 */
export function TeammatesLiveCard({ initial, playerId, frozen = false, now: frozenNow }: { initial: LiveSnapshot; playerId: string; frozen?: boolean; now?: number }) {
  const [open, setOpen] = useState<string | null>(null);
  const [all, setAll] = useState(false);
  const live = useLiveRounds({ initial, role: 'player', playerId, hold: open != null, frozen, listen: true });
  const ticking = useNow();
  const now = frozenNow ?? ticking?.getTime() ?? null;
  const hours = useChClock();
  const reduced = useChReducedMotion();
  if (now == null) return null;

  const own = live.lanes.some((l) => l.playerId === playerId && isOnCourse(l, now));
  const mates = sortLanes(
    live.lanes.filter((l) => l.playerId !== playerId && l.share === 'team' && isOnCourse(l, now)),
    'to_par',
  );
  if (own || mates.length === 0) return null;

  const shown = all ? mates : mates.slice(0, LIMIT);
  const selected = live.lanes.find((l) => l.roundId === open) ?? null;
  const title = OWN_COPY.teammates(mates.length);

  return (
    <section className="ch-lv-card" aria-labelledby="ch-lv-mates-title" data-density="phone">
      <header className="ch-lv-card__head">
        <span className="ch-lv-dot" aria-hidden="true" />
        <h2 id="ch-lv-mates-title" data-ch-code="CH-16682">
          {title}
        </h2>
      </header>
      <ul className="ch-lv-list" aria-label={title}>
        {shown.map((l) => (
          <PlayerLane key={l.roundId} lane={l} density="compact" now={now} hours={hours} change={live.changes.get(l.roundId)} reduced={reduced} onOpen={(x) => setOpen(x.roundId)} />
        ))}
      </ul>
      {mates.length > LIMIT && !all && (
        <button type="button" className="ch-lv-card__more" data-ch-code="CH-16601" onClick={() => setAll(true)}>
          {LIVE_COPY.seeAll(mates.length)}
        </button>
      )}
      <LiveAnnouncer moments={live.moments} enabled />
      <PlayerLiveSheet lane={selected} moments={live.moments} now={now} coach={false} hours={hours} onClose={() => setOpen(null)} />
    </section>
  );
}

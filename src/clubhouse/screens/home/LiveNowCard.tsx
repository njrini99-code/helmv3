'use client';

import { ChevronRight } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { LIVE_COPY, LIVE_ROUTE } from '../../live/copy';
import { feedProblem } from '../../live/FreshnessChip';
import { homeLanes, sortLanes, type LiveLane, type LiveSnapshot } from '../../live/model';
import type { LiveScope } from '../../live/scope';
import { LiveAnnouncer } from '../../live/LiveAnnouncer';
import { PlayerLane } from '../../live/PlayerLane';
import { useLiveRounds } from '../../live/use-live-rounds';
import { useChReducedMotion } from '../../lib/reduced-motion';
import { useChClock } from '../../lib/use-clock';
import { useNow } from '../../lib/use-now';
import { Button } from '../../ui/Button';
import { Icon } from '../../ui/Icon';
import { PlayerLiveSheet } from '../live/PlayerLiveSheet';
import '../../styles/live.css';

/** Phone shows four lanes, a wide screen six (4.2). The Rounds band shows three (4.9). */
const LIMIT = { phone: 4, desk: 6 } as const;
const BAND_LIMIT = 3;

/**
 * Where the card is drawn: Coach Home (4.2), the Team rounds band "Live now" (4.9, CH-16630) or the qualifier page's "On the
 * course" section (4.7, CH-16620, the lanes of that qualifier only, with the live view narrowed to it).
 */
export type LiveCardVariant = 'home' | 'band' | 'qualifier';

/**
 * Coach Home, "Live now" (4.2): who is out and how they are scoring, one quiet lane each. It exists only while someone is
 * out (or finished within the last half hour): no card at all is the empty state. Lanes sort by to-par, then thru, then
 * name. A lane opens the player's sheet; "See all" and the head open the live view. A tournament round that a tournament
 * already tracks is a row linking to that tournament's own live view (CH-16685), not a lane.
 */
export function LiveNowCard({
  initial,
  phone,
  frozen = false,
  now: frozenNow,
  variant = 'home',
  scope,
}: {
  initial: LiveSnapshot;
  phone: boolean;
  frozen?: boolean;
  /** The preview and the tests: a fixed clock (epoch ms). */
  now?: number;
  variant?: LiveCardVariant;
  /** The qualifier variant: the qualifier whose lanes it lists. */
  scope?: LiveScope;
}) {
  const [open, setOpen] = useState<string | null>(null);
  const live = useLiveRounds({ initial, role: 'coach', hold: open != null, frozen, scope });
  const ticking = useNow();
  const now = frozenNow ?? ticking?.getTime() ?? null;
  const hours = useChClock();
  const reduced = useChReducedMotion();

  const { live: out, finished } = homeLanes(live.lanes, now ?? Date.now());
  const events = live.snapshot.events;
  if (variant === 'qualifier' ? !out.length : !out.length && !finished.length && !events.length) return null;

  const limit = variant === 'band' ? BAND_LIMIT : phone ? LIMIT.phone : LIMIT.desk;
  const sortedLive = sortLanes(out, 'to_par');
  // The qualifier's section lists who is on the course; a finished round is on the board.
  const lanes = (variant === 'qualifier' ? sortedLive : [...sortedLive, ...sortLanes(finished, 'to_par')]).slice(0, limit);
  const problem = feedProblem(live.feed);
  const { title, titleCode } =
    variant === 'band'
      ? { title: LIVE_COPY.bandTitle, titleCode: 'CH-16630' }
      : variant === 'qualifier'
        ? { title: LIVE_COPY.qualifierSection(out.length), titleCode: 'CH-16620' }
        : out.length
          ? { title: LIVE_COPY.homeTitle(out.length), titleCode: 'CH-16600' }
          : finished.length
            ? { title: LIVE_COPY.finishedTitle(finished.length), titleCode: 'CH-16602' }
            : { title: LIVE_COPY.bandTitle, titleCode: 'CH-16630' };
  const selected = live.lanes.find((l) => l.roundId === open) ?? null;
  const more = variant === 'qualifier' ? out.length : out.length + finished.length;
  const href = variant === 'qualifier' && scope?.qualifierId ? `${LIVE_ROUTE}?qualifier=${scope.qualifierId}` : LIVE_ROUTE;

  return (
    <section className="ch-lv-card" aria-labelledby="ch-lv-home-title" data-density={phone ? 'phone' : 'desk'}>
      <header className="ch-lv-card__head">
        {out.length > 0 && !problem && <span className="ch-lv-dot" aria-hidden="true" />}
        <h2 id="ch-lv-home-title" data-ch-code={titleCode}>
          {title}
        </h2>
        {problem && (
          <span className="ch-lv-card__problem" role="status" data-ch-code={problem.code}>
            {problem.text}
          </span>
        )}
        {phone ? (
          <Link href={href} className="ch-lv-card__open" aria-label={LIVE_COPY.openLive} data-ch-code="CH-16603">
            <Icon icon={ChevronRight} size={16} />
          </Link>
        ) : (
          <Button variant="ghost" size="sm" href={href} code="CH-16603">
            {LIVE_COPY.openLive}
          </Button>
        )}
      </header>
      {(variant === 'qualifier' ? [] : events).map((e) => (
        <Link key={e.tournamentId} href={`/golf/dashboard/tournaments/${e.tournamentId}/live`} className="ch-lv-eventrow" data-ch-code="CH-16685">
          <span className="ch-lv-dot" aria-hidden="true" />
          <span>{LIVE_COPY.tournamentLive(e.name)}</span>
          <Icon icon={ChevronRight} size={16} />
        </Link>
      ))}
      {lanes.length > 0 && (
        <ul className="ch-lv-list" aria-label={title}>
          {lanes.map((l: LiveLane) => (
            <PlayerLane key={l.roundId} lane={l} density="compact" now={now} hours={hours} change={live.changes.get(l.roundId)} reduced={reduced} onOpen={(x) => setOpen(x.roundId)} actions />
          ))}
        </ul>
      )}
      {more > limit && (
        <Link href={href} className="ch-lv-card__more" data-ch-code="CH-16601">
          {LIVE_COPY.seeAll(more)}
        </Link>
      )}
      <LiveAnnouncer moments={live.moments} enabled />
      <PlayerLiveSheet lane={selected} moments={live.moments} now={now} coach hours={hours} onClose={() => setOpen(null)} />
    </section>
  );
}

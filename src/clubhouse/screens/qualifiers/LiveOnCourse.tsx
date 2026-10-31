'use client';

import { LiveNowCard } from '../home/LiveNowCard';
import { LIVE_COPY } from '../../live/copy';
import type { ChQOnCourse } from './on-course';
import '../../styles/live.css';

/**
 * What a live qualifier adds above its leaderboard (4.7): the coach sees the players on the course, a player whose own round
 * is under way sees one line saying the board moves when it is posted (CH-16621). Nothing at all when nobody is out.
 */
export function LiveOnCourse({
  onCourse,
  qualifierId,
  day,
  coach,
  active,
  phone,
  now,
  frozen,
}: {
  onCourse: ChQOnCourse | undefined;
  qualifierId: string;
  day: string | null;
  coach: boolean;
  /** The qualifier is in progress. */
  active: boolean;
  phone: boolean;
  /** The preview and the tests: a fixed clock (epoch ms), and no polling. */
  now?: number;
  frozen?: boolean;
}) {
  if (!onCourse || !active) return null;
  if (coach) return <LiveNowCard variant="qualifier" initial={onCourse.snapshot} phone={phone} now={now} frozen={frozen} scope={{ qualifierId, day }} />;
  if (!onCourse.heldBack) return null;
  return (
    <p className="ch-lv-note" data-ch-code="CH-16621">
      {LIVE_COPY.standingsHeld}
    </p>
  );
}

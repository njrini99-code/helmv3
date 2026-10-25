'use client';

import { formatToPar } from '../../lib/format';
import { TourPlaceholder } from './TourPlaceholder';
import type { LiveRoundProps } from './types';
import '../../styles/tournaments-live.css';

/**
 * The live round, the centerpiece (plan 4.33, 5L): lanes per player, the counting line, the hole map, moments, enter
 * score and update field sheets; values change in place with the changed-wash, never rolling (D-100). `simulate`
 * replays a scripted feed in the preview. Coach only. Owned by the live lane (README.md). Placeholder until built.
 */
export function LiveRound({ data, load, phone }: LiveRoundProps) {
  return <TourPlaceholder view="live" eyebrow={data.event.name} title={`Round ${data.round.number}`} name="The live round" detail={`Team ${formatToPar(data.team.toPar)} · ${data.lanes.length} on the course`} load={load} phone={phone} />;
}

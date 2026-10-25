import { isOnCourse, type LiveLane, type LiveSnapshot } from '../../live/model';

/**
 * What the qualifier screens get from the live feed (4.7): the first-paint snapshot (this qualifier's lanes), the team the
 * coach topic belongs to, and whether the signed-in player has a round of their own on this qualifier under way, in which
 * case their board does not move until their round is posted (CH-16621) and they see no lanes.
 */
export interface ChQOnCourse {
  snapshot: LiveSnapshot;
  teamId: string;
  heldBack: boolean;
}

/** A player's round on this qualifier that is under way: on the course, or finished and not posted. */
export function isOwnRoundOn(lanes: readonly LiveLane[], playerId: string | null, qualifierId: string): boolean {
  if (!playerId) return false;
  return lanes.some((l) => l.playerId === playerId && l.qualifierId === qualifierId && (l.phase === 'on_course' || l.phase === 'finished'));
}

/** One line of the qualifier list: "Round 2 live · 3 on the course" (CH-16622). */
export interface ChQLiveLine {
  round: number;
  n: number;
}

/**
 * Per qualifier, how many players are on the course now and which round most of them are playing (ties: the later round).
 * Only lanes reporting in the last ten minutes count, the same rule as the Live view's "On the course".
 */
export function qualifierLiveLines(lanes: readonly LiveLane[], now: number): Record<string, ChQLiveLine> {
  const groups = new Map<string, LiveLane[]>();
  for (const l of lanes) {
    if (!l.qualifierId || l.roundType !== 'qualifier' || !isOnCourse(l, now)) continue;
    groups.set(l.qualifierId, [...(groups.get(l.qualifierId) ?? []), l]);
  }
  const out: Record<string, ChQLiveLine> = {};
  for (const [id, list] of groups) {
    const counts = new Map<number, number>();
    for (const l of list) counts.set(l.qualifierRound ?? 1, (counts.get(l.qualifierRound ?? 1) ?? 0) + 1);
    const [round] = [...counts.entries()].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]!;
    out[id] = { round, n: list.length };
  }
  return out;
}

import type { ChClassDay } from '../../data/class-day-shape';
import { classStatusFor, isInBlock } from '../../data/class-status';
import type { ChThreadClassDay } from './class-thread';
import type { ChConv, ChPerson } from './model';

/**
 * P-10 class awareness in a group thread (coach only): how many of the group's players are in a class or an exam right now.
 * Only players who are tracked, sharing and in a block count; a coach, an untracked player and one with no status do not, and
 * the line says nothing at 0. The day handed to the sheet is the team's day cut down to this group's players, so the sheet
 * can only ever show people who are in the group.
 */
export type ChGroupClass = {
  /** The team's class day, limited to this group's players. */
  day: ChClassDay;
  /** Players in the group. */
  total: number;
  /** In a class or an exam right now. */
  inClass: number;
  /** Players here with no class status (untracked: no schedule, or sharing off; coaches cannot tell which). */
  noStatus: number;
};

export function groupClass(
  cls: ChThreadClassDay | null | undefined,
  conv: Pick<ChConv, 'group' | 'memberIds'>,
  personOf: (userId: string) => Pick<ChPerson, 'role' | 'playerId'> | undefined,
): ChGroupClass | null {
  if (!conv.group || !cls?.day || cls.now == null) return null;
  if (cls.convTeamId == null || cls.convTeamId !== cls.teamId) return null;
  const ids = new Set(
    conv.memberIds.flatMap((id) => {
      const p = personOf(id);
      return p?.role === 'player' && p.playerId ? [p.playerId] : [];
    }),
  );
  if (ids.size === 0) return null;
  const players = cls.day.players.filter((p) => ids.has(p.playerId));
  const now = cls.now;
  const inClass = players.filter((p) => isInBlock(classStatusFor(p, now))).length;
  const tracked = players.filter((p) => p.tracked).length;
  return { day: { ...cls.day, players }, total: ids.size, inClass, noStatus: ids.size - tracked };
}

/** The line above the composer: "4 in class now", "All 11 in class now". No names: it sits under messages others may screenshot. */
export function groupClassLine(g: Pick<ChGroupClass, 'total' | 'inClass'>): string | null {
  if (g.inClass <= 0) return null;
  return g.inClass === g.total && g.total > 1 ? `All ${g.total} in class now` : `${g.inClass} in class now`;
}

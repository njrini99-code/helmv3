import type { ChClassDay, ChClassDayPlayer } from '../../data/class-day-shape';
import type { ChConv, ChPerson } from './model';

/**
 * P-10 class awareness in Messages: the coach's class day as the thread sees it. `day` and `now` come from the shared
 * cache (useTeamClassDay); `teamId` is the coach's team; `convTeamId` is the open conversation's own team, which must
 * match it (`undefined` while unknown, `null` for a conversation with no team: neither shows anything).
 */
export type ChThreadClassDay = {
  day: ChClassDay | null;
  now: number | null;
  teamId: string;
  convTeamId: string | null | undefined;
};

/**
 * The player a 1:1 thread's class line is about, or null: a direct thread, with a player who is on the coach's team,
 * in a conversation that belongs to that same team. Players never see a status (the api carries none for them), and a
 * group is handled by the group line, not the header.
 */
export function directClassPlayer(cls: ChThreadClassDay | null | undefined, conv: Pick<ChConv, 'group'>, other: Pick<ChPerson, 'role' | 'playerId'> | undefined): ChClassDayPlayer | null {
  if (!cls?.day || conv.group || other?.role !== 'player' || !other.playerId) return null;
  if (cls.convTeamId == null || cls.convTeamId !== cls.teamId) return null;
  return cls.day.players.find((p) => p.playerId === other.playerId) ?? null;
}

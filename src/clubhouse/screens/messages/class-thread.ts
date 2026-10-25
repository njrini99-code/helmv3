import type { ChClassDay, ChClassDayPlayer } from '../../data/class-day-shape';
import { classLabel, classStatusFor, classStatusText, windowRange, type ChStatusTextOptions } from '../../data/class-status';
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

/**
 * The Details panel's Class status block for a coach's 1:1 with a player (P-10): a primary line (the status and, in a block or just
 * before one, which class), today's blocks in order, and where this comes from. "No class status" and nothing else when the
 * player is not tracked. Class names show here because this panel is the coach's private view; the thread header never shows them.
 */
export type ChThreadClassSection = { primary: string | null; today: string | null; note: string | null };

export function threadClassSection(
  player: ChClassDayPlayer,
  now: number,
  opts: ChStatusTextOptions,
  first: string | null,
): ChThreadClassSection {
  if (!player.tracked) return { primary: 'No class status', today: null, note: null };
  const status = classStatusFor(player, now);
  const line = classStatusText(status, opts);
  const current =
    status.kind === 'in_class' || status.kind === 'exam'
      ? (status.island.blocks.find((b) => Date.parse(b.startsAt) <= now && now < Date.parse(b.endsAt)) ?? status.island.blocks[0])
      : status.kind === 'soon'
        ? status.island.blocks[0]
        : undefined;
  const primary = line ? (current ? `${line} · ${classLabel(current.label)}` : line) : 'No class right now';
  const blocks = [...player.blocks].sort((a, b) => Date.parse(a.startsAt) - Date.parse(b.startsAt));
  const today = blocks.length
    ? `Today: ${blocks.map((b) => `${classLabel(b.label)} ${windowRange(Date.parse(b.startsAt), Date.parse(b.endsAt), opts) ?? ''}`.trim()).join(' · ')}`
    : null;
  const who = first?.trim() ? `${first.trim()}’s` : 'their';
  return { primary, today, note: `From ${who} class schedule · ${player.holds ? 'pushes held during class' : 'pushes not held'}` };
}

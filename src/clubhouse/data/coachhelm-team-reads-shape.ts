/**
 * CoachHelm reads, the coach's team page (P013 `?view=team-reads`, flag `coachhelm_reads_v1`, the listed team): what the
 * team shares, said once; each part with its players, each player's own line under it; who improved; who has no read yet.
 * Pure shapes and a pure mapper, so the screen imports only types and constants from here.
 */
import type { TeamReadsPage } from '@/lib/coachhelm/v3/analyst/reads/team-page';
import { playerFileHref } from './coachhelm-views-shape';

export const TEAM_READS_VIEW = 'team-reads';
export const TEAM_READS_HREF = '/golf/dashboard/coachhelm?view=team-reads';

export interface ChTeamReadsPlayer {
  id: string;
  name: string;
  /** The coach's file on the player, at CoachHelm's read. */
  href: string;
  lost: string;
  certainty: string;
  distinct: string;
  exception: string | null;
}

export interface ChTeamReads {
  roster: number;
  playersRead: number;
  shared: string | null;
  sameCard: string;
  groups: Array<{ label: string; players: ChTeamReadsPlayer[] }>;
  improved: Array<{ id: string; name: string; href: string; text: string }>;
  waiting: Array<{ id: string; name: string; href: string; text: string }>;
}

export type ChTeamReadsLoad = { status: 'off' } | { status: 'failed' } | { status: 'ready'; data: ChTeamReads };

/** Players are named by the roster; a player the roster has no name for reads "A player". */
export function toChTeamReads(page: TeamReadsPage, names: ReadonlyMap<string, string>, roster: number): ChTeamReads {
  const who = (id: string) => ({ id, name: names.get(id) ?? 'A player', href: playerFileHref(id, { card: 'reads' }) });
  const byName = <T extends { name: string }>(a: T, b: T) => a.name.localeCompare(b.name);
  return {
    roster,
    playersRead: page.players_read,
    shared: page.shared?.text ?? null,
    sameCard: page.same_card.text,
    groups: page.groups.map((g) => ({ label: g.label, players: g.players.map((p) => ({ ...who(p.player_id), lost: p.lost_text, certainty: p.certainty_word, distinct: p.distinct, exception: p.exception })) })),
    improved: page.improved.map((x) => ({ ...who(x.player_id), text: x.text })).sort(byName),
    waiting: page.waiting.map((x) => ({ ...who(x.player_id), text: x.text })).sort(byName),
  };
}

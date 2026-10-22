import { toLibraryRound, type ChLibraryRound, type ChRoundListRow } from './rounds-shape';

/**
 * The coach's Team rounds list: the data shapes and the pure steps that build them, kept apart from the server loader
 * (data/team-rounds.ts) so the preview and tests use the same code the page does. A row is the player Rounds library's
 * row (`ChLibraryRound`, one total and one season rule) with the player it belongs to.
 */

export interface ChTeamRound extends ChLibraryRound {
  playerId: string;
  /** The player's name as the roster shows it. */
  player: string;
}

export type ChTeamRoundRow = ChRoundListRow & { player_id: string };

export interface ChTeamSeason {
  /** 18-hole countable rounds since 1 August. */
  rounds: number;
  /** Players with at least one of them. */
  players: number;
  avg: number | null;
  /** Rounds under par among them. */
  underPar: number;
  /** The best round by score to par, then by score; the lowest gross score when no round has a to-par. */
  best: { score: number; toPar: number | null; player: string; course: string; date: string } | null;
}

export interface ChTeamRounds {
  /** The team's name, for the page head; null when it did not load. */
  teamName: string | null;
  /** The season the figures cover starts here (yyyy-mm-dd). */
  seasonStart: string;
  /** `unscored`: completed rounds with no score at all, which the list can't draw and says so. Absent when none. */
  rounds: { list: ChTeamRound[]; error: boolean; unscored?: number };
  /** The roster read failed: the names (and so the list) are not trusted, and the page says so. */
  rosterError: boolean;
  /** Active players on the team, A to Z, for the filter. */
  players: Array<{ id: string; name: string }>;
  season: ChTeamSeason;
}

/** Newest first, as the loader reads them; a round whose player is not on the roster read is left out and counted. */
export function toTeamRounds(rows: readonly ChTeamRoundRow[], names: ReadonlyMap<string, string>): { list: ChTeamRound[]; unscored: number } {
  const list: ChTeamRound[] = [];
  let unscored = 0;
  for (const row of rows) {
    const round = toLibraryRound(row);
    if (!round) {
      unscored += 1;
      continue;
    }
    list.push({ ...round, playerId: row.player_id, player: names.get(row.player_id) ?? 'Unnamed player' });
  }
  list.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : a.id.localeCompare(b.id)));
  return { list, unscored };
}

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);

/** The team's season figures from the listed rounds: countable, 18 holes, since `since` (the rule the player's Rounds season uses). */
export function teamSeasonFrom(list: readonly ChTeamRound[], since: string): ChTeamSeason {
  const s = list.filter((r) => r.countable && r.holes === 18 && r.date >= since);
  const withPar = s.filter((r): r is ChTeamRound & { toPar: number } => r.toPar != null);
  // The low round is by score to par; a season with no to-par at all falls back to the lowest gross score, so the tile isn't blank.
  const best: ChTeamRound | null = withPar.length
    ? withPar.reduce((m, r) => (r.toPar < m.toPar || (r.toPar === m.toPar && r.score < m.score) ? r : m))
    : s.length
      ? s.reduce((m, r) => (r.score < m.score ? r : m))
      : null;
  return {
    rounds: s.length,
    players: new Set(s.map((r) => r.playerId)).size,
    avg: mean(s.map((r) => r.score)),
    underPar: withPar.filter((r) => r.toPar < 0).length,
    best: best ? { score: best.score, toPar: best.toPar ?? null, player: best.player, course: best.course, date: best.date } : null,
  };
}

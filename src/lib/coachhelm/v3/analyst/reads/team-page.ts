/**
 * CoachHelm reads, stage 2: the team page. What the team shares, said once; who is the exception; who improved.
 * Built from each player’s read (the priority and its signature) and the analyst’s good news. Coach only. Pure.
 */
import type { Notability } from '../notability';
import { MIN_TEAMMATES } from '../notability';
import { Figures, oneDecimal, whole } from './format';
import { PART_LABEL } from './words';
import type { PartId, ReadPayload } from './types';

export interface TeamPage {
  audience: 'coach_only';
  team_id: string;
  /** Players with a priority. Under five, the page says only that (a team read needs five). */
  players_read: number;
  /** "Approach costs the most for 5 of 7 players." Null with no part shared by most. */
  shared: { part: PartId; players: string[]; text: string } | null;
  /** Players whose priority is another part, or whose pattern is clear of the team. */
  exceptions: Array<{ player_id: string; text: string }>;
  /** Players whose part of the game got better against their own 10 rounds before (the analyst’s good news). */
  improved: Array<{ player_id: string; text: string }>;
  /** The largest share of players with the same priority at band and pattern level (the "same top card" count). */
  same_card_share: number;
  figures: Record<string, string>;
}

export const MIN_PLAYERS_FOR_TEAM_READ = MIN_TEAMMATES;

export function teamPage(teamId: string, payloads: readonly ReadPayload[], notables: readonly Notability[]): TeamPage {
  const f = new Figures();
  const withPriority = payloads.filter((p) => p.priority);
  const byPart = new Map<PartId, string[]>();
  for (const p of withPriority) byPart.set(p.priority!.area, [...(byPart.get(p.priority!.area) ?? []), p.player_id]);
  const top = [...byPart.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]))[0];
  const enough = withPriority.length >= MIN_PLAYERS_FOR_TEAM_READ;
  const shared = enough && top && top[1].length * 2 > withPriority.length
    ? { part: top[0], players: top[1], text: `${PART_LABEL[top[0]]} costs the most for ${f.put('shared_n', whole(top[1].length))} of ${f.put('players_read', whole(withPriority.length))} players. That is a team item, said once here.` }
    : null;
  const exceptions: TeamPage['exceptions'] = [];
  for (const p of withPriority) {
    const c = p.priority!;
    if (shared && c.area !== shared.part) exceptions.push({ player_id: p.player_id, text: `${c.area_label} costs this player the most, not ${PART_LABEL[shared.part].toLowerCase()}.` });
    else if (c.team?.value.differs && c.pattern) exceptions.push({ player_id: p.player_id, text: `Same part as the team, a different pattern: ${c.pattern.text}.` });
  }
  const improved: TeamPage['improved'] = [];
  for (const n of notables) {
    const better = n.good_news.filter((g) => g.measure_id.startsWith('strokes_gained_') && g.reasons.some((r) => r.rule === 'changed'));
    for (const g of better) improved.push({ player_id: n.player_id, text: `${g.label}: better than the player’s 10 rounds before.` });
  }
  const sigs = new Map<string, number>();
  for (const n of notables) if (n.priority) sigs.set(n.priority.where.signature, (sigs.get(n.priority.where.signature) ?? 0) + 1);
  const most = Math.max(0, ...sigs.values());
  return { audience: 'coach_only', team_id: teamId, players_read: withPriority.length, shared, exceptions, improved, same_card_share: withPriority.length ? most / withPriority.length : 0, figures: f.all };
}

/** One player on the team page, as their saved read says it. */
export interface TeamReadsPlayer {
  player_id: string;
  /** The part's own figure for this player: "1.4 a round". */
  lost_text: string;
  certainty_word: string;
  /** What is this player's own: one level down and the pattern (never the shared sentence again). */
  distinct: string;
  /** Another part than most of the team, or the same part with a different pattern. Null otherwise. */
  exception: string | null;
}

/**
 * The team page from the saved reads (`golf_coach_reads_current`), with no recompute. What most of the team shares is
 * said once at the top; then each part with its players, each with their own line (one level down and the pattern), so
 * no row repeats the shared sentence. Sized for a full roster (12 to 21 players): grouped by part, the biggest group
 * first, worst loss first inside it, and the players without a read yet listed apart. Coach only. Pure.
 */
export interface TeamReadsPage {
  audience: 'coach_only';
  players_read: number;
  shared: { part: PartId; text: string } | null;
  groups: Array<{ part: PartId; label: string; players: TeamReadsPlayer[] }>;
  improved: Array<{ player_id: string; text: string }>;
  waiting: Array<{ player_id: string; text: string }>;
  /** The largest group with the same card at part, distance and pattern level. */
  same_card: { n: number; of: number; text: string };
  figures: Record<string, string>;
}

type SavedRead = { payload: ReadPayload; signature: string | null };

export function teamReadsPage(rows: readonly SavedRead[]): TeamReadsPage {
  const f = new Figures();
  const read = rows.filter((r) => r.payload.priority);
  const byPart = new Map<PartId, SavedRead[]>();
  for (const r of read) byPart.set(r.payload.priority!.area, [...(byPart.get(r.payload.priority!.area) ?? []), r]);
  const ordered = [...byPart.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  const top = ordered[0];
  const enough = read.length >= MIN_PLAYERS_FOR_TEAM_READ;
  const shared =
    enough && top && top[1].length * 2 > read.length
      ? { part: top[0], text: `${PART_LABEL[top[0]]} costs the most for ${f.put('shared_n', whole(top[1].length))} of ${f.put('players_read', whole(read.length))} players. That is a team item, said once here; each player’s own line is below.` }
      : null;
  const groups = ordered.map(([part, list]) => ({
    part,
    label: PART_LABEL[part],
    players: [...list]
      .sort((a, b) => b.payload.priority!.numbers.lost_per_round - a.payload.priority!.numbers.lost_per_round || a.payload.player_id.localeCompare(b.payload.player_id))
      .map(({ payload: p }): TeamReadsPlayer => {
        const c = p.priority!;
        const gaining = c.numbers.lost_per_round <= 0;
        let exception: string | null = null;
        if (shared && c.area !== shared.part) exception = `Not ${PART_LABEL[shared.part].toLowerCase()}, as for most of the team.`;
        else if (c.team?.value.differs && c.pattern) exception = 'Same part as the team, a different pattern.';
        const lost_text = gaining ? `${p.figures.gain_per_round ?? oneDecimal(-c.numbers.lost_per_round)} a round gained` : `${p.figures.lost_per_round ?? oneDecimal(c.numbers.lost_per_round)} a round`;
        return { player_id: p.player_id, lost_text, certainty_word: c.certainty_word, distinct: c.where_text, exception };
      }),
  }));
  const improved = rows.flatMap((r) => (r.payload.memory?.improvement ? [{ player_id: r.payload.player_id, text: r.payload.memory.improvement }] : []));
  const waiting = rows.filter((r) => !r.payload.priority).map((r) => ({ player_id: r.payload.player_id, text: r.payload.missing?.text ?? 'Not enough rounds with every shot logged yet.' }));
  const sigs = new Map<string, number>();
  for (const r of read) {
    const c = r.payload.priority!;
    const s = r.signature ?? `${c.area}/${c.where.band ?? c.where.finding}/${c.pattern?.id ?? '-'}`;
    sigs.set(s, (sigs.get(s) ?? 0) + 1);
  }
  const most = Math.max(0, ...sigs.values());
  const text = most <= 1 ? 'No two players have the same card at the part, distance and pattern level.' : `The most players with the same card at the part, distance and pattern level: ${f.put('same_card_n', whole(most))} of ${f.put('same_card_of', whole(read.length))}.`;
  return { audience: 'coach_only', players_read: read.length, shared, groups, improved, waiting, same_card: { n: most, of: read.length, text }, figures: f.all };
}

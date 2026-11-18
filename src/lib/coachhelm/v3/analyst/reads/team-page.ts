/**
 * CoachHelm reads, stage 2: the team page. What the team shares, said once; who is the exception; who improved.
 * Built from each player’s read (the priority and its signature) and the analyst’s good news. Coach only. Pure.
 */
import type { Notability } from '../notability';
import { MIN_TEAMMATES } from '../notability';
import { Figures, whole } from './format';
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

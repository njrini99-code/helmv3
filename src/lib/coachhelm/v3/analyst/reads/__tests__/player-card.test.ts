import { describe, expect, it } from 'vitest';

import { buildTeamReads } from '../build';
import { focusRead } from '../focus';
import { decideNext } from '../memory';
import { forPlayer, isSuppressed } from '../player-card';
import type { ReadPayload } from '../types';
import { readsTeam } from './team';

/**
 * Stage 5: a player's own card carries nothing a player may not see: no coach-only block, no teammate figure, not the
 * coach's "not useful" or "wrong" (or its reason), and not the focus verdict (its drift is shrunk toward the team's
 * middle). It speaks to the player ("your"); the coach's card never does.
 */
const team = buildTeamReads(readsTeam().rows());
const withPriority = team.payloads.filter((p) => p.priority);

/** Every string in a payload, at any depth. */
function strings(v: unknown): string[] {
  if (typeof v === 'string') return [v];
  if (Array.isArray(v)) return v.flatMap(strings);
  if (v && typeof v === 'object') return Object.values(v).flatMap(strings);
  return [];
}

/** The read after a coach said "wrong", and with a focus set from it. */
function coachTouched(p: ReadPayload): ReadPayload {
  const suppressed = decideNext(p, p, { feedback: { card_key: p.priority!.key, verdict: 'wrong', reason: 'He was injured for three of those rounds', at: '2026-11-01T00:00:00Z', lost_per_round: p.priority!.numbers.lost_per_round, certainty: p.priority!.certainty, area: p.priority!.area } });
  const sheet = team.sheets.find((s) => s.player_id === p.player_id)!;
  const link = { card_key: p.priority!.key, part: p.priority!.area, set_on: '2026-01-01', value_on_day: 1.5, rounds_on_day: 6, team_lost_on_day: 0.9 };
  return { ...suppressed, focus: focusRead(link, sheet) };
}

describe('the player’s own card', () => {
  it('has the fixture a priority to test on', () => {
    expect(withPriority.length).toBeGreaterThan(0);
  });

  it('strips the coach’s verdict and reason, the focus verdict, the team block and every teammate figure', () => {
    for (const p of withPriority) {
      const touched = coachTouched(p);
      expect(touched.memory?.suppressed).not.toBeNull();
      const mine = forPlayer(touched);
      const text = JSON.stringify(mine);
      expect(mine.memory?.suppressed ?? null).toBeNull();
      expect(mine.focus).toBeUndefined();
      expect(text).not.toContain('expected_without_focus');
      expect(text).not.toContain('injured');
      expect(text).not.toContain('coach_only');
      expect(text).not.toContain('part_team_lost');
      expect(mine.priority?.team ?? null).toBeNull();
      expect(Object.keys(mine.figures).filter((k) => /^(team_|teammates)/.test(k))).toEqual([]);
      expect(mine.memory?.history ?? []).toEqual([]);
    }
  });

  it('a read the coach marked down is not shown to the player at all', () => {
    for (const p of withPriority) {
      expect(isSuppressed(coachTouched(p))).toBe(true);
      expect(isSuppressed(p)).toBe(false);
    }
  });

  it('speaks to the player; the coach’s card never says "you" or "your"', () => {
    for (const p of withPriority) {
      const mine = forPlayer(p);
      expect(mine.priority!.how_we_found[0]).toMatch(/^We compared your four parts/);
      expect(strings(forPlayer(p)).join(' ')).not.toMatch(/\bthis player\b|\bthe player’s\b|\bthe player's\b/i);
      const coach = [p.priority!.headline, p.priority!.where_text, ...p.priority!.how_we_found, p.priority!.what_would_change, p.priority!.team?.value.text ?? ''];
      for (const s of coach) expect(s, s).not.toMatch(/\byou\b|\byour\b|\byou’re\b/i);
    }
  });

  it('the coach’s card keeps the teammates’ middle loss in the part, coach-only, for the focus verdict', () => {
    const withTeam = withPriority.filter((p) => p.priority!.team);
    expect(withTeam.length).toBeGreaterThan(0);
    for (const p of withTeam) expect(typeof p.priority!.team!.value.part_team_lost).toBe('number');
  });
});

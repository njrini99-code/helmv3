import { describe, expect, it } from 'vitest';
import { TeamFixture, tenRounds } from '../../__tests__/fixtures';
import { buildTeamReads } from '../build';
import { Figures, numbersIn } from '../format';
import { forPlayer } from '../player-card';
import { freshnessText, missingText, roundsToSettle } from '../words';
import type { ReadPayload } from '../types';
import { readsTeam } from './team';

/** Every user-visible sentence of a payload (the coach's view). */
function sentences(p: ReadPayload): string[] {
  const out = [p.freshness.through_text, ...(p.freshness.stale_text ? [p.freshness.stale_text] : [])];
  if (p.missing) out.push(p.missing.text);
  if (p.priority) {
    const c = p.priority;
    out.push(c.headline, c.where_text, ...c.how_we_found, c.what_would_change);
    if (c.pattern) out.push(c.pattern.text);
    if (c.team) out.push(c.team.value.text);
  }
  return out;
}

const payloads = buildTeamReads(readsTeam().rows()).payloads;

describe('the words on a card', () => {
  it('every player gets a priority card with three "how we found this" sentences and a "what would change" line', () => {
    expect(payloads).toHaveLength(7);
    for (const p of payloads) {
      expect(p.priority).not.toBeNull();
      expect(p.priority!.how_we_found).toHaveLength(3);
      for (const s of p.priority!.how_we_found) expect(s).toMatch(/\.$/);
      expect(p.priority!.what_would_change.length).toBeGreaterThan(20);
      expect(p.missing).toBeNull();
    }
  });

  it('every number in the text is a number in the payload', () => {
    for (const p of payloads) {
      const allowed = new Set(Object.values(p.figures).flatMap(numbersIn));
      for (const s of sentences(p)) for (const n of numbersIn(s)) expect(allowed, `${n} in "${s}"`).toContain(n);
    }
  });

  it('every figure matches the raw number behind it', () => {
    for (const p of payloads) {
      const c = p.priority!;
      expect(p.figures.lost_per_round).toBe((Math.round(c.numbers.lost_per_round * 10) / 10).toFixed(1).replace('-0.0', '0.0'));
      expect(p.figures.rounds).toBe(String(c.numbers.rounds));
      expect(p.figures.shots).toBe(String(c.numbers.shots));
      if (c.pattern) {
        expect(p.figures.pattern_count).toBe(String(c.pattern.count));
        expect(p.figures.pattern_of).toBe(String(c.pattern.of));
      }
    }
  });

  it('uses plain words: no em dashes, no "SG", no "GIR"', () => {
    for (const p of payloads) {
      for (const s of sentences(p)) {
        expect(s).not.toMatch(/—/);
        expect(s).not.toMatch(/\bSG\b|\bGIR\b|strokes gained/);
      }
    }
  });

  it('names what is missing when there is no priority', () => {
    const fx = new TeamFixture().player('short', tenRounds(2, { tee: -1, approach: -2, around: -1, putting: -1 }).slice(0, 3));
    const [p] = buildTeamReads(fx.rows()).payloads;
    expect(p!.priority).toBeNull();
    expect(p!.missing).toEqual({ text: 'Needs 5 rounds with every shot logged this season; has 3.', needs: 5, has: 3 });
    const f = new Figures();
    expect(missingText('no spread to test with this season', f).text).toMatch(/do not vary/);
  });

  it('says how fresh it is, and goes stale after three weeks', () => {
    const f = new Figures();
    expect(freshnessText('2026-10-13', 12, '2026-10-20', f)).toEqual({ through_text: 'Through 13 Oct, 12 rounds', stale_text: null });
    expect(freshnessText('2026-10-13', 12, '2026-11-03', f).stale_text).toBe('No new rounds since 13 Oct.');
    expect(freshnessText(null, 0, '2026-11-03', f).through_text).toBe('No rounds this season yet');
  });

  it('works out how many more rounds would settle a read from its range', () => {
    // n = 10, mean 0.5, half-width 0.5: 10 × 1² = 10 rounds in all, 0 more; half-width 1: 40 in all, 30 more.
    expect(roundsToSettle(10, 0.5, 0.5)).toBe(0);
    expect(roundsToSettle(10, -0.5, 1)).toBe(30);
    expect(roundsToSettle(10, 0, 1)).toBeNull();
  });

  it('a teammate figure appears only in the coach-only block', () => {
    const withTeam = payloads.filter((p) => p.priority?.team);
    expect(withTeam.length).toBeGreaterThan(0);
    for (const p of withTeam) {
      expect(p.priority!.team!.audience).toBe('coach_only');
      const shared = [p.priority!.headline, p.priority!.where_text, ...p.priority!.how_we_found, p.priority!.what_would_change].join(' ');
      expect(shared).not.toMatch(/team/i);
    }
  });

  it('the player\'s version has no team block and no teammate figure', () => {
    for (const p of payloads) {
      const mine = forPlayer(p);
      expect(mine.priority?.team ?? null).toBeNull();
      expect(JSON.stringify(mine)).not.toMatch(/coach_only|teammate|team_pattern_median|team_difference/);
    }
  });
});

import { describe, expect, it } from 'vitest';
import type { EvidenceInsight } from '@/app/golf/actions/insight-delivery';
import { toChDeepInsight } from '../data/coachhelm-dive-shape';
import { toChInsight } from '../data/coachhelm-map';
import { readLines } from '../data/coachhelm-read-shape';
import { speak, type ChViewer } from '../data/coachhelm-voice';
import { PREVIEW_TOUR } from '../preview/fixtures-coachhelm';
import { DIVE_PENALTIES, DIVE_PENALTIES_TEAM, FULL_INPUTS } from '../preview/fixtures-coachhelm-views';

/**
 * Slice 7a: a coach's Read says the team pool in its What line when the row carries one (written only with coachhelm_team_pool_v1 on).
 * A player's never does (owner rule, 10 Nov 2026: the team pool is the coach's): theirs keeps the comparison the card draws.
 */

const PLAYER: ChViewer = { role: 'player' };
const COACH: ChViewer = { role: 'coach', first: 'Jonah' };

function lines(raw: EvidenceInsight, viewer: ChViewer = PLAYER) {
  const say = (t: string) => speak(t, viewer);
  const base = toChInsight(raw, { drillText: null, tour: PREVIEW_TOUR, newestRound: null, viewer });
  return readLines(toChDeepInsight(raw, base, FULL_INPUTS, say, viewer.role).read, 'Tour', say, viewer.role);
}

describe('the Read: the team line', () => {
  it('says "Team pool 0.6 a round (212 rounds)" to a coach, in place of the Tour comparison', () => {
    const what = lines(DIVE_PENALTIES_TEAM, COACH).what;
    expect(what).toContain('Team pool 0.6 a round (212 rounds).');
    expect(what).not.toMatch(/Compared with/);
  });

  it('only the comparison changes: every other part of the What line and the other three lines are as before', () => {
    const before = lines(DIVE_PENALTIES, COACH);
    const after = lines(DIVE_PENALTIES_TEAM, COACH);
    // The sentence ends at a stop followed by a space ("Tour 0.3." holds a decimal point).
    const comparison = /Compared with .*?\.(?:\s|$)/;
    expect(before.what).toMatch(comparison);
    expect(after.what.replace('Team pool 0.6 a round (212 rounds). ', '')).toBe(before.what.replace(comparison, ''));
    expect(after.why).toBe(before.why);
    expect(after.next).toBe(before.next);
    expect(after.when).toBe(before.when);
  });

  it("a coach's rendering names no teammate", () => {
    const what = lines(DIVE_PENALTIES_TEAM, COACH).what;
    expect(what).toContain('Team pool 0.6 a round (212 rounds).');
    expect(what).not.toMatch(/Jonah|Eli|Priya|Theo/);
  });

  it('a player never gets the pool sentence: their read is word for word the read without a team line', () => {
    const mine = lines(DIVE_PENALTIES_TEAM, PLAYER);
    expect(JSON.stringify(mine)).not.toMatch(/Team pool|team pool|212 rounds|teammate/);
    expect(mine).toEqual(lines(DIVE_PENALTIES, PLAYER));
    expect(mine.what).toMatch(/Compared with/);
    // The shape handed to the player's client holds none of it either, not only the line that is drawn.
    const base = toChInsight(DIVE_PENALTIES_TEAM, { drillText: null, tour: PREVIEW_TOUR, newestRound: null, viewer: PLAYER });
    const read = toChDeepInsight(DIVE_PENALTIES_TEAM, base, FULL_INPUTS, (t) => speak(t, PLAYER), 'player').read;
    expect(JSON.stringify(read)).not.toMatch(/Team pool|212 rounds/);
  });

  it('a row without the team line (the flag off) reads exactly as it did', () => {
    const { comparison: _c, ...rest } = DIVE_PENALTIES_TEAM.evidence;
    void _c;
    expect(lines({ ...DIVE_PENALTIES_TEAM, evidence: rest as EvidenceInsight['evidence'] })).toEqual(lines(DIVE_PENALTIES));
  });
});

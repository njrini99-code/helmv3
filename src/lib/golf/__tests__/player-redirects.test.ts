import { describe, expect, it } from 'vitest';
import { golfPlayerRedirect, isGolfPlayerOnly } from '@/lib/golf/player-redirects';

describe('golfPlayerRedirect (PMAC-11)', () => {
  it('sends a player off the coach-only pages before they render', () => {
    expect(golfPlayerRedirect('/golf/dashboard/whats-new')).toBe('/golf/dashboard');
    expect(golfPlayerRedirect('/golf/dashboard/live/')).toBe('/golf/dashboard');
    expect(golfPlayerRedirect('/golf/dashboard/team')).toBe('/golf/dashboard/settings?section=golf');
    expect(golfPlayerRedirect('/golf/dashboard/coachhelm/chat')).toBe('/golf/dashboard/coachhelm');
  });

  it("sends a player from Practice's coach pages to their own Practice, and from the builder to the plan", () => {
    for (const p of ['drills', 'drills/abc', 'groups', 'templates', 'format', 'print/abc']) {
      expect(golfPlayerRedirect(`/golf/dashboard/practice/${p}`)).toBe('/golf/dashboard/practice');
    }
    expect(golfPlayerRedirect('/golf/dashboard/practice/plan/p1/edit')).toBe('/golf/dashboard/practice/plan/p1');
  });

  it('leaves every shared page alone', () => {
    for (const p of [
      '/golf/dashboard',
      '/golf/dashboard/practice',
      '/golf/dashboard/practice/plan/p1',
      '/golf/dashboard/coachhelm',
      '/golf/dashboard/live-feed',
      '/golf/dashboard/whats-new-x',
      '/golf/dashboard/rounds/new',
      '/golf/dashboard/roster',
      '/golf/dashboard/practice/drills/a/b',
    ]) {
      expect(golfPlayerRedirect(p)).toBeNull();
    }
  });
});

describe('isGolfPlayerOnly', () => {
  it('is true only for a player row with no coach row', () => {
    expect(isGolfPlayerOnly({ coach: null, player: { id: 'p' } })).toBe(true);
    expect(isGolfPlayerOnly({ coach: { id: 'c' }, player: { id: 'p' } })).toBe(false);
    expect(isGolfPlayerOnly({ coach: { id: 'c' }, player: null })).toBe(false);
    expect(isGolfPlayerOnly({ coach: null, player: null })).toBe(false);
  });
});

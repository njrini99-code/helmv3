/**
 * PR #2007 review: "Add one test that exercises the real
 * computeComparableOpportunities with a fake-client loadPlayerContext for
 * the open-window case." Deliberately does NOT `vi.mock` `context/
 * load-player-context` or `evaluation/comparable-opportunities` — this file
 * proves the follow-up-window-open short-circuit against the REAL
 * `loadPlayerContext` and `computeComparableOpportunities`, not a stand-in
 * for them (unlike `comparable-attribute.test.ts`'s own suite, which mocks
 * both wholesale to isolate this module's orchestration).
 *
 * The fake Supabase client below implements ONLY `golf_insight_exposure`
 * (mirroring `load-player-context.test.ts`'s own fake-client convention) and
 * THROWS for any other table. If `computeComparableAttribution` ever
 * regressed and called the real `loadPlayerContext` for an open-window
 * candidate, this test would fail loudly (a thrown "Unexpected table:
 * golf_rounds" surfacing as a rejected promise) instead of silently passing
 * on a stubbed-out shot list.
 */

import { describe, it, expect, vi } from 'vitest';
import { computeComparableAttribution } from './comparable-attribute';

describe('computeComparableAttribution — real core, open-window short-circuit', () => {
  it('never reaches the real loadPlayerContext/computeComparableOpportunities when the follow-up window is still open', async () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(new Date('2026-09-23T00:00:00.000Z'));
      // Shown 3 days ago: a 21-day follow-up window has 18 days left.
      const shownAt = '2026-09-20T00:00:00.000Z';

      const exposureBuilder = {
        select: vi.fn().mockReturnThis(),
        eq: vi.fn().mockReturnThis(),
        order: vi.fn().mockReturnThis(),
        limit: vi.fn().mockReturnThis(),
        maybeSingle: vi.fn().mockResolvedValue({ data: { shown_at: shownAt }, error: null }),
      };
      const client = {
        from: vi.fn((table: string) => {
          if (table === 'golf_insight_exposure') return exposureBuilder;
          // Any real `loadPlayerContext` call would hit `golf_rounds` first
          // — throwing here is the point: it turns a silent regression into
          // a loud test failure instead of a passing test built on stubbed
          // shot data.
          throw new Error(`Unexpected table: ${table} — loadPlayerContext should never be reached`);
        }),
      };

      const result = await computeComparableAttribution(
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        client as any,
        {
          insight_id: 'insight-1',
          player_id: 'player-1',
          target_metric_id: 'approach_proximity_125_175ft',
        },
      );

      expect(result).toEqual({ ok: false, reason: 'follow-up-window-open' });
      // Only the exposure lookup ran — nothing else was ever queried.
      expect(client.from).toHaveBeenCalledTimes(1);
      expect(client.from).toHaveBeenCalledWith('golf_insight_exposure');
    } finally {
      vi.useRealTimers();
    }
  });
});

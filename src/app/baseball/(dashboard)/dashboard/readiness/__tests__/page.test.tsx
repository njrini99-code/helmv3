// =============================================================================
// PlayerReadinessPage — team-local "today" regression (Coherence Ruling 4).
//
// Before the fix, `today` was `new Date().toISOString().slice(0, 10)` — the
// SERVER's UTC day — while the readiness GATE the player later sees on
// /player/today (player-today.ts:534, `day = forDate ?? todayIsoInTz(teamTz)`)
// compares against the TEAM-LOCAL day. A West Coast player checking in at
// 9pm PT wrote/prefilled against the UTC date (already "tomorrow"), which
// silently mismatched the gate's team-local date — the check-in looked like
// it belonged to the wrong day, or a same-day revisit failed to prefill.
//
// This test pins a real evening-US instant (9pm PT, which is already past
// midnight UTC — the exact case contract-day.test.ts validates for
// `todayIsoInTz`) and asserts the page now resolves the SAME team-local date
// the readiness gate uses, by calling the real (unmocked) contract-day
// helpers — only the Supabase row backing `resolveTeamTimezone` is faked.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';

vi.mock('@/components/baseball/performance/PlayerReadinessClient', () => ({
  PlayerReadinessClient: () => null,
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    activeTeamId: 'team-1',
    activeRole: 'player',
    activePlayerId: 'player-1',
  })),
}));

// Lift Lab context resolves to null so the checkin-prefill branch (which
// needs a much larger Supabase mock) is skipped — this test is scoped to the
// `today` date derivation, not the prefill query.
vi.mock('@/lib/lifting/resolve-baseball-context', () => ({
  resolveBaseballLiftingOrg: vi.fn(async () => null),
  resolveMyBaseballAthleteId: vi.fn(async () => null),
}));

// The ONLY Supabase call this page makes when liftCtx is null is the
// `baseball_teams.timezone` lookup inside resolveTeamTimezone (real,
// unmocked implementation below) — fake just that row.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => {
      if (table !== 'baseball_teams') {
        throw new Error(`unexpected table in test double: ${table}`);
      }
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({ data: { timezone: 'America/Los_Angeles' } }),
          }),
        }),
      };
    },
  })),
}));

// Deliberately NOT mocking '@/lib/baseball/daily-contract/contract-day' —
// this test exercises the REAL todayIsoInTz/resolveTeamTimezone so it fails
// if either the page or the read-model ever regress to a server-UTC slice.
import { todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';

import PlayerReadinessPage from '../page';
import { PlayerReadinessClient } from '@/components/baseball/performance/PlayerReadinessClient';

describe('PlayerReadinessPage — team-local today (evening US timestamp)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('resolves the team-local date, not the server UTC date, for a 9pm PT check-in', async () => {
    // 2026-06-24T04:00:00Z is 2026-06-23 21:00 PDT (UTC-7) — 9pm Pacific,
    // already the NEXT day in UTC. The pre-fix `new Date().toISOString()
    // .slice(0,10)` would resolve '2026-06-24'; team-local must be '2026-06-23'.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T04:00:00Z'));

    const element = await PlayerReadinessPage();

    // Same helper + same tz + same instant as the readiness gate in
    // player-today.ts:534 (`todayIsoInTz(teamTz)`) — equality here is the
    // gate/page agreement the ruling requires, not a coincidence of mocking.
    const expectedTeamLocalToday = todayIsoInTz('America/Los_Angeles', new Date());

    expect(expectedTeamLocalToday).toBe('2026-06-23');

    // The page wraps PlayerReadinessClient in a layout <div> — unwrap one level.
    const inner = (element.props as { children: { type: unknown; props: unknown } })
      .children;
    expect(inner.type).toBe(PlayerReadinessClient);
    expect((inner.props as { checkDate: string }).checkDate).toBe(
      expectedTeamLocalToday,
    );
    expect((inner.props as { checkDate: string }).checkDate).not.toBe('2026-06-24');
  });
});

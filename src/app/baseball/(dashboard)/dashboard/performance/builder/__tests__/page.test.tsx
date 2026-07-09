// =============================================================================
// LiftBuilderPage — team-local "today"/"weekOf" regression.
//
// Mirrors the readiness page's team-local-date regression test
// (readiness/__tests__/page.test.tsx). The same UTC-vs-team-local bug class
// (deriving the day from server UTC instead of `resolveTeamTimezone` +
// `todayIsoInTz`) required fixing across this cohort — readiness page,
// player-today-lift.ts, PerformanceDashboardClient/PlayerLiftToday, and this
// builder page — but only the readiness page had a test locking in the fix.
// `getGroupSorenessFlags(scope, today)` and `getGroupAvailability(scope,
// weekOf)` both depend on this anchoring; this test pins an evening-US
// instant and asserts both read-models are invoked with the TEAM-LOCAL date
// (and its Monday), never the server's UTC date.
// =============================================================================

import { describe, it, expect, vi, afterEach } from 'vitest';
import { render } from '@testing-library/react';

import { createFakeSupabase } from '@/test/fixtures/fake-supabase';

// Spy on what the client actually receives (user-visible state), not the
// page's raw JSX shape.
const builderClientMock = vi.hoisted(() => vi.fn((_props: unknown) => null));

vi.mock('@/components/baseball/performance/LiftBuilderClient', () => ({
  LiftBuilderClient: (props: unknown) => builderClientMock(props),
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    activeTeamId: 'team-1',
    activeRole: 'coach',
    activePlayerId: null,
  })),
}));

vi.mock('@/lib/baseball/capabilities', () => ({
  resolveBaseballCapabilities: vi.fn(async () => ({ can_manage_lifting: true })),
}));

// Read-model calls are spied on directly so this test can assert on the
// EXACT `date` / `weekOf` arguments the page passed in, without needing to
// fake the much larger helm_lifting_* + resolveBaseballLiftingOrg chain each
// read-model queries internally.
const getBuilderExerciseLibraryMock = vi.hoisted(() => vi.fn(async (_teamId: string) => []));
const getGroupSorenessFlagsMock = vi.hoisted(() =>
  vi.fn(async (_scope: unknown, _date: string) => []),
);
const getGroupAvailabilityMock = vi.hoisted(() =>
  vi.fn(async (_scope: unknown, _weekOf: string) => []),
);

vi.mock('@/lib/baseball/read-models/lift-builder', () => ({
  getBuilderExerciseLibrary: getBuilderExerciseLibraryMock,
  getGroupSorenessFlags: getGroupSorenessFlagsMock,
  getGroupAvailability: getGroupAvailabilityMock,
}));

// The ONLY direct Supabase call this page makes is the `baseball_teams.
// timezone` lookup inside resolveTeamTimezone (real, unmocked below) plus a
// light `helm_lifting_groups` list read — both covered by the shared
// fake-supabase fixture.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () =>
    createFakeSupabase({
      tables: {
        baseball_teams: [{ id: 'team-1', timezone: 'America/Los_Angeles' }],
        helm_lifting_groups: [],
      },
    }),
  ),
}));

// Deliberately NOT mocking '@/lib/baseball/daily-contract/contract-day' —
// this test exercises the REAL todayIsoInTz/resolveTeamTimezone so it fails
// if the page ever regresses to a server-UTC slice.
import { todayIsoInTz } from '@/lib/baseball/daily-contract/contract-day';

import LiftBuilderPage from '../page';

describe('LiftBuilderPage — team-local today/weekOf (evening US timestamp)', () => {
  afterEach(() => {
    vi.useRealTimers();
    builderClientMock.mockClear();
    getBuilderExerciseLibraryMock.mockClear();
    getGroupSorenessFlagsMock.mockClear();
    getGroupAvailabilityMock.mockClear();
  });

  it('anchors the soreness/availability reads to the team-local date, not server UTC', async () => {
    // 2026-06-24T04:00:00Z is 2026-06-23 21:00 PDT (UTC-7) — 9pm Pacific,
    // already the NEXT day in UTC. The pre-fix server-UTC slice would resolve
    // '2026-06-24' (a Wednesday); team-local must be '2026-06-23' (a Tuesday),
    // whose Monday is '2026-06-22'.
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-24T04:00:00Z'));

    const expectedTeamLocalToday = todayIsoInTz('America/Los_Angeles', new Date());
    expect(expectedTeamLocalToday).toBe('2026-06-23');
    const expectedWeekOf = '2026-06-22';

    const element = await LiftBuilderPage();
    render(element);

    expect(getGroupSorenessFlagsMock).toHaveBeenCalledTimes(1);
    expect(getGroupSorenessFlagsMock.mock.calls[0]?.[1]).toBe(expectedTeamLocalToday);
    expect(getGroupSorenessFlagsMock.mock.calls[0]?.[1]).not.toBe('2026-06-24');

    expect(getGroupAvailabilityMock).toHaveBeenCalledTimes(1);
    expect(getGroupAvailabilityMock.mock.calls[0]?.[1]).toBe(expectedWeekOf);
    expect(getGroupAvailabilityMock.mock.calls[0]?.[1]).not.toBe('2026-06-25'); // Monday of the wrong UTC day

    // The props the client actually renders with must reflect the same
    // team-local weekOf, not a server-UTC-derived one.
    expect(builderClientMock).toHaveBeenCalledTimes(1);
    const props = builderClientMock.mock.calls[0]?.[0] as { weekOf: string };
    expect(props.weekOf).toBe(expectedWeekOf);
  });
});

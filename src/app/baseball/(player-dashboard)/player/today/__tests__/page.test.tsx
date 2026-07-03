// =============================================================================
// PlayerTodayPage — performance check-in slot: log (not silently swallow)
// unexpected lifting-access failures, and thread the team-local date through.
//
// Before the fix, getPlayerSorenessToday/getPlayerBodyweightHistory failures
// were caught with `.catch(() => null)` — a genuine regression (e.g. the
// access-gate bug that denied every athlete) was completely invisible. Also
// asserts performanceSlot.todayIso carries the server-resolved team-local
// date so SorenessCheckCard can be wired to it instead of computing UTC.
//
// Follow-up (Incident B, 399 CI warning events): a LiftingForbiddenError
// ("no Lift Lab access") is an EXPECTED degradation path for a player with
// no lifting org/canView grant — not an incident worth logging on every
// render. Only genuinely unexpected failures should still be logged.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

// PlayerTodayPage is a server component: it RETURNS a React element
// (`<PlayerTodayClient .../>`) rather than invoking PlayerTodayClient as a
// function — React only calls component functions when actually rendered.
// So we don't need to render anything here; we just inspect the returned
// element's props directly, mirroring how the sibling layout.test.tsx
// asserts against LabShell's element props.
vi.mock('@/components/baseball/player-today/PlayerTodayClient', () => ({
  PlayerTodayClient: () => null,
}));
vi.mock('@/components/baseball/player-today/PlayerTodayTeamless', () => ({
  PlayerTodayTeamless: () => null,
}));

vi.mock('@/lib/baseball/active-context', () => ({
  getActiveBaseballContext: vi.fn(async () => ({
    activeTeamId: 'team-1',
    activeRole: 'player',
  })),
}));

vi.mock('@/lib/baseball/read-models/player-today', () => ({
  getPlayerToday: vi.fn(async () => ({ authorized: true })),
}));
vi.mock('@/lib/baseball/read-models/player-daily-contract', () => ({
  getPlayerDailyContract: vi.fn(async () => ({ authorized: true })),
}));
vi.mock('@/lib/baseball/read-models/player-passport', () => ({
  getPlayerPassport: vi.fn(async () => ({ authorized: true })),
}));
vi.mock('@/lib/baseball/daily-contract/contract-day', () => ({
  resolveTeamTimezone: vi.fn(async () => 'America/New_York'),
  todayIsoInTz: vi.fn(() => '2026-07-04'),
}));
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/lifting/resolve-baseball-context', () => ({
  resolveBaseballLiftingOrg: vi.fn(async () => ({ organizationId: 'org-1' })),
  resolveMyBaseballAthleteId: vi.fn(async () => 'athlete-1'),
}));

const getPlayerSorenessTodayMock = vi.fn(async (..._args: unknown[]): Promise<unknown> => null);
vi.mock('@/app/lifting/actions/soreness', () => ({
  getPlayerSorenessToday: (...args: unknown[]) => getPlayerSorenessTodayMock(...args),
}));

const getPlayerBodyweightHistoryMock = vi.fn(async (..._args: unknown[]) => ({
  pendingRequestId: null,
  pendingDueDate: null,
}));
vi.mock('@/app/lifting/actions/weight-checkins', () => ({
  getPlayerBodyweightHistory: (...args: unknown[]) => getPlayerBodyweightHistoryMock(...args),
}));

vi.mock('@/app/lifting/actions/nutrition', () => ({
  getPlayerNutritionPlans: vi.fn(async () => []),
}));

const logServerExceptionMock = vi.fn(async (..._args: unknown[]) => undefined);
vi.mock('@/lib/server-error-logger', () => ({
  logServerException: (...args: unknown[]) => logServerExceptionMock(...args),
}));

import PlayerTodayPage from '../page';
import { PlayerTodayClient } from '@/components/baseball/player-today/PlayerTodayClient';

describe('PlayerTodayPage — performance check-in slot error handling', () => {
  beforeEach(() => {
    getPlayerSorenessTodayMock.mockReset();
    logServerExceptionMock.mockClear();
  });

  it('LOGS (does not silently swallow) an unexpected getPlayerSorenessToday failure', async () => {
    const unexpected = new Error('Database connection reset');
    getPlayerSorenessTodayMock.mockRejectedValue(unexpected);

    const element = await PlayerTodayPage();

    expect(logServerExceptionMock).toHaveBeenCalledWith(
      unexpected,
      expect.objectContaining({ action: 'getPlayerSorenessToday' }),
      'warning',
    );
    // The page must still render — a lifting failure never breaks the
    // baseball Today page.
    expect(element.type).toBe(PlayerTodayClient);
  });

  it('does NOT log a LiftingForbiddenError — "no Lift Lab access" is an expected degradation, not an incident', async () => {
    const forbidden = new Error('You do not have access to this Lifting Lab.');
    forbidden.name = 'LiftingForbiddenError';
    getPlayerSorenessTodayMock.mockRejectedValue(forbidden);

    const element = await PlayerTodayPage();

    expect(logServerExceptionMock).not.toHaveBeenCalled();
    // A player without Lift Lab access gets the existing honest empty state
    // (performanceSlot stays null) rather than an error cascade.
    expect(element.type).toBe(PlayerTodayClient);
    expect(
      (element.props as { performanceSlot: unknown }).performanceSlot,
    ).toBeNull();
  });

  it('does NOT log when the soreness fetch succeeds, and passes the resolved todayIso through the slot', async () => {
    getPlayerSorenessTodayMock.mockResolvedValue({
      request: { id: 'req-1' },
      checkin: null,
    });

    const element = await PlayerTodayPage();

    expect(logServerExceptionMock).not.toHaveBeenCalled();
    expect(element.type).toBe(PlayerTodayClient);
    expect(
      (element.props as { performanceSlot: Record<string, unknown> }).performanceSlot,
    ).toMatchObject({
      orgId: 'org-1',
      athleteId: 'athlete-1',
      todayIso: '2026-07-04',
    });
  });
});

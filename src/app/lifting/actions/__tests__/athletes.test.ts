// =============================================================================
// src/app/lifting/actions/__tests__/athletes.test.ts
//
// GUARD (Team C fix, 2026-07-29): the Athletes page "Sync Athletes" button
// called this action, which called the sync RPC with the wrong parameter
// name and NEVER checked the RPC's error — so it reported
// `{ success: true }` on every call while inserting zero rows (a
// false-success toast over a genuine no-op). The fix makes this a thin
// delegate to the real, fixed org-wide sync in ./assignments.ts. These tests
// pin: (1) the delegate is actually invoked with the right shape, (2) a
// delegate success/failure result passes through unchanged rather than
// being upgraded to a fixed string, and (3) a THROWN error from the
// withLiftingAction-wrapped delegate (which this action's only caller,
// AthleteRosterClient.tsx, does not try/catch) is normalized to a returned
// failure instead of an unhandled rejection.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const delegateMock = vi.fn();

vi.mock('../assignments', () => ({
  syncOrgAthletes: (...args: unknown[]) => delegateMock(...args),
}));

import { syncOrgAthletes } from '@/app/lifting/actions/athletes';

describe('syncOrgAthletes (athletes.ts delegator)', () => {
  beforeEach(() => {
    delegateMock.mockReset();
  });

  it('delegates to the real assignments.ts implementation with { orgId }', async () => {
    delegateMock.mockResolvedValue({ success: true, athleteCount: 3, syncedCount: 3, teamsSynced: 1 });

    const result = await syncOrgAthletes('org-1');

    expect(delegateMock).toHaveBeenCalledWith({ orgId: 'org-1' });
    expect(result).toEqual({ success: true, athleteCount: 3, syncedCount: 3, teamsSynced: 1 });
  });

  it('passes a genuine no-op sync (zero rows) straight through — never upgrades it to a bare success message', async () => {
    delegateMock.mockResolvedValue({ success: true, athleteCount: 0, syncedCount: 0, teamsSynced: 0 });

    const result = await syncOrgAthletes('org-1');

    expect(result.success).toBe(true);
    expect(result.syncedCount).toBe(0);
  });

  it('passes a real failure through as success: false with an actionable error', async () => {
    delegateMock.mockResolvedValue({ success: false, error: 'Could not sync athletes. Please try again.' });

    const result = await syncOrgAthletes('org-1');

    expect(result.success).toBe(false);
    expect(result.error).toBe('Could not sync athletes. Please try again.');
  });

  it('normalizes a THROWN error (e.g. LiftingForbiddenError) into a returned failure instead of an unhandled rejection', async () => {
    delegateMock.mockRejectedValue(new Error('You do not have edit access to this Lifting Lab.'));

    const result = await syncOrgAthletes('org-1');

    expect(result).toEqual({
      success: false,
      error: 'You do not have edit access to this Lifting Lab.',
    });
  });

  it('rejects a missing orgId before ever calling the delegate', async () => {
    const result = await syncOrgAthletes('');

    expect(result).toEqual({ success: false, error: 'Missing organization.' });
    expect(delegateMock).not.toHaveBeenCalled();
  });
});

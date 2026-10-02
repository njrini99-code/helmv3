/**
 * Manage selections, server side (src/app/golf/actions/v3/qualifying.ts). The screen hides the coach's controls
 * from a player, but that is not the gate: each action proves the caller coaches the QUALIFIER'S team (the team
 * comes from the qualifier's row, never from the caller) before it reaches the service, and refuses in the words
 * the Clubhouse screen turns into coach-facing copy (selectionReason, src/clubhouse/screens/qualifiers/writes.ts).
 * Docs: docs/clubhouse/pages/P009-qualifiers/CONTRACT.md, category 08.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;
const access = vi.hoisted(() => ({
  team: { allowed: true, reason: 'coach' } as { allowed: boolean; reason?: string },
  roster: { ok: true } as { ok: boolean; reason?: string },
}));
const service = vi.hoisted(() => ({
  transition: vi.fn(async () => ({ ok: true })),
  setPick: vi.fn(async () => ({ ok: true })),
  removePick: vi.fn(async () => ({ ok: true })),
  // Q-116: confirm says whether the players were told.
  confirm: vi.fn(async () => ({ ok: true, data: { notified: true } })),
}));

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn(async () => fake) }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/admin/observed-action', () => ({
  withAdminObserved: <T extends (...args: never[]) => unknown>(_name: string, _options: unknown, action: T) => action,
}));
vi.mock('@/lib/auth/verify-player-access', () => ({
  verifyTeamAccess: vi.fn(async () => access.team),
  verifyPlayersOnTeam: vi.fn(async () => access.roster),
}));
vi.mock('@/lib/coachhelm/v3/qualifying/service', () => ({
  transitionSelectionState: service.transition,
  setCoachPick: service.setPick,
  removeCoachPick: service.removePick,
  confirmSelection: service.confirm,
}));

import { verifyPlayersOnTeam, verifyTeamAccess } from '@/lib/auth/verify-player-access';
import { advanceSelectionState, confirmQualifierSelection, removeQualifierCoachPick, setQualifierCoachPick } from '../v3/qualifying';

const Q = '11111111-1111-4111-8111-111111111111';
const TEAM = '22222222-2222-4222-8222-222222222222';
const PLAYER = '33333333-3333-4333-8333-333333333333';

/** The four actions, each called the way the Clubhouse screen calls it. */
const actions = [
  ['advanceSelectionState', () => advanceSelectionState(Q, 'closed'), service.transition],
  ['setQualifierCoachPick', () => setQualifierCoachPick(Q, PLAYER, 'Best short game on the team'), service.setPick],
  ['removeQualifierCoachPick', () => removeQualifierCoachPick(Q, PLAYER), service.removePick],
  ['confirmQualifierSelection', () => confirmQualifierSelection(Q), service.confirm],
] as const;

function world(user: { id: string } | null = { id: 'coach-user' }, qualifiers = [{ id: Q, team_id: TEAM }]) {
  fake = createFakeSupabase({ user, tables: { golf_qualifiers: qualifiers } });
}

beforeEach(() => {
  vi.clearAllMocks();
  access.team = { allowed: true, reason: 'coach' };
  access.roster = { ok: true };
  world();
});

describe('Manage selections: who may call the actions', () => {
  it('90810 a signed-out caller is refused as Unauthorized before the team is checked or anything is written', async () => {
    world(null);
    for (const [name, call, write] of actions) {
      expect([name, await call()]).toEqual([name, { ok: false, error: 'Unauthorized' }]);
      expect([name, write.mock.calls.length]).toEqual([name, 0]);
    }
    expect(verifyTeamAccess).not.toHaveBeenCalled();
  });

  it('90810 a caller who does not coach the qualifier’s team is refused as Not a coach of this team, and the team checked is the qualifier’s own', async () => {
    access.team = { allowed: false, reason: 'denied' };
    for (const [name, call, write] of actions) {
      expect([name, await call()]).toEqual([name, { ok: false, error: 'Not a coach of this team' }]);
      expect([name, write.mock.calls.length]).toEqual([name, 0]);
    }
    expect(vi.mocked(verifyTeamAccess).mock.calls.map(([team, user]) => [team, user])).toEqual(actions.map(() => [TEAM, 'coach-user']));
    expect(verifyPlayersOnTeam).not.toHaveBeenCalled();
  });

  it('90810 a qualifier that does not exist, or that RLS hides from the caller, is refused as Qualifier not found', async () => {
    world({ id: 'coach-user' }, []);
    for (const [name, call, write] of actions) {
      expect([name, await call()]).toEqual([name, { ok: false, error: 'Qualifier not found' }]);
      expect([name, write.mock.calls.length]).toEqual([name, 0]);
    }
    expect(verifyTeamAccess).not.toHaveBeenCalled();
  });

  it('90810 a coach of the team reaches the service, and only then', async () => {
    for (const [name, call, write] of actions) {
      expect([name, await call()]).toEqual([name, expect.objectContaining({ ok: true })]);
      expect([name, write.mock.calls.length]).toEqual([name, 1]);
    }
  });

  it('90810 a coach’s pick must be a player on this team: another team’s player, or a roster that cannot be checked, is refused before the pick is recorded', async () => {
    access.roster = { ok: false, reason: 'not-members' };
    expect(await setQualifierCoachPick(Q, PLAYER, 'Best short game on the team')).toEqual({ ok: false, error: 'That player is not on this team' });
    access.roster = { ok: false, reason: 'unavailable' };
    expect(await setQualifierCoachPick(Q, PLAYER, 'Best short game on the team')).toEqual({ ok: false, error: "Couldn't confirm your roster just now. Please try again." });
    expect(service.setPick).not.toHaveBeenCalled();
    expect(verifyPlayersOnTeam).toHaveBeenCalledWith(TEAM, [PLAYER], expect.anything());
  });

  it('90810 a service that refuses is passed on as it is, so the screen can put it in words', async () => {
    service.transition.mockResolvedValueOnce({ ok: false, error: 'illegal transition open → selected' } as never);
    expect(await advanceSelectionState(Q, 'selected')).toEqual({ ok: false, error: 'illegal transition open → selected' });
    service.confirm.mockResolvedValueOnce({ ok: false, error: 'cannot confirm: state must be closed, all coach picks chosen with reasoning' } as never);
    expect(await confirmQualifierSelection(Q)).toEqual({ ok: false, error: 'cannot confirm: state must be closed, all coach picks chosen with reasoning' });
  });
});

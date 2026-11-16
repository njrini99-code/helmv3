import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-14: the shell's round-in-progress and staff reads say when they failed (`unknown`), so the client keeps what it
 * last knew instead of taking "no round" and "not the head coach" as answers. Both failures are still logged.
 */

vi.mock('server-only', () => ({}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../../lib/track-server', () => ({ chLogServer: logServer }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: false })) }));
const tables = vi.hoisted(() => ({ current: {} as import('../../__tests__/supabase-fake').ChFakeTables }));
vi.mock('@/lib/supabase/server', async () => (await import('../../__tests__/supabase-fake')).fakeServer(tables));

import { loadClubhouseShell } from '../shell';

const timeout = { code: '57014', message: 'canceling statement due to statement timeout' };

beforeEach(() => logServer.mockClear());
afterEach(() => {
  tables.current = {};
});

describe('Shell reads that failed are unknown (GAP-S-14)', () => {
  it('a failed round-in-progress read is unknown, not "no round", and is logged', async () => {
    tables.current = { golf_rounds: { error: timeout } };
    const shell = await loadClubhouseShell('t1', 'p1', null);
    expect(shell.unknown).toEqual(['roundInProgress']);
    expect(shell.roundInProgress).toBeNull();
    expect(logServer).toHaveBeenCalledWith('shell', 'roundInProgress', timeout, 'rounds');
  });

  it('a failed staff read is unknown, not "assistant", and is logged', async () => {
    tables.current = { golf_team_coach_staff: { error: timeout } };
    const shell = await loadClubhouseShell('t1', null, 'c1');
    expect(shell.unknown).toEqual(['viewerIsHeadCoach']);
    expect(logServer).toHaveBeenCalledWith('shell', 'staffRole', timeout, 'teams');
  });

  it('reads that answer leave nothing unknown, including "no round" and "not the head coach"', async () => {
    tables.current = { golf_rounds: { data: null }, golf_team_coach_staff: { data: [{ role: 'assistant_coach' }] } };
    const player = await loadClubhouseShell('t1', 'p1', null);
    expect(player.unknown).toBeUndefined();
    expect(player.roundInProgress).toBeNull();
    const coach = await loadClubhouseShell('t1', null, 'c1');
    expect(coach.unknown).toBeUndefined();
    expect(coach.viewerIsHeadCoach).toBe(false);
  });

  it('a round in progress that answers is drawn as before', async () => {
    tables.current = { golf_rounds: { data: { id: 'r1', course_name: 'Pinehurst No. 2', current_hole: 12, golf_holes: [] } } };
    const shell = await loadClubhouseShell('t1', 'p1', null);
    expect(shell.unknown).toBeUndefined();
    expect(shell.roundInProgress).toMatchObject({ id: 'r1', course: 'Pinehurst No. 2', hole: 12, playerId: 'p1' });
  });
});

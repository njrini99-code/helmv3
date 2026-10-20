import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * P001 (wave-3 design #2): the shell's identity line names a head coach "Head coach", as the boards and the phone
 * Settings list do. The loader reads the coach's own staff row on the team alongside its other reads; an assistant, a
 * player and a failed read all keep the plain title.
 */

vi.mock('server-only', () => ({}));
const logServer = vi.hoisted(() => vi.fn());
vi.mock('../lib/track-server', () => ({ chLogServer: logServer }));
vi.mock('@/lib/coachhelm/v2/gate', () => ({ isCoachHelmEnabledForCoach: vi.fn(async () => ({ effectivelyEnabled: false })) }));
const tables = vi.hoisted(() => ({ current: {} as import('./supabase-fake').ChFakeTables, gate: undefined as ((t: string) => Promise<void> | void) | undefined }));
vi.mock('@/lib/supabase/server', async () => (await import('./supabase-fake')).fakeServer(tables));

import { loadClubhouseShell } from '../data/shell';

beforeEach(() => logServer.mockClear());
afterEach(() => {
  tables.current = {};
  tables.gate = undefined;
});

describe('Shell identity line, head coach', () => {
  it('reads the coach’s own staff row on the team: head_coach is the head coach', async () => {
    let filters: Array<[string, unknown[]]> = [];
    tables.current = {
      golf_team_coach_staff: (f) => {
        filters = f;
        return { data: [{ role: 'head_coach' }] };
      },
    };
    expect((await loadClubhouseShell('t1', null, 'c1')).viewerIsHeadCoach).toBe(true);
    expect(filters).toEqual(expect.arrayContaining([['eq', ['team_id', 't1']], ['eq', ['coach_id', 'c1']]]));
  });

  it('an assistant coach is not', async () => {
    tables.current = { golf_team_coach_staff: { data: [{ role: 'assistant_coach' }] } };
    expect((await loadClubhouseShell('t1', null, 'c1')).viewerIsHeadCoach).toBe(false);
  });

  it('a failed read falls back to the plain title and is logged', async () => {
    tables.current = { golf_team_coach_staff: { error: { code: '57014', message: 'timeout' } } };
    expect((await loadClubhouseShell('t1', null, 'c1')).viewerIsHeadCoach).toBe(false);
    expect(logServer).toHaveBeenCalledWith('shell', 'staffRole', expect.anything(), 'teams');
  });

  it('a player never reads it', async () => {
    let asked = 0;
    tables.current = {
      golf_team_coach_staff: () => {
        asked += 1;
        return { data: [{ role: 'head_coach' }] };
      },
    };
    expect((await loadClubhouseShell('t1', 'p1', null)).viewerIsHeadCoach).toBe(false);
    expect(asked).toBe(0);
  });

  it('the read starts with the shell’s other reads, not after them', async () => {
    const started: string[] = [];
    let release!: () => void;
    const held = new Promise<void>((resolve) => (release = resolve));
    tables.gate = (table) => {
      started.push(table);
      return held;
    };
    tables.current = { golf_team_coach_staff: { data: [{ role: 'head_coach' }] } };
    const shell = loadClubhouseShell('t1', null, 'c1');
    await new Promise((resolve) => setTimeout(resolve, 0));
    // Nothing has answered yet, and the staff read is already out beside the next event's.
    expect(started).toEqual(expect.arrayContaining(['golf_events', 'golf_team_join_requests', 'golf_team_coach_staff']));
    release();
    expect((await shell).viewerIsHeadCoach).toBe(true);
  });
});

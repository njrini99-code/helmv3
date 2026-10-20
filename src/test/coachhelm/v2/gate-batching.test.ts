import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The CoachHelm gate reads in two round trips instead of four (perf, 2026-10-01), and must answer exactly as the serial version did
 * (LIVE-17's fail-closed rows, the all-teams-disabled rule, the reason it names). `gate-serial.reference.ts` is a frozen copy of that
 * version; both run over the same fake database, in every combination of the reads' outcomes, and must return the same status.
 *
 * Q-146 (2026-10-01) changed one thing on purpose: a failed settings, staff, membership or team settings read the answer rests on now
 * fails closed, where the serial version read it as "no row" and so as enabled. `failsClosed` names exactly those worlds; in every other
 * world the serial version is still the reference.
 */

vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({}) }));

import { isCoachHelmEnabledForCoach, isCoachHelmEnabledForPlayer } from '@/lib/coachhelm/v2/gate';
import {
  isCoachHelmEnabledForCoach as serialCoach,
  isCoachHelmEnabledForPlayer as serialPlayer,
} from './gate-serial.reference';

type Row = 'ok' | 'missing' | 'error';
type Settings = 'enabled' | 'disabled' | 'disabled-no-reason' | 'null-enabled' | 'missing' | 'error';
type Staff = 'error' | string[];

interface World {
  /** The coach's (or player's) own row. */
  subject: Row;
  /** The coach's own settings: the coach gate only. */
  coachSettings: 'enabled' | 'disabled' | 'disabled-no-reason' | 'missing' | 'error';
  /** Staffed teams (coach) or active memberships (player), in order, or the read failed. */
  teams: Staff;
  /** The settings row of each team. */
  team: Record<string, Settings>;
}

interface Call {
  table: string;
  kind: 'single' | 'maybeSingle' | 'list' | 'in';
}

/**
 * A fake database over a `World`. Every read starts when its builder is awaited (as supabase's are lazy), is logged, and settles in
 * a later microtask. A batched read of teams fails when any team it covers is configured to fail: what a failure of the serial
 * version's per-team read meant for that team, the same for all of them.
 */
function fakeDb(world: World, calls: Call[] = []) {
  const settle = <T,>(value: T) => new Promise<T>((resolve) => queueMicrotask(() => resolve(value)));
  const err = { message: 'boom' };
  const teamRow = (id: string) => {
    const s = world.team[id];
    if (s === 'enabled') return { team_id: id, enabled: true, disabled_reason: null, disabled_at: null };
    if (s === 'null-enabled') return { team_id: id, enabled: null, disabled_reason: null, disabled_at: null };
    if (s === 'disabled') return { team_id: id, enabled: false, disabled_reason: `reason ${id}`, disabled_at: null };
    if (s === 'disabled-no-reason') return { team_id: id, enabled: false, disabled_reason: null, disabled_at: null };
    return null;
  };

  const from = (table: string) => ({
    select: (_cols: string) => {
      const filters: Record<string, unknown> = {};
      const chain: Record<string, unknown> = {};
      let kindOverride: Call['kind'] | null = null;
      const run = (kind: Call['kind']) => {
        calls.push({ table, kind });
        const read = (): unknown => {
          if (table === 'golf_coaches' || table === 'golf_players') {
            if (world.subject === 'error') return { data: null, error: err };
            return { data: world.subject === 'ok' ? { user_id: 'u', organization_id: 'o' } : null, error: null };
          }
          if (table === 'golf_coachhelm_settings') {
            const s = world.coachSettings;
            if (s === 'error') return { data: null, error: err };
            if (s === 'missing') return { data: null, error: null };
            return { data: { enabled: s === 'enabled', disabled_at: null, disabled_reason: s === 'disabled' ? 'coach reason' : null }, error: null };
          }
          if (table === 'golf_team_coach_staff' || table === 'golf_team_members') {
            if (world.teams === 'error') return { data: null, error: err };
            return { data: world.teams.map((team_id) => ({ team_id })), error: null };
          }
          if (table === 'golf_team_coachhelm_settings') {
            if (kind === 'in') {
              const ids = filters.team_id as string[];
              if (ids.some((id) => world.team[id] === 'error')) return { data: null, error: err };
              return { data: ids.map(teamRow).filter(Boolean), error: null };
            }
            const id = filters.team_id as string;
            if (world.team[id] === 'error') return { data: null, error: err };
            return { data: teamRow(id), error: null };
          }
          throw new Error(`unexpected table ${table}`);
        };
        return settle(read());
      };
      chain.eq = (col: string, value: unknown) => {
        filters[col] = value;
        return chain;
      };
      chain.in = (col: string, value: unknown) => {
        filters[col] = value;
        kindOverride = 'in';
        return chain;
      };
      chain.single = () => run('single');
      chain.maybeSingle = () => run('maybeSingle');
      // A builder awaited directly (the list reads): lazy, started on the first `then`.
      chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) => run(kindOverride ?? 'list').then(ok, bad);
      return chain;
    },
  });
  return { from } as never;
}

const SETTINGS_FAILED = {
  userEnabled: false,
  teamEnabled: false,
  effectivelyEnabled: false,
  disabledReason: 'CoachHelm settings lookup failed',
  disabledBy: null,
};

/** Whether a read the answer rests on failed, past the subject's own row (which LIVE-17 already covers): Q-146's fail-closed worlds. */
function failsClosed(w: World, role: 'coach' | 'player'): boolean {
  if (w.subject !== 'ok') return false;
  if (role === 'coach') {
    if (w.coachSettings === 'error') return true;
    if (w.coachSettings === 'disabled' || w.coachSettings === 'disabled-no-reason') return false;
  }
  if (w.teams === 'error') return true;
  return w.teams.some((id) => w.team[id] === 'error');
}

const IDS = ['t1', 't2', 't3'];
const SETTINGS: Settings[] = ['enabled', 'disabled', 'disabled-no-reason', 'null-enabled', 'missing', 'error'];

/** Every world with up to three teams, each in every state, for each outcome of the rows around them. */
function worlds(): World[] {
  const out: World[] = [];
  const staffs: Staff[] = ['error', [], ['t1'], ['t1', 't2'], ['t1', 't2', 't3']];
  const subjects: Row[] = ['ok', 'missing', 'error'];
  const coachSettings: World['coachSettings'][] = ['enabled', 'disabled', 'disabled-no-reason', 'missing', 'error'];
  for (const subject of subjects) {
    for (const cs of coachSettings) {
      for (const teams of staffs) {
        const n = teams === 'error' ? 0 : teams.length;
        const combos = SETTINGS.length ** n;
        for (let i = 0; i < combos; i++) {
          const team: Record<string, Settings> = {};
          let k = i;
          for (let j = 0; j < n; j++) {
            team[IDS[j]!] = SETTINGS[k % SETTINGS.length]!;
            k = Math.floor(k / SETTINGS.length);
          }
          out.push({ subject, coachSettings: cs, teams, team });
        }
      }
    }
  }
  return out;
}

beforeEach(() => {
  delete process.env.NEXT_PUBLIC_COACHHELM_ENABLED;
});
afterEach(() => {
  delete process.env.NEXT_PUBLIC_COACHHELM_ENABLED;
});

describe('the batched gate answers exactly as the serial one did, except where a read failed (Q-146: closed)', () => {
  const all = worlds();

  it('for a coach, in every combination of the reads (row, settings, staffed teams, up to three teams in every state)', async () => {
    expect(all.length).toBeGreaterThan(1000);
    let closed = 0;
    for (const w of all) {
      const batched = await isCoachHelmEnabledForCoach('c1', fakeDb(w));
      if (failsClosed(w, 'coach')) {
        closed++;
        expect(batched, JSON.stringify(w)).toEqual(SETTINGS_FAILED);
      } else {
        expect(batched, JSON.stringify(w)).toEqual(await serialCoach('c1', fakeDb(w)));
      }
    }
    expect(closed).toBeGreaterThan(0);
  });

  it('for a player, in every combination of the reads (row, active memberships, up to three teams in every state)', async () => {
    let closed = 0;
    for (const w of all) {
      const batched = await isCoachHelmEnabledForPlayer('p1', fakeDb(w));
      if (failsClosed(w, 'player')) {
        closed++;
        expect(batched, JSON.stringify(w)).toEqual(SETTINGS_FAILED);
      } else {
        expect(batched, JSON.stringify(w)).toEqual(await serialPlayer('p1', fakeDb(w)));
      }
    }
    expect(closed).toBeGreaterThan(0);
  });

  it('with the global switch off, nothing is read and the answer is the same', async () => {
    process.env.NEXT_PUBLIC_COACHHELM_ENABLED = 'false';
    const calls: Call[] = [];
    const w: World = { subject: 'ok', coachSettings: 'enabled', teams: ['t1'], team: { t1: 'enabled' } };
    expect(await isCoachHelmEnabledForCoach('c1', fakeDb(w, calls))).toEqual(await serialCoach('c1', fakeDb(w)));
    expect(await isCoachHelmEnabledForPlayer('p1', fakeDb(w, calls))).toEqual(await serialPlayer('p1', fakeDb(w)));
    expect(calls).toEqual([]);
  });
});

describe('the fail-closed rows (LIVE-17) and the rules the answer rests on, stated outright', () => {
  const base: World = { subject: 'ok', coachSettings: 'enabled', teams: ['t1', 't2'], team: { t1: 'disabled', t2: 'disabled' } };

  it('a failed coach or player row is never enabled, whatever the other reads said', async () => {
    for (const other of ['enabled', 'disabled', 'error'] as const) {
      const w: World = { ...base, subject: 'error', coachSettings: other, team: { t1: 'enabled', t2: 'enabled' } };
      const coach = await isCoachHelmEnabledForCoach('c1', fakeDb(w));
      const player = await isCoachHelmEnabledForPlayer('p1', fakeDb(w));
      expect(coach.effectivelyEnabled).toBe(false);
      expect(coach.disabledReason).toBe('Coach record lookup failed');
      expect(player.effectivelyEnabled).toBe(false);
      expect(player.disabledReason).toBe('Player record lookup failed');
    }
  });

  it('a missing row is the enabled default, however the other reads came out', async () => {
    const w: World = { ...base, subject: 'missing', coachSettings: 'disabled' };
    expect((await isCoachHelmEnabledForCoach('c1', fakeDb(w))).effectivelyEnabled).toBe(true);
    expect((await isCoachHelmEnabledForPlayer('p1', fakeDb(w))).effectivelyEnabled).toBe(true);
  });

  it('a coach who switched it off is off for the user, before any team is looked at', async () => {
    const w: World = { ...base, coachSettings: 'disabled', team: { t1: 'enabled', t2: 'enabled' } };
    const s = await isCoachHelmEnabledForCoach('c1', fakeDb(w));
    expect(s).toMatchObject({ effectivelyEnabled: false, userEnabled: false, disabledBy: 'user', disabledReason: 'coach reason' });
  });

  it('off only when EVERY team is off, and the reason is the first one given', async () => {
    const off = await isCoachHelmEnabledForCoach('c1', fakeDb({ ...base, team: { t1: 'disabled-no-reason', t2: 'disabled' } }));
    expect(off).toMatchObject({ effectivelyEnabled: false, disabledBy: 'team', disabledReason: 'reason t2' });
    const one = await isCoachHelmEnabledForCoach('c1', fakeDb({ ...base, team: { t1: 'disabled', t2: 'enabled' } }));
    expect(one.effectivelyEnabled).toBe(true);
    const unread = await isCoachHelmEnabledForCoach('c1', fakeDb({ ...base, team: { t1: 'disabled', t2: 'missing' } }));
    expect(unread.effectivelyEnabled).toBe(true);
    const player = await isCoachHelmEnabledForPlayer('p1', fakeDb({ ...base, team: { t1: 'disabled', t2: 'disabled' } }));
    expect(player).toMatchObject({ effectivelyEnabled: false, disabledBy: 'coach', disabledReason: 'reason t1' });
  });

  it('Q-146: a failed settings, staff, membership or team settings read is closed, where the serial version opened it', async () => {
    // The case the security review found: the team switched CoachHelm off, and a transient error turned it back on.
    const teamRead: World = { ...base, team: { t1: 'disabled', t2: 'error' } };
    expect(await serialCoach('c1', fakeDb(teamRead))).toMatchObject({ effectivelyEnabled: true });
    expect(await isCoachHelmEnabledForCoach('c1', fakeDb(teamRead))).toEqual(SETTINGS_FAILED);
    expect(await isCoachHelmEnabledForPlayer('p1', fakeDb(teamRead))).toEqual(SETTINGS_FAILED);
    expect(await isCoachHelmEnabledForCoach('c1', fakeDb({ ...base, coachSettings: 'error' }))).toEqual(SETTINGS_FAILED);
    expect(await isCoachHelmEnabledForCoach('c1', fakeDb({ ...base, teams: 'error' }))).toEqual(SETTINGS_FAILED);
    expect(await isCoachHelmEnabledForPlayer('p1', fakeDb({ ...base, teams: 'error' }))).toEqual(SETTINGS_FAILED);
  });

  it('Q-146: a staff or membership read that throws is closed too, and logged', async () => {
    const throwingList = (table: string) =>
      ({
        from: (t: string) => ({
          select: () => {
            const chain: Record<string, unknown> = {};
            chain.eq = () => chain;
            chain.single = () => Promise.resolve({ data: { user_id: 'u', organization_id: 'o' }, error: null });
            chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
            chain.then = (ok: (v: unknown) => unknown, bad?: (e: unknown) => unknown) =>
              (t === table ? Promise.reject(new Error('threw')) : Promise.resolve({ data: [], error: null })).then(ok, bad);
            return chain;
          },
        }),
      }) as never;
    expect(await isCoachHelmEnabledForCoach('c1', throwingList('golf_team_coach_staff'))).toEqual(SETTINGS_FAILED);
    expect(await isCoachHelmEnabledForPlayer('p1', throwingList('golf_team_members'))).toEqual(SETTINGS_FAILED);
  });
});

describe('the reads start together and the teams are one read', () => {
  const w: World = { subject: 'ok', coachSettings: 'enabled', teams: ['t1', 't2', 't3'], team: { t1: 'enabled', t2: 'enabled', t3: 'enabled' } };

  it('a coach: the row, the settings and the staffed teams in one round trip, then every team in one read', async () => {
    const calls: Call[] = [];
    await isCoachHelmEnabledForCoach('c1', fakeDb(w, calls));
    expect(calls).toEqual([
      { table: 'golf_coaches', kind: 'single' },
      { table: 'golf_coachhelm_settings', kind: 'maybeSingle' },
      { table: 'golf_team_coach_staff', kind: 'list' },
      { table: 'golf_team_coachhelm_settings', kind: 'in' },
    ]);
  });

  it('the serial version needed one read per team after those', async () => {
    const calls: Call[] = [];
    await serialCoach('c1', fakeDb(w, calls));
    // Not all three: the loop stops at the first enabled team, so a gate that is open costs one. A closed one costs one per team.
    const closed: World = { ...w, team: { t1: 'disabled', t2: 'disabled', t3: 'disabled' } };
    const closedCalls: Call[] = [];
    await serialCoach('c1', fakeDb(closed, closedCalls));
    expect(closedCalls.filter((c) => c.table === 'golf_team_coachhelm_settings')).toHaveLength(3);
    const batched: Call[] = [];
    await isCoachHelmEnabledForCoach('c1', fakeDb(closed, batched));
    expect(batched.filter((c) => c.table === 'golf_team_coachhelm_settings')).toHaveLength(1);
  });

  it('a player: the row and the memberships together, then every team in one read', async () => {
    const calls: Call[] = [];
    await isCoachHelmEnabledForPlayer('p1', fakeDb(w, calls));
    expect(calls).toEqual([
      { table: 'golf_players', kind: 'single' },
      { table: 'golf_team_members', kind: 'list' },
      { table: 'golf_team_coachhelm_settings', kind: 'in' },
    ]);
  });

  it('a read nobody needs does not leave an unhandled rejection (the row failed, the staff read throws)', async () => {
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const throwing = {
        from: (table: string) => ({
          select: () => {
            const chain: Record<string, unknown> = {};
            chain.eq = () => chain;
            chain.single = () => Promise.resolve({ data: null, error: { message: 'boom' } });
            chain.maybeSingle = () => Promise.resolve({ data: null, error: null });
            chain.then = (_ok: unknown, bad?: (e: unknown) => unknown) => (table === 'golf_team_coach_staff' ? Promise.reject(new Error('threw')).then(undefined, bad) : Promise.resolve({ data: [], error: null }));
            return chain;
          },
        }),
      } as never;
      const s = await isCoachHelmEnabledForCoach('c1', throwing);
      expect(s.effectivelyEnabled).toBe(false);
      await new Promise((resolve) => setTimeout(resolve, 20));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.off('unhandledRejection', unhandled);
    }
  });
});

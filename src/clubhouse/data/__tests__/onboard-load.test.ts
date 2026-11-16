import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-S-04 and GAP-R-04: who lands on /golf/player. A failed profile read is `failed` (never the blank player form),
 * and the role follows the dashboard layout's rule, so an account with an unfinished coach row and an unfinished
 * player row whose users.role is player is not bounced between here and the dashboard. A stand-in for Supabase, not a
 * database test. Synthetic ids only.
 */
type Row = Record<string, unknown>;
type Failure = { code?: string; message: string };
const rows: Record<string, Row | null> = {};
const failing: Record<string, Failure> = {};
const logged = vi.hoisted(() => vi.fn());

function from(table: string) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    maybeSingle: () => Promise.resolve(failing[table] ? { data: null, error: failing[table] } : { data: rows[table] ?? null, error: null }),
  };
  return chain;
}

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/server', () => ({ createClient: async () => ({ from }) }));
vi.mock('@/lib/auth/resilient-get-user', () => ({ getUserResilient: async () => ({ user: { id: 'u1', email: 'p@example.test', user_metadata: { first_name: 'Ana', last_name: 'Ruiz' } } }) }));
vi.mock('../../lib/track-server', () => ({ chLogServer: logged }));

import { loadPlayerOnboard } from '../onboard';

const TIMEOUT: Failure = { code: '57014', message: 'canceling statement due to statement timeout' };

beforeEach(() => {
  for (const k of Object.keys(rows)) delete rows[k];
  for (const k of Object.keys(failing)) delete failing[k];
  logged.mockClear();
});

describe('loadPlayerOnboard · a failed read is never a new player (GAP-S-04)', () => {
  it('is failed when the coach read fails, and logs it', async () => {
    failing.golf_coaches = TIMEOUT;
    expect(await loadPlayerOnboard()).toEqual({ kind: 'failed' });
    expect(logged).toHaveBeenCalledWith('auth', 'onboard.coach', TIMEOUT, 'golf_auth');
  });

  it('is failed when the player read fails', async () => {
    failing.golf_players = TIMEOUT;
    expect(await loadPlayerOnboard()).toEqual({ kind: 'failed' });
  });

  it('still starts a new player when both reads answered with nothing', async () => {
    const load = await loadPlayerOnboard();
    expect(load.kind).toBe('ready');
    if (load.kind === 'ready') expect(load.seed.first).toBe('Ana');
  });
});

describe('loadPlayerOnboard · one role with the dashboard layout (GAP-R-04)', () => {
  it('sends an onboarded coach to the dashboard', async () => {
    rows.golf_coaches = { id: 'c1', onboarding_completed: true };
    expect(await loadPlayerOnboard()).toEqual({ kind: 'coach' });
  });

  it('keeps an unfinished coach row with no player row a coach, as before', async () => {
    rows.golf_coaches = { id: 'c1', onboarding_completed: false };
    expect(await loadPlayerOnboard()).toEqual({ kind: 'coach' });
  });

  it('starts the player form when both rows are unfinished and users.role is player (the layout sends them here)', async () => {
    rows.golf_coaches = { id: 'c1', onboarding_completed: false };
    rows.golf_players = { first_name: 'Ana', onboarding_completed: false };
    rows.users = { role: 'player' };
    expect((await loadPlayerOnboard()).kind).toBe('ready');
  });

  it('is a coach when both rows are unfinished and users.role is coach', async () => {
    rows.golf_coaches = { id: 'c1', onboarding_completed: false };
    rows.golf_players = { first_name: 'Ana', onboarding_completed: false };
    rows.users = { role: 'coach' };
    expect(await loadPlayerOnboard()).toEqual({ kind: 'coach' });
  });

  it('is failed when the role read it needs fails', async () => {
    rows.golf_coaches = { id: 'c1', onboarding_completed: false };
    rows.golf_players = { first_name: 'Ana', onboarding_completed: false };
    failing.users = TIMEOUT;
    expect(await loadPlayerOnboard()).toEqual({ kind: 'failed' });
  });

  it('sends a player who finished, with a coach row they never did, to the dashboard as onboarded', async () => {
    rows.golf_coaches = { id: 'c1', onboarding_completed: false };
    rows.golf_players = { first_name: 'Ana', onboarding_completed: true };
    expect(await loadPlayerOnboard()).toEqual({ kind: 'onboarded' });
  });
});

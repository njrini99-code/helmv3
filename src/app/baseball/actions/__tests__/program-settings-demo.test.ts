// =============================================================================
// src/app/baseball/actions/__tests__/program-settings-demo.test.ts
//
// getProgramSettings is registered demoSafe so the shared demo coach can open
// the Settings pages. Its one write, lazily creating a team's settings row the
// first time a head coach opens Settings, must therefore never run for the
// demo session: the demo gets the variant defaults in memory instead.
// =============================================================================

import { beforeEach, describe, expect, it, vi } from 'vitest';

const state = vi.hoisted(() => ({
  isDemo: false,
  writes: [] as Array<{ table: string; op: string }>,
}));

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'user-1', email: 'coach@example.edu' },
          targetTeamId: 'team-1',
          activeCoachId: 'coach-1',
        },
        ...args,
      ),
  BaseballActionError: class BaseballActionError extends Error {},
}));

vi.mock('@/lib/demo/baseball-config.server', () => ({
  isBaseballDemoCoachEmail: vi.fn(() => state.isDemo),
}));

vi.mock('@/lib/baseball/capabilities', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/lib/baseball/capabilities')>()),
  resolveBaseballCapabilities: vi.fn(async () => ({
    is_head_coach: true,
    can_manage_settings: true,
    can_manage_imports: true,
  })),
}));

vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

/** A query builder where every read finds nothing and every write is recorded. */
function table(name: string) {
  const builder: Record<string, unknown> = {};
  const chain = () => builder;
  for (const op of ['select', 'eq', 'order', 'limit', 'in', 'is']) builder[op] = vi.fn(chain);
  for (const op of ['insert', 'update', 'upsert', 'delete']) {
    builder[op] = vi.fn(() => {
      state.writes.push({ table: name, op });
      return builder;
    });
  }
  builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
  builder.single = vi.fn(async () => ({ data: null, error: null }));
  builder.then = (resolve: (v: unknown) => unknown) => resolve({ data: [], error: null });
  return builder;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({ from: vi.fn(table) })),
}));

import { getProgramSettings } from '@/app/baseball/actions/program-settings';

beforeEach(() => {
  state.isDemo = false;
  state.writes = [];
});

describe('getProgramSettings for a team with no settings row yet', () => {
  it('creates the row for a real head coach', async () => {
    await getProgramSettings();
    expect(state.writes).toContainEqual({ table: 'baseball_program_settings', op: 'upsert' });
  });

  it('writes nothing for the shared demo coach and still returns default settings', async () => {
    state.isDemo = true;
    const result = await getProgramSettings();
    expect(state.writes).toEqual([]);
    expect(result.settings).toBeTruthy();
    expect(result.teamId).toBe('team-1');
  });
});

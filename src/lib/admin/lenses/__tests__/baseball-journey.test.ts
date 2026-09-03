import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueMockAdminClient, type MockResult } from './test-helpers';

const perTable: Record<string, Array<() => MockResult>> = {};
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => queueMockAdminClient(perTable),
}));

import { fetchBaseballJourneyLens } from '../baseball-journey';

/** Call-order contract (see baseball-journey.ts): admin_events indices
 *  [0..9] are 5x(all,critical) pairs in stage order roster, practice, dev,
 *  stats, communications. */
function zeroCount(): MockResult {
  return { count: 0, error: null };
}
function adminEventsDefaults(overrides: Record<number, () => MockResult> = {}): Array<() => MockResult> {
  const arr = Array.from({ length: 10 }, () => zeroCount);
  for (const [i, fn] of Object.entries(overrides)) arr[Number(i)] = fn;
  return arr;
}
function findStage<T extends { id: string }>(stages: readonly T[], id: string): T {
  const found = stages.find((s) => s.id === id);
  if (!found) throw new Error(`stage not found: ${id}`);
  return found;
}

describe('fetchBaseballJourneyLens', () => {
  beforeEach(() => {
    for (const k of Object.keys(perTable)) delete perTable[k];
  });

  it('every stage is honestly marked brief_derived (no golden-paths citation exists for baseball)', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    perTable['baseball_players'] = [() => ({ data: [], error: null })];
    perTable['baseball_developmental_plans'] = [() => ({ data: [], error: null })];

    const lens = await fetchBaseballJourneyLens(new Date('2026-09-03T00:00:00Z'));

    expect(lens.stages.every((s) => s.confidence === 'brief_derived')).toBe(true);
  });

  it('unknown vs zero: a failed baseball_players read yields null onboarding numbers, not zero', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    perTable['baseball_players'] = [() => ({ error: { message: 'db down' } })];
    perTable['baseball_developmental_plans'] = [() => ({ data: [], error: null })];

    const lens = await fetchBaseballJourneyLens(new Date('2026-09-03T00:00:00Z'));

    const roster = findStage(lens.stages, 'roster_onboarding');
    expect(roster.metric.attempts).toBeNull();
    expect(roster.metric.completions).toBeNull();
    expect(lens.degradedNote).toContain('baseball_players read failed');
  });

  it('computes onboarding completion honestly from onboarding_completed, not from admin_events', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    perTable['baseball_players'] = [
      () => ({
        data: [
          { id: 'p1', onboarding_completed: true },
          { id: 'p2', onboarding_completed: false },
          { id: 'p3', onboarding_completed: null },
        ],
        error: null,
      }),
    ];
    perTable['baseball_developmental_plans'] = [() => ({ data: [], error: null })];

    const lens = await fetchBaseballJourneyLens(new Date('2026-09-03T00:00:00Z'));

    const roster = findStage(lens.stages, 'roster_onboarding');
    expect(roster.metric.attempts).toBe(3);
    expect(roster.metric.completions).toBe(1);
  });

  it('blind source: a failed incident read for one stage stays null while others stay numeric', async () => {
    perTable['admin_events'] = adminEventsDefaults({ 2: () => ({ error: { message: 'timeout' } }) }); // practice "all"
    perTable['baseball_players'] = [() => ({ data: [], error: null })];
    perTable['baseball_developmental_plans'] = [() => ({ data: [], error: null })];

    const lens = await fetchBaseballJourneyLens(new Date('2026-09-03T00:00:00Z'));

    expect(findStage(lens.stages, 'practice_planning').incidents.count).toBeNull();
    expect(findStage(lens.stages, 'roster_onboarding').incidents.count).toBe(0);
    expect(lens.degradedNote).toContain('practice planning');
  });

  it('stages with no durable table (practice, stats, communications) leave attempts null', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    perTable['baseball_players'] = [() => ({ data: [], error: null })];
    perTable['baseball_developmental_plans'] = [() => ({ data: [], error: null })];

    const lens = await fetchBaseballJourneyLens(new Date('2026-09-03T00:00:00Z'));

    for (const id of ['practice_planning', 'stats_import', 'communications']) {
      expect(findStage(lens.stages, id).metric.attempts).toBeNull();
    }
  });

  it('paginates past the PostgREST 1000-row cap on baseball_players — a second page beyond the first 1000 still counts', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    const page1 = Array.from({ length: 1000 }, (_, i) => ({ id: `p${i}`, onboarding_completed: false }));
    const page2 = [{ id: 'p1000', onboarding_completed: true }];
    perTable['baseball_players'] = [() => ({ data: page1, error: null }), () => ({ data: page2, error: null })];
    perTable['baseball_developmental_plans'] = [() => ({ data: [], error: null })];

    const lens = await fetchBaseballJourneyLens(new Date('2026-09-03T00:00:00Z'));

    const roster = findStage(lens.stages, 'roster_onboarding');
    expect(roster.metric.attempts).toBe(1001);
    expect(roster.metric.completions).toBe(1); // only the page-2 row is onboarded
  });

  it('unknown vs zero: a succeeded count query with a null count (not an error) yields null, never a fabricated 0', async () => {
    perTable['admin_events'] = adminEventsDefaults({ 0: () => ({ count: null, error: null }) }); // roster incidents "all"
    perTable['baseball_players'] = [() => ({ data: [], error: null })];
    perTable['baseball_developmental_plans'] = [() => ({ data: [], error: null })];

    const lens = await fetchBaseballJourneyLens(new Date('2026-09-03T00:00:00Z'));

    expect(findStage(lens.stages, 'roster_onboarding').incidents.count).toBeNull();
  });
});

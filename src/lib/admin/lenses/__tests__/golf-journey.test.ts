import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueMockAdminClient, type MockResult } from './test-helpers';

const perTable: Record<string, Array<() => MockResult>> = {};
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => queueMockAdminClient(perTable),
}));

import { fetchGolfJourneyLens } from '../golf-journey';

/**
 * Call-order contract this file depends on (see golf-journey.ts):
 *   admin_events: [0] login count, [1] round_submitted count, [2] ai_generation
 *   count, then 5x(all,critical) incident pairs in stage order
 *   auth, hub, round, stats, coach -> indices [3..12].
 *   golf_rounds: [0] the window read.
 * A change to the module's query order must update these indices — that
 * coupling is the tradeoff for testing every stage without a live database.
 */
function zeroCount(): MockResult {
  return { count: 0, error: null };
}
function adminEventsDefaults(overrides: Record<number, () => MockResult> = {}): Array<() => MockResult> {
  const arr = Array.from({ length: 13 }, () => zeroCount);
  for (const [i, fn] of Object.entries(overrides)) arr[Number(i)] = fn;
  return arr;
}

function findStage<T extends { id: string }>(stages: readonly T[], id: string): T {
  const found = stages.find((s) => s.id === id);
  if (!found) throw new Error(`stage not found: ${id}`);
  return found;
}

describe('fetchGolfJourneyLens', () => {
  beforeEach(() => {
    for (const k of Object.keys(perTable)) delete perTable[k];
  });

  it('reports a genuine zero (not null) on an empty platform, and a null success rate rather than 0/0', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    perTable['golf_rounds'] = [() => ({ data: [], error: null })];

    const lens = await fetchGolfJourneyLens(new Date('2026-09-03T00:00:00Z'));

    const login = findStage(lens.stages, 'authenticate');
    expect(login.metric.attempts).toBe(0);
    expect(login.metric.successRate).toBeNull();

    const start = findStage(lens.stages, 'start_round');
    expect(start.metric.attempts).toBe(0);
    expect(start.metric.completions).toBe(0);
    expect(start.metric.successRate).toBeNull();
    expect(lens.degradedNote).toBeNull();
  });

  it('unknown vs zero: a failed golf_rounds read yields null attempts, not zero, and is disclosed in degradedNote', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    perTable['golf_rounds'] = [() => ({ error: { message: 'connection reset' } })];

    const lens = await fetchGolfJourneyLens(new Date('2026-09-03T00:00:00Z'));

    const start = findStage(lens.stages, 'start_round');
    expect(start.metric.attempts).toBeNull();
    expect(start.metric.completions).toBeNull();
    const submit = findStage(lens.stages, 'submit');
    expect(submit.metric.completions).toBeNull();
    expect(lens.degradedNote).toContain('golf_rounds read failed');
    expect(lens.degradedNote).toContain('connection reset');
  });

  it('blind source: a failed incident-count read for one stage stays null while other stages stay numeric', async () => {
    perTable['admin_events'] = adminEventsDefaults({
      7: () => ({ error: { message: 'timeout' } }), // round incidents "all"
    });
    perTable['golf_rounds'] = [() => ({ data: [], error: null })];

    const lens = await fetchGolfJourneyLens(new Date('2026-09-03T00:00:00Z'));

    const start = findStage(lens.stages, 'start_round');
    expect(start.incidents.count).toBeNull();
    const hub = findStage(lens.stages, 'dashboard');
    expect(hub.incidents.count).toBe(0);
    expect(lens.degradedNote).toContain('round incidents');
  });

  it('computes durable round counts from golf_rounds status/updated_at, not from admin_events', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    perTable['golf_rounds'] = [
      () => ({
        data: [
          { id: 'r1', status: 'in_progress', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }, // no autosave yet
          { id: 'r2', status: 'in_progress', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T01:00:00Z' }, // autosaved + resumed
          { id: 'r3', status: 'completed', created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T02:00:00Z' }, // submitted
        ],
        error: null,
      }),
    ];

    const lens = await fetchGolfJourneyLens(new Date('2026-09-03T00:00:00Z'));

    const start = findStage(lens.stages, 'start_round');
    expect(start.metric.attempts).toBe(3);

    const autosave = findStage(lens.stages, 'autosave');
    expect(autosave.metric.completions).toBe(2); // r2, r3 both updated after creation

    const resume = findStage(lens.stages, 'resume');
    expect(resume.metric.completions).toBe(1); // only r2 is in_progress AND updated

    const submit = findStage(lens.stages, 'submit');
    expect(submit.metric.completions).toBe(1); // only r3 completed
    expect(submit.metric.successRate).toBeCloseTo(1 / 3);
  });

  it('stages with no durable positive signal (dashboard, stats) never fabricate an attempt count', async () => {
    perTable['admin_events'] = adminEventsDefaults();
    perTable['golf_rounds'] = [() => ({ data: [], error: null })];

    const lens = await fetchGolfJourneyLens(new Date('2026-09-03T00:00:00Z'));

    expect(findStage(lens.stages, 'dashboard').metric.attempts).toBeNull();
    expect(findStage(lens.stages, 'stats').metric.attempts).toBeNull();
    expect(findStage(lens.stages, 'dashboard').confidence).toBe('incidents_only');
  });
});

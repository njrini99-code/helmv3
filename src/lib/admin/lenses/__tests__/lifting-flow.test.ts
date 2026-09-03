import { describe, it, expect, vi, beforeEach } from 'vitest';
import { queueMockAdminClient, type MockResult } from './test-helpers';

const perTable: Record<string, Array<() => MockResult>> = {};
vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => queueMockAdminClient(perTable),
}));

import { fetchLiftingFlowLens } from '../lifting-flow';

function empty(): MockResult {
  return { data: [], error: null };
}
function zeroCount(): MockResult {
  return { count: 0, error: null };
}
function findStage<T extends { id: string }>(stages: readonly T[], id: string): T {
  const found = stages.find((s) => s.id === id);
  if (!found) throw new Error(`stage not found: ${id}`);
  return found;
}

function seedEmptyPlatform() {
  perTable['helm_lifting_program_assignments'] = [empty];
  perTable['helm_lifting_sessions'] = [empty];
  perTable['helm_lifting_set_results'] = [empty];
  perTable['helm_lifting_maxes'] = [empty];
  perTable['helm_lifting_prs'] = [empty];
  perTable['admin_events'] = [zeroCount, zeroCount];
}

describe('fetchLiftingFlowLens', () => {
  beforeEach(() => {
    for (const k of Object.keys(perTable)) delete perTable[k];
  });

  it('an empty platform (no assignments) reports honest zeros end to end', async () => {
    seedEmptyPlatform();

    const lens = await fetchLiftingFlowLens(new Date('2026-09-03T00:00:00Z'));

    for (const stage of lens.stages) {
      expect(stage.metric.attempts === 0 || stage.metric.attempts === null).toBe(true);
    }
    const assigned = findStage(lens.stages, 'program_assigned');
    expect(assigned.metric.attempts).toBe(0);
    expect(assigned.metric.completions).toBe(0);
    expect(lens.degradedNote).toBeNull();
  });

  it('unknown vs zero: a failed helm_lifting_sessions read yields null for every stage that depends on it', async () => {
    seedEmptyPlatform();
    perTable['helm_lifting_sessions'] = [() => ({ error: { message: 'boom' } })];

    const lens = await fetchLiftingFlowLens(new Date('2026-09-03T00:00:00Z'));

    expect(findStage(lens.stages, 'session_opened').metric.completions).toBeNull();
    expect(findStage(lens.stages, 'readiness').metric.attempts).toBeNull();
    expect(findStage(lens.stages, 'completed').metric.completions).toBeNull();
    expect(lens.degradedNote).toContain('helm_lifting_sessions read failed');
  });

  it('computes the funnel honestly from durable table statuses', async () => {
    perTable['helm_lifting_program_assignments'] = [
      () => ({
        data: [
          { id: 'a1', status: 'published' },
          { id: 'a2', status: 'draft' },
        ],
        error: null,
      }),
    ];
    perTable['helm_lifting_sessions'] = [
      () => ({
        data: [
          { id: 's1', status: 'assigned', readiness_checkin_id: null, athlete_id: 'ath1' },
          { id: 's2', status: 'started', readiness_checkin_id: 'r1', athlete_id: 'ath2' },
          { id: 's3', status: 'completed', readiness_checkin_id: 'r2', athlete_id: 'ath3' },
        ],
        error: null,
      }),
    ];
    perTable['helm_lifting_set_results'] = [
      () => ({ data: [{ athlete_id: 'ath2' }, { athlete_id: 'ath2' }, { athlete_id: 'ath3' }], error: null }),
    ];
    perTable['helm_lifting_maxes'] = [() => ({ data: [{ athlete_id: 'ath3' }], error: null })];
    perTable['helm_lifting_prs'] = [() => ({ data: [], error: null })];
    perTable['admin_events'] = [zeroCount, zeroCount];

    const lens = await fetchLiftingFlowLens(new Date('2026-09-03T00:00:00Z'));

    expect(findStage(lens.stages, 'program_assigned').metric.completions).toBe(1); // 1 published
    expect(findStage(lens.stages, 'session_opened').metric.completions).toBe(2); // s2, s3 !== 'assigned'
    expect(findStage(lens.stages, 'readiness').metric.completions).toBe(2); // s2, s3 have readiness
    expect(findStage(lens.stages, 'sets_logged').metric.completions).toBe(2); // ath2, ath3 distinct
    expect(findStage(lens.stages, 'completed').metric.completions).toBe(1); // s3
    expect(findStage(lens.stages, 'progress_updated').metric.completions).toBe(1); // ath3 via maxes
  });

  it('blind source: a failed incident read is disclosed and every stage shares the null-safe incidents object', async () => {
    seedEmptyPlatform();
    perTable['admin_events'] = [() => ({ error: { message: 'sentry down' } }), zeroCount];

    const lens = await fetchLiftingFlowLens(new Date('2026-09-03T00:00:00Z'));

    expect(findStage(lens.stages, 'program_assigned').incidents.count).toBeNull();
    expect(lens.degradedNote).toContain('Lift Lab incidents count unreadable');
  });
});

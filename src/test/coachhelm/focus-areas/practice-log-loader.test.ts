/**
 * A8 slice 2 (read side): loadFocusAreaPracticeLogData batch-loads
 * golf_focus_area_criteria + golf_focus_area_practice_sessions for a set of
 * focus areas. Behind coachhelm_focus_area_practice_log (default off);
 * every test here confirms ZERO `.from()` calls while the flag mock returns
 * false, mirroring the same contract the action-file tests enforce.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

const isFlagEnabledMock = vi.fn();
vi.mock('@/lib/flags', () => ({
  isFlagEnabled: (...args: unknown[]) => isFlagEnabledMock(...args),
}));

import { loadFocusAreaPracticeLogData } from '@/lib/coachhelm/focus-areas/practice-log-loader';

type Row = Record<string, unknown>;

/** A minimal fake `.from(table).select(...).in(...).order(...).range(...)`
 *  chain. `rowsByTable` returns the FULL row set for a table in one page —
 *  fetchAllRows stops as soon as a page comes back shorter than 1000. */
function makeSupabase(rowsByTable: Record<string, Row[]>) {
  const fromCalls: string[] = [];
  return {
    _fromCalls: fromCalls,
    from: (table: string) => {
      fromCalls.push(table);
      return {
        select: (_cols: string) => ({
          in: (_col: string, _ids: string[]) => ({
            order: (_col2: string, _opts: unknown) => ({
              range: async (_from: number, _to: number) => ({
                data: rowsByTable[table] ?? [],
                error: null,
              }),
            }),
          }),
        }),
      };
    },
  };
}

beforeEach(() => {
  isFlagEnabledMock.mockReset().mockReturnValue(true);
});

describe('loadFocusAreaPracticeLogData', () => {
  it('returns empty maps and makes zero .from() calls when the flag is off', async () => {
    isFlagEnabledMock.mockReturnValue(false);
    const supabase = makeSupabase({});

    const result = await loadFocusAreaPracticeLogData(supabase as never, ['fa-1']);

    // A real, honest empty (flag off) -- not null. Only a read that actually
    // failed degrades to null; asking nothing is not failing.
    expect(result.criteriaByFocusArea).not.toBeNull();
    expect(result.practiceSummaryByFocusArea).not.toBeNull();
    expect(result.criteriaByFocusArea?.size).toBe(0);
    expect(result.practiceSummaryByFocusArea?.size).toBe(0);
    expect(supabase._fromCalls).toEqual([]);
  });

  it('returns empty maps and makes zero .from() calls when there are no focus area ids', async () => {
    const supabase = makeSupabase({});
    const result = await loadFocusAreaPracticeLogData(supabase as never, []);
    expect(result.criteriaByFocusArea).not.toBeNull();
    expect(result.criteriaByFocusArea?.size).toBe(0);
    expect(supabase._fromCalls).toEqual([]);
  });

  it('groups criteria by focus_area_id, preserving row shape', async () => {
    const supabase = makeSupabase({
      golf_focus_area_criteria: [
        { id: 'c1', focus_area_id: 'fa-1', label: 'Tempo', source: 'coach', met: false, met_at: null },
        { id: 'c2', focus_area_id: 'fa-1', label: 'Follow-through', source: 'coach', met: true, met_at: '2026-09-20T00:00:00Z' },
        { id: 'c3', focus_area_id: 'fa-2', label: 'Stance', source: 'coach', met: false, met_at: null },
      ],
      golf_focus_area_practice_sessions: [],
    });

    const result = await loadFocusAreaPracticeLogData(supabase as never, ['fa-1', 'fa-2']);

    expect(result.criteriaByFocusArea?.get('fa-1')).toEqual([
      { id: 'c1', label: 'Tempo', source: 'coach', met: false, met_at: null },
      { id: 'c2', label: 'Follow-through', source: 'coach', met: true, met_at: '2026-09-20T00:00:00Z' },
    ]);
    expect(result.criteriaByFocusArea?.get('fa-2')).toEqual([
      { id: 'c3', label: 'Stance', source: 'coach', met: false, met_at: null },
    ]);
    expect(result.criteriaByFocusArea?.has('fa-3')).toBe(false);
  });

  it('rolls sessions up to a count + the most recent practiced_at', async () => {
    const supabase = makeSupabase({
      golf_focus_area_criteria: [],
      golf_focus_area_practice_sessions: [
        { focus_area_id: 'fa-1', practiced_at: '2026-09-01T00:00:00Z' },
        { focus_area_id: 'fa-1', practiced_at: '2026-09-20T00:00:00Z' },
        { focus_area_id: 'fa-1', practiced_at: '2026-09-10T00:00:00Z' },
      ],
    });

    const result = await loadFocusAreaPracticeLogData(supabase as never, ['fa-1']);

    expect(result.practiceSummaryByFocusArea?.get('fa-1')).toEqual({
      count: 3,
      lastPracticedAt: '2026-09-20T00:00:00Z',
    });
  });

  it('degrades criteria to null (not an empty map) when that read fails, without throwing', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'golf_focus_area_criteria') {
          return {
            select: () => ({
              in: () => ({
                order: () => ({
                  range: async () => ({ data: null, error: { message: 'boom' } }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                range: async () => ({
                  data: [{ focus_area_id: 'fa-1', practiced_at: '2026-09-01T00:00:00Z' }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    };

    const result = await loadFocusAreaPracticeLogData(supabase as never, ['fa-1']);

    // null (unknown), not {} (verified empty) -- a failed read must not look
    // like "this focus area genuinely has no criteria".
    expect(result.criteriaByFocusArea).toBeNull();
    // The OTHER table's read is unaffected by the first table's failure.
    expect(result.practiceSummaryByFocusArea?.get('fa-1')).toEqual({
      count: 1,
      lastPracticedAt: '2026-09-01T00:00:00Z',
    });
  });

  it('degrades the practice summary to null (not an empty map) when that read fails, independently of criteria', async () => {
    const supabase = {
      from: (table: string) => {
        if (table === 'golf_focus_area_practice_sessions') {
          return {
            select: () => ({
              in: () => ({
                order: () => ({
                  range: async () => ({ data: null, error: { message: 'boom' } }),
                }),
              }),
            }),
          };
        }
        return {
          select: () => ({
            in: () => ({
              order: () => ({
                range: async () => ({
                  data: [{ id: 'c1', focus_area_id: 'fa-1', label: 'Tempo', source: 'coach', met: false, met_at: null }],
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    };

    const result = await loadFocusAreaPracticeLogData(supabase as never, ['fa-1']);

    expect(result.practiceSummaryByFocusArea).toBeNull();
    expect(result.criteriaByFocusArea?.get('fa-1')).toEqual([
      { id: 'c1', label: 'Tempo', source: 'coach', met: false, met_at: null },
    ]);
  });

  it('chunks a focus-area id list over 200 into separate .in() calls', async () => {
    const manyIds = Array.from({ length: 250 }, (_, i) => `fa-${i}`);
    const inCalls: unknown[][] = [];
    const supabase = {
      from: (_table: string) => ({
        select: () => ({
          in: (_col: string, ids: string[]) => {
            inCalls.push(ids);
            return {
              order: () => ({
                range: async () => ({ data: [], error: null }),
              }),
            };
          },
        }),
      }),
    };

    await loadFocusAreaPracticeLogData(supabase as never, manyIds);

    // Two tables x two chunks (200 + 50) = 4 .in() calls total.
    expect(inCalls).toHaveLength(4);
    expect(inCalls.filter((ids) => ids.length === 200)).toHaveLength(2);
    expect(inCalls.filter((ids) => ids.length === 50)).toHaveLength(2);
  });
});

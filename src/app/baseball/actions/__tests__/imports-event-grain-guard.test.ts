// =============================================================================
// src/app/baseball/actions/__tests__/imports-event-grain-guard.test.ts
//
// Regression pack — feature-sweep finding (bb-stats-import): the shared
// "Recent imports" list's Approve/Reject/Roll-back buttons are wired only to
// this file's box-score-shaped reviewImportRun/rollbackImport, but an
// EVENT-GRAIN run (created by stat-event-imports.ts) stages/commits a lineage
// row with a DIFFERENT unmatched_data shape: staged rows carry no `.matches`
// key, and a committed run's lineage carries no `.snapshot` key at all (not
// just an empty array). Before the fix, both functions treated "key absent"
// the same as "key present but empty" and silently reported a false success
// (0 created/updated, or 0 removed/restored) while still finalizing the run
// as committed/rolled_back — permanently and silently discarding the staged
// event data, or falsely claiming a rollback that never happened.
//
// getImportRuns (this file) also now excludes event-grain runs from the
// box-score wizard's history list entirely (same file:table convention:
// mapping_config.adapter present => event-grain, per stat-event-imports.ts's
// own staging comment) — these tests exercise the defense-in-depth guards in
// reviewImportRun/rollbackImport directly, independent of that list filter.
// =============================================================================

import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'user-1' },
          activeCoachId: 'coach-1',
          targetTeamId: 'team-1',
          activeTeamId: 'team-1',
        },
        ...args,
      ),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/app/baseball/actions/coachhelm', () => ({ runBaseballEngine: vi.fn(async () => {}) }));
vi.mock('@/lib/baseball/timeline-writer', () => ({
  appendImportTimelineEvent: vi.fn(async () => {}),
}));

type Row = Record<string, unknown>;

/** Controlled per test: what each table's terminal read resolves to. */
let importRunRow: Row | null = null;
let lineageRow: Row | null = null;

function tableHandle(table: string) {
  const result = (data: unknown) => ({ data, error: null });
  const chain: Record<string, unknown> = {};
  const ret = () => chain;
  for (const m of ['select', 'eq', 'in', 'order', 'limit', 'update']) chain[m] = vi.fn(ret);

  chain.maybeSingle = vi.fn(async () => {
    if (table === 'baseball_import_runs') return result(importRunRow);
    if (table === 'baseball_stat_uploads') return result(lineageRow);
    return result(null);
  });

  return chain;
}

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: (table: string) => tableHandle(table),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })) },
  })),
}));

import { reviewImportRun, rollbackImport } from '@/app/baseball/actions/imports';

describe('reviewImportRun — event-grain approve guard', () => {
  it('throws instead of silently approving a run staged with no `.matches` field', async () => {
    importRunRow = {
      id: 'run-1',
      team_id: 'team-1',
      status: 'review',
      review_state: 'pending_review',
      source_id: 'trackman',
      source_label: 'TrackMan',
      source_config_id: null,
    };
    // Event-grain staged shape (stat-event-imports.ts): `rows` present, no
    // `.matches` key at all — distinct from a box-score run with matches: [].
    lineageRow = {
      id: 'lineage-1',
      filename: 'events.csv',
      stat_type: 'game',
      session_date: '2026-03-01',
      session_name: 'TrackMan',
      mapping_config: { adapter: 'trackman' },
      unmatched_data: {
        staged: true,
        rows: [{ handle: 'p1', pitchType: 'FF' }],
        resolutionOverrides: [],
        gameId: null,
        sourceKey: 'trackman',
      },
    };

    await expect(
      reviewImportRun({ teamId: 'team-1', importRunId: 'run-1', decision: 'approve' }),
    ).rejects.toThrow(/event-level/i);
  });
});

describe('rollbackImport — event-grain rollback guard', () => {
  it('throws instead of falsely reporting a rollback with no `.snapshot` field', async () => {
    importRunRow = { id: 'run-1', team_id: 'team-1', status: 'committed' };
    // Event-grain committed lineage shape (stat-event-imports.ts): only
    // grain_counts/validation — no `snapshot` key at all.
    lineageRow = {
      id: 'lineage-1',
      unmatched_data: { grain_counts: { pitch: 12 }, validation: { issues: [] } },
    };

    await expect(
      rollbackImport({ teamId: 'team-1', importRunId: 'run-1' }),
    ).rejects.toThrow(/event-level/i);
  });
});

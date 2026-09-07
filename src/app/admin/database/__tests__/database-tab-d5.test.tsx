/**
 * D5 — component tests for the Database Tab's five new sections' empty and
 * populated states. Tested by calling each exported async Server Component
 * panel directly (`await SlowStatementsPanel()`) rather than through the
 * full page: under `@testing-library/react`'s reconciler a Suspense-wrapped
 * async component stays suspended on first render regardless of how fast
 * its data mock resolves (see `src/app/admin/work-log/__tests__/page.test.tsx`'s
 * header comment for the same finding), which would make an empty-vs-
 * populated distinction invisible if driven through the whole page.
 */
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';

vi.mock('@/lib/admin/database/statements', () => ({
  fetchSlowStatements: vi.fn(),
}));

vi.mock('@/lib/admin/database/analysis', () => ({
  fetchDatabaseAnalysis: vi.fn(),
}));

import { fetchSlowStatements } from '@/lib/admin/database/statements';
import { fetchDatabaseAnalysis } from '@/lib/admin/database/analysis';
import { SlowStatementsPanel, IndexSuggestionsPanel, UnusedIndexesPanel, CoveragePanel } from '../DatabaseTabPanels';

const mockedFetchSlowStatements = vi.mocked(fetchSlowStatements);
const mockedFetchDatabaseAnalysis = vi.mocked(fetchDatabaseAnalysis);

function emptyAnalysisSnapshot() {
  return {
    status: 'ok' as const,
    fetchedAt: '2026-09-06T00:00:00.000Z',
    data: {
      latestSampledAt: '2026-09-06T00:00:00.000Z',
      priorSampledAt: null,
      byCategory: {
        index_suggestion: [],
        unused_index: [],
        bloat: [],
        seq_scan_ratio: [],
        connections: [],
        locks: [],
        rls_coverage: [],
      },
      changeSince: [],
    },
  };
}

describe('SlowStatementsPanel', () => {
  it('renders an unconfigured empty state when the migration is HELD', async () => {
    mockedFetchSlowStatements.mockResolvedValue({
      status: 'unconfigured',
      data: null,
      fetchedAt: null,
      error: 'db_statement_samples (migration HELD — see supabase/migrations/HELD.md)',
    });
    render(await SlowStatementsPanel());
    expect(screen.getByText(/statement capture not shipped yet/i)).toBeInTheDocument();
    expect(screen.getByText(/HELD.md/)).toBeInTheDocument();
  });

  it('renders a no-data empty state when applied but nothing sampled yet', async () => {
    mockedFetchSlowStatements.mockResolvedValue({
      status: 'ok',
      fetchedAt: '2026-09-06T00:00:00.000Z',
      data: { latestSampledAt: null, topByTotal: [], topByMean: [], sparklines: {} },
    });
    render(await SlowStatementsPanel());
    expect(screen.getByText(/no statement samples yet/i)).toBeInTheDocument();
  });

  it('renders populated fixture rows for both rankings', async () => {
    const row = (overrides: Partial<Parameters<typeof Object.assign>[0]> = {}) => ({
      id: 1,
      sampledAt: '2026-09-06T00:00:00.000Z',
      rankPosition: 1,
      queryid: 'q1',
      safeQueryClass: 'unclassified',
      sourceClass: 'helm_product',
      calls: 42,
      rows: 100,
      totalExecMs: 5000,
      meanExecMs: 119.0,
      maxExecMs: 900,
      minExecMs: 10,
      ...overrides,
    });
    mockedFetchSlowStatements.mockResolvedValue({
      status: 'ok',
      fetchedAt: '2026-09-06T00:00:00.000Z',
      data: {
        latestSampledAt: '2026-09-06T00:00:00.000Z',
        topByTotal: [row()],
        topByMean: [row({ id: 2, queryid: 'q2' })],
        sparklines: {},
      },
    });
    render(await SlowStatementsPanel());
    expect(screen.getByText(/top 10 by mean time/i)).toBeInTheDocument();
    expect(screen.getByText(/top 10 by total time/i)).toBeInTheDocument();
    expect(screen.getAllByText(/42 calls · mean 119\.0ms/)).toHaveLength(2);
  });
});

describe('IndexSuggestionsPanel / UnusedIndexesPanel', () => {
  it('renders an all-clear state when the analysis window has zero findings', async () => {
    mockedFetchDatabaseAnalysis.mockResolvedValue(emptyAnalysisSnapshot());
    render(await IndexSuggestionsPanel());
    expect(screen.getByText(/no index suggestions/i)).toBeInTheDocument();
  });

  it('renders fixture unused-index findings', async () => {
    mockedFetchDatabaseAnalysis.mockResolvedValue({
      status: 'ok',
      fetchedAt: '2026-09-06T00:00:00.000Z',
      data: {
        latestSampledAt: '2026-09-06T00:00:00.000Z',
        priorSampledAt: null,
        byCategory: {
          ...emptyAnalysisSnapshot().data.byCategory,
          unused_index: [
            {
              id: 1,
              sampledAt: '2026-09-06T00:00:00.000Z',
              category: 'unused_index',
              subject: 'idx_unused_thing',
              payload: { index_name: 'idx_unused_thing', schema_name: 'public', idx_scan: 0 },
            },
          ],
        },
        changeSince: [],
      },
    });
    render(await UnusedIndexesPanel());
    expect(screen.getByText('idx_unused_thing')).toBeInTheDocument();
  });
});

describe('CoveragePanel', () => {
  it('always surfaces the third-finding notice pointing at the CLI script', async () => {
    mockedFetchDatabaseAnalysis.mockResolvedValue(emptyAnalysisSnapshot());
    render(await CoveragePanel());
    expect(screen.getByText(/npm run db:rls-coverage/)).toBeInTheDocument();
    expect(screen.getByText(/no rls\/grant coverage gaps/i)).toBeInTheDocument();
  });
});

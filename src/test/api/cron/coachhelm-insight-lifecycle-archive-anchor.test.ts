import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/lib/coachhelm/v2/analytics/effectiveness-writer', () => ({
  rollupInsightEffectivenessForYesterday: vi.fn(async () => ({ ok: true })),
}));

vi.mock('@/lib/coachhelm/v2/analytics/prediction-performance-writer', () => ({
  rollupPredictionPerformanceRolling30d: vi.fn(async () => ({ ok: true })),
}));

import { GET } from '@/app/api/cron/coachhelm-insight-lifecycle/route';
import { createAdminClient } from '@/lib/supabase/admin';

const createAdminMock = vi.mocked(createAdminClient);

const DAY_MS = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-06-25T02:00:00.000Z');

function daysAgoIso(days: number): string {
  return new Date(NOW - days * DAY_MS).toISOString();
}

interface FakeRow {
  id: string;
  lifecycle_state: string;
  evidence: unknown;
  metadata: Record<string, unknown> | null;
  created_at: string;
  addressed_at: string | null;
  archived_at: string | null;
  resolved_at: string | null;
  updated_at: string;
}

/**
 * Build a single-page admin client that returns `rows` from the first
 * `.limit()` and an empty page thereafter, while recording every
 * `update(patch).eq('id', id)` so tests can assert per-row archive decisions.
 */
function buildSupabase(rows: FakeRow[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  let served = false;

  const insightsBuilder = {
    select: vi.fn(() => insightsBuilder),
    in: vi.fn(() => insightsBuilder),
    lt: vi.fn(() => insightsBuilder),
    order: vi.fn(() => insightsBuilder),
    or: vi.fn(() => insightsBuilder),
    limit: vi.fn(async () => {
      if (served) return { data: [], error: null };
      served = true;
      return { data: rows, error: null };
    }),
    update: vi.fn((patch: Record<string, unknown>) => ({
      eq: vi.fn(async (_col: string, id: string) => {
        updates.push({ id, patch });
        return { error: null };
      }),
    })),
  };

  return {
    updates,
    insightsBuilder,
    client: {
      from: vi.fn((table: string) => {
        if (table === 'golf_coach_insights') return insightsBuilder;
        throw new Error(`Unexpected table: ${table}`);
      }),
    } as unknown as ReturnType<typeof createAdminClient>,
  };
}

async function runWithRows(rows: FakeRow[]) {
  const { client, updates } = buildSupabase(rows);
  createAdminMock.mockReturnValueOnce(client);
  const res = await GET(
    new NextRequest('http://x/api/cron/coachhelm-insight-lifecycle', {
      headers: { authorization: 'Bearer secret' },
    }),
  );
  expect(res.status).toBe(200);
  return { updates, res };
}

function archivePatchFor(
  updates: Array<{ id: string; patch: Record<string, unknown> }>,
  id: string,
): Record<string, unknown> | undefined {
  return updates.find((u) => u.id === id && u.patch.lifecycle_state === 'archived')?.patch;
}

/** A detected row with movement_count 0. evidence:null so only archive rules can fire. */
function detectedRow(overrides: Partial<FakeRow>): FakeRow {
  return {
    id: overrides.id ?? 'row',
    lifecycle_state: 'detected',
    evidence: null,
    metadata: { movement_count: 0 },
    created_at: daysAgoIso(40),
    addressed_at: null,
    archived_at: null,
    resolved_at: null,
    // updated_at must pre-date the 6h stale window so the row is scanned at all.
    updated_at: daysAgoIso(1),
    ...overrides,
  };
}

describe('insight lifecycle archive anchors on most recent sign of life', () => {
  beforeEach(() => {
    createAdminMock.mockReset();
    process.env.CRON_SECRET = 'secret';
    vi.setSystemTime(NOW);
  });

  afterEach(() => {
    delete process.env.CRON_SECRET;
    vi.useRealTimers();
  });

  it('(a) created 40d ago but refreshed yesterday + movement 0 -> NOT archived', async () => {
    const row = detectedRow({
      id: 'a',
      created_at: daysAgoIso(40),
      metadata: { movement_count: 0, last_refreshed_at: daysAgoIso(1) },
    });
    const { updates } = await runWithRows([row]);
    expect(archivePatchFor(updates, 'a')).toBeUndefined();
  });

  it('(b) created 40d ago, last refresh 35d ago, movement 0 -> archived (Rule 2)', async () => {
    const row = detectedRow({
      id: 'b',
      created_at: daysAgoIso(40),
      metadata: { movement_count: 0, last_refreshed_at: daysAgoIso(35) },
    });
    const { updates } = await runWithRows([row]);
    const patch = archivePatchFor(updates, 'b');
    expect(patch).toBeDefined();
    expect(patch?.archived_at).toBeDefined();
  });

  it('(c) created 40d ago but redetected_at recent -> NOT archived', async () => {
    const row = detectedRow({
      id: 'c',
      created_at: daysAgoIso(40),
      metadata: { movement_count: 0, redetected_at: daysAgoIso(2) },
    });
    const { updates } = await runWithRows([row]);
    expect(archivePatchFor(updates, 'c')).toBeUndefined();
  });

  it('(d) >90d old but refreshed daily -> NOT archived (Rule 3 defeated by liveness)', async () => {
    const row = detectedRow({
      id: 'd',
      created_at: daysAgoIso(120),
      metadata: { movement_count: 0, last_refreshed_at: daysAgoIso(1) },
    });
    const { updates } = await runWithRows([row]);
    expect(archivePatchFor(updates, 'd')).toBeUndefined();
  });

  it('(e) >90d stale on all anchors -> archived (Rule 3)', async () => {
    const row = detectedRow({
      id: 'e',
      created_at: daysAgoIso(120),
      // last refresh + redetected both older than 90d
      metadata: { movement_count: 0, last_refreshed_at: daysAgoIso(100), redetected_at: daysAgoIso(95) },
    });
    const { updates } = await runWithRows([row]);
    const patch = archivePatchFor(updates, 'e');
    expect(patch).toBeDefined();
    expect(patch?.archived_at).toBeDefined();
  });

  it('parses malformed/absent metadata timestamps defensively (falls back to created_at)', async () => {
    // created 40d ago, no movement, garbage refresh timestamps -> still archived by Rule 2
    const garbage = detectedRow({
      id: 'g',
      created_at: daysAgoIso(40),
      metadata: { movement_count: 0, last_refreshed_at: 'not-a-date', redetected_at: 12345 },
    });
    // created 20d ago, garbage timestamps -> NOT old enough on created_at -> NOT archived
    const young = detectedRow({
      id: 'y',
      created_at: daysAgoIso(20),
      metadata: { movement_count: 0, last_refreshed_at: 'nope' },
    });
    const { updates } = await runWithRows([garbage, young]);
    expect(archivePatchFor(updates, 'g')).toBeDefined();
    expect(archivePatchFor(updates, 'y')).toBeUndefined();
  });

  it('Rule 4 recency decay still anchors on created_at, not the liveness anchor', async () => {
    // 60d old, refreshed yesterday (so Rule 2/3 see it as ALIVE and skip archive),
    // but evidence window is 14d so created_at-based recency decay MUST still apply.
    const row: FakeRow = {
      id: 'r4',
      lifecycle_state: 'detected',
      evidence: {
        your_value: 10,
        your_value_display: '10',
        comparison_value: 10,
        comparison_value_display: '10',
        sample_size: 30,
        window_days: 14,
        confidence: 0.9,
        confidence_factors: {
          sample_adequacy: 1,
          recency: 1,
          variance: 1,
          factors_measured: true,
        },
      },
      metadata: { movement_count: 0, last_refreshed_at: daysAgoIso(1) },
      created_at: daysAgoIso(60),
      addressed_at: null,
      archived_at: null,
      resolved_at: null,
      updated_at: daysAgoIso(1),
    };
    const { updates } = await runWithRows([row]);
    // Not archived (alive), but a recency-decay evidence patch was written.
    expect(archivePatchFor(updates, 'r4')).toBeUndefined();
    const patch = updates.find((u) => u.id === 'r4')?.patch;
    expect(patch).toBeDefined();
    const evidence = patch?.evidence as { confidence_factors?: { recency?: number } } | undefined;
    expect(evidence?.confidence_factors?.recency).toBeLessThan(1);
  });
});

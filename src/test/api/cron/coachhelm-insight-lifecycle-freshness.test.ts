/**
 * Lifecycle cron freshness + healthy-cycle contracts (2026-09-12 repair).
 *
 *  - Rule 4 recency decay anchors on the evidence's last refresh (the same
 *    liveness anchor Rules 2/3 use), not on the row's birth date. A row the
 *    engine recomputed yesterday carries yesterday's 90-day window; decaying
 *    it because `created_at` is old contradicts the engine and, under the old
 *    honest-mode formula, *raised* confidence (0.24 → 0.56).
 *  - Decay can only lower confidence.
 *  - Rule 1 counts a healthy cycle once per distinct evidence snapshot: two
 *    cron passes over the same numbers are one observation, not two.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn().mockResolvedValue(undefined) }));
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
const NOW = Date.parse('2026-09-12T04:00:00.000Z');
const daysAgoIso = (days: number) => new Date(NOW - days * DAY_MS).toISOString();

interface FakeRow {
  id: string;
  lifecycle_state: string;
  evidence: Record<string, unknown> | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
  addressed_at: string | null;
  archived_at: string | null;
  resolved_at: string | null;
  updated_at: string;
}

function buildSupabase(rows: FakeRow[]) {
  const updates: Array<{ id: string; patch: Record<string, unknown> }> = [];
  let served = false;
  const builder = {
    select: vi.fn(() => builder),
    in: vi.fn(() => builder),
    lt: vi.fn(() => builder),
    order: vi.fn(() => builder),
    or: vi.fn(() => builder),
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
    client: {
      from: vi.fn((table: string) => {
        if (table === 'golf_coach_insights') return builder;
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
  return updates;
}

function honestEvidence(sampleAdequacy: number, overrides: Record<string, unknown> = {}) {
  return {
    metric: 'approach_green_hit_125_175',
    your_value: 29,
    comparison_value: 65,
    sample_n: 45,
    window_days: 90,
    confidence: sampleAdequacy,
    confidence_factors: {
      sample_adequacy: sampleAdequacy, recency: 1, variance: 0.5, factors_measured: false,
    },
    ...overrides,
  };
}

function row(overrides: Partial<FakeRow>): FakeRow {
  return {
    id: 'r',
    lifecycle_state: 'detected',
    evidence: honestEvidence(0.24),
    metadata: { movement_count: 1 },
    created_at: daysAgoIso(200),
    addressed_at: null,
    archived_at: null,
    resolved_at: null,
    updated_at: daysAgoIso(1),
    ...overrides,
  };
}

describe('lifecycle cron Rule 4 freshness anchor', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.CRON_SECRET = 'secret';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('does not decay a row the engine refreshed yesterday, however old its created_at', async () => {
    const updates = await runWithRows([
      row({ id: 'fresh', metadata: { movement_count: 1, last_refreshed_at: daysAgoIso(1) } }),
    ]);
    expect(updates.find((u) => u.id === 'fresh')).toBeUndefined();
  });

  it('decays a row whose last refresh is past its window, and only ever lowers confidence', async () => {
    const stale = row({
      id: 'stale',
      lifecycle_state: 'matured',
      evidence: honestEvidence(0.24),
      metadata: { movement_count: 3, last_refreshed_at: daysAgoIso(120) },
      created_at: daysAgoIso(400),
    });
    const updates = await runWithRows([stale]);
    const patch = updates.find((u) => u.id === 'stale')?.patch;
    expect(patch).toBeDefined();
    const ev = patch?.evidence as { confidence: number; confidence_factors: Record<string, unknown> };
    expect(ev.confidence_factors.recency).toBeLessThan(1);
    expect(ev.confidence).toBeLessThanOrEqual(0.24); // old formula produced ~0.5 here
    expect(ev.confidence_factors.method_version).toBe('honest_v2');
  });

  it('never promotes from the cron: a stale tentative row with a passing stored confidence stays tentative', async () => {
    const updates = await runWithRows([
      row({
        id: 't',
        lifecycle_state: 'tentative',
        evidence: honestEvidence(1),
        metadata: { movement_count: 0, last_refreshed_at: daysAgoIso(100) },
      }),
    ]);
    const patch = updates.find((u) => u.id === 't')?.patch;
    expect(patch?.lifecycle_state).not.toBe('detected');
  });
});

describe('lifecycle cron Rule 1 counts healthy cycles per evidence snapshot', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    process.env.CRON_SECRET = 'secret';
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  const healthy = (sampleN: number) =>
    honestEvidence(1, { your_value: 60, comparison_value: 65, sample_n: sampleN });

  it('the same numbers scanned twice count once; new evidence in band resolves', async () => {
    const first = row({
      id: 'a', lifecycle_state: 'addressed', addressed_at: daysAgoIso(5),
      evidence: healthy(40), metadata: { movement_count: 2, last_refreshed_at: daysAgoIso(1) },
    });
    const u1 = await runWithRows([first]);
    const m1 = u1.find((u) => u.id === 'a')?.patch.metadata as Record<string, unknown>;
    expect(m1.healthy_cycles_count).toBe(1);

    // Second pass, identical evidence → no second cycle, no resolution.
    const u2 = await runWithRows([{ ...first, metadata: m1 }]);
    const p2 = u2.find((u) => u.id === 'a')?.patch;
    expect(p2?.lifecycle_state).toBeUndefined();
    const m2 = (p2?.metadata as Record<string, unknown> | undefined) ?? m1;
    expect(m2.healthy_cycles_count).toBe(1);

    // Third pass with a new round in the sample → second cycle → resolved.
    const u3 = await runWithRows([{ ...first, evidence: healthy(48), metadata: m2 }]);
    const p3 = u3.find((u) => u.id === 'a')?.patch;
    expect(p3?.lifecycle_state).toBe('resolved');
    expect((p3?.metadata as Record<string, unknown>).healthy_cycles_count).toBe(2);
  });
});

/**
 * #1503 — loadGenome/loadGenomes must not surface a row that has nothing
 * computed as if it were a real genome.
 *
 * Two ways a stored row ends up with zero non-null dimensions:
 *
 *   1. A REFUSAL MARKER. `computeGenomeForPlayer` (orchestrator.ts) now writes
 *      a row even when every dimension refuses, so `selectGenomeRefreshChunk`
 *      stops reading that player as never-computed and re-queuing them every
 *      night forever. That row's `computed_at` is real (the selector needs
 *      it) but there is nothing in it worth showing a coach or player.
 *   2. Every dimension the row ever had has since been RETIRED
 *      (dimension-validity.ts) — same "nothing to show" outcome, different
 *      cause.
 *
 * Both must render EXACTLY like "no row exists yet" — the genome page's
 * Compute-now prompt, the compare page's "not analysed" state — because that
 * is the honest description and the only alternative (showing an empty
 * genome as if it were a real one) is the trust-eroding state P2-21 forbids.
 */
import { describe, it, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { loadGenome, loadGenomes } from '@/lib/coachhelm/v3/genome/loader';

interface Row {
  player_id: string;
  vector: unknown;
  computed_at: string | null;
  rounds_basis: number;
}

function makeSb(rows: Row[]) {
  return {
    from: () => ({
      select: () => ({
        eq: (_col: string, val: string) => ({
          maybeSingle: async () => ({
            data: rows.find((r) => r.player_id === val) ?? null,
            error: null,
          }),
        }),
        in: (_col: string, vals: string[]) =>
          Promise.resolve({
            data: rows.filter((r) => vals.includes(r.player_id)),
            error: null,
          }),
      }),
    }),
  } as unknown as SupabaseClient<Database>;
}

const NULL_SLOT = { value: null, confidence: null, label: 'Needs more rounds' };
const REAL_SLOT = { value: 42, confidence: 0.8 };

// Refusal marker: same shape orchestrator.ts writes when dimensions_computed
// === 0 — computed_at IS set, every slot is explicitly labeled null.
const refusalMarker: Row = {
  player_id: 'refused-1',
  vector: { scoring_trend: NULL_SLOT, pressure_delta: NULL_SLOT },
  computed_at: '2026-08-20T02:00:00.000Z',
  rounds_basis: 6,
};

// A row whose only dimensions are the two retired ones, computed before their
// epoch — fully retired means zero non-null dimensions post-retirement.
const fullyRetired: Row = {
  player_id: 'retired-1',
  vector: {
    miss_side_bias: { value: 'left', confidence: 0.9 },
    scrambling_rate: { value: 55, confidence: 0.7 },
  },
  computed_at: '2026-08-01T00:00:00.000Z', // before the 2026-08-17 epoch
  rounds_basis: 12,
};

const realGenome: Row = {
  player_id: 'real-1',
  vector: { scoring_trend: REAL_SLOT, pressure_delta: NULL_SLOT },
  computed_at: '2026-08-19T00:00:00.000Z',
  rounds_basis: 15,
};

describe('loadGenome — #1503 refusal markers read as uncomputed', () => {
  it('returns null for a refusal marker (all dimensions null, computed_at set)', async () => {
    const sb = makeSb([refusalMarker]);
    expect(await loadGenome(sb, 'refused-1')).toBeNull();
  });

  it('returns null for a row whose every dimension has since been retired', async () => {
    const sb = makeSb([fullyRetired]);
    expect(await loadGenome(sb, 'retired-1')).toBeNull();
  });

  it('returns null when no row exists at all — same outcome, different cause', async () => {
    const sb = makeSb([]);
    expect(await loadGenome(sb, 'nobody')).toBeNull();
  });

  it('still returns a real genome when at least one dimension has a value', async () => {
    const sb = makeSb([realGenome]);
    const loaded = await loadGenome(sb, 'real-1');
    expect(loaded).not.toBeNull();
    expect(loaded!.computed_at).toBe('2026-08-19T00:00:00.000Z');
    expect(loaded!.vector.scoring_trend?.value).toBe(42);
  });
});

describe('loadGenomes — #1503 refusal markers dropped from the batch', () => {
  it('drops a refusal marker from the result, keeping real genomes in the same call', async () => {
    const sb = makeSb([refusalMarker, realGenome]);
    const loaded = await loadGenomes(sb, ['refused-1', 'real-1']);

    expect(loaded.map((g) => g.player_id)).toEqual(['real-1']);
  });

  it('drops a fully-retired row from the batch', async () => {
    const sb = makeSb([fullyRetired, realGenome]);
    const loaded = await loadGenomes(sb, ['retired-1', 'real-1']);

    expect(loaded.map((g) => g.player_id)).toEqual(['real-1']);
  });

  it('returns an empty array when every requested player is a refusal marker', async () => {
    const sb = makeSb([refusalMarker]);
    expect(await loadGenomes(sb, ['refused-1'])).toEqual([]);
  });

  it('returns an empty array for an empty id list without querying', async () => {
    const sb = makeSb([realGenome]);
    expect(await loadGenomes(sb, [])).toEqual([]);
  });
});

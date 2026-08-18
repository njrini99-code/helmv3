import { describe, it, expect, vi } from 'vitest';
import { getPuttingDistanceProfile } from '@/lib/coachhelm/v3/chat/read-tools';
import { PUTT_DISTANCE_BUCKETS } from '@/lib/coachhelm/v3/chat/metrics-catalog';
import type { CoachChatContext } from '@/lib/coachhelm/v3/chat/context';

/**
 * `get_putting_distance_profile` charted an unfalsifiable percentage.
 *
 * The 0-3 ft bucket is the ONLY one defined with `attemptsColumn: null` — there
 * is no `putt_attempts_0_3ft` column on `golf_player_stats_cache` (verified
 * against production 2026-08-18; every other bucket has its attempts column).
 *
 * The skip guard read:
 *
 *     const attempts = b.attemptsColumn ? int(row[b.attemptsColumn]) : 0;
 *     // A bucket with no attempt column cannot support a claim, so it is not
 *     // charted — an unfalsifiable percentage is worse than a gap in the chart.
 *     if (b.attemptsColumn && attempts === 0) continue;
 *
 * The comment describes a bucket with NO attempts column. The condition
 * requires `b.attemptsColumn` to be truthy, so that bucket is the one case the
 * guard cannot catch: it falls through with `attempts = 0`, gets charted, and
 * the measurement builder then stamps it
 *
 *     coverage: 'partial', coverage_note: 'Only 0 attempts recorded.'
 *
 * A make rate reported over zero attempts is exactly the fabricated-zero state
 * the golf review rules forbid, and it reached the coach through Ask CoachHelm.
 * All 42 production stats-cache rows carry `putt_make_pct_0_3ft` (avg 97.9%),
 * so this fired for every player with putting data.
 */

function sbWith(responses: Record<string, { data: unknown; error?: unknown }>) {
  const builder = (table: string) => {
    const result = responses[table] ?? { data: [], error: null };
    const chain: Record<string, unknown> = {};
    for (const method of ['select', 'eq', 'in', 'order', 'gte', 'lte', 'neq', 'limit']) {
      chain[method] = vi.fn(() => chain);
    }
    chain.maybeSingle = vi.fn(async () => result);
    chain.single = vi.fn(async () => result);
    chain.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
    return chain;
  };
  return { from: vi.fn((table: string) => builder(table)) } as never;
}

const ctx: CoachChatContext = {
  coach_id: 'c1',
  user_id: 'u1',
  team_id: 'team-1',
  team_name: 'Rini University',
  timezone: 'America/New_York',
  roster: [
    { id: 'p1', name: 'Luke Wise', first_name: 'Luke', last_name: 'Wise', graduation_year: null },
  ],
};

/** A stats row with a real 0-3 ft rate and real attempts everywhere else. */
function statsRow() {
  return {
    player_id: 'p1',
    updated_at: '2026-08-18T00:00:00.000Z',
    calculation_period_start: '2026-05-20',
    calculation_period_end: '2026-08-18',
    first_round_date: '2026-02-27',
    last_round_date: '2026-07-29',
    putt_make_pct_0_3ft: 97.9,
    putt_make_pct_3_5ft: 62.0,
    putt_attempts_3_5ft: 40,
    putt_make_pct_5_10ft: 34.0,
    putt_attempts_5_10ft: 55,
    putt_make_pct_10_15ft: 18.0,
    putt_attempts_10_15ft: 48,
    putt_make_pct_15_25ft: 9.0,
    putt_attempts_15_25ft: 44,
    putt_make_pct_25_plus_ft: 2.0,
    putt_attempts_25_plus_ft: 39,
  };
}

describe('getPuttingDistanceProfile — a bucket with no attempts column', () => {
  it('is the only bucket defined without an attempts column (fixture guard)', () => {
    const without = PUTT_DISTANCE_BUCKETS.filter((b) => !b.attemptsColumn).map((b) => b.bucket);
    expect(without).toEqual(['0-3 ft']);
  });

  it('never reports a make rate over zero attempts', async () => {
    const sb = sbWith({ golf_player_stats_cache: { data: statsRow(), error: null } });
    const out = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1' });

    for (const m of out.measurements) {
      expect(
        m.sample_size,
        `${m.metric_label} was charted with sample_size ${m.sample_size}`,
      ).toBeGreaterThan(0);
    }
  });

  it('never emits the self-contradicting "Only 0 attempts recorded." note', async () => {
    const sb = sbWith({ golf_player_stats_cache: { data: statsRow(), error: null } });
    const out = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1' });

    const notes = out.measurements.map((m) => m.coverage_note ?? '');
    expect(notes.some((n) => /only 0 attempts/i.test(n))).toBe(false);
  });

  it('omits the 0-3 ft bucket rather than charting it unfalsifiably', async () => {
    const sb = sbWith({ golf_player_stats_cache: { data: statsRow(), error: null } });
    const out = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1' });

    expect(out.measurements.map((m) => m.metric_id)).not.toContain('putt_make_pct_0-3 ft');
    expect(out.series[0]?.points.map((p) => p.bucket)).not.toContain('0-3 ft');
  });

  it('still charts every bucket that DOES carry attempts', async () => {
    const sb = sbWith({ golf_player_stats_cache: { data: statsRow(), error: null } });
    const out = await getPuttingDistanceProfile(sb, ctx, { player_id: 'p1' });

    expect(out.series[0]?.points.map((p) => p.bucket)).toEqual([
      '3-5 ft',
      '5-10 ft',
      '10-15 ft',
      '15-25 ft',
      '25+ ft',
    ]);
  });
});

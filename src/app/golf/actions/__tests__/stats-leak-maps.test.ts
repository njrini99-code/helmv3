import { describe, it, expect, vi, beforeEach } from 'vitest';

// ---------------------------------------------------------------------------
// Mock Supabase with a chainable, PAGINATION-AWARE query builder.
//
// PostgREST hard-caps every response at 1000 rows, so the leak-map loaders
// must paginate via `.order('id').range(from, to)` and accumulate pages. The
// mock honors `.range()` by slicing the table's backing rows, which means an
// unpaginated fetch (or one that stops after the first page) can only ever
// see 1000 rows — the regression these tests guard against.
// ---------------------------------------------------------------------------

const ROUND_COUNT = 1500; // > 1000 → requires two pages

const roundRows: Array<{ id: string }> = Array.from(
  { length: ROUND_COUNT },
  (_, i) => ({ id: `round-${i}` }),
);

let shotRows: Array<Record<string, unknown>> = [];

function createPagedQueryMock(rows: Array<Record<string, unknown>>) {
  let from = 0;
  let to = rows.length - 1;
  // The `.in(col, values)` filters actually applied, so this stub MODELS the
  // filter instead of ignoring it. Round-id reads are chunked (200 ids per
  // request — `.in()` travels in the URL and the PostgREST edge rejects past
  // ~585 uuids), and a stub that returns every row for every chunk multiplies
  // the dataset by the chunk count. That is a harness artifact, not a real
  // double-count: a shot carries ONE round_id and chunks partition the ids
  // disjointly, so no row can match two chunks in production.
  const inFilters: Array<{ column: string; values: unknown[] }> = [];
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'not', 'order', 'limit']) {
    chain[method] = vi.fn(() => chain);
  }
  chain.in = vi.fn((column: string, values: unknown[]) => {
    if (Array.isArray(values)) inFilters.push({ column, values });
    return chain;
  });
  function applyFilters(source: Array<Record<string, unknown>>) {
    if (inFilters.length === 0) return source;
    return source.filter((row) =>
      inFilters.every(({ column, values }) =>
        // Only constrain on columns the row actually carries; the production
        // query also filters on shot_type/result, which these fixtures omit.
        !(column in row) || values.includes(row[column])
      ),
    );
  }
  chain.range = vi.fn((f: number, t: number) => {
    from = f;
    to = t;
    return chain;
  });
  // maybeSingle: used by resolvePlayerTeamGender (golf_team_members) and
  // other single-row lookups. Returns the first row or null.
  chain.maybeSingle = vi.fn(async () => ({
    data: rows.length > 0 ? rows[0] : null,
    error: null,
  }));
  // Thenable so both `await query` and `fetchAllRowsResult` page calls work.
  chain.then = (
    resolve: (value: {
      data: Array<Record<string, unknown>>;
      error: null;
    }) => unknown,
  ) => Promise.resolve({ data: applyFilters(rows).slice(from, to + 1), error: null }).then(resolve);
  return chain;
}

const mockFrom = vi.fn((table: string) => {
  if (table === 'golf_rounds') return createPagedQueryMock(roundRows);
  if (table === 'golf_shots') return createPagedQueryMock(shotRows);
  return createPagedQueryMock([]); // golf_pga_standards et al.
});

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    from: mockFrom,
    auth: {
      getUser: vi.fn(async () => ({ data: { user: { id: 'user-1' } }, error: null })),
    },
  })),
}));

vi.mock('@/lib/auth/session', () => ({
  getGolfSessionProfile: vi.fn(async () => null),
}));

vi.mock('@/lib/coachhelm/v3/standing/loader', () => ({
  loadPlayerStandingMap: vi.fn(async () => new Map()),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => undefined),
}));

vi.mock('../stats-data', () => ({
  verifyPlayerAccess: vi.fn(async () => true),
}));

// ---------------------------------------------------------------------------
// Import after mocks
// ---------------------------------------------------------------------------

import { getPuttMakeLeakMap, getApproachProximityLeakMap } from '../stats-leak-maps';

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

function shotPageCalls(): number {
  return mockFrom.mock.calls.filter(([table]) => table === 'golf_shots').length;
}

describe('stats-leak-maps pagination (PostgREST 1000-row cap)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    shotRows = [];
  });

  describe('getPuttMakeLeakMap', () => {
    it('accumulates putt shots past 1000 rows via paged fetches', async () => {
      // 1500 gradeable putts at 4 ft (band 3_5), alternating made/missed.
      shotRows = Array.from({ length: 1500 }, (_, i) => ({
        round_id: `round-${i % ROUND_COUNT}`,
        putt_distance_feet: 4,
        putt_made: i % 2 === 0,
      }));

      const result = await getPuttMakeLeakMap('player-1');

      expect(result.success).toBe(true);
      const band = result.data?.putting.find((b) => b.bucket_id === '3_5');
      // An unpaginated fetch would cap sample_n at 1000.
      expect(band?.sample_n).toBe(1500);
      expect(band?.team_value).toBe(50);
      // The shots fetch must have requested more than one page.
      expect(shotPageCalls()).toBeGreaterThanOrEqual(2);
    });

    it('paginates the completed-round-id fetch past 1000 rows', async () => {
      const result = await getPuttMakeLeakMap('player-1');

      expect(result.success).toBe(true);
      // 1500 completed rounds — truncation at 1000 would under-report this.
      expect(result.data?.roundsIncluded).toBe(ROUND_COUNT);
      expect(
        mockFrom.mock.calls.filter(([table]) => table === 'golf_rounds').length,
      ).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getApproachProximityLeakMap', () => {
    it('accumulates approach shots past 1000 rows via paged fetches', async () => {
      // 1500 on-green approaches from 100 yd, alternating 30 ft / 10 ft leaves.
      shotRows = Array.from({ length: 1500 }, (_, i) => ({
        round_id: `round-${i % ROUND_COUNT}`,
        distance_to_hole_before: 100,
        distance_to_hole_after: i % 2 === 0 ? 30 : 10,
        distance_unit_after: 'feet',
        result: 'green',
      }));

      const result = await getApproachProximityLeakMap('player-1');

      expect(result.success).toBe(true);
      const band = result.data?.approach.find((b) => b.bucket_id === '50_125');
      // An unpaginated fetch would cap sample_n at 1000.
      expect(band?.sample_n).toBe(1500);
      expect(band?.team_value).toBe(20);
      expect(shotPageCalls()).toBeGreaterThanOrEqual(2);
    });

    it('still normalizes yard-tagged leaves and drops outliers across pages', async () => {
      // Page-spanning mix: 1200 rows at 10 yd (= 30 ft) plus 300 outliers
      // beyond the 150 ft proximity ceiling that must all be excluded.
      shotRows = [
        ...Array.from({ length: 1200 }, (_, i) => ({
          round_id: `round-${i % ROUND_COUNT}`,
          distance_to_hole_before: 150,
          distance_to_hole_after: 10,
          distance_unit_after: 'yards',
          result: 'green',
        })),
        ...Array.from({ length: 300 }, (_, i) => ({
          round_id: `round-${i % ROUND_COUNT}`,
          distance_to_hole_before: 150,
          distance_to_hole_after: 200,
          distance_unit_after: 'feet',
          result: 'green',
        })),
      ];

      const result = await getApproachProximityLeakMap('player-1');

      expect(result.success).toBe(true);
      const band = result.data?.approach.find((b) => b.bucket_id === '125_175');
      expect(band?.sample_n).toBe(1200);
      expect(band?.team_value).toBe(30);
    });
  });
});

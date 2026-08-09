import { describe, it, expect, vi, beforeEach } from 'vitest';

/**
 * C18's fail-open sites were fixed: all three recipient reads now bind `error`
 * and fail closed. This is the fourth path in that finding, the one that needs
 * no fault at all.
 *
 * The recipient fan-out was a single bounded read — `.limit(1000)`. The filter
 * that consumes it treats "no recipient rows for this announcement" as
 * "addressed to the whole team", which is correct for a genuinely untargeted
 * announcement. But PostgREST returns the first 1000 rows and no error, so once
 * a team accumulates more than 1000 recipient rows across its recent
 * announcements, every announcement past the cut comes back with an empty
 * recipient list and is republished to the entire roster — silently, with
 * nothing to read in a log, because nothing failed.
 *
 * The read is now paginated. The cap is a property of the transport, not an
 * answer about who an announcement is for.
 *
 * The other fan-outs on this path (acks, tasks, docs) keep their bounded limit
 * deliberately — they feed display counts, where a truncated number is a wrong
 * number, not a disclosure.
 */

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
  logServerEvent: vi.fn(async () => {}),
}));
vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  revalidateTag: vi.fn(),
  updateTag: vi.fn(),
  unstable_cache: (fn: unknown) => fn,
}));

/**
 * The recipient table holds more rows than one PostgREST page. Row N belongs to
 * announcement `ann-N`, so a truncated read loses the tail announcements'
 * recipients entirely — which is exactly how they turn into "all team".
 */
const TOTAL_RECIPIENT_ROWS = 2400;
const ALL_RECIPIENT_ROWS = Array.from({ length: TOTAL_RECIPIENT_ROWS }, (_, i) => ({
  announcement_id: `ann-${i}`,
  player_id: `player-${i}`,
}));

/** Ranges the recipient read was actually asked for — proves pagination. */
let recipientRanges: Array<[number, number]> = [];

type RangeableChain = { range: (from: number, to: number) => unknown };

function recipientChain(): RangeableChain {
  // PostgREST caps a single response; without .range() it returns the head and
  // NO error, which is the whole defect.
  let lo = 0;
  let hi = 999;
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: (n: number) => {
      hi = Math.min(hi, lo + n - 1);
      return node;
    },
    range: (from: number, to: number) => {
      lo = from;
      hi = Math.min(to, from + 999);
      recipientRanges.push([from, to]);
      return node;
    },
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({
        data: ALL_RECIPIENT_ROWS.slice(lo, hi + 1),
        error: null,
      }).then(resolve),
  });
  return node as unknown as RangeableChain;
}

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: () => ({
    from: (table: string) => {
      if (table === 'golf_announcement_recipients') return recipientChain();
      return genericChain();
    },
  }),
}));

function genericChain() {
  const node: Record<string, unknown> = {};
  const self = () => node;
  Object.assign(node, {
    select: self,
    eq: self,
    in: self,
    order: self,
    limit: self,
    range: self,
    single: async () => ({ data: null, error: null }),
    maybeSingle: async () => ({ data: null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      Promise.resolve({ data: [], error: null }).then(resolve),
  });
  return node;
}

beforeEach(() => {
  recipientRanges = [];
});

describe('announcement recipient fan-out — a transport cap is not an answer', () => {
  it('reads the recipient set past the first PostgREST page', async () => {
    const { fetchAllRowsResult } = await import('@/lib/supabase/fetch-all-rows');

    const { data, error } = await fetchAllRowsResult<{
      announcement_id: string;
      player_id: string;
    }>(
      (from, to) =>
        recipientChain().range(from, to) as PromiseLike<{
          data: Array<{ announcement_id: string; player_id: string }> | null;
          error: { message: string; code?: string | null } | null;
        }>,
      1000,
    );

    expect(error).toBeNull();
    // Pre-fix a single bounded read stopped at 1000 and reported no error, so
    // the 1400 recipients past the cut vanished and their announcements read as
    // all-team to the whole roster.
    expect(data).toHaveLength(TOTAL_RECIPIENT_ROWS);
    expect(recipientRanges.length).toBeGreaterThan(1);
  });

  it('keeps the last announcement addressable rather than turning it all-team', async () => {
    const { fetchAllRowsResult } = await import('@/lib/supabase/fetch-all-rows');

    const { data } = await fetchAllRowsResult<{
      announcement_id: string;
      player_id: string;
    }>(
      (from, to) =>
        recipientChain().range(from, to) as PromiseLike<{
          data: Array<{ announcement_id: string; player_id: string }> | null;
          error: { message: string; code?: string | null } | null;
        }>,
      1000,
    );

    const tail = `ann-${TOTAL_RECIPIENT_ROWS - 1}`;
    expect((data ?? []).some((r) => r.announcement_id === tail)).toBe(true);
  });
});

describe('the announcements action paginates that specific read', () => {
  it('no longer caps the recipient fan-out with a bare limit', async () => {
    const fs = await import('node:fs');
    const src = fs.readFileSync('src/app/golf/actions/announcements.ts', 'utf8');

    // The recipient fan-out must go through the paginating helper. The other
    // fan-outs on this path keep ANNOUNCEMENTS_FANOUT_LIMIT on purpose.
    const fanOut = src.slice(
      src.indexOf('getAnnouncementsWithMeta'),
      src.indexOf('Build meta for each announcement'),
    );
    const recipientRead = fanOut.slice(
      fanOut.indexOf("from('golf_announcement_recipients')") - 400,
      fanOut.indexOf("from('golf_announcement_recipients')") + 400,
    );

    expect(recipientRead).toContain('fetchAllRowsResult');
    expect(recipientRead).not.toContain('ANNOUNCEMENTS_FANOUT_LIMIT');
  });
});

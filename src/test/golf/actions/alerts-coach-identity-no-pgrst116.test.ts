/**
 * Incident `sentry:JAVASCRIPT-NEXTJS-QZ` — the alert badge poll reported an
 * exception on an expected state.
 *
 * `getAlertCountsImpl` looked its coach up with `.single()`. A genuine no-row
 * match (an expired session, a coach id that is not yours) is an EXPECTED
 * state this function already answers deliberately — `authExpired: true`, an
 * empty count, no log — but `.single()` answers zero rows with a PostgREST
 * ERROR (`PGRST116`, "Cannot coerce the result to a single JSON object").
 * The application code checked for that code and moved on; Sentry's Supabase
 * tracing integration reported the raw PostgREST response as an exception
 * BEFORE that check ever ran, so a routine badge poll on a lapsed session
 * paged as a production fault.
 *
 * `.maybeSingle()` answers the same zero rows with `{ data: null, error: null }`
 * — the read stops manufacturing an error for a state that is not one. This
 * is the same change already shipped for the identical anti-pattern in
 * `golf.ts` (bdc09c915) and `insights.ts` (44f4ce183).
 *
 * The assertion is on the ERROR the read produces, not on the value the action
 * returns: both spellings return an identical result to the caller, and the
 * whole defect lives in the response object the tracing integration sees.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

vi.mock('@/lib/supabase/server', () => ({ createClient: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
// coachHelmIntelligence is imported at module load by alerts.ts; stub it.
vi.mock('@/lib/coachhelm/v2', () => ({
  coachHelmIntelligence: { analyzePlayer: vi.fn() },
}));

import { getAlertCounts } from '@/app/golf/actions/alerts';
import { createClient } from '@/lib/supabase/server';

const createClientMock = vi.mocked(createClient);

/** Every terminal the coach-identity read settled on, with the error it produced. */
interface ProducedRead {
  terminal: 'single' | 'maybeSingle';
  error: { code?: string; message: string } | null;
}

/**
 * A `golf_coaches` read that matches ZERO rows, with the real PostgREST
 * semantics of each terminal — `.single()` raises PGRST116, `.maybeSingle()`
 * returns an empty success. Whichever the action picks is what it gets.
 */
function makeZeroRowCoachClient() {
  const produced: ProducedRead[] = [];
  const coachBuilder = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    single: vi.fn(async () => {
      const error = {
        code: 'PGRST116',
        message: 'Cannot coerce the result to a single JSON object',
      };
      produced.push({ terminal: 'single', error });
      return { data: null, error };
    }),
    maybeSingle: vi.fn(async () => {
      produced.push({ terminal: 'maybeSingle', error: null });
      return { data: null, error: null };
    }),
  };

  const client = {
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: { id: 'user-1' } }, error: null }),
    },
    from: vi.fn((table: string) => {
      if (table === 'golf_coaches') return coachBuilder;
      // A no-row coach short-circuits before any insight read. Reaching one
      // would mean the identity gate stopped gating.
      throw new Error(`Unexpected table after a no-row coach: ${table}`);
    }),
  } as unknown as Awaited<ReturnType<typeof createClient>>;

  return { client, produced };
}

describe('the coach-identity read does not manufacture an error for a no-row match', () => {
  beforeEach(() => {
    createClientMock.mockReset();
  });

  it('getAlertCounts: a lapsed session produces NO PostgREST error', async () => {
    const { client, produced } = makeZeroRowCoachClient();
    createClientMock.mockResolvedValue(client);

    const res = await getAlertCounts('coach-1');

    // The answer to the caller is unchanged — this is the expected state the
    // function already handled, and the fix must not move it.
    expect(res.success).toBe(true);
    expect(res.authExpired).toBe(true);
    expect(res.counts).toEqual({ critical: 0, warning: 0, info: 0, total: 0 });

    // The defect: exactly one identity read, and it produced no error at all.
    // With `.single()` this array is [{ code: 'PGRST116', ... }] — the object
    // Sentry reported as an unhandled exception on every badge poll.
    expect(produced).toHaveLength(1);
    expect(produced[0]?.error).toBeNull();
    expect(produced[0]?.terminal).toBe('maybeSingle');
  });
});

/**
 * The behavioural test above can only reach `getAlertCountsImpl`. The same
 * read appears three times in this file — `getCoachAlerts`, `getAlertCountsImpl`
 * and `generateAlertsImpl` — and the analysis named only the middle one. All
 * three ask the same question of the same table and all three answer no-row
 * deliberately, so all three are covered by contract over the source. Same
 * shape as `src/test/golf/id-pages-validate-uuid.test.ts`.
 */
describe('every golf_coaches identity read in alerts.ts uses maybeSingle', () => {
  it('no .single() survives on the coach-ownership lookups', () => {
    const src = readFileSync(
      join(process.cwd(), 'src/app/golf/actions/alerts.ts'),
      'utf8',
    );
    const chains = src.match(/\.from\('golf_coaches'\)[\s\S]*?;/g) ?? [];
    // getCoachAlerts, getAlertCountsImpl, generateAlertsImpl.
    expect(chains).toHaveLength(3);
    for (const chain of chains) {
      expect(chain).toContain('.maybeSingle()');
      expect(chain).not.toContain('.single()');
    }
  });
});

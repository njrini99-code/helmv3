/**
 * useJourney stats — the "researching" KPI bucket.
 *
 * `JourneyStats` previously bucketed only interested/contacted/visited/
 * offered/committed. `'researching'` is a fully valid, selectable status
 * (JourneyClient's `statusOptions`, `RecruitingSchemas.updateStatus`) that
 * had NO bucket at all — a school marked "Researching" counted toward
 * `total_interests` but vanished from every other stat, so the KPI strip's
 * displayed columns never summed to "Total Schools" as soon as any school
 * used that status. These tests lock in the added `schools_researching`
 * bucket and the total/sum invariant it restores.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useJourney } from '../use-journey';
import { useAuthStore } from '@/stores/auth-store';

let playersResult: { data: unknown } = { data: null };
let interestsResult: { data: unknown[] | null } = { data: [] };
let eventsResult: { data: unknown[] | null } = { data: [] };

/** Chainable query-builder stub: every intermediate call returns itself,
 * `.maybeSingle()` resolves directly, and the chain itself is thenable so
 * `await supabase.from(...).select(...).eq(...).order(...)` (no terminal
 * call) resolves too — matching both query shapes `useJourney` issues. */
function makeChain(result: unknown) {
  const chain: Record<string, unknown> = {};
  for (const method of ['select', 'eq', 'order', 'limit']) {
    chain[method] = () => chain;
  }
  chain.maybeSingle = () => Promise.resolve(result);
  chain.then = (resolve: (v: unknown) => void) => resolve(result);
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === 'baseball_players') return makeChain(playersResult);
      if (table === 'baseball_recruiting_interests') return makeChain(interestsResult);
      if (table === 'baseball_player_engagement_events') return makeChain(eventsResult);
      return makeChain({ data: null });
    },
  }),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

describe('useJourney stats (researching bucket)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAuthStore).mockReturnValue(
      { user: { id: 'u1' } } as unknown as ReturnType<typeof useAuthStore>,
    );
    playersResult = { data: { id: 'p1', recruiting_activated: true } };
    eventsResult = { data: [] };
  });

  it('buckets a "researching" interest into schools_researching instead of dropping it', async () => {
    interestsResult = {
      data: [
        {
          id: 'i1',
          organization_id: 'o1',
          status: 'researching',
          interest_level: 'researching',
          notes: null,
          created_at: '2026-01-01T00:00:00Z',
          organization: { name: 'Test University', division: 'D1', conference: 'Test Conf' },
        },
        {
          id: 'i2',
          organization_id: 'o2',
          status: 'interested',
          interest_level: 'researching',
          notes: null,
          created_at: '2026-01-02T00:00:00Z',
          organization: { name: 'Other University', division: 'D2', conference: 'Other Conf' },
        },
      ],
    };

    const { result } = renderHook(() => useJourney());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.stats).toEqual({
      total_interests: 2,
      schools_interested: 1,
      schools_researching: 1,
      schools_contacted: 0,
      schools_visited: 0,
      schools_offered: 0,
      committed: false,
    });
  });

  it('every displayed status bucket sums back to total_interests once researching is counted', async () => {
    interestsResult = {
      data: [
        { id: 'i1', status: 'researching', organization: { name: 'A' } },
        { id: 'i2', status: 'interested', organization: { name: 'B' } },
        { id: 'i3', status: 'contacted', organization: { name: 'C' } },
        { id: 'i4', status: 'visited', organization: { name: 'D' } },
        { id: 'i5', status: 'offered', organization: { name: 'E' } },
      ],
    };

    const { result } = renderHook(() => useJourney());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const stats = result.current.stats!;
    const sum =
      stats.schools_interested +
      stats.schools_researching +
      stats.schools_contacted +
      stats.schools_visited +
      stats.schools_offered;
    expect(sum).toBe(stats.total_interests);
  });
});

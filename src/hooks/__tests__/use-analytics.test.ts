/**
 * useAnalytics — regression coverage for the `organizations.location_state`
 * column bug.
 *
 * `use-analytics.ts` selects `organization:organizations ( ... state ... )`
 * inside the `baseball_player_engagement_events -> baseball_coaches` embed.
 * `organizations` has no `state` column (only `location_state`), so
 * PostgREST rejected the select with a 400 on every single call, for every
 * player — the recruiting-analytics page could never show real data and
 * silently fell into the "honest empty state" branch instead.
 *
 * Covers:
 *  - the events query's `select(...)` string references `location_state`,
 *    never a bare `state` column (would 400 against the real schema).
 *  - the anonymized "A coach from {state}" top-schools label is built from
 *    `organization.location_state`, matching the renamed column.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { useAnalytics } from '../use-analytics';
import { useAuthStore } from '@/stores/auth-store';

let capturedEventsSelect = '';
let eventsResult: { data: unknown[] | null; error: unknown } = { data: [], error: null };
let playerResult: { data: { id: string; recruiting_activated: boolean } | null } = {
  data: { id: 'player-1', recruiting_activated: false },
};

function makeChain(table: string) {
  const chain: Record<string, unknown> = {};
  chain.select = (columns: string) => {
    if (table === 'baseball_player_engagement_events') {
      capturedEventsSelect = columns;
    }
    return chain;
  };
  for (const method of ['eq', 'gte', 'order']) {
    chain[method] = () => chain;
  }
  chain.single = () => Promise.resolve(playerResult);
  (chain as { then: (resolve: (v: unknown) => void) => void }).then = (resolve) => {
    resolve(eventsResult);
  };
  return chain;
}

vi.mock('@/lib/supabase/client', () => ({
  createClient: () => ({
    from: (table: string) => makeChain(table),
  }),
}));

vi.mock('@/stores/auth-store', () => ({
  useAuthStore: vi.fn(),
}));

describe('useAnalytics', () => {
  beforeEach(() => {
    capturedEventsSelect = '';
    eventsResult = { data: [], error: null };
    playerResult = { data: { id: 'player-1', recruiting_activated: false } };
    vi.mocked(useAuthStore).mockReturnValue({ user: { id: 'user-1' } } as unknown as ReturnType<typeof useAuthStore>);
  });

  it('selects organizations.location_state, never the non-existent `state` column (regression: PostgREST 400 on every fetch)', async () => {
    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    const normalized = capturedEventsSelect.replace(/\s+/g, ' ');
    expect(normalized).toContain('location_state');
    // A bare `state` column reference would appear as " state," or " state\n" -
    // i.e. preceded by whitespace/comma, not fused into `location_state`.
    expect(normalized).not.toMatch(/[,(\s]state\s*[,)]/);
  });

  it('builds the anonymized "A coach from {state}" top-school label from organization.location_state', async () => {
    eventsResult = {
      data: [
        {
          id: 'evt-1',
          player_id: 'player-1',
          coach_id: 'coach-1',
          engagement_type: 'profile_view',
          created_at: new Date().toISOString(),
          engagement_date: new Date().toISOString(),
          baseball_coaches: {
            id: 'coach-1',
            full_name: 'Coach Smith',
            organization: {
              name: 'Acme State',
              division: 'D1',
              logo_url: null,
              location_state: 'NC',
              conference: 'ACC',
            },
          },
        },
      ],
      error: null,
    };

    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.topSchools).toHaveLength(1);
    expect(result.current.data?.topSchools[0]?.school_name).toBe('A coach from NC');
  });

  it('reveals the real identified school name once recruiting is activated (location_state ignored for naming)', async () => {
    playerResult = { data: { id: 'player-1', recruiting_activated: true } };
    eventsResult = {
      data: [
        {
          id: 'evt-1',
          player_id: 'player-1',
          coach_id: 'coach-1',
          engagement_type: 'profile_view',
          created_at: new Date().toISOString(),
          engagement_date: new Date().toISOString(),
          baseball_coaches: {
            id: 'coach-1',
            full_name: 'Coach Smith',
            organization: {
              name: 'Acme State',
              division: 'D1',
              logo_url: null,
              location_state: 'NC',
              conference: 'ACC',
            },
          },
        },
      ],
      error: null,
    };

    const { result } = renderHook(() => useAnalytics());
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(result.current.data?.topSchools[0]?.school_name).toBe('Acme State');
  });
});

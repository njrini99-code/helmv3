// =============================================================================
// src/contracts/baseball/product-trust/video-honest-empty-state.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#377 — Video Library honest empty states):
//   The Event/Tagged/Evidence views each carry an explicit `hasVideoEvents`
//   honesty gate, DISTINCT from an empty `clips`/`groups` array:
//     - `hasVideoEvents:false` means the team has NO baseball_video_events
//       rows at all ("no film has been tagged yet").
//     - `hasVideoEvents:true` + an empty result means film HAS been tagged,
//       but none of it qualifies for THIS view's narrower filter (no game_id
//       for Event, none linked to a signal for Evidence) — a real, different
//       fact the client renders as a different empty state ("nothing tagged
//       to a game" vs "no film uploaded"). Conflating the two would be a
//       fabricated-healthy-empty-state bug: a real upload failure or a
//       genuinely un-filmed team must never look identical to "everything
//       has been reviewed and there's nothing left to see."
//
// Source of truth: getEventGroupedClips / getTaggedClips / getEvidenceClips
// in src/app/baseball/actions/videos.ts.
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'user-1' },
          targetTeamId: 'team-a',
          activeTeamId: 'team-a',
          activeCoachId: 'coach-1',
          activePlayerId: null,
        },
        ...args,
      ),
  BaseballActionError: class BaseballActionError extends Error {},
}));

import { getEventGroupedClips, getTaggedClips, getEvidenceClips } from '@/app/baseball/actions/videos';

const TEAM_ID = 'team-a';

type Row = Record<string, unknown>;

function videoEventFixture(overrides: Row = {}): Row {
  return {
    id: `ve-${Math.random().toString(36).slice(2, 8)}`,
    team_id: TEAM_ID,
    player_id: 'p1',
    video_url: 'https://example.com/clip.mp4',
    thumbnail_url: null,
    clip_title: 'Clip',
    video_type: 'other',
    duration_seconds: 12,
    timestamp_start: null,
    timestamp_end: null,
    tags: [],
    source_vendor: null,
    source_label: null,
    source_confidence: null,
    review_status: null,
    visibility: 'staff_only',
    disposition: null,
    notes: null,
    plate_appearance_id: null,
    pitch_event_id: null,
    game_id: null,
    linked_signal_id: null,
    linked_action_id: null,
    created_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

/**
 * A no-op `.or()` passthrough for `baseball_video_events` — createFakeSupabase
 * (see src/test/fixtures/fake-supabase.ts) does not implement PostgREST's
 * `.or(...)` combinator, and getTaggedClips's real query always calls it. This
 * ONLY lets the "any events at all" honesty gate + the positive already-tagged
 * fixture path run; it does not validate the OR filter's own exclusion logic
 * (that would require a real `.or()` implementation, out of scope here — the
 * exclusion-vs-no-film distinction this file pins is instead proven, without
 * any shim, on getEvidenceClips's `.not('linked_signal_id', 'is', null)`,
 * which the fake DOES implement faithfully).
 */
function withOrPassthrough(client: FakeSupabase, table: string): void {
  const origFrom = client.from.bind(client);
  client.from = ((t: string) => {
    const api = origFrom(t);
    if (t !== table) return api;
    return {
      ...api,
      select: (...args: Parameters<typeof api.select>) => {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const qb = api.select(...args) as any;
        qb.or = () => qb;
        return qb;
      },
    };
  }) as typeof client.from;
}

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: 'user-1' }, tables: { baseball_video_events: [] } });
});

describe('getEventGroupedClips — hasVideoEvents distinguishes "no film" from "film, none tagged to a game" (#377)', () => {
  it('zero video_events rows: hasVideoEvents:false, groups:[], totalClips:0', async () => {
    const result = await getEventGroupedClips();
    expect(result.hasVideoEvents).toBe(false);
    expect(result.groups).toEqual([]);
    expect(result.ungroupedClips).toEqual([]);
    expect(result.totalClips).toBe(0);
  });

  it('video_events exist but NONE have a game_id: hasVideoEvents:true, groups:[], but ungroupedClips carries the real rows', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_video_events: [
          videoEventFixture({ id: 've-1', game_id: null }),
          videoEventFixture({ id: 've-2', game_id: null }),
        ],
      },
    });

    const result = await getEventGroupedClips();
    expect(result.hasVideoEvents).toBe(true);
    expect(result.groups).toEqual([]);
    expect(result.ungroupedClips).toHaveLength(2);
    expect(result.totalClips).toBe(2);
  });
});

describe('getTaggedClips — hasVideoEvents honesty gate (#377)', () => {
  it('zero video_events rows: hasVideoEvents:false, clips:[]', async () => {
    const result = await getTaggedClips();
    expect(result.hasVideoEvents).toBe(false);
    expect(result.clips).toEqual([]);
    expect(result.totalCount).toBe(0);
  });

  it('a tagged video_event (plate_appearance_id set) surfaces with hasVideoEvents:true', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_video_events: [
          videoEventFixture({ id: 've-tagged', plate_appearance_id: 'pa-1' }),
        ],
      },
    });
    withOrPassthrough(fake, 'baseball_video_events');

    const result = await getTaggedClips();
    expect(result.hasVideoEvents).toBe(true);
    expect(result.clips.map((c) => c.id)).toContain('ve-tagged');
  });
});

describe('getEvidenceClips — hasVideoEvents distinguishes "no film" from "film, none evidence-linked" (#377)', () => {
  it('zero video_events rows: hasVideoEvents:false, clips:[]', async () => {
    const result = await getEvidenceClips();
    expect(result.hasVideoEvents).toBe(false);
    expect(result.clips).toEqual([]);
  });

  it('video_events exist but NONE have a linked_signal_id: hasVideoEvents:true, clips:[] (real .not() filter, no shim needed)', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_video_events: [videoEventFixture({ id: 've-unlinked', linked_signal_id: null })],
        baseball_signals: [],
      },
    });

    const result = await getEvidenceClips();
    expect(result.hasVideoEvents).toBe(true);
    expect(result.clips).toEqual([]);
  });

  it('a video_event linked to a real signal on the SAME team carries the real signal title, never fabricated', async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_video_events: [
          videoEventFixture({ id: 've-linked', linked_signal_id: 'sig-1' }),
        ],
        baseball_signals: [
          {
            id: 'sig-1',
            team_id: TEAM_ID,
            title: 'Elevated chase rate',
            severity: 'warning',
            category: 'hitting',
            disposition: 'new',
          },
        ],
      },
    });

    const result = await getEvidenceClips();
    expect(result.hasVideoEvents).toBe(true);
    const clip = result.clips.find((c) => c.id === 've-linked');
    expect(clip?.signal_title).toBe('Elevated chase rate');
    expect(clip?.signal_severity).toBe('warning');
  });
});

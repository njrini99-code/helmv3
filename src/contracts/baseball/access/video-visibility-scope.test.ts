// =============================================================================
// src/contracts/baseball/access/video-visibility-scope.test.ts
//
// PRODUCT TRUTH THIS FILE PINS (#377 — Video Library is TEAM-SCOPED):
//   Every Video Library read is scoped to the server-resolved
//   `ctx.targetTeamId` — never a caller-suppliable team id — and never leaks
//   another team's rows even when both teams' data lives in the same table:
//     1. `getLibraryVideos`/`getPlayerGroupedVideos` are scoped through the
//        REQUESTED team's roster (`baseball_team_members`) — a video
//        belonging to a player on a DIFFERENT team's roster never appears,
//        even though `baseball_videos` has no team_id column of its own to
//        filter on directly.
//     2. `getEventGroupedClips`/`getTaggedClips`/`getEvidenceClips` filter
//        `baseball_video_events` directly by `team_id` — a clip that belongs
//        to a different team never leaks into this team's Event/Tagged view.
//     3. `getEvidenceClips`'s signal-metadata enrichment re-scopes by
//        `team_id` too: a clip whose `linked_signal_id` happens to point at a
//        DIFFERENT team's `baseball_signals` row degrades that clip's signal
//        fields to null rather than leaking the other team's private signal
//        title/severity/category.
//
// Source of truth: src/app/baseball/actions/videos.ts (`ctx.targetTeamId`
// scoping in each of the 5 read actions).
// =============================================================================

import { describe, expect, it, vi, beforeEach } from 'vitest';
import { createFakeSupabase, type FakeSupabase } from '@/test/fixtures/fake-supabase';

let fake: FakeSupabase;

const TEAM_A = 'team-a';
const TEAM_B = 'team-b';

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => fake),
}));

// ctx.targetTeamId is ALWAYS team-a here — the point of this file is that the
// action must never leak TEAM_B's data even though it lives in the same
// fake tables, not that targetTeamId varies per call (that resolution is a
// with-baseball-action concern, covered generically elsewhere).
vi.mock('@/lib/baseball/with-baseball-action', () => ({
  withBaseballAction:
    (_name: string, _opts: unknown, fn: (ctx: unknown, ...a: unknown[]) => unknown) =>
    (...args: unknown[]) =>
      fn(
        {
          user: { id: 'user-1' },
          targetTeamId: TEAM_A,
          activeTeamId: TEAM_A,
          activeCoachId: 'coach-1',
          activePlayerId: null,
        },
        ...args,
      ),
  BaseballActionError: class BaseballActionError extends Error {},
}));

import {
  getLibraryVideos,
  getPlayerGroupedVideos,
  getEventGroupedClips,
  getEvidenceClips,
} from '@/app/baseball/actions/videos';

type Row = Record<string, unknown>;

function videoFixture(overrides: Row = {}): Row {
  return {
    id: `v-${Math.random().toString(36).slice(2, 8)}`,
    player_id: 'p-a',
    team_id: null, // baseball_videos is player-scoped, not team-scoped
    title: 'Highlight',
    description: null,
    url: 'https://example.com/v.mp4',
    thumbnail_url: null,
    video_type: 'highlight',
    duration: 30,
    view_count: 0,
    is_primary: false,
    is_clip: false,
    parent_video_id: null,
    clip_start_time: null,
    clip_end_time: null,
    created_at: '2026-04-01T00:00:00.000Z',
    updated_at: '2026-04-01T00:00:00.000Z',
    ...overrides,
  };
}

function videoEventFixture(overrides: Row = {}): Row {
  return {
    id: `ve-${Math.random().toString(36).slice(2, 8)}`,
    team_id: TEAM_A,
    player_id: 'p-a',
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

beforeEach(() => {
  fake = createFakeSupabase({ user: { id: 'user-1' } });
});

describe('getLibraryVideos/getPlayerGroupedVideos — scoped through the requested team roster (#377)', () => {
  it("getLibraryVideos never returns a video belonging to a DIFFERENT team's roster player", async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_team_members: [
          { team_id: TEAM_A, player_id: 'p-a' },
          { team_id: TEAM_B, player_id: 'p-b' },
        ],
        baseball_videos: [
          videoFixture({ id: 'v-a', player_id: 'p-a' }),
          videoFixture({ id: 'v-b', player_id: 'p-b' }),
        ],
      },
    });

    const result = await getLibraryVideos();
    const ids = result.videos.map((v) => v.id);
    expect(ids).toContain('v-a');
    expect(ids).not.toContain('v-b');
  });

  it("getPlayerGroupedVideos only groups the requested team's roster, never another team's player", async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_team_members: [
          { team_id: TEAM_A, player_id: 'p-a' },
          { team_id: TEAM_B, player_id: 'p-b' },
        ],
        baseball_videos: [
          videoFixture({
            id: 'v-a',
            player_id: 'p-a',
            player: { id: 'p-a', first_name: 'On', last_name: 'TeamA' },
          }),
          videoFixture({
            id: 'v-b',
            player_id: 'p-b',
            player: { id: 'p-b', first_name: 'On', last_name: 'TeamB' },
          }),
        ],
      },
    });

    const result = await getPlayerGroupedVideos();
    expect(result.totalPlayers).toBe(1);
    const playerIds = result.groups.map((g) => g.player.id);
    expect(playerIds).toContain('p-a');
    expect(playerIds).not.toContain('p-b');
  });
});

describe('getEventGroupedClips/getTaggedClips/getEvidenceClips — video_events scoped by team_id (#377)', () => {
  it("getEventGroupedClips never groups a DIFFERENT team's video_event", async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_video_events: [
          videoEventFixture({ id: 've-a', team_id: TEAM_A, game_id: 'game-1' }),
          videoEventFixture({ id: 've-b', team_id: TEAM_B, game_id: 'game-1' }),
        ],
        baseball_games: [
          { id: 'game-1', game_date: '2026-04-01', opponent_name: 'Rival', home_away: 'home', game_type: 'game', our_score: 5, opponent_score: 2 },
        ],
      },
    });

    const result = await getEventGroupedClips();
    const allClipIds = result.groups.flatMap((g) => g.clips.map((c) => c.id));
    expect(allClipIds).toContain('ve-a');
    expect(allClipIds).not.toContain('ve-b');
    expect(result.totalClips).toBe(1);
  });

  it("getEvidenceClips never leaks a DIFFERENT team's video_event", async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        baseball_video_events: [
          videoEventFixture({ id: 've-a', team_id: TEAM_A, linked_signal_id: 'sig-a' }),
          videoEventFixture({ id: 've-b', team_id: TEAM_B, linked_signal_id: 'sig-b' }),
        ],
        baseball_signals: [
          { id: 'sig-a', team_id: TEAM_A, title: 'Team A signal', severity: 'info', category: 'hitting', disposition: 'new' },
          { id: 'sig-b', team_id: TEAM_B, title: 'Team B signal', severity: 'info', category: 'hitting', disposition: 'new' },
        ],
      },
    });

    const result = await getEvidenceClips();
    const ids = result.clips.map((c) => c.id);
    expect(ids).toContain('ve-a');
    expect(ids).not.toContain('ve-b');
  });

  it("getEvidenceClips degrades a clip's signal metadata to null rather than leaking a DIFFERENT team's signal, if linked_signal_id ever pointed cross-team", async () => {
    fake = createFakeSupabase({
      user: { id: 'user-1' },
      tables: {
        // TEAM_A's own clip, but its linked_signal_id (however it got there)
        // points at a signal that only exists under TEAM_B.
        baseball_video_events: [
          videoEventFixture({ id: 've-cross', team_id: TEAM_A, linked_signal_id: 'sig-foreign' }),
        ],
        baseball_signals: [
          { id: 'sig-foreign', team_id: TEAM_B, title: 'Should never appear', severity: 'critical', category: 'pitching', disposition: 'new' },
        ],
      },
    });

    const result = await getEvidenceClips();
    expect(result.hasVideoEvents).toBe(true);
    const clip = result.clips.find((c) => c.id === 've-cross');
    expect(clip).toBeTruthy();
    // The clip itself still surfaces (honest — it's this team's clip), but the
    // cross-team signal enrichment must never leak the foreign title.
    expect(clip?.signal_title).toBeNull();
    expect(clip?.signal_severity).toBeNull();
  });
});

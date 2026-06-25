'use server';

// =============================================================================
// src/app/baseball/actions/videos.ts
//
// Server actions for the 5-view Video Library:
//   Library  — all team videos (with player + type filters)
//   Player   — videos grouped by player
//   Event    — videos grouped by game event (game_id on baseball_video_events)
//   Tagged   — baseball_video_events linked to stat events (plate_appearances /
//               pitch_events / batted_ball)
//   Evidence — baseball_video_events linked to signals
//
// All queries go through withBaseballAction so auth + team context + capability
// are always enforced. The page reads from baseball_videos (player-uploaded
// highlights) for Library/Player; and from baseball_video_events (staff-anchored
// film queue) for Event/Tagged/Evidence.
//
// Honest: when linking tables (baseball_video_events) have no rows for a team,
// the actions return empty arrays and the views render honest empty states —
// never fake data or a 500.
//
// NON-DESTRUCTIVE: no mutations here; this file is read-only.
// =============================================================================

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { getFullName } from '@/lib/utils';

// ---------------------------------------------------------------------------
// Shared types
// ---------------------------------------------------------------------------

export interface VideoPlayerRef {
  id: string;
  first_name: string | null;
  last_name: string | null;
  avatar_url: string | null;
  primary_position: string | null;
  jersey_number: string | null;
  grad_year: number | null;
}

export interface LibraryVideo {
  id: string;
  player_id: string;
  team_id: string | null;
  title: string;
  description: string | null;
  url: string | null;
  thumbnail_url: string | null;
  video_type: string | null;
  duration: number | null;
  view_count: number | null;
  is_primary: boolean | null;
  is_clip: boolean | null;
  parent_video_id: string | null;
  clip_start_time: number | null;
  clip_end_time: number | null;
  created_at: string | null;
  updated_at: string | null;
  player: VideoPlayerRef | null;
}

export interface TaggedClip {
  id: string;
  team_id: string;
  player_id: string;
  video_url: string;
  thumbnail_url: string | null;
  clip_title: string | null;
  video_type: string;
  duration_seconds: number | null;
  timestamp_start: number | null;
  timestamp_end: number | null;
  tags: string[];
  source_vendor: string | null;
  source_label: string | null;
  source_confidence: number | null;
  review_status: string | null;
  visibility: string;
  disposition: string | null;
  notes: string | null;
  plate_appearance_id: string | null;
  pitch_event_id: string | null;
  game_id: string | null;
  linked_signal_id: string | null;
  linked_action_id: string | null;
  created_at: string;
  /** resolved from player_id */
  player: VideoPlayerRef | null;
}

export interface EventGroup {
  game_id: string;
  game_date: string;
  opponent_name: string | null;
  home_away: string | null;
  game_type: string;
  our_score: number | null;
  opponent_score: number | null;
  clip_count: number;
  clips: TaggedClip[];
}

export interface PlayerVideoGroup {
  player: VideoPlayerRef;
  video_count: number;
  primary_video: LibraryVideo | null;
  videos: LibraryVideo[];
}

export interface EvidenceClip extends TaggedClip {
  signal_title: string | null;
  signal_severity: string | null;
  signal_category: string | null;
  signal_disposition: string | null;
}

// ---------------------------------------------------------------------------
// Read model shapes returned to the client
// ---------------------------------------------------------------------------

export interface LibraryReadModel {
  videos: LibraryVideo[];
  totalCount: number;
}

export interface PlayerReadModel {
  groups: PlayerVideoGroup[];
  totalPlayers: number;
  totalVideos: number;
}

export interface EventReadModel {
  groups: EventGroup[];
  ungroupedClips: TaggedClip[];
  totalEvents: number;
  totalClips: number;
  hasVideoEvents: boolean;
}

export interface TaggedReadModel {
  clips: TaggedClip[];
  totalCount: number;
  hasVideoEvents: boolean;
}

export interface EvidenceReadModel {
  clips: EvidenceClip[];
  totalCount: number;
  hasVideoEvents: boolean;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizePlayer(raw: Record<string, unknown> | null): VideoPlayerRef | null {
  if (!raw) return null;
  return {
    id: (raw.id as string) ?? '',
    first_name: (raw.first_name as string | null) ?? null,
    last_name: (raw.last_name as string | null) ?? null,
    avatar_url: (raw.avatar_url as string | null) ?? null,
    primary_position: (raw.primary_position as string | null) ?? null,
    jersey_number: (raw.jersey_number as string | null) ?? null,
    grad_year: (raw.grad_year as number | null) ?? null,
  };
}

function playerDisplayName(p: VideoPlayerRef | null): string {
  if (!p) return 'Unknown Player';
  return getFullName(p.first_name, p.last_name) || 'Unknown Player';
}

// ===========================================================================
// ACTION: getLibraryVideos
// ===========================================================================

export const getLibraryVideos = withBaseballAction(
  'getLibraryVideos',
  { featureArea: 'baseball-video' },
  async (ctx): Promise<LibraryReadModel> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const { data: members } = await supabase
      .from('baseball_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    const playerIds = (members ?? []).map(
      (m: { player_id: string }) => m.player_id,
    );
    if (playerIds.length === 0) {
      return { videos: [], totalCount: 0 };
    }

    const { data: rows, count } = await supabase
      .from('baseball_videos')
      .select(
        `
        *,
        player:baseball_players (
          id, first_name, last_name, avatar_url, primary_position, jersey_number, grad_year
        )
      `,
        { count: 'exact' },
      )
      .in('player_id', playerIds)
      .order('created_at', { ascending: false })
      .limit(200);

    const videos: LibraryVideo[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      ...(r as unknown as LibraryVideo),
      player: normalizePlayer(r.player as Record<string, unknown> | null),
    }));

    return { videos, totalCount: count ?? videos.length };
  },
);

// ===========================================================================
// ACTION: getPlayerGroupedVideos
// ===========================================================================

export const getPlayerGroupedVideos = withBaseballAction(
  'getPlayerGroupedVideos',
  { featureArea: 'baseball-video' },
  async (ctx): Promise<PlayerReadModel> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    const { data: members } = await supabase
      .from('baseball_team_members')
      .select('player_id')
      .eq('team_id', teamId);

    const playerIds = (members ?? []).map(
      (m: { player_id: string }) => m.player_id,
    );
    if (playerIds.length === 0) {
      return { groups: [], totalPlayers: 0, totalVideos: 0 };
    }

    const { data: rows } = await supabase
      .from('baseball_videos')
      .select(
        `
        *,
        player:baseball_players (
          id, first_name, last_name, avatar_url, primary_position, jersey_number, grad_year
        )
      `,
      )
      .in('player_id', playerIds)
      .order('is_primary', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(500);

    const byPlayer = new Map<string, LibraryVideo[]>();
    for (const raw of rows ?? []) {
      const r = raw as Record<string, unknown>;
      const v: LibraryVideo = {
        ...(r as unknown as LibraryVideo),
        player: normalizePlayer(r.player as Record<string, unknown> | null),
      };
      const arr = byPlayer.get(v.player_id) ?? [];
      arr.push(v);
      byPlayer.set(v.player_id, arr);
    }

    const groups: PlayerVideoGroup[] = [];
    for (const [, videos] of byPlayer) {
      const first = videos[0];
      if (!first || !first.player) continue;
      const primary = videos.find((v) => v.is_primary) ?? null;
      groups.push({
        player: first.player,
        video_count: videos.length,
        primary_video: primary,
        videos,
      });
    }

    // Sort groups by player last name
    groups.sort((a, b) =>
      playerDisplayName(a.player).localeCompare(playerDisplayName(b.player)),
    );

    const totalVideos = groups.reduce((s, g) => s + g.video_count, 0);
    return { groups, totalPlayers: groups.length, totalVideos };
  },
);

// ===========================================================================
// ACTION: getEventGroupedClips
//
// Groups baseball_video_events rows by their game_id. Videos without a
// game_id are returned as ungroupedClips so they're not silently dropped.
// If baseball_video_events has no rows for this team, returns hasVideoEvents=false
// so the client can show an honest "no film has been tagged yet" state.
// ===========================================================================

export const getEventGroupedClips = withBaseballAction(
  'getEventGroupedClips',
  { featureArea: 'baseball-video' },
  async (ctx): Promise<EventReadModel> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Check if ANY video events exist for this team (honesty gate).
    const { count: anyCount } = await supabase
      .from('baseball_video_events' as const)
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);

    if (!anyCount || anyCount === 0) {
      return {
        groups: [],
        ungroupedClips: [],
        totalEvents: 0,
        totalClips: 0,
        hasVideoEvents: false,
      };
    }

    // Fetch video events with player info.
    const { data: eventRows } = await supabase
      .from('baseball_video_events' as const)
      .select(
        `
        id, team_id, player_id, video_url, thumbnail_url, clip_title, video_type,
        duration_seconds, timestamp_start, timestamp_end, tags, source_vendor,
        source_label, source_confidence, review_status, visibility, disposition,
        notes, plate_appearance_id, pitch_event_id, game_id, linked_signal_id,
        linked_action_id, created_at,
        player:baseball_players (
          id, first_name, last_name, avatar_url, primary_position, jersey_number, grad_year
        )
      `,
      )
      .eq('team_id', teamId)
      .neq('disposition', 'deleted')
      .order('created_at', { ascending: false })
      .limit(500);

    const clips: TaggedClip[] = (eventRows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      team_id: r.team_id as string,
      player_id: r.player_id as string,
      video_url: r.video_url as string,
      thumbnail_url: (r.thumbnail_url as string | null) ?? null,
      clip_title: (r.clip_title as string | null) ?? null,
      video_type: (r.video_type as string) ?? 'other',
      duration_seconds: (r.duration_seconds as number | null) ?? null,
      timestamp_start: (r.timestamp_start as number | null) ?? null,
      timestamp_end: (r.timestamp_end as number | null) ?? null,
      tags: (r.tags as string[]) ?? [],
      source_vendor: (r.source_vendor as string | null) ?? null,
      source_label: (r.source_label as string | null) ?? null,
      source_confidence: (r.source_confidence as number | null) ?? null,
      review_status: (r.review_status as string | null) ?? null,
      visibility: (r.visibility as string) ?? 'staff_only',
      disposition: (r.disposition as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      plate_appearance_id: (r.plate_appearance_id as string | null) ?? null,
      pitch_event_id: (r.pitch_event_id as string | null) ?? null,
      game_id: (r.game_id as string | null) ?? null,
      linked_signal_id: (r.linked_signal_id as string | null) ?? null,
      linked_action_id: (r.linked_action_id as string | null) ?? null,
      created_at: r.created_at as string,
      player: normalizePlayer(r.player as Record<string, unknown> | null),
    }));

    // Separate clipped + ungrouped.
    const withGame = clips.filter((c) => c.game_id);
    const ungroupedClips = clips.filter((c) => !c.game_id);

    if (withGame.length === 0) {
      return {
        groups: [],
        ungroupedClips,
        totalEvents: 0,
        totalClips: clips.length,
        hasVideoEvents: true,
      };
    }

    // Fetch game metadata for groups.
    const gameIds = [...new Set(withGame.map((c) => c.game_id as string))];
    const { data: gameRows } = await supabase
      .from('baseball_games')
      .select('id, game_date, opponent_name, home_away, game_type, our_score, opponent_score')
      .in('id', gameIds);

    const gameMap = new Map<
      string,
      {
        game_date: string;
        opponent_name: string | null;
        home_away: string | null;
        game_type: string;
        our_score: number | null;
        opponent_score: number | null;
      }
    >();
    for (const g of gameRows ?? []) {
      const gr = g as {
        id: string;
        game_date: string;
        opponent_name: string | null;
        home_away: string | null;
        game_type: string;
        our_score: number | null;
        opponent_score: number | null;
      };
      gameMap.set(gr.id, gr);
    }

    // Build groups.
    const groupMap = new Map<string, EventGroup>();
    for (const clip of withGame) {
      const gid = clip.game_id as string;
      if (!groupMap.has(gid)) {
        const meta = gameMap.get(gid);
        groupMap.set(gid, {
          game_id: gid,
          game_date: meta?.game_date ?? '',
          opponent_name: meta?.opponent_name ?? null,
          home_away: meta?.home_away ?? null,
          game_type: meta?.game_type ?? 'game',
          our_score: meta?.our_score ?? null,
          opponent_score: meta?.opponent_score ?? null,
          clip_count: 0,
          clips: [],
        });
      }
      const g = groupMap.get(gid)!;
      g.clips.push(clip);
      g.clip_count += 1;
    }

    const groups = [...groupMap.values()].sort((a, b) =>
      b.game_date.localeCompare(a.game_date),
    );

    return {
      groups,
      ungroupedClips,
      totalEvents: groups.length,
      totalClips: clips.length,
      hasVideoEvents: true,
    };
  },
);

// ===========================================================================
// ACTION: getTaggedClips
//
// Returns baseball_video_events rows that are anchored to a stat event
// (plate_appearance_id OR pitch_event_id is not null).
// ===========================================================================

export const getTaggedClips = withBaseballAction(
  'getTaggedClips',
  { featureArea: 'baseball-video' },
  async (ctx): Promise<TaggedReadModel> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Honesty check: does baseball_video_events exist + have rows for this team?
    const { count: anyCount } = await supabase
      .from('baseball_video_events' as const)
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);

    if (!anyCount || anyCount === 0) {
      return { clips: [], totalCount: 0, hasVideoEvents: false };
    }

    const { data: rows, count } = await supabase
      .from('baseball_video_events' as const)
      .select(
        `
        id, team_id, player_id, video_url, thumbnail_url, clip_title, video_type,
        duration_seconds, timestamp_start, timestamp_end, tags, source_vendor,
        source_label, source_confidence, review_status, visibility, disposition,
        notes, plate_appearance_id, pitch_event_id, game_id, linked_signal_id,
        linked_action_id, created_at,
        player:baseball_players (
          id, first_name, last_name, avatar_url, primary_position, jersey_number, grad_year
        )
      `,
        { count: 'exact' },
      )
      .eq('team_id', teamId)
      .neq('disposition', 'deleted')
      .or('plate_appearance_id.not.is.null,pitch_event_id.not.is.null')
      .order('created_at', { ascending: false })
      .limit(300);

    const clips: TaggedClip[] = (rows ?? []).map((r: Record<string, unknown>) => ({
      id: r.id as string,
      team_id: r.team_id as string,
      player_id: r.player_id as string,
      video_url: r.video_url as string,
      thumbnail_url: (r.thumbnail_url as string | null) ?? null,
      clip_title: (r.clip_title as string | null) ?? null,
      video_type: (r.video_type as string) ?? 'other',
      duration_seconds: (r.duration_seconds as number | null) ?? null,
      timestamp_start: (r.timestamp_start as number | null) ?? null,
      timestamp_end: (r.timestamp_end as number | null) ?? null,
      tags: (r.tags as string[]) ?? [],
      source_vendor: (r.source_vendor as string | null) ?? null,
      source_label: (r.source_label as string | null) ?? null,
      source_confidence: (r.source_confidence as number | null) ?? null,
      review_status: (r.review_status as string | null) ?? null,
      visibility: (r.visibility as string) ?? 'staff_only',
      disposition: (r.disposition as string | null) ?? null,
      notes: (r.notes as string | null) ?? null,
      plate_appearance_id: (r.plate_appearance_id as string | null) ?? null,
      pitch_event_id: (r.pitch_event_id as string | null) ?? null,
      game_id: (r.game_id as string | null) ?? null,
      linked_signal_id: (r.linked_signal_id as string | null) ?? null,
      linked_action_id: (r.linked_action_id as string | null) ?? null,
      created_at: r.created_at as string,
      player: normalizePlayer(r.player as Record<string, unknown> | null),
    }));

    return { clips, totalCount: count ?? clips.length, hasVideoEvents: true };
  },
);

// ===========================================================================
// ACTION: getEvidenceClips
//
// Returns baseball_video_events rows that are linked to a baseball_signals
// row (linked_signal_id is not null). Joins in the signal's title/severity/
// category so the Evidence view can group or annotate by signal.
// ===========================================================================

export const getEvidenceClips = withBaseballAction(
  'getEvidenceClips',
  { featureArea: 'baseball-video' },
  async (ctx): Promise<EvidenceReadModel> => {
    const supabase = await createClient();
    const teamId = ctx.targetTeamId;

    // Honesty check.
    const { count: anyCount } = await supabase
      .from('baseball_video_events' as const)
      .select('id', { count: 'exact', head: true })
      .eq('team_id', teamId);

    if (!anyCount || anyCount === 0) {
      return { clips: [], totalCount: 0, hasVideoEvents: false };
    }

    const { data: rows, count } = await supabase
      .from('baseball_video_events' as const)
      .select(
        `
        id, team_id, player_id, video_url, thumbnail_url, clip_title, video_type,
        duration_seconds, timestamp_start, timestamp_end, tags, source_vendor,
        source_label, source_confidence, review_status, visibility, disposition,
        notes, plate_appearance_id, pitch_event_id, game_id, linked_signal_id,
        linked_action_id, created_at,
        player:baseball_players (
          id, first_name, last_name, avatar_url, primary_position, jersey_number, grad_year
        )
      `,
        { count: 'exact' },
      )
      .eq('team_id', teamId)
      .neq('disposition', 'deleted')
      .not('linked_signal_id', 'is', null)
      .order('created_at', { ascending: false })
      .limit(200);

    const clipRows = rows ?? [];
    if (clipRows.length === 0) {
      return { clips: [], totalCount: 0, hasVideoEvents: true };
    }

    // Fetch signal metadata for the unique signal IDs.
    const signalIds = [
      ...new Set(
        clipRows
          .map((r: Record<string, unknown>) => r.linked_signal_id as string | null)
          .filter(Boolean) as string[],
      ),
    ];

    const signalMap = new Map<
      string,
      { title: string; severity: string; category: string; disposition: string }
    >();

    if (signalIds.length > 0) {
      const { data: sigRows } = await supabase
        .from('baseball_signals')
        .select('id, title, severity, category, disposition')
        .in('id', signalIds)
        .eq('team_id', teamId);
      for (const s of sigRows ?? []) {
        const sr = s as {
          id: string;
          title: string;
          severity: string;
          category: string;
          disposition: string;
        };
        signalMap.set(sr.id, sr);
      }
    }

    const clips: EvidenceClip[] = clipRows.map((r: Record<string, unknown>) => {
      const sigId = (r.linked_signal_id as string | null) ?? null;
      const sig = sigId ? (signalMap.get(sigId) ?? null) : null;
      return {
        id: r.id as string,
        team_id: r.team_id as string,
        player_id: r.player_id as string,
        video_url: r.video_url as string,
        thumbnail_url: (r.thumbnail_url as string | null) ?? null,
        clip_title: (r.clip_title as string | null) ?? null,
        video_type: (r.video_type as string) ?? 'other',
        duration_seconds: (r.duration_seconds as number | null) ?? null,
        timestamp_start: (r.timestamp_start as number | null) ?? null,
        timestamp_end: (r.timestamp_end as number | null) ?? null,
        tags: (r.tags as string[]) ?? [],
        source_vendor: (r.source_vendor as string | null) ?? null,
        source_label: (r.source_label as string | null) ?? null,
        source_confidence: (r.source_confidence as number | null) ?? null,
        review_status: (r.review_status as string | null) ?? null,
        visibility: (r.visibility as string) ?? 'staff_only',
        disposition: (r.disposition as string | null) ?? null,
        notes: (r.notes as string | null) ?? null,
        plate_appearance_id: (r.plate_appearance_id as string | null) ?? null,
        pitch_event_id: (r.pitch_event_id as string | null) ?? null,
        game_id: (r.game_id as string | null) ?? null,
        linked_signal_id: sigId,
        linked_action_id: (r.linked_action_id as string | null) ?? null,
        created_at: r.created_at as string,
        player: normalizePlayer(r.player as Record<string, unknown> | null),
        signal_title: sig?.title ?? null,
        signal_severity: sig?.severity ?? null,
        signal_category: sig?.category ?? null,
        signal_disposition: sig?.disposition ?? null,
      };
    });

    return { clips, totalCount: count ?? clips.length, hasVideoEvents: true };
  },
);

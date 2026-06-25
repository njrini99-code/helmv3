// =============================================================================
// src/lib/baseball/read-models/timeline.ts
//
// Wave 3 / packet P3.2 — Player Timeline read model.
//
// Returns a chronological feed of baseball_player_timeline_events for a single
// player, with VISIBILITY FILTERING applied on top of RLS (defense in depth).
//
// Visibility model (matches 20260624000040 + BaseballTimelineVisibility):
//   'team'        -> visible to all team members (players + coaches)
//   'staff_only'  -> coaches/staff ONLY; NEVER returned to a player viewer
//   'player_only' -> the subject player + staff (private coach<->player note)
//
// DEFENSE IN DEPTH: RLS already blocks a player from reading 'staff_only' rows,
// but this read model is the single import surface other verticals use, so it
// ALSO enforces the viewer-role filter here. A bug in one layer is caught by the
// other. The read model resolves the viewer from the auth session — callers do
// NOT pass a role they can lie about.
//
// Every returned event is source-labeled via source-record.ts so the UI can
// honestly show "AI generated / 72%" vs "Coach note" vs "Unverified import".
//
// 'server-only': this module runs on the server (it reads the session + DB).
// It exports plain async functions (NOT 'use server' actions) so it can be
// imported by server components and other read models.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import type {
  BaseballPlayerTimelineEventRow,
  BaseballTimelineVisibility,
} from '@/lib/types';
import {
  buildSourceRef,
  normalizeConfidence,
  type SourceRef,
} from '@/lib/baseball/source-record';

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

/** Who is asking — resolved server-side, never client-supplied. */
export type TimelineViewerRole = 'staff' | 'player' | 'none';

/** A timeline event enriched with resolved provenance for rendering. */
export interface TimelineEventView {
  id: string;
  playerId: string;
  teamId: string;
  eventType: string;
  title: string;
  body: string | null;
  occurredAt: string;
  visibility: BaseballTimelineVisibility;
  /** Resolved provenance (source kind + label + id). */
  sourceRef: SourceRef;
  /** Normalized [0,1] confidence, or null. */
  confidence: number | null;
}

export interface PlayerTimelineReadModel {
  playerId: string;
  /** The role the read model resolved for the current viewer. */
  viewerRole: TimelineViewerRole;
  events: TimelineEventView[];
  /** True when at least one staff_only/player-restricted row was filtered out. */
  hiddenCount: number;
  /** Honest error string when the read failed; data is still [] in that case. */
  error: string | null;
}

// -----------------------------------------------------------------------------
// Options
// -----------------------------------------------------------------------------

export interface PlayerTimelineOptions {
  /** Max events to return (default 50). */
  limit?: number;
  /** Only events at/after this ISO timestamp. */
  since?: string;
  /** Restrict to specific event types (e.g. ['stat_milestone','coach_note']). */
  eventTypes?: string[];
}

// -----------------------------------------------------------------------------
// Viewer resolution
// -----------------------------------------------------------------------------

interface ResolvedViewer {
  userId: string | null;
  role: TimelineViewerRole;
  /** The viewer's own player id when role === 'player'. */
  selfPlayerId: string | null;
}

/**
 * Resolve the current viewer's role *for the given team*. Staff = the user has a
 * baseball_team_coach_staff row on this team. Player = the user's player profile
 * is a member of this team. Both reads go through RLS, so a user can only ever
 * confirm their OWN membership.
 */
async function resolveViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
): Promise<ResolvedViewer> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { userId: null, role: 'none', selfPlayerId: null };

  const [coachProfile, playerProfile] = await Promise.all([
    supabase.from('baseball_coaches').select('id').eq('user_id', user.id).maybeSingle(),
    supabase.from('baseball_players').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  const coachId = coachProfile.data?.id ?? null;
  const playerId = playerProfile.data?.id ?? null;

  // Staff check first — staff is the broader visibility role.
  if (coachId) {
    const { data: staffRow } = await supabase
      .from('baseball_team_coach_staff')
      .select('id')
      .eq('team_id', teamId)
      .eq('coach_id', coachId)
      .maybeSingle();
    if (staffRow) {
      return { userId: user.id, role: 'staff', selfPlayerId: playerId };
    }
  }

  if (playerId) {
    const { data: memberRow } = await supabase
      .from('baseball_team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (memberRow) {
      return { userId: user.id, role: 'player', selfPlayerId: playerId };
    }
  }

  return { userId: user.id, role: 'none', selfPlayerId: playerId };
}

/**
 * Application-side visibility predicate (defense in depth on top of RLS).
 *   staff  -> sees everything for the team.
 *   player -> sees 'team' + ('player_only' for THEIR OWN player_id);
 *             NEVER 'staff_only'.
 *   none   -> sees nothing.
 */
function canViewerSee(
  viewer: ResolvedViewer,
  ev: { visibility: BaseballTimelineVisibility; player_id: string },
): boolean {
  if (viewer.role === 'staff') return true;
  if (viewer.role === 'player') {
    if (ev.visibility === 'staff_only') return false;
    if (ev.visibility === 'player_only') {
      return viewer.selfPlayerId !== null && ev.player_id === viewer.selfPlayerId;
    }
    return ev.visibility === 'team';
  }
  return false;
}

// -----------------------------------------------------------------------------
// getPlayerTimeline
// -----------------------------------------------------------------------------

/**
 * Read a player's chronological timeline (newest first), filtered to what the
 * current viewer is allowed to see. `teamId` scopes both the visibility role and
 * the query; an event always belongs to exactly one team.
 *
 * Never throws — returns an honest error string and empty events on failure.
 */
export async function getPlayerTimeline(
  teamId: string,
  playerId: string,
  options: PlayerTimelineOptions = {},
): Promise<PlayerTimelineReadModel> {
  const { limit = 50, since, eventTypes } = options;
  const empty = (
    viewerRole: TimelineViewerRole,
    error: string | null,
  ): PlayerTimelineReadModel => ({
    playerId,
    viewerRole,
    events: [],
    hiddenCount: 0,
    error,
  });

  if (!teamId || !playerId) {
    return empty('none', 'A team id and player id are required.');
  }

  const supabase = await createClient();
  const viewer = await resolveViewer(supabase, teamId);
  if (viewer.role === 'none') {
    return empty('none', null); // not a member — honest empty, not an error
  }

  // baseball_player_timeline_events ships in migration 20260624000040 but the
  // generated database.ts types lag the migration (we cannot db:types regen on a
  // shared prod DB). Cast through the established `as any` table-accessor pattern
  // used elsewhere in the baseball actions; the row shape is still strongly
  // typed below via the hand-written BaseballPlayerTimelineEventRow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let query = (supabase as any)
    .from('baseball_player_timeline_events')
    .select(
      'id, player_id, team_id, event_type, title, body, source_type, source_id, confidence, occurred_at, visibility',
    )
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .order('occurred_at', { ascending: false })
    .limit(Math.min(Math.max(limit, 1), 200));

  if (since) query = query.gte('occurred_at', since);
  if (eventTypes && eventTypes.length > 0) query = query.in('event_type', eventTypes);

  const { data, error } = (await query) as {
    data:
      | Pick<
          BaseballPlayerTimelineEventRow,
          | 'id'
          | 'player_id'
          | 'team_id'
          | 'event_type'
          | 'title'
          | 'body'
          | 'source_type'
          | 'source_id'
          | 'confidence'
          | 'occurred_at'
          | 'visibility'
        >[]
      | null;
    error: unknown;
  };
  if (error) {
    return empty(viewer.role, 'Could not load the player timeline.');
  }

  const rows = data ?? [];

  let hiddenCount = 0;
  const events: TimelineEventView[] = [];
  for (const r of rows) {
    if (!canViewerSee(viewer, { visibility: r.visibility, player_id: r.player_id })) {
      hiddenCount += 1;
      continue;
    }
    events.push({
      id: r.id,
      playerId: r.player_id,
      teamId: r.team_id,
      eventType: r.event_type,
      title: r.title,
      body: r.body,
      occurredAt: r.occurred_at,
      visibility: r.visibility,
      sourceRef: buildSourceRef({ source: r.source_type, sourceId: r.source_id }),
      confidence: normalizeConfidence(r.confidence),
    });
  }

  return { playerId, viewerRole: viewer.role, events, hiddenCount, error: null };
}

// -----------------------------------------------------------------------------
// getTimelineAcksForViewer
// -----------------------------------------------------------------------------

/**
 * Resolve which of the given timeline event ids the CURRENT viewer has
 * acknowledged. Self-scoped (user_id = auth.uid()), read through RLS on
 * baseball_timeline_event_acks. Returns a plain map keyed by event id so the
 * profile page can pass it straight into ProfileTimeline's `acknowledged` prop.
 *
 * Never throws — on any failure (or no session) it returns an empty map so the
 * timeline still renders, just without ack chips. The map only ever contains
 * `true` entries (acknowledged); absence means "not acknowledged".
 */
export async function getTimelineAcksForViewer(
  eventIds: string[],
): Promise<Record<string, boolean>> {
  const ids = Array.from(new Set(eventIds.filter((id): id is string => !!id)));
  if (ids.length === 0) return {};

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return {};

  // baseball_timeline_event_acks ships in migration 20260624000430 and is not in
  // the generated database.ts (we cannot regen against the shared DB). Use the
  // established `as any` table-accessor pattern; RLS is the real boundary and the
  // row shape is documented by the hand-written BaseballTimelineEventAckRow type.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = (await (supabase as any)
    .from('baseball_timeline_event_acks')
    .select('timeline_event_id')
    .eq('user_id', user.id)
    .in('timeline_event_id', ids)) as {
    data: { timeline_event_id: string }[] | null;
    error: unknown;
  };

  if (error || !data) return {};

  const map: Record<string, boolean> = {};
  for (const row of data) map[row.timeline_event_id] = true;
  return map;
}

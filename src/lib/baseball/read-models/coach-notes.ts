// =============================================================================
// src/lib/baseball/read-models/coach-notes.ts
//
// v7 Player Profile Snapshot System §"Staff Notes" — scoped staff-notes read
// model. The SINGLE server-side surface that resolves which baseball_coach_notes
// a viewer is permitted to see, with VISIBILITY FILTERING applied on top of RLS
// (defense in depth). Used by the player profile page (read path) AND the AI
// summarizer (so the summary can only ever ingest notes inside the viewer's
// boundary).
//
// Scope -> who can read (mirrors the 20260624000900 SELECT policy):
//   staff_public        any staff on the team
//   coach_group         staff with can_view_private_notes (or head/primary)
//   strength            staff with can_manage_lifting      (or head/primary)
//   academic            staff with can_view_academics      (or head/primary)
//   player_visible      ALL staff + the SUBJECT player themselves
//   hidden_from_player  staff with can_view_private_notes (or head/primary);
//                       NEVER the player
//
// DEFENSE IN DEPTH: RLS already blocks a player from reading a staff scope, but
// this read model is the import surface the page + summarizer use, so it ALSO
// computes the permitted-scope set from the resolved viewer and filters. A bug
// in one layer is caught by the other. The viewer is resolved from the auth
// session — callers never pass a role they can lie about.
//
// 'server-only': reads the session + DB. Exports plain async functions (NOT
// 'use server' actions) so server components and other read models can import it.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { resolveBaseballCapabilities } from '@/lib/baseball/capabilities';
import {
  BASEBALL_NOTE_SCOPES,
  type BaseballNoteScope,
  type BaseballCoachNoteRow,
} from '@/lib/types';

// -----------------------------------------------------------------------------
// Public shapes
// -----------------------------------------------------------------------------

/** Who is asking — resolved server-side, never client-supplied. */
export type NotesViewerRole = 'staff' | 'player' | 'none';

/** A note enriched for rendering. `canEdit` is the per-row author/head check. */
export interface CoachNoteView {
  id: string;
  playerId: string;
  teamId: string;
  authorCoachId: string | null;
  authorName: string | null;
  body: string;
  scope: BaseballNoteScope;
  createdAt: string;
  editedAt: string | null;
  /** True when the current viewer may edit/soft-delete this row. */
  canEdit: boolean;
}

export interface CoachNotesReadModel {
  playerId: string;
  teamId: string;
  viewerRole: NotesViewerRole;
  /** The scopes this viewer is permitted to read (drives the AI boundary too). */
  permittedScopes: BaseballNoteScope[];
  /** Whether the viewer may author a new note (staff only). */
  canAuthor: boolean;
  notes: CoachNoteView[];
  /** Count of live notes filtered out by scope (staff-only signal; 0 for player). */
  hiddenCount: number;
  /** Honest error string when the read failed; notes is still [] in that case. */
  error: string | null;
}

// -----------------------------------------------------------------------------
// Viewer resolution
// -----------------------------------------------------------------------------

interface ResolvedNotesViewer {
  userId: string | null;
  role: NotesViewerRole;
  /** The viewer's own coach id when staff. */
  coachId: string | null;
  /** The viewer's own player id when role === 'player'. */
  selfPlayerId: string | null;
  /** True when head/primary (full authority) — may edit any note. */
  isHeadCoach: boolean;
  /** The scopes this viewer may read. */
  permittedScopes: BaseballNoteScope[];
}

/**
 * Resolve the current viewer's role + permitted note scopes for a team. Staff =
 * a baseball_team_coach_staff row on this team (checked via the capability
 * resolver, which already encodes suspended/removed => no caps). Player = the
 * user's player profile is a member of this team. Both go through RLS, so a user
 * can only ever confirm their OWN membership.
 */
async function resolveNotesViewer(
  supabase: Awaited<ReturnType<typeof createClient>>,
  teamId: string,
  subjectPlayerId: string,
): Promise<ResolvedNotesViewer> {
  const none: ResolvedNotesViewer = {
    userId: null,
    role: 'none',
    coachId: null,
    selfPlayerId: null,
    isHeadCoach: false,
    permittedScopes: [],
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return none;

  const [coachProfile, playerProfile] = await Promise.all([
    supabase.from('baseball_coaches').select('id').eq('user_id', user.id).maybeSingle(),
    supabase.from('baseball_players').select('id').eq('user_id', user.id).maybeSingle(),
  ]);

  const coachId = coachProfile.data?.id ?? null;
  const playerId = playerProfile.data?.id ?? null;

  // Staff first — the broader role. resolveBaseballCapabilities returns an
  // all-false map for a non-staff/suspended user, so we treat "any can_*"=false
  // AND no head flag as "not staff" — but we also need a positive staff signal.
  if (coachId) {
    const caps = await resolveBaseballCapabilities(teamId);
    // A coach is staff on this team iff the capability resolver found a staff row.
    // is_head_coach == full authority. Any true capability OR head implies staff.
    const isStaff = Object.values(caps).some(Boolean);
    if (isStaff) {
      const isHead = caps.is_head_coach === true;
      const permitted: BaseballNoteScope[] = [];
      // Every staff sees staff_public + player_visible.
      permitted.push('staff_public', 'player_visible');
      if (isHead || caps.can_view_private_notes) {
        permitted.push('coach_group', 'hidden_from_player');
      }
      if (isHead || caps.can_manage_lifting) permitted.push('strength');
      if (isHead || caps.can_view_academics) permitted.push('academic');
      return {
        userId: user.id,
        role: 'staff',
        coachId,
        selfPlayerId: playerId,
        isHeadCoach: isHead,
        // Order per BASEBALL_NOTE_SCOPES for stable chips.
        permittedScopes: BASEBALL_NOTE_SCOPES.filter((s) => permitted.includes(s)),
      };
    }
  }

  // Player on this team — only ever player_visible for THEIR OWN id.
  if (playerId) {
    const { data: memberRow } = await supabase
      .from('baseball_team_members')
      .select('id')
      .eq('team_id', teamId)
      .eq('player_id', playerId)
      .maybeSingle();
    if (memberRow && playerId === subjectPlayerId) {
      return {
        userId: user.id,
        role: 'player',
        coachId: null,
        selfPlayerId: playerId,
        isHeadCoach: false,
        permittedScopes: ['player_visible'],
      };
    }
    // A player viewing ANOTHER player's notes sees nothing.
    if (memberRow) {
      return { ...none, userId: user.id, selfPlayerId: playerId, role: 'player' };
    }
  }

  return { ...none, userId: user.id };
}

// -----------------------------------------------------------------------------
// getPlayerCoachNotes
// -----------------------------------------------------------------------------

/**
 * Read a player's staff notes, filtered to the scopes the current viewer is
 * allowed to see. Soft-deleted rows (archived_at) are excluded. Newest first.
 *
 * Never throws — returns an honest error string + empty notes on failure.
 */
export async function getPlayerCoachNotes(
  teamId: string,
  playerId: string,
  options: { limit?: number } = {},
): Promise<CoachNotesReadModel> {
  const limit = Math.min(Math.max(options.limit ?? 100, 1), 200);
  const empty = (
    viewerRole: NotesViewerRole,
    permittedScopes: BaseballNoteScope[],
    canAuthor: boolean,
    error: string | null,
  ): CoachNotesReadModel => ({
    playerId,
    teamId,
    viewerRole,
    permittedScopes,
    canAuthor,
    notes: [],
    hiddenCount: 0,
    error,
  });

  if (!teamId || !playerId) {
    return empty('none', [], false, 'A team id and player id are required.');
  }

  const supabase = await createClient();
  const viewer = await resolveNotesViewer(supabase, teamId, playerId);
  if (viewer.role === 'none') {
    return empty('none', [], false, null); // not a member — honest empty
  }
  if (viewer.permittedScopes.length === 0) {
    // Authenticated member but no readable scopes (e.g. another player's notes).
    return empty(viewer.role, [], false, null);
  }

  // baseball_coach_notes ships in 20260624000900; database.ts reflects the real
  // shared prod columns (updated_at/archived_at, not edited_at/deleted_at), so
  // use the established `as any` table-accessor pattern. The row shape is
  // strongly typed below via the hand-written BaseballCoachNoteRow.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = (await (supabase as any)
    .from('baseball_coach_notes')
    .select('id, player_id, team_id, author_coach_id, body, scope, updated_at, archived_at, created_at')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .is('archived_at', null)
    .order('created_at', { ascending: false })
    .limit(limit)) as {
    data: BaseballCoachNoteRow[] | null;
    error: unknown;
  };

  if (error) {
    return empty(viewer.role, viewer.permittedScopes, viewer.role === 'staff', 'Could not load notes.');
  }

  const rows = data ?? [];
  const permitted = new Set(viewer.permittedScopes);

  // Resolve author display names in one batched read (staff-only; players never
  // see author identity rows anyway since they only see player_visible notes).
  const authorIds = Array.from(
    new Set(rows.map((r) => r.author_coach_id).filter((id): id is string => !!id)),
  );
  const authorNames = new Map<string, string>();
  if (authorIds.length > 0 && viewer.role === 'staff') {
    const { data: authors } = await supabase
      .from('baseball_coaches')
      .select('id, full_name')
      .in('id', authorIds);
    for (const a of authors ?? []) {
      const name = (a.full_name ?? '').trim();
      if (name) authorNames.set(a.id, name);
    }
  }

  let hiddenCount = 0;
  const notes: CoachNoteView[] = [];
  for (const r of rows) {
    // player_visible for a player viewer must also be THEIR row (RLS enforces it;
    // belt-and-suspenders here too).
    if (viewer.role === 'player' && r.player_id !== viewer.selfPlayerId) {
      hiddenCount += 1;
      continue;
    }
    if (!permitted.has(r.scope)) {
      hiddenCount += 1;
      continue;
    }
    const canEdit =
      viewer.role === 'staff' &&
      (viewer.isHeadCoach ||
        (r.author_coach_id !== null && r.author_coach_id === viewer.coachId));
    notes.push({
      id: r.id,
      playerId: r.player_id,
      teamId: r.team_id,
      authorCoachId: r.author_coach_id,
      authorName: r.author_coach_id ? authorNames.get(r.author_coach_id) ?? null : null,
      body: r.body,
      scope: r.scope,
      createdAt: r.created_at,
      editedAt: r.updated_at,
      canEdit,
    });
  }

  return {
    playerId,
    teamId,
    viewerRole: viewer.role,
    permittedScopes: viewer.permittedScopes,
    canAuthor: viewer.role === 'staff',
    notes,
    hiddenCount,
    error: null,
  };
}

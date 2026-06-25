'use server';

// =============================================================================
// src/app/baseball/actions/coach-notes.ts
//
// v7 Player Profile Snapshot System §"Staff Notes" — create / edit / soft-delete
// scoped staff notes, plus a visibility-bounded AI summary.
//
// EVERY mutation runs inside withBaseballAction:
//   * auth + active-context resolution
//   * server-side capability enforcement (notes require staff; scope-gated
//     scopes additionally require the matching read capability so a coach can
//     never write into a bucket they cannot themselves see)
//   * Sentry scope + centralized error logging (sanitized rethrow)
//
// NON-DESTRUCTIVE BY CONTRACT:
//   * edit  -> UPDATE body/scope + edited_at (prior body is replaced in place,
//              but there is no delete-then-reinsert; edited_at records the touch)
//   * delete -> SOFT delete (deleted_at = now()); the row is never hard-deleted.
//
// TIMELINE LOOP: creating a note appends a 'note' timeline event (staff_only by
// default, or 'player_only' when the note is player_visible) via the existing
// timeline-writer wrapper — closing source -> signal -> action -> timeline.
//
// AI SUMMARY: deterministic + extractive (no external LLM dependency, honest).
// It ingests ONLY the notes the CURRENT viewer is permitted to see (via the
// coach-notes read model), so a summary can never leak across a visibility
// boundary.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { appendNoteTimelineEvent } from '@/lib/baseball/timeline-writer';
import {
  resolveBaseballCapabilities,
  type BaseballCapabilityMap,
} from '@/lib/baseball/capabilities';
import { getPlayerCoachNotes } from '@/lib/baseball/read-models/coach-notes';
import {
  BASEBALL_NOTE_SCOPES,
  type BaseballNoteScope,
  type BaseballCoachNoteInsert,
  type BaseballCoachNoteUpdate,
} from '@/lib/types';

// -----------------------------------------------------------------------------
// Shared result + helpers
// -----------------------------------------------------------------------------

export interface CoachNoteActionResult {
  success: boolean;
  error?: string;
  noteId?: string;
}

const MAX_NOTE_LENGTH = 4000;

function isValidScope(scope: unknown): scope is BaseballNoteScope {
  return (
    typeof scope === 'string' &&
    (BASEBALL_NOTE_SCOPES as readonly string[]).includes(scope)
  );
}

/**
 * Can the staff member (by their resolved capability map) AUTHOR a note at this
 * scope? Authoring a scope requires being able to READ it, so a coach cannot
 * write into a bucket they cannot see. Head/primary hold every capability.
 */
function canAuthorScope(caps: BaseballCapabilityMap, scope: BaseballNoteScope): boolean {
  if (caps.is_head_coach) return true;
  switch (scope) {
    case 'staff_public':
    case 'player_visible':
      return true; // any staff
    case 'coach_group':
    case 'hidden_from_player':
      return caps.can_view_private_notes === true;
    case 'strength':
      return caps.can_manage_lifting === true;
    case 'academic':
      return caps.can_view_academics === true;
    default:
      return false;
  }
}

function revalidatePlayer(playerId: string) {
  revalidatePath(`/baseball/dashboard/players/${playerId}`);
  revalidatePath('/baseball/dashboard/command-center');
}

// -----------------------------------------------------------------------------
// createCoachNote
// -----------------------------------------------------------------------------

/**
 * Create a scoped staff note for a player. Requires staff on the active team;
 * the chosen scope additionally requires the matching read capability. Appends a
 * 'note' timeline event (player_only when player_visible, else staff_only).
 */
export const createCoachNote = withBaseballAction(
  'createCoachNote',
  { featureArea: 'baseball-notes' },
  async (
    ctx,
    args: { playerId: string; body: string; scope: BaseballNoteScope },
  ): Promise<CoachNoteActionResult> => {
    const teamId = ctx.targetTeamId;
    const playerId = args.playerId;
    const body = (args.body ?? '').trim();
    const scope = args.scope;

    if (!playerId) return { success: false, error: 'A player is required.' };
    if (!body) return { success: false, error: 'A note cannot be empty.' };
    if (body.length > MAX_NOTE_LENGTH) {
      return { success: false, error: `Notes are limited to ${MAX_NOTE_LENGTH} characters.` };
    }
    if (!isValidScope(scope)) return { success: false, error: 'Invalid note visibility.' };

    // Capability gate: must be staff, and must be able to author this scope.
    const caps = await resolveBaseballCapabilities(teamId);
    const isStaff = Object.values(caps).some(Boolean);
    if (!isStaff) return { success: false, error: 'Only staff can write notes.' };
    if (!canAuthorScope(caps, scope)) {
      return { success: false, error: 'You do not have permission for that visibility.' };
    }

    const supabase = await createClient();

    // Verify the player exists (label the timeline event; avoid dangling FK).
    const { data: player } = await supabase
      .from('baseball_players')
      .select('id, first_name, last_name')
      .eq('id', playerId)
      .maybeSingle();
    if (!player) return { success: false, error: 'That player could not be found.' };

    const insert: BaseballCoachNoteInsert = {
      player_id: playerId,
      team_id: teamId,
      author_coach_id: ctx.activeCoachId,
      body,
      scope,
    };

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase as any)
      .from('baseball_coach_notes')
      .insert(insert)
      .select('id')
      .single();

    if (error) throw error; // wrapper sanitizes + logs

    const noteId = (data as { id: string } | null)?.id;

    // Timeline side-effect — never rolls back the note. player_visible notes are
    // a private coach<->player note (player_only); every other scope is staff_only.
    const playerName = `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || 'this player';
    await appendNoteTimelineEvent({
      teamId,
      playerId,
      title: `Coach note added for ${playerName}`,
      body: scope === 'player_visible' ? body.slice(0, 280) : null,
      visibility: scope === 'player_visible' ? 'player_only' : 'staff_only',
      source: 'manual',
      sourceId: noteId ?? null,
      createdBy: ctx.user.id,
    });

    revalidatePlayer(playerId);
    return { success: true, noteId };
  },
);

// -----------------------------------------------------------------------------
// updateCoachNote (non-destructive edit)
// -----------------------------------------------------------------------------

/**
 * Edit a note's body and/or scope in place (non-destructive: edited_at is
 * stamped; no delete-then-reinsert). The author may edit their own note; a
 * head/primary coach may edit any. Changing scope requires authoring permission
 * for the NEW scope. RLS is the real boundary; this re-checks app-side too.
 */
export const updateCoachNote = withBaseballAction(
  'updateCoachNote',
  { featureArea: 'baseball-notes' },
  async (
    ctx,
    args: { noteId: string; body?: string; scope?: BaseballNoteScope },
  ): Promise<CoachNoteActionResult> => {
    const { noteId } = args;
    if (!noteId) return { success: false, error: 'A note id is required.' };

    const supabase = await createClient();

    // Load the existing note (RLS already restricts what we can read).
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('baseball_coach_notes')
      .select('id, player_id, team_id, author_coach_id, scope, deleted_at')
      .eq('id', noteId)
      .maybeSingle();

    if (!existing || existing.deleted_at) {
      return { success: false, error: 'That note could not be found.' };
    }

    const teamId = existing.team_id as string;
    const caps = await resolveBaseballCapabilities(teamId);
    const isStaff = Object.values(caps).some(Boolean);
    if (!isStaff) return { success: false, error: 'Only staff can edit notes.' };

    const isAuthor =
      ctx.activeCoachId !== null && existing.author_coach_id === ctx.activeCoachId;
    if (!isAuthor && !caps.is_head_coach) {
      return { success: false, error: 'You can only edit your own notes.' };
    }

    const patch: BaseballCoachNoteUpdate = { edited_at: new Date().toISOString() };

    if (typeof args.body === 'string') {
      const body = args.body.trim();
      if (!body) return { success: false, error: 'A note cannot be empty.' };
      if (body.length > MAX_NOTE_LENGTH) {
        return { success: false, error: `Notes are limited to ${MAX_NOTE_LENGTH} characters.` };
      }
      patch.body = body;
    }

    if (typeof args.scope !== 'undefined') {
      if (!isValidScope(args.scope)) return { success: false, error: 'Invalid note visibility.' };
      if (!canAuthorScope(caps, args.scope)) {
        return { success: false, error: 'You do not have permission for that visibility.' };
      }
      patch.scope = args.scope;
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_coach_notes')
      .update(patch)
      .eq('id', noteId);

    if (error) throw error;

    revalidatePlayer(existing.player_id as string);
    return { success: true, noteId };
  },
);

// -----------------------------------------------------------------------------
// deleteCoachNote (soft delete)
// -----------------------------------------------------------------------------

/**
 * Soft-delete a note (deleted_at = now()). NEVER a hard row delete. The author
 * may delete their own; head/primary may delete any.
 */
export const deleteCoachNote = withBaseballAction(
  'deleteCoachNote',
  { featureArea: 'baseball-notes' },
  async (ctx, args: { noteId: string }): Promise<CoachNoteActionResult> => {
    const { noteId } = args;
    if (!noteId) return { success: false, error: 'A note id is required.' };

    const supabase = await createClient();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: existing } = await (supabase as any)
      .from('baseball_coach_notes')
      .select('id, player_id, team_id, author_coach_id, deleted_at')
      .eq('id', noteId)
      .maybeSingle();

    if (!existing || existing.deleted_at) {
      // Idempotent: deleting an already-deleted/absent note is a no-op success.
      return { success: true, noteId };
    }

    const teamId = existing.team_id as string;
    const caps = await resolveBaseballCapabilities(teamId);
    const isStaff = Object.values(caps).some(Boolean);
    if (!isStaff) return { success: false, error: 'Only staff can delete notes.' };

    const isAuthor =
      ctx.activeCoachId !== null && existing.author_coach_id === ctx.activeCoachId;
    if (!isAuthor && !caps.is_head_coach) {
      return { success: false, error: 'You can only delete your own notes.' };
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase as any)
      .from('baseball_coach_notes')
      .update({ deleted_at: new Date().toISOString() } satisfies BaseballCoachNoteUpdate)
      .eq('id', noteId);

    if (error) throw error;

    revalidatePlayer(existing.player_id as string);
    return { success: true, noteId };
  },
);

// -----------------------------------------------------------------------------
// summarizeCoachNotes — visibility-bounded, deterministic, honest
// -----------------------------------------------------------------------------

export interface CoachNotesSummaryResult {
  success: boolean;
  error?: string;
  /** The generated summary (markdown-free plain text). Empty when no notes. */
  summary?: string;
  /** How many notes were ingested (within the viewer's boundary). */
  ingestedCount?: number;
  /** The scopes the summary was permitted to read. */
  scopes?: BaseballNoteScope[];
}

/**
 * Build a short, extractive summary of a player's notes — ONLY the ones the
 * current viewer is permitted to see (via getPlayerCoachNotes, which mirrors the
 * RLS scope gate). Deterministic and source-faithful: it never invents content,
 * it groups recent notes by scope and surfaces the most recent lines, so the AI
 * boundary is provably honored (no note outside the viewer's scopes can appear).
 *
 * This is intentionally NOT a free-text LLM call: an LLM summary of staff notes
 * would risk paraphrasing a hidden-from-player note into a player-visible
 * surface. By only ever reading the viewer-permitted set and quoting verbatim
 * fragments, the summary cannot cross a visibility boundary.
 */
export const summarizeCoachNotes = withBaseballAction(
  'summarizeCoachNotes',
  { featureArea: 'baseball-notes' },
  async (ctx, args: { playerId: string }): Promise<CoachNotesSummaryResult> => {
    const teamId = ctx.targetTeamId;
    const { playerId } = args;
    if (!playerId) return { success: false, error: 'A player is required.' };

    const model = await getPlayerCoachNotes(teamId, playerId, { limit: 200 });
    if (model.error) return { success: false, error: model.error };
    if (model.viewerRole === 'none') {
      return { success: false, error: 'You do not have access to these notes.' };
    }
    if (model.notes.length === 0) {
      return {
        success: true,
        summary: '',
        ingestedCount: 0,
        scopes: model.permittedScopes,
      };
    }

    const SCOPE_LABEL: Record<BaseballNoteScope, string> = {
      staff_public: 'Staff',
      coach_group: 'Coach group',
      strength: 'Strength',
      academic: 'Academic',
      player_visible: 'Player-visible',
      hidden_from_player: 'Private',
    };

    // Group by scope, newest first within each group (notes already newest-first).
    const byScope = new Map<BaseballNoteScope, typeof model.notes>();
    for (const n of model.notes) {
      const arr = byScope.get(n.scope) ?? [];
      arr.push(n);
      byScope.set(n.scope, arr);
    }

    const firstSentence = (body: string): string => {
      const clean = body.replace(/\s+/g, ' ').trim();
      const m = clean.match(/^.*?[.!?](?:\s|$)/);
      const s = (m ? m[0] : clean).trim();
      return s.length > 160 ? `${s.slice(0, 157)}…` : s;
    };

    const lines: string[] = [];
    // Order groups by the canonical scope order, restricted to what's present.
    for (const scope of BASEBALL_NOTE_SCOPES) {
      const arr = byScope.get(scope);
      if (!arr || arr.length === 0) continue;
      const top = arr.slice(0, 3).map((n) => `• ${firstSentence(n.body)}`);
      lines.push(`${SCOPE_LABEL[scope]} (${arr.length}):`);
      lines.push(...top);
      if (arr.length > 3) lines.push(`  …and ${arr.length - 3} more`);
    }

    const header =
      model.viewerRole === 'player'
        ? `Your visible coaching notes (${model.notes.length})`
        : `Notes summary across ${model.permittedScopes.length} visible scope(s) — ${model.notes.length} note(s)`;

    const summary = [header, '', ...lines].join('\n');

    return {
      success: true,
      summary,
      ingestedCount: model.notes.length,
      scopes: model.permittedScopes,
    };
  },
);

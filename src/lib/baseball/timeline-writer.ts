// =============================================================================
// src/lib/baseball/timeline-writer.ts
//
// Wave 5 / packet P5.2 — Timeline writer.
//
// A single, server-only helper that appends a row to
// baseball_player_timeline_events whenever something noteworthy happens to a
// player: a stat is imported, a practice is logged, a lift is recorded, a coach
// note is written, a CSV import lands, or an AI insight is generated.
//
// WHY A WRITER (not raw inserts scattered in every action):
//   * ONE place enforces the visibility model + source/confidence provenance, so
//     a 'staff_only' coach note can never accidentally be written as 'team'.
//   * ONE place picks the right client. Coach-initiated events are written
//     through the caller's RLS-scoped client (the timeline INSERT policy already
//     requires is_baseball_team_coach_v2(team_id)). SYSTEM/AI events that run
//     outside a coach session (cron, background insight generation) use the
//     service-role admin client — the only path allowed to bypass RLS, and ONLY
//     for system/AI provenance.
//   * NON-DESTRUCTIVE BY CONTRACT: append-only. There is no update/delete path in
//     this module; a timeline is an immutable history. Callers never delete and
//     re-insert.
//
// This module exports plain async functions (NOT 'use server' actions). It is
// imported by server actions (roster/notes/imports/insights) and background
// jobs. It never throws into the caller's happy path — a timeline write is a
// side-effect of the primary mutation and must not roll the primary back; it
// returns an honest { ok, error } result the caller can log-and-ignore.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { createAdminClient } from '@/lib/supabase/admin';
import { logServerError } from '@/lib/server-error-logger';
import type {
  BaseballPlayerTimelineEventInsert,
  BaseballTimelineVisibility,
} from '@/lib/types';
import {
  normalizeConfidence,
  normalizeSourceKind,
  type SourceKind,
} from '@/lib/baseball/source-record';

// -----------------------------------------------------------------------------
// Event taxonomy
// -----------------------------------------------------------------------------

/**
 * The kinds of things that produce a timeline entry. Stored as the row's
 * `event_type` (free text in the DB, but constrained here so the UI can map an
 * icon/label per kind). Additive: new kinds can be appended without a migration.
 */
export type TimelineEventKind =
  | 'stat' // a stat line / game stat was recorded
  | 'stat_milestone' // a notable stat threshold was crossed
  | 'practice' // a practice the player attended / was logged
  | 'lift' // a lifting/performance session result
  | 'note' // a coach note about the player
  | 'import' // a CSV/external import touched this player
  | 'ai' // an AI insight / prediction was generated
  | 'recruiting' // a recruiting touch (view / message / stage change)
  | 'roster' // joined / removed / status change on the roster
  | 'system'; // any other system-generated event

/** Map an event kind to a sensible default source provenance kind. */
const DEFAULT_SOURCE_BY_KIND: Record<TimelineEventKind, SourceKind> = {
  stat: 'manual',
  stat_milestone: 'system',
  practice: 'manual',
  lift: 'manual',
  note: 'manual',
  import: 'csv_import',
  ai: 'ai',
  recruiting: 'manual',
  roster: 'manual',
  system: 'system',
};

/** Map an event kind to its default visibility. Staff-private by default for AI. */
const DEFAULT_VISIBILITY_BY_KIND: Record<TimelineEventKind, BaseballTimelineVisibility> = {
  stat: 'team',
  stat_milestone: 'team',
  practice: 'team',
  lift: 'player_only',
  note: 'staff_only',
  import: 'staff_only',
  ai: 'staff_only',
  recruiting: 'staff_only',
  roster: 'team',
  system: 'team',
};

// -----------------------------------------------------------------------------
// Input + result shapes
// -----------------------------------------------------------------------------

export interface AppendTimelineEventInput {
  /** The team the event belongs to (always exactly one). */
  teamId: string;
  /** The subject player. */
  playerId: string;
  /** What happened. Drives default source + visibility + the UI icon. */
  kind: TimelineEventKind;
  /** Short headline, e.g. "3-for-4, 2 RBI vs Duke". */
  title: string;
  /** Optional longer body / detail. */
  body?: string | null;
  /**
   * Visibility override. When omitted, defaults per `kind`. A 'staff_only' note
   * is NEVER widened automatically — callers must opt in to broadening it.
   */
  visibility?: BaseballTimelineVisibility;
  /**
   * Provenance override. When omitted, defaults per `kind`. The pair
   * (source kind, sourceId) is stored on the row so the UI can show
   * "AI generated / 72%" honestly.
   */
  source?: SourceKind | string | null;
  /** The originating row id (import_run id, insight id, stat id, …). */
  sourceId?: string | null;
  /** Model/import confidence in [0,1] (or 0–100, normalized here). null if N/A. */
  confidence?: number | null;
  /** When it happened. Defaults to now(). */
  occurredAt?: string;
  /** The user who triggered it (coach id from auth.users). Optional. */
  createdBy?: string | null;
}

export interface AppendTimelineEventResult {
  ok: boolean;
  /** The inserted row id when ok. */
  id?: string;
  /** Honest error string when the write failed (already logged). */
  error?: string;
}

// -----------------------------------------------------------------------------
// appendTimelineEvent
// -----------------------------------------------------------------------------

/**
 * Append a single timeline event for a player. Coach-initiated writes (the
 * default) go through the caller's RLS-scoped client, so the timeline INSERT
 * policy (`is_baseball_team_coach_v2(team_id)`) authorizes them. System/AI
 * writes that run outside a coach session pass `{ system: true }` to use the
 * service-role client — the ONLY RLS-bypass path, reserved for system/AI
 * provenance.
 *
 * APPEND-ONLY: this is the sole write surface and it never updates/deletes. It
 * never throws — a failed timeline write returns { ok:false } so the caller's
 * primary mutation is not rolled back by a side-effect.
 */
export async function appendTimelineEvent(
  input: AppendTimelineEventInput,
  opts: { system?: boolean } = {},
): Promise<AppendTimelineEventResult> {
  const { teamId, playerId, kind, title } = input;

  if (!teamId || !playerId) {
    return { ok: false, error: 'teamId and playerId are required.' };
  }
  if (!title || !title.trim()) {
    return { ok: false, error: 'A timeline event title is required.' };
  }

  const sourceKind: SourceKind = input.source
    ? normalizeSourceKind(typeof input.source === 'string' ? input.source : String(input.source))
    : DEFAULT_SOURCE_BY_KIND[kind];

  const visibility: BaseballTimelineVisibility =
    input.visibility ?? DEFAULT_VISIBILITY_BY_KIND[kind];

  // SAFETY: only system/AI provenance is ever allowed to use the RLS-bypass
  // admin client. A caller cannot smuggle a coach note through service-role.
  const useSystemClient =
    opts.system === true && (sourceKind === 'system' || sourceKind === 'ai');

  const row: BaseballPlayerTimelineEventInsert = {
    team_id: teamId,
    player_id: playerId,
    event_type: kind,
    title: title.trim(),
    body: input.body?.trim() || null,
    source_type: sourceKind,
    source_id: input.sourceId ?? null,
    confidence: normalizeConfidence(input.confidence ?? null),
    visibility,
    occurred_at: input.occurredAt ?? new Date().toISOString(),
    created_by: input.createdBy ?? null,
  };

  try {
    // The generated database.ts types lag the 20260624000040 migration (we cannot
    // db:types regen against the shared prod DB), so we cast through the
    // established `as any` table-accessor pattern used across the baseball layer.
    // The inserted shape is still strongly typed via BaseballPlayerTimelineEventInsert.
    const client = useSystemClient ? createAdminClient() : await createClient();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (client as any)
      .from('baseball_player_timeline_events')
      .insert(row)
      .select('id')
      .single();

    if (error) {
      await logServerError(
        `Failed to append timeline event (${kind}): ${
          error instanceof Error ? error.message : String(error)
        }`,
        { action: 'timeline-writer.appendTimelineEvent' },
      );
      return { ok: false, error: 'Could not record the timeline event.' };
    }

    return { ok: true, id: (data as { id: string } | null)?.id };
  } catch (err) {
    await logServerError(
      `Timeline writer threw (${kind}): ${err instanceof Error ? err.message : String(err)}`,
      { action: 'timeline-writer.appendTimelineEvent' },
    );
    return { ok: false, error: 'Could not record the timeline event.' };
  }
}

// -----------------------------------------------------------------------------
// Convenience wrappers (thin, opinionated entry points for common call sites)
// -----------------------------------------------------------------------------

/** Roster join/remove/status — visible to the whole team. */
export function appendRosterTimelineEvent(
  input: Omit<AppendTimelineEventInput, 'kind'>,
): Promise<AppendTimelineEventResult> {
  return appendTimelineEvent({ ...input, kind: 'roster' });
}

/** A coach note — staff-only by default (never auto-widened to players). */
export function appendNoteTimelineEvent(
  input: Omit<AppendTimelineEventInput, 'kind'>,
): Promise<AppendTimelineEventResult> {
  return appendTimelineEvent({ ...input, kind: 'note' });
}

/** A CSV/external import touched this player — staff-only, csv_import source. */
export function appendImportTimelineEvent(
  input: Omit<AppendTimelineEventInput, 'kind'>,
): Promise<AppendTimelineEventResult> {
  return appendTimelineEvent({ ...input, kind: 'import' });
}

/**
 * A system/AI-generated event (insight, prediction, milestone) written outside a
 * coach session. Uses the service-role client; provenance is forced to ai/system.
 */
export function appendSystemTimelineEvent(
  input: Omit<AppendTimelineEventInput, 'kind'> & { kind?: 'ai' | 'system' | 'stat_milestone' },
): Promise<AppendTimelineEventResult> {
  return appendTimelineEvent({ ...input, kind: input.kind ?? 'system' }, { system: true });
}

/**
 * A lifting/performance event — a completed lift or a detected personal record.
 * `kind: 'lift'` defaults to `player_only` visibility (the player owns their own
 * weight-room history; it is never a staff-private datum).
 *
 * CLIENT SELECTION (the lifting loop crosses an RLS boundary):
 *   * A COACH-entered lift (live weight room) is written through the caller's
 *     RLS-scoped client — the timeline INSERT policy (`is_baseball_team_coach_v2`)
 *     authorizes a coach directly, preserving honest `manual` (coach) provenance.
 *   * A PLAYER-self lift cannot write a timeline row directly (the INSERT policy is
 *     coach-only by design — players never author the staff-readable feed). So a
 *     player-logged lift/PR is written via the service-role path with `system`
 *     provenance: honest, because the PR was DETECTED by the system from the
 *     player's own logged sets, not authored as free-text. It is NOT widened past
 *     `player_only` and carries the originating session/PR id as its source.
 *
 * This keeps the lifting loop (assign -> session -> set logging -> PR) closing on
 * the player timeline without ever smuggling staff-private data or AI prose.
 */
export function appendLiftTimelineEvent(
  input: Omit<AppendTimelineEventInput, 'kind' | 'source'> & {
    /** True when a coach (live weight room) is recording the lift. */
    actorIsCoach: boolean;
  },
): Promise<AppendTimelineEventResult> {
  const { actorIsCoach, ...rest } = input;
  if (actorIsCoach) {
    // Coach session: RLS-scoped client, honest manual (coach) provenance.
    return appendTimelineEvent({ ...rest, kind: 'lift', source: 'manual' });
  }
  // Player session: system path (only RLS-bypass allowed), system provenance so
  // the safety gate in appendTimelineEvent permits the service-role client.
  return appendTimelineEvent(
    { ...rest, kind: 'lift', source: 'system' },
    { system: true },
  );
}

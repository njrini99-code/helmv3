'use server';

// ============================================================================
// CRM DEDUP / MERGE — SERVER ACTIONS
// ============================================================================
//
// Two operations for cleaning up duplicate coach records:
//
//   - findDuplicateCoaches() — groups likely-duplicate `crm_coaches` rows by
//     normalized email OR by normalized (school + name). Paginates past the
//     PostgREST 1000-row cap via fetch-all-rows so large imports don't get
//     silently truncated.
//
//   - mergeCoaches({ keep_id, merge_id }) — re-points every child row that
//     references the merged coach (crm_contact_log, crm_sequence_enrollments,
//     crm_replies, crm_notes, crm_tasks — all keyed by `coach_id`) onto the
//     kept coach, then soft-archives the merged coach (is_archived = true).
//     NEVER hard-deletes — preserves contact history.
//
// Auth-gated identically to crm-foundations.ts: every CRM table policy checks
// `users.role = 'admin'`. We still call `auth.getUser()` to fail fast on
// unauthenticated requests with a clean error rather than letting RLS silently
// drop rows.
//
// ============================================================================

import { revalidatePath } from 'next/cache';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { logServerException } from '@/lib/server-error-logger';

// ============================================================================
// Internal helpers
// ============================================================================
async function getAuthedClient() {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) {
    throw new Error('Unauthorized');
  }
  return { supabase, user };
}

const CRM_REVALIDATE_PATH = '/golf/admin/crm';

// Child tables that carry a `coach_id` FK into crm_coaches. Re-pointed on merge.
const COACH_CHILD_TABLES = [
  'crm_contact_log',
  'crm_sequence_enrollments',
  'crm_replies',
  'crm_notes',
  'crm_tasks',
  // crm_stage_transitions was MISSING until 2026-07-29, so merging a duplicate
  // stranded its pipeline history: the rows kept pointing at the merged coach,
  // who is then soft-archived and therefore invisible, so the surviving record
  // showed a stage timeline with a hole in it. Measured at the time of the fix:
  // 2,401 transitions exist and 83 of them sit on archived coaches. (No column
  // records WHICH archive was a merge — crm_coaches has is_archived/archived_at
  // /archived_by but no merged_into — so how many of the 83 are merge damage
  // versus ordinary archiving cannot be determined from the data. That missing
  // provenance is its own gap.)
  //
  // Written by the log_crm_stage_transition trigger on every crm_coaches.status
  // change, keyed by coach_id, which is exactly the shape this loop re-points.
  'crm_stage_transitions',
] as const;

// Supabase typed client can't always narrow dynamic `.from(table)` calls; cast
// through the project's existing AnySupabase escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * ids of the merged coach's `crm_sequence_enrollments` rows that CANNOT be
 * re-pointed, because the surviving coach is already enrolled in that sequence
 * and the table is UNIQUE (sequence_id, coach_id).
 *
 * Read-only — this runs before mergeCoaches() writes anything, so a failure
 * here aborts the merge with nothing changed rather than half-applying it.
 * Returns [] when there is no overlap, which is the common case.
 */
async function findCollidingEnrollmentIds(
  client: AnySupabase,
  keep_id: string,
  merge_id: string,
): Promise<string[]> {
  const { data: keepRows, error: keepError } = await client
    .from('crm_sequence_enrollments')
    .select('sequence_id')
    .eq('coach_id', keep_id);
  if (keepError) {
    throw new Error(
      `mergeCoaches: could not check sequence-enrollment collisions: ${keepError.message}. Nothing was changed.`,
    );
  }

  const keepSequenceIds = new Set(
    ((keepRows ?? []) as Array<{ sequence_id: string | null }>)
      .map((row) => row.sequence_id)
      .filter((id): id is string => typeof id === 'string'),
  );
  if (keepSequenceIds.size === 0) return [];

  const { data: mergeRows, error: mergeError } = await client
    .from('crm_sequence_enrollments')
    .select('id, sequence_id')
    .eq('coach_id', merge_id);
  if (mergeError) {
    throw new Error(
      `mergeCoaches: could not check sequence-enrollment collisions: ${mergeError.message}. Nothing was changed.`,
    );
  }

  return ((mergeRows ?? []) as Array<{ id: string; sequence_id: string | null }>)
    .filter((row) => row.sequence_id !== null && keepSequenceIds.has(row.sequence_id))
    .map((row) => row.id)
    // These are uuid primary keys straight out of the DB, but they are about
    // to be interpolated into a PostgREST `in.(…)` list, so shape-check them
    // rather than trusting the round trip.
    .filter((id) => typeof id === 'string' && UUID_RE.test(id));
}

// ============================================================================
// Types
// ============================================================================
export interface DuplicateCoach {
  id: string;
  name: string;
  school: string;
  email: string | null;
  status: string;
  last_contacted_at: string | null;
}

export interface DuplicateGroup {
  /** Human-readable reason the rows were grouped (the shared key). */
  matchKey: string;
  /** Whether the group matched on email or on (school + name). */
  matchType: 'email' | 'school_name';
  coaches: DuplicateCoach[];
}

// ============================================================================
// FIND DUPLICATES
// ============================================================================
/**
 * Returns groups of likely-duplicate coaches. Two coaches are grouped when they
 * share a normalized email, OR share a normalized (school + name). Only groups
 * with 2+ members are returned. Archived coaches are excluded — they've already
 * been merged away.
 */
export async function findDuplicateCoaches(): Promise<DuplicateGroup[]> {
  const { supabase } = await getAuthedClient();
  try {
    const client = supabase as AnySupabase;

    const rows = await fetchAllRows<DuplicateCoach>((from, to) =>
      client
        .from('crm_coaches')
        .select('id, name, school, email, status, last_contacted_at')
        .or('is_archived.is.null,is_archived.eq.false')
        .order('id', { ascending: true })
        .range(from, to),
    );

    const byEmail = new Map<string, DuplicateCoach[]>();
    const bySchoolName = new Map<string, DuplicateCoach[]>();

    for (const row of rows) {
      const email = norm(row.email);
      if (email) {
        const list = byEmail.get(email) ?? [];
        list.push(row);
        byEmail.set(email, list);
      }

      const school = norm(row.school);
      const name = norm(row.name);
      if (school && name) {
        const key = `${school} ${name}`;
        const list = bySchoolName.get(key) ?? [];
        list.push(row);
        bySchoolName.set(key, list);
      }
    }

    const groups: DuplicateGroup[] = [];
    // Track which coach ids already landed in an email group so we don't emit a
    // redundant school+name group that's a strict subset of an email match.
    const emittedIds = new Set<string>();

    for (const [email, coaches] of byEmail) {
      if (coaches.length < 2) continue;
      coaches.forEach((c) => emittedIds.add(c.id));
      groups.push({ matchKey: email, matchType: 'email', coaches });
    }

    for (const [key, coaches] of bySchoolName) {
      if (coaches.length < 2) continue;
      // Skip if every member already appears in an email group above.
      if (coaches.every((c) => emittedIds.has(c.id))) continue;
      const [school, name] = key.split(' ');
      groups.push({
        matchKey: `${name} @ ${school}`,
        matchType: 'school_name',
        coaches,
      });
    }

    return groups;
  } catch (error) {
    void logServerException(error, {
      action: 'crm_dedup.findDuplicateCoaches',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
    });
    throw error;
  }
}

// ============================================================================
// MERGE
// ============================================================================
/**
 * Merges `merge_id` into `keep_id`:
 *   0. Pre-flight — both coaches must exist, the merged one must not be
 *      archived already, and any un-movable sequence enrollment is identified
 *      before the first write.
 *   1. Re-points every child row (coach_id) from merge_id → keep_id.
 *   2. Soft-archives the merged coach (is_archived = true, archived_at = now,
 *      archived_by = the acting admin).
 *   3. Best-effort provenance note on the surviving record.
 *
 * NEVER hard-deletes.
 *
 * ATOMICITY — READ THIS BEFORE TRUSTING IT. This is NOT a transaction, and
 * nothing in this file makes it one. PostgREST gives each `.update()` its own
 * implicit transaction, so a failure between steps leaves the CRM split: some
 * child tables re-pointed at keep_id, the rest still on merge_id. The genuine
 * fix is a single SECURITY INVOKER plpgsql function doing all of it in one
 * statement block — `public.crm_merge_coaches(p_keep_id, p_merge_id)`, whose
 * body is the loop below plus the archive, wrapped in the function's implicit
 * transaction. SECURITY INVOKER so the admin-only RLS policies keep applying;
 * no privilege escalation is needed, only atomicity. That is a migration, and
 * migrations are the owner's to apply, so it is filed rather than faked here.
 * When it lands, this whole body collapses to one `supabase.rpc(...)` call and
 * every workaround documented below can be deleted.
 *
 * What this code does instead, and why each part is real:
 *
 *   - CONVERGENT RETRY. Every step is idempotent: `set coach_id = keep_id
 *     where coach_id = merge_id` is a no-op for rows already moved, and the
 *     archive is a fixed-value write. So re-running the SAME merge after a
 *     partial failure completes it. It does not roll back — it rolls FORWARD.
 *   - ORDERING. The order within the child loop is immaterial (each entry is
 *     independent and idempotent). The one ordering that matters is that the
 *     archive is LAST: archiving first would hide the merged coach from
 *     `findDuplicateCoaches` and from the admin UI while its history was still
 *     attached to it, so the half-finished state would be invisible and
 *     un-retryable. Leaving it un-archived is what makes the retry findable.
 *   - COMPLETE FAILURE REPORT. The loop no longer aborts on the first failing
 *     table. Aborting early both hid whether the remaining tables would also
 *     have failed and gave the operator no idea how far the merge got. Every
 *     table is attempted, and the thrown error names exactly which moved and
 *     which did not.
 *   - PRE-FLIGHT. Rejecting an unknown or already-archived merge_id before any
 *     write removes the two ways to start a merge that is guaranteed to end
 *     badly: re-pointing onto a phantom id, and stealing an unrelated archived
 *     coach's history onto a new parent. The sequence-enrollment collision
 *     check joins it, because that one failure never converges — see step 0b.
 *
 * What is still NOT covered, said plainly: a crash or a lost connection
 * between two of the six child updates still leaves the split state. Only the
 * RPC fixes that.
 */
export async function mergeCoaches(input: {
  keep_id: string;
  merge_id: string;
}): Promise<{ ok: true }> {
  const { supabase, user } = await getAuthedClient();
  try {
    const { keep_id, merge_id } = input;
    if (!keep_id || !merge_id) {
      throw new Error('mergeCoaches: keep_id and merge_id are both required');
    }
    if (keep_id === merge_id) {
      throw new Error('mergeCoaches: cannot merge a coach into itself');
    }

    const client = supabase as AnySupabase;

    // 0. Pre-flight. One read covering both endpoints; nothing is written
    //    until they both check out.
    const { data: endpoints, error: endpointsError } = await client
      .from('crm_coaches')
      .select('id, is_archived')
      .in('id', [keep_id, merge_id]);

    if (endpointsError) {
      throw new Error(`mergeCoaches: could not load the coaches to merge: ${endpointsError.message}`);
    }

    const rows = (endpoints ?? []) as Array<{ id: string; is_archived: boolean | null }>;
    const keepRow = rows.find((row) => row.id === keep_id);
    const mergeRow = rows.find((row) => row.id === merge_id);

    if (!keepRow) {
      throw new Error(`mergeCoaches: keep_id ${keep_id} does not exist (or is not visible)`);
    }
    if (!mergeRow) {
      throw new Error(`mergeCoaches: merge_id ${merge_id} does not exist (or is not visible)`);
    }
    if (keepRow.is_archived) {
      throw new Error(
        `mergeCoaches: keep_id ${keep_id} is archived — merging into it would bury the surviving history`,
      );
    }
    if (mergeRow.is_archived) {
      // A half-finished merge leaves merge_id UN-archived (the archive is the
      // last step), so this is never the retry path. It is either a completed
      // merge being repeated, or an unrelated archived record about to have
      // its history re-parented onto someone else. Refuse both.
      throw new Error(
        `mergeCoaches: merge_id ${merge_id} is already archived — nothing to merge`,
      );
    }

    // 0b. Collision pre-flight, still before any write.
    //
    //     crm_sequence_enrollments is UNIQUE (sequence_id, coach_id). If both
    //     duplicates are enrolled in the same sequence — the normal case for a
    //     duplicate that got imported into the same campaign twice — a blind
    //     `set coach_id = keep_id` raises a unique violation. That is the ONE
    //     failure in this whole function that does NOT converge on retry: it
    //     reproduces identically every time, so the merge would sit half
    //     applied forever (crm_contact_log moved, everything after it not).
    //
    //     So the colliding rows are identified up front and excluded from the
    //     re-point. They are NOT deleted — this module never destroys history —
    //     they stay attached to the archived duplicate, which is a small,
    //     recorded residue rather than a permanently stuck merge.
    const collidingEnrollmentIds = await findCollidingEnrollmentIds(client, keep_id, merge_id);

    // 1. Re-point child rows. Idempotent per table, so a retry converges.
    const repointed: string[] = [];
    const failures: string[] = [];
    for (const table of COACH_CHILD_TABLES) {
      let query = client
        .from(table)
        .update({ coach_id: keep_id })
        .eq('coach_id', merge_id);

      if (table === 'crm_sequence_enrollments' && collidingEnrollmentIds.length > 0) {
        query = query.not('id', 'in', `(${collidingEnrollmentIds.join(',')})`);
      }

      const { error } = await query;

      if (error) failures.push(`${table} (${error.message})`);
      else repointed.push(table);
    }

    if (failures.length > 0) {
      // Deliberately NOT archived: the merged coach stays visible so the
      // operator can see the split and re-run the identical merge, which
      // re-points only what is still outstanding.
      throw new Error(
        `mergeCoaches: partial merge — moved [${repointed.join(', ') || 'nothing'}], ` +
          `FAILED [${failures.join('; ')}]. The merged coach was left un-archived; ` +
          `re-run the same merge to finish it (already-moved rows are a no-op).`,
      );
    }

    // 2. Soft-archive the merged coach (never hard-delete). LAST, on purpose —
    //    see the ORDERING note above. `archived_by` was previously left null,
    //    which is why no archived row said who retired it.
    const { error: archiveError } = await client
      .from('crm_coaches')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
        archived_by: user.id,
      })
      .eq('id', merge_id);

    if (archiveError) {
      throw new Error(
        `mergeCoaches: every child table moved to ${keep_id} but archiving ${merge_id} failed: ` +
          `${archiveError.message}. Re-run the same merge to finish it.`,
      );
    }

    // 3. Provenance, best-effort. crm_coaches has is_archived/archived_at/
    //    archived_by but no `merged_into`, so the schema cannot say WHICH
    //    archives were merges — the same gap that made the 83 archived
    //    stage-transition rows above un-attributable. A note on the SURVIVING
    //    record is the app-layer stand-in an operator will actually find.
    //    It is an audit trail, not a completion marker: a failure here is
    //    logged and swallowed, so its absence proves nothing.
    const { error: noteError } = await client.from('crm_notes').insert({
      coach_id: keep_id,
      author_id: user.id,
      // `kind` is CHECK-constrained to note|call_log|meeting_summary|internal
      // — 'merge' would be rejected outright. This is operator bookkeeping,
      // so 'internal' is the right one of the four.
      kind: 'internal',
      body:
        `Merged duplicate coach record ${merge_id} into this one. Contact log, ` +
        `sequence enrollments, replies, notes, tasks and stage transitions were ` +
        `re-pointed here; the duplicate was archived.` +
        (collidingEnrollmentIds.length > 0
          ? ` ${collidingEnrollmentIds.length} sequence enrollment(s) stayed on the ` +
            `archived record because this coach was already enrolled in the same ` +
            `sequence (unique on sequence + coach).`
          : ''),
    });
    if (noteError) {
      void logServerException(
        new Error(`mergeCoaches: provenance note insert failed: ${noteError.message}`),
        {
          action: 'crm_dedup.mergeCoaches.note',
          source: 'server_action',
          sport: 'golf',
          featureArea: 'crm',
          metadata: { keepId: keep_id, mergeId: merge_id },
        },
        'warning',
      );
    }

    revalidatePath(CRM_REVALIDATE_PATH);
    return { ok: true };
  } catch (error) {
    void logServerException(error, {
      action: 'crm_dedup.mergeCoaches',
      source: 'server_action',
      sport: 'golf',
      featureArea: 'crm',
      metadata: { keepId: input.keep_id, mergeId: input.merge_id },
    });
    throw error;
  }
}

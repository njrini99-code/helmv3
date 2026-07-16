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
] as const;

// Supabase typed client can't always narrow dynamic `.from(table)` calls; cast
// through the project's existing AnySupabase escape hatch.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnySupabase = any;

function norm(value: string | null | undefined): string {
  return (value ?? '').trim().toLowerCase();
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
 *   1. Re-points every child row (coach_id) from merge_id → keep_id.
 *   2. Soft-archives the merged coach (is_archived = true, archived_at = now).
 *
 * NEVER hard-deletes. If a child re-point fails, the error surfaces and the
 * merged coach is left un-archived so the operation can be retried safely.
 */
export async function mergeCoaches(input: {
  keep_id: string;
  merge_id: string;
}): Promise<{ ok: true }> {
  const { supabase } = await getAuthedClient();
  try {
    const { keep_id, merge_id } = input;
    if (!keep_id || !merge_id) {
      throw new Error('mergeCoaches: keep_id and merge_id are both required');
    }
    if (keep_id === merge_id) {
      throw new Error('mergeCoaches: cannot merge a coach into itself');
    }

    const client = supabase as AnySupabase;

    // 1. Re-point child rows.
    for (const table of COACH_CHILD_TABLES) {
      const { error } = await client
        .from(table)
        .update({ coach_id: keep_id })
        .eq('coach_id', merge_id);

      if (error) {
        throw new Error(`Failed to re-point ${table}: ${error.message}`);
      }
    }

    // 2. Soft-archive the merged coach (never hard-delete).
    const { error: archiveError } = await client
      .from('crm_coaches')
      .update({
        is_archived: true,
        archived_at: new Date().toISOString(),
      })
      .eq('id', merge_id);

    if (archiveError) {
      throw new Error(`Failed to archive merged coach: ${archiveError.message}`);
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

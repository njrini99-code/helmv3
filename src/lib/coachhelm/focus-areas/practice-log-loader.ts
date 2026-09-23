import 'server-only';

/**
 * A8 slice 2 read side: batch-loads golf_focus_area_criteria and
 * golf_focus_area_practice_sessions for a set of focus areas, in one shared
 * helper both the coach grid (intelligence/page.tsx) and the player page
 * (coachhelm/page.tsx) call. Gated behind coachhelm_focus_area_practice_log
 * (default off everywhere) — that migration is not applied to production
 * yet, so this makes ZERO `.from()` calls against either table while the
 * flag is off, returning the same empty result the "flag on, no rows yet"
 * case would.
 *
 * Deliberately a plain server module (no 'use server') — this is read-only
 * helper code called directly from server components, not a mutation
 * surface, and giving it its own public server-action endpoint would be
 * pure downside. Every caller already scoped `supabase` to the request's
 * own session (never an admin client), so RLS does the real access control
 * here exactly as it does for every other `.from()` call in these loaders.
 *
 * PostgREST pagination/URL-size discipline (per CLAUDE.md database rules):
 * focus-area ids are chunked at chunkIds' ID_CHUNK_SIZE (200) before any
 * `.in()` filter, and each chunk is paged past the 1000-row response cap
 * via fetchAllRows — a coach's team or a long-lived focus area can plausibly
 * exceed either limit over a season.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import { fromUntyped } from '@/lib/supabase/untyped';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { isFlagEnabled } from '@/lib/flags';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

const FLAG = 'coachhelm_focus_area_practice_log';

export interface FocusAreaCriterionView {
  id: string;
  label: string;
  source: string;
  met: boolean;
  met_at: string | null;
}

export interface FocusAreaPracticeSummary {
  /** Total logged practice sessions for this focus area. */
  count: number;
  /** ISO timestamp of the most recent session, or null if count is 0. */
  lastPracticedAt: string | null;
}

export interface FocusAreaPracticeLogData {
  criteriaByFocusArea: Map<string, FocusAreaCriterionView[]>;
  practiceSummaryByFocusArea: Map<string, FocusAreaPracticeSummary>;
}

interface CriterionRow {
  id: string;
  focus_area_id: string;
  label: string;
  source: string;
  met: boolean;
  met_at: string | null;
}

interface SessionRow {
  focus_area_id: string;
  practiced_at: string;
}

function emptyResult(): FocusAreaPracticeLogData {
  return { criteriaByFocusArea: new Map(), practiceSummaryByFocusArea: new Map() };
}

/**
 * Loads criteria + a practice-session summary for a batch of focus areas.
 * Best-effort: a read failure on either table logs and degrades that one
 * table to empty rather than failing the whole page — the same honest-empty
 * contract every other optional read in these loaders already follows.
 */
export async function loadFocusAreaPracticeLogData(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: SupabaseClient<any>,
  focusAreaIds: readonly string[],
): Promise<FocusAreaPracticeLogData> {
  if (!isFlagEnabled(FLAG) || focusAreaIds.length === 0) {
    return emptyResult();
  }

  const idChunks = chunkIds(focusAreaIds);

  const criteriaByFocusArea = new Map<string, FocusAreaCriterionView[]>();
  try {
    for (const idChunk of idChunks) {
      const rows = await fetchAllRows<CriterionRow>((from, to) =>
        fromUntyped(supabase, 'golf_focus_area_criteria')
          .select('id, focus_area_id, label, source, met, met_at')
          .in('focus_area_id', idChunk)
          .order('created_at', { ascending: true })
          .range(from, to),
      );
      for (const row of rows) {
        const list = criteriaByFocusArea.get(row.focus_area_id) ?? [];
        list.push({ id: row.id, label: row.label, source: row.source, met: row.met, met_at: row.met_at });
        criteriaByFocusArea.set(row.focus_area_id, list);
      }
    }
  } catch (error) {
    await logServerError(
      `[focus-area-practice-log] criteria batch read failed; criteria will render as absent: ${describeError(error)}`,
      { action: 'focusAreaPracticeLog.loadCriteria', featureArea: 'development' },
      'warning',
    );
  }

  const practiceSummaryByFocusArea = new Map<string, FocusAreaPracticeSummary>();
  try {
    for (const idChunk of idChunks) {
      const rows = await fetchAllRows<SessionRow>((from, to) =>
        fromUntyped(supabase, 'golf_focus_area_practice_sessions')
          .select('focus_area_id, practiced_at')
          .in('focus_area_id', idChunk)
          .order('id', { ascending: true })
          .range(from, to),
      );
      for (const row of rows) {
        const existing = practiceSummaryByFocusArea.get(row.focus_area_id);
        if (!existing) {
          practiceSummaryByFocusArea.set(row.focus_area_id, { count: 1, lastPracticedAt: row.practiced_at });
        } else {
          existing.count += 1;
          if (!existing.lastPracticedAt || row.practiced_at > existing.lastPracticedAt) {
            existing.lastPracticedAt = row.practiced_at;
          }
        }
      }
    }
  } catch (error) {
    await logServerError(
      `[focus-area-practice-log] practice-session batch read failed; the practice log will render as absent: ${describeError(error)}`,
      { action: 'focusAreaPracticeLog.loadSessions', featureArea: 'development' },
      'warning',
    );
  }

  return { criteriaByFocusArea, practiceSummaryByFocusArea };
}

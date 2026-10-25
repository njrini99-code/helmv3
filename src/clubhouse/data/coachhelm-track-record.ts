import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { selectCorrectionsForInsights } from '@/lib/coachhelm/v3/corrections/load-weights';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import type { CorrectionForPrecision } from '@/lib/coachhelm/v3/corrections/precision-counters';
import { isMissingTableError } from '@/lib/coachhelm/v3/corrections/types';
import { readLifecycleMeta, LIFECYCLE_META_KEY } from '@/lib/coachhelm/v3/lifecycle/types';
import { buildTrackRecord, type ShownRead } from '@/lib/coachhelm/v3/track-record/track-record';
import { chLogServer } from '../lib/track-server';
import { loadCoachHelmGate } from './coachhelm';
import { toChTrackRecord, type ChTrackRecord } from './coachhelm-track-record-shape';
import type { ChViewLoad } from './coachhelm-views-shape';
import { wallClockInZone } from '@/lib/golf/timezone';
import { loadTeamZone, seasonStartDate } from './season';

export type * from './coachhelm-track-record-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ReadError = { code?: string | null; message?: string } | null;

/** The function the read needs is not there yet (its migration is held): Postgres 42883, PostgREST PGRST202. */
export function isMissingFunctionError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === '42883' || code === 'PGRST202';
}

interface ShownReadRow {
  insight_id: string;
  last_shown_at: string;
  shown_ladder: string | null;
}

/** `golf_coachhelm_shown_reads` is held (20261021090000), so it is not in the generated types until `npm run db:types` after apply. */
type ShownReadsRpc = (
  fn: 'golf_coachhelm_shown_reads',
  args: { p_team_id: string; p_since: string },
) => PromiseLike<{ data: ShownReadRow[] | null; error: ReadError }>;

/** The instant the season starts: midnight on its first day (YYYY-MM-DD) in the team's zone, not UTC's (owner decision 9). */
export function seasonStartInstant(since: string, tz: string): string {
  const [y, m, d] = since.split('-').map(Number);
  return wallClockInZone(new Date(y!, m! - 1, d!), '00:00', tz).toISOString();
}

async function loadShownReads(supabase: Supabase, teamId: string, since: string, tz: string) {
  const rpc = supabase.rpc.bind(supabase) as unknown as ShownReadsRpc;
  return rpc('golf_coachhelm_shown_reads', { p_team_id: teamId, p_since: seasonStartInstant(since, tz) });
}

interface InsightRow {
  id: string;
  insight_type: string | null;
  ladder: string | null;
  lifecycle: unknown;
}

async function loadReads(supabase: Supabase, ids: string[]): Promise<{ rows: InsightRow[]; error: ReadError }> {
  const rows: InsightRow[] = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await supabase
      .from('golf_coach_insights')
      .select(`id, insight_type, ladder:evidence->>ladder, lifecycle:metadata->${LIFECYCLE_META_KEY}`)
      .in('id', chunk);
    if (error) return { rows, error };
    rows.push(...((data ?? []) as unknown as InsightRow[]));
  }
  return { rows, error: null };
}

type CorrectionRow = CorrectionForPrecision & { team_id: string | null };

/**
 * The corrections on the shown reads that this team's record counts: every player-authored row (a player marks only their own read),
 * and a coach-authored row only when it was made for this team (`team_id`), so after a player moves teams the former staff's marks are
 * never counted as "Your staff".
 */
async function loadCorrections(supabase: Supabase, teamId: string, ids: string[]): Promise<{ rows: CorrectionForPrecision[]; available: boolean; error: ReadError }> {
  const rows: CorrectionForPrecision[] = [];
  for (const chunk of chunkIds(ids)) {
    const { data, error } = await fetchAllRowsResult<CorrectionRow>((from, to) =>
      selectCorrectionsForInsights(supabase, chunk, from, to),
    );
    if (error) {
      if (isMissingTableError(error)) return { rows: [], available: false, error: null };
      return { rows, available: false, error };
    }
    for (const { team_id, ...row } of data ?? []) {
      if (row.author_role === 'coach' && team_id !== teamId) continue;
      rows.push(row);
    }
  }
  return { rows, available: true, error: null };
}

/**
 * Whether CoachHelm is switched off for this team (`golf_team_coachhelm_settings`, no row = on). The coach gate is on when any team the
 * coach staffs is on, so the selected team is checked on its own. A failed read fails closed.
 */
async function loadTeamOff(supabase: Supabase, teamId: string): Promise<{ reason: string | null } | null | 'failed'> {
  const { data, error } = await supabase.from('golf_team_coachhelm_settings').select('enabled, disabled_reason').eq('team_id', teamId).maybeSingle();
  if (error) {
    chLogServer('coachhelm', 'track_record_team_gate', error);
    return 'failed';
  }
  if (data?.enabled !== false) return null;
  const reason = data.disabled_reason && !/^Disabled by (user|team)$/.test(data.disabled_reason) ? data.disabled_reason : null;
  return { reason };
}

/**
 * The coach's Track record for one team (P013 `?view=track-record`, flag `coachhelm_track_record_v1`; the route checks the flag).
 * Read only once CoachHelm is on for this coach, as the board is, and for this team. Never throws: a read that failed is `failed`, and a function or
 * table that is not applied yet is "not available" (the counts it feeds are left out, never drawn as zeros).
 *
 * Reads: the reads shown to the team's active players since the season start (one row each, from `golf_coachhelm_shown_reads`),
 * those reads' family, ladder and lifecycle block, and the corrections on them. The counting is `buildTrackRecord`'s (pure).
 */
export async function loadCoachTrackRecord(input: { coachId: string; teamId: string; now?: Date }): Promise<ChViewLoad<ChTrackRecord>> {
  const gate = await loadCoachHelmGate(input.coachId);
  if (gate.status === 'off') return { status: 'off', reason: gate.off.reason };
  if (gate.status === 'failed') return { status: 'failed' };

  const supabase = await createClient();
  // The gate above is the coach's (on when any staffed team is on); the record is one team's, so that team must be on too.
  const teamOff = await loadTeamOff(supabase, input.teamId);
  if (teamOff === 'failed') return { status: 'failed' };
  if (teamOff) return { status: 'off', reason: teamOff.reason };
  // The season turns on 1 August in the team's zone (owner decision 9).
  const tz = await loadTeamZone(supabase, input.teamId, 'coachhelm');
  const since = seasonStartDate(input.now, tz);

  const shown = await loadShownReads(supabase, input.teamId, since, tz);
  if (shown.error) {
    if (isMissingFunctionError(shown.error)) return { status: 'ready', data: { state: 'unavailable' } };
    chLogServer('coachhelm', 'track_record_shown', shown.error);
    return { status: 'failed' };
  }
  const shownRows = shown.data ?? [];
  const ids = [...new Set(shownRows.map((r) => r.insight_id))];

  const [reads, corrections] = await Promise.all([loadReads(supabase, ids), loadCorrections(supabase, input.teamId, ids)]);
  if (reads.error) {
    chLogServer('coachhelm', 'track_record_reads', reads.error);
    return { status: 'failed' };
  }
  // Not this and Good read counts are in every family row, so a correction read that failed is the view not loading, never zeros.
  if (corrections.error) {
    chLogServer('coachhelm', 'track_record_corrections', corrections.error);
    return { status: 'failed' };
  }

  const byId = new Map(reads.rows.map((r) => [r.id, r]));
  const shownReads: ShownRead[] = [];
  for (const s of shownRows) {
    const read = byId.get(s.insight_id);
    // A read the coach can no longer see (its player left the team since) is not on this team's record.
    if (!read?.insight_type) continue;
    shownReads.push({
      insight_id: s.insight_id,
      family: read.insight_type,
      last_shown_at: s.last_shown_at,
      shown_ladder: s.shown_ladder,
      current_ladder: read.ladder,
      lifecycle: readLifecycleMeta({ [LIFECYCLE_META_KEY]: read.lifecycle }),
    });
  }

  const record = buildTrackRecord({ reads: shownReads, corrections: corrections.rows });
  return { status: 'ready', data: toChTrackRecord(record, { since, correctionsAvailable: corrections.available }) };
}

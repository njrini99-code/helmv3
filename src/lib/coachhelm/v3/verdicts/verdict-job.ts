import 'server-only';

/**
 * The verdict step of the nightly lifecycle cron (07-system-architecture §2 D
 * "Verdicts", 03-usefulness §4.3). Behind `coachhelm_verdicts_v1` (off).
 *
 * For every focus area with a criterion, a start and no verdict yet, it
 * counts the made / attempted events after the start (whole rounds, in play
 * order, until the horizon is reached), and once the horizon is reached
 * writes `verdict` with the one-sided 90% rule against `baseline_shrunk`.
 * Areas short of the horizon are left alone ("Too early" is a render-time
 * state, not a stored one). A verdict is written once (`verdict is null`
 * compare-and-set); `status` and `outcome_status` are never touched, so
 * turning the flag off leaves every existing surface as it was.
 *
 * "Got worse" goes to the COACH first (03 §9 rule 4): one in-app bell row
 * for the area's coach through the shared notification fan-out, no push and
 * nothing to the player.
 *
 * Flag off: returns at once, no query. Migration not applied yet (42703 /
 * 42P01 / PGRST204 / PGRST205): `schema_missing`, nothing thrown.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/types/database';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { logServerError, logServerEvent } from '@/lib/server-error-logger';
import { recordInAppNotification } from '@/lib/notifications/in-app';
import { describeError } from '@/lib/utils/describe-error';
import { resolveFocusTargetMetric } from '@/lib/coachhelm/focus-areas/target-metric';
import { isVerdictsEnabled } from './flag';
import type { Criterion, Horizon } from './criterion';
import { verdictMetricFor, type VerdictMetricDef, type RoundCacheCountColumn } from './metrics';
import { countCacheByRound, countPuttsByRound, type PuttShotRow, type RoundCacheRow, type RoundCounts } from './post-counts';
import { isMissingSchemaError } from './schema-missing';
import { accumulatePostWindow, computeVerdict, FINAL_VERDICT_WORDS, type PostRound, type VerdictWord } from './verdict';

const ACTION = 'coachhelm.verdicts.job';

/** Statuses whose window has started (a proposed area has no start). */
const STARTED_STATUSES = ['active', 'in_progress', 'paused', 'completed'] as const;

export interface VerdictJobSummary {
  ran: boolean;
  reason?: 'flag_off' | 'schema_missing' | 'load_failed';
  candidates: number;
  /** Areas whose metric has no verdict source (custom text, feet, per-round rates). */
  unsupported: number;
  too_early: number;
  written: Partial<Record<VerdictWord, number>>;
  failed: number;
  coach_notices: number;
}

interface CandidateArea {
  id: string;
  player_id: string;
  coach_id: string | null;
  title: string | null;
  target_metric: string | null;
  started_at: string;
  baseline_shrunk: number | null;
  criterion: Criterion | null;
  horizon: Horizon | null;
}

type Client = SupabaseClient<Database>;

const emptySummary = (): VerdictJobSummary => ({
  ran: true,
  candidates: 0,
  unsupported: 0,
  too_early: 0,
  written: {},
  failed: 0,
  coach_notices: 0,
});

export async function runFocusAreaVerdicts(supabase: Client, now: Date = new Date()): Promise<VerdictJobSummary> {
  if (!isVerdictsEnabled()) return { ...emptySummary(), ran: false, reason: 'flag_off' };
  const summary = emptySummary();

  const { data: areaRows, error: areaError } = await fetchAllRowsResult<CandidateArea>((from, to) =>
    supabase
      .from('golf_player_focus_areas')
      .select('id, player_id, coach_id, title, target_metric, started_at, baseline_shrunk, criterion, horizon')
      .is('verdict', null)
      .not('criterion', 'is', null)
      .not('started_at', 'is', null)
      .in('status', STARTED_STATUSES)
      .order('id', { ascending: true })
      .range(from, to)
      // criterion/horizon are jsonb (Json) written by the prescription stamp;
      // started_at is non-null by the filter above.
      .overrideTypes<CandidateArea[], { merge: false }>(),
  );
  if (areaError) {
    if (isMissingSchemaError(areaError)) {
      await logServerEvent(`${ACTION}: prescription columns not applied yet; skipped`, { action: ACTION, featureArea: 'coachhelm', extra: { code: areaError.code } });
      return { ...summary, ran: false, reason: 'schema_missing' };
    }
    await logServerError(`${ACTION}: focus-area load failed: ${describeError(areaError)}`, { action: ACTION, featureArea: 'coachhelm' });
    return { ...summary, ran: false, reason: 'load_failed' };
  }

  // Keep only areas whose stored prescription is complete and whose metric has a count source.
  const work: Array<{ area: CandidateArea; def: VerdictMetricDef; horizonAttempts: number; start: string }> = [];
  for (const area of areaRows ?? []) {
    summary.candidates += 1;
    const def = verdictMetricFor(resolveFocusTargetMetric(area.target_metric) ?? area.target_metric);
    const horizonAttempts = area.horizon?.attempts;
    if (
      !def ||
      !area.criterion ||
      typeof area.criterion.threshold !== 'number' ||
      typeof area.baseline_shrunk !== 'number' ||
      typeof horizonAttempts !== 'number' ||
      !(horizonAttempts > 0)
    ) {
      summary.unsupported += 1;
      continue;
    }
    work.push({ area, def, horizonAttempts, start: area.started_at.slice(0, 10) });
  }
  if (work.length === 0) return summary;

  const earliest = work.map((w) => w.start).reduce((min, d) => (d < min ? d : min));
  const rounds = await loadRounds(supabase, [...new Set(work.map((w) => w.area.player_id))], earliest);
  if (!rounds) return { ...summary, ran: false, reason: 'load_failed' };
  const roundIds = rounds.map((r) => r.id);

  // Counts per metric, loaded once per source kind.
  const needsPutts = work.some((w) => w.def.source.kind === 'putt_band');
  const cacheColumns = new Set<RoundCacheCountColumn>();
  for (const w of work) {
    if (w.def.source.kind === 'round_cache') {
      cacheColumns.add(w.def.source.made);
      cacheColumns.add(w.def.source.attempts);
    }
  }
  const putts = needsPutts ? await loadPutts(supabase, roundIds) : [];
  const cache = cacheColumns.size > 0 ? await loadCache(supabase, roundIds, [...cacheColumns]) : [];
  if (putts === null || cache === null) return { ...summary, ran: false, reason: 'load_failed' };

  const countsByMetric = new Map<string, Map<string, RoundCounts>>();
  const countsFor = (def: VerdictMetricDef): Map<string, RoundCounts> => {
    const hit = countsByMetric.get(def.metric);
    if (hit) return hit;
    const made = def.source.kind === 'putt_band' ? countPuttsByRound(putts, def.source) : countCacheByRound(cache, def.source);
    countsByMetric.set(def.metric, made);
    return made;
  };

  const roundsByPlayer = new Map<string, RoundRow[]>();
  for (const r of rounds) {
    const list = roundsByPlayer.get(r.player_id) ?? [];
    list.push(r);
    roundsByPlayer.set(r.player_id, list);
  }

  const computedAt = now.toISOString();
  for (const { area, def, horizonAttempts, start } of work) {
    const counts = countsFor(def);
    const postRounds: PostRound[] = (roundsByPlayer.get(area.player_id) ?? []).flatMap((r) => {
      const c = counts.get(r.id);
      return c ? [{ round_id: r.id, round_date: r.round_date, made: c.made, attempts: c.attempts }] : [];
    });
    const post = accumulatePostWindow(postRounds, horizonAttempts, start);
    if (!post.reached) {
      summary.too_early += 1;
      continue;
    }

    const verdict = computeVerdict({
      criterion: area.criterion!,
      horizon: { attempts: horizonAttempts },
      baselineShrunk: area.baseline_shrunk!,
      post,
      computedAt,
    });
    if (!FINAL_VERDICT_WORDS.has(verdict.word)) {
      summary.too_early += 1;
      continue;
    }

    const { data: written, error: writeError } = await supabase
      .from('golf_player_focus_areas')
      .update({ verdict }) // nosemgrep: helmv3-action-missing-revalidate -- cron writer, no cached route
      .eq('id', area.id)
      .is('verdict', null)
      .select('id');
    if (writeError) {
      summary.failed += 1;
      await logServerError(`${ACTION}: verdict write failed: ${describeError(writeError)}`, { action: ACTION, featureArea: 'coachhelm', extra: { focusAreaId: area.id, code: writeError.code } });
      continue;
    }
    if (!Array.isArray(written) || written.length === 0) continue; // another run wrote it first
    summary.written[verdict.word] = (summary.written[verdict.word] ?? 0) + 1;

    if (verdict.word === 'got_worse' && (await noticeCoachGotWorse(supabase, area))) {
      summary.coach_notices += 1;
    }
  }

  await logServerEvent(`${ACTION}: done`, { action: ACTION, featureArea: 'coachhelm', extra: { ...summary } });
  return summary;
}

interface RoundRow {
  id: string;
  player_id: string;
  round_date: string;
}

async function loadRounds(supabase: Client, playerIds: string[], sinceDate: string): Promise<RoundRow[] | null> {
  const out: RoundRow[] = [];
  for (const batch of chunkIds(playerIds)) {
    const { data, error } = await fetchAllRowsResult<RoundRow>((from, to) =>
      supabase
        .from('golf_rounds')
        .select('id, player_id, round_date')
        .in('player_id', batch)
        .eq('status', 'completed')
        // Test rounds never count toward a verdict (OD-03).
        .eq('is_test', false)
        .not('total_score', 'is', null)
        .gte('round_date', sinceDate)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (error) {
      await logServerError(`${ACTION}: rounds load failed: ${describeError(error)}`, { action: ACTION, featureArea: 'coachhelm' });
      return null;
    }
    for (const r of data ?? []) if (r.round_date) out.push(r);
  }
  return out;
}

async function loadPutts(supabase: Client, roundIds: string[]): Promise<PuttShotRow[] | null> {
  const out: PuttShotRow[] = [];
  for (const batch of chunkIds(roundIds)) {
    const { data, error } = await fetchAllRowsResult<PuttShotRow>((from, to) =>
      supabase
        .from('golf_shots')
        .select('round_id, distance_to_hole_before, result, putt_made')
        .in('round_id', batch)
        .ilike('shot_type', 'putting')
        .not('distance_to_hole_before', 'is', null)
        .order('id', { ascending: true })
        .range(from, to),
    );
    if (error) {
      await logServerError(`${ACTION}: putts load failed: ${describeError(error)}`, { action: ACTION, featureArea: 'coachhelm' });
      return null;
    }
    out.push(...(data ?? []));
  }
  return out;
}

async function loadCache(supabase: Client, roundIds: string[], columns: RoundCacheCountColumn[]): Promise<RoundCacheRow[] | null> {
  const out: RoundCacheRow[] = [];
  for (const batch of chunkIds(roundIds)) {
    const { data, error } = await fetchAllRowsResult<RoundCacheRow>((from, to) =>
      supabase
        .from('golf_round_stats_cache')
        .select(['round_id', ...columns].join(', '))
        .in('round_id', batch)
        .order('id', { ascending: true })
        .range(from, to)
        // A runtime column list: the typed client cannot parse it.
        .overrideTypes<RoundCacheRow[], { merge: false }>(),
    );
    if (error) {
      await logServerError(`${ACTION}: stats cache load failed: ${describeError(error)}`, { action: ACTION, featureArea: 'coachhelm' });
      return null;
    }
    out.push(...(data ?? []));
  }
  return out;
}

/**
 * One in-app bell row for the area's coach. Copy names no number (the bell
 * is a pointer; the verdict view prints the counts). Never throws.
 */
async function noticeCoachGotWorse(supabase: Client, area: CandidateArea): Promise<boolean> {
  if (!area.coach_id) return false;
  try {
    const { data: coach, error } = await supabase
      .from('golf_coaches')
      .select('user_id')
      .eq('id', area.coach_id)
      .maybeSingle();
    if (error || !coach?.user_id) {
      if (error) await logServerError(`${ACTION}: coach lookup failed: ${describeError(error)}`, { action: ACTION, featureArea: 'coachhelm' }, 'warning');
      return false;
    }
    await recordInAppNotification({
      userIds: [coach.user_id as string],
      type: 'dev_plan_assigned',
      title: 'A focus area got worse',
      body: `${area.title?.trim() || 'A focus area'}: after its horizon the numbers sit below what the player was expected to reach without practice. Review it before the player sees it.`,
      actionUrl: `/golf/dashboard/players/${area.player_id}`,
      data: {
        coachhelm_category: 'focus_area_verdict',
        verdict: 'got_worse',
        focus_area_id: area.id,
        player_id: area.player_id,
      },
      context: `${ACTION}.coach_notice`,
    });
    return true;
  } catch (err) {
    await logServerError(`${ACTION}: coach notice threw: ${describeError(err)}`, { action: ACTION, featureArea: 'coachhelm' }, 'warning');
    return false;
  }
}

import 'server-only';
import { isFlagEnabled } from '@/lib/flags/is-enabled';
import { VERDICTS_FLAG } from '@/lib/coachhelm/v3/verdicts/flag';
import { isMissingSchemaError } from '@/lib/coachhelm/v3/verdicts/schema-missing';
import { countCacheByRound, countPuttsByRound, type RoundCounts } from '@/lib/coachhelm/v3/verdicts/post-counts';
import { accumulatePostWindow, type PostRound } from '@/lib/coachhelm/v3/verdicts/verdict';
import { loadCache, loadPutts, loadRounds } from '@/lib/coachhelm/v3/verdicts/verdict-job';
import type { RoundCacheCountColumn } from '@/lib/coachhelm/v3/verdicts/metrics';
import type { createClient } from '@/lib/supabase/server';
import { chLogServer } from '../lib/track-server';
import type { ChViewer } from './coachhelm-voice';
import { focusLoopOf, focusMetricOf, horizonAttempts, type ChFocusLoop, type ChFocusLoopRow, type ChFocusPost } from './focus-loop-shape';

type Supabase = Awaited<ReturnType<typeof createClient>>;

const COLUMNS = 'id, title, from_insight_id, target_metric, baseline_value, baseline_n, criterion, horizon, verdict, started_at';

/**
 * The prescription and verdict loop of each of a player's focus areas (CoachHelm chs-11; layout 5), by focus area id. Empty with
 * `coachhelm_verdicts_v1` off (nothing is read), with no ids, and on a database without the prescription columns (migration
 * 20261020120000, applied in production 2026-10-21): the areas are then drawn as before. Any other failure is logged and also
 * answers empty, so the Development section never fails over its loop. A loop still short of its horizon counts its progress
 * live, as the verdict step counts it (whole rounds in play order from the start), because nothing is stored before the horizon.
 */
export async function loadFocusLoops(supabase: Supabase, playerId: string, areaIds: readonly string[], viewer: ChViewer, nowIso: string = new Date().toISOString()): Promise<Map<string, ChFocusLoop>> {
  const out = new Map<string, ChFocusLoop>();
  if (!isFlagEnabled(VERDICTS_FLAG) || areaIds.length === 0) return out;
  try {
    const res = (await supabase.from('golf_player_focus_areas').select(COLUMNS).in('id', [...areaIds])) as {
      data: ChFocusLoopRow[] | null;
      error: { code?: string; message?: string } | null;
    };
    if (res.error) {
      if (!isMissingSchemaError(res.error)) chLogServer('stats', 'focusLoops', res.error, 'coachhelm');
      return out;
    }
    const rows = res.data ?? [];
    const posts = await livePosts(supabase, playerId, rows);
    for (const row of rows) {
      const loop = focusLoopOf(row, posts.get(row.id) ?? null, viewer, nowIso);
      if (loop) out.set(row.id, loop);
    }
  } catch (err) {
    chLogServer('stats', 'focusLoops', err, 'coachhelm');
  }
  return out;
}

/** Made and attempted since each still-open area started, up to its horizon; an area whose counts did not load is absent. */
async function livePosts(supabase: Supabase, playerId: string, rows: readonly ChFocusLoopRow[]): Promise<Map<string, ChFocusPost>> {
  const out = new Map<string, ChFocusPost>();
  const work = rows.flatMap((row) => {
    const def = focusMetricOf(row);
    const h = horizonAttempts(row.horizon);
    const start = row.started_at?.slice(0, 10);
    return row.verdict == null && row.criterion != null && def && h && start ? [{ row, def, h, start }] : [];
  });
  if (work.length === 0) return out;
  const since = work.map((w) => w.start).reduce((a, b) => (b < a ? b : a));
  const rounds = await loadRounds(supabase, [playerId], since);
  if (!rounds?.length) return out;
  const ids = rounds.map((r) => r.id);
  const cols = new Set<RoundCacheCountColumn>();
  for (const w of work) if (w.def.source.kind === 'round_cache') cols.add(w.def.source.made).add(w.def.source.attempts);
  const [putts, cache] = await Promise.all([
    work.some((w) => w.def.source.kind === 'putt_band') ? loadPutts(supabase, ids) : Promise.resolve([]),
    cols.size > 0 ? loadCache(supabase, ids, [...cols]) : Promise.resolve([]),
  ]);
  for (const { row, def, h, start } of work) {
    const src = def.source;
    let counts: Map<string, RoundCounts> | null = null;
    if (src.kind === 'putt_band') counts = putts ? countPuttsByRound(putts, src) : null;
    else counts = cache ? countCacheByRound(cache, src) : null;
    if (!counts) continue;
    const post: PostRound[] = rounds.flatMap((r) => {
      const c = counts.get(r.id);
      return c ? [{ round_id: r.id, round_date: r.round_date, made: c.made, attempts: c.attempts }] : [];
    });
    const w = accumulatePostWindow(post, h, start);
    out.set(row.id, { made: w.made, n: w.n });
  }
  return out;
}

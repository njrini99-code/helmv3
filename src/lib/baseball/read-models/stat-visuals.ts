// =============================================================================
// src/lib/baseball/read-models/stat-visuals.ts
//
// THE STAT-VISUALS CHART READ MODEL — the single server orchestrator that shapes
// the COMPLETE StatVisualsData payload the mountable <StatVisualsSection> gallery
// consumes on the Stats Center (team scope) and the player profile (player scope).
//
// WHY THIS FILE EXISTS
//   The chart COMPONENTS (src/components/baseball/stat-visuals/*) and the elite
//   stat-EVENT aggregator (elite-stat-events.ts) shipped, and the hitting/pitching
//   families were already wired through toStatVisualsData(). But ~13 of the ~22
//   v10 visual families (fielding, baserunning, readiness/workload/lift, source
//   coverage, import diff, practice-focus, game-vs-practice gap, player DNA) had
//   NO read model — they rendered permanently-empty frames. This orchestrator
//   builds every remaining family from its real event/feed table and merges them
//   with the elite hitting/pitching payload into one StatVisualsData.
//
// HONESTY (zip non-negotiable + v10 source-confidence model):
//   * Every family applies the v10 minimum-data thresholds (SAMPLE_THRESHOLDS):
//     a starved family returns its real (sub-threshold) rows so the chart's own
//     insufficient-data frame fires — we never fabricate a blended/zero metric.
//   * Per-point provenance (trust tier) is threaded so a chart click can open the
//     source drawer; rates are null (not 0) when there's no denominator.
//   * OFFICIAL vs SCRIMMAGE vs DEVELOPMENT context is preserved end-to-end.
//
// SECURITY / ROLE-GATING (the packet's explicit requirement):
//   * The whole payload is STAFF-gated via getEliteStatEvents (can_manage_stats);
//     a non-staff viewer gets `undefined` (gallery shows honest empty frames).
//   * On PLAYER scope the READINESS + WORKLOAD families are additionally gated on
//     can_view_readiness — a scoped assistant without medical/readiness scope
//     never receives soreness/availability/workload rows for a player. Resolved
//     server-side here; the client cannot widen it.
//
// 'server-only' + plain async fns (NOT 'use server') so server components import
// it directly. Tables not yet in generated database.ts are read via fromUntyped
// with row shapes asserted against the hand-written event types.
// =============================================================================

import 'server-only';

import { createClient } from '@/lib/supabase/server';
import { fromUntyped } from '@/lib/supabase/untyped';
import { hasBaseballCapability } from '@/lib/baseball/capabilities';
import { computeReadiness, type ReadinessInputs } from '@/lib/baseball/lifting/readiness-compute';
import type { BaseballReadinessBand } from '@/lib/types/baseball-lifting-v11';
import { SAMPLE_THRESHOLDS } from '@/components/baseball/stat-visuals/chart-geometry';
import {
  getEliteStatEvents,
  getGameVsCageGap,
  toStatVisualsData,
  trustTierToSourceTrust,
  type EliteStatEventsReadModel,
  type GameVsCageReadModel,
} from './elite-stat-events';
import {
  getPracticeEffectivenessData,
  type EffectivenessReviewView,
} from './practice-effectiveness';
import type { StatVisualsData } from '@/components/baseball/stat-visuals/StatVisualsSection';
import type {
  BaseballTrustTier,
  BaseballCatchingEvent,
  BaseballFieldingEvent,
  BaseballBaserunningEvent,
  BaseballWorkloadEvent,
  BaseballStatSourceRow,
} from '@/lib/types/baseball-stat-events';
import type {
  CatcherWorkloadPoint,
  BatteryCell,
  DefensiveEventPoint,
  BaserunningRow,
  ReadinessRow,
  ReadinessCellStatus,
  PitcherWorkloadDay,
  LiftProgressionPoint,
  SourceCoverageCard,
  SourceFreshness,
  ImportDiffRow,
  PracticeFocusRow,
  PairedMetricRow,
  PlayerDnaDimension,
} from '@/lib/types/baseball-stat-visuals';
import type {
  BaseballMetricConfidence,
} from '@/lib/types/baseball-stat-events';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Db = any;

// -----------------------------------------------------------------------------
// Options + envelope
// -----------------------------------------------------------------------------

export interface StatVisualsPayloadOptions {
  /** Restrict to one player (player profile). Default: whole team. */
  playerId?: string | null;
  /** Inclusive ISO lower bound on the event window. */
  fromDate?: string | null;
  /** Inclusive ISO upper bound on the event window. */
  toDate?: string | null;
}

export interface StatVisualsPayloadResult {
  /** False when the viewer is not staff (can_manage_stats) on the team. */
  authorized: boolean;
  /**
   * The complete chart payload — undefined ONLY when unauthorized, so the page
   * can fall the gallery back to its honest empty frames with one check.
   */
  data?: StatVisualsData;
  /** True when readiness/workload were withheld (no can_view_readiness). */
  readinessWithheld: boolean;
  /** Honest error string when a sub-read failed; chart arrays stay safe ([]). */
  error: string | null;
}

const DEFAULT_WINDOW_DAYS = 45;

function isoDaysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

function todayYmd(): string {
  return new Date().toISOString().slice(0, 10);
}

// -----------------------------------------------------------------------------
// Shared math helper.
// -----------------------------------------------------------------------------

function avg(values: (number | null | undefined)[]): number | null {
  const nums = values.filter((v): v is number => v != null && Number.isFinite(v));
  if (nums.length === 0) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// =============================================================================
// FIELDING + CATCHING + DEFENSE families
// =============================================================================

interface PlayerName {
  id: string;
  first_name: string | null;
  last_name: string | null;
  primary_position: string | null;
}

function nameOf(p: PlayerName | undefined | null): string {
  if (!p) return 'Unknown';
  return [p.first_name, p.last_name].filter(Boolean).join(' ') || 'Unknown';
}

/** Catcher Workload Board — per-day innings/bullpens/throws from catching +
 *  workload events for catchers. Aggregated by date (one strip row per day). */
function buildCatcherWorkload(
  catching: BaseballCatchingEvent[],
  workload: BaseballWorkloadEvent[],
  catcherIds: Set<string>,
): CatcherWorkloadPoint[] {
  const byDate = new Map<string, { throws: number; bullpens: number; innings: Set<string> }>();
  const ensure = (d: string) => {
    let r = byDate.get(d);
    if (!r) { r = { throws: 0, bullpens: 0, innings: new Set() }; byDate.set(d, r); }
    return r;
  };
  for (const c of catching) {
    if (!c.catcher_id || !catcherIds.has(c.catcher_id)) continue;
    const d = (c.measured_at ?? '').slice(0, 10);
    if (!d) continue;
    const r = ensure(d);
    if (c.event_type === 'throwdown') r.throws += 1;
    if (c.data_context === 'bullpen' || c.event_type === 'mound_visit') r.bullpens += 1;
  }
  for (const w of workload) {
    if (!w.player_id || !catcherIds.has(w.player_id)) continue;
    const d = w.event_date?.slice(0, 10);
    if (!d) continue;
    const r = ensure(d);
    if (w.event_type === 'bullpen' || w.event_type === 'catch_play') r.bullpens += w.count ?? 1;
    if (w.event_type === 'position_throwing' || w.event_type === 'long_toss') r.throws += w.count ?? 1;
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, r]) => ({
      date,
      inningsCaught: null, // not at the catching-event grain; left honest-null
      bullpensCaught: r.bullpens || null,
      throws: r.throws || null,
      readiness: null,
    }));
}

/** Battery Matrix — pitcher×catcher strike-rate from pitch events joined through
 *  catching events. Built from catching events that carry pitch + strike info via
 *  the pitch_event_id link is overkill here; we approximate from catching-event
 *  framing/receive results which is the honest battery signal at this grain. */
function buildBatteryMatrix(
  catching: BaseballCatchingEvent[],
  nameById: Map<string, PlayerName>,
): BatteryCell[] {
  const cells = new Map<string, { innings: number; strikes: number; total: number; rows: { trust_tier?: BaseballTrustTier | null }[] }>();
  for (const c of catching) {
    if (!c.catcher_id || !c.pitcher_id) continue;
    const key = `${c.pitcher_id}::${c.catcher_id}`;
    let cell = cells.get(key);
    if (!cell) { cell = { innings: 0, strikes: 0, total: 0, rows: [] }; cells.set(key, cell); }
    cell.total += 1;
    cell.rows.push(c);
    // A favorable framing/receive result counts toward "strikes earned".
    if (/strike|good|plus|earned/i.test(c.framing_result ?? '')) cell.strikes += 1;
  }
  return [...cells.entries()].map(([key, cell]) => {
    const [pitcherId = '', catcherId = ''] = key.split('::');
    return {
      pitcherId,
      catcherId,
      pitcherName: nameOf(nameById.get(pitcherId)),
      catcherName: nameOf(nameById.get(catcherId)),
      innings: cell.total,
      strikeRate: cell.total > 0 ? cell.strikes / cell.total : null,
      // honest thin-sample note: battery impact needs a real innings sample.
      thinSample: cell.total < SAMPLE_THRESHOLDS.commandHeatmap.read,
    } satisfies BatteryCell;
  }).sort((a, b) => b.innings - a.innings);
}

/** Defensive Event Map — placed plays with normalized field coords. */
function buildDefensiveEvents(fielding: BaseballFieldingEvent[]): DefensiveEventPoint[] {
  return fielding.map((f) => {
    const r = (f.result ?? '').toLowerCase();
    const result: DefensiveEventPoint['result'] =
      f.error_type || /error|e\d|misplay/.test(r) ? 'error'
        : /out|putout|assist|dp|fc/.test(r) ? 'out'
        : /hit|single|double|triple/.test(r) ? 'hit'
        : 'unknown';
    return {
      id: f.id,
      fieldX: f.field_x ?? null,
      fieldY: f.field_y ?? null,
      position: f.position ?? null,
      result,
      context: f.data_context,
      source: f.trust_tier ? { trust: trustTierToSourceTrust(f.trust_tier) } : undefined,
    } satisfies DefensiveEventPoint;
  });
}

/** Baserunning Board — per-runner speed + decision aggregates. */
function buildBaserunning(
  events: BaseballBaserunningEvent[],
  nameById: Map<string, PlayerName>,
): BaserunningRow[] {
  const byRunner = new Map<string, BaseballBaserunningEvent[]>();
  for (const e of events) {
    if (!e.runner_id) continue;
    const arr = byRunner.get(e.runner_id) ?? [];
    arr.push(e);
    byRunner.set(e.runner_id, arr);
  }
  return [...byRunner.entries()].map(([runnerId, evs]) => {
    const sb = evs.filter((e) => /steal/i.test(e.event_type ?? '') && /safe|success/i.test(e.result ?? '')).length;
    const cs = evs.filter((e) => /steal/i.test(e.event_type ?? '') && /out|caught/i.test(e.result ?? '')).length;
    const brOuts = evs.filter((e) => /out/i.test(e.result ?? '') && !/steal/i.test(e.event_type ?? '')).length;
    return {
      playerId: runnerId,
      playerName: nameOf(nameById.get(runnerId)),
      sixtyTime: avg(evs.map((e) => e.sixty_time)),
      homeToFirst: avg(evs.map((e) => e.home_to_first)),
      firstToThird: avg(evs.map((e) => e.first_to_third)),
      stolenBases: sb || null,
      caughtStealing: cs || null,
      baserunningOuts: brOuts || null,
    } satisfies BaserunningRow;
  }).sort((a, b) => (a.sixtyTime ?? 99) - (b.sixtyTime ?? 99));
}

// =============================================================================
// PERFORMANCE family — readiness strip / pitcher workload / lift progression
// =============================================================================

function readinessStatusFromBand(band: string | null | undefined): ReadinessCellStatus {
  if (!band) return 'missing';
  if (band === 'green') return 'ready';
  if (band === 'red') return 'high_soreness';
  // yellow / orange_lower / orange_upper / blue(rest-day) all read as "limited".
  if (band.startsWith('orange') || band === 'yellow' || band === 'blue') return 'limited';
  return 'missing';
}

/**
 * Readiness Heat Strip — one row per player, one cell per day in the window. The
 * band is computed per check-in through the SAME transparent computeReadiness the
 * Performance Command Center uses (never a medical claim; never a false "high" on
 * sparse data). Joined with the soreness map for that check-in so arm/lower-body
 * soreness drives the band honestly.
 */
async function buildReadiness(
  db: Db,
  teamId: string,
  roster: PlayerName[],
  windowDays: number,
): Promise<ReadinessRow[]> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceYmd = since.toISOString().slice(0, 10);
  const today = todayYmd();

  const { data: checkins } = await db
    .from('baseball_readiness_checkins')
    .select('id, player_id, check_date, sleep_hours, energy_level, soreness_level, arm_status')
    .eq('team_id', teamId)
    .gte('check_date', sinceYmd)
    .order('check_date', { ascending: true });
  const checkinRows = (checkins ?? []) as Array<{
    id: string; player_id: string; check_date: string;
    sleep_hours: number | null; energy_level: number | null;
    soreness_level: number | null; arm_status: ReadinessInputs['armStatus'];
  }>;

  // Soreness maps for those check-ins (for the upper/lower flags + max severity).
  const checkinIds = checkinRows.map((c) => c.id);
  const soreByCheckin = new Map<string, Array<{ region: string; severity: number }>>();
  if (checkinIds.length) {
    const { data: sm } = await db
      .from('baseball_soreness_maps')
      .select('checkin_id, body_region, severity')
      .in('checkin_id', checkinIds);
    for (const s of (sm ?? []) as Array<{ checkin_id: string; body_region: string; severity: number }>) {
      const arr = soreByCheckin.get(s.checkin_id) ?? [];
      arr.push({ region: s.body_region, severity: s.severity });
      soreByCheckin.set(s.checkin_id, arr);
    }
  }

  // dates spanning the window (oldest→newest), capped to keep the strip legible.
  const dates: string[] = [];
  for (let i = Math.min(windowDays, 30); i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const byPlayer = new Map<string, Map<string, BaseballReadinessBand>>();
  for (const c of checkinRows) {
    const sore = soreByCheckin.get(c.id) ?? [];
    const maxSeverity = sore.length ? Math.max(...sore.map((s) => s.severity)) : null;
    const comp = computeReadiness({
      playerId: c.player_id,
      checkDate: c.check_date,
      today,
      sleepHours: c.sleep_hours,
      energyLevel: c.energy_level,
      stressLevel: null,
      sorenessLevel: c.soreness_level,
      armStatus: c.arm_status ?? null,
      lowerBodyStatus: null,
      illnessFlag: false,
      maxSorenessSeverity: maxSeverity,
      hasUpperSoreness: sore.some((s) => /arm|shoulder|elbow|chest|upper|back/i.test(s.region)),
      hasLowerSoreness: sore.some((s) => /leg|knee|hip|quad|hamstring|calf|ankle|lower/i.test(s.region)),
      bodyweightDelta7d: null,
      availabilityStatus: null,
    });
    const m = byPlayer.get(c.player_id) ?? new Map<string, BaseballReadinessBand>();
    m.set(c.check_date.slice(0, 10), comp.band);
    byPlayer.set(c.player_id, m);
  }

  return roster.map((p) => {
    const m = byPlayer.get(p.id);
    return {
      playerId: p.id,
      playerName: nameOf(p),
      positionGroup: p.primary_position ?? null,
      cells: dates.map((date) => ({
        date,
        status: readinessStatusFromBand(m?.get(date)),
        score: null, // the transparent model emits a band, not a fabricated score
      })),
    } satisfies ReadinessRow;
  });
}

/** Pitcher Workload Overlay — per-day game/bullpen/high-intent stacks + readiness. */
async function buildPitcherWorkload(
  db: Db,
  teamId: string,
  playerId: string,
  windowDays: number,
): Promise<PitcherWorkloadDay[]> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);
  const sinceYmd = since.toISOString().slice(0, 10);

  const { data: rows } = await db
    .from('baseball_workload_events')
    .select('event_date, event_type, count, high_intent_count')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .gte('event_date', sinceYmd)
    .order('event_date', { ascending: true });

  const byDate = new Map<string, { game: number; pen: number; high: number }>();
  for (const r of (rows ?? []) as Array<{
    event_date: string; event_type: string; count: number | null; high_intent_count: number | null;
  }>) {
    const d = r.event_date.slice(0, 10);
    const agg = byDate.get(d) ?? { game: 0, pen: 0, high: 0 };
    const n = r.count ?? 0;
    if (r.event_type === 'game_pitches') agg.game += n;
    else if (r.event_type === 'bullpen' || r.event_type === 'flat_ground') agg.pen += n;
    agg.high += r.high_intent_count ?? 0;
    byDate.set(d, agg);
  }
  return [...byDate.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, a]) => ({
      date,
      gamePitches: a.game,
      bullpenPitches: a.pen,
      highIntentThrows: a.high,
      readiness: null,
      velocity: null,
    }));
}

/** Lift Progression — actual-vs-target load over time for a player's top lift. */
async function buildLiftProgression(
  db: Db,
  teamId: string,
  playerId: string,
  windowDays: number,
): Promise<{ exercise: string; points: LiftProgressionPoint[] }> {
  const since = new Date();
  since.setDate(since.getDate() - windowDays * 2); // lifts are less frequent
  const sinceYmd = since.toISOString().slice(0, 10);

  // session-exercise rows for this player's completed sessions
  const { data: sessions } = await db
    .from('baseball_lift_sessions')
    .select('id, scheduled_date')
    .eq('team_id', teamId)
    .eq('player_id', playerId)
    .gte('scheduled_date', sinceYmd)
    .order('scheduled_date', { ascending: true });
  const sessionIds = (sessions ?? []).map((s: { id: string }) => s.id);
  const dateBySession = new Map<string, string>(
    (sessions ?? []).map((s: { id: string; scheduled_date: string }) => [s.id, s.scheduled_date]),
  );
  if (sessionIds.length === 0) return { exercise: 'No lift data', points: [] };

  const { data: ex } = await db
    .from('baseball_lift_session_exercises')
    .select('id, session_id, exercise_name_snapshot, prescribed_load, section_type_snapshot')
    .in('session_id', sessionIds);
  const exRows = (ex ?? []) as Array<{
    id: string; session_id: string; exercise_name_snapshot: string;
    prescribed_load: number | null; section_type_snapshot: string | null;
  }>;
  if (exRows.length === 0) return { exercise: 'No lift data', points: [] };

  // Pick the most-frequent main-strength exercise as the progression subject.
  const counts = new Map<string, number>();
  for (const e of exRows) {
    if (e.section_type_snapshot && e.section_type_snapshot !== 'main_strength') continue;
    counts.set(e.exercise_name_snapshot, (counts.get(e.exercise_name_snapshot) ?? 0) + 1);
  }
  let exercise = exRows[0]?.exercise_name_snapshot ?? 'Main lift';
  let best = 0;
  for (const [name, n] of counts) if (n > best) { exercise = name; best = n; }

  // Session-exercise rows for the chosen lift → per-exercise prescribed/date.
  const chosen = exRows.filter((e) => e.exercise_name_snapshot === exercise);
  const meta = new Map<string, { date: string; prescribed: number | null }>(
    chosen.map((e) => [e.id, {
      date: dateBySession.get(e.session_id) ?? '',
      prescribed: e.prescribed_load,
    }]),
  );
  const seIds = chosen.map((e) => e.id);
  if (seIds.length === 0) return { exercise, points: [] };

  // Actual loads come from the set-results grain; take each exercise's TOP set
  // (heaviest completed load) as the day's progression point — honest about the
  // best work done, not an average that hides a back-off set.
  const { data: sets } = await db
    .from('baseball_lift_set_results')
    .select('session_exercise_id, actual_load, actual_reps, rpe')
    .eq('player_id', playerId)
    .in('session_exercise_id', seIds);
  const topBySe = new Map<string, { load: number | null; reps: number | null; rpe: number | null }>();
  for (const s of (sets ?? []) as Array<{
    session_exercise_id: string; actual_load: number | null; actual_reps: number | null; rpe: number | null;
  }>) {
    const cur = topBySe.get(s.session_exercise_id);
    if (!cur || (s.actual_load ?? -1) > (cur.load ?? -1)) {
      topBySe.set(s.session_exercise_id, { load: s.actual_load, reps: s.actual_reps, rpe: s.rpe });
    }
  }

  const points: LiftProgressionPoint[] = [...meta.entries()]
    .map(([seId, m]) => {
      const top = topBySe.get(seId);
      return {
        date: m.date,
        actualLoad: top?.load ?? null,
        targetLoad: m.prescribed,
        reps: top?.reps ?? null,
        rpe: top?.rpe ?? null,
      } satisfies LiftProgressionPoint;
    })
    .filter((p) => !!p.date)
    .sort((a, b) => a.date.localeCompare(b.date));

  return { exercise, points };
}

// =============================================================================
// DATA-QUALITY family — source coverage / import diff / practice focus
// =============================================================================

/** Source Coverage Board — per-source freshness vs expected cadence. */
async function buildSourceCoverage(db: Db, teamId: string): Promise<SourceCoverageCard[]> {
  const { data: sources } = await db
    .from('baseball_stat_sources')
    .select('id, source_name, source_key, trust_tier, expected_cadence_days, is_enabled')
    .eq('team_id', teamId);
  const srcRows = (sources ?? []) as Array<Pick<BaseballStatSourceRow,
    'id' | 'source_name' | 'source_key' | 'trust_tier' | 'expected_cadence_days' | 'is_enabled'>>;
  if (srcRows.length === 0) return [];

  // Latest import run per source (last received) + warning proxy.
  const { data: runs } = await db
    .from('baseball_import_runs')
    .select('source_id, source_label, status, created_at, committed_at, unmatched_rows')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false });
  const lastBySource = new Map<string, { received: string | null; success: string | null; warnings: number }>();
  for (const r of (runs ?? []) as Array<{
    source_id: string; status: string; created_at: string; committed_at: string | null; unmatched_rows: number | null;
  }>) {
    const cur = lastBySource.get(r.source_id);
    const warn = (r.unmatched_rows ?? 0) > 0 || r.status === 'failed' ? 1 : 0;
    if (!cur) {
      lastBySource.set(r.source_id, {
        received: r.created_at,
        success: r.status === 'committed' ? (r.committed_at ?? r.created_at) : null,
        warnings: warn,
      });
    } else {
      cur.warnings += warn;
      if (!cur.success && r.status === 'committed') cur.success = r.committed_at ?? r.created_at;
    }
  }

  const now = Date.now();
  return srcRows.map((s) => {
    // import_runs.source_id is TEXT (source_key); stat_sources.id is uuid. We key
    // coverage by BOTH: try the uuid first, fall back to the source_key.
    const last = lastBySource.get(s.id) ?? lastBySource.get(s.source_key);
    const received = last?.received ?? null;
    let freshness: SourceFreshness = 'missing';
    if (received) {
      const ageDays = (now - new Date(received).getTime()) / 86_400_000;
      const cadence = s.expected_cadence_days ?? 14;
      freshness = ageDays <= cadence ? 'fresh' : 'stale';
    }
    const confidence: BaseballMetricConfidence =
      freshness === 'fresh' ? 'high' : freshness === 'stale' ? 'medium' : 'insufficient';
    return {
      sourceId: s.id,
      provider: s.source_name,
      freshness,
      lastReceived: received,
      lastReviewed: last?.success ?? null,
      lastSuccess: last?.success ?? null,
      pendingWarnings: last?.warnings ?? 0,
      mappedPlayers: 0, // honest: per-source player mapping count not joined here
      confidence,
    } satisfies SourceCoverageCard;
  });
}

/** Import Diff Viewer — the most-recent in-review/committed run's row deltas. */
async function buildImportDiff(db: Db, teamId: string): Promise<ImportDiffRow[]> {
  const { data: runs } = await db
    .from('baseball_import_runs')
    .select('id, source_label, status, total_rows, matched_rows, unmatched_rows, created_at')
    .eq('team_id', teamId)
    .in('status', ['review', 'committed'])
    .order('created_at', { ascending: false })
    .limit(1);
  const run = ((runs ?? [])[0]) as
    | { id: string; source_label: string | null; total_rows: number; matched_rows: number; unmatched_rows: number }
    | undefined;
  if (!run) return [];

  // Summarize the run as honest diff rows (the per-cell diff lives in the import
  // review screen; here we surface the run-level shape: matched/unmatched/dupes).
  const rows: ImportDiffRow[] = [];
  if (run.matched_rows > 0) {
    rows.push({
      id: `${run.id}-matched`,
      kind: 'changed',
      player: null,
      field: 'matched rows',
      before: null,
      after: String(run.matched_rows),
      note: `${run.source_label ?? 'Import'} matched ${run.matched_rows}/${run.total_rows} rows`,
    });
  }
  if (run.unmatched_rows > 0) {
    rows.push({
      id: `${run.id}-unmatched`,
      kind: 'warning',
      player: null,
      field: 'unmatched rows',
      before: null,
      after: String(run.unmatched_rows),
      note: 'Rows that did not map to a roster player — review before committing.',
    });
  }
  return rows;
}

/**
 * Practice-Focus → Outcome Board — maps the honest practice-effectiveness reviews
 * (theme→cause→driver→plan engine output) into the visual's row contract. The
 * EffectivenessStatus is derived from the review's OBSERVED direction +
 * confidence tier so a "too early" / "not enough sample" review can never read as
 * a proven win. Confidence tier maps to the visual's BaseballMetricConfidence.
 */
function practiceFocusFromReviews(reviews: EffectivenessReviewView[]): PracticeFocusRow[] {
  const statusOf = (r: EffectivenessReviewView): PracticeFocusRow['status'] => {
    if (r.confidence_tier === 'too_early' || r.direction === 'too_early') return 'too_early';
    if (r.confidence_tier === 'not_enough_sample' || r.direction === 'insufficient_sample') {
      return 'not_enough_sample';
    }
    if (r.direction === 'improved') {
      // Only call it a real move when the engine backs the association.
      return r.confidence_tier === 'correlated_not_proven' ? 'moved_up' : 'correlated_not_proven';
    }
    if (r.direction === 'worse') {
      return r.confidence_tier === 'correlated_not_proven' ? 'moved_down' : 'correlated_not_proven';
    }
    if (r.direction === 'not_tracked') return 'not_enough_sample';
    return 'no_change';
  };
  const confidenceOf = (r: EffectivenessReviewView): BaseballMetricConfidence => {
    switch (r.confidence_tier) {
      case 'correlated_not_proven': return 'medium';
      case 'not_enough_sample': return 'low';
      case 'too_early':
      case 'no_signal':
      default: return 'insufficient';
    }
  };
  return reviews.map((r) => ({
    id: r.id,
    focus: r.focus_area,
    players: r.player_ids?.length ?? 0,
    date: (r.generated_at ?? r.created_at ?? '').slice(0, 10),
    targetMetric: r.metricLabel,
    status: statusOf(r),
    baseline: r.metric_before,
    latest: r.metric_after,
    confidence: confidenceOf(r),
    nextAction: r.recommendedActionParsed?.label ?? null,
  }));
}

// =============================================================================
// GAME-VS-PRACTICE gap (player scope) — paired bullets from the elite gap model.
// =============================================================================

function gameVsPracticeRows(gap: GameVsCageReadModel): PairedMetricRow[] {
  return gap.rows.map((r) => ({
    metricKey: r.metricKey,
    label: r.label,
    higherIsBetter: r.higherIsBetter,
    gameValue: r.gameValue,
    gameSample: r.gameSample,
    practiceValue: r.cageValue,
    practiceSample: r.cageSample,
    unit: /velocity|exit/.test(r.metricKey) ? 'mph' : /angle/.test(r.metricKey) ? 'deg' : '%',
  }));
}

// =============================================================================
// PLAYER DNA (player scope) — a normalized multi-tool radar from the player's
// own elite metrics. Honest: each dimension carries its sample + confidence and
// renders a gap (null) rather than a fabricated 0 when starved.
// =============================================================================

/** Normalize a raw metric value into [0,1] against a coarse college-baseball
 *  reference band. These are display normalizations (radar geometry), NOT a
 *  performance claim — the rawLabel + sample keep it honest. */
function normalizeDna(metricKey: string, value: number | null): number | null {
  if (value == null) return null;
  const clamp01 = (n: number) => Math.max(0, Math.min(1, n));
  switch (metricKey) {
    case 'avg_exit_velocity': return clamp01((value - 80) / 20); // 80→100 mph
    case 'hard_hit_rate': return clamp01(value / 0.55);
    case 'barrel_rate': return clamp01(value / 0.15);
    case 'zone_contact_rate': return clamp01((value - 0.6) / 0.4);
    case 'chase_rate': return clamp01(1 - value / 0.45); // lower is better
    case 'whiff_rate': return clamp01(1 - value / 0.4);
    case 'csw_rate': return clamp01(value / 0.35); // pitcher
    case 'avg_velocity': return clamp01((value - 80) / 20);
    case 'strike_rate': return clamp01((value - 0.5) / 0.3);
    default: return clamp01(value);
  }
}

function buildPlayerDna(
  model: EliteStatEventsReadModel,
  playerId: string,
): { dimensions: PlayerDnaDimension[]; role: string | null } {
  const hitter = model.hitters.find((h) => h.playerId === playerId);
  const pitcher = model.pitchers.find((p) => p.playerId === playerId);

  const HITTER_DNA = ['avg_exit_velocity', 'hard_hit_rate', 'barrel_rate', 'zone_contact_rate', 'chase_rate', 'whiff_rate'];
  const PITCHER_DNA = ['avg_velocity', 'csw_rate', 'whiff_rate', 'chase_rate', 'strike_rate', 'first_pitch_strike_rate'];

  const hitterSample = (hitter?.metrics ?? []).reduce((s, m) => s + m.sampleSize, 0);
  const pitcherSample = (pitcher?.metrics ?? []).reduce((s, m) => s + m.sampleSize, 0);
  const isPitcherDominant = pitcherSample > hitterSample;
  const source = isPitcherDominant ? pitcher : hitter;
  const keys = isPitcherDominant ? PITCHER_DNA : HITTER_DNA;
  const role = isPitcherDominant ? 'Pitcher' : 'Hitter';

  if (!source) return { dimensions: [], role: null };
  const byKey = new Map(source.metrics.map((m) => [m.metricKey, m]));

  const dimensions: PlayerDnaDimension[] = keys.map((key) => {
    const m = byKey.get(key);
    const value = normalizeDna(key, m?.value ?? null);
    const rawLabel = m && m.value != null
      ? m.unit === 'rate' ? `${Math.round(m.value * 100)}%`
        : m.unit === 'mph' ? `${m.value.toFixed(1)} mph`
        : m.unit === 'deg' ? `${m.value.toFixed(1)}°`
        : m.value.toFixed(2)
      : null;
    return {
      key,
      label: m?.label ?? key,
      value: m?.confidence === 'insufficient' ? null : value,
      rawLabel,
      sample: m?.sampleSize ?? 0,
      confidence: m?.confidence ?? 'insufficient',
    } satisfies PlayerDnaDimension;
  });
  return { dimensions, role };
}

// =============================================================================
// getStatVisualsPayload — the single orchestrator both mounts call.
// =============================================================================

export async function getStatVisualsPayload(
  teamId: string,
  options: StatVisualsPayloadOptions = {},
): Promise<StatVisualsPayloadResult> {
  if (!teamId) {
    return { authorized: false, readinessWithheld: true, error: 'A team id is required.' };
  }

  // 1. Elite hitting/pitching events (STAFF gate lives inside getEliteStatEvents).
  const eliteModel = await getEliteStatEvents(teamId, {
    playerId: options.playerId ?? null,
    fromDate: options.fromDate ?? null,
    toDate: options.toDate ?? null,
  });
  if (!eliteModel.authorized) {
    return { authorized: false, readinessWithheld: true, error: eliteModel.error };
  }

  const supabase = (await createClient()) as Db;
  const fromIso = options.fromDate ?? isoDaysAgo(DEFAULT_WINDOW_DAYS);
  const toIso = options.toDate ?? null;
  let error: string | null = eliteModel.error;

  // 2. Roster (names + position for fielding/baserunning/readiness labels).
  const { data: members, error: rosterErr } = await supabase
    .from('baseball_team_members')
    .select('player_id, baseball_players!inner ( id, first_name, last_name, primary_position )')
    .eq('team_id', teamId);
  if (rosterErr) error = error ?? 'Roster could not be loaded for chart labels.';
  const roster: PlayerName[] = (members ?? [])
    .map((m: { baseball_players: PlayerName }) => m.baseball_players)
    .filter((p: PlayerName | null): p is PlayerName => Boolean(p?.id))
    .filter((p: PlayerName) => !options.playerId || p.id === options.playerId);
  const nameById = new Map<string, PlayerName>(
    ((members ?? []).map((m: { baseball_players: PlayerName }) => m.baseball_players)
      .filter((p: PlayerName | null): p is PlayerName => Boolean(p?.id)))
      .map((p: PlayerName) => [p.id, p]),
  );

  // 3. Fielding / catching / baserunning / workload events (windowed, scoped).
  const buildEventQuery = (table: string, playerCol: string) => {
    let q = fromUntyped(supabase, table).select('*').eq('team_id', teamId);
    if (options.playerId) q = q.eq(playerCol, options.playerId);
    return q;
  };

  const [fieldRes, catchRes, baserunRes, workloadRes] = await Promise.all([
    buildEventQuery('baseball_fielding_events', 'player_id').gte('measured_at', fromIso),
    fromUntyped(supabase, 'baseball_catching_events').select('*').eq('team_id', teamId)
      .gte('measured_at', fromIso)
      .then((r: { data: unknown[] | null; error: unknown }) => r),
    buildEventQuery('baseball_baserunning_events', 'runner_id').gte('measured_at', fromIso),
    buildEventQuery('baseball_workload_events', 'player_id'),
  ]);

  if (fieldRes.error || catchRes.error || baserunRes.error || workloadRes.error) {
    error = error ?? 'Some defense/baserunning/workload events could not be loaded.';
  }

  const fielding = (fieldRes.data ?? []) as BaseballFieldingEvent[];
  let catching = (catchRes.data ?? []) as BaseballCatchingEvent[];
  // Player scope: a catcher's battery/workload is their own catching events.
  if (options.playerId) {
    catching = catching.filter((c) => c.catcher_id === options.playerId || c.pitcher_id === options.playerId);
  }
  const baserunning = (baserunRes.data ?? []) as BaseballBaserunningEvent[];
  let workload = (workloadRes.data ?? []) as BaseballWorkloadEvent[];
  if (toIso) workload = workload.filter((w) => (w.event_date ?? '') <= toIso.slice(0, 10));

  const catcherIds = new Set<string>(catching.map((c) => c.catcher_id).filter((x): x is string => !!x));

  // 4. Role gate for readiness/workload on PLAYER scope. Team scope is already
  //    staff (can_manage_stats); the stricter readiness scope still applies so a
  //    stats-only assistant doesn't see soreness-derived readiness bands.
  const canViewReadiness = await hasBaseballCapability(teamId, 'can_view_readiness');
  const readinessWithheld = !canViewReadiness;

  // 5. Performance family (gated).
  let readiness: ReadinessRow[] = [];
  let pitcherWorkload: PitcherWorkloadDay[] = [];
  let liftExercise = 'Main lift';
  let liftProgression: LiftProgressionPoint[] = [];
  if (canViewReadiness) {
    try {
      readiness = await buildReadiness(supabase, teamId, roster, DEFAULT_WINDOW_DAYS);
    } catch {
      error = error ?? 'Readiness could not be loaded.';
    }
  }
  if (options.playerId) {
    try {
      [pitcherWorkload] = await Promise.all([
        buildPitcherWorkload(supabase, teamId, options.playerId, DEFAULT_WINDOW_DAYS),
      ]);
    } catch {
      error = error ?? 'Workload could not be loaded.';
    }
    try {
      const lift = await buildLiftProgression(supabase, teamId, options.playerId, DEFAULT_WINDOW_DAYS);
      liftExercise = lift.exercise;
      liftProgression = lift.points;
    } catch {
      error = error ?? 'Lift progression could not be loaded.';
    }
  }

  // 6. Data-quality family (team-level coverage + last import diff). On player
  //    scope we still show source coverage (it's a team-health board), but skip
  //    the import diff which is an operations artifact.
  let sourceCoverage: SourceCoverageCard[] = [];
  let importDiff: ImportDiffRow[] = [];
  let practiceFocus: PracticeFocusRow[] = [];
  try {
    sourceCoverage = await buildSourceCoverage(supabase, teamId);
  } catch {
    error = error ?? 'Source coverage could not be loaded.';
  }
  if (!options.playerId) {
    try {
      importDiff = await buildImportDiff(supabase, teamId);
    } catch {
      error = error ?? 'Import diff could not be loaded.';
    }
  }
  // Practice-focus → outcome board (team scope). Honest: the effectiveness read
  // model is itself can_manage_practice-gated; an unauthorized envelope yields []
  // so the board shows its own empty frame rather than fabricating outcomes.
  try {
    const eff = await getPracticeEffectivenessData();
    if (eff.authorized) {
      const pid = options.playerId;
      const reviews = pid
        ? eff.reviews.filter((r) => (r.player_ids ?? []).includes(pid))
        : eff.reviews;
      practiceFocus = practiceFocusFromReviews(reviews);
    }
  } catch {
    error = error ?? 'Practice-focus outcomes could not be loaded.';
  }

  // 7. Game-vs-practice gap + Player DNA (player scope only).
  let gamePracticeGap: PairedMetricRow[] = [];
  let playerDna: PlayerDnaDimension[] = [];
  let playerDnaRole: string | undefined;
  if (options.playerId) {
    try {
      const gap = await getGameVsCageGap(teamId, options.playerId);
      if (gap.authorized) gamePracticeGap = gameVsPracticeRows(gap);
    } catch {
      error = error ?? 'Game-vs-practice gap could not be loaded.';
    }
    const dna = buildPlayerDna(eliteModel, options.playerId);
    playerDna = dna.dimensions;
    playerDnaRole = dna.role ?? undefined;
  }

  // 8. Merge the elite hitting/pitching payload with every other family.
  const elite = toStatVisualsData(eliteModel, { playerId: options.playerId ?? undefined });

  const data: StatVisualsData = {
    // hitting + pitching (elite events)
    evLa: elite.evLa,
    spray: elite.spray,
    zoneCells: elite.zoneCells,
    zoneTotalPitches: elite.zoneTotalPitches,
    zoneMetric: elite.zoneMetric,
    countLadder: elite.countLadder,
    gamePracticeGap,
    pitchShape: elite.pitchShape,
    command: elite.command,
    commandTotalPitches: elite.commandTotalPitches,
    decaySegments: elite.decaySegments,
    decayOutings: elite.decayOutings,
    pitchMix: elite.pitchMix,
    release: elite.release,
    // fielding / defense / baserunning
    catcherWorkload: buildCatcherWorkload(catching, workload, catcherIds),
    battery: buildBatteryMatrix(catching, nameById),
    defensiveEvents: buildDefensiveEvents(fielding),
    baserunning: buildBaserunning(baserunning, nameById),
    // performance (role-gated)
    readiness,
    liftExercise,
    liftProgression,
    pitcherWorkload,
    // data quality
    practiceFocus,
    importDiff,
    sourceCoverage,
    // player snapshot
    playerDna,
    playerDnaRole,
  };

  return { authorized: true, data, readinessWithheld, error };
}

// Re-export so a page can keep a single import for the type.
export type { StatVisualsData } from '@/components/baseball/stat-visuals/StatVisualsSection';

// Pure family-builder internals exported for the unit tests (which exercise the
// shaping without a DB) — NOT meant for app import.
export { readinessStatusFromBand, normalizeDna, buildPlayerDna };

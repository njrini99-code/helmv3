'use server';

// =============================================================================
// src/app/baseball/actions/operational-signals.ts
//
// Packet: signal-inbox DEEPENING — the SCHEDULED EVALUATOR + RULE-ENGINE write
// layer that turns the pure operational rule engine
// (src/lib/baseball/operational-rule-engine.ts) into source_kind:'system'
// signals in baseball_signals.
//
// CONTROLLING SPEC: v5_competitive_system_blueprints.md §System 1 — the spec's
//   five generation sources are (1) direct rule engine, (2) import validation,
//   (3) user action, (4) AI output, (5) scheduled evaluator. The AI-output path
//   already existed (signal-from-insight.ts). The academics rule existed
//   (class-conflict-engine.ts). THIS action adds the DIRECT RULE ENGINE +
//   SCHEDULED EVALUATOR for the operations / roster / practice / stats /
//   recruiting / AI-hygiene categories that had no generation path.
//
// FLOW (mirrors runClassConflictDetection — the proven non-destructive pattern):
//   1. Load ONE facts snapshot from the relevant tables (events+acks, tasks,
//      documents, travel, team_members status, players, games, postgame reviews,
//      import runs, practices+blocks, last engine run).
//   2. Run the PURE engine → RuleSignal[].
//   3. UPSERT each into baseball_signals by (team_id, dedupe_key) — a re-run
//      REFRESHES the open signal in place; it NEVER clones and NEVER touches a
//      coach-triaged (acknowledged/converted/dismissed/resolved) signal.
//   4. Reconcile: an OPEN, system-rule signal whose rule did NOT re-emit this
//      run is auto-RESOLVED (the condition cleared) — never deleted, and only
//      untriaged ('new'/'sample_too_small') rows so we never walk back a coach.
//
// CAPABILITY: can_manage_stats (the same triage capability that owns the Signal
//   Inbox). Enforced SERVER-SIDE by withBaseballAction. RLS still applies on
//   every read/write (request-scoped client, not service_role).
//
// NON-DESTRUCTIVE (CLAUDE.md hard rule): only UPSERTs + disposition UPDATEs. No
//   delete-then-reinsert anywhere.
//
// This module OWNS the operational-rule write path. It does NOT edit signals.ts
// (it only writes baseball_signals rows the inbox already triages) or the engine
// task's insights.ts / coachhelm.ts.
// =============================================================================

import { revalidatePath } from 'next/cache';

import { createClient } from '@/lib/supabase/server';
import { withBaseballAction } from '@/lib/baseball/with-baseball-action';
import { normalizeConfidence } from '@/lib/baseball/source-record';
import { logServerError } from '@/lib/server-error-logger';
import { describeError, describeWriteFailure } from '@/lib/utils/describe-error';
import {
  runOperationalRuleEngine,
  normalizedNameKey,
  DEFAULT_RULE_ENGINE_CONFIG,
  type OperationalRuleFacts,
  type FactEvent,
  type FactPractice,
  type FactTask,
  type FactDocument,
  type FactTravel,
  type FactPlayer,
  type FactGame,
  type FactImportRow,
  type FactPlayerHittingSpan,
  type RuleSignal,
  type RuleEngineConfig,
} from '@/lib/baseball/operational-rule-engine';
import {
  adaptLegacyStatsMap,
  type BoxScoreGameContextRow,
  type SourceLayer,
} from '@/lib/baseball/read-models/legacy-stat-adapters';
import type {
  BaseballSignalInsert,
  BaseballJson,
} from '@/lib/types/baseball-signals';
import type { BaseballPlayerAggregates } from '@/lib/types';

// -----------------------------------------------------------------------------
// Loose client — baseball_signals + several source tables are not in the
// generated db types (migrations unapplied; shared prod DB). RLS still applies;
// this only loosens TS typing, matching imports.ts / video-classes.ts.
// -----------------------------------------------------------------------------

type LooseClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

const SIGNALS_PATH = '/baseball/dashboard/signals';
const COMMAND_PATH = '/baseball/dashboard/command-center';

/** TTL before a re-run does not refresh → the signal naturally ages out. */
const OPERATIONAL_SIGNAL_TTL_DAYS = 14;

/** How far back to look for "recent games" needing stats / review. */
const GAME_LOOKBACK_DAYS = 21;
/** How far forward to look for upcoming events / practices / travel. */
const HORIZON_DAYS = 14;
/**
 * Number of most-recent game rows per player to aggregate for the cold-streak
 * rule. Matches DEFAULT_RULE_ENGINE_CONFIG.coldStreakMinGames so the loader
 * and the rule share the same N — keeps the "recent" window definition
 * consistent without passing the config to the loader.
 */
const COLD_STREAK_LOOKBACK_GAMES: number = DEFAULT_RULE_ENGINE_CONFIG.coldStreakMinGames;

/**
 * Profile-completeness fields a recruiting-active player is expected to fill.
 * Derived directly from baseball_players columns (no separate showcase table).
 */
const PROFILE_FIELD_COLUMNS = [
  'primary_position',
  'grad_year',
  'height_feet',
  'weight_lbs',
  'gpa',
] as const;

export interface OperationalSignalsResult {
  success: boolean;
  stats?: {
    emitted: number;
    resolved: number;
    byRule: Record<string, number>;
  };
  error?: string;
}

// =============================================================================
// FACT LOADERS — each pulls ONE source and maps it to the engine's fact shape.
// Kept small + independent so a missing/empty source degrades gracefully (the
// corresponding rules simply produce nothing).
// =============================================================================

async function loadEventFacts(
  db: LooseClient,
  teamId: string,
  nowIso: string,
  horizonIso: string,
): Promise<FactEvent[]> {
  // The header above says an empty source "degrades gracefully — the
  // corresponding rules simply produce nothing". That is right for a source
  // that is genuinely empty, and wrong for one that FAILED: supabase-js
  // resolves errors as { data: null, error }, so a failed read produces the
  // same empty array and a whole category of operational signal silently
  // stops firing. The coach sees a quieter dashboard than reality and has no
  // way to know a rule never got its facts.
  //
  // Degrading stays — one dead source must not take down the whole signals
  // run — but it no longer degrades in silence.
  const { data: events, error: eventsError } = await db
    .from('baseball_events')
    .select('id, title, event_type, start_time, is_mandatory')
    .eq('team_id', teamId)
    .eq('is_mandatory', true)
    .gte('start_time', nowIso)
    .lte('start_time', horizonIso);
  if (eventsError) {
    await logServerError(
      `[operationalSignals] mandatory-event facts failed to load — those signals will not fire: ${describeError(eventsError)}`,
      { action: 'baseball.operationalSignals.loadEventFacts', featureArea: 'coachhelm', teamId },
    );
    return [];
  }
  const rows = (events ?? []) as Array<{
    id: string;
    title: string;
    event_type: string | null;
    start_time: string;
    is_mandatory: boolean | null;
  }>;
  if (rows.length === 0) return [];

  // Batch the ack rows for just these events.
  const ids = rows.map((e) => e.id);
  const { data: acks, error: acksError } = await db
    .from('baseball_event_acknowledgements')
    .select('event_id, user_id')
    .in('event_id', ids);
  // A failed ack read is the more misleading of the two: every event then
  // looks unacknowledged by everyone, which is a claim about the players
  // rather than about the query.
  if (acksError) {
    await logServerError(
      `[operationalSignals] acknowledgement facts failed to load — events will look unacknowledged: ${describeError(acksError)}`,
      { action: 'baseball.operationalSignals.loadEventFacts', featureArea: 'coachhelm', teamId },
    );
    return [];
  }
  const ackByEvent = new Map<string, string[]>();
  for (const a of (acks ?? []) as Array<{ event_id: string; user_id: string }>) {
    const arr = ackByEvent.get(a.event_id) ?? [];
    arr.push(a.user_id);
    ackByEvent.set(a.event_id, arr);
  }

  return rows.map((e) => ({
    id: e.id,
    title: e.title,
    eventType: e.event_type,
    startsAt: e.start_time,
    isMandatory: e.is_mandatory === true,
    ackUserIds: ackByEvent.get(e.id) ?? [],
  }));
}

async function loadPracticeFacts(
  db: LooseClient,
  teamId: string,
): Promise<FactPractice[]> {
  // baseball_practices has no own date column — it links to a calendar event
  // (event_id -> baseball_events.start_time) for its scheduled time.
  const { data: practices } = await db
    .from('baseball_practices')
    .select('id, title, status, event_id')
    .eq('team_id', teamId)
    .neq('status', 'completed')
    .limit(200);
  const rows = (practices ?? []) as Array<{
    id: string;
    title: string | null;
    status: string;
    event_id: string | null;
  }>;
  if (rows.length === 0) return [];

  const ids = rows.map((p) => p.id);

  // Resolve scheduled time from the linked events (one batched read).
  const eventIds = rows.map((p) => p.event_id).filter((e): e is string => !!e);
  const startByEvent = new Map<string, string>();
  if (eventIds.length > 0) {
    const { data: events } = await db
      .from('baseball_events')
      .select('id, start_time')
      .in('id', eventIds);
    for (const e of (events ?? []) as Array<{ id: string; start_time: string }>) {
      startByEvent.set(e.id, e.start_time);
    }
  }

  const { data: blocks } = await db
    .from('baseball_practice_blocks')
    .select('id, practice_id, activity, coach_owner_id')
    .in('practice_id', ids);
  const blocksByPractice = new Map<
    string,
    Array<{ id: string; activity: string; hasOwner: boolean }>
  >();
  for (const b of (blocks ?? []) as Array<{
    id: string;
    practice_id: string;
    activity: string;
    coach_owner_id: string | null;
  }>) {
    const arr = blocksByPractice.get(b.practice_id) ?? [];
    arr.push({ id: b.id, activity: b.activity, hasOwner: b.coach_owner_id != null });
    blocksByPractice.set(b.practice_id, arr);
  }

  return rows.map((p) => ({
    id: p.id,
    title: p.title,
    status: p.status,
    scheduledAt: p.event_id ? startByEvent.get(p.event_id) ?? null : null,
    blocks: blocksByPractice.get(p.id) ?? [],
  }));
}

async function loadTaskFacts(db: LooseClient, teamId: string): Promise<FactTask[]> {
  const { data } = await db
    .from('baseball_tasks')
    .select('id, title, due_date, status')
    .eq('team_id', teamId)
    .not('due_date', 'is', null)
    .not('status', 'in', '(completed,cancelled)')
    .limit(500);
  return ((data ?? []) as Array<{
    id: string;
    title: string;
    due_date: string | null;
    status: string;
  }>).map((t) => ({
    id: t.id,
    title: t.title,
    dueDate: t.due_date,
    status: t.status,
  }));
}

async function loadDocumentFacts(
  db: LooseClient,
  teamId: string,
): Promise<FactDocument[]> {
  const { data } = await db
    .from('baseball_documents')
    .select('category')
    .eq('team_id', teamId);
  return ((data ?? []) as Array<{ category: string | null }>).map((d) => ({
    category: d.category ?? 'general',
  }));
}

async function loadTravelFacts(
  db: LooseClient,
  teamId: string,
): Promise<FactTravel[]> {
  const { data } = await db
    .from('baseball_travel_itineraries')
    .select('id, event_name, departure_date, transportation, accommodation')
    .eq('team_id', teamId)
    .limit(200);
  return ((data ?? []) as Array<{
    id: string;
    event_name: string;
    departure_date: string | null;
    transportation: string | null;
    accommodation: string | null;
  }>).map((t) => ({
    id: t.id,
    eventName: t.event_name,
    departureDate: t.departure_date,
    transportation: t.transportation,
    accommodation: t.accommodation,
  }));
}

async function loadPlayerFacts(
  db: LooseClient,
  teamId: string,
): Promise<{ players: FactPlayer[]; expectedAttendeeCount: number }> {
  // Roster membership (status) for this team.
  const { data: members } = await db
    .from('baseball_team_members')
    .select('player_id, status')
    .eq('team_id', teamId);
  const memberRows = (members ?? []) as Array<{
    player_id: string;
    status: string | null;
  }>;
  if (memberRows.length === 0) return { players: [], expectedAttendeeCount: 0 };

  const playerIds = memberRows.map((m) => m.player_id);
  const statusByPlayer = new Map(memberRows.map((m) => [m.player_id, m.status]));

  const { data: players } = await db
    .from('baseball_players')
    .select(
      `id, first_name, last_name, has_video, recruiting_activated, ${PROFILE_FIELD_COLUMNS.join(', ')}`,
    )
    .in('id', playerIds);
  const playerRows = (players ?? []) as Array<Record<string, unknown>>;

  // External-id presence (one query, deduped to a set of player ids).
  const { data: extIds } = await db
    .from('baseball_player_external_ids')
    .select('player_id')
    .in('player_id', playerIds);
  const hasExtId = new Set(
    ((extIds ?? []) as Array<{ player_id: string }>).map((r) => r.player_id),
  );

  const facts: FactPlayer[] = playerRows.map((p) => {
    const id = String(p.id);
    const first = (p.first_name as string | null) ?? '';
    const last = (p.last_name as string | null) ?? '';
    const presentFields = PROFILE_FIELD_COLUMNS.filter((c) => {
      const v = p[c];
      return v !== null && v !== undefined && v !== '';
    }).length;
    return {
      id,
      fullName: `${first} ${last}`.trim() || 'Unnamed player',
      membershipStatus: statusByPlayer.get(id) ?? null,
      hasExternalId: hasExtId.has(id),
      hasProfile: true,
      profileFieldsPresent: presentFields,
      profileFieldsTotal: PROFILE_FIELD_COLUMNS.length,
      hasVideo: p.has_video === true,
      recruitingActive: p.recruiting_activated === true,
      normalizedNameKey: normalizedNameKey(first, last),
    };
  });

  const expectedAttendeeCount = memberRows.filter((m) => m.status === 'active').length;
  return { players: facts, expectedAttendeeCount };
}

async function loadGameFacts(
  db: LooseClient,
  teamId: string,
  sinceIso: string,
  nowIso: string,
): Promise<FactGame[]> {
  const sinceDate = sinceIso.slice(0, 10);
  const nowDate = nowIso.slice(0, 10);
  const { data: games } = await db
    .from('baseball_games')
    .select('id, opponent_name, game_date, status')
    .eq('team_id', teamId)
    .eq('status', 'completed')
    .gte('game_date', sinceDate)
    .lte('game_date', nowDate)
    .limit(100);
  const rows = (games ?? []) as Array<{
    id: string;
    opponent_name: string | null;
    game_date: string;
    status: string;
  }>;
  if (rows.length === 0) return [];

  const ids = rows.map((g) => g.id);

  // Official stats link to a game by (stat_type='game', session_date), NOT a
  // game_id FK — so we check whether any game-type stat row exists on the game's
  // date. (A date can in principle host a doubleheader; matching by date is the
  // honest signal the schema supports without over-claiming a per-game link.)
  const { data: stats } = await db
    .from('baseball_player_stats')
    .select('session_date')
    .eq('team_id', teamId)
    .eq('stat_type', 'game')
    .gte('session_date', sinceDate)
    .lte('session_date', nowDate);
  const statDates = new Set(
    ((stats ?? []) as Array<{ session_date: string | null }>)
      .map((r) => r.session_date)
      .filter((d): d is string => !!d),
  );

  // Postgame reviews filed for the game (this DOES carry a game_id FK).
  const { data: reviews } = await db
    .from('baseball_postgame_reviews')
    .select('game_id')
    .eq('team_id', teamId)
    .in('game_id', ids);
  const hasReview = new Set(
    ((reviews ?? []) as Array<{ game_id: string | null }>)
      .map((r) => r.game_id)
      .filter((g): g is string => !!g),
  );

  return rows.map((g) => ({
    id: g.id,
    label: g.opponent_name ? `vs ${g.opponent_name}` : `Game ${g.game_date}`,
    // Games store a date, not a timestamp; treat the game as having ended at the
    // END of game day so the grace-window math is honest (never flags same-day).
    playedAt: `${g.game_date}T23:59:59.000Z`,
    hasOfficialStats: statDates.has(g.game_date),
    hasPostgameReview: hasReview.has(g.id),
  }));
}

async function loadInactiveImportRows(
  db: LooseClient,
  teamId: string,
): Promise<FactImportRow[]> {
  // An "inactive player appears in import" needs a per-row unmatched/inactive
  // signal. The import-lineage table that stages unmatched rows is
  // baseball_stat_uploads.unmatched_data; we surface only rows the importer
  // explicitly flagged. If the column is unavailable this degrades to [].
  const { data } = await db
    .from('baseball_stat_uploads')
    .select('id, unmatched_data')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(20);
  const out: FactImportRow[] = [];
  for (const r of (data ?? []) as Array<{
    id: string;
    unmatched_data: unknown;
  }>) {
    const u = r.unmatched_data as
      | { inactivePlayers?: Array<{ label?: string; name?: string }> }
      | null
      | undefined;
    const inactive = u?.inactivePlayers;
    if (!Array.isArray(inactive)) continue;
    for (const p of inactive) {
      const label = p.label ?? p.name;
      if (label) out.push({ playerLabel: String(label), importRunId: r.id });
    }
  }
  return out;
}

/**
 * Raw counting columns selected off baseball_player_stats for OPS derivation.
 * The table stores counting stats ONLY — it has never had ops/obp/slg columns
 * in prod (selecting them 42703'd on every rule run; observed live 2026-07-11,
 * "column baseball_player_stats.ops does not exist"). Rates are derived here
 * with the same formulas as read-models/stats-center.ts finalizeBatting().
 */
const HITTING_COUNTING_COLUMNS =
  'at_bats, hits, doubles, triples, home_runs, walks, hit_by_pitch, sacrifice_flies';

interface HittingCountingRow {
  at_bats: number | null;
  hits: number | null;
  doubles: number | null;
  triples: number | null;
  home_runs: number | null;
  walks: number | null;
  hit_by_pitch: number | null;
  sacrifice_flies: number | null;
}

/**
 * Derive OPS (OBP + SLG) from raw counting stats. Returns null on a zero
 * denominator (the player row is skipped rather than fabricating a 0 that
 * would distort the average). OBP uses the standard AB+BB+HBP+SF denominator,
 * matching stats-center's finalizeBatting.
 */
function computeOPS(r: HittingCountingRow): number | null {
  const ab = r.at_bats ?? 0;
  const h = r.hits ?? 0;
  const doubles = r.doubles ?? 0;
  const triples = r.triples ?? 0;
  const hr = r.home_runs ?? 0;
  const bb = r.walks ?? 0;
  const hbp = r.hit_by_pitch ?? 0;
  const sf = r.sacrifice_flies ?? 0;

  const singles = Math.max(0, h - doubles - triples - hr);
  const totalBases = singles + 2 * doubles + 3 * triples + 4 * hr;
  const slg = ab > 0 ? totalBases / ab : null;
  const obpDen = ab + bb + hbp + sf;
  const obp = obpDen > 0 ? (h + bb + hbp) / obpDen : null;
  if (obp === null || slg === null) return null;
  // Round like stats-center's round3 so borderline cold-streak threshold
  // comparisons agree with the OPS coaches see rendered.
  return Number((obp + slg).toFixed(3));
}

/**
 * Load per-player hitting spans for the cold-streak rule. Queries recent
 * game-type rows from baseball_player_stats for the rolling "recent" window,
 * reconciles a season/career OPS baseline through the shared legacy-flat
 * adapter with a PER-FIELD legacy fallback on top (see step 2 below), then
 * groups by player and computes: recentOPS (average of last N games) and
 * seasonOPS (the reconciled baseline), tagged with seasonOPSSourceLayer so
 * the rule can label a legacy fallback honestly as a career average rather
 * than an unqualified season figure. Returns [] when the table is empty or
 * unavailable (the rule produces no signals in that case — degrades safely).
 *
 * NOT exported: this is a plain internal helper of a 'use server' module —
 * every export of a 'use server' file becomes a real, client-invokable
 * server action, and the observability-coverage contract
 * (coverage-contract.observability.test.ts) enforces that any such export is
 * wrapped (see runOperationalSignalDetection below). Regression coverage for
 * the season-baseline fix documented above exercises this function through
 * that wrapped action instead — see
 * operational-signals-cold-streak.test.ts.
 */
async function loadPlayerHittingSpans(
  db: LooseClient,
  teamId: string,
  sinceIso: string,
  nowIso: string,
): Promise<FactPlayerHittingSpan[]> {
  const sinceDate = sinceIso.slice(0, 10);
  const nowDate = nowIso.slice(0, 10);

  // 1. Recent game-type rows (per-game batting log) within the lookback window.
  //    Ordered newest-first so that slice(0, N) gives the most-recent N games.
  const { data: gameData } = await db
    .from('baseball_player_stats')
    .select(`player_id, session_date, ${HITTING_COUNTING_COLUMNS}`)
    .eq('team_id', teamId)
    .eq('stat_type', 'game')
    .gte('session_date', sinceDate)
    .lte('session_date', nowDate)
    .order('session_date', { ascending: false })
    // 1000 is PostgREST's hard cap; a larger literal reads as headroom that
    // does not exist. Worst observed 21-day window across all teams is 55
    // rows, so this bound does not bind. If it ever could, paginate with
    // fetchAllRowsResult — playerIds is derived from these rows, so a silent
    // truncation would drop whole players from the signal set.
    .limit(1000);

  const gameRows = (gameData ?? []) as Array<
    HittingCountingRow & {
      player_id: string;
      session_date: string;
    }
  >;

  if (gameRows.length === 0) return [];

  // Collect distinct player ids that appear in recent games.
  const playerIds = [...new Set(gameRows.map((r) => r.player_id))];

  // 2. Season/career OPS baseline + player names — three batched reads in
  //    parallel.
  //
  //    #379 FIX: this used to read baseball_player_stats WHERE stat_type =
  //    'season' — a value NO writer in this codebase has ever produced
  //    (imports.ts / stats.ts's uploadStatsCSV only ever write 'practice' |
  //    'game' | 'other'), so that lookup always returned [] and the
  //    cold-streak rule could never fire in production regardless of how much
  //    real stat history a team had. Fixed by sourcing the baseline through
  //    the shared legacy-flat adapter (legacy-stat-adapters.ts, #828) with the
  //    SAME precedence roster.ts already uses for the same class of gap
  //    (roster-aggregates-merge.ts): prefer the canonical, box-score-era
  //    season roll-up (baseball_player_season_stats, written by games.ts's
  //    recalculate_baseball_season_stats()) and fall back to the legacy
  //    baseball_player_aggregates row's career OPS only when no box-score-era
  //    row exists yet for that player.
  const currentSeasonYear = new Date(nowIso).getFullYear();
  const [{ data: seasonStatsData }, { data: legacyAggregatesData }, { data: playerData }] =
    await Promise.all([
      db
        .from('baseball_player_season_stats')
        .select('player_id, avg, obp, slg, ops, g, last_updated')
        .eq('team_id', teamId)
        .eq('season_year', currentSeasonYear),
      db
        .from('baseball_player_aggregates')
        .select('*')
        .eq('team_id', teamId)
        .in('player_id', playerIds),
      db
        .from('baseball_players')
        .select('id, first_name, last_name')
        .in('id', playerIds),
    ]);

  const boxScoreRows: BoxScoreGameContextRow[] = (
    (seasonStatsData ?? []) as Array<{
      player_id: string;
      avg: number | null;
      obp: number | null;
      slg: number | null;
      ops: number | null;
      g: number | null;
      last_updated: string | null;
    }>
  ).map((r) => ({
    player_id: r.player_id,
    avg: r.avg,
    obp: r.obp,
    slg: r.slg,
    ops: r.ops,
    sessions: r.g,
    last_updated: r.last_updated,
  }));

  const legacyAggregates: Record<string, BaseballPlayerAggregates> = {};
  for (const row of (legacyAggregatesData ?? []) as BaseballPlayerAggregates[]) {
    legacyAggregates[row.player_id] = row;
  }

  const adaptedByPlayer = adaptLegacyStatsMap({ legacyAggregates, boxScoreRows });

  // Build lookup maps.
  const seasonOPSByPlayer = new Map<string, number>();
  const seasonOPSSourceLayerByPlayer = new Map<string, SourceLayer>();
  for (const [playerId, adapted] of Object.entries(adaptedByPlayer)) {
    // #379 FIX: a box-score/season-stats row can exist for a player (so the
    // shared adapter's whole-row sourceLayer already reads 'box-score') while
    // its OWN ops field is null — the common shape for a pure pitcher/DH who
    // appears in a completed game's PITCHING box score but never bats
    // (recalculate_baseball_season_stats sets avg/obp/slg/ops to NULL
    // whenever plate appearances = 0 for that row). A present-but-null OPS
    // must not mask a real legacy career_ops; fall back to it PER-FIELD here,
    // matching roster-aggregates-merge.ts's toLegacyAggregateShape precedent
    // for the identical gap.
    const ops = adapted.game.ops ?? legacyAggregates[playerId]?.career_ops ?? null;
    if (ops === null) continue;
    seasonOPSByPlayer.set(playerId, ops);
    // Track WHERE this specific OPS number came from — never just the
    // whole-row adapted.sourceLayer, which would misreport 'box-score' for
    // the per-field-fallback case above. This lets the cold-streak rule
    // label a legacy LIFETIME career average honestly instead of presenting
    // it as an unqualified "season" figure (see FactPlayerHittingSpan's
    // seasonOPSSourceLayer doc and the player_cold_streak rule).
    seasonOPSSourceLayerByPlayer.set(
      playerId,
      adapted.game.ops !== null ? adapted.sourceLayer : 'legacy-fallback',
    );
  }

  const nameByPlayer = new Map<string, string>();
  for (const p of (playerData ?? []) as Array<{
    id: string;
    first_name: string | null;
    last_name: string | null;
  }>) {
    const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
    nameByPlayer.set(p.id, name || 'Unknown Player');
  }

  // 3. Group game rows by player (already newest-first) and take last N.
  const gamesByPlayer = new Map<
    string,
    Array<{ session_date: string; ops: number }>
  >();
  for (const r of gameRows) {
    const ops = computeOPS(r);
    if (ops === null) continue; // skip rows with no OPS data rather than distort average
    const arr = gamesByPlayer.get(r.player_id) ?? [];
    arr.push({ session_date: r.session_date, ops });
    gamesByPlayer.set(r.player_id, arr);
  }

  // 4. Build FactPlayerHittingSpan per player.
  const spans: FactPlayerHittingSpan[] = [];
  for (const [playerId, games] of gamesByPlayer) {
    const seasonOPS = seasonOPSByPlayer.get(playerId);
    if (seasonOPS === undefined) continue; // can't compute drop without season baseline
    // Rows are newest-first — slice to the most-recent N games.
    const recent = games.slice(0, COLD_STREAK_LOOKBACK_GAMES);
    if (recent.length === 0) continue;
    const recentOPS = recent.reduce((sum, g) => sum + g.ops, 0) / recent.length;
    const mostRecentGameDate = recent[0]!.session_date;
    spans.push({
      playerId,
      playerName: nameByPlayer.get(playerId) ?? 'Unknown Player',
      recentGameCount: recent.length,
      recentOPS,
      seasonOPS,
      seasonOPSSourceLayer: seasonOPSSourceLayerByPlayer.get(playerId) ?? 'no-data',
      mostRecentGameDate,
    });
  }

  return spans;
}

async function loadLastEngineRun(
  db: LooseClient,
  teamId: string,
): Promise<string | null> {
  const { data } = await db
    .from('baseball_coach_insights')
    .select('created_at')
    .eq('team_id', teamId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as { created_at: string } | null)?.created_at ?? null;
}

// =============================================================================
// RuleSignal → BaseballSignalInsert (mechanical, total)
// =============================================================================

function ruleSignalToInsert(
  s: RuleSignal,
  teamId: string,
  userId: string,
  expiresAt: string,
): BaseballSignalInsert {
  return {
    team_id: teamId,
    player_id: s.playerId,
    event_id: s.eventId,
    signal_type: s.signalType,
    category: s.category,
    severity: s.severity,
    title: s.title,
    why_it_matters: s.whyItMatters,
    evidence: s.evidence,
    source_refs: s.sourceRefs as unknown as BaseballJson,
    confidence: normalizeConfidence(s.confidence),
    sample_n: null,
    recommended_action_label: s.recommendedActionLabel,
    recommended_action_type: s.recommendedActionType,
    recommended_owner_role: s.recommendedOwnerRole,
    disposition: s.sampleTooSmall ? 'sample_too_small' : 'new',
    visibility: s.visibility,
    generated_by: `rule:${s.ruleId}`,
    source_kind: 'system',
    dedupe_key: s.dedupeKey,
    expires_at: expiresAt,
    created_by: userId,
  };
}

// =============================================================================
// THE SCHEDULED EVALUATOR (server action)
// =============================================================================

/**
 * Run the operational rule engine for the active team and surface its signals
 * into the Signal Inbox. Loads one facts snapshot, runs the pure engine, UPSERTs
 * each signal by (team_id, dedupe_key), then auto-resolves open rule signals
 * whose condition no longer holds. Non-destructive throughout.
 */
export const runOperationalSignalDetection = withBaseballAction(
  'runOperationalSignalDetection',
  { featureArea: 'baseball-signals', requiredCapability: 'can_manage_stats' },
  async (
    ctx,
    input?: { config?: Partial<RuleEngineConfig> },
  ): Promise<OperationalSignalsResult> => {
    const supabase = await createClient();
    const db = supabase as unknown as LooseClient;
    const teamId = ctx.targetTeamId;

    const now = new Date();
    const nowIso = now.toISOString();
    const horizonIso = new Date(now.getTime() + HORIZON_DAYS * 86400000).toISOString();
    const sinceIso = new Date(now.getTime() - GAME_LOOKBACK_DAYS * 86400000).toISOString();

    // 1. LOAD FACTS (independent reads; each degrades to [] on empty source).
    const [
      upcomingEvents,
      practices,
      tasks,
      documents,
      travel,
      { players, expectedAttendeeCount },
      recentGames,
      inactiveImportRows,
      lastGeneratedAt,
      playerHittingSpans,
    ] = await Promise.all([
      loadEventFacts(db, teamId, nowIso, horizonIso),
      loadPracticeFacts(db, teamId),
      loadTaskFacts(db, teamId),
      loadDocumentFacts(db, teamId),
      loadTravelFacts(db, teamId),
      loadPlayerFacts(db, teamId),
      loadGameFacts(db, teamId, sinceIso, nowIso),
      loadInactiveImportRows(db, teamId),
      loadLastEngineRun(db, teamId),
      loadPlayerHittingSpans(db, teamId, sinceIso, nowIso),
    ]);

    // Program settings drive the data-driven thresholds (the spec's intent that
    // rules be configurable): the required-document checklist and the AI-stale
    // window both come from baseball_program_settings when present. A missing
    // table/column degrades to safe defaults (empty checklist / engine default).
    const programSettings = await loadProgramSettings(db, teamId);
    const requiredDocumentCategories = programSettings.requiredDocumentCategories;

    const facts: OperationalRuleFacts = {
      upcomingEvents,
      expectedAttendeeCount,
      practices,
      tasks,
      documents,
      travel,
      players,
      recentGames,
      inactiveImportRows,
      requiredDocumentCategories,
      ai: { lastGeneratedAt },
      playerHittingSpans,
      nowIso,
    };

    // 2. RUN THE PURE ENGINE. Program settings override the AI-stale window so a
    //    program that sets ai_stale_after_days controls the 'ai_output_stale'
    //    rule (caller-supplied config still wins for tests / overrides).
    const mergedConfig: Partial<RuleEngineConfig> = {
      ...(programSettings.aiStaleAfterDays != null
        ? { aiStaleHours: programSettings.aiStaleAfterDays * 24 }
        : {}),
      ...input?.config,
    };
    const { signals, emittedKeys, byRule } = runOperationalRuleEngine(
      facts,
      mergedConfig,
    );

    // 3. UPSERT signals by (team_id, dedupe_key). One batched upsert; the
    //    IMMEDIATE unique constraint uq_baseball_signal_dedupe (team_id,
    //    dedupe_key) is the ON CONFLICT arbiter, so a re-emitted finding updates
    //    (re-opens) its existing row rather than duplicating.
    const expiresAt = new Date(
      now.getTime() + OPERATIONAL_SIGNAL_TTL_DAYS * 86400000,
    ).toISOString();
    let emitted = 0;
    if (signals.length > 0) {
      const rows = signals.map((s) =>
        ruleSignalToInsert(s, teamId, ctx.user.id, expiresAt),
      );
      const { error: upsertErr } = await db
        .from('baseball_signals')
        .upsert(rows, { onConflict: 'team_id,dedupe_key', ignoreDuplicates: false });
      // Surface the failure instead of silently reporting success — a swallowed
      // upsert error here is exactly why the Signal Inbox sat empty in prod.
      //
      // But surfacing it to the COACH is only half the job: `upsertErr` used to
      // be dropped on the floor here, so the three production incidents (last
      // 2026-07-11) carried nothing but this sentence. An operator could not
      // tell a constraint violation from an RLS denial from a statement
      // timeout, and no repro was possible. Log the cause; the returned copy
      // stays deliberately generic (it is user-facing) and count-free, so all
      // occurrences still collapse into one incident group.
      if (upsertErr) {
        await logServerError(
          `runOperationalSignalDetection: signal upsert failed: ${describeError(upsertErr)}`,
          {
            action: 'runOperationalSignalDetection',
            source: 'server_action',
            sport: 'baseball',
            featureArea: 'signals',
            extra: describeWriteFailure(upsertErr, { teamId, rowCount: rows.length }),
          },
        );
        return { success: false, error: 'Could not save operational signals.' };
      }
      emitted = rows.length;
    }

    // 4. RECONCILE: auto-resolve open, untriaged rule signals not re-emitted this
    //    run (the condition cleared). Never delete; never touch a coach-triaged
    //    row (only 'new'/'sample_too_small'). Scope to source_kind:'system' AND a
    //    rule generator so we never resolve an AI signal or a class-conflict one.
    let resolved = 0;
    const { data: openRows } = await db
      .from('baseball_signals')
      .select('id, dedupe_key, generated_by')
      .eq('team_id', teamId)
      .eq('source_kind', 'system')
      .in('disposition', ['new', 'sample_too_small']);
    const staleIds = ((openRows ?? []) as Array<{
      id: string;
      dedupe_key: string | null;
      generated_by: string | null;
    }>)
      .filter(
        (r) =>
          (r.generated_by ?? '').startsWith('rule:') &&
          !!r.dedupe_key &&
          !emittedKeys.has(r.dedupe_key),
      )
      .map((r) => r.id);
    if (staleIds.length > 0) {
      const { error: resolveErr } = await db
        .from('baseball_signals')
        .update({ disposition: 'resolved', resolved_at: nowIso, updated_at: nowIso })
        .in('id', staleIds)
        .eq('team_id', teamId);
      if (!resolveErr) resolved = staleIds.length;
    }

    revalidatePath(SIGNALS_PATH);
    revalidatePath(COMMAND_PATH);

    return { success: true, stats: { emitted, resolved, byRule } };
  },
);

interface LoadedProgramSettings {
  requiredDocumentCategories: string[];
  /** null when the column/table is absent → engine default applies. */
  aiStaleAfterDays: number | null;
}

/**
 * Read the program-settings row that makes the rule engine configurable: the
 * required-document checklist and the AI-stale window. Isolated + try/catch so a
 * missing column/table never breaks the run (the affected rules degrade to safe
 * defaults — empty checklist / engine default stale window).
 */
async function loadProgramSettings(
  db: LooseClient,
  teamId: string,
): Promise<LoadedProgramSettings> {
  try {
    const { data } = await db
      .from('baseball_program_settings')
      .select('required_document_categories, ai_stale_after_days')
      .eq('team_id', teamId)
      .maybeSingle();
    const row = data as {
      required_document_categories?: unknown;
      ai_stale_after_days?: unknown;
    } | null;
    const cats = row?.required_document_categories;
    const days = row?.ai_stale_after_days;
    return {
      requiredDocumentCategories: Array.isArray(cats)
        ? cats.filter((x): x is string => typeof x === 'string')
        : [],
      aiStaleAfterDays: typeof days === 'number' && days > 0 ? days : null,
    };
  } catch {
    return { requiredDocumentCategories: [], aiStaleAfterDays: null };
  }
}

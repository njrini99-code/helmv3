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
import {
  runOperationalRuleEngine,
  normalizedNameKey,
  type OperationalRuleFacts,
  type FactEvent,
  type FactPractice,
  type FactTask,
  type FactDocument,
  type FactTravel,
  type FactPlayer,
  type FactGame,
  type FactImportRow,
  type RuleSignal,
  type RuleEngineConfig,
} from '@/lib/baseball/operational-rule-engine';
import type {
  BaseballSignalInsert,
  BaseballJson,
} from '@/lib/types/baseball-signals';

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
  const { data: events } = await db
    .from('baseball_events')
    .select('id, title, event_type, start_time, is_mandatory')
    .eq('team_id', teamId)
    .eq('is_mandatory', true)
    .gte('start_time', nowIso)
    .lte('start_time', horizonIso);
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
  const { data: acks } = await db
    .from('baseball_event_acknowledgements')
    .select('event_id, user_id')
    .in('event_id', ids);
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
    disposition: 'new',
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

    // 3. UPSERT signals by (team_id, dedupe_key). One batched upsert; the partial
    //    unique index baseball_signals_dedupe_open_uidx keeps re-runs in place.
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
      if (!upsertErr) emitted = rows.length;
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

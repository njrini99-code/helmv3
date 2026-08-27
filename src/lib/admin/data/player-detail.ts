import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { INCIDENT_SEVERITIES } from '@/lib/admin/severity';
import { excludeAuthNoise } from '@/lib/admin/data/triage';
import {
  classifyInProgressActivity,
  STUCK_HOURS_THRESHOLD,
  STUCK_TIER_MAX_IDLE_HOURS,
} from '@/lib/golf/tracer-round-activity';
import { logServerError } from '@/lib/server-error-logger';
import { describeError } from '@/lib/utils/describe-error';

/**
 * Golf Player Detail — the single-player counterpart to `team-detail.ts`.
 *
 * A player's own directory row (`/admin/users/[id]`) answers "who is this
 * account and what teams are they on" cross-sport. This answers the
 * golf-specific question an operator actually opens the page to ask: is
 * this player's round history healthy, is anything of theirs stuck
 * mid-save, are they current on their qualifier obligations, and are they
 * throwing errors. Deliberately a SEPARATE fetch (mirrors EngagementPanel's
 * "touches nothing else on that page" pattern) — `fetchUserDetail` in
 * `users.ts` is read-only from here, never modified or duplicated.
 *
 * FAIL-SOFT BY SECTION, same contract as `fetchTeamDetail`: identity is
 * fetched first — a real "not a golf player" (no `golf_players` row) short-
 * circuits the whole result. Every section AFTER that is independently
 * try/caught; a broken query degrades that section to its empty value
 * instead of taking down the panel, and its name lands in `degraded` so the
 * UI can render "unknown", never a confident zero (Bridge honesty rule:
 * never render "no data" and "could not read the data" as the same state).
 *
 * SCHEMA VERIFIED against src/lib/types/database.ts (2026-08-26):
 *   - `golf_rounds.status` carries exactly three values in this codebase's
 *     own usage (`admin-tracer-data.ts`): 'completed' | 'in_progress' |
 *     'draft'. There is no stored 'abandoned' status — "abandoned" is a
 *     DERIVED idle-time tier over an 'in_progress' (or, here, 'draft') row,
 *     computed the same way the Tracer's stuck-round detector does (see
 *     `classifyPlayerRoundTier` below, which wraps the SAME
 *     `classifyInProgressActivity` the Tracer uses — one idle-time
 *     definition, not a second one drifting independently).
 *   - `golf_qualifier_entries` has NO `round_numbers_used` column — "which
 *     round numbers has this player used, and which are missing" is derived
 *     here from the player's own `golf_rounds` rows
 *     (`qualifier_id` + `qualifier_round_number`), already fetched for the
 *     round-history section, not a second query.
 *   - The flight-trace link is resolved via the SAME
 *     `public.helm_debug_list_traces(p_limit, p_workflow, p_round_id)` RPC
 *     `bridgeListFlightTraces`/`bridgeGetFlightTrace` use
 *     (`src/app/admin/actions/golf-tracer.ts`, not imported here — that file
 *     is outside this module's ownership) — bounded to a small, explicit
 *     candidate set (`buildTraceCandidateRoundIds`), never a per-player fan-
 *     out over every round this player has ever logged.
 */

const PLAYER_ROUNDS_LIMIT = 500;
const PLAYER_QUALIFIER_ENTRIES_LIMIT = 100;
const PLAYER_ERRORS_LIMIT = 50;
const RECENT_ROUNDS_DISPLAY_LIMIT = 15;
/** How many round ids this player-detail fetch will ask the (service-role-
 *  only) flight-trace RPC about, per load. Bounded on purpose — "never fetch
 *  all shots for a player" applies equally to "never probe the trace store
 *  for every round a player has ever played." The candidates are chosen for
 *  actionability (every non-terminal round, plus the single most recent
 *  round), not recency alone — see `buildTraceCandidateRoundIds`. */
const TRACE_CANDIDATE_LIMIT = 8;

// ─────────────────────────────────────────────────────────────────────────
// Pure, unit-tested derived logic
// ─────────────────────────────────────────────────────────────────────────

export type PlayerRoundTier = 'in_progress' | 'stuck' | 'abandoned' | 'stale';

/** Loudest first: a genuinely stuck round outranks one merely idle a long
 *  time ago, which outranks one so old it fell out of the Tracer's own 30-
 *  day "recent activity" window, which outranks one that's simply mid-play. */
const TIER_URGENCY_RANK: Record<PlayerRoundTier, number> = {
  stuck: 0,
  abandoned: 1,
  stale: 2,
  in_progress: 3,
};

/**
 * Classifies ONE non-terminal round ('in_progress' or 'draft' — callers
 * filter to those statuses before calling this) by how long it has sat
 * idle. Delegates the actual 1h/24h boundaries to
 * `classifyInProgressActivity` (`@/lib/golf/tracer-round-activity`) — the
 * SAME function the Tracer's stuck-round detector uses — so this page can
 * never quietly define "stuck" differently than the Tracer does.
 *
 * That shared classifier returns `null` for a round idle more than 30 days
 * (out of scope for a "recent activity feed," which is what it was built
 * for). A player-level view has no such excuse to look away — a round
 * abandoned three months ago is still the single most actionable fact about
 * this player, so it gets its own tier here ('stale') rather than vanishing.
 */
export function classifyPlayerRoundTier(
  updatedAt: string | null,
  now: number = Date.now(),
): PlayerRoundTier {
  if (!updatedAt) return 'stale';
  const classification = classifyInProgressActivity(updatedAt, now);
  if (classification === 'round_in_progress') return 'in_progress';
  if (classification === 'round_stuck') return 'stuck';
  if (classification === 'round_abandoned') return 'abandoned';
  return 'stale';
}

/** Real elapsed idle time in hours — null when there's no timestamp to
 *  measure from, never a fabricated 0. */
export function computeHoursIdle(updatedAt: string | null, now: number = Date.now()): number | null {
  if (!updatedAt) return null;
  const t = new Date(updatedAt).getTime();
  if (Number.isNaN(t)) return null;
  return (now - t) / (1000 * 60 * 60);
}

/** Most-urgent-first, ties broken by longest idle. Pure so the ordering can
 *  be verified without a round of live data. */
export function sortPlayerRoundsByUrgency<T extends { tier: PlayerRoundTier; hoursIdle: number | null }>(
  rounds: readonly T[],
): T[] {
  return [...rounds].sort((a, b) => {
    if (a.tier !== b.tier) return TIER_URGENCY_RANK[a.tier] - TIER_URGENCY_RANK[b.tier];
    return (b.hoursIdle ?? 0) - (a.hoursIdle ?? 0);
  });
}

export interface PlayerRoundLike {
  status: string | null;
  total_score: number | null;
  created_at: string | null;
}

export interface PlayerRoundsAggregate {
  completed: number;
  nonTerminal: number;
  /** Mean `total_score` across completed rounds carrying one — null (not 0)
   *  when no completed round has a recorded score, so an honest "no data
   *  yet" never reads as "averaging zero." */
  averageScore: number | null;
  lastRoundAt: string | null;
}

/** Pure aggregation over an already-fetched, already player-scoped page of
 *  rounds. Never sums/averages across MORE than what was actually fetched —
 *  the caller is responsible for noting when that page was capped (see
 *  `PlayerRoundsSummary.truncated`). */
export function summarizePlayerRounds(rounds: readonly PlayerRoundLike[]): PlayerRoundsAggregate {
  let completed = 0;
  let nonTerminal = 0;
  let scoreSum = 0;
  let scoreCount = 0;
  let lastRoundAt: string | null = null;
  for (const r of rounds) {
    if (r.status === 'completed') {
      completed += 1;
      if (typeof r.total_score === 'number' && Number.isFinite(r.total_score)) {
        scoreSum += r.total_score;
        scoreCount += 1;
      }
    } else if (r.status === 'in_progress' || r.status === 'draft') {
      nonTerminal += 1;
    }
    if (r.created_at && (!lastRoundAt || r.created_at > lastRoundAt)) lastRoundAt = r.created_at;
  }
  return {
    completed,
    nonTerminal,
    averageScore: scoreCount > 0 ? scoreSum / scoreCount : null,
    lastRoundAt,
  };
}

/**
 * Which of a qualifier's 1..numRounds round slots this player has actually
 * used, and which are missing — the "any gaps" fact from the task brief.
 * Pure over an already-fetched list of `qualifier_round_number` values (the
 * caller derives that list from the player's own `golf_rounds` rows already
 * fetched for the round-history section — no second query).
 */
export function computeQualifierRoundGaps(
  numRounds: number,
  roundNumbers: readonly (number | null | undefined)[],
): { used: number[]; missing: number[] } {
  const used = Array.from(
    new Set(roundNumbers.filter((n): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0)),
  ).sort((a, b) => a - b);
  const usedSet = new Set(used);
  const missing: number[] = [];
  for (let i = 1; i <= numRounds; i += 1) {
    if (!usedSet.has(i)) missing.push(i);
  }
  return { used, missing };
}

/**
 * Bounded candidate list for the flight-trace existence check: every non-
 * terminal round (the actionable ones — a stuck round's trace is the whole
 * reason the flight recorder exists) plus the single most recent round
 * overall (so a healthy player still gets a trace link on their latest
 * round when one was recorded), deduplicated and capped at `limit`.
 *
 * This is the ONLY thing that decides which round ids get probed against
 * the trace store — kept pure and separate from the RPC call itself so the
 * bound is testable without a live Supabase client.
 */
export function buildTraceCandidateRoundIds(
  input: { nonTerminalRoundIds: readonly string[]; mostRecentRoundId: string | null },
  limit: number = TRACE_CANDIDATE_LIMIT,
): string[] {
  const ids: string[] = [];
  const seen = new Set<string>();
  for (const id of input.nonTerminalRoundIds) {
    if (seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
    if (ids.length >= limit) return ids;
  }
  if (input.mostRecentRoundId && !seen.has(input.mostRecentRoundId) && ids.length < limit) {
    ids.push(input.mostRecentRoundId);
  }
  return ids.slice(0, limit);
}

export type ProfileQuality = 'complete' | 'partial' | 'missing';

/** Mirrors the `profileQuality` bucketing `fetchUsersTab` already computes
 *  for the roster tables (users.ts) — re-derived here rather than imported
 *  because that logic isn't exported there, but the RULE is identical:
 *  onboarding/profile flags win outright; otherwise any identifying field
 *  present counts as partial; nothing at all is 'missing'. */
export function classifyProfileQuality(player: {
  onboardingCompleted: boolean | null;
  profileComplete: boolean | null;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
}): ProfileQuality {
  if (player.onboardingCompleted === true || player.profileComplete === true) return 'complete';
  if (player.email || player.firstName || player.lastName) return 'partial';
  return 'missing';
}

function displayName(player: { first_name: string | null; last_name: string | null; email: string | null }): string {
  return `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim() || player.email || 'Unnamed player';
}

// ─────────────────────────────────────────────────────────────────────────
// Row / result shapes
// ─────────────────────────────────────────────────────────────────────────

interface GolfPlayerIdentityRow {
  id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  graduation_year: number | null;
  handicap_index: number | null;
  onboarding_completed: boolean | null;
  profile_complete: boolean | null;
  created_at: string | null;
}

interface RoundRow {
  id: string;
  status: string | null;
  round_date: string | null;
  created_at: string | null;
  updated_at: string | null;
  course_name: string | null;
  total_score: number | null;
  score_to_par: number | null;
  current_hole: number | null;
  holes_played: number | null;
  qualifier_id: string | null;
  qualifier_round_number: number | null;
}

interface QualifierEntryRow {
  qualifier_id: string;
  status: string | null;
  position: number | null;
  total_to_par: number | null;
  rounds_completed: number | null;
  golf_qualifiers: { name: string; num_rounds: number; status: string | null } | null;
}

export interface PlayerIdentity {
  playerId: string;
  userId: string;
  name: string;
  email: string | null;
  createdAt: string | null;
  /** Null when unreachable (identity section degraded) as well as when the
   *  account has genuinely never signed in — the `degraded` array is what
   *  distinguishes the two; the UI must consult it before saying "never". */
  lastSeen: string | null;
  graduationYear: number | null;
  handicapIndex: number | null;
  profileQuality: ProfileQuality;
  team: { id: string; name: string } | null;
}

export interface PlayerRoundView {
  id: string;
  status: string;
  roundDate: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  courseName: string | null;
  totalScore: number | null;
  scoreToPar: number | null;
  currentHole: number | null;
  holesPlayed: number | null;
  qualifierId: string | null;
  qualifierRoundNumber: number | null;
}

export interface PlayerStuckRoundView extends PlayerRoundView {
  tier: PlayerRoundTier;
  hoursIdle: number | null;
  /** `/admin/golf/tracer?trace=<id>` — present ONLY when a trace was
   *  actually found for this round (see module doc); never a guessed or
   *  always-on link. */
  traceHref: string | null;
}

export interface PlayerRoundsSummary {
  /** Rows actually fetched this load (bounded by PLAYER_ROUNDS_LIMIT). */
  fetchedCount: number;
  /** True platform count for this player, independent of the cap — null
   *  when that count query itself failed (see `degraded`). */
  totalCount: number | null;
  /** True when `totalCount` exceeds `fetchedCount` — every aggregate below
   *  (`completed`, `nonTerminal`, `averageScore`, `lastRoundAt`) is computed
   *  ONLY over the fetched page and should be presented as a lower
   *  bound/recent-window figure, not the player's full career total. */
  truncated: boolean;
  completed: number;
  nonTerminal: number;
  averageScore: number | null;
  lastRoundAt: string | null;
}

export interface PlayerQualifierView {
  qualifierId: string;
  qualifierName: string;
  qualifierStatus: string | null;
  numRounds: number;
  entryStatus: string | null;
  position: number | null;
  totalToPar: number | null;
  /** Denormalized `golf_qualifier_entries.rounds_completed` field, shown
   *  alongside (not instead of) the independently-derived `roundNumbersUsed`
   *  below — the two SHOULD agree; when they don't, that disagreement is
   *  itself worth an operator's attention, not silently reconciled here. */
  roundsCompletedField: number | null;
  roundNumbersUsed: number[];
  missingRoundNumbers: number[];
}

export interface PlayerErrorEvent {
  id: string;
  title: string;
  severity: string;
  createdAt: string;
  fingerprint: string | null;
}

export interface PlayerErrorsSummary {
  /** Exact 7d count (INCIDENT_SEVERITIES, unresolved, rca_analysis excluded
   *  via the event_type='error' filter) — null when the count query failed,
   *  never coerced to 0. */
  count7d: number | null;
  recent: PlayerErrorEvent[];
}

export interface PlayerDetailResult {
  player: PlayerIdentity | null;
  recentRounds: PlayerRoundView[];
  /** Every non-terminal ('in_progress' | 'draft') round from the fetched
   *  window, most-urgent-first. This is the "single most actionable player-
   *  level fact" the task brief calls out — never truncated separately from
   *  `recentRounds` (a stuck round outside the top 15 recent rounds must
   *  still show up here). */
  stuckRounds: PlayerStuckRoundView[];
  roundsSummary: PlayerRoundsSummary;
  qualifiers: PlayerQualifierView[];
  errors: PlayerErrorsSummary;
  /** Flight-trace link for the single most recent round, when one exists —
   *  independent of whether that round is stuck (a healthy player's last
   *  completed round can still have a trace worth inspecting). */
  mostRecentRoundTraceHref: string | null;
  /**
   * Sections that failed to load this request ('identity' | 'rounds' |
   * 'traces' | 'qualifiers' | 'errors'). Every section above degrades to its
   * empty/null value on failure so the panel still renders — but empty and
   * unavailable then look identical, which is exactly the state the Bridge
   * honesty rules forbid. Always present, usually empty.
   */
  degraded: string[];
}

const EMPTY_ROUNDS_SUMMARY: PlayerRoundsSummary = {
  fetchedCount: 0,
  totalCount: null,
  truncated: false,
  completed: 0,
  nonTerminal: 0,
  averageScore: null,
  lastRoundAt: null,
};

function toRoundView(r: RoundRow): PlayerRoundView {
  return {
    id: r.id,
    status: r.status ?? 'unknown',
    roundDate: r.round_date,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
    courseName: r.course_name,
    totalScore: r.total_score,
    scoreToPar: r.score_to_par,
    currentHole: r.current_hole,
    holesPlayed: r.holes_played,
    qualifierId: r.qualifier_id,
    qualifierRoundNumber: r.qualifier_round_number,
  };
}

// Minimal structural type for the one RPC call this module makes — mirrors
// the same narrow shape `src/app/admin/actions/golf-tracer.ts` defines
// locally for the identical RPC (that file is outside this module's
// ownership, so the type is re-declared here rather than imported).
type TraceRpcClient = {
  rpc(
    name: string,
    args: Record<string, unknown>,
  ): Promise<{ data: unknown; error: { code?: string; message: string } | null }>;
};

/**
 * Resolves a Tracer deep link for each candidate round id, ONE bounded RPC
 * call per id (never a per-player fan-out — `buildTraceCandidateRoundIds`
 * already capped the candidate set before this is called). A round with no
 * recorded trace is simply absent from the returned map — callers must
 * treat "not in the map" as "no link", never render a dead one.
 */
async function resolveTraceHrefsForRounds(
  admin: ReturnType<typeof createAdminClient>,
  roundIds: readonly string[],
): Promise<Map<string, string>> {
  const rpcClient = admin as unknown as TraceRpcClient;
  const entries = await Promise.all(
    roundIds.map(async (roundId) => {
      const { data, error } = await rpcClient.rpc('helm_debug_list_traces', {
        p_limit: 1,
        p_workflow: null,
        p_round_id: roundId,
      });
      if (error) throw new Error(`helm_debug_list_traces(${roundId}): ${error.message}`);
      const rows = Array.isArray(data) ? (data as Array<{ trace_id?: unknown }>) : [];
      const traceId = typeof rows[0]?.trace_id === 'string' ? rows[0].trace_id : null;
      return [roundId, traceId] as const;
    }),
  );
  const map = new Map<string, string>();
  for (const [roundId, traceId] of entries) {
    if (traceId) map.set(roundId, `/admin/golf/tracer?trace=${encodeURIComponent(traceId)}`);
  }
  return map;
}

/**
 * CALLER must have passed requireSuperAdmin(). `userId` is `users.id` (the
 * same id `/admin/users/[id]` already routes on) — resolved to a
 * `golf_players` row internally so this panel can be mounted straight from
 * the existing user detail page without a second id scheme.
 */
export async function fetchPlayerDetail(userId: string): Promise<PlayerDetailResult> {
  const admin = createAdminClient();

  const { data: playerRow, error: playerError } = await admin
    .from('golf_players')
    .select(
      'id, user_id, first_name, last_name, email, graduation_year, handicap_index, onboarding_completed, profile_complete, created_at',
    )
    .eq('user_id', userId)
    .maybeSingle();
  if (playerError) throw new Error(`fetchPlayerDetail: golf_players: ${playerError.message}`);

  if (!playerRow) {
    return {
      player: null,
      recentRounds: [],
      stuckRounds: [],
      roundsSummary: EMPTY_ROUNDS_SUMMARY,
      qualifiers: [],
      errors: { count7d: null, recent: [] },
      mostRecentRoundTraceHref: null,
      degraded: [],
    };
  }

  const player = playerRow as GolfPlayerIdentityRow;
  const playerId = player.id;
  const degraded: string[] = [];
  const degradedDetail: string[] = [];

  // ── identity extras: active team + last sign-in ──────────────────────
  let team: { id: string; name: string } | null = null;
  let lastSeen: string | null = null;
  try {
    const [teamRes, userRes] = await Promise.all([
      admin
        .from('golf_team_members')
        .select('team_id, golf_teams(name)')
        .eq('player_id', playerId)
        .eq('status', 'active')
        .limit(5),
      admin.from('users').select('last_seen').eq('id', userId).maybeSingle(),
    ]);
    if (teamRes.error) throw new Error(teamRes.error.message);
    if (userRes.error) throw new Error(userRes.error.message);
    const teamRows = (teamRes.data ?? []) as Array<{ team_id: string | null; golf_teams: { name: string } | null }>;
    const first = teamRows.find((t) => t.team_id);
    team = first?.team_id ? { id: first.team_id, name: first.golf_teams?.name ?? 'unknown' } : null;
    lastSeen = (userRes.data as { last_seen: string | null } | null)?.last_seen ?? null;
  } catch (sectionError) {
    degraded.push('identity');
    degradedDetail.push(`identity: ${describeError(sectionError)}`);
  }

  // ── round history (bounded page + independent true count) ────────────
  let rounds: RoundRow[] = [];
  let totalRoundsCount: number | null = null;
  try {
    const [countRes, roundsRes] = await Promise.all([
      admin.from('golf_rounds').select('id', { count: 'exact', head: true }).eq('player_id', playerId),
      admin
        .from('golf_rounds')
        .select(
          'id, status, round_date, created_at, updated_at, course_name, total_score, score_to_par, current_hole, holes_played, qualifier_id, qualifier_round_number',
        )
        .eq('player_id', playerId)
        .order('created_at', { ascending: false })
        .limit(PLAYER_ROUNDS_LIMIT),
    ]);
    if (countRes.error) throw new Error(countRes.error.message);
    if (roundsRes.error) throw new Error(roundsRes.error.message);
    totalRoundsCount = countRes.count ?? null;
    rounds = (roundsRes.data ?? []) as RoundRow[];
  } catch (sectionError) {
    degraded.push('rounds');
    degradedDetail.push(`rounds: ${describeError(sectionError)}`);
    rounds = [];
    totalRoundsCount = null;
  }

  const aggregate = summarizePlayerRounds(rounds);
  const fetchedCount = rounds.length;
  const roundsSummary: PlayerRoundsSummary = {
    fetchedCount,
    totalCount: totalRoundsCount,
    truncated: totalRoundsCount !== null && totalRoundsCount > fetchedCount,
    completed: aggregate.completed,
    nonTerminal: aggregate.nonTerminal,
    averageScore: aggregate.averageScore,
    lastRoundAt: aggregate.lastRoundAt,
  };

  const now = Date.now();
  const stuckRoundsUnlinked = sortPlayerRoundsByUrgency(
    rounds
      .filter((r) => r.status === 'in_progress' || r.status === 'draft')
      .map((r) => ({
        ...toRoundView(r),
        tier: classifyPlayerRoundTier(r.updated_at, now),
        hoursIdle: computeHoursIdle(r.updated_at, now),
      })),
  );
  const recentRounds = rounds.slice(0, RECENT_ROUNDS_DISPLAY_LIMIT).map(toRoundView);
  const mostRecentRoundId = rounds[0]?.id ?? null;

  // ── flight-trace links (bounded candidate set — see module doc) ──────
  let stuckRounds: PlayerStuckRoundView[] = stuckRoundsUnlinked.map((r) => ({ ...r, traceHref: null }));
  let mostRecentRoundTraceHref: string | null = null;
  try {
    const candidateIds = buildTraceCandidateRoundIds(
      { nonTerminalRoundIds: stuckRoundsUnlinked.map((r) => r.id), mostRecentRoundId },
      TRACE_CANDIDATE_LIMIT,
    );
    if (candidateIds.length > 0) {
      const traceHrefs = await resolveTraceHrefsForRounds(admin, candidateIds);
      stuckRounds = stuckRoundsUnlinked.map((r) => ({ ...r, traceHref: traceHrefs.get(r.id) ?? null }));
      if (mostRecentRoundId) mostRecentRoundTraceHref = traceHrefs.get(mostRecentRoundId) ?? null;
    }
    // Underscore-prefixed because it is deliberately unread: the reason this
    // block does not report the error is the whole point of the note below,
    // and `degraded` — not a log line — is what carries the fact upward.
  } catch (_sectionError) {
    // Not fatal to the panel, and NOT the same as "no trace exists" — the
    // trace store itself may be unreachable (unmigrated environment, RPC
    // timeout). Degrade this section only; every round keeps traceHref:
    // null, which the UI must render as "no link", never as a broken one.
    //
    // Deliberately NOT added to `degradedDetail` (the list that triggers
    // logServerError below): `public.helm_debug_list_traces` does not exist
    // in production today (see traces/page.tsx's own loadTraces() comment,
    // which treats this identical failure as an expected environment fact,
    // not an incident) — every golf player detail view would otherwise
    // write a fresh admin_events row on every single load, in the one
    // environment this panel matters most in. `degraded` still carries
    // 'traces' so the UI never claims "no trace" when it actually means
    // "couldn't check."
    degraded.push('traces');
  }

  // ── qualifier participation + round-number gaps ───────────────────────
  let qualifiers: PlayerQualifierView[] = [];
  try {
    const { data, error } = await admin
      .from('golf_qualifier_entries')
      .select('qualifier_id, status, position, total_to_par, rounds_completed, golf_qualifiers(name, num_rounds, status)')
      .eq('player_id', playerId)
      .order('created_at', { ascending: false })
      .limit(PLAYER_QUALIFIER_ENTRIES_LIMIT);
    if (error) throw new Error(error.message);
    const entryRows = (data ?? []) as unknown as QualifierEntryRow[];

    // Round numbers used per qualifier, derived from the SAME rounds page
    // already fetched above — no second golf_rounds query.
    const roundNumbersByQualifier = new Map<string, number[]>();
    for (const r of rounds) {
      if (!r.qualifier_id) continue;
      const list = roundNumbersByQualifier.get(r.qualifier_id) ?? [];
      if (typeof r.qualifier_round_number === 'number') list.push(r.qualifier_round_number);
      roundNumbersByQualifier.set(r.qualifier_id, list);
    }

    qualifiers = entryRows
      .filter((e): e is QualifierEntryRow & { golf_qualifiers: NonNullable<QualifierEntryRow['golf_qualifiers']> } =>
        Boolean(e.golf_qualifiers),
      )
      .map((e) => {
        const numRounds = e.golf_qualifiers.num_rounds;
        const { used, missing } = computeQualifierRoundGaps(numRounds, roundNumbersByQualifier.get(e.qualifier_id) ?? []);
        return {
          qualifierId: e.qualifier_id,
          qualifierName: e.golf_qualifiers.name,
          qualifierStatus: e.golf_qualifiers.status,
          numRounds,
          entryStatus: e.status,
          position: e.position,
          totalToPar: e.total_to_par,
          roundsCompletedField: e.rounds_completed,
          roundNumbersUsed: used,
          missingRoundNumbers: missing,
        };
      });
  } catch (sectionError) {
    degraded.push('qualifiers');
    degradedDetail.push(`qualifiers: ${describeError(sectionError)}`);
    qualifiers = [];
  }

  // ── errors attributed to this player, last 7 days ─────────────────────
  let errors: PlayerErrorsSummary = { count7d: null, recent: [] };
  try {
    const ago7d = new Date(Date.now() - 7 * 86400_000).toISOString();
    // event_type='error' already excludes 'rca_analysis' rows (a stored
    // analysis of an incident, never itself an occurrence) without a
    // separate .neq — the two values can't both match one .eq filter.
    // resolved=false + INCIDENT_SEVERITIES matches the same convention
    // team-detail.ts / errors.ts use for "is this a live, actionable error".
    const countQuery = excludeAuthNoise(
      admin
        .from('admin_events')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .eq('event_type', 'error')
        .in('severity', INCIDENT_SEVERITIES)
        .eq('resolved', false)
        .gte('created_at', ago7d),
    );
    const recentQuery = excludeAuthNoise(
      admin
        .from('admin_events')
        .select('id, title, severity, created_at, fingerprint')
        .eq('user_id', userId)
        .eq('event_type', 'error')
        .in('severity', INCIDENT_SEVERITIES)
        .eq('resolved', false)
        .gte('created_at', ago7d)
        .order('created_at', { ascending: false })
        .limit(PLAYER_ERRORS_LIMIT),
    );
    const [countRes, recentRes] = await Promise.all([countQuery, recentQuery]);
    if (countRes.error) throw new Error(countRes.error.message);
    if (recentRes.error) throw new Error(recentRes.error.message);
    const recentRows = (recentRes.data ?? []) as Array<{
      id: string;
      title: string;
      severity: string;
      created_at: string | null;
      fingerprint: string | null;
    }>;
    const recent: PlayerErrorEvent[] = [];
    for (const r of recentRows) {
      if (!r.created_at) continue;
      recent.push({ id: r.id, title: r.title, severity: r.severity, createdAt: r.created_at, fingerprint: r.fingerprint });
    }
    errors = { count7d: countRes.count ?? 0, recent };
  } catch (sectionError) {
    degraded.push('errors');
    degradedDetail.push(`errors: ${describeError(sectionError)}`);
    errors = { count7d: null, recent: [] };
  }

  // `degradedDetail` (NOT `degraded`) gates this — 'traces' failing is
  // recorded in `degraded` for the UI but deliberately excluded from
  // `degradedDetail` above, so it never reaches this log.
  //
  // `userId` is deliberately NOT in this context. `admin_events.user_id` is
  // written straight from `RoundErrorContext.userId`
  // (server-error-logger.ts's writeAdminTables), and THIS module's own
  // "errors attributed to this player" section filters
  // `.eq('user_id', userId)` — passing the inspected player's own userId
  // here would make opening their page manufacture a row that the very next
  // load of the SAME page counts as one of "their" errors, the identical
  // self-inflating-metric failure mode `errors.ts` already carries an
  // rca_analysis scar for. `playerId` is safe: it is never written to
  // `admin_events.user_id`, so it cannot feed back into this query.
  if (degradedDetail.length > 0) {
    await logServerError(
      `[Bridge] player detail rendered without ${degradedDetail.length} section(s): ${degradedDetail.join('; ')}`,
      { action: 'admin.getPlayerDetail', feature: 'admin_bridge', sport: 'golf', playerId },
    );
  }

  return {
    player: {
      playerId,
      userId: player.user_id,
      name: displayName(player),
      email: player.email,
      createdAt: player.created_at,
      lastSeen,
      graduationYear: player.graduation_year,
      handicapIndex: player.handicap_index,
      profileQuality: classifyProfileQuality({
        onboardingCompleted: player.onboarding_completed,
        profileComplete: player.profile_complete,
        email: player.email,
        firstName: player.first_name,
        lastName: player.last_name,
      }),
      team,
    },
    recentRounds,
    stuckRounds,
    roundsSummary,
    qualifiers,
    errors,
    mostRecentRoundTraceHref,
    degraded,
  };
}

// Re-exported so callers/tests don't need a second import path for the
// shared idle-time thresholds this module's tiering is built on.
export { STUCK_HOURS_THRESHOLD, STUCK_TIER_MAX_IDLE_HOURS };

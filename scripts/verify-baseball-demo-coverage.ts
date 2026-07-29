/**
 * verify-baseball-demo-coverage.ts — standalone BaseballHelm demo-coverage
 * report.
 *
 * Read-only. Re-derives the demo team/org/coach ids (same detId() algorithm and
 * namespace as the seed scripts) and counts rows, SCOPED TO THAT DEMO TEAM, for
 * every table behind a surface the demo is supposed to show.
 *
 * WHAT "TELLING THE TRUTH" MEANS HERE (this file has lied three ways before):
 *
 *   1. UNSCOPED COUNTS PASSING AS SCOPED. Three entries used to declare
 *      `scopeColumn: 'none'` and count the table GLOBALLY, so any row belonging
 *      to any other team — a real customer's messages, another demo's tasks —
 *      satisfied the check. `Scope` below has no "unimplemented" member: a
 *      child table is scoped through its parent's id set, and an unhandled
 *      scope is a compile error (the `never` in resolveScopedCount) and a
 *      run-time FAIL, never a silent pass.
 *
 *   2. AN EMPTY ERROR MESSAGE READING AS "NO ROWS". PostgREST returns
 *      `{ message: '' }` for some gateway failures (observed 2026-07-29: the
 *      project answered HTTP 522 on every request). The old code stored that
 *      empty string, then tested it for truthiness when formatting — so a
 *      totally unreachable database printed "0 row(s)" and the summary
 *      announced that 18 surfaces "have no demo coverage". A dead database
 *      says NOTHING about demo coverage. Query failures are now counted and
 *      reported separately from genuine zeroes, and always carry the HTTP
 *      status.
 *
 *   3. A GREEN SUMMARY OVER A PARTIAL LIST. The final line claimed "all N
 *      required surfaces have demo coverage" while the list omitted
 *      announcements, travel, documents, postgame reviews, the roster, the
 *      calendar, practices, the timeline and the whole Lift Lab progression
 *      layer. The list below is the product's surface area, not a subset of it.
 *
 * Exits non-zero if ANY required surface has zero rows or could not be
 * verified. Sunset-module tables (recruiting) are never required and are
 * asserted EMPTY instead.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-baseball-demo-coverage.ts
 *   BASEBALL_DEMO_COVERAGE_PROFILE=rini DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/verify-baseball-demo-coverage.ts
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

import { isRecruitingEnabled } from '../src/lib/baseball/product-modules';

// Must match scripts/seed-baseball-demo.ts and scripts/seed-rini-baseball-demo.ts
// exactly. (Lift Lab rows are reached through helm_lifting_athletes' team_id
// rather than by re-deriving Phase 2's namespace, so no lifting namespace is
// needed here.)
const NS_P1 = 'baseballhelm-demo-phase1';
const NS_RINI = 'rini-baseball-demo-v1';
const PROFILE = process.env.BASEBALL_DEMO_COVERAGE_PROFILE === 'rini' ? 'rini' : 'phase1';

function detId(namespace: string, key: string): string {
  const h = createHash('sha1').update(`${namespace}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

const TEAM_ID = detId(PROFILE === 'rini' ? NS_RINI : NS_P1, 'team');
const ORG_ID =
  PROFILE === 'rini'
    ? '6ce2c0bd-fb7d-4cae-a536-387f6aea8ff7' // njrini99's existing "Rini University" org
    : detId(NS_P1, 'org');
const COACH_ID =
  PROFILE === 'rini'
    ? '5080d69c-4bd0-41fc-a02a-714062f2e74b'
    : detId(NS_P1, 'coach');

// ---------------------------------------------------------------------------
// Scoping model.
//
// Every check is scoped to the demo team. Tables that carry team_id/
// organization_id/coach_id are filtered directly; tables that do not are
// filtered through their PARENT's team-scoped id set. There is deliberately no
// "count it globally" option — that is what let three checks pass on other
// teams' rows.
// ---------------------------------------------------------------------------

/** A parent table whose demo-scoped ids gate a child table's count. */
type ParentSetId =
  | 'events'
  | 'announcements'
  | 'documents'
  | 'conversations'
  | 'tasks'
  | 'liftingGroups'
  | 'liftingAthletes';

type Scope =
  | { kind: 'team' }
  | { kind: 'org' }
  | { kind: 'coach' }
  | { kind: 'parent'; column: string; parent: ParentSetId };

const PARENT_SETS: Readonly<
  Record<ParentSetId, { table: string; column: 'team_id' | 'organization_id' }>
> = {
  events: { table: 'baseball_events', column: 'team_id' },
  announcements: { table: 'baseball_announcements', column: 'team_id' },
  documents: { table: 'baseball_documents', column: 'team_id' },
  conversations: { table: 'baseball_conversations', column: 'team_id' },
  tasks: { table: 'baseball_tasks', column: 'team_id' },
  liftingGroups: { table: 'helm_lifting_groups', column: 'team_id' },
  liftingAthletes: { table: 'helm_lifting_athletes', column: 'team_id' },
};

/**
 * One entry per surface the demo must be able to open without an empty screen.
 * `required: true` means a zero count — or a query that could not be run —
 * fails the run.
 */
interface CoverageEntry {
  table: string;
  route: string;
  scope: Scope;
  required: boolean;
  /** Which seed script is responsible for filling it (named in the failure). */
  owner: string;
  note?: string;
}

const TEAM: Scope = { kind: 'team' };
const ORG: Scope = { kind: 'org' };

/**
 * PHASE-1 PROFILE — the shipped demo team ("Demo University Baseball"), built
 * by the four layered seed scripts documented in
 * docs/seed/BASEBALLHELM_DEMO_DATA_CONTRACT.md. `owner` names the script that
 * fills each table so a failure line is directly actionable.
 */
const PHASE1_SURFACE_COVERAGE: readonly CoverageEntry[] = [
  // --- Team operations ----------------------------------------------------
  { table: 'baseball_team_members', route: '/baseball/dashboard/roster', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_program_settings', route: '/baseball/dashboard/settings', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_events', route: '/baseball/dashboard/calendar', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_event_acknowledgements', route: '/baseball/dashboard/calendar', scope: { kind: 'parent', column: 'event_id', parent: 'events' }, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_practices', route: '/baseball/dashboard/practice', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_practice_blocks', route: '/baseball/dashboard/practice', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_practice_attendance', route: '/baseball/dashboard/practice', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_announcements', route: '/baseball/dashboard/announcements', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_announcement_recipients', route: '/baseball/dashboard/announcements', scope: { kind: 'parent', column: 'announcement_id', parent: 'announcements' }, required: true, owner: 'seed-baseball-demo.ts', note: 'recipient-scoped announcement — proves targeting is wired, not just broadcast' },
  { table: 'baseball_announcement_acknowledgements', route: '/baseball/dashboard/announcements', scope: { kind: 'parent', column: 'announcement_id', parent: 'announcements' }, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_travel_itineraries', route: '/baseball/dashboard/travel', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_travel_expenses', route: '/baseball/dashboard/travel', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_documents', route: '/baseball/dashboard/documents', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts', note: 'rows only exist if the storage upload into the `documents` bucket succeeded' },
  { table: 'baseball_document_versions', route: '/baseball/dashboard/documents', scope: { kind: 'parent', column: 'document_id', parent: 'documents' }, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_conversations', route: '/baseball/dashboard/messages', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_messages', route: '/baseball/dashboard/messages', scope: { kind: 'parent', column: 'conversation_id', parent: 'conversations' }, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_tasks', route: '/baseball/dashboard/tasks', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_task_assignments', route: '/baseball/dashboard/tasks', scope: { kind: 'parent', column: 'task_id', parent: 'tasks' }, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_videos', route: '/baseball/dashboard/videos', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },

  // --- Player development -------------------------------------------------
  { table: 'baseball_developmental_plans', route: '/baseball/dashboard/dev-plans', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_player_timeline_events', route: '/baseball/dashboard/players/[id]', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_coach_insights', route: '/baseball/dashboard/command-center', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },

  // --- Stats / imports ----------------------------------------------------
  { table: 'baseball_seasons', route: '/baseball/dashboard/settings (season)', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_import_sources', route: '/baseball/dashboard/import', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_import_runs', route: '/baseball/dashboard/import', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_player_external_ids', route: '/baseball/dashboard/import', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_stat_uploads', route: '/baseball/dashboard/import', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_player_stats', route: '/baseball/dashboard/stats', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_player_aggregates', route: '/baseball/dashboard/stats', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'baseball_games', route: '/baseball/dashboard/stats/games', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts (1 game) + seed-baseball-demo-program.ts (season)' },
  { table: 'baseball_box_score_batting', route: '/baseball/dashboard/stats/games/[gameId]', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts + seed-baseball-demo-program.ts' },
  { table: 'baseball_box_score_pitching', route: '/baseball/dashboard/stats/games/[gameId]', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts + seed-baseball-demo-program.ts' },
  { table: 'baseball_player_season_stats', route: '/baseball/dashboard/stats-center', scope: TEAM, required: true, owner: 'seed-baseball-demo-program.ts (via recalculate_baseball_season_stats)' },

  // --- Postgame action review --------------------------------------------
  { table: 'baseball_postgame_reviews', route: '/baseball/dashboard/postgame', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'baseball_postgame_review_items', route: '/baseball/dashboard/postgame', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },

  // --- Lift Lab -----------------------------------------------------------
  { table: 'baseball_exercises', route: '/baseball/dashboard/performance', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'helm_lifting_athletes', route: '/baseball/dashboard/performance', scope: TEAM, required: true, owner: 'seed-baseball-demo.ts + seed-baseball-lifting-demo.ts' },
  { table: 'helm_lifting_exercises', route: '/baseball/dashboard/performance', scope: ORG, required: true, owner: 'seed-baseball-demo.ts + seed-baseball-lifting-demo.ts', note: 'org-scoped: helm_lifting_exercises has no team_id (team scoping is via coach assignments)' },
  { table: 'helm_lifting_programs', route: '/baseball/dashboard/performance', scope: TEAM, required: true, owner: 'seed-baseball-lifting-demo.ts' },
  { table: 'helm_lifting_program_assignments', route: '/baseball/dashboard/performance', scope: TEAM, required: true, owner: 'seed-baseball-lifting-demo.ts' },
  { table: 'helm_lifting_sessions', route: '/baseball/dashboard/lift', scope: TEAM, required: true, owner: 'seed-baseball-lifting-demo.ts' },
  { table: 'helm_lifting_set_results', route: '/baseball/dashboard/lift', scope: { kind: 'parent', column: 'athlete_id', parent: 'liftingAthletes' }, required: true, owner: 'seed-baseball-lifting-demo.ts' },
  { table: 'helm_lifting_readiness_checkins', route: '/baseball/dashboard/readiness', scope: { kind: 'parent', column: 'athlete_id', parent: 'liftingAthletes' }, required: true, owner: 'seed-baseball-lifting-demo.ts' },
  { table: 'helm_lifting_maxes', route: '/baseball/dashboard/performance', scope: { kind: 'parent', column: 'athlete_id', parent: 'liftingAthletes' }, required: true, owner: 'seed-baseball-demo.ts', note: 'without a 1RM every percent-based prescription in the demo is computed off nothing' },
  { table: 'helm_lifting_bodyweight_entries', route: '/baseball/dashboard/performance', scope: { kind: 'parent', column: 'athlete_id', parent: 'liftingAthletes' }, required: true, owner: 'seed-baseball-demo.ts' },
  { table: 'helm_lifting_groups', route: '/baseball/dashboard/performance/groups', scope: TEAM, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
  { table: 'helm_lifting_group_members', route: '/baseball/dashboard/performance/groups', scope: { kind: 'parent', column: 'group_id', parent: 'liftingGroups' }, required: true, owner: 'seed-baseball-surfaces-demo.ts' },
] as const;

/**
 * RINI PROFILE — the founder's personal demo team, seeded by
 * scripts/seed-rini-baseball-demo.ts. A narrower contract than the shipped
 * demo: it exists to exercise the surfaces that seed script fills.
 */
const RINI_SURFACE_COVERAGE: readonly CoverageEntry[] = [
  { table: 'baseball_team_members', route: '/baseball/dashboard/roster', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_events', route: '/baseball/dashboard/calendar', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_games', route: '/baseball/dashboard/stats/games', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_box_score_batting', route: '/baseball/dashboard/stats/games/[gameId]', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_box_score_pitching', route: '/baseball/dashboard/stats/games/[gameId]', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_player_season_stats', route: '/baseball/dashboard/stats-center', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_practices', route: '/baseball/dashboard/practice', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_player_timeline_events', route: '/baseball/dashboard/players/[id]', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_announcements', route: '/baseball/dashboard/announcements', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_announcement_acknowledgements', route: '/baseball/dashboard/announcements', scope: { kind: 'parent', column: 'announcement_id', parent: 'announcements' }, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_travel_itineraries', route: '/baseball/dashboard/travel', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_travel_expenses', route: '/baseball/dashboard/travel', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_tasks', route: '/baseball/dashboard/tasks', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_task_assignments', route: '/baseball/dashboard/tasks', scope: { kind: 'parent', column: 'task_id', parent: 'tasks' }, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_coach_insights', route: '/baseball/dashboard/command-center', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_player_stats', route: '/baseball/dashboard/stats', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'baseball_player_aggregates', route: '/baseball/dashboard/stats', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'helm_lifting_athletes', route: '/baseball/dashboard/performance', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'helm_lifting_programs', route: '/baseball/dashboard/performance', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'helm_lifting_sessions', route: '/baseball/dashboard/lift', scope: TEAM, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'helm_lifting_set_results', route: '/baseball/dashboard/lift', scope: { kind: 'parent', column: 'athlete_id', parent: 'liftingAthletes' }, required: true, owner: 'seed-rini-baseball-demo.ts' },
  { table: 'helm_lifting_readiness_checkins', route: '/baseball/dashboard/readiness', scope: { kind: 'parent', column: 'athlete_id', parent: 'liftingAthletes' }, required: true, owner: 'seed-rini-baseball-demo.ts' },
] as const;

export const SURFACE_COVERAGE: readonly CoverageEntry[] =
  PROFILE === 'rini' ? RINI_SURFACE_COVERAGE : PHASE1_SURFACE_COVERAGE;

/**
 * Surfaces deliberately left empty for the demo team. Printed for visibility.
 * A NON-ZERO count here is a contract violation and is reported as a WARN —
 * loudly, because two of these belong to a module that ships disabled.
 */
export const INTENTIONALLY_EMPTY: readonly { table: string; scope: Scope; reason: string }[] = [
  {
    table: 'baseball_watchlists',
    scope: { kind: 'coach' },
    reason: isRecruitingEnabled()
      ? 'recruiting is enabled — this entry is stale, move it back into SURFACE_COVERAGE'
      : 'recruiting module is SUNSET (src/lib/baseball/product-modules.ts) — the demo must not carry a recruiting board',
  },
  {
    // org-scoped, not team-scoped: recruiting interest is expressed by a
    // program, not by one of its teams.
    table: 'baseball_recruiting_interests',
    scope: { kind: 'org' },
    reason: 'recruiting module is SUNSET; a college roster never activates recruiting anyway',
  },
  { table: 'baseball_decision_log', scope: { kind: 'team' }, reason: 'Decision Room is a separate workflow, out of scope for this demo-coverage pass' },
  { table: 'baseball_meeting_items', scope: { kind: 'team' }, reason: 'Decision Room is a separate workflow, out of scope for this demo-coverage pass' },
  { table: 'baseball_signals', scope: { kind: 'team' }, reason: 'Decision Room is a separate workflow, out of scope for this demo-coverage pass' },
  { table: 'baseball_actions', scope: { kind: 'team' }, reason: 'Decision Room is a separate workflow, out of scope for this demo-coverage pass' },
  { table: 'baseball_video_events', scope: { kind: 'team' }, reason: 'staff-anchored film-tagging queue, distinct from the player-uploaded baseball_videos library this pass seeds' },
] as const;

interface CoverageResult extends CoverageEntry {
  count: number | null;
  errorMessage: string | null;
  pass: boolean;
}

// ---------------------------------------------------------------------------
// Query layer.
// ---------------------------------------------------------------------------

/**
 * Turn a PostgREST failure into text that is never empty.
 *
 * `error.message` really can be `''` (HTTP 522 from the gateway, 2026-07-29) —
 * and an empty string that later gets truthiness-tested is exactly how an
 * unreachable database came to be reported as "0 rows".
 */
function describeQueryError(
  error: { message?: string | null; code?: string | null } | null,
  status?: number,
): string {
  const message = normalizeErrorText(error?.message ?? '');
  const code = (error?.code ?? '').trim();
  const httpPart = typeof status === 'number' && status > 0 ? ` HTTP ${status}` : '';
  if (message) return `${message}${code ? ` [${code}]` : ''}${httpPart}`;
  return `query failed with no message from PostgREST${code ? ` [${code}]` : ''}${httpPart || ' (no HTTP status)'}`;
}

/**
 * A gateway failure does not return JSON — it returns a Cloudflare error PAGE,
 * and supabase-js hands the whole document over as `error.message`. Dumping
 * that verbatim buries the one line that matters (the HTTP status) under 60
 * lines of markup, so the text is flattened and clipped. Truncating is safe
 * because the status is appended separately and never trimmed.
 */
const REQUEST_TIMEOUT_MS = 15_000;
/**
 * Stop after this many consecutive query failures. Every check failing the same
 * way is a transport problem, and grinding through the remaining forty to say
 * so forty more times helps nobody — the run aborts and says what is actually
 * wrong instead.
 */
const CONSECUTIVE_ERROR_ABORT = 5;

const MAX_ERROR_TEXT = 160;
function normalizeErrorText(raw: string): string {
  const flattened = raw
    .replace(/<[^>]*>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (flattened.length <= MAX_ERROR_TEXT) return flattened;
  return `${flattened.slice(0, MAX_ERROR_TEXT)}… (truncated)`;
}

/** Lazily-resolved, team-scoped id sets for the parent tables children hang off. */
class ParentIdCache {
  private readonly cache = new Map<ParentSetId, { ids: string[]; errorMessage: string | null }>();

  constructor(private readonly supabase: SupabaseClient) {}

  async get(parent: ParentSetId): Promise<{ ids: string[]; errorMessage: string | null }> {
    const hit = this.cache.get(parent);
    if (hit) return hit;

    const { table, column } = PARENT_SETS[parent];
    const scopeId = column === 'team_id' ? TEAM_ID : ORG_ID;
    const { data, error, status } = await this.supabase
      .from(table)
      .select('id')
      .eq(column, scopeId);

    const resolved = error
      ? { ids: [], errorMessage: `parent ${table}: ${describeQueryError(error, status)}` }
      : { ids: ((data ?? []) as { id: string }[]).map((r) => r.id), errorMessage: null };
    this.cache.set(parent, resolved);
    return resolved;
  }
}

async function resolveScopedCount(
  supabase: SupabaseClient,
  parents: ParentIdCache,
  entry: Pick<CoverageEntry, 'table' | 'scope'>,
): Promise<{ count: number | null; errorMessage: string | null }> {
  const { scope } = entry;
  let query = supabase.from(entry.table).select('id', { count: 'exact', head: true });

  switch (scope.kind) {
    case 'team':
      query = query.eq('team_id', TEAM_ID);
      break;
    case 'org':
      query = query.eq('organization_id', ORG_ID);
      break;
    case 'coach':
      query = query.eq('coach_id', COACH_ID);
      break;
    case 'parent': {
      const { ids, errorMessage } = await parents.get(scope.parent);
      if (errorMessage) return { count: null, errorMessage };
      // No parents means no children FOR THIS TEAM. That is a real zero, not an
      // error — and the parent has its own required entry that will fail too,
      // so the summary names the actual root cause.
      if (ids.length === 0) return { count: 0, errorMessage: null };
      query = query.in(scope.column, ids);
      break;
    }
    default: {
      // Compile-time exhaustiveness: adding a Scope variant without handling it
      // here is a type error, so an unimplemented check can never reach the
      // report as a pass.
      const unreachable: never = scope;
      return {
        count: null,
        errorMessage: `unimplemented scope for ${entry.table}: ${JSON.stringify(unreachable)}`,
      };
    }
  }

  const { count, error, status } = await query;
  if (error) return { count: null, errorMessage: describeQueryError(error, status) };
  // A successful head-count with a null count is not a zero — PostgREST simply
  // did not return the header. Refuse to guess.
  if (count === null || count === undefined) {
    return {
      count: null,
      errorMessage: `no count returned by PostgREST${typeof status === 'number' ? ` (HTTP ${status})` : ''}`,
    };
  }
  return { count, errorMessage: null };
}

/** Pure — exported so the reporting logic is independently unit-testable. */
export function evaluateCoverage(
  entry: CoverageEntry,
  count: number | null,
  errorMessage: string | null,
): CoverageResult {
  if (errorMessage !== null) {
    return { ...entry, count: null, errorMessage, pass: !entry.required };
  }
  const pass = !entry.required || (count ?? 0) > 0;
  return { ...entry, count, errorMessage: null, pass };
}

export function formatReportLine(result: CoverageResult): string {
  // Tested with `!== null`, not truthiness: an empty-string error message is
  // still an error, and treating it as "no error" is what made an unreachable
  // database print "0 row(s)".
  const failed = result.errorMessage !== null;
  const status = failed ? `ERROR (${result.errorMessage})` : `${result.count} row(s)`;
  const verdict = failed ? (result.required ? 'FAIL' : 'SKIP') : result.pass ? 'PASS' : 'FAIL';
  const req = result.required ? 'required' : 'optional';
  const note = result.note ? `  [${result.note}]` : '';
  return `  [${verdict}] ${result.table.padEnd(38)} (${req})  ${result.route.padEnd(42)} ${status}${note}`;
}

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    // A per-request deadline. Without it, a project whose origin is down makes
    // every one of ~50 checks wait out the gateway's own ~30s timeout, and a
    // read-only report that should take seconds takes twenty minutes — long
    // enough that nobody runs it when it matters most.
    global: {
      fetch: (input, init) =>
        fetch(input, { ...init, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS) }),
    },
  });
  const parents = new ParentIdCache(supabase);

  console.log('='.repeat(96));
  console.log('BASEBALLHELM DEMO SURFACE COVERAGE REPORT');
  console.log(`Profile   : ${PROFILE}`);
  console.log(`Demo team : ${TEAM_ID}`);
  console.log(`Demo org  : ${ORG_ID}`);
  console.log(`Recruiting module: ${isRecruitingEnabled() ? 'ENABLED' : 'SUNSET (not required, asserted empty)'}`);
  console.log('='.repeat(96));

  console.log('\nREQUIRED SURFACES (route -> table -> row count, scoped to the demo team):');
  const results: CoverageResult[] = [];
  let consecutiveErrors = 0;
  let abortedAfter: number | null = null;
  for (const entry of SURFACE_COVERAGE) {
    const { count, errorMessage } = await resolveScopedCount(supabase, parents, entry);
    const result = evaluateCoverage(entry, count, errorMessage);
    results.push(result);
    console.log(formatReportLine(result));

    consecutiveErrors = errorMessage === null ? 0 : consecutiveErrors + 1;
    if (consecutiveErrors >= CONSECUTIVE_ERROR_ABORT) {
      abortedAfter = results.length;
      console.log(
        `\n  ABORTED after ${consecutiveErrors} consecutive query failures — ` +
        `${SURFACE_COVERAGE.length - results.length} surface(s) were never checked.`,
      );
      break;
    }
  }

  const contractViolations: string[] = [];
  if (abortedAfter === null) {
    console.log('\nSURFACES THAT MUST BE EMPTY (sunset modules + out-of-scope workflows):');
    for (const entry of INTENTIONALLY_EMPTY) {
      const { count, errorMessage } = await resolveScopedCount(supabase, parents, entry);
      if (errorMessage !== null) {
        console.log(`  [SKIP] ${entry.table.padEnd(38)} ERROR (${errorMessage})  — ${entry.reason}`);
        continue;
      }
      const verdict = count === 0 ? 'OK  ' : 'WARN';
      if (count !== 0) contractViolations.push(`${entry.table} has ${count} row(s) — ${entry.reason}`);
      console.log(`  [${verdict}] ${entry.table.padEnd(38)} ${count} row(s)  — ${entry.reason}`);
    }
  }

  // Split the two failure modes. "The database did not answer" and "the seed
  // did not run" demand completely different actions, and conflating them is
  // how a 522 gateway error got reported as missing demo data.
  const empty = results.filter((r) => !r.pass && r.errorMessage === null);
  const errored = results.filter((r) => !r.pass && r.errorMessage !== null);
  const failed = [...errored, ...empty];

  console.log('\n' + '='.repeat(96));
  if (failed.length === 0 && abortedAfter === null) {
    console.log(
      `PASS — all ${results.length} required surfaces have demo coverage for team ${TEAM_ID}.`,
    );
  } else {
    console.log(
      `FAIL — ${failed.length} of the ${results.length} required surfaces checked are not ` +
      `demo-ready (${errored.length} could not be verified, ${empty.length} verified empty).`,
    );
    if (abortedAfter !== null) {
      console.log(
        `       ${SURFACE_COVERAGE.length - results.length} of ${SURFACE_COVERAGE.length} ` +
        'surfaces were NEVER CHECKED — the run aborted. Their state is unknown, not passing.',
      );
    }
    if (errored.length > 0) {
      console.log('\n  COULD NOT BE VERIFIED — these say NOTHING about coverage; fix the query first:');
      for (const r of errored) console.log(`    - ${r.table} (${r.route})\n        ${r.errorMessage}`);
      if (errored.length === results.length) {
        console.log(
          '\n  EVERY check errored. That is a connectivity/credentials failure, not a seed gap —\n' +
          '  do not conclude anything about demo coverage from this run.',
        );
      }
    }
    if (empty.length > 0) {
      console.log('\n  EMPTY — the surface will render an empty state in the demo:');
      for (const r of empty) console.log(`    - ${r.table} (${r.route})\n        seeded by: ${r.owner}`);
    }
  }
  if (contractViolations.length > 0) {
    console.log('\n  WARN — data exists where the contract says it must not (does not fail the run):');
    for (const v of contractViolations) console.log(`    - ${v}`);
  }
  console.log('='.repeat(96));

  // An aborted run exits non-zero even in the impossible case of zero failures:
  // "I stopped early" must never be reported to a caller as "everything passed".
  process.exit(failed.length === 0 && abortedAfter === null ? 0 : 1);
}

// Guard the live-DB run behind a direct-execution check so this module can
// be imported by unit tests (see scripts/__tests__/verify-baseball-demo-coverage.test.ts)
// for the pure evaluateCoverage()/formatReportLine() logic without trying to
// connect to Supabase or call process.exit().
const isDirectExecution =
  typeof process.argv[1] === 'string' &&
  import.meta.url === `file://${process.argv[1]}`;

if (isDirectExecution) {
  main().catch((e) => {
    console.error(e instanceof Error ? e.message : e);
    process.exit(1);
  });
}

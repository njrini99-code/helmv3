import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { ALL_SEVERITIES } from '@/lib/admin/severity';
import { STUCK_HOURS_THRESHOLD, STUCK_TIER_MAX_IDLE_HOURS } from '@/lib/golf/tracer-round-activity';

/**
 * Bridge V2 /admin/teams/[id] — SECOND supplement to the pinned
 * `fetchTeamDetail` (`@/lib/admin/data/team-detail`), alongside the sibling
 * `team-page-extras.ts`. Covers two things the team spec calls for that
 * neither of those modules reads:
 *
 *   1. QUALIFIERS — how many this team has run, open vs closed, and how many
 *      entries actually have a completed round attached
 *      (`golf_qualifier_entries.round_id`). Nothing in `team-detail.ts` or
 *      `team-page-extras.ts` reads `golf_qualifiers` at all.
 *   2. IN-FLIGHT AUTOSAVES — `golf_rounds` rows this team has sitting at
 *      `status = 'in_progress'` right now (a round mid-play; `draft_data` /
 *      `current_hole` are being autosaved as the player goes), tiered
 *      live / stuck / abandoned by idle time using the SAME thresholds the
 *      platform-wide Tracer briefing already uses for exactly this judgment
 *      (`STUCK_HOURS_THRESHOLD` / `STUCK_TIER_MAX_IDLE_HOURS`,
 *      `src/lib/golf/tracer-round-activity.ts`) — not a second,
 *      independently-invented pair of numbers.
 *
 * SCHEMA-DRIFT / VOCABULARY FINDINGS (verified against
 * src/lib/types/database.ts + call sites, not guessed):
 *   - `golf_qualifiers.status` has no DB enum — plain string, values
 *     'upcoming' / 'in_progress' / 'completed' by codebase convention
 *     (`src/app/golf/actions/golf.ts`, `round-type.ts`). "Open" here means
 *     'upcoming' OR 'in_progress' — the SAME bucketing
 *     `dashboard-data.ts:334` already uses for a team's open-qualifier count
 *     (`.in('status', ['upcoming', 'in_progress'])`). "Closed" means
 *     'completed'. Per
 *     `memory/incidents/qualifiers/INC-2026-08-22-end-date-closed-qualifier-early.md`,
 *     completion is a MANUAL coach action only — `end_date` is schedule
 *     metadata, never an automatic lockout — so a qualifier past its
 *     `end_date` that is still 'in_progress' correctly counts as open, not
 *     closed. A null/unrecognized status is bucketed 'unknown' rather than
 *     silently folded into either count.
 *   - `golf_qualifier_entries.round_id` is nullable — an entry only gets one
 *     once the player has actually recorded a qualifying round. "Rounds
 *     linked" = entries where `round_id IS NOT NULL`.
 *   - `golf_rounds.status` (also no DB enum) reaches `'in_progress'` while a
 *     round is being played and autosaved; `updated_at` moves on every
 *     autosave. This module's `classifyInFlightTier` mirrors the Tracer
 *     briefing's `classifyInProgressActivity` (tracer-round-activity.ts)
 *     idle-time math but DELIBERATELY DROPS its 30-day recency gate — that
 *     gate exists because that classifier feeds a "recent activity feed"
 *     with no business surfacing month-old noise. A round idle 45 days that
 *     is STILL `status = 'in_progress'` is exactly the kind of orphaned
 *     autosave a team's "how many are in flight right now" count exists to
 *     surface, so it must not silently disappear from it.
 *
 * Both queries are scoped to the one `team_id` and bounded. Same fail-soft
 * contract as `team-page-extras.ts`: a query failure here degrades ONLY its
 * own field to an honest empty/zero value plus a `degraded` marker — never
 * the rest of the page, and never rendered as "zero, therefore clean".
 *
 * CALLER must have passed requireSuperAdmin() — every query below runs
 * against the service-role client (createAdminClient()).
 */

// ---------------------------------------------------------------------------
// Qualifiers
// ---------------------------------------------------------------------------

const QUALIFIER_OPEN_STATUSES = new Set(['upcoming', 'in_progress']);
const QUALIFIER_CLOSED_STATUSES = new Set(['completed']);

export type QualifierBucket = 'open' | 'closed' | 'unknown';

interface RawQualifierRow {
  id: string;
  name: string;
  status: string | null;
  num_rounds: number;
  start_date: string;
  end_date: string | null;
  created_at: string | null;
}

interface RawQualifierEntryRow {
  qualifier_id: string;
  round_id: string | null;
}

export interface TeamQualifierRow {
  id: string;
  name: string;
  status: string | null;
  bucket: QualifierBucket;
  numRounds: number;
  startDate: string;
  endDate: string | null;
  entriesTotal: number;
  entriesWithRound: number;
}

export interface TeamQualifiersSummary {
  total: number;
  open: number;
  closed: number;
  unknownStatus: number;
  entriesTotal: number;
  entriesWithRound: number;
  /** Most-recently-started first. */
  items: TeamQualifierRow[];
  /** True when the qualifiers OR entries read hit its bound — the counts
   *  above are then a floor, not the true total, and the UI must say so. */
  truncated: boolean;
}

const EMPTY_QUALIFIERS_SUMMARY: TeamQualifiersSummary = {
  total: 0,
  open: 0,
  closed: 0,
  unknownStatus: 0,
  entriesTotal: 0,
  entriesWithRound: 0,
  items: [],
  truncated: false,
};

function bucketQualifierStatus(status: string | null): QualifierBucket {
  if (status && QUALIFIER_CLOSED_STATUSES.has(status)) return 'closed';
  if (status && QUALIFIER_OPEN_STATUSES.has(status)) return 'open';
  return 'unknown';
}

/** Pure, unit-tested: folds an already-fetched, already-scoped qualifier
 *  list and its entries into the team-level open/closed/entries-linked
 *  picture. Never queries anything itself. */
export function summarizeQualifiers(
  qualifiers: readonly RawQualifierRow[],
  entries: readonly RawQualifierEntryRow[],
  truncated: boolean,
): TeamQualifiersSummary {
  if (qualifiers.length === 0) return { ...EMPTY_QUALIFIERS_SUMMARY, truncated };

  const entryCounts = new Map<string, { total: number; withRound: number }>();
  for (const e of entries) {
    const bucket = entryCounts.get(e.qualifier_id) ?? { total: 0, withRound: 0 };
    bucket.total += 1;
    if (e.round_id) bucket.withRound += 1;
    entryCounts.set(e.qualifier_id, bucket);
  }

  let open = 0;
  let closed = 0;
  let unknownStatus = 0;
  let entriesTotal = 0;
  let entriesWithRound = 0;

  const items: TeamQualifierRow[] = qualifiers.map((q) => {
    const counts = entryCounts.get(q.id) ?? { total: 0, withRound: 0 };
    entriesTotal += counts.total;
    entriesWithRound += counts.withRound;
    const bucket = bucketQualifierStatus(q.status);
    if (bucket === 'open') open += 1;
    else if (bucket === 'closed') closed += 1;
    else unknownStatus += 1;
    return {
      id: q.id,
      name: q.name,
      status: q.status,
      bucket,
      numRounds: q.num_rounds,
      startDate: q.start_date,
      endDate: q.end_date,
      entriesTotal: counts.total,
      entriesWithRound: counts.withRound,
    };
  });

  items.sort((a, b) => (a.startDate < b.startDate ? 1 : a.startDate > b.startDate ? -1 : 0));

  return { total: qualifiers.length, open, closed, unknownStatus, entriesTotal, entriesWithRound, items, truncated };
}

// ---------------------------------------------------------------------------
// In-flight autosaves
// ---------------------------------------------------------------------------

export type InFlightTier = 'live' | 'stuck' | 'abandoned';

/**
 * Idle-time tier for a `status = 'in_progress'` round — same thresholds as
 * the Tracer briefing's `classifyInProgressActivity`
 * (`src/lib/golf/tracer-round-activity.ts`), without its 30-day recency
 * gate (see module doc for why). A round with no `updated_at` at all is
 * treated as `abandoned` — an honest "we can't prove this is still live"
 * rather than a `live` default that would hide the gap.
 */
export function classifyInFlightTier(updatedAt: string | null, now: number = Date.now()): InFlightTier {
  if (!updatedAt) return 'abandoned';
  const hoursInactive = (now - new Date(updatedAt).getTime()) / (1000 * 60 * 60);
  if (hoursInactive < STUCK_HOURS_THRESHOLD) return 'live';
  if (hoursInactive < STUCK_TIER_MAX_IDLE_HOURS) return 'stuck';
  return 'abandoned';
}

interface RawInFlightRoundRow {
  id: string;
  player_id: string;
  updated_at: string | null;
  current_hole: number | null;
  course_name: string | null;
}

export interface PlayerDisplayInfo {
  name: string | null;
  href: string | null;
}

export interface InFlightRoundRow {
  roundId: string;
  playerId: string;
  playerName: string | null;
  href: string | null;
  updatedAt: string | null;
  currentHole: number | null;
  courseName: string | null;
  tier: InFlightTier;
}

export interface TeamInFlightSummary {
  total: number;
  live: number;
  stuck: number;
  abandoned: number;
  /** Most-in-need-of-attention first: abandoned, then stuck, then live;
   *  oldest `updatedAt` first within a tier. */
  items: InFlightRoundRow[];
  truncated: boolean;
}

const EMPTY_IN_FLIGHT_SUMMARY: TeamInFlightSummary = {
  total: 0,
  live: 0,
  stuck: 0,
  abandoned: 0,
  items: [],
  truncated: false,
};

const IN_FLIGHT_TIER_RANK: Record<InFlightTier, number> = { abandoned: 0, stuck: 1, live: 2 };

/** Pure, unit-tested: tiers and sorts an already-fetched, already-scoped
 *  `in_progress` round list. `playerIndex` supplies display name/href per
 *  `player_id` (the caller resolves this — some from the active roster
 *  already in hand, some from a small follow-up query for players no
 *  longer on the active roster); a round for a player missing from BOTH
 *  simply renders with `playerName: null, href: null` rather than being
 *  dropped. */
export function summarizeInFlightRounds(
  rows: readonly RawInFlightRoundRow[],
  playerIndex: ReadonlyMap<string, PlayerDisplayInfo>,
  truncated: boolean,
  now: number = Date.now(),
): TeamInFlightSummary {
  if (rows.length === 0) return { ...EMPTY_IN_FLIGHT_SUMMARY, truncated };

  let live = 0;
  let stuck = 0;
  let abandoned = 0;
  const items: InFlightRoundRow[] = rows.map((r) => {
    const tier = classifyInFlightTier(r.updated_at, now);
    if (tier === 'live') live += 1;
    else if (tier === 'stuck') stuck += 1;
    else abandoned += 1;
    const player = playerIndex.get(r.player_id);
    return {
      roundId: r.id,
      playerId: r.player_id,
      playerName: player?.name ?? null,
      href: player?.href ?? null,
      updatedAt: r.updated_at,
      currentHole: r.current_hole,
      courseName: r.course_name,
      tier,
    };
  });

  items.sort((a, b) => {
    if (a.tier !== b.tier) return IN_FLIGHT_TIER_RANK[a.tier] - IN_FLIGHT_TIER_RANK[b.tier];
    const aKey = a.updatedAt ?? '';
    const bKey = b.updatedAt ?? '';
    return aKey < bKey ? -1 : aKey > bKey ? 1 : 0;
  });

  return { total: rows.length, live, stuck, abandoned, items, truncated };
}

// ---------------------------------------------------------------------------
// Combined fetch
// ---------------------------------------------------------------------------

const QUALIFIERS_LIMIT = 200;
// PostgREST caps a response at 1000 rows regardless of a larger `.limit()` —
// team-detail.ts hit this exact silent-undercount trap on logins before
// switching to `fetchAllRowsResult` pagination. This module does NOT
// paginate past it (a team's qualifier-entry volume is expected to stay well
// under 1000 — roster size × num_rounds × a handful of qualifiers per
// season), so the bound here MUST equal the real server-side cap or the
// `>= limit` truncation check below silently reads `false` past 1000 rows
// while the summed counts are already wrong.
const QUALIFIER_ENTRIES_LIMIT = 1000;
const IN_FLIGHT_ROUNDS_LIMIT = 200;

export interface TeamDetailExtras {
  qualifiers: TeamQualifiersSummary;
  inFlight: TeamInFlightSummary;
  /** Sections that FAILED to load ('qualifiers', 'inFlightRounds') — same
   *  honest-degradation contract as `fetchTeamDetail`'s own `degraded`:
   *  render as unknown, never as zero. */
  degraded: string[];
}

/**
 * CALLER must have passed requireSuperAdmin(). `rosterIndex` is the
 * caller's already-fetched ACTIVE roster (player_id -> display name/href) —
 * reused here rather than re-queried, since most in-flight rounds belong to
 * players still on the roster; only the gap (a round for a since-removed
 * player) costs one extra small, bounded query.
 */
export async function fetchTeamDetailExtras(input: {
  teamId: string;
  rosterIndex: ReadonlyMap<string, PlayerDisplayInfo>;
}): Promise<TeamDetailExtras> {
  const admin = createAdminClient();
  const degraded: string[] = [];

  let qualifiers: TeamQualifiersSummary = EMPTY_QUALIFIERS_SUMMARY;
  try {
    const { data: qData, error: qError } = await admin
      .from('golf_qualifiers')
      .select('id, name, status, num_rounds, start_date, end_date, created_at')
      .eq('team_id', input.teamId)
      .order('created_at', { ascending: false })
      .limit(QUALIFIERS_LIMIT);
    if (qError) throw new Error(qError.message);
    const qualifierRows = (qData ?? []) as RawQualifierRow[];
    const qualifierIds = qualifierRows.map((q) => q.id);

    let entryRows: RawQualifierEntryRow[] = [];
    if (qualifierIds.length > 0) {
      const { data: eData, error: eError } = await admin
        .from('golf_qualifier_entries')
        .select('qualifier_id, round_id')
        .in('qualifier_id', qualifierIds)
        .limit(QUALIFIER_ENTRIES_LIMIT);
      if (eError) throw new Error(eError.message);
      entryRows = (eData ?? []) as RawQualifierEntryRow[];
    }

    qualifiers = summarizeQualifiers(
      qualifierRows,
      entryRows,
      qualifierRows.length >= QUALIFIERS_LIMIT || entryRows.length >= QUALIFIER_ENTRIES_LIMIT,
    );
  } catch {
    degraded.push('qualifiers');
    qualifiers = EMPTY_QUALIFIERS_SUMMARY;
  }

  let inFlight: TeamInFlightSummary = EMPTY_IN_FLIGHT_SUMMARY;
  try {
    const { data: rData, error: rError } = await admin
      .from('golf_rounds')
      .select('id, player_id, updated_at, current_hole, course_name')
      .eq('team_id', input.teamId)
      .eq('status', 'in_progress')
      .order('updated_at', { ascending: true })
      .limit(IN_FLIGHT_ROUNDS_LIMIT);
    if (rError) throw new Error(rError.message);
    const roundRows = (rData ?? []) as RawInFlightRoundRow[];

    // Resolve display info for any player NOT already in the roster index
    // handed in — ONE bounded follow-up query for the whole gap, never
    // per-row.
    const missingIds = Array.from(
      new Set(roundRows.map((r) => r.player_id).filter((id) => !input.rosterIndex.has(id))),
    );
    const combinedIndex = new Map<string, PlayerDisplayInfo>(input.rosterIndex);
    if (missingIds.length > 0) {
      const { data: pData, error: pError } = await admin
        .from('golf_players')
        .select('id, user_id, first_name, last_name')
        .in('id', missingIds)
        // Bounded by construction (missingIds.length <= IN_FLIGHT_ROUNDS_LIMIT
        // rows above), explicit anyway per the "bound every query" contract.
        .limit(IN_FLIGHT_ROUNDS_LIMIT);
      if (pError) throw new Error(pError.message);
      for (const p of (pData ?? []) as Array<{
        id: string;
        user_id: string;
        first_name: string | null;
        last_name: string | null;
      }>) {
        const name = `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim();
        combinedIndex.set(p.id, { name: name.length > 0 ? name : null, href: `/admin/users/${p.user_id}` });
      }
    }

    inFlight = summarizeInFlightRounds(roundRows, combinedIndex, roundRows.length >= IN_FLIGHT_ROUNDS_LIMIT);
  } catch {
    degraded.push('inFlightRounds');
    inFlight = EMPTY_IN_FLIGHT_SUMMARY;
  }

  return { qualifiers, inFlight, degraded };
}

// ---------------------------------------------------------------------------
// Pure derivations over data `fetchTeamDetail` already returned — no new
// queries. Kept here (not in team-detail.ts, which this module must not
// modify) since they're presentation-facing folds, not part of that pinned
// data-lane contract.
// ---------------------------------------------------------------------------

interface DailyActivityLike {
  date: string;
  rounds: number;
}

/** Sum the trailing `days` entries of an already-built, oldest-first daily
 *  series (`buildDailyActivity`'s output shape). Used for "rounds in the
 *  last 7 days" without a second query — the 30-day series already carries
 *  every day the 7-day window needs. */
export function sumRecentDays(daily: readonly DailyActivityLike[], days: number): number {
  if (days <= 0 || daily.length === 0) return 0;
  return daily.slice(-days).reduce((sum, d) => sum + d.rounds, 0);
}

interface ErrorClusterLike {
  fingerprint: string;
  title: string;
  severity: string;
  occurrences: number;
  href: string;
}

export interface TeamErrorHealthSummary {
  /** Worst severity across all clusters, by `ALL_SEVERITIES` rank
   *  (`@/lib/admin/severity`) — null when there are no clusters at all. An
   *  unrecognized severity string ranks lowest rather than throwing, since
   *  this is a display fold, not a validator. */
  worstSeverity: string | null;
  /** The cluster with the most occurrences — the team's single most
   *  dominant recurring issue. Ties keep the first (most-recent, since
   *  `errors` arrives most-recent-cluster-first) match. Null when there are
   *  no clusters. */
  topSignature: ErrorClusterLike | null;
}

const SEVERITY_RANK: Record<string, number> = Object.fromEntries(ALL_SEVERITIES.map((s, i) => [s, i]));

/** Pure, unit-tested: folds the team's already-fetched error clusters
 *  (`TeamDetailErrorCluster[]` from `team-detail.ts`) into the two headline
 *  facts a health strip wants — no new query, no re-grouping. */
export function summarizeErrorHealth(errors: readonly ErrorClusterLike[]): TeamErrorHealthSummary {
  // Seeded null and narrowed by the loop rather than primed with `errors[0]`:
  // under `noUncheckedIndexedAccess` an index read is `T | undefined`, and the
  // `length === 0` guard does not narrow it — so the primed version needed a
  // non-null assertion to compile. Building up from null keeps the same
  // first-max-wins tie-breaking with no assertion and no early return.
  let worst: ErrorClusterLike | null = null;
  let top: ErrorClusterLike | null = null;
  for (const e of errors) {
    if (worst === null || (SEVERITY_RANK[e.severity] ?? -1) > (SEVERITY_RANK[worst.severity] ?? -1)) {
      worst = e;
    }
    if (top === null || e.occurrences > top.occurrences) top = e;
  }
  return { worstSeverity: worst?.severity ?? null, topSignature: top };
}

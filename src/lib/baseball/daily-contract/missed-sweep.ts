// =============================================================================
// src/lib/baseball/daily-contract/missed-sweep.ts
//
// V5 Daily Contract — the MISSED roll-over sweep (the state-machine edge case the
// honesty model requires).
//
// THE GAP THIS CLOSES
//   The schema defines status IN ('draft','committed','completed','missed') and
//   the migration comment is explicit: "'missed' -> a committed day passed without
//   completion (set by app layer)". Nothing in the app layer ever set it. A player
//   who COMMITTED to a day but never COMPLETED it left a permanent 'committed' row.
//   computeStreak already breaks the streak (only 'completed' counts), so the
//   number was honest — but the abandoned day was never SURFACED as 'missed' to the
//   player or (when shared) to staff. The accountability half of the commitment
//   loop was silently dropped: the day just froze as "in progress" forever.
//
// WHAT THE SWEEP DOES (daily roll-over, idempotent, non-destructive UPDATE)
//   For each team, find contracts whose contract_date is STRICTLY BEFORE the
//   cutover date and whose status is still 'committed' (a locked-in day that the
//   player never closed). Transition each to 'missed'. A still-'draft' past day is
//   ALSO closed to 'missed' only when it was committed (committed_at set) — a pure
//   draft a player never committed to is NOT an accountability miss, so it is left
//   alone (honesty: you can only "miss" a day you committed to).
//
//   The transition is the SOURCE -> SIGNAL -> ACTION -> TIMELINE/OUTCOME loop:
//     source : a committed day rolled past its date without completion
//     signal : status flips committed -> missed (visible to player + shared staff)
//     action : (none required of the player — the day is closed honestly)
//     outcome: a player_only timeline event records the missed commitment so the
//              development story stays honest (it never hides a broken commitment),
//              AND the streak/history read-models now reflect the gap explicitly.
//
// SAFETY / HONESTY
//   - ONLY 'committed' -> 'missed'. 'completed' is terminal (never reopened);
//     'draft' is left as-is unless it was actually committed (committed_at set).
//   - STRICTLY-BEFORE the cutover: today's committed day is never prematurely
//     missed — the player still has the day to finish it.
//   - Idempotent: a row already 'missed'/'completed' is filtered out by the query,
//     so re-running the sweep is a no-op (re-measuring is safe).
//   - Non-destructive: a single UPDATE of status + missed_at. Items jsonb,
//     reflection, visibility, and coach ack are untouched.
//   - Service-role admin client (no user session in a cron). Every query is scoped
//     by team_id, so cross-team leakage is impossible. The timeline event is
//     player_only system-provenance (honest: the system detected the miss; it is
//     never widened past player_only and never authored as coach prose).
//   - Best-effort timeline write: a failed event NEVER rolls back the status
//     transition (the status flip is the source of truth; the timeline is the echo).
//
// Pure async function over a minimally-typed client (mirrors outcome-sweep.ts), so
// it is unit-testable with an in-memory fake and runs identically under the cron.
// =============================================================================

import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import type { DailyContractItem } from '@/lib/types/baseball-passport';
import { logServerError } from '@/lib/server-error-logger';

// isoMinusDays now lives in the shared contract-day module (killing the former
// triple-duplication across the read-models + this sweep). Re-exported here so
// existing importers (and the test) keep their import path.
export { isoMinusDays } from '@/lib/baseball/daily-contract/contract-day';

// A minimally-typed client so the sweep runs against the service-role admin client
// (the trusted Inngest cron) the same way outcome-sweep.ts does. Every query is
// scoped by team_id; the admin client is the only RLS-bypass path, reserved here
// for a system-provenance roll-over.
export type MissedSweepClient = {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  from: (table: string) => any;
};

/**
 * The timeline echo is best-effort and decoupled from the status flip. We inject
 * the writer so the core can be unit-tested without the service-role client.
 */
export type MissedTimelineWriter = (input: {
  teamId: string;
  playerId: string;
  title: string;
  body: string | null;
  sourceId: string;
  occurredAt: string;
}) => Promise<{ ok: boolean }>;

export interface MissedSweepResult {
  /** Past committed rows considered for transition. */
  evaluated: number;
  /** Rows actually flipped committed -> missed this pass. */
  missed: number;
  /** Timeline echoes successfully appended (<= missed; best-effort). */
  timelineWritten: number;
}

/** The minimal contract-row shape the sweep needs (loose — not in db types). */
interface SweepContractRow {
  id: string;
  player_id: string;
  team_id: string;
  contract_date: string;
  status: string;
  committed_at: string | null;
  items: DailyContractItem[] | null;
}

/**
 * Pure predicate: is this past row an honest accountability MISS?
 *
 * A row is a miss when, AS OF the cutover date:
 *   - its contract_date is STRICTLY BEFORE the cutover (today is never missed), AND
 *   - it was genuinely COMMITTED (status 'committed', OR committed_at is set on a
 *     'draft' row that committed then was edited back to draft — defensive), AND
 *   - it is not already terminal ('completed' or 'missed').
 *
 * Exported so the transition rule is unit-testable in isolation.
 */
export function isMissedContract(
  row: Pick<SweepContractRow, 'contract_date' | 'status' | 'committed_at'>,
  cutoverDateIso: string,
): boolean {
  if (row.contract_date >= cutoverDateIso) return false; // today/future: still live
  if (row.status === 'completed' || row.status === 'missed') return false; // terminal
  if (row.status === 'committed') return true;
  // A 'draft' past day is only a miss if it was actually committed at some point.
  // A pure never-committed draft is NOT an accountability miss (honesty).
  if (row.status === 'draft' && row.committed_at) return true;
  return false;
}

/**
 * Build the honest timeline title/body for a missed day. Counts honored items so
 * the echo is truthful about partial progress ("2/4 honored before the day closed")
 * rather than a flat "you failed".
 */
export function missedTimelineCopy(row: SweepContractRow): {
  title: string;
  body: string | null;
} {
  const items = Array.isArray(row.items) ? row.items : [];
  const honored = items.filter((i) => i.done).length;
  const total = items.length;
  const title =
    total > 0
      ? `Daily contract missed — ${honored}/${total} honored before the day closed`
      : 'Daily contract missed — the day closed without completion';
  const body =
    'You committed to this day but didn’t close it out. Missed days are shown ' +
    'honestly so your streak and story stay true — pick it back up today.';
  return { title, body };
}

/**
 * Run the missed roll-over sweep for a SINGLE team.
 *
 * @param client          Service-role admin client (or a test fake) with `.from`.
 * @param teamId          Team scope — every query is scoped by it.
 * @param cutoverDateIso  The ISO date treated as "today"; contracts strictly
 *                        before it that are still committed become 'missed'.
 * @param writeTimeline   Best-effort timeline echo writer (injected for testing).
 *
 * Idempotent: a re-run finds no still-committed past rows and is a no-op. Never
 * throws on a per-row timeline failure (best-effort); a status-update DB error
 * does throw so the cron's per-team step.run() retries that team in isolation.
 */
export async function sweepMissedContracts(
  client: MissedSweepClient,
  teamId: string,
  cutoverDateIso: string,
  writeTimeline: MissedTimelineWriter,
): Promise<MissedSweepResult> {
  // Pull EVERY candidate row: this team, strictly-past, still 'committed' or a
  // committed-then-draft row. The old `.limit(5000)` was silently capped to 1000
  // by PostgREST (max_rows), so a backlog over 1000 only drained 1000 rows per
  // nightly run instead of clearing in full — a misleading bound that left real
  // past commitments un-missed for days. We paginate the full candidate set with
  // a stable order (contract_date asc, id asc tiebreak so page boundaries are
  // deterministic when many players share a date) and close the whole backlog in
  // one pass. Each candidate is still a single non-destructive per-row UPDATE.
  const { data, error } = await fetchAllRowsResult<SweepContractRow>((from, to) =>
    client
      .from('baseball_player_daily_contracts')
      .select('id, player_id, team_id, contract_date, status, committed_at, items')
      .eq('team_id', teamId)
      .lt('contract_date', cutoverDateIso)
      .in('status', ['committed', 'draft'])
      .order('contract_date', { ascending: true })
      .order('id', { ascending: true })
      .range(from, to),
  );

  if (error) {
    throw new Error(
      `missed-sweep: could not load contracts for team ${teamId}: ${
        (error as { message?: string }).message ?? 'unknown error'
      }`,
    );
  }

  const rows = (data ?? []) as SweepContractRow[];
  const candidates = rows.filter((r) => isMissedContract(r, cutoverDateIso));

  const nowIso = new Date().toISOString();
  let missed = 0;
  let timelineWritten = 0;
  // Best-effort timeline echo failures — never rethrown per-row (the status
  // transition already stands), accumulated and reported as ONE roll-up trace
  // after the loop instead of silently dropped.
  let timelineFailed = 0;
  const failureSamples: string[] = [];

  for (const row of candidates) {
    // Non-destructive single-row UPDATE: status + missed_at only. We also re-assert
    // the status guard in the WHERE clause so a concurrent completion (player closes
    // the day at the boundary) is NEVER clobbered into 'missed' — the update simply
    // affects zero rows in that race.
    const { error: updErr } = await client
      .from('baseball_player_daily_contracts')
      .update({ status: 'missed', missed_at: nowIso, updated_at: nowIso })
      .eq('id', row.id)
      .eq('team_id', teamId)
      .in('status', ['committed', 'draft']);

    if (updErr) {
      // A status-update failure is a real DB error: throw so the per-team
      // step.run() retry boundary re-attempts this team. We have not written a
      // timeline echo yet, so there is nothing to reconcile.
      throw new Error(
        `missed-sweep: status update failed for contract ${row.id}: ${
          (updErr as { message?: string }).message ?? 'unknown error'
        }`,
      );
    }
    missed += 1;

    // Best-effort honest echo into the development story. A failure here never
    // rolls back the (already-committed) status flip — the flip is the truth.
    try {
      const { title, body } = missedTimelineCopy(row);
      const res = await writeTimeline({
        teamId,
        playerId: row.player_id,
        title,
        body,
        sourceId: row.id,
        // Stamp the echo at the missed day, not "now", so the story reads in order.
        occurredAt: `${row.contract_date}T23:59:59.000Z`,
      });
      if (res.ok) timelineWritten += 1;
    } catch (err) {
      // Swallowed by design (best-effort). The status transition stands.
      timelineFailed += 1;
      if (failureSamples.length < 5) {
        failureSamples.push(`${row.id}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  if (timelineFailed > 0) {
    await logServerError(
      `missed-sweep: ${timelineFailed} timeline echo write(s) failed for team ${teamId}`,
      {
        action: 'sweepMissedContracts',
        sport: 'baseball',
        source: 'background_job',
        skipSentry: true,
        teamId,
        metadata: { failed: timelineFailed, sample: failureSamples },
      },
      'warning',
    );
  }

  return { evaluated: candidates.length, missed, timelineWritten };
}

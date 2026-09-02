import 'server-only';
import { cache } from 'react';

/**
 * Helm Bridge — the self-healing loop's combined board: runtime AND
 * capability, per stage and for the loop as a whole.
 *
 * `data/jobs.ts` already reads the per-stage heartbeat for the Jobs tab; this
 * module reads the same heartbeat history plus the independent evidence that
 * proves — or fails to prove — each stage has ever done its job. See
 * `selfheal-capability.ts` for why the two are different facts and why
 * conflating them is the bug this file exists to not repeat.
 *
 * Every evidence read below is independent and fail-soft: one query erroring
 * degrades exactly ONE capability field to `null` (which `deriveStageCapability`
 * turns into `'unknown'`, never `'unproven'`) and never takes the rest of the
 * board down. `Promise.all` is safe here because every promise in it is
 * already-safe — the Supabase query builder resolves `{ data, error }` rather
 * than rejecting, and `fetchReliabilitySnapshot` / `fetchWorkLog` already
 * catch their own failure modes and return an `AdminFetchResult`.
 */

import { createAdminClient } from '@/lib/supabase/admin';
import { ok, type AdminFetchResult } from '@/lib/admin/fetch-result';
import {
  SELFHEAL_STAGES,
  classifySelfHealStage,
  summarizeLoop,
  type SelfHealStage,
  type SelfHealStageRow,
  type SelfHealLoopStatus,
} from '@/lib/admin/selfheal-registry';
import type { CronBoardStatus } from '@/lib/admin/cron-registry';
import {
  deriveStageCapability,
  deriveLoopCapability,
  summarizeLoopVerdict,
  type StageCapability,
  type CapabilityEvidence,
  type CapabilityState,
  type LoopVerdict,
} from '@/lib/admin/selfheal-capability';
import { deriveRunOutcome, type StageRunOutcome } from '@/lib/admin/selfheal-provenance';
import { fetchReliabilitySnapshot } from '@/lib/admin/data/reliability';
import type { ReliabilitySnapshot } from '@/lib/admin/data/reliability';
import { fetchWorkLog, type WorkLogSnapshot } from '@/lib/admin/github-pr-timeline';

type AdminClient = ReturnType<typeof createAdminClient>;

/** Runs kept per stage — feeds the run-history heatmap. 14 covers two weeks
 *  of a daily stage, which is every stage in `SELFHEAL_STAGES` today. */
const HISTORY_LIMIT_PER_STAGE = 14;

/** Lookback window for "analyses written" — matches the Diagnose contract's
 *  own 72h unresolved-fingerprint window with headroom, so a quiet day or two
 *  inside an otherwise-working loop does not read as `unproven`. */
const ANALYSES_WINDOW_DAYS = 7;

export interface StageRunRecord {
  startedAt: string | null;
  completedAt: string | null;
  status: string;
  durationMs: number | null;
  errorMessage: string | null;
}

/**
 * `background_job_logs.metadata` is `jsonb` and typed `unknown` all the way
 * through this module. It is narrowed in exactly one place —
 * `deriveRunOutcome` — so a shape change has one site to fix rather than one
 * per consumer.
 */
export type { StageRunOutcome };

export interface SelfHealStageDetail extends SelfHealStageRow {
  capability: StageCapability;
  /** Newest first, capped at `HISTORY_LIMIT_PER_STAGE` — the run-history
   *  heatmap. Empty when the stage's history could not be read (`unreadable`
   *  on the base row is the honest signal for that, not an empty array read
   *  as "never ran"). */
  history: StageRunRecord[];
  /** When the next run is expected, from `lastRunAt + cadenceMinutes`. Null
   *  whenever `lastRunAt` is null — there is nothing to add a cadence to. */
  nextExpectedAt: string | null;
  /**
   * The instant this stage starts reading OVERDUE — `lastRunAt +
   * cadenceMinutes * 1.5`, which is exactly where `classifyCronStatus` draws
   * that line (`ageMinutes > entry.cadenceMinutes * 1.5`, measured from
   * `started_at`).
   *
   * Carried rather than re-derived in the view because the 1.5 multiplier is
   * the kind of constant that gets copied once and then drifts. A stage past
   * `nextExpectedAt` but short of this instant is LATE, not overdue, and the
   * board said neither before this existed — it printed a bare past timestamp
   * under the label "Next expected" and left the reader to infer a fault that
   * the classifier had explicitly not found.
   */
  overdueAt: string | null;
  /**
   * What the most recent run recorded about its own work, including whether a
   * human did part of it. See `selfheal-provenance.ts` for why a heartbeat's
   * provenance is a fact this board has to carry rather than assume.
   */
  lastOutcome: StageRunOutcome | null;
}

export interface SelfHealBoard {
  stages: SelfHealStageDetail[];
  runtime: SelfHealLoopStatus;
  capability: CapabilityState;
  verdict: LoopVerdict;
  evidence: CapabilityEvidence;
  /** Job types whose heartbeat history could not be read — distinct from a
   *  stage that read cleanly and has simply never run. */
  unreadable: string[];
  computedAt: string;
}

interface BackgroundJobLogRow {
  job_type: string;
  status: string;
  /** Carries `degraded: true` when a run finished but reported that part of
   *  its own work failed. Selected AND passed through — a status derived from
   *  a column the query never fetched is a status that never fires. */
  metadata: unknown;
  started_at: string;
  completed_at: string | null;
  duration_ms: number | null;
  error_message: string | null;
}

/**
 * Count of `admin_events` rows with `event_type = 'rca_analysis'` in the
 * lookback window, plus the newest `created_at` across ALL such rows (not
 * window-limited — a proven capability's "last demonstrated" fact should not
 * itself expire the moment the window rolls past it). Both independently
 * `null` on their own query failure.
 */
async function fetchAnalysesEvidence(
  admin: AdminClient,
  now: Date,
): Promise<{ count: number | null; lastAt: string | null }> {
  const since = new Date(now.getTime() - ANALYSES_WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

  const [countRes, latestRes] = await Promise.all([
    admin
      .from('admin_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'rca_analysis')
      .gte('created_at', since),
    admin
      .from('admin_events')
      .select('created_at')
      .eq('event_type', 'rca_analysis')
      .order('created_at', { ascending: false })
      .limit(1),
  ]);

  return {
    count: countRes.error ? null : (countRes.count ?? 0),
    lastAt: latestRes.error ? null : (latestRes.data?.[0]?.created_at ?? null),
  };
}

/**
 * Count of `admin_error_resolutions` rows with `resolution_source = 'auto'`,
 * plus the newest `resolved_at` among them. No lookback window — an auto
 * resolution recorded once, ever, is a real demonstration that Close has
 * worked, and the count exists to show scale, not recency.
 */
async function fetchAutoResolutionEvidence(
  admin: AdminClient,
): Promise<{ count: number | null; lastAt: string | null }> {
  const [countRes, latestRes] = await Promise.all([
    admin
      .from('admin_error_resolutions')
      .select('fingerprint', { count: 'exact', head: true })
      .eq('resolution_source', 'auto'),
    admin
      .from('admin_error_resolutions')
      .select('resolved_at')
      .eq('resolution_source', 'auto')
      .order('resolved_at', { ascending: false })
      .limit(1),
  ]);

  return {
    count: countRes.error ? null : (countRes.count ?? 0),
    lastAt: latestRes.error ? null : (latestRes.data?.[0]?.resolved_at ?? null),
  };
}

/**
 * Correlated signals in the latest READABLE reliability snapshot. Null when
 * the snapshot read failed or the latest run's metadata could not be parsed
 * (`run: null` on `ReliabilityRunRow` — see `reliability.ts`'s `parseRun`) —
 * both are "we could not look", never "zero signals".
 */
function signalsFromSnapshot(res: AdminFetchResult<ReliabilitySnapshot>): number | null {
  if (res.status !== 'ok' || !res.data) return null;
  const run = res.data.latest?.run ?? null;
  return run ? run.signals.length : null;
}

/**
 * Repair PRs that name an incident, per `repairIncidentIds` on each
 * `WorkLogEntry` (see `github-pr-timeline.ts` / `incidents/repair-link.ts`),
 * plus the newest `created_at` among them. Null count when the work log
 * itself could not be read or GitHub is unconfigured — a Repair stage that
 * simply has no PR evidence yet still reads `count: 0`, which is `unproven`,
 * not `unknown`.
 */
function repairEvidenceFromWorkLog(
  res: AdminFetchResult<WorkLogSnapshot>,
): { count: number | null; lastAt: string | null } {
  if (res.status !== 'ok' || !res.data) return { count: null, lastAt: null };

  const matches = res.data.entries.filter((entry) => entry.repairIncidentIds.length > 0);
  if (matches.length === 0) return { count: 0, lastAt: null };

  const lastAt = matches.reduce<string | null>((latest, entry) => {
    if (!latest) return entry.created_at;
    return Date.parse(entry.created_at) > Date.parse(latest) ? entry.created_at : latest;
  }, null);

  return { count: matches.length, lastAt };
}

/**
 * CALLER must have passed `requireSuperAdmin()` — same contract as every
 * other Bridge data reader. Reads go through `createAdminClient()` (service
 * role) against plain tables.
 */
export async function fetchSelfHealBoard(now: Date = new Date()): Promise<AdminFetchResult<SelfHealBoard>> {
  const admin = createAdminClient();

  // One bounded query PER stage, same shape and same reason as
  // `fetchJobsTab`'s per-job-type reads: a single globally-ordered query
  // would let a high-frequency job crowd a daily stage out of the fetched
  // window, and that stage would then read `never-ran` — the neutral,
  // non-alarming status — while it had actually failed days earlier.
  const [stageRuns, analysesEvidence, autoResolutionEvidence, reliabilityRes, workLogRes] = await Promise.all([
    Promise.all(
      SELFHEAL_STAGES.map((stage) =>
        admin
          .from('background_job_logs')
          .select('job_type, status, started_at, completed_at, duration_ms, error_message, metadata')
          .eq('job_type', stage.jobType)
          .order('started_at', { ascending: false })
          .limit(HISTORY_LIMIT_PER_STAGE),
      ),
    ),
    fetchAnalysesEvidence(admin, now),
    fetchAutoResolutionEvidence(admin),
    fetchReliabilitySnapshot(),
    fetchWorkLog(),
  ]);

  const repairEvidence = repairEvidenceFromWorkLog(workLogRes);

  const evidence: CapabilityEvidence = {
    signalsCollected: signalsFromSnapshot(reliabilityRes),
    analysesWritten: analysesEvidence.count,
    repairPrsOpened: repairEvidence.count,
    autoResolutionsRecorded: autoResolutionEvidence.count,
    lastProvenAt: {
      triage: analysesEvidence.lastAt,
      repair: repairEvidence.lastAt,
      close: autoResolutionEvidence.lastAt,
    },
  };

  // Per-stage reads degrade individually rather than taking the board down:
  // one unreadable stage must not hide the other two. But it is NAMED, not
  // silently rendered as "never ran" — same rule `fetchJobsTab` follows.
  const unreadable: string[] = [];
  SELFHEAL_STAGES.forEach((stage, i) => {
    if (stageRuns[i]?.error) unreadable.push(stage.jobType);
  });

  const stages: SelfHealStageDetail[] = SELFHEAL_STAGES.map((stage: SelfHealStage, i) => {
    const result = stageRuns[i];
    const isUnreadable = Boolean(result?.error);
    const runs = (isUnreadable ? [] : (result?.data ?? [])) as BackgroundJobLogRow[];
    const last = runs[0] ?? null;

    const status: CronBoardStatus = isUnreadable
      ? 'never-ran'
      : classifySelfHealStage(
          stage,
          last ? { started_at: last.started_at, status: last.status, metadata: last.metadata } : null,
          now,
        );

    // THE SPLIT. `error_message` is the only free-text column a stage has, so
    // a run that succeeds and wants to explain itself writes its explanation
    // in the error column. Whether that text is an ERROR is decided by the
    // run's classified status, not by the column it arrived in.
    //
    // `failed` and `degraded` are both real faults: the first ran and failed,
    // the second ran and reported that part of its own work failed. Anything
    // else that carries text is a note from a run that worked. Keying on the
    // classified status (rather than on `last.status`) is what makes
    // `degraded` — which is derived from metadata, not from the status column
    // — land on the correct side of this line.
    const isFault = status === 'failed' || status === 'degraded';
    const freeText = last?.error_message ?? null;

    const row: SelfHealStageRow = {
      ...stage,
      status,
      lastRunAt: last?.started_at ?? null,
      lastRunStatus: last?.status ?? null,
      lastError: isFault ? freeText : null,
      lastNote: isFault ? null : freeText,
      unreadable: isUnreadable,
    };

    return {
      ...row,
      capability: deriveStageCapability(stage, evidence),
      history: runs.map(
        (r): StageRunRecord => ({
          startedAt: r.started_at,
          completedAt: r.completed_at,
          status: r.status,
          durationMs: r.duration_ms,
          errorMessage: r.error_message,
        }),
      ),
      nextExpectedAt: row.lastRunAt
        ? new Date(new Date(row.lastRunAt).getTime() + stage.cadenceMinutes * 60_000).toISOString()
        : null,
      // 1.5x the cadence FROM THE LAST RUN — the same anchor and the same
      // multiplier `classifyCronStatus` uses. Not `nextExpectedAt + half a
      // cadence`, which lands on the same instant today only because both
      // are derived from one `lastRunAt`, and would silently diverge the
      // moment either side gained a grace period.
      overdueAt: row.lastRunAt
        ? new Date(new Date(row.lastRunAt).getTime() + stage.cadenceMinutes * 1.5 * 60_000).toISOString()
        : null,
      lastOutcome: last ? deriveRunOutcome(last.metadata) : null,
    };
  });

  const runtime = summarizeLoop(stages);
  const capability = deriveLoopCapability(stages.map((s) => s.capability));

  return ok<SelfHealBoard>({
    stages,
    runtime,
    capability,
    verdict: summarizeLoopVerdict({ runtime, capability }),
    evidence,
    unreadable,
    computedAt: now.toISOString(),
  });
}

/**
 * Per-request memoised self-heal board.
 *
 * The Overview reads this twice — the truth strip and the attention queue both
 * need the loop's stages — and each read is a Supabase heartbeat sweep plus a
 * GitHub work-log pull. Without this they run twice per render for one answer.
 *
 * Takes NO arguments on purpose. React's `cache()` keys on argument REFERENCE
 * identity, so a `Date` parameter would give every call site its own key and
 * memoise nothing at all — the trap `cachedIncidentBoard` documents for object
 * literals. Callers that need to pin `now` (tests, and anything reasoning
 * about a fixed instant) call `fetchSelfHealBoard` directly and skip the
 * memoisation, which is the honest trade: a pinned clock is not the same query.
 */
export const cachedSelfHealBoard = cache(() => fetchSelfHealBoard());

import 'server-only';

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
import {
  deriveStageCapability,
  deriveLoopCapability,
  summarizeLoopVerdict,
  type StageCapability,
  type CapabilityEvidence,
  type CapabilityState,
  type LoopVerdict,
} from '@/lib/admin/selfheal-capability';
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
          .select('job_type, status, started_at, completed_at, duration_ms, error_message')
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

    const row: SelfHealStageRow = {
      ...stage,
      status: isUnreadable
        ? 'never-ran'
        : classifySelfHealStage(
            stage,
            last ? { started_at: last.started_at, status: last.status } : null,
            now,
          ),
      lastRunAt: last?.started_at ?? null,
      lastRunStatus: last?.status ?? null,
      lastError: last?.error_message ?? null,
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

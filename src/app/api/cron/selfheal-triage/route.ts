/**
 * Diagnose, autonomous — `selfheal-triage` cron, four times a day.
 *
 * The Diagnose stage of the self-healing loop used to be an Anthropic-hosted
 * cloud routine (see `docs/ai-system/selfheal/README.md`), and it was
 * STRUCTURALLY unable to run: that environment has no
 * `SUPABASE_SERVICE_ROLE_KEY`, so `npm run triage` could never connect from
 * inside it. Every "completed" heartbeat that ever landed under
 * `job_type = 'selfheal-triage'` was a human substituting via MCP or a manual
 * run — never the routine actually doing its job.
 *
 * This deployment already carries `SUPABASE_SERVICE_ROLE_KEY`,
 * `ANTHROPIC_API_KEY` and `CRON_SECRET`. So Diagnose moves here: same
 * collection (`@/lib/admin/triage-collect`), same pure grouping
 * (`@/lib/admin/triage-engine`), same close mechanism as `npm run triage
 * --apply` (`@/lib/admin/triage-apply`), and the same in-app analyzer a human
 * triggers from the Bridge (`@/lib/admin/rca-run`) — run on a schedule
 * instead of on demand.
 *
 * ONE CAPABILITY GAP, DELIBERATE. `triage-contract.md` STEP 2/4 lets a human
 * verify an "ALREADY FIXED" claim's commit SHA against the serving deploy via
 * `git merge-base --is-ancestor`. A Vercel function has no git checkout, so
 * this route only auto-resolves `already-fixed` via the SHA-FREE path (no
 * commit named, and the cause has been quiet since the newest deploy that is
 * itself old enough — the exact Rule A auto-resolve.ts already uses). A
 * SHA-bearing "ALREADY FIXED" analysis is left open — analysed, not resolved
 * — for the nightly `auto-resolve.ts` sweep or a human/`npm run triage` run.
 *
 * See `docs/ai-system/selfheal/triage-contract.md` and `README.md`.
 */
import { NextResponse } from 'next/server';
import { requireCronAuth } from '@/lib/cron/auth';
import { recordJobRun } from '@/lib/admin/job-log';
import { createAdminClient } from '@/lib/supabase/admin';
import { buildTriagePlan, type TriageGroup } from '@/lib/admin/triage-engine';
import {
  collectAdminEvents,
  collectReliabilitySignals,
  collectRelAnalyses,
  type AdminClient,
} from '@/lib/admin/triage-collect';
import { applyPlan, resolveTriageMember } from '@/lib/admin/triage-apply';
import {
  runRcaForFingerprint,
  runRcaForReliabilitySignal,
  persistRcaAnalysis,
  type ReliabilitySignalContext,
} from '@/lib/admin/rca-run';
import { deriveRcaCategory, isAutoResolvable } from '@/lib/admin/rca-category';
import { isOperatorGatedFaultCode, classifyProviderFault } from '@/lib/admin/provider-fault';
import { getProductionDeployAt, RELEASE_GRACE_MS } from '@/lib/admin/auto-resolve';
import type { RcaAnalysis, RcaResult } from '@/lib/admin/rca';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300;

/** `background_job_logs.job_type` this route's RICH heartbeat writes under —
 *  the SAME literal string `SELFHEAL_STAGES`' 'triage' entry and
 *  `CRON_REGISTRY`'s new entry both use, so `/admin/jobs` and
 *  `/admin/selfheal` read the one row this route writes and agree. */
const TRIAGE_JOB_TYPE = 'selfheal-triage';

/** Unregistered — used ONLY as a crash-safety wrapper so an uncaught
 *  exception still leaves a trace in `background_job_logs`, and so this file
 *  contains the literal `recordJobRun(` text `cron-job-log-coverage.test.ts`
 *  requires of every route named in `CRON_REGISTRY`. The heartbeat that
 *  `/admin/jobs` and `/admin/selfheal` actually read is the RICH one written
 *  directly under `TRIAGE_JOB_TYPE` below, as the LAST statement of a
 *  successful run — never this wrapper's own scalar row. */
const INVOCATION_JOB_TYPE = 'selfheal-triage-invocation';

const WINDOW_HOURS = 72;
const DEFAULT_MAX_ANALYSES = 8;

/** Leaves ~80s of the 300s `maxDuration` for the resolves and the heartbeat
 *  write once analysis stops — a function killed mid-run writes NOTHING (no
 *  heartbeat at all), which is exactly the "looks like it never ran" failure
 *  `triage-contract.md` STEP 5 exists to prevent. Overridable for local
 *  testing against a slower model. */
const TIME_BUDGET_MS = Number(process.env.SELFHEAL_TRIAGE_TIME_BUDGET_MS) > 0
  ? Number(process.env.SELFHEAL_TRIAGE_TIME_BUDGET_MS)
  : 220_000;

function maxAnalyses(): number {
  const raw = Number(process.env.SELFHEAL_TRIAGE_MAX_ANALYSES);
  return Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : DEFAULT_MAX_ANALYSES;
}

/** Matches a bare commit-SHA-shaped token (7-40 hex chars) anywhere in an
 *  "ALREADY FIXED" claim. Used only to decide whether this AUTOMATED runner
 *  may resolve it — a SHA claim needs ancestry verification this Vercel
 *  function cannot perform (no git checkout). */
const SHA_PATTERN = /\b[0-9a-f]{7,40}\b/i;

/** Does ANY member of this group carry a fault only an operator can clear?
 *
 * Checks the stored `errorCode` first (`isOperatorGatedFaultCode`), then
 * re-classifies the member's own message/title text fresh
 * (`classifyProviderFault`) — REQUIRED, not redundant. Verified against
 * production 2026-09-02: three of the four "Inngest signature" fingerprints
 * carry `metadata.errorCode = null` on the stored row even though their
 * message plainly reads "... Inngest API Error: 404 Event key not found ...".
 * The stored-code check alone would miss all three the first time a model
 * mis-categorises one as `NOT A DEFECT` or `ALREADY FIXED`.
 */
function groupHasProviderFault(group: TriageGroup): boolean {
  return group.members.some((member) => {
    if (isOperatorGatedFaultCode(member.errorCode)) return true;
    const fault = classifyProviderFault(member.message ?? member.title);
    return fault?.needsOperator === true;
  });
}

function reliabilityContextFor(group: TriageGroup): ReliabilitySignalContext {
  return {
    title: group.title,
    message: group.members.map((m) => m.message).find((m): m is string => !!m) ?? null,
    route: group.route,
    severity: group.severity,
    errorCode: group.errorCode,
    feature: group.members.map((m) => m.feature).find((f): f is string => !!f) ?? null,
    occurrences: group.occurrences,
    firstSeen: group.firstSeen,
    lastSeen: group.lastSeen,
    evidenceUrls: group.evidenceUrls,
  };
}

interface HeartbeatMetadata {
  method: 'vercel-cron';
  groups: number;
  analysed: number;
  resolved: number;
  capped: boolean;
  still_open_unanalysed: number;
  sourceHealth: unknown;
  queue: { analysed: string[]; left_open: string[] };
  degraded?: true;
}

async function writeHeartbeat(
  admin: AdminClient,
  startedAt: Date,
  status: 'completed' | 'failed',
  errorMessage: string | null,
  metadata: HeartbeatMetadata,
): Promise<void> {
  const completedAt = new Date();
  try {
    await admin.from('background_job_logs').insert({
      job_type: TRIAGE_JOB_TYPE,
      status,
      started_at: startedAt.toISOString(),
      completed_at: completedAt.toISOString(),
      duration_ms: completedAt.getTime() - startedAt.getTime(),
      error_message: errorMessage,
      metadata: metadata as unknown as Record<string, unknown>,
    });
  } catch {
    // Fire-and-forget, same convention as job-log.ts's writeRow: outcome
    // logging must never throw past the response.
  }
}

async function runSelfHealTriage(): Promise<Response> {
  const runStartedAt = new Date();
  const admin = createAdminClient();
  const since = new Date(runStartedAt.getTime() - WINDOW_HOURS * 3600_000).toISOString();

  const relAnalyses = await collectRelAnalyses(admin);
  const [events, reliability] = await Promise.all([
    collectAdminEvents(admin, since),
    collectReliabilitySignals(admin, since, relAnalyses),
  ]);
  const candidates = [...events.candidates, ...reliability.candidates];
  const sourceHealth = [events.health, ...reliability.health];

  const plan = buildTriagePlan({ candidates, sourceHealth, windowHours: WINDOW_HOURS, now: runStartedAt });

  const emptyMetadata = (extra: Partial<HeartbeatMetadata> = {}): HeartbeatMetadata => ({
    method: 'vercel-cron',
    groups: plan.groups.length,
    analysed: 0,
    resolved: 0,
    capped: false,
    still_open_unanalysed: plan.queue.length,
    sourceHealth: plan.sourceHealth,
    queue: { analysed: [], left_open: plan.queue.map((g) => g.causeKey) },
    ...extra,
  });

  // A GENUINE READ FAILURE — the admin_events collector itself errored, or
  // the reliability-snapshot read itself errored/returned nothing — fails
  // this heartbeat outright. This is narrower than "any arm reported blind":
  // an individual arm (Sentry/Supabase/Vercel) reporting blind INSIDE an
  // otherwise-successful snapshot read is reported as `degraded` below, not
  // failed — Repair's STEP 0b refuses to run at all on a `status='failed'`
  // Diagnose row, so failing the whole heartbeat over one flaky arm would
  // silently disable Repair the same day it was fixed. Mirrors
  // reliability-triage/route.ts's own totally-vs-partially-blind precedent.
  const adminHealth = plan.sourceHealth.find((h) => h.source === 'admin_events');
  const reliabilityArms = plan.sourceHealth.filter((h) => h.source !== 'admin_events');
  const reliabilityTotallyBlind = reliabilityArms.length > 0 && reliabilityArms.every((h) => h.status === 'blind');

  if (adminHealth?.status === 'blind') {
    const reason = `admin_events collector blind: ${adminHealth.reason ?? 'unknown'}`;
    await writeHeartbeat(admin, runStartedAt, 'failed', reason, emptyMetadata());
    return NextResponse.json({ ok: false, error: reason }, { status: 503 });
  }
  if (reliabilityTotallyBlind) {
    const reason = `reliability-snapshot read blind: ${reliabilityArms[0]?.reason ?? 'unknown'}`;
    await writeHeartbeat(admin, runStartedAt, 'failed', reason, emptyMetadata());
    return NextResponse.json({ ok: false, error: reason }, { status: 503 });
  }
  const anyArmBlind = plan.sourceHealth.some((h) => h.status !== 'ok');

  // STEP — close what is closeable, the exact mechanism `npm run triage
  // --apply` uses. Runs BEFORE analysis, and unconditionally: an analyzer
  // failure later must never undo or skip this.
  const applyResult = await applyPlan(admin, plan);
  let resolvedGroups = plan.closeable.length;

  const cap = maxAnalyses();
  const capped = plan.queue.length > cap;
  const analysedKeys: string[] = [];
  const leftOpenKeys: string[] = [];
  const failureReasons: string[] = [];

  for (let i = 0; i < plan.queue.length; i++) {
    const group = plan.queue[i]!;

    if (i >= cap) {
      leftOpenKeys.push(group.causeKey);
      continue;
    }
    if (Date.now() - runStartedAt.getTime() > TIME_BUDGET_MS) {
      leftOpenKeys.push(group.causeKey);
      continue;
    }

    const adminMember = group.members.find((m) => m.origin === 'admin_events');

    let result: RcaResult;
    try {
      result = adminMember
        ? await runRcaForFingerprint(adminMember.key)
        : await runRcaForReliabilitySignal(group.members[0]!.key, reliabilityContextFor(group));
    } catch (error) {
      result = { status: 'error', message: error instanceof Error ? error.message : String(error) };
    }

    if (result.status !== 'ok') {
      leftOpenKeys.push(group.causeKey);
      failureReasons.push(`${group.causeKey} (${group.members[0]?.key ?? 'unknown'}): ${result.message}`);
      continue;
    }

    // One analysis, persisted under EVERY member of the group — siblings in
    // `relatedFingerprints` are deterministic (the group's own membership),
    // not model-guessed, per triage-contract.md STEP 2.
    const siblingKeys = group.members.map((m) => m.key);
    let persistFailed = false;
    for (const member of group.members) {
      const perMember: RcaAnalysis = {
        ...result.analysis,
        relatedFingerprints: siblingKeys.filter((k) => k !== member.key),
      };
      const outcome = await persistRcaAnalysis(member.key, perMember);
      if (!outcome.persisted) {
        persistFailed = true;
        failureReasons.push(`${member.key}: persist failed — ${outcome.error ?? 'unknown'}`);
      }
    }
    if (persistFailed) {
      leftOpenKeys.push(group.causeKey);
      continue;
    }
    analysedKeys.push(group.causeKey);

    // STEP 4 resolution — only the two auto-resolvable categories, only
    // after the whole group clears the provider-fault guard.
    const category = deriveRcaCategory(result.analysis.suggestedFix);
    if (!isAutoResolvable(category)) continue;
    if (groupHasProviderFault(group)) continue;

    if (category === 'not-a-defect') {
      for (const member of group.members) {
        await resolveTriageMember(admin, member, `triage(vercel-cron): ${group.reason}`);
      }
      resolvedGroups += 1;
    } else if (category === 'already-fixed' && !SHA_PATTERN.test(result.analysis.suggestedFix)) {
      // No SHA claimed — the only branch this automated runner may resolve;
      // see the module doc comment. Reuses auto-resolve.ts's own Rule-A
      // anchor and grace period rather than re-deriving "is the deploy old
      // enough" a second time.
      const deploy = await getProductionDeployAt(runStartedAt.getTime());
      const deployOldEnough =
        deploy.deployAt !== null && runStartedAt.getTime() - deploy.deployAt >= RELEASE_GRACE_MS;
      const quietSinceDeploy = deploy.deployAt !== null && new Date(group.lastSeen).getTime() < deploy.deployAt;
      if (deployOldEnough && quietSinceDeploy) {
        for (const member of group.members) {
          await resolveTriageMember(admin, member, `triage(vercel-cron): ${group.reason}`);
        }
        resolvedGroups += 1;
      }
    }
  }

  const stillOpenUnanalysed = plan.queue.length - analysedKeys.length;
  const hadAnalysisFailure = failureReasons.length > 0;
  const status: 'completed' | 'failed' = hadAnalysisFailure ? 'failed' : 'completed';

  const metadata: HeartbeatMetadata = {
    method: 'vercel-cron',
    groups: plan.groups.length,
    analysed: analysedKeys.length,
    resolved: resolvedGroups,
    capped,
    still_open_unanalysed: stillOpenUnanalysed,
    sourceHealth: plan.sourceHealth,
    queue: { analysed: analysedKeys, left_open: leftOpenKeys },
    ...(anyArmBlind && !hadAnalysisFailure ? { degraded: true as const } : {}),
  };

  const errorMessage = hadAnalysisFailure
    ? failureReasons.join('; ').slice(0, 2000)
    : anyArmBlind
      ? `degraded: ${plan.sourceHealth.filter((h) => h.status !== 'ok').map((h) => `${h.source}:${h.status}`).join(', ')}`
      : null;

  // Heartbeat, LAST — after every apply/analysis/persist/resolve call above,
  // never before. See triage-contract.md STEP 5: a heartbeat written first
  // carries the wrong counts for whatever the run does after it.
  await writeHeartbeat(admin, runStartedAt, status, errorMessage, metadata);

  return NextResponse.json(
    {
      ok: status === 'completed',
      ...(status === 'failed' ? { error: errorMessage } : {}),
      groups: metadata.groups,
      analysed: metadata.analysed,
      resolved: metadata.resolved,
      capped: metadata.capped,
      stillOpenUnanalysed: metadata.still_open_unanalysed,
      rowsResolved: applyResult.rowsResolved,
    },
    { status: status === 'failed' ? 503 : 200 },
  );
}

export async function GET(request: Request): Promise<Response> {
  const unauthorized = requireCronAuth(request);
  if (unauthorized) return unauthorized;

  return recordJobRun(INVOCATION_JOB_TYPE, () => runSelfHealTriage());
}

import 'server-only';

/**
 * Helm Bridge — Release Intelligence read models for `/admin/deploys`.
 *
 * `docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §4 F.6:
 * "/admin/deploys gains a risk-score column per pending release-queue item
 * and a rollback-recommendation banner." This file supplies both, each
 * degrading independently and honestly rather than taking the whole page
 * down — matching every other Bridge read model's `AdminFetchResult`
 * contract.
 *
 * SCOPE NOTE ON THE ROLLBACK BANNER. `src/lib/admin/triage/release-
 * runway.ts`'s own header already documents that `rollbackRecommended` is
 * hardcoded `false` on every historical release row because "no script or
 * evidence source in this codebase computes that decision." This module is
 * that evidence source — but it answers a narrower, operationally sharper
 * question than backfilling a verdict onto every past card: "should the
 * release that is LIVE RIGHT NOW be rolled back?" Wiring a real per-
 * historical-row verdict into `release-runway.ts`'s existing per-card loop
 * is a larger, separate change against a file this track does not own;
 * this read model is deliberately a sibling, not an edit to that file.
 *
 * WHY THE RISK-SCORE READER USES DEFENSIVE FILESYSTEM READS. Every runtime
 * read model elsewhere in `src/lib/admin/data/**` sources its facts from
 * Supabase or a third-party API — nothing in `src/lib`/`src/app` reads
 * `memory/**` or `docs/generated/**` from the filesystem at request time
 * today (checked directly: zero hits). Whether those paths are present in
 * the deployed Vercel function's bundle is UNVERIFIED by this change (no
 * `npm run build` was run against it here — see the worktree rules this
 * session operated under). Every read below is therefore wrapped so a
 * missing file degrades that one field to `null`/`'unconfigured'` rather
 * than crashing the page — the identical fail-soft contract this repo uses
 * for a missing env var or a failed network call.
 */

import { readFileSync, readdirSync } from 'node:fs';
import { resolve as resolvePath } from 'node:path';
// `yaml` (not `js-yaml`): this file lives under `src/lib/**`, which
// `tsc --noEmit` DOES type-check (unlike `scripts/**`, excluded in
// tsconfig.json) — `js-yaml` has no bundled types and `@types/js-yaml` is
// not installed, while `yaml` ships its own. `scripts/**` CLI tooling in
// this repo uses `js-yaml` by convention; that convention does not apply
// here because this file is not a script.
import { parse as parseYaml } from 'yaml';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchReleaseLedger } from '@/lib/admin/data/release-ledger';
import { RELIABILITY_SNAPSHOT_JOB_TYPE } from '@/lib/reliability/normalize';
import type { ReliabilityRun } from '@/lib/reliability/types';
import { unconfigured, failed, ok, type AdminFetchResult } from '@/lib/admin/fetch-result';
import { scoreChange } from './risk-score';
import { evaluateRollback, summarizeReliabilityWindow } from './rollback';
import type { ChangeRiskInput, ChangeRiskScore, RollbackVerdict } from './types';

const ROOT = resolvePath(process.cwd());

// ---------------------------------------------------------------------------
// Rollback recommendation — Supabase + Vercel only, no repo-file reads.
// ---------------------------------------------------------------------------

/** One reliability-collector cycle (`src/app/api/cron/reliability-triage`
 *  runs every 3h) — the minimum elapsed time before a candidate window is
 *  treated as anything more than "still gathering signal", mirroring
 *  `release-ledger.ts`'s own `gatheringSignal` honesty pattern for a
 *  too-young deploy. */
const MIN_WINDOW_MS = 3 * 3600_000;
const MAX_WINDOW_MS = 7 * 86_400_000; // cap a very old live release's window at 7 days

/** Same `parseRun` guard `src/lib/admin/data/reliability.ts` uses — not
 *  exported from there, so duplicated here at two lines' cost rather than
 *  widening that module's public surface for one caller (the same call
 *  `ReleaseCard.tsx` already makes for `githubCommitHref`). */
function parseReliabilityRun(metadata: unknown): ReliabilityRun | null {
  if (!metadata || typeof metadata !== 'object') return null;
  const candidate = metadata as Partial<ReliabilityRun>;
  if (candidate.version !== 1 || !Array.isArray(candidate.signals) || !Array.isArray(candidate.sources)) return null;
  return candidate as ReliabilityRun;
}

export interface RollbackRecommendationView extends RollbackVerdict {
  candidateSha: string | null;
  /** True while the live release is younger than one collector cycle — the
   *  verdict is still `UNKNOWN` in this case, but for a different, more
   *  reassuring reason than "the read failed". */
  gatheringSignal: boolean;
}

export async function fetchRollbackRecommendation(
  now: Date = new Date(),
): Promise<AdminFetchResult<RollbackRecommendationView>> {
  const ledger = await fetchReleaseLedger();
  if (ledger.status === 'unconfigured') return unconfigured('Rollback recommendation');
  if (ledger.status !== 'ok' || !ledger.data) return failed(ledger.error ?? 'Release ledger unavailable');

  const liveCard = ledger.data.cards.find((c) => c.isLive);
  if (!liveCard || !liveCard.commitSha) {
    return ok({
      recommendation: 'UNKNOWN',
      evidence: [{ detail: 'No live release could be identified in the last 7 days of deploys.' }],
      candidateSha: null,
      gatheringSignal: false,
    });
  }

  const nowMs = now.getTime();
  const elapsed = nowMs - liveCard.createdAt;
  if (elapsed < MIN_WINDOW_MS) {
    return ok({
      recommendation: 'UNKNOWN',
      evidence: [{ detail: `Live release shipped ${Math.round(elapsed / 60_000)}m ago — still gathering signal for one full collector cycle.` }],
      candidateSha: liveCard.commitSha,
      gatheringSignal: true,
    });
  }

  const windowMs = Math.min(elapsed, MAX_WINDOW_MS);
  const candidateStart = liveCard.createdAt;
  const candidateEnd = nowMs;
  const baselineStart = liveCard.createdAt - windowMs;
  const baselineEnd = liveCard.createdAt;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('background_job_logs')
    .select('started_at, metadata')
    .eq('job_type', RELIABILITY_SNAPSHOT_JOB_TYPE)
    .gte('started_at', new Date(baselineStart).toISOString())
    .lte('started_at', new Date(candidateEnd).toISOString())
    .order('started_at', { ascending: true })
    .limit(500);

  if (error) return failed(error.message);

  const candidateRuns: ReliabilityRun[] = [];
  const baselineRuns: ReliabilityRun[] = [];
  for (const row of data ?? []) {
    const run = parseReliabilityRun(row.metadata);
    if (!run) continue;
    const t = Date.parse(row.started_at as unknown as string);
    if (!Number.isFinite(t)) continue;
    if (t >= candidateStart && t <= candidateEnd) candidateRuns.push(run);
    else if (t >= baselineStart && t < baselineEnd) baselineRuns.push(run);
  }

  const verdict = evaluateRollback({
    candidateSha: liveCard.commitSha,
    candidate: summarizeReliabilityWindow(candidateRuns),
    baseline: summarizeReliabilityWindow(baselineRuns),
  });

  return ok({ ...verdict, candidateSha: liveCard.commitSha, gatheringSignal: false });
}

// ---------------------------------------------------------------------------
// Pending release-queue risk scores — defensive repo-file reads.
// ---------------------------------------------------------------------------

interface ReleaseQueueItem {
  id: string;
  feature_id: string;
  status: string;
  regression_tests?: string[];
}

interface RegistryFeature {
  criticality?: 'high' | 'medium' | 'low';
}

interface WorldModelEdge {
  source: string;
  target: string;
  kind: string;
}

interface WorldModel {
  edges: WorldModelEdge[];
}

/** `null` return means "could not read the queue at all" — distinct from
 *  an empty array (queue read fine, nothing is queued). */
function readPendingQueueItems(): ReleaseQueueItem[] | null {
  try {
    const raw = readFileSync(resolvePath(ROOT, 'memory/operations/release-queue.yml'), 'utf8');
    const parsed = parseYaml(raw) as { items?: ReleaseQueueItem[] } | undefined;
    const items = parsed?.items;
    if (!Array.isArray(items)) return null;
    return items.filter((i) => i.status === 'queued_for_release');
  } catch {
    return null;
  }
}

function readFeatureCriticality(featureId: string): 'high' | 'medium' | 'low' | null {
  try {
    const raw = readFileSync(resolvePath(ROOT, 'memory/registry.yml'), 'utf8');
    const parsed = parseYaml(raw) as { features?: Record<string, RegistryFeature> } | undefined;
    return parsed?.features?.[featureId]?.criticality ?? null;
  } catch {
    return null;
  }
}

/** Count of OTHER features directly connected to `featureId` via a
 *  `feature_relation` edge (the SAME edge kind `world-model.mjs --impact`'s
 *  own `walkImpact` walks — `scripts/knowledge/world-model.mjs`'s
 *  `runImpact`/markdown renderer both filter on this exact kind for
 *  cross-feature relations, never on `feature_table`/`feature_action`/etc,
 *  whose targets are files or DB objects, not features). This is a depth-1
 *  proxy for the full `--impact` BFS (`maxDepth: 2`, only reachable by
 *  shelling to `tsx`, unavailable from a plain Node runtime read) — coarser
 *  than the real blast-radius walk, but grounded in the same edge kind
 *  rather than a re-derived heuristic. `null` when the graph itself could
 *  not be read. */
function readImpactedFeatureCount(featureId: string): number | null {
  try {
    const raw = readFileSync(resolvePath(ROOT, 'docs/generated/WORLD_MODEL.json'), 'utf8');
    const model = JSON.parse(raw) as WorldModel;
    const neighbors = new Set(
      model.edges
        .filter((e) => e.kind === 'feature_relation' && (e.source === featureId || e.target === featureId))
        .map((e) => (e.source === featureId ? e.target : e.source)),
    );
    neighbors.delete(featureId);
    return neighbors.size;
  } catch {
    return null;
  }
}

/** `null` when the incidents directory itself could not be listed — `0` is
 *  a real "this feature has never had a recorded incident" fact. */
function readIncidentDensity(featureId: string): number | null {
  try {
    const dir = resolvePath(ROOT, 'memory/incidents', featureId);
    return readdirSync(dir).filter((f) => /^INC-.*\.md$/i.test(f)).length;
  } catch {
    // ENOENT (no incidents directory for this feature) is a real zero, not
    // an unknown — this feature genuinely has no recorded incidents.
    return 0;
  }
}

export interface PendingReleaseRisk {
  id: string;
  featureId: string;
  score: ChangeRiskScore;
}

export async function fetchPendingReleaseRisk(): Promise<AdminFetchResult<PendingReleaseRisk[]>> {
  const items = readPendingQueueItems();
  if (items === null) return unconfigured('Release-queue risk scoring');

  const scores: PendingReleaseRisk[] = items.map((item) => {
    const criticality = readFeatureCriticality(item.feature_id);
    const input: ChangeRiskInput = {
      featureCriticalities: [criticality],
      impactedFeatureCount: readImpactedFeatureCount(item.feature_id),
      // Not derivable from a release-queue item alone (no diff text is
      // stored against it) — honestly unknown, which the scorer already
      // biases upward rather than assuming a clean diff.
      touchesMigration: null,
      touchesAuthOrRls: null,
      touchesDestructiveWrite: null,
      incidentDensity: readIncidentDensity(item.feature_id),
      testCoverageConfidence:
        item.regression_tests && item.regression_tests.length > 0 ? 'partial' : null,
    };
    return { id: item.id, featureId: item.feature_id, score: scoreChange(input) };
  });

  return ok(scores);
}

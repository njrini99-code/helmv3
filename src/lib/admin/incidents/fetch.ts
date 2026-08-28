import 'server-only';
import { cache } from 'react';

import { createAdminClient } from '@/lib/supabase/admin';
import { rcaAnalysisSchema, type RcaAnalysis } from '@/lib/admin/rca';
import { deriveRcaCategory } from '@/lib/admin/rca-category';
import { getProductionDeployAt } from '@/lib/admin/auto-resolve';
import { fetchWorkLog, type WorkLogEntry } from '@/lib/admin/github-pr-timeline';
import { fetchReliabilitySnapshot } from '@/lib/admin/data/reliability';
import {
  fetchIncidentFeed,
  DEFAULT_INCIDENT_WINDOW_HOURS,
  type IncidentFeedFilters,
} from '@/lib/admin/data/incident-feed';
import type { CorrelatedSignal } from '@/lib/reliability/types';

import { correlateIncidents, type CorrelationSourceHealth, type IncidentDraft } from './correlate';
import { deriveLifecycle } from './lifecycle';
import { deriveEvidenceCoverage, deriveProof, deriveProofGaps } from './proof';
import { countLenses } from './lens';
import {
  buildSourceFreshness,
  describeBlindness,
  summarizeCoverage,
  type CoverageSummary,
  type SourceReading,
} from './sources';
import type {
  IncidentAnalysis,
  IncidentDeployProof,
  IncidentLensCounts,
  IncidentRepair,
  IncidentResolution,
  IncidentSourceName,
  RepairChecks,
  SourceFreshness,
  UnifiedIncident,
} from './types';

/**
 * The one read that assembles an incident board.
 *
 * WHAT THIS IS NOT. It is not a new store, and it does not own a table. Every
 * fact here is fetched from a reader that already exists — `fetchIncidentFeed`
 * for app+Sentry, `fetchReliabilitySnapshot` for the 3-hourly correlated
 * signals, `admin_events` for stored analyses, `admin_error_resolutions` for
 * the fingerprint-level ledger, `fetchWorkLog` for repair PRs,
 * `getProductionDeployAt` for what production actually serves — and folded
 * into ONE shape by pure functions that are unit-tested without any of it.
 *
 * The layering is deliberate and is the thing to preserve:
 *
 *     existing source readers        (I/O, each already fail-soft)
 *             |
 *     normalisation + correlation    (pure: correlate.ts)
 *             |
 *     lifecycle + proof derivation   (pure: lifecycle.ts, proof.ts)
 *             |
 *     UnifiedIncident[]              (consumed by every Bridge surface)
 *
 * Nothing derived is written back. `lifecycleState` and the proof strip are
 * functions of evidence that changes underneath them — a merged PR, a rolled
 * deploy, a recurrence — so persisting either would let a stale string outrank
 * live evidence. That is the exact failure the control-plane work spent weeks
 * removing, and `memory/features/admin-platform.md` records what a second
 * authority costs on this table specifically.
 *
 * PARTIAL FAILURE IS NORMAL AND MUST NOT CASCADE. Six reads back this board
 * and any of them can fail independently. A failed GitHub lookup makes repair
 * state `unknown`, not absent; a blind Sentry marks coverage incomplete and
 * suppresses the all-clear, but every incident the readable sources saw still
 * renders. The only read allowed to take the board down is the app-events
 * query itself, which already throws by design (see `queryAppErrorEvents`) —
 * because a silent `[]` there becomes a confident zero on four surfaces at
 * once.
 */

// ---------------------------------------------------------------------------
// Stored analyses
// ---------------------------------------------------------------------------

/**
 * Batched read of `rca_analysis` rows for any incident key.
 *
 * Generalises `queryRelAnalyses` (which only handles `rel:` signatures) and
 * `queryAnalyzedFingerprints` (which only answers yes/no) into the one lookup
 * this board needs: the analysis CONTENT, for both bare fingerprints and
 * `rel:`-prefixed reliability signatures, in one pass.
 *
 * Chunked at 200 keys to stay under PostgREST's ~22.8 KB URL ceiling — an
 * unchunked `.in()` during an error storm returns 400, and a swallowed 400
 * here means every analysis silently disappears exactly when the board is
 * busiest. Fail-soft per chunk for the same reason the two functions it
 * replaces are: a missing analysis costs one panel; a thrown error costs the
 * page.
 */
const ANALYSIS_CHUNK_SIZE = 200;

export async function queryAnalysesByKey(
  keys: readonly string[],
): Promise<Map<string, RcaAnalysis>> {
  const out = new Map<string, RcaAnalysis>();
  const unique = [...new Set(keys)].filter((k) => k.length > 0);
  if (unique.length === 0) return out;

  const admin = createAdminClient();

  for (let i = 0; i < unique.length; i += ANALYSIS_CHUNK_SIZE) {
    const chunk = unique.slice(i, i + ANALYSIS_CHUNK_SIZE);
    const { data, error } = await admin
      .from('admin_events')
      .select('fingerprint, metadata, created_at')
      .eq('event_type', 'rca_analysis')
      .in('fingerprint', chunk)
      .order('created_at', { ascending: false });

    if (error) {
      // DEGRADE, EXPLICITLY. supabase-js resolves failures as
      // `{ data: null, error }`, so an unbound error becomes "no analyses
      // exist" — which reads as a working empty rather than a broken read.
      console.warn(
        `[queryAnalysesByKey] analysis lookup failed; analyses suppressed for this batch: ${error.message}`,
      );
      continue;
    }

    // Newest-first, so the first row seen for a key is the one to keep.
    for (const row of data ?? []) {
      const key = typeof row.fingerprint === 'string' ? row.fingerprint : null;
      if (!key || out.has(key)) continue;
      const parsed = rcaAnalysisSchema.safeParse(row.metadata);
      if (parsed.success) out.set(key, parsed.data);
    }
  }

  return out;
}

// ---------------------------------------------------------------------------
// Repair PRs
// ---------------------------------------------------------------------------

/**
 * How many repair PRs will have their CI checks read.
 *
 * Each is one extra GitHub round trip, so the set is bounded. It is bounded at
 * a number comfortably above the working set rather than at 1: the repair
 * routine opens at most a handful of PRs a night, and a cap that bites would
 * render "checks unreadable" for a real PR — which the proof strip correctly
 * renders as `unknown`, but which is a worse answer than the truth we could
 * have fetched.
 */
const MAX_CHECK_LOOKUPS = 8;

interface RepairPr {
  entry: WorkLogEntry;
  checks: RepairChecks | null;
}

/**
 * CI state for one repair branch.
 *
 * Returns `null` — never a fabricated all-green — on any failure. `proof.ts`
 * maps a null `checks` to `ci-proven: 'unknown'`, deliberately NOT to
 * `'pending'`: pending reads as orderly progress, and a checks read that
 * failed is not progress.
 */
async function fetchBranchChecks(
  owner: string,
  repo: string,
  branch: string,
  headers: HeadersInit,
): Promise<RepairChecks | null> {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}/check-runs?per_page=100`,
      { headers, next: { revalidate: 120 } },
    );
    if (!res.ok) return null;
    const body = (await res.json()) as {
      check_runs?: Array<{ status: string; conclusion: string | null }>;
    };
    const runs = body.check_runs ?? [];
    if (runs.length === 0) return null;

    let passed = 0;
    let failed = 0;
    let pending = 0;
    for (const run of runs) {
      if (run.status !== 'completed') {
        pending += 1;
        continue;
      }
      // `neutral` and `skipped` are not failures and are not proof of a green
      // suite either; counting them as passes would let a fully-skipped run
      // read as CI PROVEN.
      if (run.conclusion === 'success') passed += 1;
      else if (run.conclusion === 'neutral' || run.conclusion === 'skipped') continue;
      else failed += 1;
    }
    return { total: passed + failed + pending, passed, failed, pending };
  } catch {
    return null;
  }
}

/**
 * Every repair PR that names one of these incidents, keyed by incident id.
 *
 * `unknown` versus `none` is the distinction that matters here and it is
 * carried by the RESULT, not by this map: a null return means the GitHub read
 * failed and the caller must render repair state as unknown, while an empty
 * map means the read succeeded and no repair exists. Collapsing the two would
 * quietly re-queue work that is already in a branch.
 */
async function fetchRepairPrs(
  incidentIds: ReadonlySet<string>,
): Promise<{ byIncident: Map<string, RepairPr>; readable: boolean; reason: string | null }> {
  const log = await fetchWorkLog();
  if (log.status !== 'ok' || !log.data) {
    return {
      byIncident: new Map(),
      readable: false,
      reason: log.error ?? 'GitHub pull requests unavailable',
    };
  }

  const matched: Array<{ id: string; entry: WorkLogEntry }> = [];
  for (const entry of log.data.entries) {
    for (const id of entry.repairIncidentIds) {
      if (incidentIds.has(id)) matched.push({ id, entry });
    }
  }

  // Newest first, so when two PRs name the same incident the freshest wins —
  // an abandoned first attempt must not mask the PR that is actually open.
  matched.sort((a, b) => Date.parse(b.entry.updated_at) - Date.parse(a.entry.updated_at));

  const byIncident = new Map<string, RepairPr>();
  for (const { id, entry } of matched) {
    if (!byIncident.has(id)) byIncident.set(id, { entry, checks: null });
  }

  // Only OPEN PRs get a checks lookup: a merged PR's CI state is already
  // settled by the merge, and a closed one is not proof of anything.
  const openIds = [...byIncident.entries()]
    .filter(([, pr]) => pr.entry.state === 'open')
    .slice(0, MAX_CHECK_LOOKUPS);

  if (openIds.length > 0) {
    const { githubIssuesHeaders, githubIssuesRepo, githubIssuesToken } = await import(
      '@/lib/admin/github-issues-config'
    );
    const token = githubIssuesToken();
    if (token) {
      const { owner, repo } = githubIssuesRepo();
      const headers = githubIssuesHeaders(token);
      await Promise.all(
        openIds.map(async ([id, pr]) => {
          const checks = await fetchBranchChecks(owner, repo, `fix/rca-${id}`, headers);
          byIncident.set(id, { ...pr, checks });
        }),
      );
    }
  }

  return { byIncident, readable: true, reason: null };
}

function toRepair(pr: RepairPr | undefined, readable: boolean, reason: string | null): IncidentRepair {
  if (!readable) {
    return {
      status: 'unknown',
      prNumber: null,
      prUrl: null,
      branch: null,
      checks: null,
      mergedAt: null,
      mergeSha: null,
      note: reason ?? 'The repair pull-request lookup failed, so repair state could not be read.',
    };
  }
  if (!pr) {
    return {
      status: 'none',
      prNumber: null,
      prUrl: null,
      branch: null,
      checks: null,
      mergedAt: null,
      mergeSha: null,
      note: 'No pull request names this incident.',
    };
  }

  const { entry, checks } = pr;
  const status: IncidentRepair['status'] =
    entry.state === 'merged'
      ? 'merged'
      : entry.state === 'closed'
        ? 'none'
        : checks && checks.failed > 0
          ? 'pr-failed'
          : 'pr-open';

  return {
    status,
    prNumber: entry.number,
    prUrl: entry.html_url,
    branch: null,
    checks,
    mergedAt: entry.merged_at,
    mergeSha: null,
    note:
      entry.state === 'closed'
        ? `PR #${entry.number} was closed without merging.`
        : checks === null && entry.state === 'open'
          ? `PR #${entry.number} is open; its checks could not be read.`
          : null,
  };
}

// ---------------------------------------------------------------------------
// Resolutions
// ---------------------------------------------------------------------------

interface StoredResolutionRow {
  fingerprint: string;
  resolvedAt: string;
  resolutionSource: 'auto' | 'manual';
  fixedInSha: string | null;
  note: string | null;
  reopenedCount: number;
}

/**
 * Fingerprint-level resolution memory for the incidents on this board.
 *
 * Reads `admin_error_resolutions` directly rather than reusing
 * `fetchResolutionArchive`, which deliberately reads the WHOLE table for the
 * archive panel — pulling thousands of historical rows to answer a question
 * about the dozens on screen. Scoped `.in()` on an indexed column instead.
 *
 * Fail-soft: an unreadable ledger means regression and closure state are
 * unknown for this render, which the lifecycle derivation handles. It must not
 * take the board down.
 */
async function fetchResolutions(
  fingerprints: readonly string[],
): Promise<Map<string, StoredResolutionRow>> {
  const out = new Map<string, StoredResolutionRow>();
  if (fingerprints.length === 0) return out;

  const admin = createAdminClient();
  const { data, error } = await admin
    .from('admin_error_resolutions')
    .select('fingerprint, resolved_at, resolution_source, fixed_in_sha, note, reopened_count')
    .in('fingerprint', [...fingerprints]);

  if (error) {
    console.warn(`[fetchResolutions] resolution ledger unreadable: ${error.message}`);
    return out;
  }

  for (const row of data ?? []) {
    if (typeof row.fingerprint !== 'string') continue;
    out.set(row.fingerprint, {
      fingerprint: row.fingerprint,
      resolvedAt: row.resolved_at,
      resolutionSource: row.resolution_source === 'auto' ? 'auto' : 'manual',
      fixedInSha: row.fixed_in_sha ?? null,
      note: row.note ?? null,
      reopenedCount: typeof row.reopened_count === 'number' ? row.reopened_count : 0,
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Board
// ---------------------------------------------------------------------------

export interface IncidentBoard {
  incidents: UnifiedIncident[];
  /**
   * Incident id -> the `admin_events` row ids behind it.
   *
   * Carried on the BOARD rather than on the incident because it is not a fact
   * about the fault — it is the handle the resolve action needs, and
   * `resolve_admin_event` is per-row. Keeping it out of `UnifiedIncident`
   * stops a list of ids that can be hundreds long from travelling with every
   * card into every client component that only wants to render a title.
   */
  eventIdsByIncident: Record<string, string[]>;
  /** Per-source freshness, always one row per source. */
  freshness: SourceFreshness[];
  coverage: CoverageSummary;
  /** One sentence for the global beacon, or null when nothing is blind. */
  blindnessNote: string | null;
  lensCounts: IncidentLensCounts;
  /** ISO — when this board was computed, so a screen can show its own age. */
  computedAt: string;
  windowHours: number;
}

/**
 * Deploy proof for one incident — is the fix live, and has enough happened
 * since to call it proven?
 *
 * `servesFix` is nullable and stays null whenever the deploy anchor is
 * unreadable. `shipStatus`'s three outcomes exist in `auto-resolve.ts` for
 * this exact reason: rendering "we could not find out" as "not shipped" tells
 * an operator their fix has not landed when the truth is that we could not
 * look.
 */
function buildDeployProof(
  resolution: StoredResolutionRow | undefined,
  repair: IncidentRepair,
  deploy: { deployAt: number | null; deploySha: string | null },
  lastSeen: string,
  now: number,
): IncidentDeployProof | null {
  const fixedInSha = resolution?.fixedInSha ?? repair.mergeSha ?? null;
  const hasFix = repair.status === 'merged' || fixedInSha !== null;
  if (!hasFix) return null;

  const deployedAt = deploy.deployAt === null ? null : new Date(deploy.deployAt).toISOString();
  const mergedAtMs = repair.mergedAt ? Date.parse(repair.mergedAt) : null;

  // Unknown, not false. A missing deploy anchor means Vercel could not be
  // read; it does NOT mean production is behind.
  const servesFix =
    deploy.deployAt === null
      ? null
      : fixedInSha !== null && deploy.deploySha !== null
        ? deploy.deploySha.startsWith(fixedInSha) || fixedInSha.startsWith(deploy.deploySha)
        : mergedAtMs !== null
          ? deploy.deployAt >= mergedAtMs
          : null;

  const sinceDeployMs =
    servesFix === true && deploy.deployAt !== null ? now - deploy.deployAt : null;

  const lastOccurrenceMs = Date.parse(lastSeen);
  const recurredAfterDeploy =
    deploy.deployAt !== null && Number.isFinite(lastOccurrenceMs)
      ? lastOccurrenceMs > deploy.deployAt
      : null;

  const PROOF_WINDOW_MS = 24 * 3600_000;
  const sufficientProof =
    servesFix !== true
      ? null
      : recurredAfterDeploy === true
        ? false
        : sinceDeployMs !== null && sinceDeployMs >= PROOF_WINDOW_MS
          ? true
          : false;

  return {
    fixedInSha,
    productionSha: deploy.deploySha,
    deployedAt,
    servesFix,
    lastOccurrenceAt: lastSeen,
    sinceDeployMs,
    sufficientProof,
    gap:
      servesFix === null
        ? 'Production deploy state could not be read, so shipping cannot be confirmed.'
        : servesFix === false
          ? 'Merged, but production does not serve the fix yet.'
          : recurredAfterDeploy === true
            ? 'The fault fired again after the fix went live.'
            : sufficientProof
              ? null
              : 'Live, but not enough post-deploy evidence to close.',
  };
}

function toAnalysis(stored: RcaAnalysis, repairVerdict: IncidentAnalysis['repairVerdict']): IncidentAnalysis {
  return {
    category: deriveRcaCategory(stored.suggestedFix),
    probableCause: stored.probableCause,
    suggestedFix: stored.suggestedFix,
    confidence: stored.confidence,
    suspectFiles: stored.suspectFiles,
    relatedFingerprints: stored.relatedFingerprints,
    model: stored.model,
    generatedAt: stored.generatedAt,
    repairVerdict,
  };
}

function toResolution(row: StoredResolutionRow | undefined): IncidentResolution | null {
  if (!row) return null;
  return {
    resolvedAt: row.resolvedAt,
    resolvedBy: row.resolutionSource,
    fixedInSha: row.fixedInSha,
    note: row.note,
    reopenedCount: row.reopenedCount,
  };
}

/**
 * Read the reliability snapshot into the two things correlation needs: the
 * correlated signals, and per-source health for THIS refresh.
 *
 * A snapshot that could not be read leaves `supabase` and `vercel` at
 * `'unknown'` rather than dropping them — a source silently absent from a
 * coverage matrix reads as "there are only two sources", which is the same
 * class of lie as rendering a blind source green.
 */
async function readReliability(): Promise<{
  signals: CorrelatedSignal[];
  health: CorrelationSourceHealth[];
  observedAt: string | null;
}> {
  const snapshot = await fetchReliabilitySnapshot();
  const run = snapshot.status === 'ok' ? (snapshot.data?.latest?.run ?? null) : null;
  const observedAt = snapshot.data?.latest?.completedAt ?? snapshot.data?.latest?.startedAt ?? null;

  if (!run) {
    const reason =
      snapshot.status !== 'ok'
        ? (snapshot.error ?? 'reliability snapshot unavailable')
        : snapshot.data?.neverRan
          ? 'the collector has never run'
          : 'the latest run predates the current schema';
    return {
      signals: [],
      health: (['supabase', 'vercel'] as const).map((source) => ({
        source,
        health: 'unknown' as const,
        reason,
        observedAt,
      })),
      observedAt,
    };
  }

  const health: CorrelationSourceHealth[] = run.sources.map((s) => ({
    source: s.source as IncidentSourceName,
    health: s.status === 'ok' ? 'reading' : s.status === 'partial' ? 'partial' : 'blind',
    reason: s.reason,
    observedAt,
  }));

  return { signals: run.signals, health, observedAt };
}

/**
 * Build the whole board.
 *
 * `filters` is the same shape the Errors tab already uses, so a lens and a
 * filter chip narrow the SAME query rather than two queries that can disagree.
 */
export async function fetchIncidentBoard(
  filters: IncidentFeedFilters = { windowHours: DEFAULT_INCIDENT_WINDOW_HOURS },
  now: number = Date.now(),
): Promise<IncidentBoard> {
  const [feed, reliability, deploy] = await Promise.all([
    fetchIncidentFeed(filters),
    readReliability(),
    getProductionDeployAt(now),
  ]);

  const nowIso = new Date(now).toISOString();

  // App events are read live and threw on failure if they were unreadable, so
  // reaching this line means the app arm is healthy. Sentry reports its own
  // envelope status.
  const sentryHealth: CorrelationSourceHealth = {
    source: 'sentry',
    health:
      feed.sentry.status === 'ok'
        ? 'reading'
        : feed.sentry.status === 'unconfigured'
          ? 'unknown'
          : 'blind',
    reason: feed.sentry.status === 'ok' ? null : (feed.sentry.error ?? 'Sentry unavailable'),
    observedAt: feed.sentry.fetchedAt ?? nowIso,
  };

  const sourceHealth: CorrelationSourceHealth[] = [
    { source: 'app', health: 'reading', reason: null, observedAt: nowIso },
    sentryHealth,
    ...reliability.health,
  ];

  // fingerprint -> the admin_events rows in this feed. Built from the triage
  // items rather than re-queried: they already carry exactly these ids, and a
  // second query could disagree with the list the operator is looking at.
  const eventIdsByFingerprint = new Map<string, string[]>();
  for (const item of feed.incidents) {
    if (item.origin !== 'app' || !item.fingerprint) continue;
    eventIdsByFingerprint.set(item.fingerprint, item.eventIds);
  }

  const drafts: IncidentDraft[] = correlateIncidents({
    triage: feed.incidents,
    reliabilitySignals: reliability.signals,
    sourceHealth,
  });

  // Analyses are keyed by the incident's own id: a bare fingerprint for
  // app-origin incidents, `rel:<signature>` for reliability-origin ones. Both
  // spellings are already what the writers use, which is exactly why the id
  // scheme reuses them instead of inventing a synthetic key.
  const ids = drafts.map((d) => d.id);
  const appFingerprints = drafts.flatMap((d) => [...d.appFingerprints]);

  const [analyses, resolutions, repairs] = await Promise.all([
    queryAnalysesByKey(ids),
    fetchResolutions(appFingerprints),
    fetchRepairPrs(new Set(ids)),
  ]);

  const incidents: UnifiedIncident[] = drafts.map((draft) => {
    const repairPr = repairs.byIncident.get(draft.id);
    const repair = toRepair(repairPr, repairs.readable, repairs.reason);

    const storedAnalysis =
      analyses.get(draft.id) ??
      draft.appFingerprints.map((fp) => analyses.get(fp)).find((a) => a !== undefined) ??
      null;
    const analysis = storedAnalysis
      ? toAnalysis(storedAnalysis, repairPr?.entry.repairVerdict ?? 'not-reviewed')
      : null;

    const resolutionRow = draft.appFingerprints
      .map((fp) => resolutions.get(fp))
      .find((r) => r !== undefined);
    const resolution = toResolution(resolutionRow);

    const deployProof = buildDeployProof(resolutionRow, repair, deploy, draft.lastSeen, now);

    const proofInput = {
      firstSeen: draft.firstSeen,
      lastSeen: draft.lastSeen,
      analysis,
      repair,
      deployProof,
      resolution,
      sources: draft.sources,
      hasStack: draft.hasStack,
      // Whether the FULL Sentry issue (breadcrumbs, request context) was
      // pulled, as opposed to the list summary. The list endpoint returns
      // neither, so this is honest only when a detail fetch happened — it has
      // not, on the list surface, and claiming otherwise would inflate
      // evidence coverage on every Sentry-origin row.
      hasBreadcrumbs: false,
      route: draft.route,
      errorCode: draft.errorCode,
      hasDeployContext: deploy.deployAt !== null,
      hasGitHistory: (analysis?.suspectFiles.length ?? 0) > 0,
      now,
    };

    const lifecycle = deriveLifecycle({
      firstSeen: draft.firstSeen,
      lastSeen: draft.lastSeen,
      analysis,
      repair,
      deployProof,
      resolution,
      regressed: draft.regressed,
      actionable: draft.actionable,
      klass: draft.klass,
      hasBlindSource: draft.hasBlindSource,
      now,
    });

    return {
      ...draft,
      lifecycle,
      analysis,
      repair,
      deployProof,
      resolution,
      proof: deriveProof(proofInput),
      proofGaps: deriveProofGaps(proofInput),
      evidenceCoverage: deriveEvidenceCoverage(proofInput),
      computedAt: nowIso,
    } satisfies UnifiedIncident;
  });

  const readings: SourceReading[] = sourceHealth.map((s) => ({
    source: s.source,
    health: s.health,
    observedAt: s.observedAt,
    reason: s.reason,
  }));
  const freshness = buildSourceFreshness(readings, now);
  const coverage = summarizeCoverage(freshness);
  const reasons = new Map<IncidentSourceName, string | null>(
    sourceHealth.map((s) => [s.source, s.reason]),
  );

  const eventIdsByIncident: Record<string, string[]> = {};
  for (const incident of incidents) {
    const ids = incident.appFingerprints.flatMap((fp) => eventIdsByFingerprint.get(fp) ?? []);
    if (ids.length > 0) eventIdsByIncident[incident.id] = [...new Set(ids)];
  }

  return {
    incidents,
    eventIdsByIncident,
    freshness,
    coverage,
    blindnessNote: describeBlindness(freshness, reasons),
    lensCounts: countLenses(incidents),
    computedAt: nowIso,
    windowHours: filters.windowHours,
  };
}

/**
 * One incident, by the id the detail route carries.
 *
 * WIDER WINDOW THAN THE LIST, on purpose. The board defaults to 72 hours
 * because that is the useful triage horizon; a detail page is reached from a
 * link, a bookmark, an RCA row or a repair PR body, and those outlive the
 * window by a long way. Opening a link and being told the incident does not
 * exist — when what actually happened is that it stopped firing four days ago
 * — is the failure this wider default prevents.
 *
 * Matches on the incident id OR on any fingerprint it folded, because the
 * stored links predate correlation: an `rca_analysis` row and a repair PR both
 * address a BARE fingerprint, which may now be one of several behind a single
 * unified incident. Returning null for such a link would silently break every
 * artefact the self-healing loop has already written.
 */
export async function fetchIncidentById(
  id: string,
  windowHours = 168,
): Promise<{ incident: UnifiedIncident; board: IncidentBoard } | null> {
  const board = await fetchIncidentBoard({ windowHours });
  const incident =
    board.incidents.find((i) => i.id === id) ??
    board.incidents.find((i) => i.appFingerprints.includes(id)) ??
    board.incidents.find((i) => i.reliabilitySignatures.includes(id.replace(/^rel:/, ''))) ??
    null;
  return incident ? { incident, board } : null;
}

/**
 * Per-request memoised DEFAULT-WINDOW board.
 *
 * Takes a PRIMITIVE, and that is the entire point: React's `cache()` keys on
 * argument REFERENCE identity, so two call sites each passing their own
 * `{ windowHours: 72 }` literal are two distinct keys and miss the cache every
 * time — a memoisation that looks applied and does nothing. The same trap
 * `cachedIncidentFeed` documents, one layer up.
 */
export const cachedIncidentBoard = cache((windowHours: number) =>
  fetchIncidentBoard({ windowHours }),
);

/**
 * Re-exported so existing call sites keep importing lens behaviour from the
 * module that produces the board. The implementations live in `./lens`, which
 * is pure and unit-tested without a database.
 */
export { applyLens, countLenses, matchesLens } from './lens';

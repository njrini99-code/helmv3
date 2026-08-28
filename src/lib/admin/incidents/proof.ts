/**
 * The proof strip — deriving HOW MUCH of the observed-to-verified chain an
 * incident has actually earned, from evidence, at read time.
 *
 * WHY THIS MODULE EXISTS. `UnifiedIncident.proof` / `.proofGaps` /
 * `.evidenceCoverage` are documented in `types.ts` as DERIVED, NEVER
 * PERSISTED — the same rule that keeps `lifecycleState` from going stale.
 * This is where that derivation actually happens: one pure function per
 * concern, each a function of the evidence objects already on the incident
 * (`analysis`, `repair`, `deployProof`, `sources`), never of a stored
 * verdict string.
 *
 * PURE ON PURPOSE. No Supabase client, no `fetch`, no ambient `Date.now()` —
 * `now` arrives as an argument. That is what makes this module safe to call
 * from a client component render and safe to unit test with fixed clocks; an
 * I/O call here would be exactly the kind of second authority
 * `.claude/rules/shipping.md` and `types.ts`'s own header warn against.
 *
 * ONE PLAN, TWO VIEWS. `deriveProof` and `deriveProofGaps` both read the same
 * internal `buildProofPlan()` computation rather than re-deriving milestone
 * state independently. Two functions independently deciding "is CI proven?"
 * is exactly how the Bridge ended up with two error tabs that disagree
 * (`types.ts`'s header) — here there is one answer, rendered two ways: as a
 * milestone strip and as a punch list of what is still missing.
 *
 * UNKNOWN IS NEVER RENDERED AS HEALTHY. A read that failed (`checks === null`
 * on a repair, `deployProof === null`, a `blind` source) reports `'unknown'`,
 * never `'pending'` and never a false `'proven'`. `'pending'` is reserved for
 * evidence we expect and simply have not collected yet; collapsing "could not
 * read" into "in progress" is precisely the `unknown → healthy` move
 * `memory/system/golfhelm-engineering-os.md` forbids, and the `ci-proven`
 * milestone below exists in this file specifically to keep that distinction
 * mechanical rather than a reviewer's judgement call.
 */

import { PROOF_MILESTONES, EVIDENCE_DIMENSIONS, INCIDENT_SOURCE_LABEL } from '@/lib/admin/incidents/types';
import type {
  ProofMilestone,
  ProofState,
  ProofDot,
  ProofGap,
  EvidenceCoverage,
  EvidenceDimension,
  IncidentAnalysis,
  IncidentRepair,
  IncidentDeployProof,
  IncidentResolution,
  IncidentSourceEvidence,
} from '@/lib/admin/incidents/types';
import { RCA_CATEGORY_LABEL } from '@/lib/admin/rca-category';

// ---------------------------------------------------------------------------
// Input
// ---------------------------------------------------------------------------

export interface ProofInput {
  firstSeen: string;
  lastSeen: string;
  analysis: IncidentAnalysis | null;
  repair: IncidentRepair | null;
  deployProof: IncidentDeployProof | null;
  resolution: IncidentResolution | null;
  sources: readonly IncidentSourceEvidence[];
  /** Raw stack trace captured for this incident. */
  hasStack: boolean;
  /** Sentry breadcrumbs / request context were actually pulled, not just summarised. */
  hasBreadcrumbs: boolean;
  route: string | null;
  errorCode: string | null;
  /** Deploy history was readable when this incident was analysed. */
  hasDeployContext: boolean;
  /** Git history / suspect commit is known. */
  hasGitHistory: boolean;
  now: number;
}

/**
 * How long production must serve a fix before silence counts as proof.
 *
 * MIRRORS `RELEASE_GRACE_MS` in `@/lib/admin/auto-resolve` (24 hours) and
 * cannot import it: `auto-resolve.ts` transitively imports
 * `@/lib/admin/vercel-api` and `@/lib/admin/resolution-ledger`, both of which
 * open with `import 'server-only'`. Pulling that constant in here would drag
 * the whole server-only graph — the Supabase admin client, `SUPABASE_SERVICE_ROLE_KEY`
 * reads, the Vercel API client — into what has to stay a pure, client-safe
 * module. That is the identical poisoning `rca-category.ts`'s header
 * documents for `rca.ts`, one hop further down the same import graph, so this
 * module stays free of `server-only` the same way. `proof.test.ts` pins this
 * literal against `auto-resolve.ts`'s own source text so the two values
 * cannot silently drift apart.
 */
export const PRODUCTION_PROOF_WINDOW_MS = 24 * 3600_000;

// ---------------------------------------------------------------------------
// Small pure helpers
// ---------------------------------------------------------------------------

function joinWithAnd(items: readonly string[]): string {
  if (items.length === 0) return '';
  if (items.length === 1) return items[0] ?? '';
  const last = items[items.length - 1] ?? '';
  return `${items.slice(0, -1).join(', ')} and ${last}`;
}

/** Coarse, human duration — this is drawer copy, not a precision timer. */
function formatDuration(ms: number): string {
  const abs = Math.max(ms, 0);
  const minutes = Math.round(abs / 60_000);
  if (minutes < 1) return 'less than a minute';
  if (minutes < 60) return `${minutes} minute${minutes === 1 ? '' : 's'}`;
  const hours = Math.round(abs / 3_600_000);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'}`;
  const days = Math.round(abs / 86_400_000);
  return `${days} day${days === 1 ? '' : 's'}`;
}

function parseTimeOrNull(value: string | null): number | null {
  if (value === null) return null;
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

interface MilestoneResult {
  state: ProofState;
  evidence: string | null;
}

// ---------------------------------------------------------------------------
// The plan — one derivation, shared by deriveProof and deriveProofGaps
// ---------------------------------------------------------------------------

interface ProofPlan {
  observed: MilestoneResult;
  analyzed: MilestoneResult;
  reproduced: MilestoneResult;
  ciProven: MilestoneResult;
  deployed: MilestoneResult;
  productionVerified: MilestoneResult;
}

function deriveObserved(sources: readonly IncidentSourceEvidence[]): MilestoneResult {
  // A source "reported the fault" only if it was actually read for THIS
  // incident (`reading` or `partial`). `unknown` is deliberately excluded
  // here even though it is `!== 'blind'` — `unknown` means no read was
  // attempted, which is not testimony, and counting it as observed would be
  // the exact `unknown → healthy` collapse this module exists to refuse.
  const reporting = sources.filter((s) => s.health === 'reading' || s.health === 'partial');
  if (reporting.length > 0) {
    const labels = reporting.map((s) => INCIDENT_SOURCE_LABEL[s.source]);
    return { state: 'proven', evidence: `Seen by ${joinWithAnd(labels)}` };
  }

  if (sources.length > 0 && sources.every((s) => s.health === 'blind')) {
    const labels = sources.map((s) => INCIDENT_SOURCE_LABEL[s.source]);
    return { state: 'unknown', evidence: `Every source is blind: ${joinWithAnd(labels)}` };
  }

  if (sources.length === 0) {
    return { state: 'unknown', evidence: 'No source evidence was attached to this incident.' };
  }

  return { state: 'unknown', evidence: 'No source has read this fault yet.' };
}

function deriveAnalyzed(analysis: IncidentAnalysis | null): MilestoneResult {
  if (analysis === null) return { state: 'not-reached', evidence: null };
  return {
    state: 'proven',
    evidence: `${RCA_CATEGORY_LABEL[analysis.category]} (confidence: ${analysis.confidence})`,
  };
}

function deriveReproduced(repair: IncidentRepair | null): MilestoneResult {
  // The only mechanical evidence we have that a failing test was actually
  // written: a branch exists AND its checks include at least one pass. A PR
  // existing proves nothing on its own — see `types.ts`'s note on why
  // `pr-open` is deliberately not a milestone.
  if (repair && repair.checks !== null && repair.checks.passed > 0 && repair.branch !== null) {
    const count = repair.checks.passed;
    return {
      state: 'proven',
      evidence: `Branch ${repair.branch} has ${count} passing check${count === 1 ? '' : 's'}`,
    };
  }

  if (repair && (repair.status === 'running' || repair.status === 'candidate')) {
    return { state: 'pending', evidence: `Repair is ${repair.status} — not yet reproduced` };
  }

  if (repair?.status === 'unknown') {
    return { state: 'unknown', evidence: 'Repair status could not be read' };
  }

  return { state: 'not-reached', evidence: null };
}

function deriveCiProven(repair: IncidentRepair | null): MilestoneResult {
  if (!repair) return { state: 'not-reached', evidence: null };

  const checks = repair.checks;
  const failedByStatus = repair.status === 'pr-failed';
  const failedByChecks = checks !== null && checks.failed > 0;

  if (failedByStatus || failedByChecks) {
    const detail = checks !== null ? `${checks.failed} of ${checks.total} checks failed` : 'The repair PR failed';
    return { state: 'failed', evidence: detail };
  }

  // The checks sub-object could not be read at all — never render that as
  // `'pending'`, which reads as orderly progress rather than a broken read.
  if (checks === null) {
    return { state: 'unknown', evidence: 'CI checks could not be read for this repair' };
  }

  if (checks.pending > 0) {
    return { state: 'pending', evidence: `${checks.pending} of ${checks.total} checks still running` };
  }

  if (checks.failed === 0 && checks.pending === 0 && checks.passed > 0) {
    return { state: 'proven', evidence: `${checks.passed} of ${checks.total} checks passed` };
  }

  // total === 0 (or some other degenerate combination): no checks recorded
  // at all is a read gap, not a green build.
  return { state: 'unknown', evidence: 'No CI checks recorded for this repair' };
}

function deriveDeployed(repair: IncidentRepair | null, deployProof: IncidentDeployProof | null): MilestoneResult {
  // "Merged" is the only repair status that names a fix ready to deploy —
  // `REPAIR_STATUSES` has no separate "deployed" value, so this milestone is
  // not reached at all until repair reaches that status, regardless of what
  // `deployProof` happens to hold.
  const hasFixToDeploy = repair !== null && repair.status === 'merged';
  if (!hasFixToDeploy) return { state: 'not-reached', evidence: null };

  if (deployProof === null || deployProof.servesFix === null) {
    return { state: 'unknown', evidence: 'Deploy status could not be read' };
  }

  if (deployProof.servesFix === true) {
    const sha = deployProof.productionSha ?? 'an unknown production build';
    return { state: 'proven', evidence: `Production serves the fix (${sha})` };
  }

  return { state: 'pending', evidence: 'Merged; production has not deployed the fix yet' };
}

function deriveProductionVerified(deployProof: IncidentDeployProof | null, deployedState: ProofState): MilestoneResult {
  if (deployedState === 'not-reached') return { state: 'not-reached', evidence: null };
  if (deployedState === 'unknown') {
    return { state: 'unknown', evidence: 'Deploy status could not be read, so production verification cannot proceed' };
  }
  if (deployedState === 'pending') {
    // Merged but not yet live — nothing to verify until it is.
    return { state: 'not-reached', evidence: null };
  }

  // deployedState === 'proven' implies deployProof !== null && servesFix === true.
  const dp = deployProof as IncidentDeployProof;
  const deployedAtMs = parseTimeOrNull(dp.deployedAt);
  const lastOccurrenceMs = parseTimeOrNull(dp.lastOccurrenceAt);

  if (lastOccurrenceMs !== null && deployedAtMs !== null && lastOccurrenceMs > deployedAtMs) {
    // The fix is live and the fault happened again after it went live — that
    // is CONTRADICTED proof, not immature proof, so it outranks the
    // sufficient-proof check below regardless of what it says.
    return {
      state: 'failed',
      evidence: `The fault recurred at ${dp.lastOccurrenceAt}, after the fix went live at ${dp.deployedAt}`,
    };
  }

  if (dp.sufficientProof === true) {
    const since = dp.sinceDeployMs !== null ? ` (${formatDuration(dp.sinceDeployMs)} of production traffic)` : '';
    return { state: 'proven', evidence: dp.gap ?? `No recurrence since the fix went live${since}` };
  }

  if (dp.sufficientProof === null) {
    return { state: 'unknown', evidence: 'Whether enough post-deploy evidence exists could not be determined' };
  }

  // sufficientProof === false: deployed, evidence window still immature.
  return { state: 'pending', evidence: dp.gap ?? 'Waiting for enough post-deploy traffic to confirm the fix holds' };
}

function buildProofPlan(input: ProofInput): ProofPlan {
  const deployed = deriveDeployed(input.repair, input.deployProof);
  return {
    observed: deriveObserved(input.sources),
    analyzed: deriveAnalyzed(input.analysis),
    reproduced: deriveReproduced(input.repair),
    ciProven: deriveCiProven(input.repair),
    deployed,
    productionVerified: deriveProductionVerified(input.deployProof, deployed.state),
  };
}

// ---------------------------------------------------------------------------
// deriveProof
// ---------------------------------------------------------------------------

/**
 * The six-dot proof strip, in `PROOF_MILESTONES` order.
 *
 * Built by mapping over the imported `PROOF_MILESTONES` constant itself
 * (never a hand-written array) so the length and order can never drift from
 * the shared vocabulary in `types.ts`.
 */
export function deriveProof(input: ProofInput): ProofDot[] {
  const plan = buildProofPlan(input);
  const byMilestone: Record<ProofMilestone, MilestoneResult> = {
    observed: plan.observed,
    analyzed: plan.analyzed,
    reproduced: plan.reproduced,
    'ci-proven': plan.ciProven,
    deployed: plan.deployed,
    'production-verified': plan.productionVerified,
  };

  return PROOF_MILESTONES.map((milestone) => {
    const result = byMilestone[milestone];
    return { milestone, state: result.state, evidence: result.evidence };
  });
}

// ---------------------------------------------------------------------------
// deriveProofGaps
// ---------------------------------------------------------------------------

/**
 * The punch list: work that looks solved but still lacks the evidence to say
 * so. Reads the same `buildProofPlan()` as `deriveProof` so a gap can never
 * claim a state the strip itself does not show — e.g. an `awaiting-ci` gap
 * can never coexist with a `ci-proven` dot that already reads `'proven'`.
 *
 * `detail` is always the SPECIFIC fact (a duration, a check count, a source
 * name), never the category label already on `PROOF_GAP_LABEL` — a chip that
 * repeats its own caption back is not evidence.
 */
export function deriveProofGaps(input: ProofInput): ProofGap[] {
  const plan = buildProofPlan(input);
  const gaps: ProofGap[] = [];
  const { repair, deployProof, analysis, sources, now } = input;

  // awaiting-traffic — deployed, window since deploy still immature.
  if (plan.productionVerified.state === 'pending' && deployProof !== null) {
    const deployedAtMs = parseTimeOrNull(deployProof.deployedAt);
    const sinceMs = deployProof.sinceDeployMs ?? (deployedAtMs !== null ? now - deployedAtMs : null);
    const remainingMs = sinceMs !== null ? Math.max(PRODUCTION_PROOF_WINDOW_MS - sinceMs, 0) : null;
    gaps.push({
      kind: 'awaiting-traffic',
      detail:
        sinceMs !== null
          ? `Live for ${formatDuration(sinceMs)}; needs ${formatDuration(remainingMs ?? 0)} more before silence counts as proof.`
          : 'Live in production; the post-deploy window has not yet elapsed.',
      ageMs: sinceMs,
    });
  }

  // awaiting-ci — a repair PR exists with checks still running.
  if (plan.ciProven.state === 'pending' && repair?.checks) {
    gaps.push({
      kind: 'awaiting-ci',
      detail: `${repair.checks.passed} of ${repair.checks.total} checks passed, ${repair.checks.pending} still pending.`,
      // No "checks started at" timestamp exists on IncidentRepair — never
      // fabricate one.
      ageMs: null,
    });
  }

  // awaiting-deploy — repair merged, production does not yet serve it.
  if (plan.deployed.state === 'pending') {
    const mergedAtMs = repair?.mergedAt ? parseTimeOrNull(repair.mergedAt) : null;
    const ageMs = mergedAtMs !== null ? now - mergedAtMs : null;
    gaps.push({
      kind: 'awaiting-deploy',
      detail:
        ageMs !== null
          ? `Merged ${formatDuration(ageMs)} ago; production does not yet serve the fix.`
          : 'Merged; production does not yet serve the fix.',
      ageMs,
    });
  }

  // awaiting-evidence — analysis explicitly says it cannot progress safely.
  if (analysis?.category === 'needs-more-evidence') {
    const generatedAtMs = parseTimeOrNull(analysis.generatedAt);
    gaps.push({
      kind: 'awaiting-evidence',
      detail: `Analysis could not progress safely: ${analysis.probableCause}`,
      ageMs: generatedAtMs !== null ? now - generatedAtMs : null,
    });
  }

  // awaiting-repair — analysis says FIX HERE, nothing has been attempted.
  if (analysis?.category === 'fix-here' && (repair === null || repair.status === 'none')) {
    const generatedAtMs = parseTimeOrNull(analysis.generatedAt);
    gaps.push({
      kind: 'awaiting-repair',
      detail: 'Analysis says FIX HERE; no repair has been attempted yet.',
      ageMs: generatedAtMs !== null ? now - generatedAtMs : null,
    });
  }

  // source-blind — one gap per blind source, so the detail can name that one
  // source and its own reason rather than blurring several into one line.
  for (const source of sources) {
    if (source.health !== 'blind') continue;
    const label = INCIDENT_SOURCE_LABEL[source.source];
    const reasonText = source.reason ? `: ${source.reason}` : '';
    const lastSeenMs = parseTimeOrNull(source.lastSeen);
    const lastSeenText = source.lastSeen ? ` Last read successfully at ${source.lastSeen}.` : '';
    gaps.push({
      kind: 'source-blind',
      detail: `${label} is blind${reasonText}.${lastSeenText}`,
      ageMs: lastSeenMs !== null ? now - lastSeenMs : null,
    });
  }

  // awaiting-owner — a PR is open and every check on it already passed; the
  // only remaining step is a human merge decision.
  if (repair?.status === 'pr-open' && plan.ciProven.state === 'proven') {
    gaps.push({
      kind: 'awaiting-owner',
      detail:
        repair.prNumber !== null
          ? `PR #${repair.prNumber} is open with all checks passing — it only needs a merge.`
          : 'A PR is open with all checks passing — it only needs a merge.',
      // No "PR opened at" timestamp exists on IncidentRepair — never
      // fabricate one.
      ageMs: null,
    });
  }

  return gaps;
}

// ---------------------------------------------------------------------------
// deriveEvidenceCoverage
// ---------------------------------------------------------------------------

function dimensionState(
  dimension: EvidenceDimension,
  input: ProofInput,
  allSourcesBlind: boolean,
  reproducedProven: boolean,
): 'present' | 'absent' | 'unknown' {
  if (dimension === 'stack') return allSourcesBlind ? 'unknown' : input.hasStack ? 'present' : 'absent';
  if (dimension === 'breadcrumbs') return allSourcesBlind ? 'unknown' : input.hasBreadcrumbs ? 'present' : 'absent';
  if (dimension === 'route') return input.route !== null ? 'present' : 'absent';
  if (dimension === 'error-code') return input.errorCode !== null ? 'present' : 'absent';
  if (dimension === 'deploy-context') return input.hasDeployContext ? 'present' : 'absent';
  if (dimension === 'git-history') return input.hasGitHistory ? 'present' : 'absent';
  // dimension === 'reproduction'
  return reproducedProven ? 'present' : 'absent';
}

/**
 * Mechanical evidence coverage — a CHECKLIST, not a confidence score.
 *
 * Each dimension either exists or it does not; `present / total` is a factual
 * count of artefacts on hand, and it must never be rendered as a percentage.
 * A percentage implies a calibration this system does not have — "43%
 * evidenced" reads as a confidence estimate, and this is not one; it is
 * "3 of 7 things exist", which is a different and much more honest claim.
 * `types.ts`'s own header makes the same point about the model's stated
 * confidence never being presented as a probability; this is the analogous
 * rule for evidence artefacts.
 *
 * `stack` and `breadcrumbs` read `'unknown'` rather than `'absent'` when
 * EVERY source is blind — an incident whose only witnesses could not be read
 * has no basis to claim either dimension is missing, only that nobody could
 * check.
 */
export function deriveEvidenceCoverage(input: ProofInput): EvidenceCoverage {
  const allSourcesBlind = input.sources.length > 0 && input.sources.every((s) => s.health === 'blind');
  const reproducedProven = deriveReproduced(input.repair).state === 'proven';

  const dimensions = EVIDENCE_DIMENSIONS.map((dimension) => ({
    dimension,
    state: dimensionState(dimension, input, allSourcesBlind, reproducedProven),
  }));

  return {
    dimensions,
    present: dimensions.filter((d) => d.state === 'present').length,
    total: EVIDENCE_DIMENSIONS.length,
  };
}

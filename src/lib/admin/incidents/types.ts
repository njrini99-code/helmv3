/**
 * The unified incident read model — one operator truth over many evidence
 * sources.
 *
 * WHY THIS MODULE EXISTS. The Bridge holds four descriptions of the same
 * production fault and reconciles none of them: an `admin_events` fingerprint
 * bucket (the Errors tab), a Sentry issue (the same tab's other half), a
 * `CorrelatedSignal` on the Reliability tab (a THIRD grouping, on a 3-hour
 * clock), and an `rca_analysis` row keyed by either a bare fingerprint or a
 * `rel:` signature. Reported 2026-08-28 in the self-healing state doc as "the
 * biggest open design problem": two error surfaces that disagree, read
 * different sources on different clocks, and never reconcile.
 *
 * The fix is NOT a new table. It is a read model: one shape, derived at read
 * time from the readers that already exist, so there is no second stored
 * authority free to go stale. `memory/features/admin-platform.md` already
 * records what a second authority costs here, and
 * `.claude/rules/shipping.md` states the general rule — recorded is not
 * applied.
 *
 * THREE INVARIANTS THIS FILE ENCODES.
 *
 *   1. UNKNOWN IS A STATE. Every health, proof and lifecycle union carries an
 *      explicit `unknown`, and no derivation may collapse it into a healthy
 *      value. A source that could not be read is absent, not zero — the same
 *      rule `src/lib/reliability/types.ts` states for `SourceStatus`, lifted
 *      to the incident level.
 *
 *   2. NOTHING DERIVED IS PERSISTED. `lifecycleState`, `proof` and `proofGaps`
 *      are all functions of evidence that changes underneath them. Storing one
 *      would make a stale string outrank live evidence, which is precisely the
 *      failure the control-plane work spent two weeks removing.
 *
 *   3. EVERY CLAIM CARRIES ITS SOURCE AND ITS AGE. `computedAt` and
 *      `sourceFreshness` travel with the incident so a screen can say WHEN it
 *      knew something, not merely what it believes.
 */

import type { RcaCategory } from '@/lib/admin/rca-category';
import type { IncidentClass } from '@/lib/admin/incident-classification';
import type { TriageSeverity } from '@/lib/admin/data/triage';

// ---------------------------------------------------------------------------
// Sources
// ---------------------------------------------------------------------------

/**
 * The four systems that can independently witness a production fault.
 *
 * `app` is this application's own `admin_events` capture; the other three are
 * external observers. Kept as a closed union rather than an open string so a
 * new source cannot be added without every consumer being forced to say how it
 * renders — a source silently missing from a coverage matrix reads as "we
 * looked and found nothing", which is the exact lie this model exists to stop.
 */
export const INCIDENT_SOURCES = ['app', 'sentry', 'supabase', 'vercel'] as const;
export type IncidentSourceName = (typeof INCIDENT_SOURCES)[number];

export const INCIDENT_SOURCE_LABEL: Readonly<Record<IncidentSourceName, string>> = {
  app: 'APP',
  sentry: 'SENTRY',
  supabase: 'SUPABASE',
  vercel: 'VERCEL',
};

/**
 * Whether a source could be READ this refresh — deliberately distinct from
 * whether it saw anything.
 *
 * `reading` means the read succeeded and its results are complete for the
 * window. `partial` means it succeeded but stopped short (a top-N cap, a page
 * limit). `blind` means the read failed. `unknown` means no read was attempted
 * for this incident — the honest answer for a source that has no opinion on a
 * given fault, and never a synonym for healthy.
 */
export const SOURCE_HEALTHS = ['reading', 'partial', 'blind', 'unknown'] as const;
export type SourceHealth = (typeof SOURCE_HEALTHS)[number];

export const SOURCE_HEALTH_LABEL: Readonly<Record<SourceHealth, string>> = {
  reading: 'READING',
  partial: 'PARTIAL',
  blind: 'BLIND',
  unknown: 'UNKNOWN',
};

/**
 * One source's testimony about one incident.
 *
 * `ref` is an evidence REFERENCE, never a copy of the evidence — a Sentry
 * issue id, an `admin_events` fingerprint, a reliability signature. It is what
 * lets an operator pivot to the system of record instead of trusting a
 * transcription. `src/lib/reliability/types.ts` records why a ref is
 * meaningless without knowing which system it addresses, which is why the
 * source travels in the same object rather than in a parallel array.
 */
export interface IncidentSourceEvidence {
  source: IncidentSourceName;
  health: SourceHealth;
  /** Required whenever `health !== 'reading'`; null otherwise. */
  reason: string | null;
  /**
   * Occurrences THIS source counted. `null` when the source saw the fault but
   * exposes no count — distinct from `0`, which would claim it saw none.
   */
  occurrences: number | null;
  firstSeen: string | null;
  lastSeen: string | null;
  ref: string | null;
  /** Deep link to the system of record, when one exists. */
  permalink: string | null;
  /** One operator-readable line: what this source actually says. */
  summary: string | null;
}

/**
 * How fresh a source's data is, independent of any one incident.
 *
 * Cadences differ by an order of magnitude — a live Sentry pull is seconds
 * old, the reliability snapshot is up to three hours old — so a single global
 * "stale" threshold would either cry wolf on the collector or wave through a
 * dead live pull. Each source therefore carries its OWN expectation.
 */
export type FreshnessState = 'fresh' | 'aging' | 'stale' | 'unknown';

export interface SourceFreshness {
  source: IncidentSourceName;
  /** ISO time of the reading this incident was built from. */
  observedAt: string | null;
  ageMs: number | null;
  /** The cadence this source is expected to refresh at. */
  expectedIntervalMs: number;
  state: FreshnessState;
  health: SourceHealth;
}

// ---------------------------------------------------------------------------
// Lifecycle
// ---------------------------------------------------------------------------

/**
 * Where an incident sits on the road from "seen" to "proven fixed".
 *
 * DERIVED, NEVER STORED. Each state is a claim about evidence that can change
 * without anyone editing the incident: a PR merges, production rolls forward,
 * a fault recurs. Persisting the string would let a stale value outrank live
 * evidence.
 *
 * The vocabulary is closed and shared by every surface. Two screens using
 * different words for the same state is how the Bridge got two error tabs.
 */
export const INCIDENT_LIFECYCLE_STATES = [
  'new',
  'diagnosing',
  'needs-evidence',
  'repairable',
  'repairing',
  'pr-open',
  'pr-failed',
  'merged',
  'awaiting-deploy',
  'awaiting-proof',
  'resolved',
  'regressed',
  'not-a-defect',
  'unknown',
] as const;

export type IncidentLifecycleState = (typeof INCIDENT_LIFECYCLE_STATES)[number];

export const LIFECYCLE_LABEL: Readonly<Record<IncidentLifecycleState, string>> = {
  new: 'NEW',
  diagnosing: 'DIAGNOSING',
  'needs-evidence': 'NEEDS EVIDENCE',
  repairable: 'REPAIRABLE',
  repairing: 'REPAIRING',
  'pr-open': 'PR OPEN',
  'pr-failed': 'PR FAILED',
  merged: 'MERGED',
  'awaiting-deploy': 'AWAITING DEPLOY',
  'awaiting-proof': 'AWAITING PROOF',
  resolved: 'RESOLVED',
  regressed: 'REGRESSED',
  'not-a-defect': 'NOT A DEFECT',
  unknown: 'UNKNOWN',
};

/**
 * Tone for the state chip. Green is reserved for VERIFIED success — a state
 * that merely expects to succeed (merged, awaiting deploy) is warning, not
 * success, because calling it green is how "the process ran" starts passing
 * for "the system works".
 */
export type StateTone = 'danger' | 'warning' | 'accent' | 'success' | 'neutral';

export const LIFECYCLE_TONE: Readonly<Record<IncidentLifecycleState, StateTone>> = {
  new: 'neutral',
  diagnosing: 'accent',
  'needs-evidence': 'warning',
  repairable: 'accent',
  repairing: 'accent',
  'pr-open': 'accent',
  'pr-failed': 'danger',
  merged: 'warning',
  'awaiting-deploy': 'warning',
  'awaiting-proof': 'warning',
  resolved: 'success',
  regressed: 'danger',
  'not-a-defect': 'neutral',
  unknown: 'neutral',
};

/**
 * One line of the "why am I seeing this?" explanation.
 *
 * Every derived state must be able to show its own working. A chip an operator
 * cannot interrogate is a chip they eventually stop believing, and this is the
 * mechanical form of that answer: a list of checks, each either satisfied
 * (`met`), outstanding (`pending`), or contradicted (`failed`).
 */
export interface LifecycleReasonLine {
  status: 'met' | 'pending' | 'failed';
  text: string;
}

export interface LifecycleVerdict {
  state: IncidentLifecycleState;
  /** One sentence, plain language, safe to render inline on a card. */
  headline: string;
  /** The checks behind `state`, in the order an operator would ask them. */
  because: LifecycleReasonLine[];
}

// ---------------------------------------------------------------------------
// Analysis / repair / release
// ---------------------------------------------------------------------------

/**
 * Repair's verdict on a Diagnose analysis.
 *
 * The two halves of the self-healing loop run in different processes and can
 * disagree; that disagreement is a QUALITY SIGNAL, not an embarrassment to
 * hide. `corrected` is the most valuable value here — it is the only empirical
 * feedback the Diagnose contract gets.
 */
export type RepairVerdict = 'confirmed' | 'corrected' | 'not-reviewed';

export interface IncidentAnalysis {
  /** From `deriveRcaCategory` — the shared repair vocabulary, not free prose. */
  category: RcaCategory;
  probableCause: string;
  suggestedFix: string;
  /** The model's OWN stated confidence. Never presented as a probability. */
  confidence: 'high' | 'medium' | 'low';
  suspectFiles: ReadonlyArray<{ path: string; line?: number; reason: string }>;
  relatedFingerprints: readonly string[];
  model: string;
  generatedAt: string;
  repairVerdict: RepairVerdict;
}

/**
 * What the repair half has actually done about this incident.
 *
 * `none` and `unknown` are different: the first says no repair exists, the
 * second says the GitHub lookup failed and we cannot tell. A failed lookup
 * rendering as "no repair" would quietly re-queue work that is already done.
 */
export const REPAIR_STATUSES = [
  'none',
  'candidate',
  'running',
  'pr-open',
  'pr-failed',
  'merged',
  'unknown',
] as const;
export type RepairStatus = (typeof REPAIR_STATUSES)[number];

export interface RepairChecks {
  total: number;
  passed: number;
  failed: number;
  pending: number;
}

export interface IncidentRepair {
  status: RepairStatus;
  prNumber: number | null;
  prUrl: string | null;
  branch: string | null;
  /** null when the checks could not be read — never a fabricated all-green. */
  checks: RepairChecks | null;
  mergedAt: string | null;
  mergeSha: string | null;
  /** Why `status` is what it is, for the drawer. */
  note: string | null;
}

/**
 * Whether production actually serves the fix, and whether enough has happened
 * since to call it proven.
 *
 * `servesFix` and `sufficientTraffic` are BOTH nullable, because "we could not
 * reach Vercel" and "the fix is not live" are different facts and the Bridge
 * has rendered them identically before — `shipStatus`'s three outcomes exist
 * in `auto-resolve.ts` for the same reason.
 */
export interface IncidentDeployProof {
  fixedInSha: string | null;
  productionSha: string | null;
  deployedAt: string | null;
  /** null = unknown (deploy data unreadable). */
  servesFix: boolean | null;
  lastOccurrenceAt: string | null;
  /** Time since the fix went live, when both ends are known. */
  sinceDeployMs: number | null;
  /** Whether enough post-deploy evidence exists to close. null = unknown. */
  sufficientProof: boolean | null;
  /** Plain language: what is still missing. */
  gap: string | null;
}

export interface IncidentResolution {
  resolvedAt: string;
  /** `auto` = the nightly cron inferred it; `manual` = a human decided. */
  resolvedBy: 'auto' | 'manual' | 'unknown';
  fixedInSha: string | null;
  note: string | null;
  /** Survives a re-resolve, so "fixed three times already" cannot be laundered. */
  reopenedCount: number;
}

// ---------------------------------------------------------------------------
// Proof
// ---------------------------------------------------------------------------

/**
 * The six evidence milestones between "something happened" and "we proved it
 * stopped".
 *
 * Each one is a SPECIFIC claim with specific evidence, which is why this is a
 * checklist and not a percentage. `4 of 6` is a factual statement about which
 * milestones have evidence; `67% confident` would imply a calibration this
 * system does not have.
 *
 * `pr-open` is deliberately NOT a milestone. A pull request existing proves
 * nothing about the code in it; `ci-proven` is the milestone, and it requires
 * checks that actually passed.
 */
export const PROOF_MILESTONES = [
  'observed',
  'analyzed',
  'reproduced',
  'ci-proven',
  'deployed',
  'production-verified',
] as const;
export type ProofMilestone = (typeof PROOF_MILESTONES)[number];

export const PROOF_MILESTONE_LABEL: Readonly<Record<ProofMilestone, string>> = {
  observed: 'OBSERVED',
  analyzed: 'ANALYZED',
  reproduced: 'REPRODUCED',
  'ci-proven': 'CI PROVEN',
  deployed: 'DEPLOYED',
  'production-verified': 'PRODUCTION VERIFIED',
};

/**
 * `proven` has evidence. `pending` is actively expected. `not-reached` is not
 * yet applicable. `failed` is contradicted evidence. `unknown` is a read we
 * could not make — and must never render like `not-reached`, which reads as
 * orderly progress.
 */
export type ProofState = 'proven' | 'pending' | 'not-reached' | 'failed' | 'unknown';

export interface ProofDot {
  milestone: ProofMilestone;
  state: ProofState;
  /** What proves (or fails to prove) it — shown on tap, never invented. */
  evidence: string | null;
}

/**
 * Work that LOOKS solved but still lacks the evidence to say so.
 *
 * This is the concept the open/resolved axis cannot express, and the one an
 * operator most needs: an incident whose fix is deployed but whose traffic has
 * not returned yet is neither open nor closed, and disappears from both lists.
 */
export type ProofGapKind =
  | 'awaiting-traffic'
  | 'awaiting-ci'
  | 'awaiting-deploy'
  | 'awaiting-evidence'
  | 'awaiting-repair'
  | 'source-blind'
  | 'awaiting-owner';

export const PROOF_GAP_LABEL: Readonly<Record<ProofGapKind, string>> = {
  'awaiting-traffic': 'Waiting for post-deploy traffic',
  'awaiting-ci': 'Waiting for CI',
  'awaiting-deploy': 'Merged, not deployed',
  'awaiting-evidence': 'Needs more evidence',
  'awaiting-repair': 'No repair attempted',
  'source-blind': 'A source is blind',
  'awaiting-owner': 'Waiting on an owner decision',
};

export interface ProofGap {
  kind: ProofGapKind;
  /** Plain-language specifics — "iOS calls since deploy: 4", not a category. */
  detail: string;
  /** Roughly how long it has been in this state, when known. */
  ageMs: number | null;
}

/**
 * Mechanical evidence coverage — which artefacts an incident actually carries.
 *
 * Deliberately NOT merged with the model's confidence rating. That is a
 * subjective judgement; this is a checklist of things that either exist or do
 * not, and conflating them would let a confident analysis of thin evidence
 * read as well-evidenced.
 */
export const EVIDENCE_DIMENSIONS = [
  'stack',
  'breadcrumbs',
  'route',
  'error-code',
  'deploy-context',
  'git-history',
  'reproduction',
] as const;
export type EvidenceDimension = (typeof EVIDENCE_DIMENSIONS)[number];

export const EVIDENCE_DIMENSION_LABEL: Readonly<Record<EvidenceDimension, string>> = {
  stack: 'STACK',
  breadcrumbs: 'BREADCRUMBS',
  route: 'ROUTE',
  'error-code': 'ERROR CODE',
  'deploy-context': 'DEPLOY',
  'git-history': 'GIT HISTORY',
  reproduction: 'REPRO',
};

export interface EvidenceCoverage {
  /** Present / absent / unreadable, per dimension. */
  dimensions: ReadonlyArray<{ dimension: EvidenceDimension; state: 'present' | 'absent' | 'unknown' }>;
  present: number;
  total: number;
}

// ---------------------------------------------------------------------------
// The incident
// ---------------------------------------------------------------------------

export type IncidentSeverity = TriageSeverity;

/**
 * One production cause, once, with every source that saw it attached.
 *
 * IDENTITY. `id` is the most durable key available, in this order: an
 * `admin_events` fingerprint, then `rel:<signature>` for a reliability-only
 * signal, then `sentry:<issueId>`. That order matters because the first two
 * already resolve at `/admin/errors/<id>` — inventing a synthetic key would
 * break every existing deep link and every RCA row, which are stored under
 * exactly these strings.
 */
export interface UnifiedIncident {
  id: string;
  /** In-Bridge detail route, or null when the only home is an external tool. */
  linkTarget: string | null;
  title: string;
  /** The sentence the card renders — see `buildIncidentDescription`. */
  description: string;
  severity: IncidentSeverity;

  lifecycle: LifecycleVerdict;

  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  affectedUsers: number;
  /**
   * `affectedUsers === 0` means "no KNOWN identity" for app-origin incidents —
   * often a pre-auth failure, not an unaffected one. Sentry's own userCount is
   * zero-means-zero. The flag keeps the card from claiming the wrong one.
   */
  affectedUsersKnown: boolean;

  sources: readonly IncidentSourceEvidence[];
  /** Independent observers that SAW it. Not a confidence score. */
  corroboration: number;

  appFingerprints: readonly string[];
  sentryIssueIds: readonly string[];
  reliabilitySignatures: readonly string[];

  route: string | null;
  featureId: string | null;
  actionName: string | null;
  errorCode: string | null;
  sport: 'golf' | 'baseball' | 'shared' | null;

  /** The kind axis, orthogonal to severity — see incident-classification. */
  klass: IncidentClass;
  actionable: boolean;
  klassReason: string;

  analysis: IncidentAnalysis | null;
  repair: IncidentRepair | null;
  deployProof: IncidentDeployProof | null;
  resolution: IncidentResolution | null;

  proof: readonly ProofDot[];
  proofGaps: readonly ProofGap[];
  evidenceCoverage: EvidenceCoverage;

  /** Pre-built Copy-for-Claude markdown, carried through from the source item. */
  report: string;

  computedAt: string;
}

// ---------------------------------------------------------------------------
// Lenses
// ---------------------------------------------------------------------------

/**
 * The Incidents tab's segmented control. These are FILTERS OVER ONE MODEL, not
 * separate datasets — which is the whole point. Reliability stopped being a
 * competing incident list the moment it became a lens.
 */
export const INCIDENT_LENSES = [
  'actionable',
  'reliability',
  'repairable',
  'needs-evidence',
  'regressions',
  'stalled',
  'awaiting-proof',
  'all',
] as const;
export type IncidentLens = (typeof INCIDENT_LENSES)[number];

export const INCIDENT_LENS_LABEL: Readonly<Record<IncidentLens, string>> = {
  actionable: 'Actionable',
  reliability: 'Reliability',
  repairable: 'Repairable',
  'needs-evidence': 'Needs evidence',
  regressions: 'Regressions',
  stalled: 'Stalled',
  'awaiting-proof': 'Awaiting proof',
  all: 'All',
};

/** One line per lens, rendered as the "why these rows?" note under the rail. */
export const INCIDENT_LENS_DESCRIPTION: Readonly<Record<IncidentLens, string>> = {
  actionable: 'Real defects and degradations that are still unresolved.',
  reliability: 'Seen by two or more independent sources, or by a non-app observer.',
  repairable: 'An analysis says FIX HERE, or a repair candidate is confirmed.',
  'needs-evidence': 'Analysis cannot safely progress without more evidence.',
  regressions: 'Previously resolved, and observed again since.',
  stalled: 'Waiting on a self-heal stage past two of its cycles — the loop is running, and not moving these.',
  'awaiting-proof': 'A fix exists; the evidence to close it does not yet.',
  all: 'Everything, including non-defects and expected control flow.',
};

/**
 * Counts per lens, computed once so the header, the rail and any badge cannot
 * disagree. `incident-count-agreement.test.ts` exists because they did.
 */
export type IncidentLensCounts = Record<IncidentLens, number>;

/**
 * Read the lens off a URL search param.
 *
 * Defaults to `'actionable'` — the lens that answers "what is broken", which
 * is what someone opening the tab is asking. An unrecognised value falls back
 * rather than throwing: a stale bookmark from before a lens was renamed should
 * land on the default view, not a 500.
 */
export function parseIncidentLens(raw: string | string[] | undefined): IncidentLens {
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (INCIDENT_LENSES as readonly string[]).includes(value ?? '')
    ? (value as IncidentLens)
    : 'actionable';
}

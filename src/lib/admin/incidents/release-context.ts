/**
 * ReleaseContext + the Runtime Identity Triplet (brief §6, §9).
 *
 * "Every incident gets a release relationship: NEW AFTER RELEASE, REGRESSED
 * AFTER RELEASE, EXISTED BEFORE RELEASE, IMPROVED AFTER RELEASE, NO CAUSAL
 * SIGNAL, UNKNOWN. Proximity is not causation." This module is the pure
 * classifier behind that sentence, plus the release-epoch shape
 * (`ReleaseContext`) and its Release Watch state machine.
 *
 * PURE, LIKE ITS SIBLINGS. No I/O, no ambient clock — every function here
 * takes its evidence as an argument, the same discipline `deploy-proof.ts`
 * and `deploy-freshness.ts` already use (their `classify*` half is pure and
 * unit-tested; their `fetch*` half is I/O, fails soft to `unknown`, and is
 * deliberately NOT unit-tested — see `deploy-freshness.test.ts`, which only
 * exercises `classifyDeployFreshness`). `fetchProductionMigrationHead`
 * below follows that exact split.
 *
 * WHY THE DB MIGRATION HEAD IS A SEPARATE, UNTESTED READER. It is only
 * reachable by a live query against `supabase_migrations.schema_migrations`
 * (see `scripts/db/migration-ledger-drift.mjs`'s own header) or the
 * Supabase Management API — there is no file in this repo that states it.
 * Pulling a Postgres client or even `fetch`-based Management API creds into
 * a module under `src/lib/admin/incidents/` would risk the same poisoning
 * `rca-category.ts`'s header warns about for `server-only` imports, so this
 * file keeps the READ (network, credentials, fails open to `'unknown'`)
 * fully separate from the pure BUILD (`buildReleaseContext`, exhaustively
 * tested with an injected value).
 */

import { MODEL_FOR_TASK, type ComposeTask } from '@/lib/coachhelm/v3/llm/types';
import { PRODUCTION_PROOF_WINDOW_MS } from './proof';

// ---------------------------------------------------------------------------
// Runtime Identity Triplet — APP SHA · DB migration head · AI config
// ---------------------------------------------------------------------------

export type MigrationHeadState = 'known' | 'unknown';

export interface RuntimeIdentityTriplet {
  appSha: string | null;
  dbMigrationHead: string | null;
  dbMigrationHeadState: MigrationHeadState;
  /** Deterministic identity string over CoachHelm's task->model assignment. */
  aiConfigIdentity: string;
}

/**
 * A stable identity string for "which model runs which CoachHelm task right
 * now" — there is no separate prompt-version constant in this codebase
 * (`MODEL_FOR_TASK`, `src/lib/coachhelm/v3/llm/types.ts`, is the only
 * versioned config that exists), so the identity is derived deterministically
 * from that record rather than invented. Sorted by task so the string is
 * stable regardless of object key insertion order.
 */
export function buildAiConfigIdentity(
  modelForTask: Readonly<Record<ComposeTask, string>> = MODEL_FOR_TASK,
): string {
  return Object.entries(modelForTask)
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([task, model]) => `${task}=${model}`)
    .join('|');
}

export function buildRuntimeIdentityTriplet(input: {
  appSha: string | null;
  dbMigrationHead: string | null;
  dbMigrationHeadState: MigrationHeadState;
  modelForTask?: Readonly<Record<ComposeTask, string>>;
}): RuntimeIdentityTriplet {
  return {
    appSha: input.appSha,
    dbMigrationHead: input.dbMigrationHead,
    dbMigrationHeadState: input.dbMigrationHeadState,
    aiConfigIdentity: buildAiConfigIdentity(input.modelForTask),
  };
}

/**
 * Fail-open reader for the production DB migration head, via the Supabase
 * Management API (the same path the 2026-09-03 handoff records the Supabase
 * session using for read-only SQL: `POST /v1/projects/<ref>/database/query`).
 * Never throws; a missing token, a missing project ref, a non-2xx response or
 * a network failure all resolve to `'unknown'` — the identical shape
 * `fetchDeployFreshness` (`deploy-freshness.ts`) uses for the same reason:
 * "we could not check" and "there is nothing" must never render the same.
 *
 * Intentionally NOT unit-tested, matching `fetchDeployFreshness` — an
 * I/O boundary with no pure logic of its own to pin. Callers should treat
 * an `'unknown'` result as ordinary, not exceptional.
 */
export async function fetchProductionMigrationHead(): Promise<{
  head: string | null;
  state: MigrationHeadState;
}> {
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  const projectRef = process.env.SUPABASE_PROJECT_REF;
  if (!token || !projectRef) return { head: null, state: 'unknown' };

  try {
    const res = await fetch(`https://api.supabase.com/v1/projects/${projectRef}/database/query`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        query:
          'select version from supabase_migrations.schema_migrations order by version desc limit 1',
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { head: null, state: 'unknown' };
    const rows = (await res.json()) as Array<{ version?: unknown }>;
    const version = rows[0]?.version;
    if (typeof version !== 'string' || version.length === 0) return { head: null, state: 'unknown' };
    return { head: version, state: 'known' };
  } catch {
    return { head: null, state: 'unknown' };
  }
}

// ---------------------------------------------------------------------------
// Release relationship — brief §9
// ---------------------------------------------------------------------------

export const RELEASE_RELATIONSHIPS = [
  'new-after-release',
  'regressed-after-release',
  'existed-before-release',
  'improved-after-release',
  'no-causal-signal',
  'unknown',
] as const;
export type ReleaseRelationship = (typeof RELEASE_RELATIONSHIPS)[number];

export const RELEASE_RELATIONSHIP_LABEL: Readonly<Record<ReleaseRelationship, string>> = {
  'new-after-release': 'NEW AFTER RELEASE',
  'regressed-after-release': 'REGRESSED AFTER RELEASE',
  'existed-before-release': 'EXISTED BEFORE RELEASE',
  'improved-after-release': 'IMPROVED AFTER RELEASE',
  'no-causal-signal': 'NO CAUSAL SIGNAL',
  unknown: 'UNKNOWN',
};

export interface ReleaseRelationshipEvidence {
  /** The incident's true first-ever occurrence, never a windowed one. */
  firstSeenMs: number;
  /** This release's deploy time. `null` -> the relationship is UNKNOWN. */
  releaseDeployedAtMs: number | null;
  /** How the occurrence rate moved after this release, for an incident that
   *  already existed before it. */
  occurrenceTrend: 'improved' | 'worsened' | 'unchanged' | 'unknown';
  featureChangedInRelease: boolean | null;
  codeInTraceChangedInRelease: boolean | null;
  candidateCohortOnly: boolean | null;
  baselineCohortClean: boolean | null;
  replayReproducesOnNewShaOnly: boolean | null;
  /** How soon after deploy still counts as "shortly after". Default 24h. */
  proximityWindowMs?: number;
}

export interface ReleaseRelationshipVerdict {
  relationship: ReleaseRelationship;
  /** Never 1 from temporal correlation alone — see the brief's causal-ladder note. */
  confidence: number;
  evidenceFor: readonly string[];
  evidenceAgainst: readonly string[];
}

const DEFAULT_PROXIMITY_WINDOW_MS = 24 * 3600_000;

/**
 * Classify one incident's relationship to one release.
 *
 * "Proximity is not causation": a NEW incident first seen shortly after
 * deploy with NO other supporting evidence resolves to `'no-causal-signal'`,
 * not `'new-after-release'` — timing alone is exactly the case the brief
 * calls out by name. Confidence for `'new-after-release'` scales with how
 * many independent signals corroborate it and is capped below 1.
 */
export function classifyReleaseRelationship(evidence: ReleaseRelationshipEvidence): ReleaseRelationshipVerdict {
  if (evidence.releaseDeployedAtMs === null) {
    return { relationship: 'unknown', confidence: 0, evidenceFor: [], evidenceAgainst: ['Release deploy time is unknown.'] };
  }

  const existedBefore = evidence.firstSeenMs < evidence.releaseDeployedAtMs;

  if (existedBefore) {
    if (evidence.occurrenceTrend === 'improved') {
      return {
        relationship: 'improved-after-release',
        confidence: 0.7,
        evidenceFor: ['First seen before this release; occurrence rate improved after it.'],
        evidenceAgainst: [],
      };
    }
    if (evidence.occurrenceTrend === 'worsened') {
      return {
        relationship: 'regressed-after-release',
        confidence: 0.7,
        evidenceFor: ['First seen before this release; occurrence rate worsened after it.'],
        evidenceAgainst: [],
      };
    }
    return {
      relationship: 'existed-before-release',
      confidence: 0.9,
      evidenceFor: ['First seen before this release deployed.'],
      evidenceAgainst: [],
    };
  }

  const proximityWindowMs = evidence.proximityWindowMs ?? DEFAULT_PROXIMITY_WINDOW_MS;
  const withinProximity = evidence.firstSeenMs - evidence.releaseDeployedAtMs <= proximityWindowMs;

  const evidenceFor: string[] = [];
  if (evidence.featureChangedInRelease) evidenceFor.push('The affected feature changed in this release.');
  if (evidence.codeInTraceChangedInRelease) evidenceFor.push('Code in the failing trace/stack changed in this release.');
  if (evidence.candidateCohortOnly) evidenceFor.push('Only the candidate cohort is affected.');
  if (evidence.baselineCohortClean) evidenceFor.push('The baseline cohort stayed clean.');
  if (evidence.replayReproducesOnNewShaOnly) evidenceFor.push('A replay reproduces on the new SHA but not the old one.');

  if (!withinProximity) {
    return {
      relationship: 'no-causal-signal',
      confidence: 0,
      evidenceFor: [],
      evidenceAgainst: ['First seen well after this release deployed — proximity alone would not explain it.'],
    };
  }

  if (evidenceFor.length === 0) {
    return {
      relationship: 'no-causal-signal',
      confidence: 0,
      evidenceFor: [],
      evidenceAgainst: ['First seen shortly after this release, but proximity alone is not causation — no other signal corroborates it.'],
    };
  }

  return {
    relationship: 'new-after-release',
    // 0.5 base (deploy proximity plus at least one corroborating signal) up
    // to 0.95, one signal at a time — never 1.0 from any combination.
    confidence: Math.min(0.5 + evidenceFor.length * 0.1, 0.95),
    evidenceFor,
    evidenceAgainst: [],
  };
}

// ---------------------------------------------------------------------------
// Release Watch — brief §9
// ---------------------------------------------------------------------------

export const RELEASE_WATCH_STATES = [
  'observing',
  'clean-so-far',
  'degraded',
  'regression-detected',
  'rollback-recommended',
  'proven-healthy',
  'unknown',
] as const;
export type ReleaseWatchState = (typeof RELEASE_WATCH_STATES)[number];

export const RELEASE_WATCH_LABEL: Readonly<Record<ReleaseWatchState, string>> = {
  observing: 'OBSERVING',
  'clean-so-far': 'CLEAN SO FAR',
  degraded: 'DEGRADED',
  'regression-detected': 'REGRESSION DETECTED',
  'rollback-recommended': 'ROLLBACK RECOMMENDED',
  'proven-healthy': 'PROVEN HEALTHY',
  unknown: 'UNKNOWN',
};

/** Below this age, there simply has not been enough traffic to say "clean so far" yet. */
export const OBSERVING_WINDOW_MS = 60 * 60_000;
/** At/after this age with no bad signal AND full source coverage, the release is PROVEN HEALTHY.
 *  Mirrors `PRODUCTION_PROOF_WINDOW_MS` (`proof.ts`) — the same "how long is enough silence"
 *  constant already governing per-incident proof, reused rather than re-decided here. */
export const PROVEN_HEALTHY_WINDOW_MS = PRODUCTION_PROOF_WINDOW_MS;

export interface ReleaseWatchEvidence {
  releaseDeployedAtMs: number | null;
  now: number;
  newIncidentsCount: number;
  regressedIncidentsCount: number;
  /** An external determination (e.g. severity/blast-radius) that a rollback should be offered. */
  rollbackRecommended: boolean;
  /** True when any evidence source needed to judge this watch is blind. */
  sourceCoverageBlind: boolean;
}

/**
 * Derive the Release Watch state for one release epoch.
 *
 * Bad news always wins over elapsed time — a release open for a week with a
 * regression today is still `'regression-detected'`, never `'proven-healthy'`
 * because the clock ran out first. `'proven-healthy'` additionally REQUIRES
 * full source coverage: an old, quiet release watched through a blind source
 * cannot be called proven, only `'unknown'` — silence from a source that
 * cannot be read is not evidence of health.
 */
export function classifyReleaseWatch(evidence: ReleaseWatchEvidence): ReleaseWatchState {
  if (evidence.releaseDeployedAtMs === null) return 'unknown';

  if (evidence.regressedIncidentsCount > 0) {
    return evidence.rollbackRecommended ? 'rollback-recommended' : 'regression-detected';
  }
  if (evidence.newIncidentsCount > 0) return 'degraded';

  const elapsedMs = evidence.now - evidence.releaseDeployedAtMs;

  if (elapsedMs >= PROVEN_HEALTHY_WINDOW_MS) {
    return evidence.sourceCoverageBlind ? 'unknown' : 'proven-healthy';
  }
  if (elapsedMs < OBSERVING_WINDOW_MS) return 'observing';
  return 'clean-so-far';
}

// ---------------------------------------------------------------------------
// ReleaseContext — brief §6
// ---------------------------------------------------------------------------

export interface ReleaseIncludedPr {
  number: number;
  title: string;
  mergedAt: string | null;
  url: string;
}

export interface ReleaseContext {
  releaseSha: string;
  deployedAt: string | null;
  baselineReleaseSha: string | null;
  runtimeIdentity: RuntimeIdentityTriplet;
  includedPrs: readonly ReleaseIncludedPr[];
  releaseWatch: ReleaseWatchState;
  newFingerprints: readonly string[];
  regressedFingerprints: readonly string[];
  /** Feature flag / cohort identity active for this release, when applicable. */
  cohort: string | null;
}

export interface BuildReleaseContextInput {
  releaseSha: string;
  deployedAt: string | null;
  baselineReleaseSha: string | null;
  runtimeIdentity: RuntimeIdentityTriplet;
  includedPrs: readonly ReleaseIncludedPr[];
  watchEvidence: ReleaseWatchEvidence;
  newFingerprints: readonly string[];
  regressedFingerprints: readonly string[];
  cohort?: string | null;
}

/** Pure assembly — every field either passed straight through or derived by
 *  `classifyReleaseWatch` from the evidence already gathered elsewhere. */
export function buildReleaseContext(input: BuildReleaseContextInput): ReleaseContext {
  return {
    releaseSha: input.releaseSha,
    deployedAt: input.deployedAt,
    baselineReleaseSha: input.baselineReleaseSha,
    runtimeIdentity: input.runtimeIdentity,
    includedPrs: input.includedPrs,
    releaseWatch: classifyReleaseWatch(input.watchEvidence),
    newFingerprints: input.newFingerprints,
    regressedFingerprints: input.regressedFingerprints,
    cohort: input.cohort ?? null,
  };
}

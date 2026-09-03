/**
 * Release Watch wiring — the adapter between Phase 0's pure release models
 * (`release-context.ts`, `release-compare.ts`) and the data this repo can
 * actually read today (brief §9 "Post-deployment error tracking", §12
 * "Release Wake", §28 "Deploys & Infra").
 *
 * SPLIT ON PURPOSE, LIKE ITS SIBLINGS. The `classify*`/`build*` half below is
 * pure and unit-tested; `fetchCurrentReleaseWatch` is the I/O boundary (reads
 * `fetchReleaseLedger()`, `fetchProductionMigrationHead()`,
 * `process.env.VERCEL_GIT_COMMIT_SHA`), fails soft, and is deliberately NOT
 * unit-tested — the same discipline `release-context.ts`'s own header
 * documents for `fetchProductionMigrationHead`.
 *
 * WHY `fetchReleaseLedger()` AND NOT A NEW VERCEL READER. `release-ledger.ts`
 * already reads production deploy history (Vercel API, falling back to
 * `admin_events` deploy markers), already tracks each deploy's own verdict
 * (`errorsBefore2h`/`errorsAfter2h`/`delta`), and already knows which card
 * `isLive`. Re-deriving any of that here would be a second authority for
 * "what deployed and when" — exactly what `types.ts`'s own header warns
 * against. This module ADDS the Phase 0 vocabulary (Runtime Identity
 * Triplet, `ReleaseRelationship` per incident, `ReleaseWatchState`) on top of
 * facts `release-ledger.ts` already computed; it does not re-fetch deploys
 * itself.
 *
 * WHAT THIS MODULE HONESTLY CANNOT ANSWER YET. `journeySuccessRate`,
 * `dbP95Ms`, `invariantBreaches` and `sqlstates` have no read model anywhere
 * in this codebase (`release-compare.ts`'s own header says so: "later Phase D
 * work"). `buildCurrentReleaseComparison` below always passes
 * `dbSourceBlind: true` for both snapshots, which — per `buildReleaseComparison`'s
 * own contract — forces those three fields to the `'unknown'` metric rather
 * than fabricating a zero. Only `rootIncidentCount` and `affectedUsers`
 * (`deriveRootIncidentFacts`, already exported by `release-compare.ts`) are
 * real numbers here.
 */

import { fetchReleaseLedger, type ReleaseCardData } from '@/lib/admin/data/release-ledger';
import type { CoverageSummary } from './sources';
import type { UnifiedIncident } from './types';
import {
  buildAiConfigIdentity,
  buildReleaseContext,
  buildRuntimeIdentityTriplet,
  classifyReleaseRelationship,
  classifyReleaseWatch,
  fetchProductionMigrationHead,
  type ReleaseContext,
  type ReleaseRelationshipVerdict,
  type ReleaseWatchEvidence,
} from './release-context';
import {
  buildReleaseComparison,
  deriveRootIncidentFacts,
  type ReleaseComparisonResult,
  type ReleaseSnapshotFacts,
} from './release-compare';

// ---------------------------------------------------------------------------
// Per-incident release relationship
// ---------------------------------------------------------------------------

export interface ReleaseRelationshipInput {
  incident: Pick<UnifiedIncident, 'firstSeen' | 'lifecycle' | 'featureId'>;
  releaseDeployedAtMs: number | null;
  /** True when this incident's own feature appears in the current card's
   *  `topFeatureDeltas` with a positive delta — real, already-computed
   *  evidence from `release-ledger.ts`, not an invented signal. */
  featureRegressedInRelease: boolean;
}

/**
 * Classify one incident's relationship to the current release, using only
 * evidence this codebase actually has: `firstSeen` vs. the deploy time, and
 * whether the incident's own feature shows a worsening error delta in that
 * deploy's reign (`ReleaseCardData.topFeatureDeltas`). Every OTHER
 * `ReleaseRelationshipEvidence` field `release-context.ts` accepts
 * (`codeInTraceChangedInRelease`, `candidateCohortOnly`, `baselineCohortClean`,
 * `replayReproducesOnNewShaOnly`) has no source in this codebase and is
 * passed `null` — never guessed. `occurrenceTrend` is read off the
 * incident's own lifecycle state, which is the closest already-derived
 * "did this get better or worse" signal this model carries.
 */
export function classifyIncidentReleaseRelationship(
  input: ReleaseRelationshipInput,
): ReleaseRelationshipVerdict {
  const firstSeenMs = Date.parse(input.incident.firstSeen);
  const occurrenceTrend: 'improved' | 'worsened' | 'unchanged' | 'unknown' =
    input.incident.lifecycle.state === 'regressed'
      ? 'worsened'
      : input.incident.lifecycle.state === 'resolved'
        ? 'improved'
        : 'unchanged';

  return classifyReleaseRelationship({
    firstSeenMs,
    releaseDeployedAtMs: input.releaseDeployedAtMs,
    occurrenceTrend,
    featureChangedInRelease: input.featureRegressedInRelease,
    codeInTraceChangedInRelease: null,
    candidateCohortOnly: null,
    baselineCohortClean: null,
    replayReproducesOnNewShaOnly: null,
  });
}

// ---------------------------------------------------------------------------
// Board-wide release relationships + watch state
// ---------------------------------------------------------------------------

export interface CurrentReleaseWatch {
  context: ReleaseContext;
  /** Incident id -> its relationship to the current release. */
  relationships: ReadonlyMap<string, ReleaseRelationshipVerdict>;
  comparison: ReleaseComparisonResult | null;
  /** The `release-ledger.ts` card this watch is built from, or null when no
   *  production deploy could be identified (Vercel unconfigured and no
   *  deploy-marker fallback rows). */
  currentCard: ReleaseCardData | null;
  baselineCard: ReleaseCardData | null;
  /** Why `currentCard` is null, when it is — surfaced so a panel can render
   *  an honest "release data unavailable" state rather than nothing. */
  unavailableReason: string | null;
}

function toSnapshotFacts(
  card: ReleaseCardData | null,
  incidents: readonly UnifiedIncident[],
  coverage: CoverageSummary,
): ReleaseSnapshotFacts {
  const rootFacts = deriveRootIncidentFacts(incidents, coverage);
  return {
    releaseSha: card?.commitSha ?? null,
    rootIncidentCount: rootFacts.rootIncidentCount,
    affectedUsers: rootFacts.affectedUsers,
    journeySuccessRate: null,
    dbP95Ms: null,
    sqlstates: [],
    invariantBreaches: null,
    // Always blind: no DB-window read model exists yet — see the module
    // header. Forces dbP95Ms/invariantBreaches/newSqlstates to 'unknown'
    // rather than a fabricated zero.
    dbSourceBlind: true,
  };
}

/**
 * A Release Watch that honestly says nothing could be determined —
 * shared by `fetchCurrentReleaseWatch`'s own soft-fail branches and by any
 * caller that wraps it in a `.catch()` for defense in depth (server
 * components must never let one provider failure blank the whole page).
 * Never throws, never guesses a SHA or a deploy time.
 */
export function emptyReleaseWatch(reason: string, coverageBlind: boolean = false): CurrentReleaseWatch {
  const appSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
  const context = buildReleaseContext({
    releaseSha: appSha ?? 'unknown',
    deployedAt: null,
    baselineReleaseSha: null,
    runtimeIdentity: buildRuntimeIdentityTriplet({
      appSha,
      dbMigrationHead: null,
      dbMigrationHeadState: 'unknown',
    }),
    includedPrs: [],
    watchEvidence: {
      releaseDeployedAtMs: null,
      now: Date.now(),
      newIncidentsCount: 0,
      regressedIncidentsCount: 0,
      rollbackRecommended: false,
      sourceCoverageBlind: coverageBlind,
    },
    newFingerprints: [],
    regressedFingerprints: [],
  });
  return {
    context,
    relationships: new Map(),
    comparison: null,
    currentCard: null,
    baselineCard: null,
    unavailableReason: reason,
  };
}

/**
 * Build the whole Release Watch for the current production release.
 *
 * `board.incidents`/`board.coverage` should be the SAME board the Incidents
 * queue already rendered, so a relationship verdict here can never disagree
 * with what the queue shows for the same incident on the same refresh.
 */
export async function fetchCurrentReleaseWatch(board: {
  incidents: readonly UnifiedIncident[];
  coverage: CoverageSummary;
}): Promise<CurrentReleaseWatch> {
  const now = Date.now();
  const [ledger, migrationHead] = await Promise.all([fetchReleaseLedger(), fetchProductionMigrationHead()]);

  if (ledger.status !== 'ok' || !ledger.data) {
    const appSha = process.env.VERCEL_GIT_COMMIT_SHA?.trim() || null;
    const emptyContext = buildReleaseContext({
      releaseSha: appSha ?? 'unknown',
      deployedAt: null,
      baselineReleaseSha: null,
      runtimeIdentity: buildRuntimeIdentityTriplet({
        appSha,
        dbMigrationHead: migrationHead.head,
        dbMigrationHeadState: migrationHead.state,
      }),
      includedPrs: [],
      watchEvidence: {
        releaseDeployedAtMs: null,
        now,
        newIncidentsCount: 0,
        regressedIncidentsCount: 0,
        rollbackRecommended: false,
        sourceCoverageBlind: board.coverage.anyBlind,
      },
      newFingerprints: [],
      regressedFingerprints: [],
    });
    return {
      context: emptyContext,
      relationships: new Map(),
      comparison: null,
      currentCard: null,
      baselineCard: null,
      unavailableReason: ledger.status === 'unconfigured' ? 'Release ledger is not configured.' : (ledger.error ?? 'Release ledger unavailable.'),
    };
  }

  const cards = ledger.data.cards;
  const currentCard = cards.find((c) => c.isLive) ?? cards[0] ?? null;
  const currentIdx = currentCard ? cards.indexOf(currentCard) : -1;
  const baselineCard = currentIdx >= 0 ? (cards[currentIdx + 1] ?? null) : null;

  const relationships = new Map<string, ReleaseRelationshipVerdict>();
  for (const incident of board.incidents) {
    const featureRegressedInRelease =
      incident.featureId !== null &&
      (currentCard?.topFeatureDeltas.some((d) => d.feature === incident.featureId && d.delta > 0) ?? false);
    relationships.set(
      incident.id,
      classifyIncidentReleaseRelationship({
        incident,
        releaseDeployedAtMs: currentCard?.createdAt ?? null,
        featureRegressedInRelease,
      }),
    );
  }

  const newIncidentsCount = Array.from(relationships.values()).filter(
    (r) => r.relationship === 'new-after-release',
  ).length;
  const regressedIncidentsCount = Array.from(relationships.values()).filter(
    (r) => r.relationship === 'regressed-after-release',
  ).length;

  const watchEvidence: ReleaseWatchEvidence = {
    releaseDeployedAtMs: currentCard?.createdAt ?? null,
    now,
    newIncidentsCount,
    regressedIncidentsCount,
    // No rollback-recommendation model exists yet in this codebase (that is
    // Phase 3's "rollback intelligence", brief §28) — never true here.
    rollbackRecommended: false,
    sourceCoverageBlind: board.coverage.anyBlind,
  };

  const appSha = ledger.data.currentBuildSha;
  const context = buildReleaseContext({
    releaseSha: currentCard?.commitSha ?? appSha ?? 'unknown',
    deployedAt: currentCard ? new Date(currentCard.createdAt).toISOString() : null,
    baselineReleaseSha: baselineCard?.commitSha ?? null,
    runtimeIdentity: buildRuntimeIdentityTriplet({
      appSha,
      dbMigrationHead: migrationHead.head,
      dbMigrationHeadState: migrationHead.state,
    }),
    includedPrs: [],
    watchEvidence,
    newFingerprints: currentCard?.newFingerprintSamples.map((f) => f.fingerprint) ?? [],
    regressedFingerprints: Array.from(relationships.entries())
      .filter(([, r]) => r.relationship === 'regressed-after-release')
      .map(([id]) => id),
  });

  const comparison = baselineCard
    ? buildReleaseComparison({
        baseline: toSnapshotFacts(baselineCard, board.incidents, board.coverage),
        current: toSnapshotFacts(currentCard, board.incidents, board.coverage),
      })
    : null;

  return {
    context,
    relationships,
    comparison,
    currentCard,
    baselineCard,
    unavailableReason: currentCard === null ? 'No production deploy could be identified.' : null,
  };
}

export { buildAiConfigIdentity, classifyReleaseWatch };

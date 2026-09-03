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
}

/**
 * Classify one incident's relationship to the current release, using only
 * evidence this codebase actually has: `firstSeen` vs. the deploy time, and
 * `occurrenceTrend` read off the incident's own lifecycle state — the closest
 * already-derived "did this get better or worse" signal this model carries.
 *
 * EVERY `ReleaseRelationshipEvidence` corroboration field
 * (`featureChangedInRelease`, `codeInTraceChangedInRelease`,
 * `candidateCohortOnly`, `baselineCohortClean`, `replayReproducesOnNewShaOnly`)
 * is passed `null` — never guessed. This used to pass a computed
 * `featureRegressedInRelease` (whether the incident's feature appears in the
 * current card's `topFeatureDeltas` with a positive delta) as
 * `featureChangedInRelease`. That was CIRCULAR for exactly the incidents it
 * mattered for: `topFeatureDeltas` is `errorsAfter - errorsBefore` counted
 * from the SAME `admin_events` rows this incident's own occurrences are part
 * of, so a brand-new incident's first occurrences are what move its own
 * feature's delta positive. The "corroborating" signal was measuring the
 * incident itself, which is why `release-context.ts:172-179`'s contract
 * ("proximity alone is not causation") was silently defeated for most new
 * incidents within the 24h proximity window — `classifyReleaseRelationship`
 * upgraded them to `new-after-release` at ~60% confidence on no real evidence.
 * Fixed 2026-09-03 (PR #1789 review) by removing the field: this codebase has
 * no per-fingerprint breakdown of `topFeatureDeltas` to exclude the
 * incident's own contribution, and no OTHER code-changed signal exists yet —
 * see `codeInTraceChangedInRelease`'s own `null`. Until a real signal is
 * wired, proximity-only incidents correctly resolve to `'no-causal-signal'`,
 * never a fabricated `'new-after-release'`.
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
    featureChangedInRelease: null,
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
  /** Fingerprints newly seen since the current release, TRUE total —
   *  `release-ledger.ts`'s `newFingerprintsSince` counter, never the
   *  `newFingerprintSamples.length` display sample (capped at 5). See
   *  `newFingerprintsTotalFor`'s own comment. */
  newFingerprintsTotal: number;
}

/** The true count of fingerprints new since a release, NEVER
 *  `card.newFingerprintSamples.length`. `release-ledger.ts` caps
 *  `newFingerprintSamples` at 5 (a display sample), while
 *  `newFingerprintsSince` is the uncapped counter incremented once per
 *  fingerprint. Using the sample array's length silently reported "5" for
 *  every release with more than five new fingerprints, with no indication
 *  the number was truncated. Fixed 2026-09-03 (PR #1789 review). */
export function newFingerprintsTotalFor(card: ReleaseCardData | null): number {
  return card?.newFingerprintsSince ?? 0;
}

export function toCurrentSnapshotFacts(
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
 * The BASELINE release's snapshot facts. `rootIncidentCount`/`affectedUsers`
 * are always `null` here, deliberately — this codebase has no per-release
 * "reign" scoping for `UnifiedIncident`s (no field says which release an
 * incident's count belonged to at the time). The only board this module can
 * read is the CURRENT, live one, so calling `deriveRootIncidentFacts` on it
 * a second time for "baseline" would silently reuse today's numbers as if
 * they were a real measurement of the baseline release — `buildReleaseComparison`
 * would then see `baseline === current` and report `state: 'unchanged'` for a
 * quantity that was never actually measured for the baseline release. Fixed
 * 2026-09-03 (PR #1789 review): baseline stays `null`/unknown until a
 * reign-scoped incident read model exists, matching this module's own
 * "never unknown as zero/unchanged" discipline for the DB-derived fields.
 */
export function toBaselineSnapshotFacts(card: ReleaseCardData | null): ReleaseSnapshotFacts {
  return {
    releaseSha: card?.commitSha ?? null,
    rootIncidentCount: null,
    affectedUsers: null,
    journeySuccessRate: null,
    dbP95Ms: null,
    sqlstates: [],
    invariantBreaches: null,
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
    newFingerprintsTotal: 0,
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
      newFingerprintsTotal: 0,
    };
  }

  const cards = ledger.data.cards;
  const currentCard = cards.find((c) => c.isLive) ?? cards[0] ?? null;
  const currentIdx = currentCard ? cards.indexOf(currentCard) : -1;
  const baselineCard = currentIdx >= 0 ? (cards[currentIdx + 1] ?? null) : null;

  const relationships = new Map<string, ReleaseRelationshipVerdict>();
  for (const incident of board.incidents) {
    relationships.set(
      incident.id,
      classifyIncidentReleaseRelationship({
        incident,
        releaseDeployedAtMs: currentCard?.createdAt ?? null,
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
        baseline: toBaselineSnapshotFacts(baselineCard),
        current: toCurrentSnapshotFacts(currentCard, board.incidents, board.coverage),
      })
    : null;

  return {
    context,
    relationships,
    comparison,
    currentCard,
    baselineCard,
    unavailableReason: currentCard === null ? 'No production deploy could be identified.' : null,
    newFingerprintsTotal: newFingerprintsTotalFor(currentCard),
  };
}

export { buildAiConfigIdentity, classifyReleaseWatch };

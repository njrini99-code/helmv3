import 'server-only';

/**
 * Release Runway (Bridge Premium Phase 3, `/admin/deploys`).
 *
 * Wires two already-built, previously-unconnected pieces together — nothing
 * on this page currently reads either:
 *
 *  - `release-ledger.ts`'s `ReleaseLedgerData` (releases in order, each
 *    with commit identity and an error-delta verdict).
 *  - Phase 0's `release-context.ts` (`RuntimeIdentityTriplet`,
 *    `classifyReleaseWatch`, the 7-state Release Watch machine) — fully
 *    built and unit-tested, imported by nothing until this module.
 *
 * TWO HONEST GAPS, DOCUMENTED RATHER THAN PAPERED OVER:
 *
 *  1. DB MIGRATION HEAD IS A LIVE SNAPSHOT, NOT A HISTORY. There is no
 *     per-release record of what the migration head was AT THAT DEPLOY —
 *     only what it is right now. So the Runtime Identity Triplet's DB half
 *     is only ever `known` for the LIVE release; every past release reports
 *     `dbMigrationHeadState: 'unknown'` for that one field, honestly, rather
 *     than backdating today's head onto history.
 *
 *  2. ROLLBACK RECOMMENDATION IS NEVER FABRICATED. `classifyReleaseWatch`'s
 *     own contract (`release-context.ts`) requires `rollbackRecommended` as
 *     an EXTERNAL input the caller must decide — it is not derived from
 *     evidence by the classifier itself, and no script or evidence source in
 *     this codebase computes that decision (checked directly: zero hits
 *     beyond the classifier's own type). This module always passes `false`.
 *     A release can therefore reach `'regression-detected'` here but never
 *     `'rollback-recommended'` until a real scoring source exists — which is
 *     the correct behaviour per the brief's own "Never execute a rollback
 *     from a visual recommendation," extended one step further: never even
 *     RECOMMEND one from an un-evidenced guess.
 *
 * `regressedIncidentsCount`'s mapping is the one real judgment call here:
 * `ReleaseCardData.verdict.tone === 'danger'` already means "the error rate
 * measurably got worse in the 2h after this deploy" (computed by
 * `release-ledger.ts` from `errorsBefore2h`/`errorsAfter2h`) — a genuine
 * regression signal, distinct from `newFingerprintsSince` (brand-new
 * fingerprints, a different axis). Treated as 1 when danger, 0 otherwise;
 * this codebase has no fingerprint-level "regressed" count keyed to a
 * specific past release to report a real number here.
 */

import {
  buildRuntimeIdentityTriplet,
  fetchProductionMigrationHead,
  classifyReleaseWatch,
  type RuntimeIdentityTriplet,
  type ReleaseWatchState,
  type ReleaseWatchEvidence,
} from '@/lib/admin/incidents/release-context';
import { fetchReleaseLedger, type ReleaseCardData, type ReleaseLedgerData } from '@/lib/admin/data/release-ledger';
import { ok, type AdminFetchResult } from '@/lib/admin/fetch-result';

export interface ReleaseRunwayRow {
  uid: string;
  commitSha: string | null;
  commitMessage: string | null;
  commitRef: string | null;
  commitAuthor: string | null;
  createdAt: number;
  isLive: boolean;
  watchState: ReleaseWatchState;
  runtimeIdentity: RuntimeIdentityTriplet;
  newFingerprintsSince: number;
  resolvedAndQuietSince: number;
  errorsBefore2h: number;
  errorsAfter2h: number | null;
  gatheringSignal: boolean;
}

export interface ReleaseRunwayView {
  /** Same order the ledger returned — newest first. */
  rows: readonly ReleaseRunwayRow[];
  deploySource: ReleaseLedgerData['deploySource'];
}

function evidenceFor(card: ReleaseCardData, now: number, sourceCoverageBlind: boolean): ReleaseWatchEvidence {
  return {
    releaseDeployedAtMs: card.createdAt,
    now,
    newIncidentsCount: card.newFingerprintsSince,
    // See module header — a real signal (post-deploy error-rate regression),
    // not a fingerprint-level count this codebase does not track per release.
    regressedIncidentsCount: card.verdict.tone === 'danger' ? 1 : 0,
    // Never fabricated — see module header.
    rollbackRecommended: false,
    sourceCoverageBlind,
  };
}

/** Pure. `liveTriplet` is the current production identity — attached only to
 *  the card whose `isLive` is true; every other row gets its own app SHA
 *  (known per-card) with an honestly-unknown DB migration head. */
export function buildReleaseRunway(ledger: ReleaseLedgerData, liveTriplet: RuntimeIdentityTriplet, now: number): ReleaseRunwayView {
  const sourceCoverageBlind = ledger.deploySource === 'marker-fallback';

  const rows: ReleaseRunwayRow[] = ledger.cards.map((card) => {
    const runtimeIdentity: RuntimeIdentityTriplet = card.isLive
      ? liveTriplet
      : buildRuntimeIdentityTriplet({
          appSha: card.commitSha,
          dbMigrationHead: null,
          dbMigrationHeadState: 'unknown',
        });

    return {
      uid: card.uid,
      commitSha: card.commitSha,
      commitMessage: card.commitMessage,
      commitRef: card.commitRef,
      commitAuthor: card.commitAuthor,
      createdAt: card.createdAt,
      isLive: card.isLive,
      watchState: classifyReleaseWatch(evidenceFor(card, now, sourceCoverageBlind)),
      runtimeIdentity,
      newFingerprintsSince: card.newFingerprintsSince,
      resolvedAndQuietSince: card.resolvedAndQuietSince,
      errorsBefore2h: card.errorsBefore2h,
      errorsAfter2h: card.errorsAfter2h,
      gatheringSignal: card.gatheringSignal,
    };
  });

  return { rows, deploySource: ledger.deploySource };
}

/** I/O + pure derivation, composed. */
export async function fetchReleaseRunway(now: Date = new Date()): Promise<AdminFetchResult<ReleaseRunwayView>> {
  const ledgerRes = await fetchReleaseLedger();
  if (ledgerRes.status !== 'ok' || !ledgerRes.data) {
    return { status: ledgerRes.status, data: null, fetchedAt: ledgerRes.fetchedAt, error: ledgerRes.error };
  }

  const migrationHead = await fetchProductionMigrationHead();
  const liveTriplet = buildRuntimeIdentityTriplet({
    appSha: ledgerRes.data.currentBuildSha,
    dbMigrationHead: migrationHead.head,
    dbMigrationHeadState: migrationHead.state,
  });

  return ok(buildReleaseRunway(ledgerRes.data, liveTriplet, now.getTime()));
}

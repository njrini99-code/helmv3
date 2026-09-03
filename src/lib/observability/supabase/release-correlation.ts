/**
 * Release correlation and causal confidence — brief §42–43.
 *
 * "Release correlation on every durable error/health regression (app errors
 * from the release identity; scheduled samples from the deployment ledger).
 * Causal confidence from timing, feature match, RPC/table match, trace
 * executing changed code, SQLSTATE mechanism fit, canary/control, historical
 * similarity, replay, provider outage: POSSIBLE / LIKELY / REPRODUCED CAUSE."
 *
 * WHY THIS IS A NEW MODULE AND NOT A REUSE OF `admin/incidents/release-context.ts`
 * ------------------------------------------------------------------------------
 * Same reasoning `freshness.ts` sets out in this directory for not reusing
 * `sources.ts`'s classifier. That module answers a different question with a
 * different vocabulary — a RELATIONSHIP (new/regressed/existed-before/
 * improved/no-causal-signal) with a numeric confidence — for the Bridge
 * incident model. This one answers the brief's CAUSAL LADDER for database
 * evidence, and lives under `observability/supabase/` because the database
 * observability layer must not take a dependency on `src/lib/admin/incidents/**`.
 * Two small pure modules that agree in spirit cost less than one trying to
 * serve two specs.
 *
 * =========================================================================
 * SIGNAL INDEPENDENCE — the whole point, and the bug this must not reproduce
 * =========================================================================
 * PR #1789 fixed a defect in the sibling module where PROXIMITY was counted
 * BOTH as the trigger for considering a release AND as corroboration for it,
 * producing a "new after release" verdict at 60% confidence from timing
 * alone. The mechanical cause is a category error: a signal derived from the
 * incident restating its own occurrence cannot corroborate a hypothesis about
 * the incident's cause. So every signal here is sorted into one of three
 * buckets, and only one of them can raise the ladder:
 *
 * 1. CORROBORATING — release-side facts. Each is a property of the RELEASE,
 *    determined by reading the diff/deployment ledger, and its value is the
 *    same whether or not this incident ever occurred. That is the
 *    independence test, and each field's doc comment states it:
 *      featureChanged            the diff touched this feature's code
 *      rpcOrRelationChanged      the diff touched this RPC/table specifically
 *      codeInTraceChanged        the diff touched code the failing trace ran
 *      migrationNamesObject      a migration in this release names the object
 *      candidateCohortOnly       only the exposed cohort is affected
 *      baselineCohortClean       the unexposed cohort stayed clean
 *      replayReproducesOnNewShaOnly  replay separates the two SHAs
 *
 * 2. NOT CORROBORATING — restatements of the incident itself. Recorded in the
 *    output so a reader can SEE they were considered and rejected, never
 *    counted toward the ladder:
 *      timing proximity          "it happened after the deploy" is the
 *                                hypothesis, not evidence for it
 *      occurrence count/severity how bad it is says nothing about what caused it
 *      SQLSTATE mechanism fit    ALONE. A 42P01 is a missing object no matter
 *                                which release is live. It becomes
 *                                corroborating ONLY when paired with the
 *                                release-side fact that this release carried a
 *                                migration naming that object — and then it is
 *                                the migration doing the work, which is why
 *                                the pairing lives in bucket 1.
 *
 * 3. EXCULPATORY — facts that argue AGAINST this release. These can only
 *    lower the ladder, never raise it:
 *      providerOutageOverlaps            a concurrent provider incident
 *      recurredAfterUnrelatedReleases    "historical similarity" usually
 *                                        argues against a specific release:
 *                                        a fingerprint that reappears after
 *                                        unrelated deploys is not this
 *                                        release's signature
 *      presentOnBaselineSha              the incident exists without the release
 *
 * THE LADDER
 * ----------
 *   unknown           deploy time unknown — nothing is computable
 *   no-signal         first seen before the deploy, or well outside the window
 *   possible          inside the window, nothing corroborates. THE CEILING FOR
 *                     PROXIMITY ALONE, and it deliberately does not claim
 *                     causation — `corroborating` is empty and the UI can say so
 *   likely            inside the window AND at least one corroborating signal
 *   reproduced-cause  EXPERIMENTAL evidence only: a replay that reproduces on
 *                     the new SHA and not the baseline, or a candidate/control
 *                     cohort split. No accumulation of observational signals
 *                     reaches this rung
 *
 * There is NO numeric confidence in the output. A number invites exactly the
 * "0.5 base plus 0.1 per signal" accumulation that made #1789's verdict look
 * quantitative when it was not.
 *
 * PURE. No I/O, no ambient clock — `now` is not even needed; every timestamp
 * arrives as an argument.
 */

// ---------------------------------------------------------------------------
// The ladder
// ---------------------------------------------------------------------------

export const CAUSAL_CONFIDENCES = ['unknown', 'no-signal', 'possible', 'likely', 'reproduced-cause'] as const;
export type CausalConfidence = (typeof CAUSAL_CONFIDENCES)[number];

export const CAUSAL_CONFIDENCE_LABEL: Readonly<Record<CausalConfidence, string>> = {
  unknown: 'UNKNOWN',
  'no-signal': 'NO CAUSAL SIGNAL',
  possible: 'POSSIBLE',
  likely: 'LIKELY',
  'reproduced-cause': 'REPRODUCED CAUSE',
};

const LADDER_ORDER: Readonly<Record<CausalConfidence, number>> = {
  unknown: -1,
  'no-signal': 0,
  possible: 1,
  likely: 2,
  'reproduced-cause': 3,
};

function capAt(current: CausalConfidence, ceiling: CausalConfidence): CausalConfidence {
  return LADDER_ORDER[current] > LADDER_ORDER[ceiling] ? ceiling : current;
}

/** How the release identity was obtained. Brief §42 names the two paths. */
export type ReleaseIdentitySource = 'event' | 'deployment-ledger' | 'unknown';

// ---------------------------------------------------------------------------
// Inputs
// ---------------------------------------------------------------------------

/**
 * Facts about the RELEASE. Every field here is determined by reading the
 * diff / deployment ledger and would hold the same value if this incident had
 * never happened — that is what makes them usable as corroboration. `null`
 * everywhere means "not determined", never "false".
 */
export interface ReleaseFacts {
  releaseSha: string | null;
  deployedAtMs: number | null;
  /** The diff touched code belonging to the incident's feature. */
  featureChanged: boolean | null;
  /** The diff touched this specific RPC definition or table. */
  rpcOrRelationChanged: boolean | null;
  /** The diff touched code that the failing trace actually executed. */
  codeInTraceChanged: boolean | null;
  /** This release carried a migration whose SQL names the failing object. */
  migrationNamesObject: boolean | null;
  /** Only the cohort exposed to this release is affected. */
  candidateCohortOnly: boolean | null;
  /** The cohort NOT exposed to this release stayed clean. */
  baselineCohortClean: boolean | null;
  /** A replay reproduces on the new SHA and does NOT on the baseline SHA. */
  replayReproducesOnNewShaOnly: boolean | null;
  /** A provider incident overlapped this window. Exculpatory. */
  providerOutageOverlaps: boolean | null;
  /** This fingerprint has appeared after unrelated prior releases. Exculpatory. */
  recurredAfterUnrelatedReleases: boolean | null;
  /** The same incident is observed on the baseline SHA too. Exculpatory. */
  presentOnBaselineSha: boolean | null;
}

/**
 * Facts about the OCCURRENCE — a durable error event or a health regression.
 * Deliberately small: nothing here can raise the ladder on its own.
 */
export interface OccurrenceFacts {
  /** True first-ever occurrence, never a windowed one. */
  firstSeenMs: number;
  /** The release identity recorded ON the event itself. An app error carries
   *  one; a scheduled health sample does not and must fall back to the
   *  deployment ledger (brief §42). */
  eventReleaseSha: string | null;
  /** The failing mechanism, for the PAIRED mechanism-fit signal only. */
  sqlstate: string | null;
  /** How soon after deploy still counts as "shortly after". Default 24h. */
  proximityWindowMs?: number;
}

export const DEFAULT_PROXIMITY_WINDOW_MS = 24 * 3_600_000;

/** SQLSTATEs whose mechanism a migration could plausibly explain. Used ONLY
 *  in the paired signal — never on its own. */
const MIGRATION_MECHANISM_SQLSTATES = new Set(['42P01', '42703', '42883', '3F000', '42P17']);

// ---------------------------------------------------------------------------
// Output
// ---------------------------------------------------------------------------

export interface ReleaseCorrelation {
  /** The release this correlation is about. */
  releaseSha: string | null;
  releaseIdentitySource: ReleaseIdentitySource;
  /** `null` when the deploy time is unknown, so proximity is not computable. */
  withinProximityWindow: boolean | null;
  confidence: CausalConfidence;
  /** Release-side facts that hold independently of this incident occurring. */
  corroborating: readonly string[];
  /** Signals deliberately NOT counted, listed so a reader sees they were considered. */
  notCorroborating: readonly string[];
  /** Facts arguing against this release. Can only lower the ladder. */
  exculpatory: readonly string[];
  /** One sentence naming the rung and why it is that rung and not the next one. */
  because: string;
}

/**
 * Attach a release identity to a durable event and place it on the causal
 * ladder. Never throws; an input it cannot reason about produces `unknown`.
 */
export function correlateWithRelease(input: {
  occurrence: OccurrenceFacts;
  release: ReleaseFacts;
}): ReleaseCorrelation {
  const { occurrence, release } = input;

  const releaseIdentitySource: ReleaseIdentitySource =
    occurrence.eventReleaseSha !== null ? 'event' : release.releaseSha !== null ? 'deployment-ledger' : 'unknown';
  const releaseSha = occurrence.eventReleaseSha ?? release.releaseSha;

  // --- Bucket 2, always recorded, never counted ---------------------------
  const notCorroborating: string[] = [
    'Timing proximity to the deploy — this is the hypothesis under test, not evidence for it.',
  ];

  if (release.deployedAtMs === null) {
    return {
      releaseSha,
      releaseIdentitySource,
      withinProximityWindow: null,
      confidence: 'unknown',
      corroborating: [],
      notCorroborating,
      exculpatory: [],
      because: 'This release has no known deploy time, so nothing about its relationship to the incident is computable.',
    };
  }

  const windowMs = occurrence.proximityWindowMs ?? DEFAULT_PROXIMITY_WINDOW_MS;
  const sinceDeployMs = occurrence.firstSeenMs - release.deployedAtMs;
  const withinProximityWindow = sinceDeployMs >= 0 && sinceDeployMs <= windowMs;

  // --- Bucket 3, gathered first: exculpatory facts can cap everything ------
  const exculpatory: string[] = [];
  if (release.presentOnBaselineSha === true) {
    exculpatory.push('The same incident is observed on the baseline SHA, so the release is not required to produce it.');
  }
  if (release.providerOutageOverlaps === true) {
    exculpatory.push('A provider incident overlapped this window and is a competing explanation.');
  }
  if (release.recurredAfterUnrelatedReleases === true) {
    exculpatory.push('This fingerprint has also appeared after unrelated releases, so it is not this release’s signature.');
  }

  if (occurrence.firstSeenMs < release.deployedAtMs) {
    return {
      releaseSha,
      releaseIdentitySource,
      withinProximityWindow: false,
      confidence: 'no-signal',
      corroborating: [],
      notCorroborating,
      exculpatory: [
        'The incident was first seen before this release deployed.',
        ...exculpatory,
      ],
      because: 'The incident predates this release, so this release cannot have introduced it.',
    };
  }

  if (!withinProximityWindow) {
    return {
      releaseSha,
      releaseIdentitySource,
      withinProximityWindow: false,
      confidence: 'no-signal',
      corroborating: [],
      notCorroborating,
      exculpatory,
      because: 'The incident was first seen well outside the proximity window for this release.',
    };
  }

  // --- Bucket 1: release-side facts, each independent of the occurrence ----
  const corroborating: string[] = [];
  if (release.featureChanged === true) corroborating.push('This release changed code belonging to the affected feature.');
  if (release.rpcOrRelationChanged === true) {
    corroborating.push('This release changed the specific RPC or table the failure names.');
  }
  if (release.codeInTraceChanged === true) corroborating.push('This release changed code the failing trace executed.');
  if (release.candidateCohortOnly === true) corroborating.push('Only the cohort exposed to this release is affected.');
  if (release.baselineCohortClean === true) corroborating.push('The cohort not exposed to this release stayed clean.');
  if (release.replayReproducesOnNewShaOnly === true) {
    corroborating.push('A replay reproduces on the new SHA and not on the baseline SHA.');
  }

  // The PAIRED mechanism-fit signal. Alone, a 42P01 is a missing object no
  // matter which release is live — that half goes in bucket 2. It corroborates
  // only when a release-side fact (a migration naming the object) supplies the
  // link, and then it is the migration doing the work.
  const mechanismCouldFitMigration =
    occurrence.sqlstate !== null && MIGRATION_MECHANISM_SQLSTATES.has(occurrence.sqlstate);
  if (mechanismCouldFitMigration && release.migrationNamesObject === true) {
    corroborating.push(
      `This release carried a migration naming the failing object, and ${occurrence.sqlstate} is a mechanism that migration could produce.`,
    );
  } else if (mechanismCouldFitMigration) {
    notCorroborating.push(
      `SQLSTATE ${occurrence.sqlstate} on its own — a missing-object mechanism is the same whichever release is live; it corroborates only when paired with a migration in this release naming that object.`,
    );
  }

  // --- Rung selection ------------------------------------------------------
  // EXPERIMENTAL evidence is the only route to `reproduced-cause`. Observational
  // signals never accumulate into it, however many there are.
  const replayProvenCause = release.replayReproducesOnNewShaOnly === true;
  const cohortProvenCause = release.candidateCohortOnly === true && release.baselineCohortClean === true;
  const experimental = replayProvenCause || cohortProvenCause;

  let confidence: CausalConfidence = experimental ? 'reproduced-cause' : corroborating.length > 0 ? 'likely' : 'possible';

  // --- Exculpatory ceilings ------------------------------------------------
  if (release.presentOnBaselineSha === true) confidence = capAt(confidence, 'no-signal');
  if (release.providerOutageOverlaps === true) confidence = capAt(confidence, 'possible');
  if (release.recurredAfterUnrelatedReleases === true) confidence = capAt(confidence, 'possible');

  return {
    releaseSha,
    releaseIdentitySource,
    withinProximityWindow: true,
    confidence,
    corroborating,
    notCorroborating,
    exculpatory,
    because: explainRung(confidence, corroborating.length, experimental, exculpatory.length > 0),
  };
}

function explainRung(
  confidence: CausalConfidence,
  corroboratingCount: number,
  experimental: boolean,
  hasExculpatory: boolean,
): string {
  switch (confidence) {
    case 'reproduced-cause':
      return 'Experimental evidence separates the two SHAs — a replay or a candidate/control split, not an accumulation of observations.';
    case 'likely':
      return `Inside the proximity window with ${corroboratingCount} release-side signal${corroboratingCount === 1 ? '' : 's'} that hold independently of this incident occurring. Not REPRODUCED CAUSE: no replay or cohort split separates the SHAs.`;
    case 'possible':
      if (experimental || corroboratingCount > 0) {
        return 'Capped at POSSIBLE by a competing explanation, despite release-side signals inside the window.';
      }
      return 'Inside the proximity window, but nothing corroborates it. Proximity alone is not causation, so this is the ceiling.';
    case 'no-signal':
      return hasExculpatory
        ? 'A fact arguing against this release outweighs the timing — the incident does not require this release to occur.'
        : 'No signal ties this incident to this release.';
    default:
      return 'Not computable.';
  }
}

// ---------------------------------------------------------------------------
// Health regressions — the second half of brief §42
// ---------------------------------------------------------------------------

/**
 * A scheduled sample (health, query delta, lock) carries no release identity
 * of its own — brief §42 says those "come from the deployment ledger". This
 * wrapper makes the substitution explicit rather than letting a caller
 * silently pass `eventReleaseSha: null` and lose the distinction: the
 * resulting `releaseIdentitySource` is `'deployment-ledger'`, which the
 * Bridge can render as the weaker attribution it is.
 */
export function correlateHealthRegressionWithRelease(input: {
  regressionFirstSeenMs: number;
  release: ReleaseFacts;
  proximityWindowMs?: number;
}): ReleaseCorrelation {
  return correlateWithRelease({
    occurrence: {
      firstSeenMs: input.regressionFirstSeenMs,
      eventReleaseSha: null,
      sqlstate: null,
      proximityWindowMs: input.proximityWindowMs,
    },
    release: input.release,
  });
}

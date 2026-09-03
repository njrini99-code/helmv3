import 'server-only';

/**
 * Bridge Premium Phase 4 — shared types for the app/customer "lenses"
 * (Golf/Baseball/Lift Lab journey rivers, Teams EKG, User Journey Ribbon,
 * Adoption Map, semantic activity threads).
 *
 * HONESTY CONTRACT (mirrors team-grade.ts's TeamGrade / pulse-grid.ts's
 * degradedNote pattern, per the owner rule "unknown never renders as
 * healthy"): every numeric field below is `number | null`. `null` means the
 * value could not be established from a trustworthy source — NOT zero, and
 * never coerced to zero for display. Callers render `null` as an honest
 * "unavailable" state (KpiTile already does this for `value === null`).
 *
 * WHY admin_events CANNOT PRODUCE A FULL FUNNEL — read before extending this
 * module. `admin_events` is overwhelmingly a FAILURE/soft-failure log
 * (`withAdminObserved` in observed-action.ts only ever emits on a thrown
 * error or a soft-failure envelope; see also pulse-grid.ts's own header,
 * which documents the same limit and deliberately does NOT attempt a
 * per-feature success lane). The only positive-signal (success) writers are
 * `logLogin` / `logSignup` / `logRoundSubmitted` / `logAIGeneration` in
 * src/lib/admin-logger.ts, confirmed wired at real call sites (golf/baseball
 * auth.ts, golf.ts's round submit, the AI round-review route). Everywhere
 * else, "attempts/completions" for a stage come from a DURABLE domain table
 * (golf_rounds.status, helm_lifting_sessions.status, baseball_games), never
 * from counting admin_events rows — counting failure-only rows as "usage"
 * would silently invert the signal (more errors would read as more usage).
 */

/** How much this stage's numbers can be trusted, independent of whether the
 *  number itself is null. Rendered as a distinct visual (hatched/dashed),
 *  never folded into the metric itself. */
export type SignalConfidence =
  /** Backed by a durable domain table (golf_rounds.status, etc.) AND cited
   *  live e2e/flight_recorder coverage in memory/journeys/golden-paths.yml. */
  | 'durable_and_proven'
  /** Backed by a durable domain table, but golden-paths.yml marks the
   *  journey `status: collecting` (proof incomplete) or the signal
   *  `production_observation: preview_only` — the NUMBER is real, the test
   *  coverage proving it is not yet. */
  | 'durable_unproven'
  /** No durable table backs this stage's attempts/completions; only
   *  incident (failure) counts are real. Shown as an honest gap, not a
   *  fabricated denominator. */
  | 'incidents_only'
  /** This stage's whole definition is BRIEF-DERIVED (baseball, Lift Lab
   *  stage sequencing invented from the brief's prose, since
   *  memory/journeys/golden-paths.yml only seeds golf journeys as of
   *  2026-09) — not validated by the golden-path citation checker. Stated
   *  plainly rather than dressed up as registry-proven. */
  | 'brief_derived';

export interface JourneyStageMetric {
  /** Real attempts/entries into this stage, or null if unmeasurable. */
  attempts: number | null;
  /** Real completions of this stage, or null if unmeasurable. */
  completions: number | null;
  /** completions/attempts when both are known and attempts > 0, else null.
   *  Never computed against a null or zero denominator. */
  successRate: number | null;
}

export interface JourneyIncidentSummary {
  /** admin_events rows with severity in (error, critical) for this stage's
   *  feature_keys, over the lens window. Null only if the read itself
   *  failed (never coerced from a failed read to 0). */
  count: number | null;
  criticalCount: number | null;
}

export interface JourneyStage {
  id: string;
  label: string;
  /** src/lib/admin/feature-registry.ts FeatureKey values this stage maps
   *  to admin_events.feature through. */
  featureKeys: readonly string[];
  metric: JourneyStageMetric;
  incidents: JourneyIncidentSummary;
  confidence: SignalConfidence;
  /** One sentence: what the number is actually counting and why (or why
   *  it's null). Always shown next to the stage, never hidden in a tooltip
   *  only. */
  sourceNote: string;
}

export interface JourneyLens {
  id: 'golf' | 'baseball' | 'lifting';
  title: string;
  generatedAt: string;
  windowDays: number;
  stages: readonly JourneyStage[];
  /** Non-null when one or more underlying reads degraded — surfaced in the
   *  UI exactly like pulse-grid.ts's degradedNote, never silently absorbed. */
  degradedNote: string | null;
}

/**
 * Expected empty-state registry — the ONE source of truth for outcomes that
 * are "genuinely empty, nothing failed" (a brand-new player, a quiet date
 * range), shared by BOTH sides of the product:
 *
 *   • Observability: `observe-action-result.ts` classifies any failure
 *     envelope carrying one of these codes as 'info' + skipSentry, so routine
 *     empty states never reach the Errors tab or Sentry (the #804/#807 class).
 *   • UI: empty-state surfaces (e.g. Fairway <InsufficientData />) source
 *     their user-facing copy from the same code, so what the user reads and
 *     what telemetry records can never drift apart.
 *
 * CONTRACT (moved here from observe-action-result.ts): classification is by
 * code GLOBALLY, not per action — a code in this registry silences Sentry for
 * every envelope that carries it. Only attach one of these codes to a
 * genuinely-empty outcome; a real failure must never reuse them. Guard the
 * classification too: a failed count/query must return an UNCODED error, not
 * fall through to a registry code.
 *
 * This module is a dependency LEAF: no imports, safe from both server code
 * ('server-only' modules may import it) and client components.
 */

export interface ExpectedEmptyStateDef {
  /** Calm, honest headline for the empty surface. */
  title: string;
  /** Plain-language copy that names the next meaningful action. */
  description: string;
  /** The metric/units being counted, e.g. "rounds" — for gap meters. */
  unit?: string;
  /** Data points needed before the analysis is trustworthy, if fixed. */
  required?: number;
}

export const EXPECTED_EMPTY_STATES = {
  /**
   * Engine-side (triggerPlayerInsightsAfterRound roster sweep): player has no
   * completed rounds in the engine's 90-day lookback.
   */
  engine_no_recent_rounds: {
    title: 'No recent rounds',
    description: 'Insights populate after the next completed round.',
    unit: 'rounds',
  },
  /**
   * getPlayerShotAnalytics / getPlayerShotContext: no completed rounds in the
   * SELECTED lookback window — the normal state for a quiet stretch.
   */
  no_rounds_in_period: {
    title: 'No rounds in this period',
    description: 'No rounds were played in the selected period — widen the range or log a new round.',
    unit: 'rounds',
  },
  /** getPlayerProfile: player has no completed rounds at all (brand-new). */
  no_completed_rounds: {
    title: 'No rounds yet',
    description: 'Record or import a round to begin performance analysis.',
    unit: 'rounds',
  },
  /**
   * getPlayerTrendAnalysis / what-if scenarios: fewer than the 3 completed
   * rounds those analyses mathematically require.
   */
  insufficient_rounds: {
    title: 'Not enough rounds yet',
    description: 'Trend analysis unlocks at 3 completed rounds — log a couple more and it fills in.',
    unit: 'rounds',
    required: 3,
  },
} as const satisfies Record<string, ExpectedEmptyStateDef>;

export type ExpectedEmptyStateCode = keyof typeof EXPECTED_EMPTY_STATES;

/** Stable code set consumed by the soft-failure observer's classification. */
export const EXPECTED_EMPTY_STATE_CODES: ReadonlySet<string> = new Set(
  Object.keys(EXPECTED_EMPTY_STATES),
);

export function isExpectedEmptyStateCode(
  code: string | null | undefined,
): code is ExpectedEmptyStateCode {
  return code != null && EXPECTED_EMPTY_STATE_CODES.has(code);
}

/** Copy for a code, or null when the code is unknown / not an empty state. */
export function expectedEmptyStateCopy(
  code: string | null | undefined,
): ExpectedEmptyStateDef | null {
  return isExpectedEmptyStateCode(code) ? EXPECTED_EMPTY_STATES[code] : null;
}

export const PHILOSOPHY_DEFAULTS = {
    priorityBallStriking: 1,
    priorityShortGame: 3,
    priorityPutting: 2,
    priorityCourseManagement: 4,
    priorityMentalGame: 5,
    alertSensitivity: 'balanced' as const,
    declineThreshold: 2.0,
    pressureGapThreshold: 2.5,
    bubbleZoneRange: 1.0,
    weightHistorical: 35,
    weightRecentForm: 30,
    weightTournament: 20,
    weightQualifying: 10,
    weightSubjective: 5,
    // Signal controls — these DEFAULTS ARE THE ENGINE'S PRIOR CONSTANTS
    // (insight-scorer DEFAULT_MINIMUM_THRESHOLD = 0.30; the "Need 3+ rounds"
    // honesty gate). Keeping them identical means shipping the controls
    // changes nobody's alert volume until they move one.
    minInsightConfidence: 0.3,
    minRoundsForSignal: 3,
    alertDigest: 'immediate' as const,
};

export const THRESHOLD_RANGES = {
    declineThreshold: { min: 1.0, max: 4.0, step: 0.5 },
    pressureGapThreshold: { min: 1.0, max: 4.0, step: 0.5 },
    bubbleZoneRange: { min: 0.5, max: 3.0, step: 0.5 },
};

/** Ranges for the signal controls. Must stay in step with the CHECK
 *  constraints in migration 20260725090000 — the DB is the last line of
 *  defence against a value that would mute or flood every alert. */
export const SIGNAL_CONTROL_RANGES = {
    minInsightConfidence: { min: 0.1, max: 0.9, step: 0.05 },
    minRoundsForSignal: { min: 1, max: 15, step: 1 },
};

/**
 * Confidence floor implied by each Alert Sensitivity preset.
 *
 * Lives HERE, not in actions/insights.ts, because the settings screen needs to
 * tell the coach what their preset already requires — and a `'use server'`
 * module cannot export a pure function to a client component without breaking
 * the Next build.
 */
export const SENSITIVITY_CONFIDENCE_FLOOR = {
    aggressive: 0.4,
    balanced: 0.55,
    conservative: 0.7,
} as const;

export function confidenceFloorForSensitivity(
    sensitivity: keyof typeof SENSITIVITY_CONFIDENCE_FLOOR | string,
): number {
    return (
        SENSITIVITY_CONFIDENCE_FLOOR[sensitivity as keyof typeof SENSITIVITY_CONFIDENCE_FLOOR] ??
        SENSITIVITY_CONFIDENCE_FLOOR.balanced
    );
}

/**
 * NOTE ON PLACEMENT: this lives here, not in actions/insights.ts, for two
 * reasons. A `'use server'` module may only export async functions — exporting
 * this pure helper from there breaks the Next build — and the golf server-action
 * observability coverage contract requires every export in those files to be
 * Bridge-wrapped, which a pure calculation should not be.
 */
/**
 * The confidence floor actually applied to this coach's insights.
 *
 * The Aggressive/Balanced/Conservative preset sets a coarse floor
 * (0.40 / 0.55 / 0.70). `minInsightConfidence` is an ADDITIONAL floor the
 * coach can raise on top of it — so someone who wants Balanced's alert mix
 * but only high-confidence claims can tighten without switching preset (and
 * inheriting everything else Conservative changes).
 *
 * `max`, not override: the setting can only ever make CoachHelm quieter than
 * the preset, never louder. At its default of 0.30 it sits below every preset
 * and is a no-op — which is why shipping the control changes nobody's alert
 * volume until they move it.
 */
export function effectiveConfidenceThreshold(
  philosophy: { alertSensitivity: string; minInsightConfidence: number },
): number {
  const preset = confidenceFloorForSensitivity(philosophy.alertSensitivity);
  const floor = philosophy.minInsightConfidence;
  return Number.isFinite(floor) ? Math.max(preset, floor) : preset;
}
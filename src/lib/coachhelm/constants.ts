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

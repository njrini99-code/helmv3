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
};

export const THRESHOLD_RANGES = {
    declineThreshold: { min: 1.0, max: 4.0, step: 0.5 },
    pressureGapThreshold: { min: 1.0, max: 4.0, step: 0.5 },
    bubbleZoneRange: { min: 0.5, max: 3.0, step: 0.5 },
};

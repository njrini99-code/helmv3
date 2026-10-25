/**
 * The golf words (CONS-18), one long form for a heading or a sentence and one short form for a tight cell. "Around
 * green" in tight cells and "Short game" as its own concept wait on the owner.
 */
export const TERMS = {
  strokesGained: { long: 'Strokes gained', short: 'SG' },
  sgArg: { long: 'Around the green', short: 'Around green' },
  scoringAvg: { long: 'Scoring average', short: 'Scoring avg' },
  handicap: { long: 'Handicap', short: 'HCP' },
  gir: { long: 'Greens in regulation', short: 'GIR' },
  fir: { long: 'Fairways hit', short: 'FIR' },
} as const;

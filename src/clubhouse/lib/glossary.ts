/**
 * The golf words (CONS-18), one long form for a heading or a sentence and one short form for a tight cell. "Around
 * green" in tight cells waits on the owner. "Short game" as its own concept is the phone Stats section the owner approved
 * (stats-home v7, 31 Oct); today's screens keep their counted spellings.
 */
export const TERMS = {
  strokesGained: { long: 'Strokes gained', short: 'SG' },
  shortGame: { long: 'Short game', short: 'Short game' },
  sgArg: { long: 'Around the green', short: 'Around green' },
  scoringAvg: { long: 'Scoring average', short: 'Scoring avg' },
  handicap: { long: 'Handicap', short: 'HCP' },
  gir: { long: 'Greens in regulation', short: 'GIR' },
  fir: { long: 'Fairways hit', short: 'FIR' },
} as const;

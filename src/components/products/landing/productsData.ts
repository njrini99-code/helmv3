/**
 * Stat labels for the "85+ stats" marquee. Each row is duplicated at render
 * time so the CSS translateX(-50%) loop is seamless. Verbatim from the handoff.
 */
/**
 * The 85 stats a round produces, grouped into the families the product
 * actually reports them in. `total` figures sum to 85 — the headline on
 * /products is rendered as the running sum of these, so changing one here
 * changes the number the page derives. `examples` are the names shown as
 * pills; the remainder is rendered as "+N more" rather than invented.
 */
export interface StatFamily {
  readonly name: string;
  readonly total: number;
  readonly examples: readonly string[];
}

export const STAT_FAMILIES: readonly StatFamily[] = [
  { name: 'Strokes gained', total: 5, examples: ['SG: Total', 'SG: Off the Tee', 'SG: Approach', 'SG: Around the Green', 'SG: Putting'] },
  { name: 'Off the tee', total: 12, examples: ['FIR %', 'Driving distance', 'Miss bias L/R', 'Penalty rate'] },
  { name: 'Approach', total: 21, examples: ['GIR %', 'Proximity by band', 'Approach 100–150', 'Approach 150–200', 'Short-side %'] },
  { name: 'Short game', total: 15, examples: ['Scrambling %', 'Sand save %', 'Up-and-down %', 'Proximity from rough'] },
  { name: 'Putting', total: 18, examples: ['Putts per round', 'Putts per GIR', 'Make rate 3–5 ft', 'Make rate 15–25 ft', 'Three-putt %'] },
  { name: 'Scoring & consistency', total: 14, examples: ['Scoring average', 'Birdies / rd', 'Doubles+ / rd', 'Front / back split', 'Par-3 / 4 / 5 scoring'] },
];

/**
 * The pars of a single round, used to size the eighteen hole ticks. Real
 * par-72 layout (four par-3s, four par-5s) rather than a random pattern.
 */
export const ROUND_HOLES: readonly number[] = [4, 5, 4, 3, 4, 4, 3, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5, 4];

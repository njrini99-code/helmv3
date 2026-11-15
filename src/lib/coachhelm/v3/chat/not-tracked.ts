/**
 * CoachHelm chat: "that isn't tracked", as a result and not only a sentence (CAPABILITIES D16, request E-26).
 *
 * When a coach asks for something the app does not record, the answer should say so first and name the nearest thing
 * that is recorded. The list of what is not recorded is KNOWLEDGE's (`knowledge/data-map.source.ts`, `NOT_RECORDED`,
 * which a test holds to the schema). This file adds, for each of those, the words a question uses for it and the
 * nearest figures the readers do return. `nearest` holds only names a reader returns: a test checks each against the
 * metric catalogue and the two band sections of `get_player_stats`.
 *
 * It is a lookup, not a judge: no match means nothing is claimed either way.
 */
export interface NotTracked {
  /** What is not recorded, as the answer names it. */
  what: string;
  /** Any of these in the question means it. Lower case. */
  words: readonly string[];
  /** The nearest figures the app does record, by the name a coach sees. Empty: there is nothing close. */
  nearest: readonly string[];
  /** One plain sentence on why, for the model. */
  note: string;
}

/** The two sections of `get_player_stats` that are not single catalogue metrics. */
export const BAND_SECTIONS = ['Putting by distance', 'Approach by distance band'] as const;

export const NOT_TRACKED: readonly NotTracked[] = [
  { what: 'Launch monitor numbers (club speed, ball speed, launch, spin, carry)', words: ['club speed', 'clubhead speed', 'swing speed', 'ball speed', 'launch angle', 'spin rate', 'carry distance', 'smash factor', 'launch monitor', 'trackman'], nearest: ['Strokes gained off the tee', 'Driving accuracy', 'Approach by distance band'], note: 'Nothing from a launch monitor is recorded.' },
  { what: 'Which club was hit', words: ['which club', 'club used', 'club off the tee', 'what club', 'which iron', 'which wedge', '7 iron', '3 wood', 'hybrid'], nearest: ['Driving accuracy', 'Strokes gained off the tee', 'Approach by distance band'], note: 'A shot records only driver, another club, or putter.' },
  { what: 'Weather and course conditions as figures (wind, temperature, green speed, pin positions)', words: ['wind speed', 'windy', 'temperature', 'green speed', 'stimp', 'pin position', 'pin placement', 'weather'], nearest: ['Scoring average to par'], note: 'A round may carry a short weather note; no figures are recorded.' },
  { what: 'Why a shot was played, or what the player aimed at', words: ['aimed at', 'aim point', 'target line', 'why did he hit', 'why did she hit', 'intended target', 'decision on'], nearest: ['Penalty strokes per round', 'Approach by distance band'], note: 'A shot records where it started and finished, not the intent.' },
  { what: 'Anything about a swing, a body, an injury, sleep or fitness', words: ['swing plane', 'swing path', 'tempo', 'injury', 'injured', 'sleep', 'fatigue', 'fitness', 'strength', 'heart rate', 'mobility'], nearest: [], note: 'None of it is recorded here; strength training lives in a separate product this assistant cannot read.' },
  { what: 'Other teams’ players and their statistics', words: ['other team', 'opponent', 'opposing', 'another school', 'rival'], nearest: ['Scoring average', 'Strokes gained total'], note: 'Only this team’s own players are in the app; published level and Tour figures are in the standards reference.' },
  { what: 'A published average for a college division', words: ['division average', 'd1 average', 'd2 average', 'd3 average', 'naia average', 'national average', 'conference average'], nearest: ['Scoring average', 'Strokes gained total'], note: 'No division average is in the app; the standards reference holds level and Tour figures.' },
];

/** The first thing the app does not record that these words ask for, or null. */
export function findNotTracked(question: string): NotTracked | null {
  const q = ` ${question.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()} `;
  return NOT_TRACKED.find((entry) => entry.words.some((w) => q.includes(` ${w} `) || q.includes(` ${w}s `))) ?? null;
}

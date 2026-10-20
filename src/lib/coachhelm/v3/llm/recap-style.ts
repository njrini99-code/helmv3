/**
 * Post-round recap: the prompt's style limits, enforced (audit row 40b), and
 * the deterministic fallback that must meet them too.
 *
 * The prompt asks for exactly two sentences, at most 36 words and no
 * em-dash, but only a 30-400 character check ran before persisting: 63% of
 * stored recaps ran past 36 words and 14% carried an em-dash, most of them
 * from the fallback template's own punctuation. Pure module (round-recap.ts
 * is 'use server' and may only export async actions).
 */

import { pct } from '@/lib/golf/stat-formulas';

export const RECAP_MAX_WORDS = 36;
export const RECAP_SENTENCES = 2;

export type RecapStyleViolation = 'em_dash' | 'too_many_words' | 'not_two_sentences';

/** Abbreviations whose period does not end a sentence. */
const ABBREVIATION_RE = /\b(No|St|Mt|Mr|Mrs|Ms|Dr|Jr|Sr|Ft)\./g;

function countSentences(text: string, protectedPhrases: readonly string[]): number {
  let masked = text;
  for (const phrase of protectedPhrases) {
    if (phrase.trim()) masked = masked.split(phrase).join('X');
  }
  masked = masked.replace(/(\d)\.(\d)/g, '$1$2').replace(ABBREVIATION_RE, '$1');
  const ends = masked.match(/[.!?]+(?=\s|$)/g)?.length ?? 0;
  const trailing = masked.replace(/^[\s\S]*[.!?]+(?=\s|$)/, '').trim();
  return ends + (trailing ? 1 : 0);
}

/**
 * Every limit the text breaks, or `[]`. `protectedPhrases` (course and
 * player names) are masked before counting sentences so "Pinehurst No. 2"
 * or "St. Andrews" never reads as a sentence end.
 */
export function checkRecapStyle(text: string, protectedPhrases: readonly string[] = []): RecapStyleViolation[] {
  const out: RecapStyleViolation[] = [];
  if (/[—–]/.test(text)) out.push('em_dash');
  if (text.trim().split(/\s+/).filter(Boolean).length > RECAP_MAX_WORDS) out.push('too_many_words');
  if (countSentences(text, protectedPhrases) !== RECAP_SENTENCES) out.push('not_two_sentences');
  return out;
}

export interface DeterministicRecapRound {
  course_name: string | null;
  total_score: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_fairways: number | null;
  total_fairways_hit: number | null;
  total_gir: number | null;
  total_gir_possible: number | null;
  holes_played: number | null;
}

export interface DeterministicRecapStats {
  scoring_average: number | null;
  best_round: number | null;
}

/**
 * Two sentences from round stats alone: a lede picked by what most defines
 * the round, then a forward-looking takeaway. Commas, never dashes.
 */
export function buildDeterministicRecap(
  round: DeterministicRecapRound,
  stats: DeterministicRecapStats | null,
): string {
  const stp = round.score_to_par ?? 0;
  const score = round.total_score ?? 0;
  const fir =
    round.total_fairways_hit !== null && round.total_fairways !== null
      ? pct(round.total_fairways_hit, round.total_fairways)
      : null;
  const gir =
    round.total_gir !== null && round.total_gir_possible !== null
      ? pct(round.total_gir, round.total_gir_possible)
      : null;

  // The season scoring average and best round are 18-hole figures, so
  // comparing a 9-hole total against them produces nonsense ("37 strokes
  // below the season average"). Skip those ledes for short rounds.
  const is18HoleRound = (round.holes_played ?? 18) === 18;
  const puttHeavy =
    round.total_putts !== null && !!round.holes_played && round.total_putts / round.holes_played > 2;

  let lede: string;
  if (is18HoleRound && stats?.scoring_average && score < stats.scoring_average - 1) {
    const delta = (stats.scoring_average - score).toFixed(1);
    lede = `${score} on the card, ${delta} strokes below the season average.`;
  } else if (is18HoleRound && stats?.best_round && score < stats.best_round) {
    lede = `${score} sets a new low for the season.`;
  } else if (stp < 0) {
    lede = `${score} dipped under par, the kind of round the rest of the season measures itself against.`;
  } else if (puttHeavy) {
    lede = `${score} on the card, but the putter cost ${round.total_putts} strokes on ${round.holes_played} holes.`;
  } else if (fir !== null && fir > 75) {
    lede = `${score} on the card, built off the tee with ${fir}% of fairways found.`;
  } else if (gir !== null && gir < 40) {
    lede = `${score} on the card, with the approach game finding only ${gir}% of greens.`;
  } else {
    lede = `${score} on the card at ${round.course_name ?? 'the course'}.`;
  }

  let takeaway: string;
  if (puttHeavy) {
    takeaway = 'Short-game reps before the next outing should pay back what the lag putts gave away.';
  } else if (gir !== null && gir < 50) {
    takeaway = 'Tighter approach proximity is the next thread, since the scoring window opens with green-hit rate.';
  } else if (fir !== null && fir < 50) {
    takeaway = 'A more reliable tee shot would compound the gains everywhere else.';
  } else if (stp < 0) {
    takeaway = 'Hold this advantage, and keep the drills supporting it on the practice plan.';
  } else {
    takeaway = 'The next round is where this baseline gets tested.';
  }

  return `${lede} ${takeaway}`;
}

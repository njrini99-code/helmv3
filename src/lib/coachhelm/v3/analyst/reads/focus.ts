/**
 * CoachHelm reads, stage 4: a focus or plan made from a card, and how it went.
 *
 * The link keeps the card id and the number on the day. After that the card carries a "since" line, and at the
 * horizon one word: worked, moved, did not move, got worse, too early, cannot tell. The words and the rule are the
 * verdict logic already written for focus areas (src/lib/coachhelm/v3/verdicts/verdict.ts, never run in production),
 * pointed at strokes a round instead of a rate: the post-focus rounds are tested against where the number would have
 * drifted anyway (regression to the mean, shrinkToward the team’s middle, src/lib/coachhelm/v3/support/shrink.ts) on a
 * one-sided 90% bound. It says "after", never "because of". Pure.
 */
import { shrinkToward } from '@/lib/coachhelm/v3/support/shrink';
import type { VerdictWord } from '@/lib/coachhelm/v3/verdicts/verdict';
import { meanSummary, tQuantile } from '../stats';
import type { FactSheet, RoundStrokesGained } from '../types';
import { Figures, dayText, oneDecimal, whole } from './format';
import type { PartId } from './types';

/** Rounds after the focus before the verdict is given. */
export const FOCUS_HORIZON_ROUNDS = 8;
/** How many rounds the team’s middle is worth when shrinking the number on the day (the drift without coaching). */
export const FOCUS_KAPPA_ROUNDS = 5;
/** The smallest change worth calling "worked", strokes a round. */
export const FOCUS_SWC = 0.3;

export interface FocusLink {
  card_key: string;
  part: PartId;
  set_on: string;
  /** Strokes a round lost on the day, and over how many rounds. */
  value_on_day: number;
  rounds_on_day: number;
  /** The team’s middle loss in the part on the day (coach-only input; never shown to a player). Null without a team. */
  team_lost_on_day: number | null;
}

export interface FocusRead {
  card_key: string;
  set_on: string;
  rounds_since: number;
  since_text: string;
  word: VerdictWord;
  word_text: string;
  expected_without_focus: number;
  figures: Record<string, string>;
}

const PICK: Record<PartId, (r: RoundStrokesGained) => number | null> = {
  strokes_gained_off_the_tee: (r) => r.off_the_tee,
  strokes_gained_approach: (r) => r.approach,
  strokes_gained_around_the_green: (r) => r.around_the_green,
  strokes_gained_putting: (r) => r.putting,
};

const WORDS: Record<VerdictWord, string> = {
  worked: 'Worked',
  moved: 'Moved',
  did_not_move: 'Did not move',
  got_worse: 'Got worse',
  too_early: 'Too early',
  cant_tell: 'Cannot tell',
};

export function focusRead(link: FocusLink, sheet: Pick<FactSheet, 'strokes_gained_by_round_season'>): FocusRead {
  const f = new Figures();
  const after = sheet.strokes_gained_by_round_season
    .filter((r) => r.measured && r.date > link.set_on && PICK[link.part](r) != null)
    .sort((a, b) => a.date.localeCompare(b.date) || a.round_id.localeCompare(b.round_id))
    .slice(0, FOCUS_HORIZON_ROUNDS);
  const lost = after.map((r) => -(PICK[link.part](r) as number));
  const expected = shrinkToward(link.value_on_day, link.rounds_on_day, link.team_lost_on_day ?? link.value_on_day, FOCUS_KAPPA_ROUNDS);
  const was = f.put('focus_was', oneDecimal(link.value_on_day));
  const day = f.put('focus_day', dayText(link.set_on));
  if (!lost.length) {
    return { card_key: link.card_key, set_on: link.set_on, rounds_since: 0, since_text: `Focus set ${day}: no round with every shot logged since.`, word: 'cant_tell', word_text: WORDS.cant_tell, expected_without_focus: expected, figures: f.all };
  }
  const s = meanSummary(lost)!;
  const n = f.put('focus_rounds', whole(lost.length));
  const since_text = `Since the focus was set (${n} ${lost.length === 1 ? 'round' : 'rounds'}): ${f.put('focus_now', oneDecimal(s.mean))} a round lost, was ${was}.`;
  let word: VerdictWord;
  if (lost.length < FOCUS_HORIZON_ROUNDS || s.se == null || s.df == null) word = 'too_early';
  else {
    const t = tQuantile(0.1, s.df) * s.se;
    const upper = s.mean + t;
    const lower = s.mean - t;
    const target = expected - Math.max(FOCUS_SWC, 0.5 * Math.max(0, expected - (link.team_lost_on_day ?? expected)));
    if (lower > expected) word = 'got_worse';
    else if (upper < expected) word = s.mean <= target ? 'worked' : 'moved';
    else word = 'did_not_move';
  }
  return { card_key: link.card_key, set_on: link.set_on, rounds_since: lost.length, since_text, word, word_text: WORDS[word], expected_without_focus: expected, figures: f.all };
}

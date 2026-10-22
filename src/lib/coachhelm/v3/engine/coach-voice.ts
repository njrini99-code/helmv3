/**
 * The coach's voice on a v3 read (design call D1 "One object, two voices" and
 * "Coach voice vs player voice"; stored as `evidence.coach_copy`).
 *
 * A generator writes its title and content ONCE, as a function of a
 * {@link Voice}, from its own structured fields, and {@link inBothVoices}
 * renders that template twice: the player's copy exactly as before ("you're
 * making 58%"), and the coach's in the third person ("the player makes 58%",
 * then "they", "their"). Same interpolations, so the same facts and the same
 * numbers by construction; nothing is regexed out of the player's string.
 * Where a family needs its own coach wording (the coach's action: "Have the
 * player ...", "Assign ..."), the template says so with `v.pick`.
 *
 * The coach copy names nobody: "the player" is the antecedent and the
 * Clubhouse reader (`speak`) puts the first name in its place, so a renamed
 * player never leaves a stale name in a stored row. Rule-based only; no LLM.
 *
 * {@link coachCopyIssues} is the write-side check BaseGenerator runs before it
 * stores the copy: both parts non-empty, the same numbers as the player's
 * copy (the reader drops a part whose numbers differ), no second person and
 * no club words (shot type, and driver vs not-driver, only).
 */
import type { InsightCoachCopy } from '@/lib/coachhelm/v2/insights/types';

export interface Voice {
  /** True when rendering the coach's copy. */
  readonly coach: boolean;
  /** Subject pronoun: "you" / "they" (the verb agrees the same way). */
  readonly you: string;
  readonly You: string;
  /** Possessive: "your" / "their". */
  readonly your: string;
  readonly Your: string;
  /** "you're" / "they're". */
  readonly youre: string;
  readonly Youre: string;
  /** Object pronoun: "you" / "them". */
  readonly them: string;
  /**
   * First mention, the antecedent of "they": "you" / "the player". The coach
   * form takes a singular verb, so use it before a verb that does not change
   * (past tense, a modal) or pair the verb with `pick`.
   */
  readonly player: string;
  readonly Player: string;
  /** First-mention possessive: "your" / "the player's". */
  readonly players: string;
  readonly Players: string;
  /** The player's words or the coach's, where the family words them differently. */
  pick(player: string, coach: string): string;
}

export const PLAYER_VOICE: Voice = {
  coach: false,
  you: 'you',
  You: 'You',
  your: 'your',
  Your: 'Your',
  youre: "you're",
  Youre: "You're",
  them: 'you',
  player: 'you',
  Player: 'You',
  players: 'your',
  Players: 'Your',
  pick: (player) => player,
};

export const COACH_VOICE: Voice = {
  coach: true,
  you: 'they',
  You: 'They',
  your: 'their',
  Your: 'Their',
  youre: "they're",
  Youre: "They're",
  them: 'them',
  player: 'the player',
  Player: 'The player',
  players: "the player's",
  Players: "The player's",
  pick: (_player, coach) => coach,
};

export interface ReadCopy {
  title: string;
  content: string;
}

/** The read in the player's voice, with the same read in the coach's voice as `coach`. */
export function inBothVoices(write: (v: Voice) => ReadCopy): ReadCopy & { coach: InsightCoachCopy } {
  const player = write(PLAYER_VOICE);
  const coach = write(COACH_VOICE);
  return { title: player.title, content: player.content, coach: { title: coach.title, content: coach.content } };
}

/**
 * The numbers a text states, as written, sign left out and a thousands comma
 * read as part of the number. The same reading as the Clubhouse coach-voice
 * reader (`numbersIn` there), so a copy that passes here is used there.
 */
export function numbersIn(text: string): string[] {
  return (text.match(/\d[\d,]*(?:\.\d+)?/g) ?? []).map((n) => n.replace(/,/g, ''));
}

/** The same numbers, as many times each, in any order. */
export function sameNumbers(a: string, b: string): boolean {
  const x = numbersIn(a).sort();
  const y = numbersIn(b).sort();
  return x.length === y.length && x.every((n, i) => n === y[i]);
}

/** Second person, which the coach's copy never uses. */
export const SECOND_PERSON = /\b(?:you|your|yours|yourself)\b|\byou['’](?:re|ve|ll|d)\b/i;

/** Club words: reads speak of shot type, and driver vs not-driver, only. */
export const CLUB_WORDS =
  /\b(?:clubs?|clubbing|under-clubbing|over-clubbing|irons?|wedges?|hybrids?|woods?|putters?|bag)\b/i;

/** What is wrong with a coach copy against its player copy; empty when it can be stored. */
export function coachCopyIssues(player: ReadCopy, coach: ReadCopy): string[] {
  const issues: string[] = [];
  for (const part of ['title', 'content'] as const) {
    const text = coach[part];
    if (typeof text !== 'string' || text.trim() === '') {
      issues.push(`${part}: empty`);
      continue;
    }
    if (!sameNumbers(text, player[part])) issues.push(`${part}: numbers differ from the player's copy`);
    if (SECOND_PERSON.test(text)) issues.push(`${part}: second person`);
    if (CLUB_WORDS.test(text)) issues.push(`${part}: club word`);
  }
  return issues;
}

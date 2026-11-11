/**
 * CoachHelm chat knowledge: the golf-sense eval questions, loaded and compiled. No model is called here or by anything
 * that imports this; the live harness (`scripts/coachhelm/ask-eval.mjs`) reads the same JSON when the owner approves a run.
 */
import data from './golf-sense.json';

export interface EvalFact {
  label: string;
  kind: 'phrase';
  re: RegExp;
}
export interface EvalForbid {
  label: string;
  pattern: string;
  re: RegExp;
}
export interface EvalQuestion {
  id: string;
  area: string;
  viewer: 'coach' | 'player';
  ask: string;
  /** Reads a correct turn uses; empty when the prompt or the reference answers it. */
  readers: string[];
  facts: EvalFact[];
  /** The question's own guards, then the writing rules every answer is held to (`global_forbid`). */
  forbid: EvalForbid[];
  note: string;
  /** Writing limits: an answer longer than `max_sentences` fails. */
  style?: { max_sentences: number };
}

type RawPattern = { re: string; flags: string; why: string };
const PATTERNS = data.patterns as Record<string, RawPattern>;

export const EVAL_PLACEHOLDERS = ['{player}', '{player2}', '{new_player}', '{no_shots_player}', '{teammate}'] as const;
export const EVAL_PATTERN_NAMES: readonly string[] = Object.keys(PATTERNS);
/** The writing rules: patterns no answer to any question may match. */
export const EVAL_GLOBAL_FORBID: readonly string[] = data.global_forbid;

/** First names that are also everyday words: lower-case, they are not a name written wrongly. */
const EVERYDAY_WORDS = new Set(['will', 'grant', 'chase', 'hunter', 'mark', 'bill', 'drew', 'rich', 'may', 'rose', 'lane', 'reed', 'art', 'dean', 'miles', 'chance', 'ace', 'bo', 'sky', 'jay', 'pat', 'sandy', 'summer', 'hope', 'faith', 'grace', 'joy']);
const escapeRe = (text: string) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** `Eli Brandt` → a pattern for the same letters in any other casing ("eli brandt", "ELI BRANDT", "Eli brandt"), never the name as stored. */
const miscasedSource = (stored: string) =>
  `(?<![A-Za-z])(?!${escapeRe(stored)}(?![A-Za-z]))${[...stored].map((ch) => (/[A-Za-z]/.test(ch) ? `[${ch.toLowerCase()}${ch.toUpperCase()}]` : escapeRe(ch))).join('')}(?![A-Za-z])`;

/**
 * A pattern that matches a stored proper name written with the wrong capitals: a player as the roster has them, a course
 * or an event as it is stored. `people` are also checked by first and last name alone (a first name that is an everyday
 * word, such as Will or Chase, only as part of the full name). Null when no name is given.
 */
export function properNounPattern(names: { people?: readonly string[]; places?: readonly string[] }): RegExp | null {
  const whole = [...(names.people ?? []), ...(names.places ?? [])].map((n) => n.trim()).filter((n) => /[A-Za-z]{2}/.test(n));
  const parts = (names.people ?? []).flatMap((n) => n.trim().split(/\s+/)).filter((w) => w.length >= 3 && /^[A-Z]/.test(w) && !EVERYDAY_WORDS.has(w.toLowerCase()));
  const all = [...new Set([...whole, ...parts])];
  return all.length ? new RegExp(all.map(miscasedSource).join('|')) : null;
}

/** Sentences in an answer, counted the way the style limit means it: a list line counts as one. */
export function sentenceCount(answer: string): number {
  return answer
    .split(/\n+/)
    .flatMap((line) => line.split(/(?<=[.!?])\s+(?=[A-Z"“])/))
    .filter((part) => /[A-Za-z]/.test(part)).length;
}

/** The questions with their patterns compiled. `names` fills the placeholders; without it they are left as written. */
export function golfSenseQuestions(
  names: Partial<Record<'player' | 'player2' | 'new_player' | 'no_shots_player' | 'teammate', string>> = {},
  /** The team's own proper names, so a name written with the wrong capitals fails: the roster, and the courses and events the reads can return. */
  stored: { people?: readonly string[]; places?: readonly string[] } = {},
): EvalQuestion[] {
  const proper = properNounPattern(stored);
  const fill = (text: string) => text.replace(/\{(player|player2|new_player|no_shots_player|teammate)\}/g, (whole, key: keyof typeof names) => names[key] ?? whole);
  return data.questions.map((q) => ({
    id: q.id,
    area: q.area,
    viewer: q.viewer as EvalQuestion['viewer'],
    ask: fill(q.ask),
    readers: [...q.readers],
    facts: q.facts.map((f) => ({ label: f.label, kind: 'phrase' as const, re: new RegExp(f.re, f.flags) })),
    forbid: [...q.forbid, ...EVAL_GLOBAL_FORBID.filter((name) => !q.forbid.some((f) => f.pattern === name)).map((name) => ({ label: PATTERNS[name]?.why ?? name, pattern: name }))].map((f) => {
      const p = PATTERNS[f.pattern];
      if (!p) throw new Error(`eval question ${q.id} names an unknown pattern: ${f.pattern}`);
      // A name filled into a pattern is matched literally.
      const source = p.re.replace(/\{(player|player2|new_player|no_shots_player|teammate)\}/g, (whole, key: keyof typeof names) => (names[key] ? names[key]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : whole));
      // The proper-noun rule is the fixed names (PGA Tour, NCAA, Division I) and the team's own.
      const full = f.pattern === 'proper_noun_case' && proper ? `${source}|${proper.source}` : source;
      return { label: f.label, pattern: f.pattern, re: new RegExp(full, p.flags) };
    }),
    note: q.note,
    ...('style' in q && q.style ? { style: q.style as { max_sentences: number } } : {}),
  }));
}

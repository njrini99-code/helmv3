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
  forbid: EvalForbid[];
  note: string;
}

type RawPattern = { re: string; flags: string; why: string };
const PATTERNS = data.patterns as Record<string, RawPattern>;

export const EVAL_PLACEHOLDERS = ['{player}', '{player2}', '{new_player}', '{no_shots_player}', '{teammate}'] as const;
export const EVAL_PATTERN_NAMES: readonly string[] = Object.keys(PATTERNS);

/** The questions with their patterns compiled. `names` fills the placeholders; without it they are left as written. */
export function golfSenseQuestions(names: Partial<Record<'player' | 'player2' | 'new_player' | 'no_shots_player' | 'teammate', string>> = {}): EvalQuestion[] {
  const fill = (text: string) => text.replace(/\{(player|player2|new_player|no_shots_player|teammate)\}/g, (whole, key: keyof typeof names) => names[key] ?? whole);
  return data.questions.map((q) => ({
    id: q.id,
    area: q.area,
    viewer: q.viewer as EvalQuestion['viewer'],
    ask: fill(q.ask),
    readers: [...q.readers],
    facts: q.facts.map((f) => ({ label: f.label, kind: 'phrase' as const, re: new RegExp(f.re, f.flags) })),
    forbid: q.forbid.map((f) => {
      const p = PATTERNS[f.pattern];
      if (!p) throw new Error(`eval question ${q.id} names an unknown pattern: ${f.pattern}`);
      // A name filled into a pattern is matched literally.
      const source = p.re.replace(/\{(player|player2|new_player|no_shots_player|teammate)\}/g, (whole, key: keyof typeof names) => (names[key] ? names[key]!.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') : whole));
      return { label: f.label, pattern: f.pattern, re: new RegExp(source, p.flags) };
    }),
    note: q.note,
  }));
}

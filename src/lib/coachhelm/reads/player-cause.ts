import { splitSentences } from '@/lib/utils/sentences';
import { isNotTracedCause } from './cause-state';
import { isPlaceholderCause } from './placeholder-cause';

/**
 * What a player may read of a cause (Q3, CR0: "Coach-only things are absent from the player's DOM and responses"). A counted sequence is
 * theirs. A guess is the coach's: the engine's arms of a likely cause, and any sentence of the row's own prose that states or guesses one.
 * One owner, so the Board's card, the Deep dive, the Read and player Ask cannot disagree. Pure and client-safe: evidence in, text out.
 */

const rec = (v: unknown): Record<string, unknown> | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '');

/**
 * A sentence that states or guesses a cause ("It's consistent with a pace-control pattern", "That's driven by", "the classic under-read").
 * "points to" after a figure is a measure ("23 points to the Tour"), so it does not count.
 */
const CAUSAL_WORDS = /\b(?:consistent with|looks? like|suggests?|likely|because|due to|caused by|driven by|stems? from|the classic)\b/i;
export const CAUSAL = {
  test(sentence: string): boolean {
    if (CAUSAL_WORDS.test(sentence)) return true;
    return [...sentence.matchAll(/\bpoints? to\b/gi)].some((m) => !/[\d.]\s$/.test(sentence.slice(0, m.index ?? 0)));
  },
};

/** The player reads a cause only when it was counted in their shots; anything else, a guess or no cause at all, is not traced for them. */
export function playerSeesCause(ev: unknown): boolean {
  const e = rec(ev);
  const d = rec(e?.diagnosis);
  const cause = str(d?.root_cause);
  if (!cause || d?.causality_level !== 'observed_sequence') return false;
  if (rec(e?.cause)?.state === 'inferred_hypothesis') return false;
  return !isPlaceholderCause(cause) && !isNotTracedCause(e as never);
}

/** The words of the arms the engine stored, lower case: each slice's label, each arm's "16 of 28" and the guess's own sentences. */
function armWords(ev: unknown): string[] {
  const e = rec(ev);
  const out: string[] = [];
  const alternatives = rec(e?.cause)?.alternatives;
  for (const alt of Array.isArray(alternatives) ? alternatives : []) {
    const a = rec(alt);
    if (str(a?.label)) out.push(str(a?.label));
    for (const arm of [rec(a?.arm_a), rec(a?.arm_b)]) {
      if (typeof arm?.failures === 'number' && typeof arm?.n === 'number') out.push(`${arm.failures} of ${arm.n}`);
    }
  }
  const root = str(rec(e?.diagnosis)?.root_cause);
  if (root && !isPlaceholderCause(root)) out.push(...splitSentences(root).map((s) => s.replace(/[.!?]+$/, '').trim()));
  return out.filter(Boolean).map((w) => w.toLowerCase());
}

/** This text names an arm of a cause the player is not shown. A counted cause has none to hide. */
export function namesWithheldArm(text: string, ev: unknown): boolean {
  if (playerSeesCause(ev)) return false;
  const said = text.toLowerCase();
  return armWords(ev).some((w) => said.includes(w));
}

/** The text as a player may read it, sentence by sentence; null when nothing is left. A counted cause keeps it whole. */
export function withoutGuessedCause(text: string | null | undefined, ev: unknown): string | null {
  const t = (text ?? '').trim();
  if (!t) return null;
  if (playerSeesCause(ev)) return t;
  return (
    splitSentences(t)
      .filter((s) => !CAUSAL.test(s) && !namesWithheldArm(s, ev))
      .join(' ')
      .trim() || null
  );
}

/** A read's title as a player may read it: its own, or what it measures when the title is itself the guess. */
export function playerTitle(title: string, ev: unknown): string {
  if (playerSeesCause(ev) || (!CAUSAL.test(title) && !namesWithheldArm(title, ev))) return title;
  return str(rec(ev)?.metric_label) || 'A read on your game';
}

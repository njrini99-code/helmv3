import type { ChRoundReview } from '../../data/round-review-shape';

/**
 * The stored round recap, checked against the round's own figures before it is shown (P011-C2's defect part, D13): a
 * sentence that praises a part of the game the strokes-gained numbers say was lost (or blames one they say was
 * gained), or cites a strokes-gained or putts figure the round doesn't have, is dropped. What is left is shown; when
 * nothing is left, no recap is shown. No new AI call: this only reads the text already written and the figures on the
 * page.
 */

type Leg = 'tee' | 'approach' | 'around' | 'putting';

const LEGS: Array<[Leg, RegExp]> = [
  ['putting', /\b(putt(?:s|er|ing)?|three-putts?|on the greens?)\b/i],
  ['approach', /\b(approach(?:es)?|irons?|ball-?striking|into the greens?)\b/i],
  ['tee', /\b(driv(?:er|ing|es?)|off the tee|tee shots?)\b/i],
  ['around', /\b(short game|chip(?:s|ping)?|around the greens?|pitch(?:es|ing)?|scrambl\w*|bunker play)\b/i],
];

const GOOD = /\b(held steady|steady|solid|strong|sharp|carried|gained|good|great|excellent|best|dialed|hot|reliable|clean|saved)\b/i;
const BAD = /\b(lost|cost|struggled|struggle|damage|poor|cold|leaked|hurt|weak|worst|shaky|let (?:you|him|her|them) down|three-putts?)\b/i;

/** A strokes-gained value this far from zero is a clear gain or loss; nearer zero, either word is fair. */
const CLEAR = 0.5;

/** The recap's sentences (keeps the closing stop with each). */
export function sentences(text: string): string[] {
  // A stop ends a sentence only before a space, so "0.9" stays whole.
  return text
    .split(/(?<=[.!?]["”’)]?)\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** A sentence's clauses with the joins before them, so "the approach was sharp, and the putter held steady" is read part by part. */
const JOIN = /(,\s*(?:and|but|while|though|where)\s+|;\s*|\s+but\s+)/i;

function contradicts(clause: string, sg: NonNullable<ChRoundReview['strokesGained']>): boolean {
  const good = GOOD.test(clause);
  const bad = BAD.test(clause);
  if (good === bad) return false;
  return LEGS.some(([leg, re]) => {
    const v = sg[leg];
    if (v == null || !re.test(clause)) return false;
    return good ? v <= -CLEAR : v >= CLEAR;
  });
}

/** A figure the sentence cites that the round doesn't have: a signed decimal (strokes gained) or a putts total. */
function badFigure(sentence: string, r: Pick<ChRoundReview, 'strokesGained' | 'putts'>): boolean {
  const sg = r.strokesGained;
  const decimals = sentence.match(/[+−-]?\d+\.\d\b/g) ?? [];
  if (decimals.length) {
    const known = sg ? [sg.total, sg.tee, sg.approach, sg.around, sg.putting].filter((v): v is number => v != null).map((v) => Math.abs(v)) : [];
    for (const d of decimals) {
      const v = Math.abs(parseFloat(d.replace('−', '-')));
      if (!known.some((k) => Math.abs(k - v) < 0.051)) return true;
    }
  }
  const putts = sentence.match(/\b(\d{2})\s+putts\b/i);
  if (putts && r.putts != null && Number(putts[1]) !== r.putts) return true;
  return false;
}

/**
 * One sentence, checked: a later clause that contradicts the figures is cut with the join before it ("…birdies, and the
 * putter held steady." keeps "…birdies."); a sentence whose first clause does, or that cites a figure the round doesn't
 * have, is dropped whole.
 */
function checkSentence(sentence: string, r: Pick<ChRoundReview, 'strokesGained' | 'putts'>): string | null {
  if (badFigure(sentence, r)) return null;
  const sg = r.strokesGained;
  if (!sg) return sentence;
  const parts = sentence.split(JOIN);
  if (contradicts(parts[0]!, sg)) return null;
  let out = parts[0]!;
  for (let i = 1; i < parts.length; i += 2) {
    const clause = parts[i + 1] ?? '';
    if (!contradicts(clause, sg)) out += parts[i]! + clause;
  }
  if (out === sentence) return sentence;
  const end = sentence.match(/[.!?]+["”’)]*$/)?.[0] ?? '.';
  return out.replace(/[\s,;.!?]+$/, '') + end;
}

/** The recap with every part that disagrees with the round's figures removed; null when none is left. */
export function checkedRecap(r: Pick<ChRoundReview, 'recap' | 'strokesGained' | 'putts'>): string | null {
  if (!r.recap) return null;
  const kept = sentences(r.recap)
    .map((s) => checkSentence(s, r))
    .filter((s): s is string => !!s);
  return kept.length ? kept.join(' ') : null;
}

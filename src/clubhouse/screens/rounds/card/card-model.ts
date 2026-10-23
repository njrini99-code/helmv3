import type { ChReviewHole, ChRoundReview } from '../../../data/round-review-shape';
import { formatFixed, formatSigned, NO_DATA } from '../../../lib/format';
import { dateOf, TYPE_LABEL } from '../labels';
import { flow, headline, resultOf } from '../round-insights';

/**
 * P011: the round card, as data. The page's scorecard artifact (RoundCard.tsx) and the PNG drawn from it
 * (draw-card.ts) both read this one model, so the picture can never say a different Out, In or Total than the
 * page. Every figure comes from the review the page already loaded; nothing is recomputed differently: a nine's
 * subtotal is the sum of its holes (as the review's own scorecard sums them), the round's total is the canonical
 * `score` and `toPar` the hero shows, and strokes gained is the round's own.
 */

/** The notation on a hole: a circle is a birdie, a double circle an eagle or better, a square a bogey, a double square a double bogey or worse. */
export type CardMark = 'eagle' | 'birdie' | 'bogey' | 'double';

/** A hole's mark, or null for a par and for a hole with no score or no par. */
export function markOf(score: number | null, par: number | null): CardMark | null {
  if (score == null || par == null) return null;
  const r = resultOf(score, par);
  return r === 'par' ? null : r;
}

export const MARK_NAME: Record<CardMark, string> = { eagle: 'Eagle or better', birdie: 'Birdie', bogey: 'Bogey', double: 'Double bogey or worse' };

export interface CardHole {
  n: number;
  par: number | null;
  score: number | null;
  putts: number | null;
  /** Fairway hit; null on a par 3 or when it wasn't tracked. */
  fir: boolean | null;
  /** Green in regulation; null when it wasn't tracked. */
  gir: boolean | null;
  mark: CardMark | null;
}

export interface CardCount {
  hit: number;
  of: number;
}

export interface CardBand {
  label: 'Out' | 'In';
  holes: CardHole[];
  /** A subtotal is null unless every hole of the nine has its figure: a short sum would read as a score. */
  par: number | null;
  score: number | null;
  putts: number | null;
  fir: CardCount | null;
  gir: CardCount | null;
}

export interface CardLeg {
  label: string;
  /** The label on a phone, where the full one wraps and pushes its value off the row's baseline (A24). */
  short: string;
  value: number | null;
}

export interface CardModel {
  course: string;
  /** "Jonah Okafor · Wed Oct 14 · Practice": whose round it is, when, and what it counted as. */
  kicker: string;
  /** The team's name, for the picture's foot; null when it isn't known. */
  team: string | null;
  /** "Blue tees · 6,984 yds · 73.1 / 133": whatever the tee facts are. */
  tees: string | null;
  holesPlayed: number;
  /** Holes with a score. */
  scored: number;
  /** Fewer holes scored than the round has: the card says "Thru N of M holes" and a short nine shows no subtotal. */
  partial: boolean;
  bands: CardBand[];
  /** Which optional rows have anything to show. */
  rows: { putts: boolean; fir: boolean; gir: boolean };
  total: { par: number | null; score: number | null; toPar: number | null; putts: number | null; fir: CardCount | null; gir: CardCount | null };
  /** Strokes gained: the total, then the four legs. Null when the round has none. */
  sg: { total: number | null; legs: CardLeg[] } | null;
}

const SG_LEGS: Array<[keyof Omit<NonNullable<ChRoundReview['strokesGained']>, 'total'>, string, string]> = [
  ['tee', 'Off the tee', 'Off tee'],
  ['approach', 'Approach', 'Approach'],
  ['around', 'Around green', 'Around'],
  ['putting', 'Putting', 'Putting'],
];

/** True when the review has a hole-by-hole card to draw. A round posted as a total, or whose holes didn't load, has none. */
export const hasCard = (r: ChRoundReview): boolean => !r.holesError && r.holes.length > 0;

/** Where the round's nine hole numbers start: a nine-hole round played on the back nine runs 10 to 18. */
function firstHole(r: ChRoundReview): 1 | 10 {
  const lo = Math.min(...r.holes.map((h) => h.n));
  return r.holesPlayed === 9 && lo > 9 ? 10 : 1;
}

const sumOf = (holes: CardHole[], k: 'par' | 'score' | 'putts'): number | null => (holes.length && holes.every((h) => h[k] != null) ? holes.reduce((a, h) => a + (h[k] as number), 0) : null);

function countOf(holes: CardHole[], k: 'fir' | 'gir'): CardCount | null {
  const tracked = holes.filter((h) => h[k] != null);
  return tracked.length ? { hit: tracked.filter((h) => h[k] === true).length, of: tracked.length } : null;
}

function slot(n: number, h: ChReviewHole | undefined): CardHole {
  return { n, par: h?.par ?? null, score: h?.score ?? null, putts: h?.putts ?? null, fir: h?.fairway ?? null, gir: h?.gir ?? null, mark: markOf(h?.score ?? null, h?.par ?? null) };
}

function band(label: 'Out' | 'In', holes: CardHole[]): CardBand {
  return { label, holes, par: sumOf(holes, 'par'), score: sumOf(holes, 'score'), putts: sumOf(holes, 'putts'), fir: countOf(holes, 'fir'), gir: countOf(holes, 'gir') };
}

/** Who the card names when the review doesn't (a player's own round carries no name): the signed-in player, and their team. */
export interface CardWho {
  name?: string | null;
  team?: string | null;
}

export function buildCard(r: ChRoundReview, who: CardWho = {}): CardModel {
  const start = firstHole(r);
  const nines = r.holesPlayed === 9 ? 1 : 2;
  const byN = new Map(r.holes.map((h) => [h.n, h]));
  const bands: CardBand[] = [];
  for (let b = 0; b < nines; b++) {
    const from = start + b * 9;
    const holes = Array.from({ length: 9 }, (_, i) => slot(from + i, byN.get(from + i)));
    bands.push(band(from === 1 ? 'Out' : 'In', holes));
  }
  const all = bands.flatMap((b) => b.holes);
  const scored = all.filter((h) => h.score != null).length;
  const parTotal = sumOf(all, 'par') ?? (r.score != null && r.toPar != null ? r.score - r.toPar : null);
  const sg = r.strokesGained
    ? { total: r.strokesGained.total, legs: SG_LEGS.map(([k, label, short]) => ({ label, short, value: r.strokesGained![k] })) }
    : null;
  const date = `${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', weekday: 'short' }).format(dateOf(r.date))} ${new Intl.DateTimeFormat('en-US', { timeZone: 'UTC', month: 'short', day: 'numeric' }).format(dateOf(r.date))}`;
  return {
    course: r.course,
    kicker: [r.playerName ?? who.name ?? null, date, r.type ? TYPE_LABEL[r.type] : null].filter(Boolean).join(' · '),
    team: who.team ?? null,
    tees: [r.tee, r.teeFacts].filter(Boolean).join(' · ') || null,
    holesPlayed: r.holesPlayed,
    scored,
    partial: scored < r.holesPlayed,
    bands,
    rows: { putts: all.some((h) => h.putts != null), fir: all.some((h) => h.fir != null), gir: all.some((h) => h.gir != null) },
    total: { par: parTotal, score: r.score, toPar: r.toPar, putts: r.putts ?? sumOf(all, 'putts'), fir: countOf(all, 'fir'), gir: countOf(all, 'gir') },
    sg,
  };
}

/** "Thru 14 of 18 holes" for a round with holes missing; otherwise "18 holes" or "9 holes". */
export function holesLine(m: CardModel): string {
  return m.partial ? `Thru ${m.scored} of ${m.holesPlayed} holes` : `${m.holesPlayed} holes`;
}

export const countText = (c: CardCount | null): string => (c ? `${c.hit}/${c.of}` : NO_DATA);
export const figure = (v: number | null): string => (v == null ? NO_DATA : String(v));

/**
 * The one quiet line under a card that has just been posted. Only figures the page already shows: the best hole, the putts
 * and, when the hero line does not already name it, the leg that gained most. Null when there is nothing true to say.
 */
export function storyLine(r: ChRoundReview): string | null {
  const clauses: string[] = [];
  const points = flow(r.holes);
  const best = points.length ? points.reduce((a, b) => (b.delta < a.delta || (b.delta === a.delta && b.n < a.n) ? b : a)) : null;
  if (best && best.delta < 0) clauses.push(`Best on hole ${best.n}, ${best.result === 'eagle' ? 'an eagle or better' : 'a birdie'}`);
  if (r.putts != null && r.holesPlayed > 0) clauses.push(`${r.putts} putts, ${formatFixed(r.putts / r.holesPlayed, 1)} a hole`);
  const sg = r.strokesGained;
  const shown = headline(r) ?? '';
  if (sg) {
    const legs = SG_LEGS.map(([k, label]) => [label, sg[k]] as [string, number | null]).filter((l): l is [string, number] => l[1] != null && l[1] > 0);
    const top = legs.length ? legs.reduce((a, b) => (b[1] > a[1] ? b : a)) : null;
    if (top && !shown.toLowerCase().includes(top[0].toLowerCase().replace('around green', 'around the green'))) clauses.push(`${top[0].toLowerCase()} gained the most, ${formatSigned(top[1])}`);
  }
  if (!clauses.length) return null;
  const text = clauses.join('. ');
  return text.charAt(0).toUpperCase() + text.slice(1) + '.';
}

import type { ToolEnvelope, UnsupportedClaim } from './provenance';

/**
 * Bounds over a set of rounds ("the other 3 rounds had 31 putts or fewer, with 0 to 2 three-putts", "all five rounds under 80"), checked
 * against the rows the turn read.
 *
 * The numeric audit looks at each figure on its own, so "30 putts or fewer" passed because 30 is a value in the read, though one of the rounds
 * it described had 31 (staging, conversation 21a4a215: "The other 5 rounds had 30 putts or fewer" over a read where only two of the five did).
 * A bound is a claim about every row of a set, and the rows are in the read.
 *
 * One-sided, as the rest of the audit is: the sentence has to name the set plainly ("all rounds", "every round", "all five rounds", "the other 3
 * rounds", "the remaining 4 rounds"), the bound has to name its metric right beside the number, and the metric has to resolve to exactly one field
 * of the rows. A set with a word inside it ("all his tournament rounds") is a smaller set than the read and is left alone. The claim is flagged
 * only when NO read of rounds holds enough rows inside the bound: "all rounds" needs every row of the read inside it, "the other N rounds" needs N
 * rows inside it (which rows is the prose's business, so any N will do). Each bound is checked on its own, never as a conjunction.
 */

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, both: 2 };
const NUM = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
const DET = String.raw`(?:(?:of\s+)?(?:the|his|her|their|these|those|our|your)\s+)?`;
const ROUNDS = String.raw`rounds?`;

/** "the other 3 rounds", "the remaining four rounds": N rows of the read. */
const OTHER = new RegExp(String.raw`\b(?:the\s+)?(?:other|remaining|rest\s+of\s+the)\s+${NUM}\s+${ROUNDS}\b`, 'gi');
/** "all rounds", "every round", "each of his rounds", "all five rounds", "both rounds": every row of the read (or N of them). */
const ALL = new RegExp(String.raw`\b(all|every|each|both)\s+${DET}(?:${NUM}\s+)?${ROUNDS}\b`, 'gi');

const FEWER = String.raw`(?:fewer|less|lower|under|below|smaller)`;
const MORE = String.raw`(?:more|higher|greater|over|above|bigger|larger)`;
const NUMBER = String.raw`(-?\d+(?:\.\d+)?)`;
const CUE_WORDS = String.raw`((?:[\p{L}'-]+\s+){0,3}?)`;
/** The words after a number, up to three and not past a comma or a stop: "three-putts", "putts in the", "". */
const WORDS_AFTER = String.raw`((?:[\p{L}'-]+\s*){0,3})`;
/** "30 putts or fewer", "5 three-putts or more": group 1 the number, 2 a percent sign, 3 the words before "or", 4 which way. */
const OR_FORM = new RegExp(String.raw`(?:^|[^\p{L}\p{N}.])${NUMBER}\s*(%?)\s*${CUE_WORDS}or\s+(${FEWER}|${MORE})\b`, 'giu');
/** "under 75", "fewer than 3 three-putts", "at most 31 putts", "above 60%": group 1 the phrase, 2 the number, 3 a percent sign, 4 the words after. */
const BOUND_FORM = new RegExp(
  String.raw`\b(under|below|fewer\s+than|less\s+than|no\s+more\s+than|not\s+more\s+than|at\s+most|up\s+to|no\s+higher\s+than|no\s+greater\s+than|never\s+(?:above|over)|over|above|more\s+than|at\s+least|no\s+fewer\s+than|no\s+less\s+than|no\s+lower\s+than|never\s+(?:below|under))\s+${NUMBER}\s*(%?)\s*${WORDS_AFTER}`,
  'giu',
);
/** "0 to 2 three-putts", "30-37 putts", "between 30 and 37 putts": group 1 and 2 the ends, 3 a percent sign, 4 the words after. */
const RANGE_FORM = new RegExp(String.raw`(?:^|[^\p{L}\p{N}.])(?:between\s+)?${NUMBER}\s*(?:to|–|-)\s*${NUMBER}\s*(%?)\s*${WORDS_AFTER}`, 'giu');
const BETWEEN_FORM = new RegExp(String.raw`\bbetween\s+${NUMBER}\s+and\s+${NUMBER}\s*(%?)\s*${WORDS_AFTER}`, 'giu');

/** A metric the words beside a number name, as the fields it can be in a round row. Checked in this order: the first that matches wins. */
const METRICS: Array<{ cue: RegExp; field: RegExp; percent?: boolean }> = [
  { cue: /\bthree[- ]?putts?\b|\b3[- ]?putts?\b/i, field: /^three_putts$/ },
  { cue: /\bone[- ]?putts?\b|\b1[- ]?putts?\b/i, field: /^one_putts$/ },
  { cue: /\bputts?\b|\bputting\s+strokes\b/i, field: /^(?:total_)?putts$/ },
  { cue: /\bdouble[- ]bogeys?\b/i, field: /^double_bogeys$/ },
  { cue: /\bbogeys?\b/i, field: /^bogeys$/ },
  { cue: /\bbirdies\b|\bbirdie\b/i, field: /^birdies$/ },
  { cue: /\bpenalt(?:y|ies)\b/i, field: /^penalty_strokes$/ },
  { cue: /\b(?:gir|greens?\s+in\s+regulation)\b/i, field: /^gir_percent$/, percent: true },
  { cue: /\bfairways?\b/i, field: /^fairway_percent$/, percent: true },
  { cue: /\b(?:scores?|strokes|shots)\b/i, field: /^(?:total_)?score$/ },
];

type Quantifier = { kind: 'all' } | { kind: 'atLeast'; k: number };
type Bound = { lo: number; hi: number; text: string; cueWords: string; percent: boolean };

const numberOf = (s: string): number => Number(s.replace(/[−–]/g, '-'));
const wordOrNumber = (s: string | undefined): number | null => (s === undefined ? null : /^\d+$/.test(s) ? Number(s) : (WORDS[s.toLowerCase()] ?? null));

function sentencesOf(paragraph: string): string[] {
  const out: string[] = [];
  let start = 0;
  for (const m of paragraph.matchAll(/[.!?](?=\s|$)/g)) {
    const end = (m.index ?? 0) + 1;
    out.push(paragraph.slice(start, end));
    start = end;
  }
  if (start < paragraph.length) out.push(paragraph.slice(start));
  return out.map((s) => s.trim()).filter(Boolean);
}

/** The sets of rounds the reads hold: arrays of rows that carry a date or a round id, as the numbers of each row. */
export function roundSets(evidence: Iterable<ToolEnvelope>): Array<Array<Record<string, number>>> {
  const sets: Array<Array<Record<string, number>>> = [];
  const walk = (v: unknown, depth: number) => {
    if (depth > 4 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      const rows = v.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object' && !Array.isArray(r));
      const rounds = rows.length >= 2 && rows.length === v.length && rows.every((r) => 'round_id' in r || 'round_date' in r || ('date' in r && ('total_score' in r || 'putts' in r)));
      if (rounds) {
        sets.push(rows.map((r) => Object.fromEntries(Object.entries(r).filter((e): e is [string, number] => typeof e[1] === 'number' && Number.isFinite(e[1])))));
        return;
      }
      for (const x of v.slice(0, 200)) walk(x, depth + 1);
      return;
    }
    for (const x of Object.values(v as Record<string, unknown>)) walk(x, depth + 1);
  };
  for (const env of evidence) walk(env.detail, 0);
  return sets;
}

function quantifiers(sentence: string): Quantifier[] {
  const out: Quantifier[] = [];
  for (const m of sentence.matchAll(OTHER)) {
    const k = wordOrNumber(m[1]);
    if (k !== null && k >= 1) out.push({ kind: 'atLeast', k });
  }
  for (const m of sentence.matchAll(ALL)) {
    const k = wordOrNumber(m[2]);
    if (k !== null) out.push({ kind: 'atLeast', k });
    else if (/^both$/i.test(m[1] as string)) out.push({ kind: 'atLeast', k: 2 });
    else out.push({ kind: 'all' });
  }
  return out;
}

/** "under 80" on rounds, with no metric beside it, is a score: only for a whole-number bound that a score can be. */
const SCORE = METRICS[METRICS.length - 1] as (typeof METRICS)[number];

function metricOf(words: string, hasPercent: boolean, bare?: number): { field: RegExp; percent: boolean } | null {
  const hit = METRICS.find((m) => m.cue.test(words)) ?? (bare !== undefined && !hasPercent && Number.isInteger(bare) && bare >= 55 && bare <= 130 && !/[\p{L}]/u.test(words.replace(/\b(?:in|on|for|at|a|the|round|rounds|each|apiece)\b/gi, '')) ? SCORE : undefined);
  if (!hit) return null;
  // "60%" with a count metric, or a plain number with a percent one, is a different quantity.
  if (hasPercent !== !!hit.percent) return null;
  return { field: hit.field, percent: !!hit.percent };
}

function boundsOf(sentence: string): Array<Bound & { field: RegExp }> {
  const out: Array<Bound & { field: RegExp }> = [];
  const add = (lo: number, hi: number, text: string, words: string, pct: boolean, bare?: number) => {
    if (Number.isNaN(lo) || Number.isNaN(hi)) return;
    const metric = metricOf(words, pct, bare);
    if (metric) out.push({ lo, hi, text, cueWords: words, percent: pct, field: metric.field });
  };
  for (const m of sentence.matchAll(OR_FORM)) {
    const n = numberOf(m[1] as string);
    const fewer = new RegExp(`^${FEWER}$`, 'i').test(m[4] as string);
    add(fewer ? -Infinity : n, fewer ? n : Infinity, m[1] as string, m[3] ?? '', m[2] === '%');
  }
  for (const m of sentence.matchAll(BOUND_FORM)) {
    const n = numberOf(m[2] as string);
    const phrase = (m[1] as string).toLowerCase().replace(/\s+/g, ' ');
    const words = m[4] ?? '';
    const upper = /^(?:under|below|fewer than|less than|no more than|not more than|at most|up to|no higher than|no greater than|never (?:above|over))$/.test(phrase);
    const strict = /^(?:under|below|fewer than|less than|over|above|more than)$/.test(phrase);
    const eps = strict ? Number.EPSILON * Math.max(1, Math.abs(n)) : 0;
    add(upper ? -Infinity : n + eps, upper ? n - eps : Infinity, m[2] as string, words, m[3] === '%', n);
  }
  for (const m of sentence.matchAll(RANGE_FORM)) {
    const a = numberOf(m[1] as string);
    const b = numberOf(m[2] as string);
    if (a < b) add(a, b, `${m[1]} to ${m[2]}`, m[4] ?? '', m[3] === '%');
  }
  for (const m of sentence.matchAll(BETWEEN_FORM)) {
    const a = numberOf(m[1] as string);
    const b = numberOf(m[2] as string);
    if (a < b) add(a, b, `${m[1]} to ${m[2]}`, m[4] ?? '', m[3] === '%');
  }
  return out;
}

/** The bounds over a set of rounds that no read of rounds holds. */
export function auditRowBounds(text: string, sets: ReadonlyArray<ReadonlyArray<Record<string, number>>>): UnsupportedClaim[] {
  if (sets.length === 0) return [];
  const flagged: UnsupportedClaim[] = [];
  const seen = new Set<string>();
  for (const sentence of sentencesOf(text)) {
    const qs = quantifiers(sentence);
    // More than one named set in a sentence: which bound belongs to which is not for a pattern to say.
    if (qs.length !== 1) continue;
    const q = qs[0] as Quantifier;
    for (const b of boundsOf(sentence)) {
      let comparable = false;
      let holds = false;
      for (const rows of sets) {
        const key = rows.every((r) => Object.keys(r).some((f) => b.field.test(f))) ? rows : null;
        if (!key) continue;
        const values = rows.map((r) => r[Object.keys(r).find((f) => b.field.test(f)) as string] as number);
        comparable = true;
        const inside = values.filter((v) => v >= b.lo && v <= b.hi).length;
        if (q.kind === 'all' ? inside === values.length : inside >= q.k) holds = true;
      }
      if (!comparable || holds) continue;
      const id = `${b.text}|${b.lo}|${b.hi}`;
      if (seen.has(id)) continue;
      seen.add(id);
      flagged.push({ text: b.text, value: Number.isFinite(b.hi) && b.hi !== Infinity ? b.hi : b.lo });
    }
  }
  return flagged;
}

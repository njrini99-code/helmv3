/**
 * v3 LLM citation verifier (W30).
 *
 * Per Part XI.3: every numeric or named-entity claim the model emits
 * must trace back to an EvidenceClaim the caller supplied. The
 * compose() pipeline calls verifyCitations() on the generated text;
 * the result decides whether the call is logged as `verified: true`.
 *
 * v1 implementation: extract numeric tokens (integers, decimals,
 * percentages) and proper-noun-shaped tokens from the generated text,
 * and confirm each one appears in the evidence value set. False
 * positives are tolerated (we just won't flag verified=true); false
 * negatives are not (a fabricated cite must not pass).
 *
 * Two modes, chosen by the SHAPE of the evidence (see `isFieldedEvidence`):
 *   - legacy (default): every numeric token must equal ANY evidence value.
 *     Field-blind. Used by hero-narrative, practice-rx, round-review,
 *     round-review-narrative and anything else that registers bare field
 *     names.
 *   - fielded: every entry is keyed `cite.<field>` (the post-round recap,
 *     `buildRecapFieldEvidence`). Each number must equal the value of the
 *     stat its surrounding words name. See the section at the bottom.
 *
 * Future hardening (deferred): structured `cite(field, value)` tool
 * call per master plan Part XI.3 — the model would emit JSON tool
 * calls rather than free text, eliminating extraction ambiguity.
 */

import type { EvidenceClaim } from './types';

const NUMERIC_RE = /(?:^|\s|\()(-?\d+(?:\.\d+)?%?)(?=[\s,.;:!?)\]]|$)/g;

/**
 * A made/attempted fraction — `8/14`, `10/18`.
 *
 * `NUMERIC_RE` cannot see either half of one: the first number is followed by
 * `/` and the second is preceded by it, and neither is in that pattern's
 * boundary sets. So a fraction was invisible to the verifier and the model
 * could write ANY fraction and still be logged `verified: true` — a false
 * negative, which this module's contract says is the one kind of error it must
 * not make. The same fact rendered "(8 of 14)" was checked normally, so two
 * spellings of one claim got opposite scrutiny.
 *
 * Fractions are what the model actually produces here. `buildEvidence` in
 * ./round-review.ts registers `fairways_hit`/`fairways_total` and
 * `gir`/`gir_total` as separate counts precisely because the prompt hands over
 * counts, and its own comment lists the derivations observed in production
 * (`57.1 = 8/14`, `72.2 = 13/18`). Both halves are therefore already in the
 * evidence set: a truthful fraction verifies, and a fabricated numerator does
 * not.
 *
 * `(?![\/\d])` after the denominator is what keeps a slash DATE out. `8/14/2026`
 * must not become the citable claims 8, 14 and 2026 — a date is not a
 * measurement, and demanding it appear in the evidence set would discard the
 * whole review, which is the 17.8%-of-calls failure round-review.ts documents.
 */
const FRACTION_RE = /(?:^|\s|\()(\d+)\/(\d+)(?![/\d])(?=[\s,.;:!?)\]]|$)/g;

export interface CitationVerification {
  verified: boolean;
  /** Tokens found in the text that did NOT match any evidence value.
   *  Useful for debugging fabricated cites. */
  unmatched_tokens: string[];
  /**
   * Fielded mode only (see `verifyFieldedCitations`): for each unmatched
   * token, the stat its surrounding words named (`null` = no cue, judged by
   * the restricted bare-number rule). Absent in legacy mode.
   */
  mismatched_fields?: Array<{ token: string; bound_to: CitationField | null }>;
}

/**
 * Every numeric token this verifier would find in `text`.
 *
 * Exported so a caller can register the figures it puts IN FRONT of the model
 * using the exact same scanner that will later judge them. A prompt is allowed
 * to contain numbers — the round review injects composite-insight titles like
 * "3-5 ft putting: 47%" verbatim — and any figure shown to the model but absent
 * from the evidence set is a false positive by construction: the model is
 * punished for using what it was handed.
 *
 * Sharing this function is the point. Two independent regexes drifting apart is
 * exactly how a number becomes registerable-but-unverifiable, or vice versa.
 */
export function extractNumericTokens(text: string): string[] {
  return scanNumericTokens(text).map((f) => f.token);
}

/** One scanned numeric token and the offset of its first character. */
interface ScannedToken {
  at: number;
  token: string;
}

function scanNumericTokens(text: string): ScannedToken[] {
  // Both scanners run over the whole string, then the results are merged back
  // into READING ORDER. Order matters because a caller registering the figures
  // it showed the model compares these lists positionally in review, and a
  // reader debugging `unmatched_tokens` expects them in the order they appear.
  const found: ScannedToken[] = [];

  for (const match of text.matchAll(NUMERIC_RE)) {
    if (match[1]) found.push({ at: match.index + match[0].indexOf(match[1]), token: match[1] });
  }
  for (const match of text.matchAll(FRACTION_RE)) {
    const [numerator, denominator] = [match[1], match[2]];
    if (!numerator || !denominator) continue;
    const start = match.index + match[0].indexOf(numerator);
    found.push({ at: start, token: numerator });
    found.push({ at: start + numerator.length + 1, token: denominator });
  }

  return found.sort((a, b) => a.at - b.at);
}

/**
 * Universally-safe tokens: 0, 100, 1, single digits inside common phrases
 * like "1 stroke" / "2 strokes" — these aren't claims about data.
 *
 * Exported so claim-validator.ts's `uncited_number` check (the typed
 * validator's own vacuous-pass guard) judges prose by the same safe list
 * this scanner does — two independently-maintained safe lists is how a
 * token becomes flaggable by one gate and not the other.
 */
export const SAFE_NUMERIC_TOKENS = new Set(['0', '1', '2', '3', '100']);

export function verifyCitations(text: string, evidence: EvidenceClaim[]): CitationVerification {
  // Opt-in by evidence shape: a caller that registers fielded evidence
  // (every entry keyed `cite.<field>`) gets the field-aware audit. Every
  // other caller keeps the field-blind set match below, byte-for-byte.
  if (isFieldedEvidence(evidence)) return verifyFieldedCitations(text, evidence);

  const allowedValues = new Set(evidence.map((e) => normalize(String(e.value))));

  const unmatched: string[] = [];
  for (const tok of extractNumericTokens(text)) {
    const normalized = normalize(tok);
    if (!allowedValues.has(normalized)) {
      unmatched.push(tok);
    }
  }

  const trulyUnmatched = unmatched.filter((t) => !SAFE_NUMERIC_TOKENS.has(normalize(t)));

  return {
    verified: trulyUnmatched.length === 0,
    unmatched_tokens: trulyUnmatched,
  };
}

/**
 * Strip trailing %, unit suffixes, and trailing ".0..." so a value like
 * "28 ft" or "1.4 strokes" normalizes to the bare number the extraction
 * regex pulls out of free text.
 *
 * Exported so claim-validator.ts's `uncited_number` check can compare a
 * prose-extracted token against an accepted claim's numeric value using
 * this exact same normalization — a second normalizer drifting from this
 * one is exactly how a number becomes flaggable by one gate and not the
 * other.
 */
export function normalize(s: string): string {
  // Strip trailing %, unit suffixes (ft/yd/strokes/etc.), and trailing
  // ".0..." so evidence values like "28 ft" or "1.4 strokes" normalize
  // down to the bare number the text-extraction regex pulls out.
  return s
    .trim()
    .replace(/%$/, '')
    .replace(/\s*(ft|yd|yards|feet|inches|in|m|cm|mph|kph|strokes?)$/i, '')
    .replace(/\.0+$/, '')
    .toLowerCase();
}

// ---------------------------------------------------------------------------
// Field-aware audit (CoachHelm deep audit row 40a).
//
// The set match above is field-blind: "31 fairways" passes whenever 31 is ANY
// evidence value, e.g. the putt count. A caller that knows which stat each
// figure belongs to registers it under a fielded key (`cite.putts`,
// `cite.gir_pct`, ...). When EVERY evidence entry is fielded, each number in
// the text is bound to the stat its surrounding words name and checked
// against that stat's values only.
//
// Binding (per token, in this order):
//   1. The words AFTER the number ("31 putts", "50% of greens",
//      "38 on the front"): the earliest cue within the next few words wins.
//   2. The words BEFORE it ("GIR 50%", "carded a 74", "season best of 70"):
//      the nearest cue wins. A noun that normally FOLLOWS a number (putts,
//      fairways, greens) binds from the left only when directly adjacent, so
//      "30 putts and 74" does not bind 74 to putts.
//   The search never crosses clause punctuation (, ; : . ! ? parentheses,
//   dashes) or another number.
//
// Restricted rule for a number with NO recognizable cue — nothing names its
// slot, so it can only pass where a bare figure reads unambiguously:
//   - the universally-safe small counts (SAFE_NUMERIC_TOKENS) pass, as before;
//   - a negative number ("(-2)") must equal the signed to-par;
//   - a percentage (or a number followed by "percent") must equal one of the
//     percentage stats (fairways_pct, gir_pct); either reading is then true;
//   - any other number must equal the score ("Caden's 74 at Pinehurst") or
//     a figure inside a name the prompt showed (`label_figure`, "No. 4").
//   Everything else is rejected. A cued safe token ("1 under par") is checked
//   against its stat like any other number.
//
// Known limits: spelled-out numbers ("three over") and tokens the shared
// scanner never extracts ("+2", "18-hole", "9th") are not audited; direction
// words are checked only for season-average comparisons ("strokes better" vs
// "strokes worse"), and assume the player or the score is the subject ("his
// average is 2 strokes worse" would read backwards).
// ---------------------------------------------------------------------------

export const CITATION_FIELDS = [
  'score',
  'to_par',
  'holes',
  'putts',
  'fairways_pct',
  'gir_pct',
  'front_nine',
  'back_nine',
  'season_avg',
  'season_best',
  /** |score - season average| when the score is BELOW the average. */
  'season_avg_below',
  /** |score - season average| when the score is ABOVE the average. */
  'season_avg_above',
  /** A figure inside a NAME the prompt showed ("Pinehurst No. 4"). Accepted
   *  only for a bare number; it never satisfies a stat cue. */
  'label_figure',
] as const;

export type CitationField = (typeof CITATION_FIELDS)[number];

const FIELDED_PREFIX = 'cite.';
const CITATION_FIELD_SET = new Set<string>(CITATION_FIELDS);
const PERCENT_FIELDS: CitationField[] = ['fairways_pct', 'gir_pct'];

/** The evidence key a fielded caller registers a value under. */
export function citationField(field: CitationField): string {
  return `${FIELDED_PREFIX}${field}`;
}

function fieldOf(claim: EvidenceClaim): CitationField | null {
  if (!claim.field.startsWith(FIELDED_PREFIX)) return null;
  const name = claim.field.slice(FIELDED_PREFIX.length);
  return CITATION_FIELD_SET.has(name) ? (name as CitationField) : null;
}

/**
 * True when every entry is keyed `cite.<known field>`. Mixed or bare-named
 * evidence (round-review's `gir_pct`, hero-narrative's `metric_label`,
 * practice-rx's `goal_id`, `buildRecapEvidence`'s `recap_fact_figure`) stays
 * on the legacy field-blind match.
 */
export function isFieldedEvidence(evidence: EvidenceClaim[]): boolean {
  return evidence.length > 0 && evidence.every((e) => fieldOf(e) !== null);
}

interface Cue {
  field: CitationField;
  /** Lower-case words; hyphens in the text are read as spaces. */
  words: string[];
  /** Right side: the cue must START within this many words of the number. */
  maxDistance: number;
  /** Right side only: reject when the cue is the whole window and a number
   *  follows it directly ("74 over 18 holes" is not to-par). */
  notBeforeNumber?: boolean;
}

function cues(field: CitationField, phrases: string[], maxDistance: number, notBeforeNumber?: boolean): Cue[] {
  return phrases.map((p) => ({ field, words: p.split(' '), maxDistance, notBeforeNumber }));
}

/** Cues read AFTER the number. */
const RIGHT_CUES: Cue[] = [
  // "31 strokes on the greens" is a putt count; must beat the 'greens' cue.
  ...cues('putts', ['strokes on the greens', 'strokes on the green', 'on the greens'], 0),
  ...cues('putts', ['putts', 'putt'], 2),
  ...cues('fairways_pct', ['fairways', 'fairway', 'accuracy off the tee', 'off the tee', 'fairway accuracy', 'driving accuracy'], 3),
  ...cues('gir_pct', ['greens', 'green', 'gir', 'greens in regulation', 'regulation'], 3),
  ...cues('holes', ['holes', 'hole'], 1),
  ...cues('front_nine', ['on the front', 'front nine', 'front side', 'going out', 'on the way out', 'out'], 1),
  ...cues('back_nine', ['on the back', 'back nine', 'back side', 'coming home', 'coming in', 'home'], 1),
  ...cues('to_par', ['over par', 'under par'], 0),
  ...cues('to_par', ['over', 'under'], 0, true),
  ...cues('score', ['on the card'], 0),
  ...cues('season_avg', ['scoring average', 'season average', 'seasonal average', 'average'], 1),
  ...cues('season_best', ['season best', 'personal best', 'best'], 1),
  ...['strokes', 'stroke', 'shots', 'shot'].flatMap((unit) => [
    ...cues('season_avg_below', ['better', 'below', 'under', 'ahead of', 'off', 'lower than', 'fewer than'].map((d) => `${unit} ${d}`), 0),
    ...cues('season_avg_above', ['worse', 'above', 'over', 'behind', 'higher than', 'more than'].map((d) => `${unit} ${d}`), 0),
  ]),
];

/** Cues read BEFORE the number, anywhere in the window. */
const LEFT_CUES: Cue[] = [
  ...cues('score', ['carded', 'carding', 'cards', 'shot', 'shooting', 'shoots', 'posted', 'posting', 'posts', 'signed for', 'fired', 'firing', 'score of', 'scored', 'finished at', 'total of', 'round of'], 4),
  // "putting held steady at 32 strokes", "the putter's 31 strokes"
  ...cues('putts', ['putting', 'putter', 'flatstick', 'putter s'], 4),
  ...cues('fairways_pct', ['fairway accuracy', 'driving accuracy', 'accuracy', 'fairways hit', 'fir'], 4),
  ...cues('gir_pct', ['greens in regulation', 'gir', 'gir rate'], 4),
  ...cues('front_nine', ['front nine', 'front side', 'front', 'out in', 'opening nine'], 4),
  ...cues('back_nine', ['back nine', 'back side', 'back', 'home in', 'closing nine', 'inward nine'], 4),
  ...cues('season_avg', ['average', 'scoring average', 'season average', 'seasonal average', 'avg'], 4),
  ...cues('season_best', ['best', 'season best', 'personal best', 'best round', 'season low', 'low'], 4),
];

/** Nouns that normally follow a number; from the left they bind only when adjacent. */
const LEFT_ADJACENT_CUES: Cue[] = [
  ...cues('putts', ['putts'], 0),
  ...cues('fairways_pct', ['fairways'], 0),
  ...cues('gir_pct', ['greens'], 0),
];

/** Clause punctuation a cue search never crosses. A period is a stop unless it
 *  is a decimal point. */
const CLAUSE_STOP_RE = /[,;:!?()[\]—–]|\.(?!\d)|\s-\s/g;
const WORD_RE = /[a-z]+|\d[\d.,%/]*/g;

/** Rewrites "front 9" / "back 9" (and first/last/closing/opening 9) so the
 *  digit that NAMES a nine is not scanned as a cited figure. Same length, so
 *  scanner offsets stay valid. */
const NINE_NAME_RE = /\b(front|back|first|last|final|closing|opening|other)(\s+)9\b/gi;

interface Window {
  words: string[];
  /** Right side: the window was cut short by a number. */
  cutByNumber: boolean;
}

function toWords(segment: string): { words: string[]; cutAt: number | null } {
  const words: string[] = [];
  const lower = segment.toLowerCase().replace(/-/g, ' ');
  for (const m of lower.matchAll(WORD_RE)) {
    if (/^\d/.test(m[0])) return { words, cutAt: words.length };
    words.push(m[0]);
  }
  return { words, cutAt: null };
}

/**
 * A verb after the number starts a new predicate: "collapse to 39 suggests
 * that fairway accuracy..." is about 39, not fairways. The right-hand search
 * stops at one (found in the production replay).
 */
const RIGHT_VERB_STOPS = new Set([
  'suggests', 'suggest', 'remains', 'remain', 'will', 'would', 'kept', 'keeps', 'lifted', 'exposed',
  'cost', 'costs', 'marked', 'matched', 'was', 'is', 'were', 'are', 'needs', 'need', 'made', 'carried',
  'salvaged', 'rescued', 'shows', 'showed', 'points', 'means',
  // Conjunctions start a new clause the same way.
  'while', 'but', 'yet', 'though', 'although', 'whereas',
]);

function rightWindow(text: string, from: number): Window {
  const rest = text.slice(from);
  CLAUSE_STOP_RE.lastIndex = 0;
  const stop = CLAUSE_STOP_RE.exec(rest);
  const segment = stop ? rest.slice(0, stop.index) : rest;
  const { words, cutAt } = toWords(segment);
  const verbAt = words.findIndex((w) => RIGHT_VERB_STOPS.has(w));
  if (verbAt !== -1) return { words: words.slice(0, verbAt), cutByNumber: false };
  return { words, cutByNumber: cutAt !== null };
}

function leftWindow(text: string, to: number): string[] {
  const before = text.slice(0, to);
  let start = 0;
  for (const m of before.matchAll(CLAUSE_STOP_RE)) start = m.index + m[0].length;
  const segment = before.slice(start);
  // Keep only the words after the LAST number in the segment.
  const lower = segment.toLowerCase().replace(/-/g, ' ');
  let words: string[] = [];
  for (const m of lower.matchAll(WORD_RE)) {
    if (/^\d/.test(m[0])) words = [];
    else words.push(m[0]);
  }
  return words;
}

function phraseAt(words: string[], i: number, phrase: string[]): boolean {
  if (i < 0 || i + phrase.length > words.length) return false;
  return phrase.every((w, k) => words[i + k] === w);
}

function bindRight(win: Window): CitationField | null {
  let best: { start: number; len: number; field: CitationField } | null = null;
  for (const cue of RIGHT_CUES) {
    for (let i = 0; i <= Math.min(cue.maxDistance, win.words.length - 1); i++) {
      if (!phraseAt(win.words, i, cue.words)) continue;
      if (cue.notBeforeNumber && win.cutByNumber && i + cue.words.length === win.words.length) continue;
      if (!best || i < best.start || (i === best.start && cue.words.length > best.len)) {
        best = { start: i, len: cue.words.length, field: cue.field };
      }
      break;
    }
  }
  return best?.field ?? null;
}

function bindLeft(words: string[]): CitationField | null {
  const n = words.length;
  let best: { end: number; len: number; field: CitationField } | null = null;
  const consider = (cue: Cue, window: number) => {
    // `end` = index of the cue's last word; nearer the number is better.
    for (let end = n - 1; end >= Math.max(0, n - 1 - window); end--) {
      if (!phraseAt(words, end - cue.words.length + 1, cue.words)) continue;
      if (!best || end > best.end || (end === best.end && cue.words.length > best.len)) {
        best = { end, len: cue.words.length, field: cue.field };
      }
      return;
    }
  };
  for (const cue of LEFT_CUES) consider(cue, cue.maxDistance - 1);
  for (const cue of LEFT_ADJACENT_CUES) consider(cue, 0);
  return (best as { field: CitationField } | null)?.field ?? null;
}

const NINE_MENTION_RE = /\b(nine|nines|front|back|side|turn)\b/i;

/** The sentence containing offset `at` (a period followed by a digit is a
 *  decimal point, not a sentence end). */
function sentenceAround(text: string, at: number): string {
  const ends = /[.!?](?!\d)/g;
  let start = 0;
  let end = text.length;
  for (const m of text.matchAll(ends)) {
    if (m.index < at) start = m.index + 1;
    else {
      end = m.index;
      break;
    }
  }
  return text.slice(start, end);
}

function verifyFieldedCitations(text: string, evidence: EvidenceClaim[]): CitationVerification {
  const valuesByField = new Map<CitationField, Set<string>>();
  for (const claim of evidence) {
    const field = fieldOf(claim);
    if (!field) continue;
    const set = valuesByField.get(field) ?? new Set<string>();
    set.add(normalize(String(claim.value)));
    valuesByField.set(field, set);
  }
  const has = (field: CitationField, value: string) => valuesByField.get(field)?.has(value) ?? false;

  const scanned = text.replace(NINE_NAME_RE, (_m, word: string, gap: string) => `${word}${gap}N`);

  const unmatched: string[] = [];
  const mismatched: Array<{ token: string; bound_to: CitationField | null }> = [];

  for (const { at, token } of scanNumericTokens(scanned)) {
    const end = at + token.length;
    const value = normalize(token);
    const right = rightWindow(scanned, end);
    const field = bindRight(right) ?? bindLeft(leftWindow(scanned, at));

    let ok: boolean;
    if (field) {
      ok = has(field, value);
    } else if (SAFE_NUMERIC_TOKENS.has(value)) {
      ok = true;
    } else if (value.startsWith('-')) {
      ok = has('to_par', value);
    } else if (token.endsWith('%') || right.words[0] === 'percent') {
      ok = PERCENT_FIELDS.some((f) => has(f, value));
    } else {
      ok = has('score', value) || has('label_figure', value);
    }

    // A sentence about a nine ("back nine where he carded 31", "his second
    // nine, a 36") uses score verbs for the nine's score. When the sentence
    // names a nine, a score-bound or uncued figure may equal either nine.
    if (!ok && (field === 'score' || field === null) && NINE_MENTION_RE.test(sentenceAround(scanned, at))) {
      ok = has('front_nine', value) || has('back_nine', value);
    }

    if (!ok) {
      unmatched.push(token);
      mismatched.push({ token, bound_to: field });
    }
  }

  return {
    verified: unmatched.length === 0,
    unmatched_tokens: unmatched,
    mismatched_fields: mismatched,
  };
}

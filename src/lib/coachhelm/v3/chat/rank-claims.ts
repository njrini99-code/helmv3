import { familyOf, METRIC_CUES, type AuditPlayer, type Measurement, type MetricFamily, type UnsupportedClaim } from './provenance';

/**
 * Place and superlative claims ("7th of 7", "the weakest on the team"), checked by sorting.
 *
 * The numeric audit never sees these: a place is a small integer, which it exempts as a count of rounds or weeks. So a model that
 * trusted a `place_percent` field, or counted wrongly, could tell a coach a player was last on the team while the same read showed a
 * teammate below them (staging, 2026-11-08: "7th of the 7 players, the weakest on the team" beside Ethan at -4.40 under Owen at -4.16).
 *
 * The check recomputes the place from the per-player values of the metric the sentence is about, and never trusts a place field. It is
 * one-sided, as the rest of the audit is: a claim is flagged only when ALL of these hold, and passes on any doubt.
 *   - the sentence (or, for a pronoun sentence, the nearest sentence before it in the paragraph) names exactly one roster player;
 *   - the sentence or the one before it cues exactly one metric family, and this turn's reads hold at least three players' values of a
 *     metric of that family in one set (one metric id; each player once, or once per window);
 *   - the named player is in that set;
 *   - and the claim disagrees with that set for EVERY such set: a place that is neither the player's place best-first nor worst-first
 *     (ties count as every place they span), or a superlative the player is not at the end of (best and worst follow the metric's
 *     direction; lowest and highest are by value).
 * A place claimed "of M" is compared only when M is the number of players in the set.
 */

const WORDS: Record<string, number> = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NUM = String.raw`(\d{1,2}|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve)`;
const PLACE_ORDINAL = new RegExp(String.raw`\b(\d{1,2})(?:st|nd|rd|th)\s+(?:of|out of|among)\s+(?:the\s+|all\s+|our\s+|your\s+)?${NUM}\b`, 'gi');
const PLACE_RANKED = new RegExp(String.raw`\b(?:rank(?:s|ed|ing)?|place[sd]?|sits?|sitting|comes?)\s+(?:#|number\s+|no\.\s*)?(\d{1,2})\s+(?:of|out of|among)\s+(?:the\s+|all\s+|our\s+|your\s+)?${NUM}\b`, 'gi');
const TAIL = String.raw`\s+(?:on|of|in|among|within)\s+(?:the\s+|your\s+|this\s+|our\s+)?(?:team|roster|squad|group|${NUM}\s+players|players)\b`;
const ORD = String.raw`(second|third|fourth|fifth|2nd|3rd|4th|5th)`;
/** "weakest", "second-lowest", "third-best" on the team: group 1 the optional ordinal, 2 the superlative, 3 the words between it and the group. */
const SUPERLATIVE = new RegExp(String.raw`\b(?:${ORD}[- ])?(weakest|worst|lowest|bottom|last|strongest|best|highest|top|first)\b((?:\s+[\p{L}'-]+){0,3}?)${TAIL}`, 'giu');
/** "next-to-last", "second from the bottom", "third from the top" on the team: group 1 the ordinal, 2 which end, 3 the words between. */
const FROM_END = new RegExp(String.raw`\b(?:${ORD}|next)[- ](?:to[- ](last)|from (?:the )?(bottom|last|end|top|front))\b((?:\s+[\p{L}'-]+){0,3}?)${TAIL}`, 'giu');
/** A noun between the superlative and "on the team" that makes it about something other than the player ("his best round on the team"). */
const NOT_ABOUT_THE_PLAYER = /\b(?:rounds?|scores?|holes?|days?|games?|finish(?:es)?|shots?|weeks?|starts?|events?|tournaments?|qualifiers?)\b/i;

/** A negation straight before a superlative: "not the highest", "isn't the best", "never the worst". */
const NEGATED = /(?:\bnot|n['’]t|\bnever|\bnor)\s+(?:quite\s+|necessarily\s+|even\s+|always\s+)?(?:the\s+|a\s+)?$/i;

type Worst = 'worst' | 'best' | 'lowest' | 'highest';
const ORDINAL_K: Record<string, number> = { next: 2, second: 2, '2nd': 2, third: 3, '3rd': 3, fourth: 4, '4th': 4, fifth: 5, '5th': 5 };
const SUPERLATIVE_KIND: Record<string, Worst> = { weakest: 'worst', worst: 'worst', bottom: 'worst', last: 'worst', strongest: 'best', best: 'best', top: 'best', first: 'best', lowest: 'lowest', highest: 'highest' };

const MIN_SET = 3;
const wordOrNumber = (s: string | undefined): number | null => (s === undefined ? null : /^\d+$/.test(s) ? Number(s) : (WORDS[s.toLowerCase()] ?? null));

/** Sentences of a paragraph, without a regex lookbehind (this module is bundled for the iOS WebView). */
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

const escapeRegExp = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

function nameHits(sentence: string, people: readonly AuditPlayer[], token: (p: AuditPlayer) => Array<string | null | undefined>): Set<string> {
  const ids = new Set<string>();
  for (const p of people) {
    for (const t of token(p)) {
      const name = t?.trim();
      if (!name || name.length < 2 || !/^\p{Lu}/u.test(name)) continue;
      if (new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'u').test(sentence)) ids.add(p.id);
    }
  }
  return ids;
}

/** The players a sentence names: full names win over a shared first or last name. */
export function playersNamed(sentence: string, people: readonly AuditPlayer[]): Set<string> {
  const full = nameHits(sentence, people, (p) => [p.name]);
  if (full.size > 0) return full;
  return nameHits(sentence, people, (p) => {
    const parts = p.name.trim().split(/\s+/);
    return [p.first_name ?? parts[0], p.last_name ?? (parts.length > 1 ? parts[parts.length - 1] : null)];
  });
}

/** The one metric family a sentence cues, or null when it cues none or several that are not parent and child. */
function familyIn(sentence: string): MetricFamily | null {
  const found = new Set<MetricFamily>();
  for (const [re, family] of METRIC_CUES) if (sentence.match(re)) found.add(family);
  if (found.size > 1 && found.has('sg')) found.delete('sg');
  return found.size === 1 ? [...found][0]! : null;
}

interface PlayerSet {
  metric_id: string;
  direction: Measurement['direction'];
  values: Map<string, number>;
}

/**
 * The sets of per-player values of one metric family the turn's reads hold: one per read and metric id, each player once (a repeat of
 * the same figure is one figure; a player with two different values in one read makes it not a ranking, and it is left out).
 * `reads` are the measurement lists of the turn's reads, one list each; a caller without them passes the lot as one list.
 */
function setsFor(reads: ReadonlyArray<readonly Measurement[]>, family: MetricFamily): PlayerSet[] {
  const sets: PlayerSet[] = [];
  for (const measurements of reads) {
    const byMetric = new Map<string, Measurement[]>();
    for (const m of measurements) {
      if (m.entity.kind !== 'player' || m.value === null) continue;
      const f = familyOf(m.metric_id);
      // A generic "strokes gained" sentence is about any of the strokes-gained areas (their parent family).
      if (f.family !== family && f.parent !== family) continue;
      byMetric.set(m.metric_id, [...(byMetric.get(m.metric_id) ?? []), m]);
    }
    for (const [metric_id, list] of byMetric) {
      const values = new Map<string, number>();
      let conflict = false;
      for (const m of list) {
        const seen = values.get(m.entity.id);
        if (seen !== undefined && seen !== m.value) conflict = true;
        values.set(m.entity.id, m.value as number);
      }
      if (conflict || values.size < MIN_SET) continue;
      sets.push({ metric_id, direction: list.find((m) => m.direction)?.direction ?? null, values });
    }
  }
  return sets;
}

/** The places a value spans when the set is ordered high to low and when it is ordered low to high (ties span every place they take). */
function placeRanges(set: PlayerSet, id: string): Array<[number, number]> {
  const mine = set.values.get(id);
  if (mine === undefined) return [];
  const values = [...set.values.values()];
  const tied = values.filter((v) => v === mine).length;
  const above = values.filter((v) => v > mine).length;
  const below = values.filter((v) => v < mine).length;
  return [[above + 1, above + tied], [below + 1, below + tied]];
}

export interface RankClaim {
  text: string;
  kind: 'place' | 'superlative';
  /** Place claims: the place and the group size claimed. */
  place?: number;
  of?: number | null;
  /** Superlatives: which end. */
  end?: Worst;
  /** Superlatives counted from an end: 2 for "second-lowest" or "next-to-last" (1 when not said). */
  k?: number;
}

/** The place and superlative claims in one sentence. */
export function rankClaimsIn(sentence: string): RankClaim[] {
  const out: RankClaim[] = [];
  for (const re of [PLACE_ORDINAL, PLACE_RANKED]) {
    for (const m of sentence.matchAll(re)) {
      const place = Number(m[1]);
      if (place >= 1) out.push({ text: m[0], kind: 'place', place, of: wordOrNumber(m[2]) });
    }
  }
  const plain = (words: string | undefined) => NOT_ABOUT_THE_PLAYER.test((words ?? '').replace(/\b(?:per|a|each)\s+(?:round|day|hole|week)s?\b/gi, ''));
  for (const m of sentence.matchAll(SUPERLATIVE)) {
    if (plain(m[3])) continue;
    if (NEGATED.test(sentence.slice(Math.max(0, (m.index ?? 0) - 24), m.index ?? 0))) continue; // "not the highest on the team" says where he is not
    // "second from the top" and "next-to-last" are the from-end forms below, not a plain top or last.
    if (/(?:from\s+(?:the\s+)?|to[- ])$/i.test(sentence.slice(0, m.index ?? 0))) continue;
    const end = SUPERLATIVE_KIND[(m[2] ?? '').toLowerCase()];
    if (end) out.push({ text: m[0], kind: 'superlative', end, k: m[1] ? ORDINAL_K[m[1].toLowerCase()] : 1 });
  }
  for (const m of sentence.matchAll(FROM_END)) {
    if (plain(m[4])) continue;
    const word = (m[1] ?? 'next').toLowerCase();
    const from = (m[2] ?? m[3] ?? '').toLowerCase();
    out.push({ text: m[0], kind: 'superlative', end: from === 'top' || from === 'front' ? 'best' : 'worst', k: ORDINAL_K[word] ?? 2 });
  }
  return out;
}

function agrees(claim: RankClaim, set: PlayerSet, id: string): boolean {
  const values = [...set.values.values()];
  const mine = set.values.get(id);
  if (mine === undefined) return true; // not in this set: it says nothing about the claim
  if (claim.kind === 'place') {
    if (claim.of !== null && claim.of !== undefined && claim.of !== values.length) return true; // another group: not comparable
    // Either orientation: whether 1st is the best or the worst is the wording's to say, and the superlative check holds it to that.
    const n = claim.place as number;
    return placeRanges(set, id).some(([from, to]) => n >= from && n <= to);
  }
  const k = claim.k ?? 1;
  const below = values.filter((v) => v < mine).length;
  const above = values.filter((v) => v > mine).length;
  const tied = values.filter((v) => v === mine).length;
  const fromLow = k >= below + 1 && k <= below + tied;
  const fromHigh = k >= above + 1 && k <= above + tied;
  switch (claim.end) {
    case 'lowest':
      return fromLow;
    case 'highest':
      return fromHigh;
    default: {
      if (!set.direction) return true;
      const wantsHigh = (claim.end === 'best') === (set.direction === 'higher_better');
      return wantsHigh ? fromHigh : fromLow;
    }
  }
}

/**
 * The place and superlative claims of an answer that this turn's per-player reads contradict. Pure; abstains (returns nothing for a
 * claim) whenever the text or the evidence leaves the player, the metric or the set in doubt.
 */
export function auditRankClaims(text: string, reads: ReadonlyArray<readonly Measurement[]>, players: readonly AuditPlayer[]): UnsupportedClaim[] {
  if (!text || players.length === 0 || reads.every((r) => r.length === 0)) return [];
  const flagged: UnsupportedClaim[] = [];
  for (const paragraph of text.split(/\n\s*\n/)) {
    const sentences = sentencesOf(paragraph);
    for (const [i, sentence] of sentences.entries()) {
      const claims = rankClaimsIn(sentence);
      if (claims.length === 0) continue;
      // Who: the sentence's one player, else (a pronoun sentence) the nearest earlier sentence's one player.
      let named = playersNamed(sentence, players);
      for (let back = 1; named.size === 0 && back <= 3 && i - back >= 0; back += 1) named = playersNamed(sentences[i - back] as string, players);
      if (named.size !== 1) continue;
      const id = [...named][0] as string;
      // What: the sentence's metric family, else the one before it.
      const family = familyIn(sentence) ?? (i > 0 ? familyIn(sentences[i - 1] as string) : null);
      if (!family) continue;
      const sets = setsFor(reads, family).filter((s) => s.values.has(id));
      if (sets.length === 0) continue;
      for (const claim of claims) {
        if (sets.some((s) => agrees(claim, s, id))) continue;
        flagged.push({ text: claim.text.trim(), value: claim.place ?? 0, misattributed: true });
      }
    }
  }
  return flagged;
}

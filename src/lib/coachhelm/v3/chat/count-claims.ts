import { collectEnvelopeNumbers, collectScopedNumbers, type AuditPlayer, type ScopedNumber, type ToolEnvelope, type UnsupportedClaim } from './provenance';

/**
 * Counts of things ("12 qualifier rounds", "Four Pebble Beach practice rounds", "5 goals"), checked in a coach turn that carries citations.
 *
 * The numeric audit skips every integer up to 12 as incidental ("in 2 weeks", "top 3"), so a count the model made while writing, a mental
 * tally of rows, was never looked at (staging 9c9c279d: 12 where the read had 14, four where it had three). A count of three or more of
 * a counted thing is a figure (a count of the roster's players, up to its size, is the roster's own arithmetic and is left alone). It passes when a verified cite stands for it, or when it is a count some read states: the rows it returned, a
 * list's length, a stated count or status count, the roster, the players or rounds a read measured, a number in its summary. Anything else is a
 * tally the server never saw, and the answer is withheld. Counts of one or two stay unaudited, as does a window ("his last 5 rounds").
 */
const WORDS: Record<string, number> = { three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12 };
const NOUN = String.raw`(?:rounds?|players?|goals?|events?|sessions?|tasks?|practices|tournaments?|qualifiers?|trips?|meetings?|entries|rows|drills?|matches|competitions?)`;
const COUNT = new RegExp(String.raw`(^|[^\p{L}\p{N}.-])(\d{1,2}|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s+((?:[\p{L}'’-]+\s+){0,3}?)(${NOUN})\b`, 'giu');
/** What precedes a number that is a window or a position, not a tally: "his last 5 rounds", "the next 3 events", "top 5 players". */
const WINDOW_BEFORE = /\b(?:last|past|previous|recent|latest|next|first|final|top|bottom|every|each|over|across|within|through|following|prior)\s+(?:(?:the|his|her|their|your|these|those)\s+)?$/i;
/** A descriptor that makes it a different kind of number ("3 under par rounds", "a 5 round average"). */
const NOT_A_TALLY = /\b(?:per|average|under|over|par|minute|hour|week|day|month|year|round[- ]average)\b/i;

/** Words that break a count from the noun after it ("six may have goals", "six of the seven players"). */
const FUNCTION_WORDS = /\b(?:may|might|have|has|had|are|is|were|was|will|can|could|did|do|does|from|who|that|which|for|by|but|and|or|so|with|without)\b/i;
const KEYS = /(?:^|_)counts?$|^(?:row_count|rows_used|matching_rows|total_rows|rows_returned|n|sample_size|total|rounds_recorded|rounds_played|rounds_averaged|players_with_rounds|players_compared|team_peers_compared|events_counted|attended|absent|excused)$/;

/** The rows a `query_team_data` read returned and how many carry each value of a field with few values (14 qualifier, 3 practice). Not what is left when one is taken out. */
function categoryCounts(detail: unknown): number[] {
  const d = detail as { kind?: unknown; rows?: unknown } | null | undefined;
  if (!d || d.kind !== 'team_data' || !Array.isArray(d.rows) || d.rows.length === 0) return [];
  const rows = d.rows.filter((r): r is Record<string, unknown> => !!r && typeof r === 'object');
  const out = [rows.length];
  for (const field of new Set(rows.flatMap((r) => Object.keys(r)))) {
    if (/(^id$|_id$|_date$)/.test(field)) continue;
    const counts = new Map<string, number>();
    for (const r of rows) if (typeof r[field] === 'string' && r[field] !== '') counts.set(r[field] as string, (counts.get(r[field] as string) ?? 0) + 1);
    if (counts.size > 0 && counts.size <= 8) out.push(...counts.values());
  }
  return out;
}

/** Every count a turn's reads state, plus the roster's size. */
export function statedCounts(evidence: Iterable<ToolEnvelope>, roster: readonly AuditPlayer[], extra: ReadonlyArray<number | ScopedNumber> = []): Set<number> {
  const out = new Set<number>();
  // Numbers the caller already holds from reads that are not in the evidence map (an action's proposal or receipt): a bare number, or one from the tool's own words (a keyed row count is read from the evidence itself, where the rows left when one value is taken out are not counted).
  for (const n of extra) {
    if (typeof n === 'number') out.add(n);
    else if (n && typeof n.value === 'number' && !n.reference && n.metric_key === null) out.add(n.value);
  }
  if (roster.length > 0) out.add(roster.length);
  const lengths = (v: unknown, depth: number) => {
    if (depth > 4 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      if (v.length >= 2) out.add(v.length);
      for (const x of v.slice(0, 200)) lengths(x, depth + 1);
      return;
    }
    for (const x of Object.values(v as Record<string, unknown>)) lengths(x, depth + 1);
  };
  for (const env of evidence) {
    const players = new Set<string>();
    const measured = new Set<string>();
    let withValue = 0;
    for (const m of env.measurements) {
      if (m.entity.kind === 'player') players.add(m.entity.id);
      if (m.entity.kind === 'player' && m.value !== null) measured.add(m.entity.id);
      if (m.value !== null) withValue += 1;
      for (const n of [m.sample_size, m.denominator]) if (typeof n === 'number' && Number.isFinite(n)) out.add(n);
      if (m.unit === 'count' && typeof m.value === 'number') out.add(m.value);
    }
    for (const n of [players.size, measured.size, env.measurements.length, withValue]) if (n >= 2) out.add(n);
    lengths(env.detail, 0);
    for (const n of collectEnvelopeNumbers({ summary: env.summary, detail: undefined })) out.add(n.value);
    // The tool's own words ("3 sessions of 90 minutes", "2 of 8") state their numbers; so do the fields named for a count.
    for (const n of collectScopedNumbers(env.detail)) if (n.metric_key === null || KEYS.test(n.metric_key)) out.add(n.value);
    for (const n of categoryCounts(env.detail)) out.add(n);
  }
  return out;
}

/** The counts in `text` that no verified cite and no read stands for. */
export function auditCountClaims(text: string, stated: ReadonlySet<number>, citedValues: readonly string[], rosterSize = 0): UnsupportedClaim[] {
  const cited = citedValues.map((c) => Number(c.replace(/[−–]/g, '-').replace(/[%,+]/g, ''))).filter(Number.isFinite);
  const flagged: UnsupportedClaim[] = [];
  const seen = new Set<string>();
  for (const m of text.matchAll(COUNT)) {
    const raw = m[2] as string;
    const at = (m.index ?? 0) + (m[1]?.length ?? 0);
    const n = /^\d+$/.test(raw) ? Number(raw) : (WORDS[raw.toLowerCase()] ?? NaN);
    if (!Number.isFinite(n) || n < 3 || n > 12) continue;
    if (WINDOW_BEFORE.test(text.slice(Math.max(0, at - 24), at))) continue;
    if (NOT_A_TALLY.test(m[3] ?? '') || FUNCTION_WORDS.test(m[3] ?? '')) continue; // a verb or a preposition between the number and the noun: the noun is not what it counts
    // Players: "six of the seven players" is a part of a group the reads state, and "the other six" is what is left of it; both are the roster's
    // own arithmetic (live, 2026-11-08: two true answers withheld). A whole group ("6th of six players") has to be a count some read states.
    if (/^players?$/i.test(m[4] ?? '')) {
      const part = /^of\s+(?:the\s+|your\s+|his\s+|our\s+)?(\d{1,2}|three|four|five|six|seven|eight|nine|ten|eleven|twelve)\s*$/i.exec((m[3] ?? '').trim());
      const whole = part ? (/^\d+$/.test(part[1] as string) ? Number(part[1]) : (WORDS[(part[1] as string).toLowerCase()] ?? NaN)) : NaN;
      if (Number.isFinite(whole) && n < whole && (stated.has(whole) || whole <= rosterSize)) continue;
      if (/\b(?:other|remaining|rest)\s+$/i.test(text.slice(Math.max(0, at - 14), at))) continue;
    }
    if (stated.has(n) || cited.some((c) => Math.abs(Math.abs(c) - n) < 1e-9)) continue;
    if (seen.has(raw)) continue;
    seen.add(raw);
    flagged.push({ text: raw, value: n });
  }
  return flagged;
}

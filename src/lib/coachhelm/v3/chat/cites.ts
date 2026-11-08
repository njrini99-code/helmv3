import { z } from 'zod';
import { auditCountClaims, statedCounts } from './count-claims';
import { auditRowBounds, roundSets } from './row-bounds';
import { auditRankClaims } from './rank-claims';
import { auditNumericClaims, collectNumbers, collectEnvelopeNumbers, collectScopedNumbers, roundingTolerance, teamDataCounts, type AuditDetail, type Measurement, type ScopedNumber, type ToolEnvelope, type UnsupportedClaim } from './provenance';

/**
 * Per-figure citations (structural grounding).
 *
 * The audit used to decide for every number in the answer which player and which metric the surrounding words were about, and to look
 * for an evidence value that fit. Heuristic, and wrong in both directions: it withheld honest answers ("he" bound to the wrong name)
 * and could pass a figure borrowed from the wrong place. The model now says what each figure is. After its prose it appends
 *
 *     <<<CITES>>>[{"v":"-4.16","ref":"e3","key":"sg_approach","subject":"<player id or team>"}]<<<END_CITES>>>
 *
 * naming, for each figure it states, the value as written, the read it came from (this turn's evidence_ref), the measurement or
 * field in that read, and whose it is. The server checks each against that evidence, not against the nearest name. The block is
 * withheld from the stream and never stored, as `<<<CLAIMS>>>` is, so nothing here reaches the coach.
 *
 * Verdicts, per cite:
 *   verified    the read holds `key` for `subject`, and a value of it matches `v` (within the precision it was written to, signed or as a
 *               magnitude: "lost 4.16" is -4.16), in the window if one was given;
 *   mismatch    the read holds `key` for `subject`, and none of its values matches: a figure cited to evidence that says something else.
 *               The turn is withheld;
 *   unresolved  an unknown ref, a key or subject the read does not hold, or a value that is not a number. Nothing is learned from it,
 *               so the figure falls back to the text heuristics. A cite can never make an answer less checked than no cite.
 */

export const CITES_OPEN = '<<<CITES>>>';
export const CITES_CLOSE = '<<<END_CITES>>>';
const BLOCK = /<<<CITES>>>([\s\S]*?)<<<END_CITES>>>/g;

/** A subject is a player id, an unambiguous prefix of one (the first 8 characters), or "team". */
const ObjectCite = z.object({
  v: z.union([z.string().max(40), z.number()]).transform((x) => String(x)),
  ref: z.string().regex(/^e\d+$/),
  key: z.string().min(1).max(120),
  subject: z.string().min(1).max(64),
  /** The window of the evidence, copied from it, when the model gives one: [window_start, window_end]. */
  w: z.tuple([z.string().max(12), z.string().max(12)]).optional(),
  /** 1 when the sentence asserts the figure as a cause. */
  c: z.literal(1).optional(),
});
/**
 * The compact form the model is asked for, one array per figure: [value, ref, key, subject] or [value, ref, key, subject, "c"] for a cause.
 * The object form (with "w") is still read.
 */
export const CiteSchema = z.preprocess((x) => {
  if (!Array.isArray(x)) return x;
  const [v, ref, key, subject, flag] = x as unknown[];
  return { v, ref, key, subject, ...(flag === 'c' ? { c: 1 } : {}) };
}, ObjectCite);
export type Cite = z.infer<typeof ObjectCite>;

export interface ExtractedCites {
  /** The text with every cites block out. An unterminated opener removes everything from it on. */
  text: string;
  cites: Cite[];
  /** Blocks found (complete or not). */
  blocks: number;
  /** Items that did not parse, and blocks that were not a JSON list: counted, never an error. */
  invalid: number;
}

/** Take the cites out of a finished text. Whatever is wrong with a block, the text comes back clean and the answer is audited as if it had no cites. */
export function extractCites(raw: string): ExtractedCites {
  const cites: Cite[] = [];
  let blocks = 0;
  let invalid = 0;
  let text = raw.replace(BLOCK, (_whole, body: string) => {
    blocks += 1;
    try {
      const list: unknown = JSON.parse(body);
      if (!Array.isArray(list)) {
        invalid += 1;
        return '';
      }
      for (const item of list) {
        const parsed = CiteSchema.safeParse(item);
        if (parsed.success) cites.push(parsed.data);
        else invalid += 1;
      }
    } catch {
      invalid += 1;
    }
    return '';
  });
  const open = text.indexOf(CITES_OPEN);
  if (open !== -1) {
    blocks += 1;
    invalid += 1;
    text = text.slice(0, open);
  }
  const withoutCloser = text.split(CITES_CLOSE).join('');
  return { text: blocks > 0 || withoutCloser !== text ? withoutCloser.trimEnd() : text, cites, blocks, invalid };
}

export type CiteStatus = 'verified' | 'mismatch' | 'unresolved';
export interface CiteVerdict {
  cite: Cite;
  status: CiteStatus;
  /** The cited value as a number, when it is one. */
  value: number | null;
  reason?: string;
}

export const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9:]+/g, '_').replace(/^_+|_+$/g, '');

/** A number as written: "-4.16", "−4.16", "61.11%", "+0.5", "1,200". */
export function parseWritten(raw: string): number | null {
  const cleaned = raw.trim().replace(/[−–]/g, '-').replace(/,/g, '').replace(/%$/, '').replace(/^\+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Digits as written, for the precision a figure claims. */
const digitsOf = (raw: string) => raw.trim().replace(/[−–]/g, '-').replace(/[%,+]/g, '');

export const matchesValue = (candidate: number, written: number, raw: string) => {
  const tol = roundingTolerance(digitsOf(raw));
  return Math.abs(candidate - written) <= tol || Math.abs(Math.abs(candidate) - Math.abs(written)) <= tol;
};

type Candidate = { value: number; window: readonly [string | null, string | null] | null };

/** A subject names an id by the whole id or by a prefix of at least 6 characters (the model is given ids to copy, and a short form costs it fewer tokens). */
export const sameSubject = (subject: string, id: string) => id === subject || (subject.length >= 6 && subject !== 'team' && id.startsWith(subject));
const subjectIs = (subject: string, entity: Measurement['entity']) => (subject === 'team' ? entity.kind === 'team' : sameSubject(subject, entity.id));

/** Every number of one measurement a figure in the answer can be: its value, its sample, its denominator, its benchmark and the places beside it. */
function numbersOfMeasurement(m: Measurement & { comparisons?: Array<{ kind?: string; value: number | null; place?: number | null; place_of: number | null; place_percent: number | null }> }): Candidate[] {
  const window = [m.window_start, m.window_end] as const;
  const out: Candidate[] = [];
  const add = (v: unknown) => {
    if (typeof v === 'number' && Number.isFinite(v)) out.push({ value: v, window });
  };
  add(m.value);
  add(m.sample_size);
  add(m.denominator);
  add(m.benchmark?.value);
  if (typeof m.value === 'number' && typeof m.benchmark?.value === 'number') add(m.value - m.benchmark.value);
  for (const c of m.comparisons ?? []) {
    add(c.value);
    add(c.place);
    add(c.place_of);
    add(c.place_percent);
    if (typeof m.value === 'number' && typeof c.value === 'number') add(m.value - c.value);
  }
  return out;
}

/** Objects in a read's detail that name a metric (`metric_id` or `metric_scope`) equal to `key`, with the player they belong to (their own, or an ancestor's). */
function metricRows(detail: unknown, key: string): Array<{ object: Record<string, unknown>; player: string | null }> {
  const out: Array<{ object: Record<string, unknown>; player: string | null }> = [];
  const walk = (v: unknown, player: string | null, depth: number) => {
    if (depth > 6 || !v || typeof v !== 'object') return;
    if (Array.isArray(v)) {
      for (const x of v) walk(x, player, depth + 1);
      return;
    }
    const o = v as Record<string, unknown>;
    const nested = o.player && typeof o.player === 'object' ? (o.player as Record<string, unknown>).player_id : undefined;
    const own = typeof o.player_id === 'string' ? o.player_id : typeof nested === 'string' ? nested : player;
    for (const k of ['metric_id', 'metric_scope'] as const) {
      if (typeof o[k] === 'string' && norm(o[k] as string) === key) {
        out.push({ object: o, player: own });
        return;
      }
    }
    for (const x of Object.values(o)) walk(x, own, depth + 1);
  };
  walk(detail, null, 0);
  return out;
}

/** What a read holds under `key` for `subject`: null when it holds nothing under that key and subject (the cite is unresolved). */
function candidatesFor(cite: Cite, env: ToolEnvelope, anySubject = false): Candidate[] | null {
  const key = norm(cite.key);
  const found: Candidate[] = [];
  let resolved = false;

  for (const m of [...env.measurements]) {
    if (norm(m.metric_id) !== key) continue;
    if (!anySubject && !subjectIs(cite.subject, m.entity)) {
      // The team average a read of the roster's figures states beside them is the team's, whoever's figure it sits on.
      if (cite.subject === 'team') {
        for (const c of m.comparisons ?? []) if (c.kind === 'team' && typeof c.value === 'number') { resolved = true; found.push({ value: c.value, window: null }); }
      }
      continue;
    }
    resolved = true;
    found.push(...numbersOfMeasurement(m));
  }

  const scoped: ScopedNumber[] = [...(env.detail === undefined ? [] : collectScopedNumbers(env.detail)), ...teamDataCounts(env.detail)];
  for (const n of scoped) {
    if (!n.metric_key || norm(n.metric_key) !== key) continue;
    const mine = anySubject || (cite.subject === 'team' ? n.team === true || n.player_id === null : (n.player_id !== null && sameSubject(cite.subject, n.player_id)) || n.player_id === null);
    if (!mine) continue;
    resolved = true;
    found.push({ value: n.value, window: null });
  }

  // The team figure a ranking states in its detail ({ value, window, method, players, rounds }), as the figure of the metric the ranking is of.
  const d = env.detail as { metric_id?: unknown; team_figure?: { value?: unknown } } | null | undefined;
  if ((anySubject || cite.subject === 'team') && typeof d?.metric_id === 'string' && norm(d.metric_id) === key && typeof d.team_figure?.value === 'number') {
    resolved = true;
    found.push({ value: d.team_figure.value, window: null });
  }

  // A row of a read that names its metric (a goal, a benchmark standing row, a gap): "approach_proximity_50_125ft" is the key, and its baseline,
  // current, target, player value and the places beside it are the figures. The model reads the metric off the row, not the field's name.
  for (const row of metricRows(env.detail, key)) {
    if (!anySubject && !(cite.subject === 'team' ? row.player === null : (row.player !== null && sameSubject(cite.subject, row.player)) || row.player === null)) continue;
    resolved = true;
    found.push(...collectNumbers(row.object).map((value) => ({ value, window: null })));
  }

  if (key === 'summary') {
    const fromSummary = collectEnvelopeNumbers({ summary: env.summary, detail: undefined });
    if (fromSummary.length > 0) {
      resolved = true;
      found.push(...fromSummary.map((n) => ({ value: n.value, window: null })));
    }
  }
  return resolved ? found : null;
}

export function verifyCite(cite: Cite, evidence: ReadonlyMap<string, ToolEnvelope>): CiteVerdict {
  const written = parseWritten(cite.v);
  if (written === null) return { cite, status: 'unresolved', value: null, reason: 'not a number' };
  const env = evidence.get(cite.ref);
  if (!env) return { cite, status: 'unresolved', value: written, reason: `no read ${cite.ref} this turn` };
  const candidates = candidatesFor(cite, env);
  if (!candidates) return { cite, status: 'unresolved', value: written, reason: `${cite.ref} holds no ${cite.key} for ${cite.subject}` };
  const valueHits = candidates.filter((c) => matchesValue(c.value, written, cite.v));
  if (valueHits.length === 0) {
    // A figure cited to someone else's value of that key is a misattribution, and withholds the turn. A figure the read holds for nobody under that
    // key is the model's slip in naming where it came from (a "7" cited to the roster count when it is the players with rounds) or an invented
    // figure; the text check decides which, as it would with no cite.
    // Someone else's OWN figure of that key: the reference values beside every player's (the Tour's 0, the team average) belong to all of them.
    const elsewhere = env.measurements.some((m) => norm(m.metric_id) === norm(cite.key) && !subjectIs(cite.subject, m.entity) && typeof m.value === 'number' && matchesValue(m.value, written, cite.v));
    if (elsewhere) return { cite, status: 'mismatch', value: written, reason: `${cite.ref} ${cite.key} holds that figure for someone else, not ${cite.subject}` };
    return { cite, status: 'unresolved', value: written, reason: `${cite.ref} ${cite.key} for ${cite.subject} does not hold ${cite.v}; left to the text check` };
  }
  if (cite.w) {
    // A window is checked only where the evidence has one to check it against.
    const ok = valueHits.some((c) => !c.window || !c.window[0] || !c.window[1] || (c.window[0] === cite.w![0] && c.window[1] === cite.w![1]));
    if (!ok) return { cite, status: 'mismatch', value: written, reason: `${cite.ref} ${cite.key} is over a different window` };
  }
  return { cite, status: 'verified', value: written };
}

export function verifyCites(cites: readonly Cite[], evidence: ReadonlyMap<string, ToolEnvelope>): CiteVerdict[] {
  return cites.map((c) => verifyCite(c, evidence));
}

/** Counts of one turn's citations, for the log and the verdict record: how much of the answer the structural check carried. */
export interface CitationStats {
  /** Numbers the audit examined (dates, years and small counts are not figures). */
  figures: number;
  /** Of those, how many a verified cite stood for. */
  cited: number;
  /** Examined by the text heuristics instead, and passed. */
  fallback_passed: number;
  cites: number;
  verified: number;
  unresolved: number;
  mismatched: number;
  /** Blocks found, and the items in them that did not parse. */
  blocks: number;
  invalid: number;
}

/** A turn's citations and the reads they point at, as the audit takes them. */
export interface CiteInput {
  cites: readonly Cite[];
  evidence: ReadonlyMap<string, ToolEnvelope>;
  /** Blocks found and items that did not parse (`extractCites`), for the counts. */
  blocks?: number;
  invalid?: number;
  /** Names the turn in the development log (a conversation id), where the caller has one. */
  label?: string;
}

type AuditArgs = Parameters<typeof auditNumericClaims>;

/**
 * The audit of one answer with its citations, for a coach's turn and a player's alike: verified figures stand on their own, a cite the
 * read it names contradicts is a misattribution whatever the words around it say, and everything else (no cite, an unresolved one) is
 * audited by the text heuristics exactly as without citations. `citations` is absent when the turn had no citation input at all.
 */
export function auditCited(args: { surface?: 'coach' | 'player'; /** Derived counts ("8 of those") must be cited, not matched against numbers in the reads. Coach turns only. */ strictCounts?: boolean; base: [text: AuditArgs[0], measurements: AuditArgs[1], series: AuditArgs[2], detailNumbers: AuditArgs[3], detailDates: AuditArgs[4], timezone: AuditArgs[5]]; options?: NonNullable<AuditArgs[6]>; cites?: CiteInput }): { unsupported: UnsupportedClaim[]; citations?: CitationStats } {
  const checked = args.cites ? verifyCites(args.cites.cites, args.cites.evidence) : [];
  const verified = checked.filter((c) => c.status === 'verified');
  const mismatched = checked.filter((c) => c.status === 'mismatch');
  let detail: AuditDetail = { unsupported: [], figures: 0, cited: 0, heuristicPassed: 0 };
  const flagged = auditNumericClaims(...args.base, { ...args.options, citedValues: verified.map((c) => c.cite.v), ...(args.strictCounts && args.cites ? { strictSubsetCounts: true } : {}), report: (d) => (detail = d) });
  const citations: CitationStats | undefined = args.cites
    ? {
        figures: detail.figures,
        cited: detail.cited,
        fallback_passed: detail.heuristicPassed,
        cites: checked.length,
        verified: verified.length,
        unresolved: checked.filter((c) => c.status === 'unresolved').length,
        mismatched: mismatched.length,
        blocks: args.cites.blocks ?? (checked.length > 0 ? 1 : 0),
        invalid: args.cites.invalid ?? 0,
      }
    : undefined;
  // In development the counts are printed: the off-prod logger drops `extra`, and how much of an answer the citations carried is what a developer is looking for.
  if (citations && process.env.NODE_ENV === 'development') {
    console.info('[ask:citations]', JSON.stringify({ surface: args.surface ?? 'coach', ...(args.cites?.label ? { turn: args.cites.label } : {}), says: args.base[0].replace(/\s+/g, ' ').slice(0, 60), ...citations }));
    // The cites that did not verify, with why: a mismatch withholds the turn, so a developer needs to see whether the model or the matching was wrong.
    const bad = checked.filter((c) => c.status !== 'verified').map((c) => ({ v: c.cite.v, ref: c.cite.ref, key: c.cite.key, subject: c.cite.subject.slice(0, 8), w: c.cite.w, status: c.status, why: c.reason }));
    // Every cite the model wrote, for the eval capture (the block is withheld from the stream, so a captured turn would replay without it).
    console.info('[ask:cites]', JSON.stringify({ surface: args.surface ?? 'coach', ...(args.cites?.label ? { turn: args.cites.label } : {}), says: args.base[0].replace(/\s+/g, ' ').slice(0, 60), cites: checked.map((c) => (c.cite.c ? [c.cite.v, c.cite.ref, c.cite.key, c.cite.subject, 'c'] : [c.cite.v, c.cite.ref, c.cite.key, c.cite.subject])) }));
    if (bad.length > 0) console.info('[ask:cites-not-verified]', JSON.stringify({ surface: args.surface ?? 'coach', says: args.base[0].replace(/\s+/g, ' ').slice(0, 60), cites: bad }));
  }
  // A cited figure the evidence it names does not hold is a misattribution however the words around it read, even when the text heuristics would have passed it.
  // A place or superlative ("7th of 7", "the weakest on the team") is recomputed from the per-player values the turn read, never from a place field.
  const reads = args.cites ? [...args.cites.evidence.values()].map((e) => e.measurements) : [args.base[1]];
  const ranks = auditRankClaims(args.base[0], reads, args.options?.players ?? []);
  // Counts of things ("12 qualifier rounds") in a coach turn: a tally the model made while writing is withheld unless a read states it or a cite stands for it.
  const counts = args.strictCounts && args.cites ? auditCountClaims(args.base[0], statedCounts(args.cites.evidence.values(), args.options?.players ?? [], args.base[3]), verified.map((c) => c.cite.v), args.options?.players?.length ?? 0) : [];
  // Bounds over a set of rounds ("the other 3 rounds had 31 putts or fewer"): checked against the rows the turn read, flagged only when no read of rounds holds enough rows inside the bound.
  const bounds = args.cites ? auditRowBounds(args.base[0], roundSets(args.cites.evidence.values())) : [];
  const unsupported = [
    ...mismatched.map((c): UnsupportedClaim => ({ text: c.cite.v, value: c.value ?? 0, misattributed: true })),
    ...flagged.filter((u) => !mismatched.some((c) => c.cite.v === u.text)),
    ...ranks,
    ...counts.filter((c) => !flagged.some((u) => u.text === c.text)),
    ...bounds.filter((c) => !flagged.some((u) => u.text === c.text)),
  ];
  return { unsupported, ...(citations ? { citations } : {}) };
}

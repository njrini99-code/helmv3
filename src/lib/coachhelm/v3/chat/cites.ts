import { z } from 'zod';
import { collectEnvelopeNumbers, collectScopedNumbers, roundingTolerance, teamDataCounts, type Measurement, type ScopedNumber, type ToolEnvelope } from './provenance';

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

export const CiteSchema = z.object({
  v: z.union([z.string().max(40), z.number()]).transform((x) => String(x)),
  ref: z.string().regex(/^e\d+$/),
  key: z.string().min(1).max(120),
  subject: z.string().min(1).max(64),
  /** The window of the evidence, copied from it, when the model gives one: [window_start, window_end]. */
  w: z.tuple([z.string().max(12), z.string().max(12)]).optional(),
});
export type Cite = z.infer<typeof CiteSchema>;

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

const norm = (s: string) => s.toLowerCase().replace(/[^a-z0-9:]+/g, '_').replace(/^_+|_+$/g, '');

/** A number as written: "-4.16", "−4.16", "61.11%", "+0.5", "1,200". */
export function parseWritten(raw: string): number | null {
  const cleaned = raw.trim().replace(/[−–]/g, '-').replace(/,/g, '').replace(/%$/, '').replace(/^\+/, '');
  if (!/^-?\d+(\.\d+)?$/.test(cleaned)) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/** Digits as written, for the precision a figure claims. */
const digitsOf = (raw: string) => raw.trim().replace(/[−–]/g, '-').replace(/[%,+]/g, '');

const matchesValue = (candidate: number, written: number, raw: string) => {
  const tol = roundingTolerance(digitsOf(raw));
  return Math.abs(candidate - written) <= tol || Math.abs(Math.abs(candidate) - Math.abs(written)) <= tol;
};

type Candidate = { value: number; window: readonly [string | null, string | null] | null };

const subjectIs = (subject: string, entity: Measurement['entity']) => (subject === 'team' ? entity.kind === 'team' : entity.id === subject);

/** Every number of one measurement a figure in the answer can be: its value, its sample, its denominator, its benchmark and the places beside it. */
function numbersOfMeasurement(m: Measurement & { comparisons?: Array<{ value: number | null; place_of: number | null; place_percent: number | null }> }): Candidate[] {
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
    add(c.place_of);
    add(c.place_percent);
    if (typeof m.value === 'number' && typeof c.value === 'number') add(m.value - c.value);
  }
  return out;
}

/** What a read holds under `key` for `subject`: null when it holds nothing under that key and subject (the cite is unresolved). */
function candidatesFor(cite: Cite, env: ToolEnvelope): Candidate[] | null {
  const key = norm(cite.key);
  const found: Candidate[] = [];
  let resolved = false;

  for (const m of [...env.measurements]) {
    if (norm(m.metric_id) !== key || !subjectIs(cite.subject, m.entity)) continue;
    resolved = true;
    found.push(...numbersOfMeasurement(m));
  }

  const scoped: ScopedNumber[] = [...(env.detail === undefined ? [] : collectScopedNumbers(env.detail)), ...teamDataCounts(env.detail)];
  for (const n of scoped) {
    if (!n.metric_key || norm(n.metric_key) !== key) continue;
    const mine = cite.subject === 'team' ? n.team === true || n.player_id === null : n.player_id === cite.subject || n.player_id === null;
    if (!mine) continue;
    resolved = true;
    found.push({ value: n.value, window: null });
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
  if (valueHits.length === 0) return { cite, status: 'mismatch', value: written, reason: `${cite.ref} ${cite.key} for ${cite.subject} says something else` };
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

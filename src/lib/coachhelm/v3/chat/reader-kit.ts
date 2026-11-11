/**
 * CoachHelm chat: what every reader shares.
 *
 * Who is asking comes from the tool context, never from the model. A player's context is the coach context shape
 * with the roster reduced to them and `player_id` set (`resolvePlayerChatContext`); `ownOr` is the one place a
 * model-supplied player id is replaced by the caller's own, so no reader can forget it.
 */
import { isPlayerContext, type ToolContext, type ToolResult } from './engine/tool';
import { requireRosterPlayer, type CoachChatContext } from './context';
import { defaultSgBaseline, type SgBaselineKey } from '@/lib/golf/sg-benchmarks';
import { nowIso, unavailableEnvelope, type CoverageState, type Measurement, type ToolEnvelope } from './provenance';

/** The session's context in the shape the existing reads take. */
export const teamOf = (ctx: ToolContext): CoachChatContext => ctx.who;

/** The signed-in player's id, or null for a coach. */
export const playerOf = (ctx: ToolContext): string | null => (isPlayerContext(ctx.who) ? ctx.who.player_id : null);

/**
 * The players a read is about. A player: always and only themself, whatever was asked. A coach: the asked ids, each
 * checked against the active roster (a throw the engine reports as a read that could not be made).
 */
export function ownOr(ctx: ToolContext, asked: readonly string[] | undefined): string[] {
  const me = playerOf(ctx);
  if (me) return [me];
  return [...new Set(asked ?? [])].map((id) => requireRosterPlayer(ctx.who, id).id);
}

/** One optional player: the caller's own for a player; for a coach the asked one (checked) or none. */
export function ownOrOne(ctx: ToolContext, asked: string | undefined): string | undefined {
  const me = playerOf(ctx);
  if (me) return me;
  return asked ? requireRosterPlayer(ctx.who, asked).id : undefined;
}

export const nameOf = (ctx: ToolContext, playerId: string): string => ctx.who.roster.find((p) => p.id === playerId)?.name ?? 'This player';

/** A read that could not be made. Never an empty result. */
export const failed = (what: string, why = 'The read failed.'): ToolEnvelope => plain(unavailableEnvelope(`Could not read ${what}.`, why));

/**
 * "That isn't tracked": the question asks for something the app does not record. A read on the contract (it gets an
 * evidence chip, so the thread can draw the "Not tracked … Closest: …" row), with the nearest figures that are recorded.
 */
export function notTracked(entry: { what: string; nearest: readonly string[]; note: string }): ToolResult {
  const closest = entry.nearest.length ? `Closest that is tracked: ${entry.nearest.join(', ')}.` : 'Nothing close to it is tracked.';
  return {
    summary: `Not tracked: ${entry.what}.`,
    measurements: [],
    series: [],
    coverage: 'not_tracked',
    coverage_note: entry.note,
    nearest: [...entry.nearest],
    as_of: nowIso(),
    model_text: `Not tracked: ${entry.what}. ${entry.note} ${closest} Say first that it is not tracked, then offer the closest figure; never show a zero or an empty chart for it.`,
  };
}

export const empty = (summary: string, detail?: unknown): ToolEnvelope => ({ summary, measurements: [], series: [], ...(detail === undefined ? {} : { detail }), coverage: 'empty', coverage_note: null, as_of: nowIso() });

/**
 * A result that is not a read of team data: a drawn visual, a draft, a refusal. No evidence chip. With nothing but its
 * sentence to say, the sentence is all the model is sent; a notice that carries `detail` (the data dictionary, a
 * thread list) is still sent whole, because the detail is what it is for.
 */
export function notice(summary: string, extra: Pick<ToolResult, 'parts' | 'end_turn'> & { detail?: unknown; refused?: boolean } = {}): ToolResult {
  const { refused, detail, ...rest } = extra;
  return { summary, measurements: [], series: [], ...(detail === undefined ? { model_text: summary } : { detail }), coverage: refused ? 'unavailable' : 'complete', coverage_note: refused ? summary : null, as_of: nowIso(), evidence: false, ...rest };
}

export const round = (v: number, digits: number): number => {
  const f = 10 ** digits;
  return Math.round(v * f) / f;
};

/** A figure as a coach reads it: signed where the scale is relative, with its unit. */
export function say(value: number | null, unit: Measurement['unit'] | '%' | ' ft' | '', digits = 1, signed = false): string {
  if (value === null) return 'no figure';
  const v = round(value, digits);
  // A real minus sign, and the unit as a word: the model repeats what it reads.
  const body = `${signed && v > 0 ? '+' : ''}${v.toFixed(digits)}`.replace(/^-/, '\u2212');
  return unit === 'percent' || unit === '%' ? `${body}%` : unit === 'feet' || unit === ' ft' ? `${body} feet` : body;
}

/** A whole-number score against par, as a coach says it: "2 over par", "level par", "1 under par". */
export const toParWords = (toPar: number): string => (Math.round(toPar) === 0 ? 'level par' : `${Math.abs(Math.round(toPar))} ${toPar > 0 ? 'over' : 'under'} par`);

/** The sample behind a figure, in the sentence, in words: "over 10 rounds". Never "(n=10)". */
export const sampleWords = (n: number, unit = 'round', many = `${unit}s`): string => `over ${n.toLocaleString('en-US')} ${n === 1 ? unit : many}`;

/** A page's own label as it reads inside a sentence: "SG approach" is "strokes gained approach", "Scoring avg" is "scoring average". */
export const spoken = (label: string): string => {
  const words = coachWords(label);
  return /^[A-Z][a-z]/.test(words) ? `${words[0]!.toLowerCase()}${words.slice(1)}` : words;
};

/**
 * What the model reads it repeats, so every line it is handed is written the way a coach should read it. This is the
 * one place all reader text passes (`withText`): it turns statistics notation and the screens' short labels into
 * words. Readers write their lines in words to begin with; this holds whatever a screen's own label still carries.
 */
export function coachWords(text: string): string {
  const range = (unit: string, word: string) => (t: string) =>
    t
      .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\s?[\u2013-]\\s?(\\d+(?:\\.\\d+)?)\\s?${unit}s?\\b`, 'g'), word === 'feet' ? 'from $1 to $2 feet' : `$1 to $2 ${word}`)
      .replace(new RegExp(`(\\d+(?:\\.\\d+)?)\\+\\s?${unit}s?\\b`, 'g'), `$1 ${word} and beyond`)
      .replace(new RegExp(`<\\s?(\\d+(?:\\.\\d+)?)\\s?${unit}s?\\b`, 'g'), `inside $1 ${word}`)
      .replace(new RegExp(`(\\d)\\s?${unit}s?\\b`, 'g'), `$1 ${word}`);
  return range('yd', 'yards')(range('ft', 'feet')(text))
    .replace(/\(n\s*[=:]\s*([\d,]+)\s*([a-z ]*?)\)/gi, (_m, n: string, unit: string) => `over ${n}${unit.trim() ? ` ${unit.trim()}` : ''}`)
    .replace(/\bSG:?\s+(?:([A-Z])(?=[a-z]))?/g, (_m, first?: string) => `strokes gained ${first ? first.toLowerCase() : ''}`)
    .replace(/\bGIR\b/g, 'greens in regulation')
    .replace(/\bavg\b/gi, 'average')
    .replace(/\bpct\b/gi, 'percent')
    .replace(/\bvs\.?\s+(?=previous\b)/g, 'against the ')
    .replace(/\bvs\.?\s+/g, 'against ')
    .replace(/(^|[\s:(|,;])-(?=\d)/gm, '$1\u2212');
}

/** The yardstick strokes gained is measured against, in the words the golf block of the prompt uses. */
const SG_BASELINE_WORDS: Record<SgBaselineKey, string> = { pga_tour: 'the Tour benchmark', womens: 'the women\u2019s Tour baseline' };
/**
 * "against the Tour benchmark", for a line that carries a strokes-gained figure. From the loader when it says which
 * baseline it used; otherwise the team's default, chosen by the same function the calculation uses (`defaultSgBaseline`).
 */
export function sgAgainst(ctx: ToolContext, fromLoader?: SgBaselineKey | null): string {
  const gender = ctx.who.gender === 'womens' ? 'womens' : ctx.who.gender === 'mens' ? 'mens' : null;
  return `against ${SG_BASELINE_WORDS[fromLoader ?? defaultSgBaseline(gender)]}`;
}
/** ", 6 of 10 shot-tracked, the rest estimated from the scorecard", when the loader says how many rounds had shots logged. Nothing until it does. */
export const shotTracked = (tracked: number | undefined, of: number): string =>
  tracked === undefined || of <= 0 ? '' : tracked >= of ? `, all ${of} shot-tracked` : `, ${tracked} of ${of} shot-tracked, the rest estimated from the scorecard`;

/**
 * Several reads answered as one. Each part keeps its own measurements and its own detail under its label. A part that
 * could not be read is named in the note and the whole is `partial`; only when every part failed is it `unavailable`.
 */
export function together(summary: string, parts: ReadonlyArray<readonly [label: string, envelope: ToolEnvelope]>, against?: string): ToolEnvelope & { model_text: string } {
  const down = parts.filter(([, e]) => e.coverage === 'unavailable');
  if (parts.length > 0 && down.length === parts.length) return plain(unavailableEnvelope(`Could not read ${parts.map(([l]) => l).join(', ')}.`, down.map(([l, e]) => `${l}: ${e.coverage_note ?? 'failed'}`).join(' ')));
  // Each part in its own words, under its label: a part that wrote its own lines keeps them, any other is read out field by field.
  const texts = parts.map(([l, e]) => [l, plain(e, against).model_text] as const);
  const notes = parts.filter(([, e]) => e.coverage_note).map(([l, e]) => `${l}: ${e.coverage_note}`);
  const allEmpty = parts.every(([, e]) => e.coverage === 'empty' || e.coverage === 'unavailable');
  const coverage: CoverageState = down.length > 0 || parts.some(([, e]) => e.coverage === 'partial') ? 'partial' : allEmpty ? 'empty' : 'complete';
  return {
    summary: parts.length === 1 ? parts[0]![1].summary : `${summary} ${parts.map(([l, e]) => `${l}: ${e.summary}`).join(' ')}`.trim(),
    measurements: parts.flatMap(([, e]) => e.measurements),
    series: parts.flatMap(([, e]) => e.series),
    detail: parts.length === 1 ? parts[0]![1].detail : Object.fromEntries(parts.map(([l, e]) => [l, e.coverage === 'unavailable' ? { could_not_read: e.coverage_note ?? true } : (e.detail ?? { summary: e.summary })])),
    coverage,
    coverage_note: notes.length ? notes.join(' ') : null,
    as_of: nowIso(),
    model_text: texts.length === 1 ? texts[0]![1] : texts.flatMap(([l, text]) => [`${l[0]!.toUpperCase()}${l.slice(1)}:`, ...text.split('\n').map((line) => `  ${line}`)]).join('\n'),
  };
}

/** Runs a part and turns a throw into a failed part, so one bad read does not lose the others. */
export async function part(label: string, run: () => Promise<ToolEnvelope>): Promise<readonly [string, ToolEnvelope]> {
  try {
    return [label, await run()] as const;
  } catch (err) {
    return [label, failed(label, err instanceof Error && err.name === 'CoachContextError' ? err.message : 'The read failed.')] as const;
  }
}

/**
 * Labelled lines for the model in place of the envelope's JSON (see engine/CONTRACT_NOTES.md, `model_text`). The
 * envelope still carries every figure for the evidence chip, the visuals and the grounding check.
 */
export function withText<E extends ToolEnvelope>(envelope: E, lines: ReadonlyArray<string | null | false | undefined>): E & { model_text: string } {
  const text = [envelope.summary, ...lines.filter((l): l is string => typeof l === 'string' && l.length > 0), closing(envelope)].filter(Boolean).join('\n');
  return { ...envelope, model_text: coachWords(text) };
}
const closing = (envelope: ToolEnvelope): string | null => (envelope.coverage === 'complete' ? null : `Coverage: ${envelope.coverage}${envelope.coverage_note ? `. ${envelope.coverage_note}` : ''}`);

// ---------------------------------------------------------------------------------------------------------------------
// A read in words, for the reads that write no lines of their own
// ---------------------------------------------------------------------------------------------------------------------

/** The short forms a read's field names carry, as the words a coach says. */
const FIELD_WORDS: Record<string, string> = {
  avg: 'average', pct: 'percent', sg: 'strokes gained', ott: 'off the tee', gir: 'greens in regulation', n: 'sample', vs: 'against', pga: 'PGA', tour: 'Tour', hs: 'high school',
  div1: 'division 1', div2: 'division 2', div3: 'division 3', d1: 'division 1', d2: 'division 2', d3: 'division 3', p25: '25th percentile', p50: 'median', p75: '75th percentile',
  lo: 'low', hi: 'high', std: 'spread', rsvp: 'reply', iso: 'date', yds: 'yards', yd: 'yards', ft: 'feet',
};
/** "avg_to_par" is "average to par": a field's name as words, so no column name reaches the model to be repeated. */
export const fieldWords = (key: string): string =>
  key
    // No lookbehind (iOS before 16.4 cannot parse one): mark the lower-to-upper seam first, then split on the marks.
    .replace(/([a-z])(?=[A-Z])/g, '$1_')
    .split(/_+/)
    .filter(Boolean)
    .map((w) => FIELD_WORDS[w.toLowerCase()] ?? w.toLowerCase().replace(/^(\d+)(ft|yds?)$/, (_m, n: string, unit: string) => `${n} ${unit === 'ft' ? 'feet' : 'yards'}`))
    .join(' ');

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Fields whose value is one of the app's own short codes ("in_progress", "sg_putting"). Only these are reworded; any other text is passed on exactly as it is stored. */
const CODED = /(^|_)(status|state|kind|type|category|role|direction|basis|level|standing|priority|format|reason|metric|unit|scope|area|coverage|lineup|rsvp|reply|step|origin)$/;
/** A band's or a metric's own label ("150-175 yd", "SG: Putting") is the app's to write in words. */
const BAND = /(^|_)(band|bands|bucket|range|label|metric)$/;
/** "playerId" and "player_id" are the same field. */
const snake = (key: string): string => key.replace(/([a-z0-9])(?=[A-Z])/g, '$1_').toLowerCase();
/** The field a row is about: it leads the line without its name. */
const LEADS = new Set(['player', 'player_name', 'name', 'title', 'label']);
type Scalar = string | number | boolean | null;
const isScalar = (v: unknown): v is Scalar => v === null || typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const minus = (n: number, signed = false): string => `${signed && n > 0 ? '+' : ''}${n}`.replace(/^-/, '\u2212');

function scalarWords(key: string, v: Scalar): string {
  if (v === null) return 'none';
  if (typeof v === 'boolean') return v ? 'yes' : 'no';
  if (typeof v === 'number') {
    if (/(^|_)to_par$/.test(key)) return Number.isInteger(v) ? toParWords(v) : minus(v, true);
    return /(_pct|percent|percentage)$/.test(key) ? `${minus(v)}%` : minus(v);
  }
  const text = v.replace(/\s*\n+\s*/g, ' ').trim();
  if (CODED.test(key) && /^[a-z0-9]+(_[a-z0-9]+)+$/.test(text)) return fieldWords(text);
  return BAND.test(key) ? coachWords(text) : text;
}

/** One record on one line: what it is about first, then each field as "name: value", then the ids a later call needs in brackets. */
function recordLine(record: Record<string, unknown>): { text: string; nested: Array<[string, unknown]> } {
  let lead: string | null = null;
  const pairs: string[] = [];
  const ids: string[] = [];
  const nested: Array<[string, unknown]> = [];
  for (const [raw, v] of Object.entries(record)) {
    const k = snake(raw);
    if (v === undefined || v === '') continue;
    if (typeof v === 'string' && (k === 'ref' || k === 'metric_id' || ((k === 'id' || k.endsWith('_id')) && UUID.test(v)))) ids.push(`[${k === 'id' || k === 'ref' ? k : fieldWords(k.replace(/_id$/, ''))} ${v}]`);
    else if (isScalar(v)) {
      if (lead === null && typeof v === 'string' && LEADS.has(k)) lead = scalarWords(k, v);
      else pairs.push(`${fieldWords(k)}: ${scalarWords(k, v)}`);
    } else if (Array.isArray(v) && v.every(isScalar)) pairs.push(`${fieldWords(k)}: ${v.length ? v.map((x) => scalarWords(k, x)).join(', ') : 'none'}`);
    else nested.push([k, v]);
  }
  const body = [lead !== null && pairs.length ? `${lead}: ${pairs.join('; ')}` : (lead ?? pairs.join('; ')), ...ids].filter(Boolean).join(' ');
  return { text: body, nested };
}

function detailLines(value: unknown, rawKey: string | null, depth: number): string[] {
  const key = rawKey === null ? null : snake(rawKey);
  const pad = '  '.repeat(depth);
  const named = key ? `${fieldWords(key)}:` : '';
  if (value === undefined) return [];
  if (isScalar(value)) return [`${pad}${named}${named ? ' ' : ''}${scalarWords(key ?? '', value)}`];
  if (Array.isArray(value)) {
    if (value.every(isScalar)) return [`${pad}${named}${named ? ' ' : ''}${value.length ? value.map((x) => scalarWords(key ?? '', x)).join(', ') : 'none'}`];
    return [...(named ? [`${pad}${named}`] : []), ...value.flatMap((item) => detailLines(item, null, depth + (named ? 1 : 0)))];
  }
  if (!isRecord(value)) return [];
  const { text, nested } = recordLine(value);
  const head = named ? `${pad}${named}${text ? ` ${text}` : nested.length ? '' : ' none'}` : text ? `${pad}${text}` : null;
  return [...(head ? [head] : []), ...nested.flatMap(([k, v]) => detailLines(v, k, depth + (head ? 1 : 0)))];
}

const UNIT_SAID: Record<Measurement['unit'], string> = { percent: '%', strokes: ' strokes', yards: ' yards', feet: ' feet', count: '', score: '', ratio: '' };
const isStrokesGained = (m: { metric_id: string; metric_label: string }): boolean => /^sg(_|$)/.test(m.metric_id) || /^SG\b|strokes gained/i.test(m.metric_label);

function measurementLine(m: Measurement, against?: string): string {
  const sg = isStrokesGained(m);
  const value = m.value === null ? 'no figure' : `${minus(m.value, sg)}${UNIT_SAID[m.unit]}`;
  // A strokes-gained figure names what it is measured against in the same line.
  const yardstick = sg && m.value !== null ? (against ?? (m.benchmark && !m.benchmark.omitted_for_cohort ? `against ${m.benchmark.source}` : '')) : '';
  const sample = m.sample_size > 0 ? `, ${sampleWords(m.sample_size, m.sample_unit.replace(/s$/, ''), m.sample_unit)}` : '';
  const beside = (m.comparisons ?? []).map((c) => {
    const figure = c.value === null ? (c.missing_reason ?? 'no figure') : `${minus(c.value, sg)}${UNIT_SAID[m.unit]}`;
    const own = c.your_value === null || c.your_value === undefined ? '' : `, beside ${minus(c.your_value, sg)}${UNIT_SAID[m.unit]} on the same basis`;
    const place = c.place !== null && c.place_of !== null ? `, placed ${c.place} of ${c.place_of}` : '';
    const among = c.place_percent === null ? '' : `, at ${c.place_percent}% among them where higher is better`;
    return ` | ${c.label}: ${figure}${own}${place}${among}${c.note ? ` (${c.note})` : ''}`;
  });
  const partial = m.coverage === 'complete' ? '' : ` (${m.coverage}${m.coverage_note ? `: ${m.coverage_note}` : ''})`;
  return `${m.entity.label}, ${spoken(m.metric_label)}: ${value}${yardstick ? ` ${yardstick}` : ''}${sample}${partial}${beside.join('')}`;
}

/**
 * A read's figures and detail as labelled lines, for a read that writes none of its own. Field names become words,
 * the app's short codes become words, what a later call must be given exactly (a row's id, a drill's ref, a metric's
 * id) stays exact in brackets at the end of its line, and stored text (a note, a title, a drill's name) is passed on
 * as it is. `against` is the strokes-gained yardstick (`sgAgainst`).
 */
export function inWords(envelope: ToolEnvelope, against?: string): string[] {
  const sources = [...new Set(envelope.measurements.map((m) => m.source).filter(Boolean))];
  return [
    envelope.window_label ? `Window: ${envelope.window_label}.` : null,
    ...envelope.measurements.map((m) => measurementLine(m, against)),
    ...envelope.series.map((s) => `${s.entity.label}, ${spoken(s.metric_label)}, by date: ${s.points.map((p) => `${p.at.slice(0, 10)}${p.bucket ? ` ${coachWords(p.bucket)}` : ''} ${minus(p.value, isStrokesGained(s))}`).join('; ')}`),
    sources.length ? `Source: ${sources.join('; ')}.` : null,
    ...detailLines(envelope.detail, null, 0),
  ].filter((l): l is string => typeof l === 'string' && l.length > 0);
}

/** The read with lines for the model: its own when it wrote them, otherwise every figure and field read out in words. */
export function plain<E extends ToolEnvelope>(envelope: E, against?: string): E & { model_text: string } {
  const own = (envelope as E & { model_text?: unknown }).model_text;
  if (typeof own === 'string' && own.trim()) return envelope as E & { model_text: string };
  const end = closing(envelope);
  return { ...envelope, model_text: [coachWords(envelope.summary), ...inWords(envelope, against), end ? coachWords(end) : null].filter(Boolean).join('\n') };
}

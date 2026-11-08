import { z } from 'zod';
import type { CoachChatContext } from './context';
import { nowIso, type Measurement, type ToolEnvelope } from './provenance';
import { TeamQueryInput } from './team-query';

/**
 * `summarise_data`: arithmetic done by the server, over rows the turn has already read. A count, a rank, an average, a join or a
 * difference that the model works out in its head is a number no read returned, and the audit has to guess whether it is honest.
 * Here it is evidence: every result is a `Measurement` of a normal envelope, with the rows it rests on, the window they cover and
 * a ref the model can cite.
 *
 * It reads nothing new. A source is one of:
 *   - `{ ref }`: a read of THIS turn (its `detail.rows`, or the first list of records in its `detail`, or, with `list: "measurements"`,
 *     its measurements as rows). Another turn's, or an invented, ref is refused;
 *   - `{ query }` (coach only): a `query_team_data` spec, run by that same reader, so the allowlist, the forbidden columns, the roster
 *     scope, the row cap and the caller's own session apply exactly as they do there.
 * A field the rows do not have is refused with the fields they do have.
 */

export const SUMMARISE_OPS_MAX = 8;
export const JOIN_ROWS_MAX = 1000;
export const LIST_ROWS_MAX = 50;

const Field = z.string().min(1).max(60);
const Scalar = z.union([z.string().max(100), z.number(), z.boolean(), z.null()]);
const Where = z.object({
  field: Field,
  op: z.enum(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'in', 'is_null', 'not_null']),
  value: z.union([Scalar, z.array(z.union([z.string().max(100), z.number()])).max(50)]).optional(),
});
export type Where = z.infer<typeof Where>;

const RefSource = z.object({
  ref: z.string().regex(/^e\d+$/).describe('The evidence_ref of a read you made in this answer.'),
  list: z.string().max(40).optional().describe('Which list in that read: its rows by default, or "measurements".'),
});
const QuerySource = z.object({ query: TeamQueryInput });
export const SourceCoach = z.union([RefSource, QuerySource]);
export const SourcePlayer = RefSource;
type Source = z.infer<typeof SourceCoach>;

/** A figure an arithmetic op reads: a measurement of a read of this turn, or an earlier op of this same call. */
const Figure = z.union([
  z.object({ ref: z.string().regex(/^e\d+$/), metric_id: z.string().max(80), subject: z.string().max(60).optional().describe('A player id or name, or "team" (the team average that read states beside the players\' figures).') }),
  z.object({ op: z.string().max(30).describe('The id of an earlier op in this call.') }),
]);
type Figure = z.infer<typeof Figure>;

const OpId = z.string().regex(/^[a-z][a-z0-9_]{0,29}$/).optional().describe('A short name for this result, to cite and to reuse in a difference or ratio. Default: the op and its number.');
const Ops = z.discriminatedUnion('op', [
  z.object({ op: z.literal('count'), id: OpId, where: z.array(Where).max(6).optional() }),
  z.object({ op: z.literal('count_by'), id: OpId, field: Field, where: z.array(Where).max(6).optional() }),
  z.object({ op: z.literal('sum'), id: OpId, field: Field, by: Field.optional(), where: z.array(Where).max(6).optional() }),
  z.object({ op: z.literal('mean'), id: OpId, field: Field, by: Field.optional(), where: z.array(Where).max(6).optional() }),
  z.object({ op: z.literal('min'), id: OpId, field: Field, by: Field.optional(), where: z.array(Where).max(6).optional() }),
  z.object({ op: z.literal('max'), id: OpId, field: Field, by: Field.optional(), where: z.array(Where).max(6).optional() }),
  z.object({
    op: z.literal('rank'),
    id: OpId,
    field: Field.describe('The figure the rows are ranked on.'),
    subject: z.object({ field: Field, equals: z.union([z.string().max(100), z.number()]) }).describe('Which row to place, e.g. { field: "player_id", equals: "<id>" }.'),
    order: z.enum(['high_first', 'low_first']).describe('Whether the highest or the lowest value is first.'),
    where: z.array(Where).max(6).optional(),
  }),
  z.object({ op: z.literal('list'), id: OpId, fields: z.array(Field).min(1).max(8), limit: z.number().int().min(1).max(LIST_ROWS_MAX).default(20), where: z.array(Where).max(6).optional(), order_by: Field.optional(), descending: z.boolean().default(false) }),
  z.object({ op: z.literal('difference'), id: OpId, a: Figure, b: Figure }),
  z.object({ op: z.literal('ratio'), id: OpId, a: Figure, b: Figure }),
]);
export type SummariseOp = z.infer<typeof Ops>;

const Join = <S extends z.ZodTypeAny>(source: S) =>
  z.object({ with: source, left_key: Field, right_key: Field, keep: z.enum(['matched', 'all_left']).default('matched') });

const body = <S extends z.ZodTypeAny>(source: S) =>
  z.object({
    source: source.optional().describe('The rows to work on. Left out when every op is a difference or a ratio of figures you already have.'),
    join: Join(source).optional().describe('Join a second read to the first on a key, e.g. stat lines (round_id) to rounds (id). Every field of the second read is available as "right_<field>"; a field only the second read has is also available under its own name; a field both have keeps the left one under its own name.'),
    where: z.array(Where).max(6).optional().describe('Applies to the (joined) rows before every op.'),
    ops: z.array(Ops).min(1).max(SUMMARISE_OPS_MAX),
  });
export const SummariseInputCoach = body(SourceCoach);
export const SummariseInputPlayer = body(SourcePlayer);
export type SummariseInput = z.input<typeof SummariseInputCoach>;

type Row = Record<string, unknown>;
type Evidence = ReadonlyMap<string, ToolEnvelope>;
export type SummariseDeps = {
  evidence: Evidence;
  /** The coach's `query_team_data` reader, bound to the session. Absent for a player: a `query` source is then refused. */
  query?: (spec: z.infer<typeof TeamQueryInput>) => Promise<ToolEnvelope>;
};

const refused = (why: string): ToolEnvelope => ({
  summary: 'That summary was not worked out.',
  measurements: [],
  series: [],
  detail: { refused: true, reason: why },
  coverage: 'unavailable',
  coverage_note: why,
  as_of: nowIso(),
});

const isRecord = (v: unknown): v is Row => !!v && typeof v === 'object' && !Array.isArray(v);

/** The rows of a read: the list asked for, else `detail.rows`, else the first list of records in `detail`, else its measurements. */
export function rowsOfEnvelope(envelope: ToolEnvelope, list?: string): { rows: Row[]; name: string } | null {
  const detail = isRecord(envelope.detail) ? envelope.detail : {};
  if (list === 'measurements') return { rows: measurementRows(envelope), name: 'measurements' };
  if (list) {
    const v = detail[list];
    return Array.isArray(v) && v.every(isRecord) ? { rows: v as Row[], name: list } : null;
  }
  if (Array.isArray(detail.rows) && detail.rows.every(isRecord)) return { rows: detail.rows as Row[], name: 'rows' };
  for (const [name, v] of Object.entries(detail)) if (Array.isArray(v) && v.length > 0 && v.every(isRecord)) return { rows: v as Row[], name };
  return envelope.measurements.length > 0 ? { rows: measurementRows(envelope), name: 'measurements' } : null;
}

function measurementRows(envelope: ToolEnvelope): Row[] {
  return envelope.measurements.map((m) => ({
    ...(m.entity.kind === 'player' ? { player: m.entity.label, player_id: m.entity.id } : { [m.entity.kind]: m.entity.label }),
    // The same entity under the names a model reaches for: the nested path as written in the read, and flat forms.
    'entity.id': m.entity.id,
    'entity.label': m.entity.label,
    'entity.kind': m.entity.kind,
    entity_id: m.entity.id,
    entity_label: m.entity.label,
    metric_id: m.metric_id,
    metric_label: m.metric_label,
    value: m.value,
    unit: m.unit,
    sample_size: m.sample_size,
    window_start: m.window_start,
    window_end: m.window_end,
  }));
}

const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : typeof v === 'string' && v.trim() !== '' && Number.isFinite(Number(v)) ? Number(v) : null);

function matches(row: Row, w: Where): boolean {
  const v = row[w.field];
  switch (w.op) {
    case 'is_null':
      return v === null || v === undefined;
    case 'not_null':
      return v !== null && v !== undefined;
    case 'in':
      return Array.isArray(w.value) && w.value.some((x) => x === v || (num(x) !== null && num(x) === num(v)));
    case 'eq':
      return v === w.value || (num(v) !== null && num(w.value) !== null && num(v) === num(w.value));
    case 'neq':
      return !(v === w.value || (num(v) !== null && num(w.value) !== null && num(v) === num(w.value)));
    default: {
      if (v === null || v === undefined || w.value === undefined || w.value === null || Array.isArray(w.value)) return false;
      const a = num(v) !== null && num(w.value) !== null ? num(v)! : String(v);
      const b = num(v) !== null && num(w.value) !== null ? num(w.value)! : String(w.value);
      return w.op === 'gt' ? a > b : w.op === 'gte' ? a >= b : w.op === 'lt' ? a < b : a <= b;
    }
  }
}

const filtered = (rows: readonly Row[], where?: readonly Where[]) => (where?.length ? rows.filter((r) => where.every((w) => matches(r, w))) : [...rows]);
const fieldsOf = (rows: readonly Row[]) => [...new Set(rows.flatMap((r) => Object.keys(r)))];

const DATE_FIELD = /(^|_)(date|day)$|_at$|^(starts|ends)_/;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}/;

/** The unit a figure over this field is read in. */
function unitOf(field: string): Measurement['unit'] {
  if (/strokes_gained|^sg_/.test(field)) return 'strokes';
  if (/pct|percent|rate/.test(field)) return 'percent';
  if (/yards|distance/.test(field)) return 'yards';
  if (/score|to_par|par$/.test(field)) return 'score';
  return 'count';
}

const UNITS: readonly Measurement['unit'][] = ['percent', 'strokes', 'yards', 'feet', 'count', 'score', 'ratio'];

/** The unit of a figure over these rows: the unit the rows carry when they all share one (a read's measurements do), else the field's own. */
function unitOver(field: string, rows: readonly Row[]): Measurement['unit'] {
  const carried = new Set(rows.map((r) => r.unit).filter((u): u is string => typeof u === 'string'));
  const only = carried.size === 1 ? [...carried][0] : undefined;
  if (field === 'value' && only && (UNITS as readonly string[]).includes(only)) return only as Measurement['unit'];
  return unitOf(field);
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '').slice(0, 30) || 'x';

/** Two decimals, the precision the rest of Ask's figures carry and the answer can round down from. */
const hundredth = (n: number) => Number(n.toFixed(2));

/**
 * What a worked-out figure is, in words. Over a read's measurements it names the metric and, for a mean, says what is averaged: the
 * players' own figures ("average of 7 players' figures"), which is a different number from a pooled team figure.
 */
function figureLabel(op: 'sum' | 'mean' | 'min' | 'max', field: string, rows: readonly Row[], by: string | null): string {
  const word = op === 'mean' ? 'Average' : op === 'sum' ? 'Total' : op === 'min' ? 'Lowest' : 'Highest';
  const labels = new Set(rows.map((r) => r.metric_label).filter((l): l is string => typeof l === 'string'));
  const subject = field === 'value' && labels.size === 1 ? [...labels][0]! : field;
  const players = new Set(rows.map((r) => r['entity.id']).filter((id) => typeof id === 'string' && rows.some((r) => r['entity.kind'] === 'player')));
  const of = field === 'value' && op === 'mean' && players.size > 1 ? ` (average of ${players.size} players' figures)` : '';
  return `${word} ${subject}${of}${by ? ` for ${by}` : ''}`;
}

type Ctx = { team: Measurement['entity']; people: ReadonlyMap<string, string> };

/** The rows' window: the span of the first date-like field they carry. */
function windowOf(rows: readonly Row[]): { start: string | null; end: string | null } {
  const field = fieldsOf(rows).find((f) => DATE_FIELD.test(f) && rows.some((r) => typeof r[f] === 'string' && ISO_DAY.test(r[f] as string)));
  if (!field) return { start: null, end: null };
  const days = rows.map((r) => r[field]).filter((v): v is string => typeof v === 'string' && ISO_DAY.test(v)).map((v) => v.slice(0, 10)).sort();
  return { start: days[0] ?? null, end: days[days.length - 1] ?? null };
}

function sampleUnitOf(rows: readonly Row[]): Measurement['sample_unit'] {
  const f = new Set(fieldsOf(rows));
  return f.has('round_date') || f.has('round_id') || f.has('total_score') ? 'rounds' : f.has('player_id') && !f.has('event_id') ? 'players' : 'events';
}

/** The player a set of filters pins the rows to, when they pin one (`player_id` eq, or `player` eq a roster name). */
function pinnedPlayer(where: readonly Where[], people: ReadonlyMap<string, string>): Measurement['entity'] | null {
  for (const w of where) {
    if (w.op !== 'eq') continue;
    if (w.field === 'player_id' && typeof w.value === 'string' && people.has(w.value)) return { kind: 'player', id: w.value, label: people.get(w.value)! };
    if (w.field === 'player' && typeof w.value === 'string') {
      const id = [...people].find(([, name]) => name === w.value)?.[0];
      if (id) return { kind: 'player', id, label: w.value as string };
    }
  }
  return null;
}

function figure(args: { id: string; label: string; unit: Measurement['unit']; value: number | null; entity: Measurement['entity']; n: number; of?: number | null; rows: readonly Row[]; method: string; direction?: Measurement['direction'] }): Measurement {
  const w = windowOf(args.rows);
  return {
    metric_id: `summary:${args.id}`,
    metric_label: args.label,
    unit: args.unit,
    value: args.value === null ? null : hundredth(args.value),
    entity: args.entity,
    window_start: w.start,
    window_end: w.end,
    sample_size: args.n,
    sample_unit: sampleUnitOf(args.rows),
    as_of: nowIso(),
    coverage: args.value === null ? 'empty' : 'complete',
    coverage_note: args.value === null ? 'No rows to work this out from.' : null,
    source: 'summarised reads',
    method: args.method,
    denominator: args.of ?? null,
    benchmark: null,
    direction: args.direction ?? null,
  };
}

function resolveFigure(f: Figure, evidence: Evidence, made: ReadonlyMap<string, Measurement>, team: Measurement['entity']): Measurement | string {
  if ('op' in f) return made.get(f.op) ?? `There is no earlier op "${f.op}" in this call.`;
  const env = evidence.get(f.ref);
  if (!env) return `No read named ${f.ref} in this answer.`;
  const ofMetric = env.measurements.filter((m) => m.metric_id === f.metric_id && m.value !== null);
  const subject = f.subject?.trim();
  const isSubject = (m: Measurement) => !subject || (subject.toLowerCase() === 'team' ? m.entity.kind === 'team' : m.entity.id === subject || m.entity.label.toLowerCase() === subject.toLowerCase());
  const hits = ofMetric.filter(isSubject);
  if (hits.length === 1) return hits[0]!;
  if (hits.length > 1) return `Read ${f.ref} has ${hits.length} figures ${f.metric_id}; name the subject (a player id or name, or "team").`;
  // "team" on a read of the roster's figures (a ranking, a comparison): the team average that read states beside them.
  if (subject?.toLowerCase() === 'team') {
    const refs = ofMetric.flatMap((m) => (m.comparisons ?? []).filter((c) => c.kind === 'team' && typeof c.value === 'number').map((c) => ({ m, c })));
    const values = new Set(refs.map((r) => r.c.value));
    if (values.size === 1) {
      const { m, c } = refs[0]!;
      const starts = ofMetric.map((x) => x.window_start).filter((x): x is string => !!x).sort();
      const ends = ofMetric.map((x) => x.window_end).filter((x): x is string => !!x).sort();
      return { ...m, entity: team, value: c.value, metric_label: `${c.label}: ${m.metric_label}`, window_start: starts[0] ?? null, window_end: ends[ends.length - 1] ?? null, sample_size: c.place_of ?? ofMetric.length, sample_unit: 'players', method: c.label, source: 'summarised reads', benchmark: null, comparisons: undefined };
    }
    if (values.size > 1) return `Read ${f.ref} states more than one team average for ${f.metric_id} (${[...values].join(', ')}); use a figure from a read that states one.`;
    return `Read ${f.ref} states no team average for ${f.metric_id}. Read it with get_team_metric_ranking or get_team_strokes_gained, or name two figures you do have.`;
  }
  const have = [...new Set(env.measurements.filter((m) => m.metric_id === f.metric_id).map((m) => `${m.entity.label} (${m.entity.id})`))];
  return `Read ${f.ref} has no figure ${f.metric_id}${subject ? ` for ${subject}` : ''}.${have.length > 0 ? ` It has it for: ${have.slice(0, 12).join(', ')}.` : ` Its figures are: ${[...new Set(env.measurements.map((m) => m.metric_id))].slice(0, 12).join(', ') || 'none'}.`}`;
}

/** Competition ranking: 1, 2, 2, 4. */
export function competitionRank(values: readonly number[], mine: number, order: 'high_first' | 'low_first'): number {
  return 1 + values.filter((v) => (order === 'high_first' ? v > mine : v < mine)).length;
}

async function sourceRows(src: Source, deps: SummariseDeps): Promise<{ rows: Row[]; partial: boolean; note?: string } | string> {
  if ('ref' in src) {
    const env = deps.evidence.get(src.ref);
    if (!env) return `No read named ${src.ref} in this answer. Use the evidence_ref of a read you made.`;
    if (env.coverage === 'unavailable') return `Read ${src.ref} did not come back, so there is nothing to work on.`;
    const got = rowsOfEnvelope(env, src.list);
    if (!got) return `Read ${src.ref} has no ${src.list ? `list "${src.list}"` : 'list of rows'} to work on.`;
    return { rows: got.rows.slice(0, JOIN_ROWS_MAX), partial: env.coverage === 'partial', note: env.coverage_note ?? undefined };
  }
  if (!deps.query) return 'This tool cannot run a query; name the evidence_ref of a read you made.';
  const env = await deps.query(src.query);
  if (env.coverage === 'unavailable') return env.coverage_note ?? 'That query was not run.';
  const got = rowsOfEnvelope(env);
  return { rows: got?.rows ?? [], partial: env.coverage === 'partial', note: env.coverage_note ?? undefined };
}

export async function summariseData(ctx: CoachChatContext, input: SummariseInput, deps: SummariseDeps): Promise<ToolEnvelope> {
  const parsed = SummariseInputCoach.safeParse(input);
  if (!parsed.success) return refused('That summary is not in a shape I can work out.');
  const spec = parsed.data;
  const c: Ctx = { team: { kind: 'team', id: ctx.team_id, label: ctx.team_name }, people: new Map(ctx.roster.map((p) => [p.id, p.name])) };

  const needsRows = spec.ops.some((o) => o.op !== 'difference' && o.op !== 'ratio');
  let rows: Row[] = [];
  let partial = false;
  const notes: string[] = [];
  if (spec.source) {
    const left = await sourceRows(spec.source, deps);
    if (typeof left === 'string') return refused(left);
    rows = left.rows;
    partial = left.partial;
    if (left.note) notes.push(left.note);
    if (spec.join) {
      const right = await sourceRows(spec.join.with, deps);
      if (typeof right === 'string') return refused(right);
      partial = partial || right.partial;
      if (right.note) notes.push(right.note);
      if (!fieldsOf(rows).includes(spec.join.left_key)) return refused(`The first read has no field "${spec.join.left_key}". It has: ${fieldsOf(rows).join(', ')}.`);
      if (!fieldsOf(right.rows).includes(spec.join.right_key)) return refused(`The second read has no field "${spec.join.right_key}". It has: ${fieldsOf(right.rows).join(', ')}.`);
      const byKey = new Map<string, Row>();
      for (const r of right.rows) {
        const k = r[spec.join.right_key];
        if (k !== null && k !== undefined) byKey.set(String(k), r);
      }
      const joined: Row[] = [];
      for (const l of rows) {
        const k = l[spec.join.left_key];
        const match = k === null || k === undefined ? undefined : byKey.get(String(k));
        if (!match && spec.join.keep === 'matched') continue;
        const merged: Row = { ...l };
        if (match) {
          // Every right-hand field is reachable as "right_<field>"; one that does not clash with a left field is also reachable bare.
          for (const [name, v] of Object.entries(match)) {
            merged[`right_${name}`] = v;
            if (!(name in l)) merged[name] = v;
          }
        }
        joined.push(merged);
      }
      rows = joined;
    }
  } else if (needsRows) {
    return refused('Name the rows to work on with "source", or use only difference and ratio of figures you already have.');
  }

  if (spec.where) {
    const bad = spec.where.find((w) => !fieldsOf(rows).includes(w.field));
    if (bad) return refused(`There is no field "${bad.field}" in these rows. They have: ${fieldsOf(rows).join(', ')}.`);
    rows = filtered(rows, spec.where);
  }
  const have = new Set(fieldsOf(rows));
  const missingField = (names: Array<string | undefined>) => names.find((n) => n !== undefined && rows.length > 0 && !have.has(n));

  const measurements: Measurement[] = [];
  const made = new Map<string, Measurement>();
  const results: Array<Record<string, unknown>> = [];
  let listed: { rows: Row[]; total: number } | null = null;
  const used = new Set<string>();
  const nameFor = (op: SummariseOp, i: number) => {
    let id = op.id ?? `${op.op}_${i + 1}`;
    while (used.has(id)) id = `${id}_x`;
    used.add(id);
    return id;
  };
  const push = (id: string, m: Measurement) => {
    measurements.push(m);
    if (!made.has(id)) made.set(id, m);
  };

  for (const [i, op] of spec.ops.entries()) {
    const id = nameFor(op, i);
    if (op.op === 'difference' || op.op === 'ratio') {
      const a = resolveFigure(op.a, deps.evidence, made, c.team);
      if (typeof a === 'string') return refused(a);
      const b = resolveFigure(op.b, deps.evidence, made, c.team);
      if (typeof b === 'string') return refused(b);
      if (a.value === null || b.value === null) return refused('One of those figures has no value, so there is nothing to subtract or divide.');
      const value = op.op === 'difference' ? a.value - b.value : b.value === 0 ? null : a.value / b.value;
      const m: Measurement = { ...figure({ id, label: `${op.op === 'difference' ? 'Difference' : 'Ratio'}: ${a.metric_label} and ${b.metric_label}`, unit: op.op === 'ratio' ? 'ratio' : a.unit, value, entity: a.entity, n: Math.min(a.sample_size, b.sample_size), rows: [], method: `summary_${op.op}`, direction: op.op === 'difference' ? a.direction : null }), window_start: a.window_start, window_end: a.window_end, sample_unit: a.sample_unit };
      push(id, m);
      results.push({ id: `summary:${id}`, op: op.op, a: `${a.metric_id}=${a.value}`, b: `${b.metric_id}=${b.value}`, value: m.value });
      continue;
    }
    const where = op.where ?? [];
    const badWhere = where.find((w) => rows.length > 0 && !have.has(w.field));
    if (badWhere) return refused(`There is no field "${badWhere.field}" in these rows. They have: ${[...have].join(', ')}.`);
    const mine = filtered(rows, where);
    const entity = pinnedPlayer([...(spec.where ?? []), ...where], c.people) ?? c.team;

    if (op.op === 'count') {
      const m = figure({ id, label: 'Rows', unit: 'count', value: mine.length, entity, n: mine.length, rows: mine, method: 'summary_count' });
      push(id, m);
      results.push({ id: `summary:${id}`, op: 'count', value: mine.length });
    } else if (op.op === 'count_by') {
      const bad = missingField([op.field]);
      if (bad) return refused(`There is no field "${bad}" in these rows. They have: ${[...have].join(', ')}.`);
      const counts = new Map<string, Row[]>();
      for (const r of mine) {
        const v = r[op.field];
        if (v === null || v === undefined) continue;
        counts.set(String(v), [...(counts.get(String(v)) ?? []), r]);
      }
      const group: Array<Record<string, unknown>> = [];
      for (const [value, grp] of counts) {
        const who = op.field === 'player' ? { id: String(grp[0]?.player_id ?? ''), label: value } : null;
        const e: Measurement['entity'] = who && c.people.has(who.id) ? { kind: 'player', id: who.id, label: value } : entity;
        const gid = `${id}:${slug(value)}`;
        const m = figure({ id: gid, label: `Rows with ${op.field} ${value}`, unit: 'count', value: grp.length, entity: e, n: grp.length, of: mine.length, rows: grp, method: 'summary_count_by' });
        push(gid, m);
        group.push({ [op.field]: value, count: grp.length });
      }
      results.push({ id: `summary:${id}`, op: 'count_by', field: op.field, groups: group });
    } else if (op.op === 'sum' || op.op === 'mean' || op.op === 'min' || op.op === 'max') {
      const bad = missingField([op.field, op.by]);
      if (bad) return refused(`There is no field "${bad}" in these rows. They have: ${[...have].join(', ')}.`);
      const groups = new Map<string, Row[]>();
      for (const r of mine) groups.set(op.by ? String(r[op.by] ?? '') : '', [...(groups.get(op.by ? String(r[op.by] ?? '') : '') ?? []), r]);
      if (mine.length === 0) groups.set('', []);
      const out: Array<Record<string, unknown>> = [];
      for (const [value, grp] of groups) {
        const nums = grp.map((r) => num(r[op.field])).filter((n): n is number => n !== null);
        const v = nums.length === 0 ? null : op.op === 'sum' ? nums.reduce((a, b) => a + b, 0) : op.op === 'mean' ? nums.reduce((a, b) => a + b, 0) / nums.length : op.op === 'min' ? Math.min(...nums) : Math.max(...nums);
        const e: Measurement['entity'] = op.by === 'player' && grp[0]?.player_id && c.people.has(String(grp[0].player_id)) ? { kind: 'player', id: String(grp[0].player_id), label: value } : entity;
        const gid = op.by ? `${id}:${slug(value)}` : id;
        const m = figure({ id: gid, label: figureLabel(op.op, op.field, grp, op.by ? value : null), unit: unitOver(op.field, grp), value: v, entity: e, n: nums.length, rows: grp, method: `summary_${op.op}` });
        push(gid, m);
        out.push({ ...(op.by ? { [op.by]: value } : {}), value: m.value, rows: nums.length });
      }
      results.push({ id: `summary:${id}`, op: op.op, field: op.field, ...(op.by ? { by: op.by } : {}), results: out });
    } else if (op.op === 'rank') {
      const bad = missingField([op.field, op.subject.field]);
      if (bad) return refused(`There is no field "${bad}" in these rows. They have: ${[...have].join(', ')}.`);
      const scored = mine.filter((r) => num(r[op.field]) !== null);
      const values = scored.map((r) => num(r[op.field])!);
      const row = scored.find((r) => r[op.subject.field] === op.subject.equals || String(r[op.subject.field]) === String(op.subject.equals));
      if (!row) return refused(`No row with ${op.subject.field} ${String(op.subject.equals)} has a ${op.field} to place.`);
      const mineValue = num(row[op.field])!;
      const place = competitionRank(values, mineValue, op.order);
      const tied = values.filter((v) => v === mineValue).length;
      const pid = String(row.player_id ?? '');
      const e: Measurement['entity'] = c.people.has(pid) ? { kind: 'player', id: pid, label: c.people.get(pid)! } : entity;
      const m = figure({ id, label: `Place by ${op.field}, ${op.order === 'high_first' ? 'highest first' : 'lowest first'}`, unit: 'count', value: place, entity: e, n: values.length, of: values.length, rows: scored, method: 'summary_rank_competition', direction: null });
      push(id, m);
      const vm = figure({ id: `${id}_value`, label: `${op.field} of the row placed`, unit: unitOver(op.field, scored), value: mineValue, entity: e, n: values.length, rows: scored, method: 'summary_value' });
      push(`${id}_value`, vm);
      results.push({ id: `summary:${id}`, op: 'rank', place, of: values.length, tied: tied > 1 ? tied : undefined, value: mineValue });
    } else if (op.op === 'list') {
      const bad = missingField([...op.fields, op.order_by]);
      if (bad) return refused(`There is no field "${bad}" in these rows. They have: ${[...have].join(', ')}.`);
      const ordered = op.order_by ? [...mine].sort((x, y) => { const a = x[op.order_by!]; const b = y[op.order_by!]; return (a == null ? 1 : b == null ? -1 : a < b ? -1 : a > b ? 1 : 0) * (op.descending ? -1 : 1); }) : mine;
      listed = { rows: ordered.slice(0, op.limit).map((r) => Object.fromEntries(op.fields.map((f) => [f, r[f] ?? null]))), total: mine.length };
      const m = figure({ id, label: 'Rows listed', unit: 'count', value: mine.length, entity, n: mine.length, rows: mine, method: 'summary_list' });
      push(id, m);
      results.push({ id: `summary:${id}`, op: 'list', rows: mine.length, shown: listed.rows.length });
    }
  }

  return {
    summary: `${measurements.length} figure${measurements.length === 1 ? '' : 's'} worked out from ${spec.source ? `${rows.length} row${rows.length === 1 ? '' : 's'}` : 'figures already read'}.`,
    measurements,
    series: [],
    detail: {
      kind: 'summary',
      rows_used: rows.length,
      results,
      ...(listed ? { rows: listed.rows, row_count: listed.rows.length, matching_rows: listed.total } : {}),
    },
    coverage: partial ? 'partial' : measurements.every((m) => m.value === null) ? 'empty' : 'complete',
    coverage_note: partial ? notes.join(' ') || 'The rows it read were cut short, so these figures may be understated.' : null,
    as_of: nowIso(),
  };
}

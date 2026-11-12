/**
 * CoachHelm chat: "this", when the coach taps a thing in an earlier answer and asks about it.
 *
 * The browser sends a typed reference, never words: which read the thing came from (`evidence_ref`) and which element of that
 * read (`key`). It is resolved here against the reads THIS conversation has stored, and what the model is told is built from
 * the stored read alone: the browser only chooses among things the server already returned. A reference that names no stored
 * read, or no element of it, is ignored: the message is then answered as any other.
 *
 * `key` is one of:
 *   metric:<metric_id>                      the figure with that id (every subject of it in the read, up to six)
 *   metric:<metric_id>@<entity_id>          that figure for one player, team or round
 *   entity:<entity_id>                      everything the read says about one player, team or round (up to six figures)
 *   point:<metric_id>@<entity_id>#<at>      one point of a trend (`at` as the series gives it; the entity may be left out)
 *   row:<id>                                a row of the read's detail whose `id`, or any field ending `_id`, is <id>
 *                                           (a round in a list, a qualifier, a tournament), or `row:hole:<n>` for a hole
 *   shots:<direction>                       the Miss Compass's selection: the shots behind one wedge of a miss pattern. The
 *                                           direction must be one of the eight and must hold shots in the STORED read; the
 *                                           shots are the ones that read kept (`detail.ui_only`), never ids from the request
 */
import type { ToolEnvelope } from '../provenance';
import { isMissDirection } from '../miss-directions';
import { uiOnlyOf, withoutUiOnly } from '../ui-only';

export interface ChatAbout {
  evidence_ref: string;
  key: string;
}

/** The reference, if it has the shape of one. Anything else is no reference. */
export function parseAbout(value: unknown): ChatAbout | null {
  if (!value || typeof value !== 'object') return null;
  const { evidence_ref: ref, key } = value as { evidence_ref?: unknown; key?: unknown };
  if (typeof ref !== 'string' || !/^e\d{1,6}$/.test(ref)) return null;
  if (typeof key !== 'string' || key.length === 0 || key.length > 200) return null;
  return { evidence_ref: ref, key };
}

/** A stored string as one short piece of a sentence: no line breaks, no control characters, never long. */
const words = (value: unknown, max = 80): string =>
  String(value ?? '')
    // eslint-disable-next-line no-control-regex -- stored text is flattened to one line before it is shown to the model
    .replace(/[\u0000-\u001f\u007f]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);

const UNIT: Record<string, string> = { percent: '%', strokes: ' strokes', yards: ' yards', feet: ' feet', count: '', score: '', ratio: '' };
type Figure = ToolEnvelope['measurements'][number];
const figure = (m: Figure): string => {
  const value = m.value === null ? 'no value' : `${m.value}${UNIT[m.unit] ?? ''}`;
  return `${words(m.metric_label)} for ${words(m.entity.label)}: ${value}, from ${m.sample_size} ${m.sample_unit}`;
};

const MAX_LISTED = 6;
const scalar = (v: unknown): v is string | number | boolean => typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean';

/** The first object in a read's detail that is the row named: by its `id`, by any `*_id` field, or (`hole:<n>`) by its hole number. */
function findRow(detail: unknown, id: string, depth = 0): Record<string, unknown> | null {
  if (!detail || typeof detail !== 'object' || depth > 5) return null;
  if (Array.isArray(detail)) {
    for (const item of detail.slice(0, 500)) {
      const hit = findRow(item, id, depth + 1);
      if (hit) return hit;
    }
    return null;
  }
  const row = detail as Record<string, unknown>;
  const hole = /^hole:(\d{1,2})$/.exec(id)?.[1];
  const matches = hole ? row.hole_number === Number(hole) || row.hole === Number(hole) : Object.entries(row).some(([k, v]) => (k === 'id' || k.endsWith('_id')) && v === id);
  // The row that names the id AND carries something to say: a wrapper that only points at the id (`{ round_id }`) is passed over when a fuller one is inside it.
  if (matches && Object.values(row).filter(scalar).length > 1) return row;
  for (const value of Object.values(row)) {
    const hit = findRow(value, id, depth + 1);
    if (hit) return hit;
  }
  return matches ? row : null;
}

const rowWords = (row: Record<string, unknown>): string =>
  Object.entries(row)
    .filter(([, v]) => scalar(v))
    .slice(0, 10)
    .map(([k, v]) => `${words(k.replace(/_/g, ' '), 40)} ${words(v, 60)}`)
    .join(', ');

const MAX_ROUNDS = 8;

/**
 * The Miss Compass's selection, from the stored read alone: how many shots missed that way, and the rounds they were played in
 * (date, course, the round's id for a later read). No shot's distance: those were never shown to the model, so it is told
 * where to read them, not given them (ui-only.ts). Null when the read is not a miss pattern, or kept no shots that way.
 */
function shotsSelection(envelope: ToolEnvelope, direction: string): string | null {
  if (!isMissDirection(direction)) return null;
  if ((envelope.detail as { kind?: unknown } | undefined)?.kind !== 'miss_pattern') return null;
  const kept = uiOnlyOf(envelope.detail)?.miss_shots as { directions?: Record<string, { count?: unknown; shots?: unknown }> } | undefined;
  const picked = kept?.directions?.[direction];
  const count = picked?.count;
  if (typeof count !== 'number' || count <= 0 || !Array.isArray(picked?.shots)) return null;
  const rounds = new Map<string, string>();
  for (const s of picked.shots as Array<{ round_id?: unknown; round_date?: unknown; course?: unknown }>) {
    if (typeof s?.round_id !== 'string' || rounds.has(s.round_id)) continue;
    const when = typeof s.round_date === 'string' ? words(s.round_date, 10) : 'an undated round';
    rounds.set(s.round_id, `${when}${typeof s.course === 'string' && s.course ? ` at ${words(s.course, 60)}` : ''} [${words(s.round_id, 40)}]`);
  }
  const listed = [...rounds.values()];
  const said = direction.replace('_', ' ');
  return `the ${count} shot${count === 1 ? '' : 's'} that missed ${said}, selected on the miss compass; played in ${listed.slice(0, MAX_ROUNDS).join('; ')}${listed.length > MAX_ROUNDS ? `; and ${listed.length - MAX_ROUNDS} more rounds` : ''}. Their distances are in that read; read the rounds for more`;
}

/** What the element is, in the stored read's own labels and figures. Null when the read holds no such element. */
function element(envelope: ToolEnvelope, key: string): string | null {
  const colon = key.indexOf(':');
  if (colon <= 0) return null;
  const kind = key.slice(0, colon);
  const rest = key.slice(colon + 1);
  if (!rest) return null;
  if (kind === 'shots') return shotsSelection(envelope, rest);
  if (kind === 'row') {
    // A row is looked for in what the model was shown; the shots a coach can open are reached by a `shots:` selection only.
    const row = findRow(withoutUiOnly(envelope.detail), rest);
    return row ? rowWords(row) || null : null;
  }
  if (kind === 'point') {
    const [subject = '', at = ''] = rest.split('#');
    const [metric, entity] = subject.split('@');
    if (!metric || !at) return null;
    const series = envelope.series.find((s) => s.metric_id === metric && (!entity || s.entity.id === entity));
    const point = series?.points.find((p) => p.at === at);
    return series && point ? `${words(series.metric_label)} for ${words(series.entity.label)} at ${words(point.at, 40)}: ${point.value}${UNIT[series.unit] ?? ''}` : null;
  }
  if (kind !== 'metric' && kind !== 'entity') return null;
  const [metric, entity] = kind === 'metric' ? rest.split('@') : [undefined, rest];
  const hits = envelope.measurements.filter((m) => (metric === undefined || m.metric_id === metric) && (entity === undefined || m.entity.id === entity));
  if (hits.length > 0) return `${hits.slice(0, MAX_LISTED).map(figure).join('; ')}${hits.length > MAX_LISTED ? `; and ${hits.length - MAX_LISTED} more` : ''}`;
  // A trend with no single figure: its subject and how many points it has.
  const trends = envelope.series.filter((s) => (metric === undefined || s.metric_id === metric) && (entity === undefined || s.entity.id === entity));
  return trends.length > 0 ? trends.slice(0, MAX_LISTED).map((s) => `${words(s.metric_label)} for ${words(s.entity.label)}, a trend of ${s.points.length} points`).join('; ') : null;
}

/**
 * The one line the model is given about what the coach tapped, or null when the reference resolves to nothing (a read this
 * conversation never stored, or no such element in it). Everything in it comes from the stored read.
 */
export function aboutLine(reads: ReadonlyMap<string, ToolEnvelope>, about: unknown): { about: ChatAbout; line: string } | null {
  const parsed = parseAbout(about);
  const envelope = parsed ? reads.get(parsed.evidence_ref) : undefined;
  if (!parsed || !envelope) return null;
  const what = element(envelope, parsed.key);
  if (!what) return null;
  const window = envelope.window_label ? `, ${words(envelope.window_label, 60)}` : '';
  const line = `The coach tapped one thing in an earlier answer and this message is about it. It is from read ${parsed.evidence_ref} ("${words(envelope.summary, 120)}"${window}): ${what}. Answer about that thing; read again if the question needs more than is here.`;
  return { about: parsed, line: line.slice(0, 900) };
}

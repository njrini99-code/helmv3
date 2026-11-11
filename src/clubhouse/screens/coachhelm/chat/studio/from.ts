import type { Measurement, ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import type { ResolvedBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';
import {
  bucketBlock,
  comparisonWords,
  detailTable,
  fmtDay,
  formatValue,
  headingOf,
  humanCell,
  rankRows,
  sampleWords,
  teamTable,
  trendBlock,
  type AskEvidence,
  type AskTable,
} from '../../../../data/coachhelm-chat-thread';
import { formatClock, isoDay } from '../../../../lib/dates';
import { NO_DATA, changeTone, formatToPar } from '../../../../lib/format';
import { rebuiltHref } from '../../../../shell/nav';
import type { StudioBoardRow, StudioDay, StudioEvent, StudioFigure, StudioHole, StudioLeg, StudioPart, StudioTone } from './types';

/** A player's Stats, once that screen is rebuilt: the address the answer's own words link a roster name to (Prose.tsx, a client module this one cannot read a value from). */
const playerStatsHref = (id: string) => rebuiltHref(`/golf/dashboard/stats?player=${id}`);

/**
 * From what the engine emits to what a studio component draws. A figure is copied as the read printed it and its
 * sample is put in words here, once, so no component ever shows a count in brackets or a letter standing for one.
 */

/** "over 4 rounds", "from 126 attempts": the sample as a person would say it. Null when the read carried none. */
export function sampleSaid(m: Pick<Measurement, 'sample_size' | 'sample_unit'>): string | null {
  if (m.sample_size <= 0) return null;
  return `${m.sample_unit === 'rounds' || m.sample_unit === 'events' ? 'over' : 'from'} ${sampleWords(m.sample_size, m.sample_unit)}`;
}

function toneOf(m: Measurement): StudioTone {
  if (m.unit !== 'strokes') return 'plain';
  const t = changeTone(m.value, false, 1);
  return t === 'is-gain' ? 'gain' : t === 'is-loss' ? 'loss' : 'plain';
}

const hrefOf = (m: Measurement): string | null => (m.entity.kind === 'player' ? playerStatsHref(m.entity.id) : null);

/** A figure's verdict, by the measure's own direction: strokes gained against the baseline, anything else against its benchmark. Null when it has neither, or sits level. */
export function verdictOf(m: Measurement): { tone: 'gain' | 'loss'; words: string } | null {
  if (m.value === null) return null;
  if (m.unit === 'strokes') {
    const t = changeTone(m.value, false, 1);
    return t === 'is-gain' ? { tone: 'gain', words: 'Gains on the baseline' } : t === 'is-loss' ? { tone: 'loss', words: 'Loses to the baseline' } : null;
  }
  const b = m.benchmark && !m.benchmark.omitted_for_cohort ? m.benchmark : null;
  if (!b || !m.direction || m.value === b.value) return null;
  const better = m.direction === 'higher_better' ? m.value > b.value : m.value < b.value;
  return better ? { tone: 'gain', words: `Better than ${b.source}` } : { tone: 'loss', words: `Behind ${b.source}` };
}

function figureOf(m: Measurement, label?: string | null): StudioFigure {
  return {
    key: `${m.metric_id}:${m.entity.id}`,
    label: label ?? m.metric_label,
    value: formatValue(m.value, m.unit, m),
    sub: sampleSaid(m),
    tone: toneOf(m),
    refs: m.comparisons?.length ? comparisonWords(m.comparisons, m.unit) : undefined,
    href: hrefOf(m),
  };
}

/**
 * The answer's one large figure: its name beside it, and on the line under it the measure (when the model gave the figure
 * a name of its own) and the sample in words, a rate as its count ("6 of 9"). Its tone is its verdict, said by colour.
 */
function headlineOf(m: Measurement, label: string | null): StudioFigure {
  const made = m.denominator !== null && m.unit === 'percent' && m.value !== null ? `${Math.round((m.value / 100) * m.denominator)} of ${m.denominator}` : null;
  const verdict = verdictOf(m);
  return { ...figureOf(m, label), sub: [label ? m.metric_label : null, made ?? sampleSaid(m)].filter(Boolean).join(', ') || null, tone: verdict?.tone ?? 'plain', verdict: verdict?.words ?? null };
}

const sgPart = (label: string): string => {
  const part = label.replace(/^strokes gained[:\s-]*/i, '').trim() || label;
  return part.charAt(0).toUpperCase() + part.slice(1);
};

/** Each player's Stats address, where there is one: a player with none is left out, and the reader (`hrefs?.[id]`) draws no key for them. */
function statsHrefs(ids: readonly string[]): Record<string, string> {
  return Object.fromEntries(ids.flatMap((id) => {
    const href = playerStatsHref(id);
    return href ? [[id, href] as const] : [];
  }));
}

function playerHrefs(ms: readonly Measurement[]): Record<string, string> {
  return statsHrefs(ms.filter((m) => m.entity.kind === 'player').map((m) => m.entity.id));
}

/**
 * A block of a `show_visual` composition, as the component that draws it takes it. Every block type has a case: the registry test holds this to `STUDIO_KINDS`.
 * `several`: the composition is about more than one player or team, so a block that is one of theirs is named for them (the leaf's head cannot be).
 */
export function fromBlock(block: ResolvedBlock, several = false): StudioPart {
  switch (block.type) {
    case 'headline':
      return { kind: 'figure', data: { title: null, figures: [headlineOf(block.measurement, block.label)] } };
    case 'kpis':
      return { kind: 'figure', data: { title: block.measurements[0]?.entity.label ?? null, figures: block.measurements.map((m) => figureOf(m)) } };
    case 'trend': {
      const trend = trendBlock(block.series);
      const rounds = block.series.points.length;
      // One player's answer names the measure and its window; who it is about is the leaf's head.
      const title = !several && rounds > 1 && block.series.points.every((p) => p.bucket === null) ? `${block.series.metric_label}, last ${rounds} rounds` : trend.title;
      return { kind: 'trend', data: { form: 'rounds', trend: { ...trend, title, reference: block.reference === 'none' ? null : trend.reference } } };
    }
    case 'season_compare':
      return { kind: 'trend', data: { form: 'seasons', seasons: block } };
    case 'bands':
      return { kind: 'distance_profile', data: { form: 'bands', bands: bucketBlock(block.series, block.highlight) } };
    case 'putt_profile':
      return { kind: 'distance_profile', data: { form: 'putts', putts: block } };
    case 'miss_pattern':
      return { kind: 'distance_profile', data: { form: 'misses', misses: block } };
    case 'ranking': {
      const { rows, signed } = rankRows(block.measurements, block.order, block.highlight);
      return { kind: 'ranking', data: { label: block.measurements[0]!.metric_label, rows, signed, highlight: block.highlight, hrefs: playerHrefs(block.measurements) } };
    }
    case 'split': {
      const legs: StudioLeg[] = block.measurements.filter((m): m is Measurement & { value: number } => m.value !== null).map((m) => ({ key: m.metric_id, label: sgPart(m.metric_label), value: m.value, display: formatValue(m.value, m.unit), sample: sampleSaid(m) }));
      return { kind: 'strokes_gained', data: { title: several ? (block.measurements[0]?.entity.label ?? null) : null, legs, takeaway: null } };
    }
    case 'compare': {
      const team = teamTable(block.measurements);
      return { kind: 'comparison', data: { label: `${team.players.length} players`, team, hrefs: playerHrefs(block.measurements) } };
    }
    case 'hole_strip':
      return { kind: 'round', data: { title: null, strip: block } };
    case 'note':
      return { kind: 'note', data: { form: 'visual', claim: block.kind, text: block.text } };
  }
}

/** A read's evidence block, as the thread's data layer built it. `unavailable` and `empty` are the shell's own states, not a component. */
export function fromEvidence(ev: AskEvidence): StudioPart | null {
  switch (ev.kind) {
    case 'unavailable':
    case 'empty':
      return null;
    case 'trend':
      return { kind: 'trend', data: { form: 'rounds', trend: ev } };
    case 'bars':
      return { kind: 'distance_profile', data: { form: 'bands', bands: ev } };
    case 'ranking':
      return { kind: 'ranking', data: { label: ev.title, rows: ev.rows, signed: ev.signed, highlight: null, hrefs: statsHrefs(ev.rows.map((r) => r.id)) } };
    case 'compare':
      return { kind: 'comparison', data: { label: ev.title, team: ev.team, hrefs: statsHrefs(ev.team.players.map((pl) => pl.id)) } };
    case 'legs':
      return { kind: 'strokes_gained', data: { title: ev.title, legs: ev.rows.map((r) => ({ key: r.label, label: sgPart(r.label), value: r.value, display: r.display })), takeaway: ev.takeaway || null } };
    case 'tiles':
      return { kind: 'figure', data: { title: ev.title, figures: ev.tiles.map((t) => ({ key: t.label, label: t.label, value: t.value, sub: t.sub, tone: t.tone })) } };
    case 'reads':
    case 'table':
      return { kind: 'table', data: { table: ev.table, title: ev.title } };
  }
}

/* ---------------------------------------------------------------- a read that is a thing the app has a screen for */

type Rec = Record<string, unknown>;
const recOf = (v: unknown): Rec | null => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Rec) : null);
const strOf = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim() : null);
const numOf = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
const linkOf = (v: unknown): string | null => {
  const href = strOf(v);
  return href && href.startsWith('/') ? rebuiltHref(href) : null;
};

const EVENT_KIND: ReadonlyArray<readonly [RegExp, StudioEvent['kind']]> = [
  [/practice/, 'practice'],
  [/qualif/, 'qualifier'],
  [/tournament/, 'tournament'],
  [/travel|trip/, 'travel'],
  [/class/, 'class'],
];

/** "3:00 to 5:30 PM" in the team's zone: the meridiem once when both ends share it, the start alone when there is no end. */
function clockSpan(start: string, end: string | null, zone: string | undefined): string {
  const a = formatClock(start, zone);
  const b = end && end !== start ? formatClock(end, zone) : null;
  if (!b) return a;
  const [at, am] = a.split(' ');
  const [, bm] = b.split(' ');
  return am && am === bm ? `${at} to ${b}` : `${a} to ${b}`;
}

/**
 * `get_schedule`'s calendar (engine-reads.ts `getCalendar`: `{ zone, events: [{ id, title, event_type, start_time, end_time,
 * location, href, replies?, in_class? }] }`), as days with their events. Replies are the calendar's own four counts; a
 * class conflict is how many players the read named. Null when the detail is not that shape, or lists nothing.
 */
function scheduleOf(d: Rec | null): StudioPart | null {
  if (!d || !Array.isArray(d.events)) return null;
  const zone = strOf(d.zone) ?? undefined;
  const days = new Map<string, StudioEvent[]>();
  for (const raw of d.events as unknown[]) {
    const e = recOf(raw);
    const id = strOf(e?.id);
    const title = strOf(e?.title);
    const start = strOf(e?.start_time);
    if (!e || !id || !title || !start || Number.isNaN(Date.parse(start))) continue;
    const type = (strOf(e.event_type) ?? 'other').toLowerCase();
    const kind = EVENT_KIND.find(([re]) => re.test(type))?.[1] ?? 'other';
    const replies = recOf(e.replies);
    const event: StudioEvent = {
      id,
      title,
      time: clockSpan(start, strOf(e.end_time), zone),
      kind,
      kindLabel: kind === 'other' && type !== 'other' ? headingOf(type) : null,
      place: strOf(e.location),
      replies: replies ? { going: numOf(replies.accepted) ?? 0, maybe: numOf(replies.maybe) ?? 0, out: numOf(replies.declined) ?? 0, waiting: numOf(replies.pending) ?? 0 } : null,
      conflicts: Array.isArray(e.in_class) ? e.in_class.length : 0,
      href: linkOf(e.href),
    };
    const day = isoDay(start, zone);
    days.set(day, [...(days.get(day) ?? []), event]);
  }
  if (days.size === 0) return null;
  const list: StudioDay[] = [...days.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([date, events]) => ({ date, events }));
  return { kind: 'schedule', data: { title: 'The team calendar', days: list, href: rebuiltHref('/golf/dashboard/calendar') } };
}

/**
 * `get_qualifiers` with an id (readers.ts `runQualifiers`: `{ qualifier_id, href, name, status, rounds_planned, squad,
 * coach_picks, standings: [{ player_id, player, rounds, total, to_par }] }`), as the board in its own order. The cut is the
 * board's top-score line: the squad less the coach's picks qualify on score (screens/qualifiers). The read carries each
 * card's total, not each round, so the board draws no round columns.
 */
function boardOf(d: Rec | null): StudioPart | null {
  const name = strOf(d?.name);
  if (!d || !strOf(d.qualifier_id) || !name || !Array.isArray(d.standings)) return null;
  const rows: StudioBoardRow[] = [];
  for (const raw of d.standings as unknown[]) {
    const r = recOf(raw);
    const id = strOf(r?.player_id);
    const player = strOf(r?.player);
    if (!r || !id || !player) continue;
    const total = numOf(r.total);
    const toPar = numOf(r.to_par);
    rows.push({ id, name: player, rounds: [], total: total === null ? NO_DATA : String(total), toPar: toPar === null ? NO_DATA : formatToPar(toPar, 0) });
  }
  if (rows.length === 0) return null;
  const squad = numOf(d.squad);
  const onScore = squad === null ? null : Math.max(0, squad - (numOf(d.coach_picks) ?? 0));
  const planned = numOf(d.rounds_planned);
  const status = [strOf(d.status) ? headingOf(strOf(d.status)!) : null, planned ? `${planned} ${planned === 1 ? 'round' : 'rounds'}` : null].filter(Boolean).join(' · ');
  return { kind: 'qualifier_board', data: { title: name, rows, cut: onScore && onScore < rows.length ? onScore : null, roundLabels: [], status: status || null, href: linkOf(d.href) } };
}

const overUnder = (n: number): string => (n === 0 ? 'level par' : n > 0 ? `${n} over` : `${Math.abs(n)} under`);

/**
 * `get_round` (readers-direct.ts: `{ kind: 'hole_strip', round: { href?, date, course, total, to_par }, holes: [{ hole_number,
 * par, score }] }`), as its scorecard. A round posted as a total has no holes to draw, so it stays the read's own figures.
 */
function roundOf(d: Rec | null, envelope: ToolEnvelope): StudioPart | null {
  const round = recOf(d?.round);
  if (!d || !round || !Array.isArray(d.holes)) return null;
  const holes: StudioHole[] = [];
  for (const raw of d.holes as unknown[]) {
    const h = recOf(raw);
    const n = numOf(h?.hole_number);
    if (!h || n === null) continue;
    holes.push({ n, par: numOf(h.par), score: numOf(h.score) });
  }
  if (!holes.some((h) => h.score !== null)) return null;
  const total = numOf(round.total);
  const toPar = numOf(round.to_par);
  const who = envelope.measurements.find((m) => m.entity.kind === 'player')?.entity.label ?? null;
  const title = [who, strOf(round.course), fmtDay(strOf(round.date)), total === null ? null : `${total}${toPar === null ? '' : `, ${overUnder(toPar)}`}`].filter(Boolean).join(' · ');
  return { kind: 'round', data: { title: title || null, holes, href: linkOf(round.href) } };
}

/**
 * A read whose detail is a thing the app has a screen for, as the component that draws that thing: the calendar's days, a
 * qualifier's board, a round's scorecard. A schedule read with other parts beside it keeps its calendar under `events`
 * (reader-kit.ts `together`). Null for every other read, which is drawn from its evidence (`fromEvidence`).
 */
export function fromRead(envelope: ToolEnvelope): StudioPart | null {
  if (envelope.coverage === 'unavailable' || envelope.coverage === 'empty') return null;
  const d = recOf(envelope.detail);
  if (!d) return null;
  return scheduleOf(d) ?? scheduleOf(recOf(d.events)) ?? boardOf(d) ?? roundOf(d, envelope);
}

const isTable = (v: unknown): v is AskTable => !!v && typeof v === 'object' && Array.isArray((v as AskTable).columns) && Array.isArray((v as AskTable).rows) && typeof (v as AskTable).caption === 'string';

/**
 * Anything, as a table. This is what an unknown kind, or a part whose data its component cannot draw, falls back to:
 * its own table when it carries one, the first list of rows in it, else its plain fields. Never nothing.
 */
export function tableOf(data: unknown, caption = 'What was found'): AskTable {
  if (isTable(data)) return data;
  const held = data && typeof data === 'object' ? (data as Record<string, unknown>) : null;
  if (held && isTable(held.table)) return held.table;
  const listed = detailTable(data, caption);
  if (listed) return listed;
  const rows = held ? Object.entries(held).filter(([, v]) => v !== null && (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean')).map(([k, v]) => [headingOf(k), humanCell(v as string | number | boolean)]) : [];
  return { caption, columns: ['What', 'Value'], rows: rows.length > 0 ? rows : [['This part', 'There is nothing in it to show.']] };
}

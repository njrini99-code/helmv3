import type { Measurement } from '@/lib/coachhelm/v3/chat/provenance';
import type { ResolvedBlock } from '@/lib/coachhelm/v3/chat/visuals/composition';
import {
  bucketBlock,
  comparisonWords,
  detailTable,
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
import { changeTone } from '../../../../lib/format';
import { playerStatsHref } from '../Prose';
import type { StudioFigure, StudioLeg, StudioPart, StudioTone } from './types';

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

const sgPart = (label: string): string => {
  const part = label.replace(/^strokes gained[:\s-]*/i, '').trim() || label;
  return part.charAt(0).toUpperCase() + part.slice(1);
};

function playerHrefs(ms: readonly Measurement[]): Record<string, string> {
  return Object.fromEntries(ms.filter((m) => m.entity.kind === 'player').map((m) => [m.entity.id, playerStatsHref(m.entity.id)]));
}

/** A block of a `show_visual` composition, as the component that draws it takes it. Every block type has a case: the registry test holds this to `STUDIO_KINDS`. */
export function fromBlock(block: ResolvedBlock): StudioPart {
  switch (block.type) {
    case 'headline':
      return { kind: 'figure', data: { title: null, figures: [figureOf(block.measurement, block.label)] } };
    case 'kpis':
      return { kind: 'figure', data: { title: block.measurements[0]?.entity.label ?? null, figures: block.measurements.map((m) => figureOf(m)) } };
    case 'trend': {
      const trend = trendBlock(block.series);
      return { kind: 'trend', data: { form: 'rounds', trend: block.reference === 'none' ? { ...trend, reference: null } : trend } };
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
      const legs: StudioLeg[] = block.measurements.filter((m): m is Measurement & { value: number } => m.value !== null).map((m) => ({ key: m.metric_id, label: sgPart(m.metric_label), value: m.value, display: formatValue(m.value, m.unit) }));
      return { kind: 'strokes_gained', data: { title: block.measurements[0]?.entity.label ?? null, legs, takeaway: null } };
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
      return { kind: 'ranking', data: { label: ev.title, rows: ev.rows, signed: ev.signed, highlight: null, hrefs: Object.fromEntries(ev.rows.map((r) => [r.id, playerStatsHref(r.id)])) } };
    case 'compare':
      return { kind: 'comparison', data: { label: ev.title, team: ev.team, hrefs: Object.fromEntries(ev.team.players.map((pl) => [pl.id, playerStatsHref(pl.id)])) } };
    case 'legs':
      return { kind: 'strokes_gained', data: { title: ev.title, legs: ev.rows.map((r) => ({ key: r.label, label: sgPart(r.label), value: r.value, display: r.display })), takeaway: ev.takeaway || null } };
    case 'tiles':
      return { kind: 'figure', data: { title: ev.title, figures: ev.tiles.map((t) => ({ key: t.label, label: t.label, value: t.value, sub: t.sub, tone: t.tone })) } };
    case 'reads':
    case 'table':
      return { kind: 'table', data: { table: ev.table } };
  }
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

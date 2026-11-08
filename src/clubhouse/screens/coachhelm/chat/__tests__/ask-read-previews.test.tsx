import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { benchmarkBlock, detailTable, evidenceBlocks, fitToPhone, PHONE_TABLE_PX, type AskTable } from '../../../../data/coachhelm-chat-thread';
import { AskEvidenceView } from '../Evidence';
import { lastTurnIsGeneral } from '../ask-scope-window';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';

afterEach(cleanup);

// Staging, 2026-11-08, Cole on a phone: "What does strokes gained putting measure, and what is a good number for a college player?" Three raw
// read tables rendered above a good answer: the reference sections with their slugs, the metric definition, and the benchmark read cut off at 393 px.

const env = (summary: string, detail: unknown, over: Partial<ToolEnvelope> = {}): ToolEnvelope => ({ summary, measurements: [], series: [], detail, coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00Z', ...over });

const reference = env('3 reference sections found. General golf knowledge, not this team’s data.', { kind: 'reference', not_team_data: true, reference: [{ kind: 'reference', section: '1-the-strokes-gained-framework/what-it-is', heading: 'How it works', text: 'x', source: 'CoachHelm golf reference' }] });
const definition = env('1 metric definition.', { kind: 'definition', definitions: [{ kind: 'definition', metric_id: 'sg_putting', label: 'SG: Putting', category: 'sg', unit: 'strokes' }] });
const standingRow = { metric_id: 'gir_pct', metric_label: 'GIR %', direction: 'higher_better', player_value: 58.1, level_average: 61.5, level_size: 70 };
const benchmark = (rows: unknown[], over: Record<string, unknown> = {}) => env('Division III average for 1 metric, with 1 standing row.', { kind: 'benchmark_read', team_level: 'Division III average', benchmarks: [{ kind: 'benchmark', metric_id: 'gir_pct', levels: { d3: { value: 50 } } }], standing: { player_id: 'p1', player: 'Owen Carter', rows }, ...over });

describe('reads that are words never draw a card', () => {
  it('the golf reference and a metric definition draw nothing, even when empty', () => {
    expect(evidenceBlocks(reference)).toEqual([]);
    expect(evidenceBlocks(definition)).toEqual([]);
    expect(evidenceBlocks(env('The golf reference has nothing on that topic.', { kind: 'reference', reference: [] }, { coverage: 'empty' }))).toEqual([]);
  });

  it('the thread draws no empty box for them', () => {
    const { container } = render(<AskEvidenceView envelope={reference} />);
    expect(container.querySelector('.ch-th-evidence')).toBeNull();
    expect(container.textContent).toBe('');
  });

  it('a failed read still says it could not read', () => {
    const failed = env('Could not read the metric definitions.', undefined, { coverage: 'unavailable', coverage_note: 'The definitions query failed.' });
    expect(evidenceBlocks(failed)[0]).toMatchObject({ kind: 'unavailable' });
  });
});

describe('a benchmark read draws a picture of where the player stands, or nothing', () => {
  it('is a track per metric with the player’s value, the level’s tick and no Tour tick unless it was asked for', () => {
    const b = benchmarkBlock(benchmark([standingRow]))!;
    expect(b.kind).toBe('bars');
    expect(b.title).toBe('Owen Carter against Division III');
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toMatchObject({ label: 'GIR %', display: '58%', tone: 'loss' });
    expect(b.rows[0]!.ticks!.map((t) => t.kind)).toEqual(['level']);
    expect(b.note).toBe('Long tick: the average of players at the level.');
    expect(b.table.columns).toEqual(['Metric', 'Value', 'Level']);
  });

  it('adds the Tour tick, labelled, when the read carries it', () => {
    const b = benchmarkBlock(benchmark([{ ...standingRow, tour_value: 66 }]))!;
    expect(b.rows[0]!.ticks!.map((t) => t.kind)).toEqual(['level', 'tour']);
    expect(b.note).toMatch(/Short tick: the Tour/);
    expect(b.table.columns).toEqual(['Metric', 'Value', 'Level', 'Tour']);
  });

  it('grades by the metric’s own direction: lower is better for proximity', () => {
    const b = benchmarkBlock(benchmark([{ metric_id: 'approach_proximity_50_125ft', metric_label: 'Approach Proximity 50-125 yd', player_value: 24, level_average: 27 }, { metric_id: 'sg_putting', metric_label: 'SG: Putting', player_value: -0.4, level_average: 0.1 }]))!;
    expect(b.rows.map((r) => [r.label, r.tone])).toEqual([['Approach Proximity 50-125 yd', 'good'], ['SG Putting', 'loss']]);
    expect(b.rows[0]!.display).toBe('24 ft');
    expect(b.rows.every((r) => r.pct >= 0 && r.pct <= 100 && r.ticks!.every((t) => t.at >= 0 && t.at <= 100))).toBe(true);
  });

  it('says "You" for the player’s own, and draws nothing without a standing', () => {
    expect(benchmarkBlock(benchmark([standingRow], { standing: { player: 'You', rows: [standingRow] } }))!.title).toBe('You against your level');
    expect(benchmarkBlock(benchmark([]))).toBeNull();
    expect(benchmarkBlock(benchmark([{ metric_id: 'not_a_metric', player_value: 1 }]))).toBeNull();
    expect(evidenceBlocks(benchmark([]))).toEqual([]);
    expect(benchmarkBlock(env('x', { kind: 'benchmark_read', benchmarks: [] }))).toBeNull();
  });

  it('renders as the bars with ticks, with the sentence a screen reader gets', () => {
    const { container } = render(<AskEvidenceView envelope={benchmark([{ ...standingRow, tour_value: 66 }])} />);
    expect(container.querySelectorAll('.ch-th-bar')).toHaveLength(1);
    expect(container.querySelectorAll('.ch-th-bar__tick')).toHaveLength(2);
    expect(container.querySelector('.ch-th-bar')!.getAttribute('aria-label')).toBe('GIR %: 58%. Level 62%. Tour 66%');
    // No raw table and no slug on the card.
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).not.toMatch(/benchmark_read|1-the-strokes/);
  });
});

describe('an automatic table fits a phone or is not drawn', () => {
  const widthOf = (t: AskTable) => t.columns.map((_, i) => Math.min(18, Math.max(t.columns[i]!.length, ...t.rows.map((r) => r[i]!.length))) * 6 + 12).reduce((a, b) => a + b, 0);

  it('drops columns from the right until the widest cells fit', () => {
    const wide: AskTable = { caption: 'c', columns: ['Title', 'Start', 'End', 'Location'], rows: [['Team practice at the club', 'Nov 3, 3:00 PM', 'Nov 3, 5:00 PM', 'West Pines Golf Club']] };
    expect(widthOf(wide)).toBeGreaterThan(PHONE_TABLE_PX);
    const fit = fitToPhone(wide)!;
    expect(fit.columns).toEqual(['Title', 'Start', 'End']);
    expect(widthOf(fit)).toBeLessThanOrEqual(PHONE_TABLE_PX);
    expect(fit.rows[0]).toEqual(['Team practice at the club', 'Nov 3, 3:00 PM', 'Nov 3, 5:00 PM']);
  });

  it('keeps a table that already fits (a long cell wraps), and the tasks and events tables keep their four columns', () => {
    const ok: AskTable = { caption: 'c', columns: ['Name', 'Due'], rows: [['Film', 'Nov 5']] };
    expect(fitToPhone(ok)).toEqual(ok);
    const wrapped: AskTable = { caption: 'c', columns: ['A', 'B'], rows: [['x'.repeat(40), 'y'.repeat(40)]] };
    expect(fitToPhone(wrapped)).toEqual(wrapped);
    const four: AskTable = { caption: 'c', columns: ['Title', 'Due', 'Status', 'Priority'], rows: [['Book the bus for the Oct 6 qualifier', 'Oct 29', 'In progress', 'High']] };
    expect(fitToPhone(four)).toEqual(four);
    expect(fitToPhone(null)).toBeNull();
  });

  it('applies to the record table a read falls back to', () => {
    const t = detailTable({ events: [{ title: 'Team practice at the club', start: '2026-11-03T20:00:00Z', end: '2026-11-03T22:00:00Z', location: 'West Pines Golf Club' }], timezone: 'America/New_York' }, 'Events')!;
    expect(widthOf(t)).toBeLessThanOrEqual(PHONE_TABLE_PX);
    expect(t.columns.length).toBeGreaterThanOrEqual(2);
    expect(t.columns.length).toBeLessThan(4);
  });
});

describe('the scope line on a general-knowledge turn', () => {
  const user = { role: 'user' as const, parts: [{ type: 'text' as const, text: 'What is SG putting?' }] };
  const read = (tool: string) => ({ type: 'data-evidence' as const, data: { tool, envelope: {}, ref: 'e1' } });
  const turn = (...tools: string[]) => [user, { role: 'assistant' as const, parts: tools.map(read) as never }];

  it('is general when every read was the reference or a definition, and not otherwise', () => {
    expect(lastTurnIsGeneral(turn('get_golf_reference', 'get_metric_definitions'))).toBe(true);
    expect(lastTurnIsGeneral(turn('get_golf_reference', 'get_benchmarks'))).toBe(false);
    expect(lastTurnIsGeneral(turn('get_player_metrics'))).toBe(false);
    expect(lastTurnIsGeneral([user])).toBe(false);
  });
});

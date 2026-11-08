import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { benchmarkBlock, comparisonWords, detailTable, evidenceBlocks, fitToPhone, PHONE_TABLE_PX, type AskTable } from '../../../../data/coachhelm-chat-thread';
import { AskEvidenceView } from '../Evidence';
import { lastTurnIsGeneral } from '../ask-scope-window';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';

afterEach(cleanup);

// Staging, 2026-11-08, Cole on a phone: "What does strokes gained putting measure, and what is a good number for a college player?" Three raw
// read tables rendered above a good answer: the reference sections with their slugs, the metric definition, and the benchmark read cut off at 393 px.

const env = (summary: string, detail: unknown, over: Partial<ToolEnvelope> = {}): ToolEnvelope => ({ summary, measurements: [], series: [], detail, coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00Z', ...over });

const reference = env('3 reference sections found. General golf knowledge, not this team’s data.', { kind: 'reference', not_team_data: true, reference: [{ kind: 'reference', section: '1-the-strokes-gained-framework/what-it-is', heading: 'How it works', text: 'x', source: 'CoachHelm golf reference' }] });
const definition = env('1 metric definition.', { kind: 'definition', definitions: [{ kind: 'definition', metric_id: 'sg_putting', label: 'SG: Putting', category: 'sg', unit: 'strokes' }] });
const ref = (kind: 'level' | 'team' | 'tour', value: number | null, over: Record<string, unknown> = {}) => ({ kind, label: kind, value, place_percent: null, place_of: null, note: null, ...over });
const allThree = [ref('level', 61.5, { place_percent: 30, place_of: 70 }), ref('team', 57.2, { place_percent: 56, place_of: 9 }), ref('tour', 66)];
const standingRow = { metric_id: 'gir_pct', metric_label: 'GIR %', direction: 'higher_better', player_value: 58.1, comparisons: allThree };
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
  it('is a track per metric with the player’s value and a tick for each of the three references, level, team and Tour', () => {
    const b = benchmarkBlock(benchmark([standingRow]))!;
    expect(b.kind).toBe('bars');
    expect(b.title).toBe('Owen Carter against the level, the team and the Tour');
    expect(b.rows).toHaveLength(1);
    expect(b.rows[0]).toMatchObject({ label: 'GIR %', display: '58%', tone: 'loss' });
    expect(b.rows[0]!.ticks!.map((t) => t.kind)).toEqual(['level', 'team', 'tour']);
    expect(b.rows[0]!.ticks!.map((t) => t.text)).toEqual(['Level 62%', 'Team 57%', 'Tour 66%']);
    expect(b.note).toMatch(/level average, the team average, the Tour/);
    expect(b.table.columns).toEqual(['Metric', 'Value', 'Level', 'Team', 'Tour']);
    expect(b.table.rows).toEqual([['GIR %', '58%', '62%', '57%', '66%']]);
  });

  it('states a missing reference in the card, never drops it and never shows one in place of another', () => {
    const row = { ...standingRow, comparisons: [ref('level', null, { missing_reason: 'not set' }), ref('team', null, { missing_reason: 'fewer than 5 teammates' }), ref('tour', 66)] };
    const b = benchmarkBlock(benchmark([row]))!;
    expect(b.rows[0]!.ticks!.map((t) => t.kind)).toEqual(['tour']);
    expect(b.rows[0]!.tone).toBe('neutral');
    expect(b.table.rows[0]!.slice(2)).toHaveLength(3);
    expect(b.table.rows[0]![2]).not.toMatch(/\d/);
    expect(b.table.rows[0]![3]).not.toMatch(/\d/);
    expect(b.table.rows[0]![4]).toBe('66%');
    expect(b.note).toMatch(/level not set/i);
    expect(b.note).toMatch(/team fewer than 5 teammates/i);
    // A row with no references at all still says so for all three.
    const bare = benchmarkBlock(benchmark([{ ...standingRow, comparisons: [] }]))!;
    expect(bare.table.rows[0]!.slice(2).every((c) => !/\d/.test(c))).toBe(true);
    expect(bare.note).toMatch(/level/i);
    expect(bare.note).toMatch(/tour/i);
  });

  it('grades by the metric’s own direction: lower is better for proximity, against the level', () => {
    const b = benchmarkBlock(benchmark([
      { metric_id: 'approach_proximity_50_125ft', metric_label: 'Approach Proximity 50-125 yd', player_value: 24, comparisons: [ref('level', 27), ref('team', 30), ref('tour', null, { note: 'Not measured the way the Tour’s is.' })] },
      { metric_id: 'sg_putting', metric_label: 'SG: Putting', player_value: -0.4, comparisons: [ref('level', 0.1), ref('team', 0.1), ref('tour', 0)] },
    ]))!;
    expect(b.rows.map((r) => [r.label, r.tone])).toEqual([['Approach Proximity 50-125 yd', 'good'], ['SG Putting', 'loss']]);
    expect(b.rows[0]!.display).toBe('24 ft');
    expect(b.rows.every((r) => r.pct >= 0 && r.pct <= 100 && r.ticks!.every((t) => t.at >= 0 && t.at <= 100))).toBe(true);
  });

  it('says "You" for the player’s own, and draws nothing without a standing', () => {
    expect(benchmarkBlock(benchmark([standingRow], { standing: { player: 'You', rows: [standingRow] } }))!.title).toBe('You against the level, the team and the Tour');
    expect(benchmarkBlock(benchmark([standingRow], { standing: { player: 'You', rows: [standingRow] } }))!.table.columns[1]).toBe('You');
    expect(benchmarkBlock(benchmark([]))).toBeNull();
    expect(benchmarkBlock(benchmark([{ metric_id: 'not_a_metric', player_value: 1 }]))).toBeNull();
    expect(evidenceBlocks(benchmark([]))).toEqual([]);
    expect(benchmarkBlock(env('x', { kind: 'benchmark_read', benchmarks: [] }))).toBeNull();
  });

  it('renders as the bars with three ticks, with the sentence a screen reader gets naming all three', () => {
    const { container } = render(<AskEvidenceView envelope={benchmark([standingRow])} />);
    expect(container.querySelectorAll('.ch-th-bar')).toHaveLength(1);
    expect(container.querySelectorAll('.ch-th-bar__tick')).toHaveLength(3);
    expect(container.querySelector('.ch-th-bar')!.getAttribute('aria-label')).toBe('GIR %: 58%. Level 62%. Team 57%. Tour 66%');
    // No raw table and no slug on the card.
    expect(container.querySelector('table')).toBeNull();
    expect(container.textContent).not.toMatch(/benchmark_read|1-the-strokes/);
  });
});

describe('comparison words (the chip and the card say the same three things)', () => {
  it('lead with the level and its place, then the team and its place, then the Tour', () => {
    expect(comparisonWords(allThree as never, 'percent')).toEqual(['Level 62% · ahead of 30% of 70 players', 'Team 57% · ahead of 56% of the team', 'Tour 66%']);
  });

  it('say why a level is missing: "not set" with no division, "no college figure" for strokes gained, with the team and the Tour still shown', () => {
    expect(comparisonWords([ref('level', null, { missing_reason: 'not set' }), ref('team', 57.2), ref('tour', 66)] as never, 'percent')).toEqual(['Level: not set', 'Team 57%', 'Tour 66%']);
    expect(comparisonWords([ref('level', null, { missing_reason: 'no college figure' }), ref('team', 0.3), ref('tour', 0)] as never, 'strokes')).toEqual(['Level: no college figure', expect.stringMatching(/^Team /), expect.stringMatching(/^Tour /)]);
  });

  it('say what is missing, in the same order', () => {
    const words = comparisonWords([ref('level', null), ref('team', null), ref('tour', 66)] as never, 'percent');
    expect(words).toHaveLength(3);
    expect(words[0]).toBe('Level: not available');
    expect(words[1]).toBe('Team: not available');
    expect(words[2]).toBe('Tour 66%');
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

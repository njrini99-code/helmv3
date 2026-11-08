import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

import { buildAssistantTurn, goalsTable, zeroBasedDomain, benchmarkBlock, comparisonWords, detailTable, evidenceBlocks, withWindowFigures, fitToPhone, PHONE_TABLE_PX, type AskTable } from '../../../../data/coachhelm-chat-thread';
import { AskEvidenceView } from '../Evidence';
import { AskProse } from '../Prose';
import { benchName, formatValue, windowDates } from '../../../../data/coachhelm-chat-thread';
import { rowsCaption } from '@/lib/coachhelm/v3/chat/rows-caption';
import { lastTurnIsGeneral } from '../ask-scope-window';
import type { ToolEnvelope } from '@/lib/coachhelm/v3/chat/provenance';
import { ValidatedComposition } from '@/lib/coachhelm/v3/chat/visuals/composition';

afterEach(cleanup);

// Staging, 2026-11-08, Cole on a phone: "What does strokes gained putting measure, and what is a good number for a college player?" Three raw
// read tables rendered above a good answer: the reference sections with their slugs, the metric definition, and the benchmark read cut off at 393 px.

const env = (summary: string, detail: unknown, over: Partial<ToolEnvelope> = {}): ToolEnvelope => ({ summary, measurements: [], series: [], detail, coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00Z', ...over });

const reference = env('3 reference sections found. General golf knowledge, not this team’s data.', { kind: 'reference', not_team_data: true, reference: [{ kind: 'reference', section: '1-the-strokes-gained-framework/what-it-is', heading: 'How it works', text: 'x', source: 'CoachHelm golf reference' }] });
const definition = env('1 metric definition.', { kind: 'definition', definitions: [{ kind: 'definition', metric_id: 'sg_putting', label: 'SG: Putting', category: 'sg', unit: 'strokes' }] });
const ref = (kind: 'level' | 'team' | 'tour', value: number | null, over: Record<string, unknown> = {}) => ({ kind, label: kind, value, place_percent: null, place_of: null, note: null, ...over });
const allThree = [ref('level', 61.5, { place_percent: 30, place_of: 70 }), ref('team', 57.2, { place: 6, place_of: 9 }), ref('tour', 66)];
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
    expect(b.rows[0]!.ticks!.map((t) => t.short)).toEqual(['Level 62%', 'Team 57%', 'Tour 66%']);
    expect(b.note).toBeNull();
    expect(b.table.columns).toEqual(['Metric', 'Value', 'Level', 'Team', 'Tour']);
    expect(b.table.rows).toEqual([['GIR %', '58%', '62%', '57%', '66%']]);
  });

  it('tags the level by its division ("D3 50%"), and prints the three in words under the track with a mark that matches each tick', () => {
    const div = { ...standingRow, comparisons: [ref('level', 50, { label: 'Division III average' }), ref('team', 33), ref('tour', 66)] };
    const b = benchmarkBlock(benchmark([div]))!;
    expect(b.rows[0]!.ticks!.map((t) => t.short)).toEqual(['D3 50%', 'Team 33%', 'Tour 66%']);
    const { container } = render(<AskEvidenceView envelope={benchmark([div])} />);
    const refs = Array.from(container.querySelectorAll('.ch-th-bar__refs li'));
    expect(refs.map((li) => li.textContent)).toEqual(['D3 50%', 'Team 33%', 'Tour 66%']);
    expect(refs.map((li) => li.getAttribute('data-kind'))).toEqual(['level', 'team', 'tour']);
    expect(container.querySelectorAll('.ch-th-bar__swatch')).toHaveLength(3);
    expect(container.querySelector('.ch-th-bar--bench')).not.toBeNull();
  });

  it('labels a putt band short, in one line: "5–10 ft makes", not "Putts Made 5-10 ft"', () => {
    const putt = { metric_id: 'putts_made_5_10ft_pct', metric_label: 'Putts Made 5-10 ft', player_value: 28, comparisons: allThree };
    expect(benchmarkBlock(benchmark([putt]))!.rows[0]!.label).toBe('5–10 ft makes');
    expect(benchmarkBlock(benchmark([{ ...putt, metric_id: 'putts_made_25_plus_ft_pct' }]))!.rows[0]!.label).toBe('25+ ft makes');
    expect(benchmarkBlock(benchmark([{ ...putt, metric_id: 'putts_made_3_5ft_pct' }]))!.rows[0]!.label).toBe('3–5 ft makes');
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
    // Plain sentences, one per metric (staging, 2026-11-08: "SG Putting: level no college figure SG Putting: team all rounds only").
    expect(b.note).toBe('The team’s level is not set. No team figure for GIR % (fewer than 5 teammates).');
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
    expect(comparisonWords(allThree as never, 'percent')).toEqual(['Level 62% · ahead of 30% of 70 players (all rounds)', 'Team 57% · 6th of 9', 'Tour 66%']);
  });

  it('say a team place as a rank with its ordinal, never a percent, and say the old nightly share is over all rounds', () => {
    const rank = (n: number) => comparisonWords([ref('team', 1, { place: n, place_of: 12 })] as never, 'strokes')[0];
    expect([1, 2, 3, 4, 11, 12, 13, 21, 22].map(rank)).toEqual(['Team +1.0 · 1st of 12', 'Team +1.0 · 2nd of 12', 'Team +1.0 · 3rd of 12', 'Team +1.0 · 4th of 12', 'Team +1.0 · 11th of 12', 'Team +1.0 · 12th of 12', 'Team +1.0 · 13th of 12', 'Team +1.0 · 21st of 12', 'Team +1.0 · 22nd of 12']);
    expect(comparisonWords([ref('team', 57.2, { place_percent: 56, place_of: 9 })] as never, 'percent')).toEqual(['Team 57% · ahead of 56% of the team (all rounds)']);
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

describe('the card’s "you" is the answer’s window figure', () => {
  const putt = { metric_id: 'putts_made_5_10ft_pct', metric_label: 'Putts Made 5-10 ft', player_value: 28, comparisons: allThree };
  const windowRead = (value: number, id = 'p1') => ({
    ...env('Make rate by putt distance over the last 10 rounds.', undefined),
    window_label: 'your last 10 rounds',
    measurements: [{ metric_id: 'putt_make_pct_5-10 ft', metric_label: 'Make rate 5-10 ft', unit: 'percent', value, entity: { kind: 'player', id, label: 'Cole' }, window_start: null, window_end: null, sample_size: 40, sample_unit: 'attempts', source: 'rounds', method: 'm', benchmark: null, direction: 'higher_better', denominator: null }],
  }) as unknown as ToolEnvelope;

  it('takes the window figure for "you", keeps the standing for places, and says so when they differ', () => {
    const bench = benchmark([putt], { standing: { player: 'You', player_id: 'p1', rows: [putt] } });
    const out = withWindowFigures(bench, [bench, windowRead(29)]);
    const b = benchmarkBlock(out)!;
    expect(b.rows[0]!.display).toBe('29%');
    expect(b.note).toMatch(/Your figure is over your last 10 rounds\. The level’s place is over all recorded rounds\./);
    // The envelope the model read is not changed.
    expect((bench.detail as { standing: { rows: Array<{ player_value: number }> } }).standing.rows[0]!.player_value).toBe(28);
  });

  it('says nothing when the two agree, and leaves a row alone when no other read measured it or it is another player', () => {
    const bench = benchmark([putt], { standing: { player: 'Owen Carter', player_id: 'p1', rows: [putt] } });
    expect(benchmarkBlock(withWindowFigures(bench, [bench, windowRead(28.2)]))!.note).toBeNull();
    expect(withWindowFigures(bench, [bench, windowRead(29, 'p2')])).toBe(bench);
    expect(withWindowFigures(bench, [bench])).toBe(bench);
    const named = withWindowFigures(bench, [bench, windowRead(31, 'p1')]);
    expect(benchmarkBlock(named)!.rows[0]!.display).toBe('31%');
    expect(benchmarkBlock(named)!.note).toMatch(/^The figure is over your last 10 rounds\. The level’s place is over all recorded rounds/);
  });
});

describe('the track never starts above zero (a fill under a truncated baseline overstates every gap)', () => {
  const putt = (v: number) => ({ metric_id: 'putts_made_5_10ft_pct', metric_label: 'Putts Made 5-10 ft', player_value: v, comparisons: [ref('level', 50, { label: 'Division I average' }), ref('team', 33), ref('tour', 62)] });

  it('a rate runs from 0 to its largest value rounded up: the fill and every tick are value over that domain', () => {
    const b = benchmarkBlock(benchmark([putt(29)]))!;
    const row = b.rows[0]!;
    // Largest value 62 rounds up to 80 (a nice step), so the domain is 0 to 80.
    expect(row.zero).toBe(0);
    expect(row.pct).toBeCloseTo((29 / 80) * 100, 6);
    expect(row.ticks!.map((t) => [t.kind, t.at])).toEqual([['level', (50 / 80) * 100], ['team', (33 / 80) * 100], ['tour', (62 / 80) * 100]]);
    expect(zeroBasedDomain('percent', [29, 50, 33, 62], false)).toEqual({ min: 0, max: 80 });
  });

  it('is drawn from the left edge at that width, not as a sliver', () => {
    const { container } = render(<AskEvidenceView envelope={benchmark([putt(29)])} />);
    const fill = container.querySelector<HTMLElement>('.ch-th-bar__track > span')!;
    expect(parseFloat(fill.style.width)).toBeCloseTo(36.25, 2);
    expect(container.querySelector('.ch-th-bar__zero')).toBeNull();
  });

  it('a rate is never given a domain past 100, and a distance or a count starts at zero too', () => {
    expect(zeroBasedDomain('percent', [97, 99], false)).toEqual({ min: 0, max: 100 });
    expect(zeroBasedDomain('feet', [24, 27, 30], false)).toEqual({ min: 0, max: 30 });
    expect(zeroBasedDomain('count', [0.4, 1.2], false)).toEqual({ min: 0, max: 1.5 });
  });

  it('says what is missing for each metric as one sentence, not run-together labels', () => {
    const sg = { metric_id: 'sg_putting', metric_label: 'SG: Putting', player_value: -0.4, comparisons: [ref('level', null, { missing_reason: 'no college figure' }), ref('team', null, { missing_reason: 'all rounds only' }), ref('tour', 0)] };
    const gir = { ...standingRow, comparisons: [ref('level', 61.5), ref('team', null, { missing_reason: 'fewer than 5 teammates' }), ref('tour', 66)] };
    const note = benchmarkBlock(benchmark([sg, gir]))!.note;
    expect(note).toBe('No college figure for SG Putting. No team figure for SG Putting (all rounds only). No team figure for GIR % (fewer than 5 teammates).');
  });

  it('strokes gained is centred on zero with a zero rule, and the fill runs from it', () => {
    const sg = { metric_id: 'sg_putting', metric_label: 'SG: Putting', player_value: -0.4, comparisons: [ref('level', null, { missing_reason: 'no college figure' }), ref('team', 0.3), ref('tour', 0)] };
    const b = benchmarkBlock(benchmark([sg]))!;
    const row = b.rows[0]!;
    expect(row.zero).toBe(50);
    expect(row.pct).toBeLessThan(50);
    expect(row.ticks!.find((t) => t.kind === 'tour')!.at).toBe(50);
    const { container } = render(<AskEvidenceView envelope={benchmark([sg])} />);
    const fill = container.querySelector<HTMLElement>('.ch-th-bar__track > span')!;
    expect(parseFloat(fill.style.left)).toBeCloseTo(row.pct, 6);
    expect(parseFloat(fill.style.width)).toBeCloseTo(50 - row.pct, 6);
    expect(container.querySelector('.ch-th-bar__zero')).not.toBeNull();
  });
});

describe('an empty read draws one card, once', () => {
  const empty = (summary: string, over: Partial<ToolEnvelope> = {}) => env(summary, { rows: [] }, { coverage: 'empty', ...over });
  const evidence = (id: string, envelope: ToolEnvelope) => ({ type: 'data-evidence', id, data: { tool: 'get_attendance_summary', envelope, ref: id } });
  const blocksOf = (...envelopes: ToolEnvelope[]) => {
    const turn = buildAssistantTurn({ id: 'a1', role: 'assistant', parts: envelopes.map((e, i) => evidence(`x${i}`, e)) } as never, { isLast: false, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    return turn.blocks.filter((b) => b.kind === 'evidence');
  };

  it('the same empty read made twice is one card, and a read that says nothing at all is none', () => {
    expect(blocksOf(empty('No attendance on record.'), empty('No attendance on record.'))).toHaveLength(1);
    expect(blocksOf(empty('No attendance on record.'), empty('  No attendance  on record. '))).toHaveLength(1);
    expect(blocksOf(empty('')).length).toBe(0);
    expect(blocksOf(empty('No attendance on record.'), empty('No goals set.'))).toHaveLength(2);
  });

  it('draws the note as the card, not the generic lead-in on top of a note that already says it', () => {
    const { container } = render(<AskEvidenceView envelope={empty('No attendance on record.')} />);
    expect(container.textContent).toBe('No attendance on record.');
    const other = render(<AskEvidenceView envelope={empty('Cole has 0 rounds in the window.')} />);
    expect(other.container.textContent).toBe('Nothing recorded for this yet. Cole has 0 rounds in the window.');
  });

  it('keeps the default line only when an empty read is drawn directly; the thread drops a wordless one (above), and one card is one .ch-th-read', () => {
    expect(evidenceBlocks(empty(''))).toEqual([{ kind: 'empty', note: 'Nothing is recorded for this yet.' }]);
    const { container } = render(<AskEvidenceView envelope={empty('No attendance on record.')} />);
    expect(container.querySelectorAll('.ch-th-read')).toHaveLength(1);
  });
});

describe('a reloaded turn draws the same table as the live one', () => {
  // Postgres jsonb hands an object's keys back shortest first, not in the order they were written: the stored turn is the live one reordered.
  const jsonb = (v: unknown): unknown =>
    Array.isArray(v) ? v.map(jsonb) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1)).map(([k, x]) => [k, jsonb(x)])) : v;
  const goal = (n: number, over: Record<string, unknown> = {}) => ({
    goal_id: `g${n}`, player_id: `p${n}`, player: ['Cole Bennett', 'Owen Carter', 'Eli Brandt'][n % 3], title: `Goal ${n}`, category: ['putting', 'approach'][n % 2], metric_id: 'sg_putting',
    state: 'active', set_by: 'manual', baseline_value: 1, current_value: 2, target_value: 3, started_at: '2026-10-01', ends_at: '2026-12-01', ...over,
  });
  const goals = env('5 active goals.', { goals: [0, 1, 2, 3, 4].map((n) => goal(n)) });
  const columns = (e: ToolEnvelope) => {
    const b = evidenceBlocks(e).find((x) => x.kind === 'table');
    return b && b.kind === 'table' ? b.table.columns : null;
  };
  const stored = (e: ToolEnvelope) => ({ ...e, detail: jsonb(e.detail) }) as ToolEnvelope;

  it('the goals table is Player, Title, Category, State, live and stored, and never an internal field', () => {
    expect(columns(goals)).toEqual(['Player', 'Title', 'Category', 'State']);
    expect(columns(stored(goals))).toEqual(['Player', 'Title', 'Category', 'State']);
    expect(Object.keys((stored(goals).detail as { goals: object[] }).goals[0]!).slice(0, 2)).not.toEqual(['player_id', 'player']);
  });

  it('shows the words a coach reads, and the same cells in the same order after the reload', () => {
    const live = evidenceBlocks(goals).find((x) => x.kind === 'table');
    const back = evidenceBlocks(stored(goals)).find((x) => x.kind === 'table');
    expect(live && back && live.kind === 'table' && back.kind === 'table' && back.table.rows).toEqual(live && live.kind === 'table' ? live.table.rows : null);
    const all = JSON.stringify(evidenceBlocks(stored(goals)));
    expect(all).not.toMatch(/Manual|Set by|manual/);
  });

  it('draws the same through the thread builder, from a stored turn', () => {
    const turn = buildAssistantTurn({ id: 'a1', role: 'assistant', parts: [{ type: 'data-evidence', id: 'x', data: { tool: 'get_goals', envelope: stored(goals), ref: 'e1' } }] } as never, { isLast: false, busy: false });
    if (turn.role !== 'assistant') throw new Error('assistant turn expected');
    const ev = turn.blocks.find((b) => b.kind === 'evidence');
    if (!ev || ev.kind !== 'evidence') throw new Error('evidence block expected');
    const { container } = render(<AskEvidenceView envelope={ev.envelope} />);
    expect(Array.from(container.querySelectorAll('thead th')).map((h) => h.textContent)).toEqual(['Player', 'Title', 'Category', 'State']);
  });

  it('a goalsTable leaves out a column nobody has, and the generic record table keeps one order whichever way the keys arrive', () => {
    expect(goalsTable({ goals: [goal(0, { category: null })] }, 'x')!.columns).toEqual(['Player', 'Title', 'State']);
    const tasks = env('2 open tasks.', { tasks: [{ task_id: 't1', title: 'Book bus', due_date: '2026-10-29', status: 'pending', priority: 'high' }, { task_id: 't2', title: 'Order balls', due_date: '2026-10-31', status: 'pending', priority: 'low' }] });
    expect(columns(tasks)).toEqual(columns(stored(tasks)));
    const sourced = env('rows', { rows: [{ player: 'Cole', title: 'x', source: 'stats cache', set_by: 'manual', state: 'active' }] });
    expect(columns(sourced)).toEqual(['Player', 'Title', 'State']);
  });
});

describe('a table says the unit of its columns', () => {
  it('puts ft and % in the heading of a read that carries units', () => {
    const e = env('1 row of career statistics.', { kind: 'team_data', rows: [{ player: 'Cole', approach_proximity_average: 15.3, gir_percentage: 61.2 }], units: { approach_proximity_average: 'feet', gir_percentage: 'percent' } });
    const t = detailTable(e.detail, e.summary)!;
    expect(t.columns).toEqual(['Player', 'GIR percentage (%)', 'Approach proximity average (ft)']);
  });
});

describe('a benchmark row the server read over a window is not replaced by another read', () => {
  it('keeps the row’s own figure and window, and says the level’s place is over all recorded rounds', () => {
    const row = { metric_id: 'putts_made_5_10ft_pct', metric_label: 'Putts Made 5-10 ft', player_value: 29, window: 'last10', window_label: 'the last 10 rounds', standing_value: 28, comparisons: allThree };
    const bench = benchmark([row], { standing: { player: 'You', player_id: 'p1', rows: [row] } });
    const other = { ...env('Make rate by putt distance.', undefined), measurements: [{ metric_id: 'putt_make_pct_5-10 ft', unit: 'percent', value: 31, entity: { kind: 'player', id: 'p1', label: 'Cole' }, window_start: null, window_end: null, sample_size: 40, sample_unit: 'attempts', source: 'rounds', method: 'm', benchmark: null, direction: 'higher_better', denominator: null, metric_label: 'x' }] } as unknown as ToolEnvelope;
    expect(withWindowFigures(bench, [bench, other])).toBe(bench);
    const b = benchmarkBlock(bench)!;
    expect(b.rows[0]!.display).toBe('29%');
    expect(b.note).toBe('Your figure is over the last 10 rounds. The level’s place is over all recorded rounds.');
  });
});

describe('the answer leads with the worked-out result, and a recovered failure stays out of it', () => {
  const rounds = (n: number) =>
    env(`${n} rows of rounds.`, { kind: 'team_data', rows: Array.from({ length: n }, (_, i) => ({ player: i % 2 ? 'Owen Carter' : 'Cole Bennett', player_id: `p${i % 2}`, status: 'completed', round_date: `2026-10-${String(10 + i).padStart(2, '0')}`, round_type: 'tournament', course_name: 'Pines', total_score: 74 + i })), row_count: n, limit: 200 });
  const failedSummary = env('That query was not run.', { refused: true, reason: 'There is no field "right_three_putts" in these rows. They have: id, round_date, player.' }, { coverage: 'unavailable', coverage_note: 'There is no field "right_three_putts" in these rows. They have: id, round_date, player.' });
  const listed = env('3 figures worked out from 26 rows.', {
    kind: 'summary',
    rows_used: 26,
    results: [{ id: 'summary:l', op: 'list', rows: 2, shown: 2 }],
    rows: [{ player: 'Cole Bennett', round_date: '2026-10-21', course_name: 'Pines', total_score: 74, three_putts: 3 }, { player: 'Owen Carter', round_date: '2026-10-21', course_name: 'Pines', total_score: 78, three_putts: 3 }],
    row_count: 2,
    matching_rows: 2,
  }, { measurements: [{ metric_id: 'summary:l', metric_label: 'Rows listed', unit: 'count', value: 2, entity: { kind: 'team', id: 'team-1', label: 'Varsity' }, window_start: null, window_end: null, sample_size: 2, sample_unit: 'rows', source: 'summary', method: 'summary_list', benchmark: null, direction: null, denominator: null }] as never });
  const count = env('1 figure worked out from 26 rows.', { kind: 'summary', rows_used: 26, results: [{ id: 'summary:c', op: 'count', value: 7 }] }, { measurements: [{ metric_id: 'summary:c', metric_label: 'Rows', unit: 'count', value: 7, entity: { kind: 'team', id: 'team-1', label: 'Varsity' }, window_start: null, window_end: null, sample_size: 7, sample_unit: 'rows', source: 'summary', method: 'summary_count', benchmark: null, direction: null, denominator: null }] as never });

  const ev = (id: string, tool: string, envelope: ToolEnvelope) => ({ type: 'data-evidence', id: `ev-${id}`, data: { tool, envelope, ref: id } });
  const step = (id: string, tool: string, state: 'done' | 'failed') => ({ type: 'data-progress', id: `st-${id}`, data: { label: 'Working out the figures', tool, state, done: 'Worked out the figures', ...(state === 'failed' ? { detail: 'There is no field "right_three_putts"' } : {}) } });
  const turn = (...parts: unknown[]) => {
    const t = buildAssistantTurn({ id: 'a1', role: 'assistant', parts } as never, { isLast: false, busy: false });
    if (t.role !== 'assistant') throw new Error('assistant turn expected');
    return t;
  };
  const shown = (t: ReturnType<typeof turn>) => t.blocks.filter((b) => b.kind === 'evidence').flatMap((b) => (b.kind === 'evidence' ? evidenceBlocks(b.envelope) : []));
  const text = (t: ReturnType<typeof turn>) => t.blocks.filter((b) => b.kind === 'evidence').map((b) => (b.kind === 'evidence' ? render(<AskEvidenceView envelope={b.envelope} />).container.textContent : '')).join(' ');

  it('hides a failed call the model recovered from; the steps say so plainly, with no field names', () => {
    const t = turn(step('1', 'summarise_data', 'failed'), ev('e1', 'summarise_data', failedSummary), step('2', 'summarise_data', 'done'), ev('e2', 'summarise_data', listed));
    expect(JSON.stringify(shown(t))).not.toMatch(/right_three_putts|Could not read|not run/i);
    expect(text(t)).not.toMatch(/right_three_putts|field/);
    expect(t.steps.map((s) => s.done)).toEqual(['One calculation was retried', 'Worked out the figures']);
    expect(JSON.stringify(t.steps)).not.toMatch(/right_three_putts/);
    // Both are still reads in the disclosure.
    expect(t.reads!.map((r) => r.ref)).toEqual(['e1', 'e2']);
    expect(t.reads!.every((r) => r.name === 'Worked out the figures')).toBe(true);
  });

  it('still tells the coach when nothing recovered, in a plain sentence', () => {
    const t = turn(step('1', 'summarise_data', 'failed'), ev('e1', 'summarise_data', failedSummary));
    expect(text(t)).toMatch(/could not be completed/);
    expect(text(t)).not.toMatch(/right_three_putts|field/);
    expect(t.steps[0]!.state).toBe('failed');
    // Another tool's failure is told as it was, if nothing came after it.
    const other = turn(ev('e1', 'query_team_data', env('Could not read rounds.', undefined, { coverage: 'unavailable', coverage_note: 'That read failed.' })));
    expect(shown(other)[0]).toMatchObject({ kind: 'unavailable' });
  });

  it('a list result is the answer’s table, and the raw record lists it was built from are reads, not tables above it', () => {
    const t = turn(ev('e1', 'query_team_data', rounds(26)), ev('e2', 'query_team_data', rounds(25)), ev('e3', 'summarise_data', listed));
    const blocks = shown(t);
    expect(blocks).toHaveLength(1);
    const table = blocks[0]!;
    if (table.kind !== 'table') throw new Error('table expected');
    expect(table.table.columns).toEqual(['Player', 'Date', '3-putts', 'Course', 'Score']);
    expect(table.table.rows).toHaveLength(2);
    // The "Rows listed: 2" figure is the table's own: no second card for it.
    expect(blocks.some((b) => b.kind === 'tiles')).toBe(false);
    expect(t.reads!).toHaveLength(3);
    expect(t.reads!.map((r) => r.ref)).toEqual(['e1', 'e2', 'e3']);
    expect(t.reads![2]!.name).toBe('Worked out the figures');
  });

  it('a summary that names its sources folds exactly those reads; an unrelated read before it stays drawn', () => {
    const attendance = env('3 rows of attendance.', { kind: 'team_data', rows: [{ player: 'Cole Bennett', event: 'Practice', status: 'present' }], row_count: 1 });
    const named = env(listed.summary, { ...(listed.detail as object), sources: ['e1'] }, { measurements: listed.measurements });
    const t = turn(ev('e1', 'query_team_data', rounds(6)), ev('e2', 'query_team_data', attendance), ev('e3', 'summarise_data', named));
    const kinds = shown(t).map((b) => b.kind);
    // The rounds it was built from are folded; the attendance table is not.
    expect(kinds).toEqual(['table', 'table']);
    expect(shown(t).map((b) => (b.kind === 'table' ? b.table.columns[0] : null))).toEqual(['Player', 'Player']);
    expect(JSON.stringify(shown(t))).toContain('Practice');
    expect(shown(t).map((b) => (b.kind === 'table' ? b.table.rows.length : 0))).toEqual([1, 2]);
    expect(t.reads!.map((r) => r.ref)).toEqual(['e1', 'e2', 'e3']);
    // Sources that name nothing (a summary of a query) fold nothing; with no `sources` at all the earlier rule folds every record list before it.
    const none = env(listed.summary, { ...(listed.detail as object), sources: [] }, { measurements: listed.measurements });
    expect(shown(turn(ev('e1', 'query_team_data', rounds(6)), ev('e2', 'summarise_data', none)))).toHaveLength(2);
    expect(shown(turn(ev('e1', 'query_team_data', rounds(6)), ev('e2', 'query_team_data', attendance), ev('e3', 'summarise_data', listed)))).toHaveLength(1);
  });

  it('a figure result (a count, a rank, a difference) is one compact figure card', () => {
    const t = turn(ev('e1', 'query_team_data', rounds(26)), ev('e2', 'summarise_data', count));
    const blocks = shown(t);
    expect(blocks).toHaveLength(1);
    expect(blocks[0]).toMatchObject({ kind: 'tiles' });
  });

  it('the raw lists stay when no result was worked out from them', () => {
    expect(shown(turn(ev('e1', 'query_team_data', rounds(6))))).toHaveLength(1);
    // A list longer than the table draws is the model's working set: the table would show 8 of 26 under an answer about 2 of them.
    expect(shown(turn(ev('e1', 'query_team_data', rounds(26))))).toHaveLength(0);
    expect(turn(ev('e1', 'query_team_data', rounds(26))).reads!.map((r) => r.ref)).toEqual(['e1']);
    // A summary that came first does not hide a list read after it.
    expect(shown(turn(ev('e1', 'summarise_data', count), ev('e2', 'query_team_data', rounds(3)))).map((b) => b.kind)).toEqual(['tiles', 'table']);
  });

  it('a raw rounds table picks the columns the question asked for first, then who, when and how, and never leads with status', () => {
    const t = detailTable({ kind: 'team_data', rows: rounds(4).detail && (rounds(4).detail as { rows: object[] }).rows.map((r) => ({ ...r, total_putts: 31, three_putts: 2 })) }, '4 rows of rounds')!;
    expect(t.columns[0]).toBe('Player');
    expect(t.columns).toContain('Putts');
    expect(t.columns).toContain('3-putts');
    expect(t.columns).not.toContain('Status');
    expect(t.columns).not.toContain('Round type');
    // Only the generic labels: they are the last resort, after every real column.
    const labelsOnly = detailTable({ rows: [{ player: 'Cole', status: 'completed', round_type: 'tournament', total_score: 74 }] }, 'x')!;
    expect(labelsOnly.columns).toEqual(['Player', 'Score', 'Status', 'Round type']);
  });

  it('draws the same table after a reload (jsonb hands the keys back shortest first)', () => {
    const jsonb = (v: unknown): unknown => (Array.isArray(v) ? v.map(jsonb) : v && typeof v === 'object' ? Object.fromEntries(Object.entries(v as object).sort(([a], [b]) => a.length - b.length || (a < b ? -1 : 1)).map(([k, x]) => [k, jsonb(x)])) : v);
    const live = evidenceBlocks(listed)[0];
    const back = evidenceBlocks({ ...listed, detail: jsonb(listed.detail) } as ToolEnvelope)[0];
    expect(live && back && live.kind === 'table' && back.kind === 'table' && back.table).toEqual(live && live.kind === 'table' ? live.table : null);
  });
});

// Staging, 2026-11-08, conversations 4268fbfd and 9c74f095 (Cole's last 5 rounds with putts and three-putts).
describe('what a read says about itself, in a coach’s words', () => {
  const ev = (id: string, tool: string, envelope: ToolEnvelope) => ({ type: 'data-evidence', id: `ev-${id}`, data: { tool, envelope, ref: id } });
  const turn = (...parts: unknown[]) => {
    const t = buildAssistantTurn({ id: 'a1', role: 'assistant', parts } as never, { isLast: false, busy: false });
    if (t.role !== 'assistant') throw new Error('assistant turn expected');
    return t;
  };
  const drawn = (t: ReturnType<typeof turn>) => t.blocks.filter((b) => b.kind === 'evidence').flatMap((b) => (b.kind === 'evidence' ? evidenceBlocks(b.envelope) : []));
  const teamData = (rows: Array<Record<string, unknown>>, over: Record<string, unknown> = {}, e: Partial<ToolEnvelope> = {}) => env(`${rows.length} rows of rounds.`, { kind: 'team_data', rows, row_count: rows.length, ...over }, e);

  it('the benchmark line names the year once: "PGA Tour (2024)", not "PGA Tour 2024, 2024"', () => {
    expect(benchName('PGA Tour 2024', '2024')).toBe('PGA Tour (2024)');
    expect(benchName('PGA Tour', '2024')).toBe('PGA Tour (2024)');
    expect(benchName('LPGA Tour 2025', '2025')).toBe('LPGA Tour (2025)');
    expect(benchName('PGA Tour 2024', '')).toBe('PGA Tour 2024');
    const m = { metric_id: 'sg_total', metric_label: 'Strokes gained', unit: 'strokes', value: -1, entity: { kind: 'player', id: 'p', label: 'Owen Carter' }, window_start: null, window_end: null, sample_size: 8, sample_unit: 'rounds', as_of: '2026-11-08T00:00:00Z', coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, direction: 'higher_better', benchmark: { source: 'PGA Tour 2024', version: '2024', value: 0, omitted_for_cohort: false } };
    const blocks = evidenceBlocks({ ...env('x', undefined), measurements: [m] } as unknown as ToolEnvelope);
    expect(JSON.stringify(blocks)).toContain('PGA Tour (2024): 0.0');
    expect(JSON.stringify(blocks)).not.toContain('2024, 2024');
  });

  it('a read chip names the dates it covers, not a count of days', () => {
    const m = { metric_id: 'sg_total', metric_label: 'Strokes gained', unit: 'strokes', value: -1, entity: { kind: 'player', id: 'p', label: 'Owen Carter' }, window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds', as_of: '2026-11-08T00:00:00Z', coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, direction: 'higher_better', benchmark: null };
    const t = turn(ev('e1', 'get_player_metrics', { ...env('x', undefined), measurements: [m] } as unknown as ToolEnvelope));
    expect(t.reads![0]!.chip).toMatch(/ · Jun 9–Sep 26$/);
    expect(t.reads![0]!.chip).not.toMatch(/days/);
    expect(windowDates({ window_start: '2025-10-01', window_end: '2026-03-02' })).toBe('Oct 1, 2025–Mar 2, 2026');
    expect(windowDates({ window_start: null, window_end: null })).toBeNull();
    // No window: just the read's name.
    expect(turn(ev('e1', 'get_player_metrics', env('x', undefined))).reads![0]!.chip).toBe(turn(ev('e1', 'get_player_metrics', env('x', undefined))).reads![0]!.name);
  });

  it('a cut list is captioned "Newest 5 of 127 rounds"; the model’s note about columns and filters never reaches the coach', () => {
    const rows = Array.from({ length: 5 }, (_, i) => ({ player: 'Cole Bennett', player_id: 'p-cole', round_date: `2026-10-${String(21 - i).padStart(2, '0')}`, total_score: 74 + i }));
    const note = 'Showing the first 5 of 127 rows, ordered by round_date (newest first). The other 122 are not shown: say so, and narrow the filters for the rest.';
    const e = teamData(rows, { total_rows: 127, truncated: true, ordered_by: 'round_date', newest_first: true, noun: 'rounds' }, { coverage: 'partial', coverage_note: note });
    const block = evidenceBlocks(e)[0]!;
    expect(block).toMatchObject({ kind: 'table', note: 'Newest 5 of 127 rounds' });
    const { container } = render(<AskEvidenceView envelope={e} />);
    expect(container.textContent).toContain('Newest 5 of 127 rounds');
    expect(container.textContent).not.toMatch(/round_date|narrow the filters|say so|ordered by/);
    expect(rowsCaption({ kind: 'team_data', truncated: true, row_count: 50, ordered_by: 'total_score', newest_first: true, noun: 'rounds' })).toBe('First 50 rounds, and there may be more');
    expect(rowsCaption({ kind: 'team_data', truncated: false, row_count: 5 })).toBeNull();
  });

  it('two reads of the same rounds are one table, the one with three-putts and putts; a read of other rounds stays', () => {
    const recent = env('Cole’s last 5 recorded rounds.', {
      player: { player_id: 'p-cole', name: 'Cole Bennett' },
      rounds: Array.from({ length: 5 }, (_, i) => ({ round_id: `r${i}`, date: `2026-10-${String(21 - i).padStart(2, '0')}`, course: 'Pines', round_type: 'tournament', holes: 18, total_score: 74 + i, to_par: 2 + i, putts: 31, sg_total: -1 })),
    });
    const lines = teamData(Array.from({ length: 5 }, (_, i) => ({ player: 'Cole Bennett', player_id: 'p-cole', round_date: `2026-10-${String(21 - i).padStart(2, '0')}`, total_putts: 30 + i, three_putts: 2 })));
    const other = teamData([{ player: 'Owen Carter', player_id: 'p-owen', round_date: '2026-09-02', total_putts: 29, three_putts: 1 }]);
    const t = turn(ev('e1', 'get_recent_rounds', recent), ev('e2', 'query_team_data', lines), ev('e3', 'query_team_data', other));
    const tables = drawn(t).filter((b) => b.kind === 'table');
    expect(tables).toHaveLength(2);
    expect(tables[0]!.kind === 'table' && tables[0]!.table.columns).toContain('3-putts');
    expect(tables[1]!.kind === 'table' && tables[1]!.table.rows[0]).toContain('Owen Carter');
    // The order they came in does not matter.
    expect(drawn(turn(ev('e2', 'query_team_data', lines), ev('e1', 'get_recent_rounds', recent))).filter((b) => b.kind === 'table')).toHaveLength(1);
    // Both are still reads in the disclosure.
    expect(t.reads!.map((r) => r.ref)).toEqual(['e1', 'e2', 'e3']);
  });

  it('a round still being played shows "In progress", and a round with no putts recorded never shows 0', () => {
    const rows = [
      { player: 'Cole Bennett', status: 'in_progress', round_date: '2026-10-22', total_putts: 0, three_putts: 0 },
      { player: 'Cole Bennett', status: 'completed', round_date: '2026-10-21', total_putts: 0, three_putts: 0 },
      { player: 'Cole Bennett', status: 'completed', round_date: '2026-10-20', total_putts: 31, three_putts: 0 },
    ];
    const t = detailTable({ kind: 'team_data', rows }, 'rounds')!;
    const col = (name: string) => t.rows.map((r) => r[t.columns.indexOf(name)]);
    expect(col('Putts')).toEqual(['In progress', formatNone(), '31']);
    expect(col('3-putts')).toEqual(['In progress', formatNone(), '0']);
    // The recent-rounds table the same.
    const recent = evidenceBlocks(env('Cole’s last 2 recorded rounds.', { player: { player_id: 'p-cole' }, rounds: [{ date: '2026-10-21', course: 'Pines', total_score: 74, to_par: 2, putts: 0, sg_total: -1 }, { date: '2026-10-20', course: 'Pines', total_score: 75, to_par: 3, putts: 31, sg_total: -2 }] }))[0]!;
    if (recent.kind !== 'table') throw new Error('table expected');
    expect(recent.table.rows.map((r) => r[recent.table.columns.indexOf('Putts')])).toEqual([formatNone(), '31']);
  });

  it('a read’s chip is drawn once in a paragraph or list, not after every bullet', () => {
    const known = new Set(['e1', 'e2']);
    const chip = { known, draw: (ref: string) => <span data-chip={ref}>chip {ref}</span> };
    const text = 'The newest rounds. [e1]\n\n- 74, 31 putts. [e1]\n- 75, 33 putts. [e1]\n- 77, 30 putts. [e2]\n- 79, 35 putts. [e2]\n\nAll of it. [e1] And more. [e1]';
    const { container } = render(<AskProse text={text} playersByName={{}} chip={chip} />);
    const chips = Array.from(container.querySelectorAll('[data-chip]')).map((c) => c.getAttribute('data-chip'));
    // paragraph 1: e1; the list: e1 once, e2 once; the last paragraph: e1 once.
    expect(chips).toEqual(['e1', 'e1', 'e2', 'e1']);
    expect(container.textContent).not.toMatch(/\[e\d\]/);
    expect(container.textContent).toContain('75, 33 putts.');
  });
});

const formatNone = () => formatValue(null, 'count');

// Staging, 2026-11-08, conversations 21a4a215 and 4aa35b53 (86ced837cd).
describe('a coach never reads the model’s notes, and a visual stands in for the chart it repeats', () => {
  const modelNote = 'Showing the first 5 of 124 rows, ordered by round_date (newest first). The other 119 are not shown: say so, and narrow the filters for the rest.';
  const m = (id: string, label: string, value: number | null) => ({ metric_id: 'sg_approach', metric_label: 'Strokes gained approach', unit: 'strokes', value, entity: { kind: 'player', id, label }, window_start: '2026-06-09', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds', as_of: '2026-11-08T00:00:00Z', coverage: 'complete', coverage_note: null, source: 'rounds', method: 'm', denominator: null, benchmark: null, direction: 'higher_better' });
  const ev = (id: string, tool: string, envelope: ToolEnvelope) => ({ type: 'data-evidence', id: `ev-${id}`, data: { tool, envelope, ref: id } });
  const turn = (...parts: unknown[]) => {
    const t = buildAssistantTurn({ id: 'a1', role: 'assistant', parts } as never, { isLast: false, busy: false });
    if (t.role !== 'assistant') throw new Error('assistant turn expected');
    return t;
  };

  it('a summary cut short by its source is captioned in words ("Worked out from the newest 5 of 124 rounds"), never with the source’s note', () => {
    const summary = env('1 figure worked out from 5 rows.', { kind: 'summary', rows_used: 5, results: [], sources: ['e1'], caption: 'Worked out from the newest 5 of 124 rounds' }, {
      coverage: 'partial',
      coverage_note: modelNote,
      measurements: [{ ...m('p', 'Cole Bennett', 10), metric_id: 'summary:t', metric_label: 'Three-putts, total, all 5 rounds', unit: 'count', method: 'summary_sum' }] as never,
    });
    const blocks = evidenceBlocks(summary);
    expect(JSON.stringify(blocks)).toContain('Worked out from the newest 5 of 124 rounds');
    const { container } = render(<AskEvidenceView envelope={summary} />);
    expect(container.textContent).not.toMatch(/round_date|narrow the filters|say so|ordered by/);
    // A cut read that carries no caption of its own draws no note at all, rather than the model’s.
    const bare = evidenceBlocks({ ...summary, detail: undefined });
    expect(JSON.stringify(bare)).not.toMatch(/round_date|narrow the filters|say so/);
    // A note written for the coach still shows.
    expect(JSON.stringify(evidenceBlocks({ ...summary, detail: undefined, coverage_note: '6 of 8 players have a round in the last 30 days. The other 2 are left out.' }))).toContain('6 of 8 players');
  });

  it('an unavailable or empty read says it in plain words when its note is the model’s', () => {
    const failed = env('Could not read the rounds.', undefined, { coverage: 'unavailable', coverage_note: 'There is no field "right_three_putts" in these rows. They have: id, round_date.' });
    expect(JSON.stringify(evidenceBlocks(failed))).not.toMatch(/right_three_putts|round_date/);
    const empty = env('No rounds matched.', undefined, { coverage: 'empty', coverage_note: 'No rows for status = in_progress and round_type.' });
    expect(JSON.stringify(evidenceBlocks(empty))).not.toMatch(/round_type|in_progress/);
  });

  it('a model visual that plots the same metric for the same players folds the ranking read’s own chart; a different one does not', () => {
    const players = Array.from({ length: 7 }, (_, i) => m(`p${i}`, `Player ${i}`, -1 - i / 10));
    // Seven plotted, one more with no figure: the read still has a subject the visual could not plot, and that is not a reason to draw the bars twice.
    const ranking = { ...env('Strokes gained approach, 8 players.', { metric_id: 'sg_approach', team_ranking: true }), measurements: [...players, m('p8', 'Player 8', null)] } as unknown as ToolEnvelope;
    const composition = (ms: unknown[]) => ValidatedComposition.parse({ artifactId: 'vc-x', schemaVersion: 1, kind: 'compose', title: 'Owen sits sixth of seven', lede: null, layout: 'stack', blocks: [{ type: 'ranking', measurements: ms, order: 'as_read', highlight: null }], evidenceRefs: [], coverageNotes: [], dataHash: 'x', createdAt: '2026-11-08T00:00:00Z' });
    const kinds = (c: unknown) => turn(ev('e1', 'get_team_metric_ranking', ranking), { type: 'data-visual-composition', id: 'v', data: c }).blocks.map((b) => b.kind);
    expect(kinds(composition(players))).toEqual(['composition']);
    // A visual of three of the seven leaves the read’s chart in place.
    expect(kinds(composition(players.slice(0, 3)))).toEqual(['evidence', 'composition']);
  });
});

import { describe, expect, it } from 'vitest';
import type { ToolEnvelope } from '../../provenance';
import { computedOf, methodOf } from '../loop';

const TOOLS = ['get_player_stats', 'get_team_stats', 'code_execution'];

const read = (players: string[], window?: string): ToolEnvelope =>
  ({
    summary: 'Putting',
    measurements: players.map((id) => ({ metric_id: 'putts', metric_label: 'Putts', unit: 'count', value: 30, entity: { kind: 'player', id, label: id }, window_start: null, window_end: null, sample_size: 8, sample_unit: 'rounds', as_of: 'now', coverage: 'complete', coverage_note: null, source: 's', method: 'mean', denominator: null, benchmark: null, direction: null })),
    series: [],
    coverage: 'complete',
    coverage_note: null,
    as_of: 'now',
    ...(window ? { window_label: window } : {}),
  }) as ToolEnvelope;

describe('the method line of the model’s code', () => {
  it('is the marked line only, as a sentence', () => {
    expect(methodOf('# Method: Averaged each player’s putts per round over their last 8 rounds, then ranked them\nrows = []', TOOLS)).toBe('Averaged each player’s putts per round over their last 8 rounds, then ranked them.');
    expect(methodOf('import json\n#  method:  Counted the rounds under 75.  \nx = 1', TOOLS)).toBe('Counted the rounds under 75.');
    // Any other comment is the model talking to itself.
    expect(methodOf('# fetch everyone, then average\nrows = []', TOOLS)).toBeNull();
    expect(methodOf('rows = []', TOOLS)).toBeNull();
    expect(methodOf(undefined, TOOLS)).toBeNull();
  });

  it('is never shown when it names a tool or reads as code', () => {
    expect(methodOf('# Method: Called get_player_stats for each player and averaged', TOOLS)).toBeNull();
    expect(methodOf('# Method: Ran code_execution over the roster', TOOLS)).toBeNull();
    expect(methodOf('# Method: mean(rows[i].putts) for each i', TOOLS)).toBeNull();
    expect(methodOf('# Method: read golf_rounds and averaged', TOOLS)).toBeNull();
    expect(methodOf(`# Method: ${'very long '.repeat(40)}`, TOOLS)).toBeNull();
  });
});

describe('what a run of the model’s code covered', () => {
  const reads = new Map<string, ToolEnvelope>([
    ['e1', read(['p1'], 'Last 8 rounds')],
    ['e2', read(['p2', 'p3'], 'Last 8 rounds')],
    ['e3', read(['p1'], 'This season')],
    ['e4', read([])],
  ]);

  it('names its reads in the order they were asked for, and counts each player once', () => {
    expect(computedOf({ refs: ['e2', 'e1'], method: null }, reads)).toEqual({ refs: ['e1', 'e2'], reads: 2, players: 3, window: 'Last 8 rounds' });
    expect(computedOf({ refs: ['e10', 'e9', 'e1'], method: null }, reads).refs).toEqual(['e1', 'e9', 'e10']);
  });

  it('gives a window only when every read shares it', () => {
    expect(computedOf({ refs: ['e1', 'e3'], method: null }, reads)).toMatchObject({ players: 1, window: null });
    expect(computedOf({ refs: ['e1', 'e4'], method: null }, reads).window).toBeNull();
    expect(computedOf({ refs: ['e4'], method: null }, reads)).toEqual({ refs: ['e4'], reads: 1, players: 0, window: null });
  });

  it('is still a part when the code only did arithmetic, and carries the method when there is one', () => {
    expect(computedOf({ refs: [], method: 'Added the three rounds.' }, reads)).toEqual({ refs: [], reads: 0, players: 0, window: null, method: 'Added the three rounds.' });
  });
});

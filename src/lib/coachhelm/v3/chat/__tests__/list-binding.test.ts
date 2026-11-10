import { describe, expect, it } from 'vitest';
import { auditNumericClaims, type Measurement } from '../provenance';

// Replay f210d104: "Off the tee and around the green: -0.32 and -0.20 per round" gave "around the green" the figure for the tee (its cue took the
// nearest number). A list of areas followed by a list of numbers pairs them in order. Replay a2d53134: "If you use -2.33, Owen's gap is larger" picks
// up again a figure the sentence before audited as the ranking's own team average.
const OWEN = '8091da4b-dbc9-47f3-80f1-be37c96b2c91';
const roster = [{ id: OWEN, name: 'Owen Carter' }];
const m = (metric: string, value: number, entity: Measurement['entity'] = { kind: 'player', id: OWEN, label: 'Owen Carter' }): Measurement => ({ metric_id: metric, metric_label: metric, unit: 'strokes', value, entity, window_start: '2026-06-12', window_end: '2026-09-26', sample_size: 8, sample_unit: 'rounds', as_of: '2026-11-08T00:00:00.000Z', coverage: 'complete', coverage_note: null, source: 'x', method: 'x', denominator: null, benchmark: null, direction: null }) as unknown as Measurement;
const measurements = [m('sg_tee', -0.32), m('sg_around_green', -0.2), m('sg_approach', -4.16), m('sg_approach', -2.33, { kind: 'team', id: 't1', label: 'Team' })];
const run = (text: string) => auditNumericClaims(text, measurements, [], [], [], 'America/New_York', { players: roster }).map((c) => c.text);

describe('a list of areas followed by a list of numbers', () => {
  it('pairs them in order', () => {
    expect(run('- **Off the tee and around the green:** -0.32 and -0.20 per round, close to the baseline.')).toEqual([]);
    expect(run('Owen is at -0.32 off the tee and -0.20 around the green.')).toEqual([]);
  });
  it('still refuses the pair swapped', () => {
    expect(run('- **Off the tee and around the green:** -0.20 and -0.32 per round, close to the baseline.').sort()).toEqual(['-0.20', '-0.32'].sort());
  });
  it('a list of one area, or a list the numbers do not follow, binds as before', () => {
    expect(run('Owen is at -0.32 around the green.')).toEqual(['-0.32']);
  });
});

describe('"if you use X" picking up a figure already audited', () => {
  const base = 'The ranking read also printed its own team average of -2.33 for approach. ';
  it('is the same claim as the earlier sentence', () => {
    expect(run(`${base}If you use -2.33, Owen's gap is larger.`)).toEqual([]);
  });
  it('a figure that was not there before is a new claim', () => {
    expect(run(`${base}If you use -2.9, Owen's gap is larger.`)).toEqual(['-2.9']);
  });
  it('a plain repeat beside a player is still checked', () => {
    expect(run(`${base}Owen is at -2.33 for approach.`)).toEqual(['-2.33']);
  });
});

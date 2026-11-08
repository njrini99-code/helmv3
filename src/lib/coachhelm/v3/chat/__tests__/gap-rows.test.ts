import { describe, expect, it } from 'vitest';
import { auditNumericClaims, collectEnvelopeNumbers, type ToolEnvelope } from '../provenance';

// Replay 4eb455e5: "-0.45 strokes per round … against a team average of -0.09 … a gap of roughly 0.36 strokes/round" was withheld. The gap is
// the row's own player_value minus its team_average.
const MASON = 'p-mason';
const roster = [{ id: MASON, name: 'Mason Rivers' }];
const read = {
  summary: 'Mason Rivers is furthest behind the team on strokes gained around the green.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z',
  detail: { player: { name: 'Mason Rivers', player_id: MASON }, gaps: [{ unit: 'strokes', direction: 'higher_better', metric_id: 'sg_around_green', metric_label: 'Strokes gained around the green', player_value: -0.45, team_average: -0.09, team_peers_compared: 6 }] },
} as unknown as ToolEnvelope;
const audit = (text: string) => auditNumericClaims(text, [], [], collectEnvelopeNumbers(read), [], 'America/New_York', { players: roster }).map((c) => c.text);

describe('a gap row’s own gap', () => {
  it('is supported: player value minus team average', () => {
    expect(audit('Mason Rivers is at -0.45 strokes gained around the green per round, against a team average of -0.09, a gap of roughly 0.36 strokes per round.')).toEqual([]);
  });
  it('a different gap is not', () => {
    expect(audit('Mason Rivers is at -0.45 strokes gained around the green per round, against a team average of -0.09, a gap of 0.46 strokes per round.')).toEqual(['0.46']);
  });
});

// Replay d8b1d11e: "the 74th percentile among 78 college players" was withheld as an unsourced reference figure. The level's average (28 ft) is
// a reference and needs a sentence naming its source; where the player stands among 78 players is the player's own figure.
describe('where a player stands against a reference', () => {
  const standing = {
    summary: 'Division I average for 1 metric.', measurements: [], series: [], coverage: 'complete', coverage_note: null, as_of: '2026-11-08T00:00:00.000Z',
    detail: { kind: 'benchmark_read', standing: { rows: [{ metric_id: 'approach_proximity_50_125ft', player_value: 23.77, comparisons: [{ kind: 'level', label: 'Division I average', value: 28, place_of: 78, place_percent: 74 }, { kind: 'tour', label: 'PGA Tour', value: 18, place_of: null, place_percent: null }] }] } },
  } as unknown as ToolEnvelope;
  const audit2 = (text: string) => auditNumericClaims(text, [], [], collectEnvelopeNumbers(standing), [], 'America/New_York', { players: roster }).map((c) => c.text);
  it('is the player’s: percentile and group size need no source named', () => {
    expect(audit2('He leaves the ball 23.77 ft away, against the Division I average of 28 ft. That is the 74th percentile among 78 college players on the platform.')).toEqual([]);
  });
  it('but the reference’s own value still needs its source named, and a percentile that is not the read’s is flagged', () => {
    expect(audit2('The average is 28 ft.')).toEqual(['28']);
    expect(audit2('He leaves the ball 23.77 ft away, against the Division I average of 28 ft. That is the 79th percentile among 78 college players.')).toEqual(['79']);
  });
});

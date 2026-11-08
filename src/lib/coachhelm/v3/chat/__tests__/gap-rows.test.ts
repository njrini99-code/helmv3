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

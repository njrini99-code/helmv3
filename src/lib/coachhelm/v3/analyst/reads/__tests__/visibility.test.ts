import { describe, expect, it } from 'vitest';

import { hiddenForReadsTeam, withoutReadsHidden } from '../visibility';

const finding = { id: 'f', signature: 'v3:approach:proximity_125_150', evidence: { strokes_impact: 0.8, confidence: 0.9, metric: 'approach_proximity' }, lifecycle_state: 'matured', priority: 'high', category: 'approach' };
const note = { ...finding, id: 'n', signature: 'v3:tee_strategy:inconclusive' };
const exempt = { ...finding, id: 'x', evidence: { feed_exempt: true } };
const resolved = { ...finding, id: 'r', lifecycle_state: 'resolved' };

describe('the reads rule outside the board (What’s new, notifications, the Monday brief)', () => {
  it('a note, a feed-exempt row and a resolved row are hidden; a finding is not', () => {
    expect(hiddenForReadsTeam(note)).toBe(true);
    expect(hiddenForReadsTeam(exempt)).toBe(true);
    expect(hiddenForReadsTeam(resolved)).toBe(true);
    expect(hiddenForReadsTeam(finding)).toBe(false);
  });

  it('only for a team on reads: every other team sees exactly what it saw', () => {
    const rows = [finding, note, exempt, resolved];
    expect(withoutReadsHidden(rows, 'team-on', (t) => t === 'team-on').map((r) => r.id)).toEqual(['f']);
    expect(withoutReadsHidden(rows, 'team-off', (t) => t === 'team-on').map((r) => r.id)).toEqual(['f', 'n', 'x', 'r']);
    expect(withoutReadsHidden(rows, null, () => true).map((r) => r.id)).toEqual(['f', 'n', 'x', 'r']);
  });
});

import { describe, it, expect } from 'vitest';
import { computeBlastRadius, formatCausalConfidenceLadder, type WorldModelEdge } from '@/lib/admin/engineering/blast-radius';
import type { ReleaseRelationshipVerdict } from '@/lib/admin/incidents/release-context';

const EDGES: WorldModelEdge[] = [
  { source: 'round_tracking', target: 'stats', kind: 'feature_feature', evidence: [{ kind: 'doc' }] },
  { source: 'round_tracking', target: 'qualifiers', kind: 'feature_feature', evidence: [{ kind: 'import_graph' }] },
  { source: 'stats', target: 'coachhelm_ai', kind: 'feature_feature', evidence: [{ kind: 'doc' }] },
  { source: 'unrelated_a', target: 'unrelated_b', kind: 'feature_feature', evidence: [{ kind: 'doc' }] },
];

describe('computeBlastRadius', () => {
  it('reports entityFound: false when the entity has no edges', () => {
    const result = computeBlastRadius(EDGES, 'nonexistent_feature');
    expect(result.entityFound).toBe(false);
    expect(result.nodes).toEqual([]);
  });

  it('finds direct (depth 1) downstream neighbors', () => {
    const result = computeBlastRadius(EDGES, 'round_tracking', 1);
    const ids = result.nodes.map((n) => n.id);
    expect(ids).toContain('stats');
    expect(ids).toContain('qualifiers');
    expect(result.nodes.every((n) => n.depth === 1)).toBe(true);
  });

  it('expands to depth 2 and marks the second hop correctly', () => {
    const result = computeBlastRadius(EDGES, 'round_tracking', 2);
    const coachhelm = result.nodes.find((n) => n.id === 'coachhelm_ai');
    expect(coachhelm?.depth).toBe(2);
    expect(coachhelm?.direction).toBe('downstream');
  });

  it('never returns the whole graph — an unrelated pair is not included', () => {
    const result = computeBlastRadius(EDGES, 'round_tracking', 2);
    expect(result.nodes.map((n) => n.id)).not.toContain('unrelated_a');
    expect(result.nodes.map((n) => n.id)).not.toContain('unrelated_b');
  });

  it('flags an edge weak only when every piece of its evidence is import-graph-only', () => {
    const result = computeBlastRadius(EDGES, 'round_tracking', 1);
    const qualifiers = result.nodes.find((n) => n.id === 'qualifiers');
    const stats = result.nodes.find((n) => n.id === 'stats');
    expect(qualifiers?.weak).toBe(true);
    expect(stats?.weak).toBe(false);
  });

  it('labels the reverse direction as upstream', () => {
    const result = computeBlastRadius(EDGES, 'stats', 1);
    const upstream = result.nodes.find((n) => n.id === 'round_tracking');
    expect(upstream?.direction).toBe('upstream');
  });

  it('deduplicates a node reached by more than one path and caps total nodes', () => {
    const denseEdges: WorldModelEdge[] = Array.from({ length: 60 }, (_, i) => ({
      source: 'hub', target: `leaf_${i}`, kind: 'feature_feature', evidence: [{ kind: 'doc' }],
    }));
    const result = computeBlastRadius(denseEdges, 'hub', 1);
    expect(result.nodes.length).toBeLessThanOrEqual(40);
    expect(result.truncated).toBe(true);
  });
});

describe('formatCausalConfidenceLadder', () => {
  const verdict: ReleaseRelationshipVerdict = {
    relationship: 'new-after-release',
    confidence: 0.86,
    evidenceFor: ['began 4m after deploy', 'affected feature changed'],
    evidenceAgainst: ['external provider latency also elevated'],
  };

  it('renders the relationship, confidence, and every evidence line', () => {
    const lines = formatCausalConfidenceLadder(verdict, '8e4c5b7d');
    expect(lines[0]).toContain('NEW AFTER RELEASE');
    expect(lines[0]).toContain('8e4c5b7d');
    expect(lines[0]).toContain('86%');
    expect(lines).toContain('+ began 4m after deploy');
    expect(lines).toContain('− external provider latency also elevated');
  });

  it('flags the impossible case of confidence >= 1 rather than silently rendering "100% certain"', () => {
    const lines = formatCausalConfidenceLadder({ ...verdict, confidence: 1 }, 'sha');
    expect(lines[0]).toContain('should never happen');
  });
});

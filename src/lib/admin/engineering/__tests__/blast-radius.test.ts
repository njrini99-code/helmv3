import { describe, it, expect, vi, beforeEach } from 'vitest';
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

// PR #1790 review item 2: fetchBlastRadius must parse WORLD_MODEL.json once
// per process (module-level cache keyed by mtime), not on every request —
// /admin/engineering is force-dynamic and AutoRefresh polls it every 60s, so
// an unconditional readFile+JSON.parse on a multi-MB graph re-does the same
// work on every poll for a file that only changes when a deploy regenerates
// it. Mocks node:fs/promises directly (unlike charter.test.ts's fetch*
// tests, which read the real committed files) because this behavior needs a
// controllable mtime across repeated calls — something a real file on disk
// can't give a test without actually touching it between assertions.
vi.mock('node:fs/promises', () => ({
  readFile: vi.fn(),
  stat: vi.fn(),
}));

describe('fetchBlastRadius caching', () => {
  const WORLD_MODEL_JSON = JSON.stringify({ nodes: {}, edges: EDGES });

  beforeEach(async () => {
    vi.clearAllMocks();
    const { __resetWorldModelCacheForTests } = await import('@/lib/admin/engineering/blast-radius');
    __resetWorldModelCacheForTests();
  });

  it('reads the file once and reuses the parsed result when mtime is unchanged', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.stat).mockResolvedValue({ mtimeMs: 1000 } as never);
    vi.mocked(fs.readFile).mockResolvedValue(WORLD_MODEL_JSON as never);
    const { fetchBlastRadius } = await import('@/lib/admin/engineering/blast-radius');

    const first = await fetchBlastRadius('round_tracking');
    const second = await fetchBlastRadius('round_tracking');

    expect(first.status).toBe('ok');
    expect(second.status).toBe('ok');
    expect(fs.stat).toHaveBeenCalledTimes(2); // stat is cheap — runs every call
    expect(fs.readFile).toHaveBeenCalledTimes(1); // parse only happened once
  });

  it('re-reads the file when mtime changes — a new deploy regenerated the graph', async () => {
    const fs = await import('node:fs/promises');
    vi.mocked(fs.readFile).mockResolvedValue(WORLD_MODEL_JSON as never);
    vi.mocked(fs.stat).mockResolvedValueOnce({ mtimeMs: 1000 } as never).mockResolvedValueOnce({ mtimeMs: 2000 } as never);
    const { fetchBlastRadius } = await import('@/lib/admin/engineering/blast-radius');

    await fetchBlastRadius('round_tracking');
    await fetchBlastRadius('round_tracking');

    expect(fs.readFile).toHaveBeenCalledTimes(2);
  });

  it('still reports unconfigured (not error) on ENOENT, cache or not', async () => {
    const fs = await import('node:fs/promises');
    const enoent = Object.assign(new Error('no such file'), { code: 'ENOENT' });
    vi.mocked(fs.stat).mockRejectedValue(enoent);
    const { fetchBlastRadius } = await import('@/lib/admin/engineering/blast-radius');

    const result = await fetchBlastRadius('round_tracking');
    expect(result.status).toBe('unconfigured');
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

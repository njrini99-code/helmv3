/**
 * One issue shows once (2026-09-24). Production duplicates are the same
 * player/category/metric written twice: a coach-scoped row plus a
 * coach_id-NULL orphan, or two signatures for one metric. The shared
 * `dedupeBySubject` keeps the member with the NEWEST evidence, at its own
 * rank position.
 */
import { describe, it, expect } from 'vitest';
import {
  collapseParScoring,
  dedupeBySubject,
  type RankableEvidenceInsight,
} from '@/app/golf/actions/insight-delivery-ranking';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

function row(id: string, over: Partial<RankableEvidenceInsight> & { metric?: string; value?: number } = {}): RankableEvidenceInsight {
  const { metric = 'sg_ott', value = 1, ...rest } = over;
  return {
    id,
    player_id: 'p-1',
    category: 'tee',
    title: `Title ${id}`,
    content: 'c',
    signature: `tee_strategy:${id}`,
    evidence: { metric, your_value: value, strokes_impact: 1, confidence: 0.5 } as InsightEvidence,
    metadata: null,
    lifecycle_state: 'detected',
    status: 'active',
    priority: 'medium',
    acknowledged_at: null,
    resolved_at: null,
    created_at: '2026-09-01T00:00:00.000Z',
    updated_at: '2026-09-01T00:00:00.000Z',
    ...rest,
  };
}

describe('dedupeBySubject — newest evidence wins', () => {
  it('a stale orphan ranked first loses to the newer coach-scoped copy of the same issue', () => {
    const staleOrphan = row('orphan', { value: 5.9, updated_at: '2026-09-01T00:00:00.000Z' });
    const other = row('other', { metric: 'sg_putting', category: 'putting' });
    const fresh = row('fresh', { value: 6.1, updated_at: '2026-09-20T00:00:00.000Z' });
    const out = dedupeBySubject([staleOrphan, other, fresh]);
    expect(out.map((r) => r.id)).toEqual(['other', 'fresh']);
    expect(out[1]!.evidence.your_value).toBe(6.1);
  });

  it('the survivor keeps its own rank position (never inherits the stale sibling slot)', () => {
    const a = row('stale', { updated_at: '2026-09-01T00:00:00.000Z' });
    const b = row('b', { metric: 'sg_putting', category: 'putting' });
    const c = row('c', { metric: 'sg_approach', category: 'approach' });
    const d = row('fresh', { updated_at: '2026-09-02T00:00:00.000Z' });
    expect(dedupeBySubject([a, b, c, d]).map((r) => r.id)).toEqual(['b', 'c', 'fresh']);
  });

  it('two signatures for one metric (tee_strategy laggy vs inconclusive) collapse to one', () => {
    const laggy = row('laggy', { signature: 'tee_strategy:laggy', updated_at: '2026-09-10T00:00:00.000Z' });
    const inconclusive = row('inconclusive', { signature: 'tee_strategy:inconclusive', updated_at: '2026-09-05T00:00:00.000Z' });
    expect(dedupeBySubject([inconclusive, laggy]).map((r) => r.id)).toEqual(['laggy']);
  });

  it('a timestamp tie keeps rank order (first wins), matching the prior behaviour', () => {
    expect(dedupeBySubject([row('x'), row('y')]).map((r) => r.id)).toEqual(['x']);
  });

  it('different players and different metrics never collapse', () => {
    const out = dedupeBySubject([
      row('a'),
      row('b', { player_id: 'p-2' }),
      row('c', { metric: 'sg_putting' }),
    ]);
    expect(out).toHaveLength(3);
  });

  it('v2 par_scoring_parN and v3 scoring_par_N are one subject', () => {
    const v2 = row('v2', { metric: 'par_scoring_par4', category: 'scoring', updated_at: '2026-08-01T00:00:00.000Z' });
    const v3 = row('v3', { metric: 'scoring_par_4', category: 'scoring', updated_at: '2026-09-01T00:00:00.000Z' });
    expect(dedupeBySubject([v2, v3]).map((r) => r.id)).toEqual(['v3']);
  });

  it('composes with collapseParScoring the way every surface calls it', () => {
    const p3 = row('p3', { metric: 'scoring_par_3', category: 'scoring' });
    const p4 = row('p4', { metric: 'scoring_par_4', category: 'scoring' });
    const out = dedupeBySubject(collapseParScoring([p4, p3, row('tee')]));
    expect(out.map((r) => r.title).sort()).toEqual(['Scoring by par type', 'Title tee']);
  });
});

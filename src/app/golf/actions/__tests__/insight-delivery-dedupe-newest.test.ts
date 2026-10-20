/**
 * One issue shows once, and the copy shown is the newest (ported from PR
 * #2073, 2026-09-24; CoachHelm Slice 0, 2026-10-20). Production duplicates are
 * the same player/category/metric written twice: a coach-scoped row plus a
 * coach_id-NULL orphan, or two signatures for one metric. The shared
 * `dedupeBySubject` keeps the member with the NEWEST evidence, at its own rank
 * position. Synthetic fixtures only.
 */
import { describe, it, expect } from 'vitest';
import {
  collapseParScoring,
  dedupeBySubject,
  issueSubjectKey,
  mapRowToRankable,
  type RankableEvidenceInsight,
} from '@/app/golf/actions/insight-delivery-ranking';
import type { InsightEvidence } from '@/lib/coachhelm/v2/insights/types';

type Over = Partial<RankableEvidenceInsight> & { metric?: string; value?: number; windowEnd?: string };

function row(id: string, over: Over = {}): RankableEvidenceInsight {
  const { metric = 'sg_ott', value = 1, windowEnd = '2026-09-01', ...rest } = over;
  return {
    id,
    player_id: 'p-1',
    category: 'tee',
    insight_type: 'tee_strategy',
    title: `Title ${id}`,
    content: 'c',
    signature: `tee_strategy:${id}`,
    evidence: { metric, your_value: value, strokes_impact: 1, confidence: 0.5, window_end: windowEnd } as InsightEvidence,
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
    const other = row('other', { metric: 'sg_putting', category: 'putting', insight_type: 'putt_distance' });
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

  it('two signatures for one metric (tee_strategy sharp vs inconclusive) collapse to the newer', () => {
    const sharp = row('sharp', { signature: 'v3:tee_strategy:tee_strategy:sharp', updated_at: '2026-09-29T00:00:00.000Z' });
    const inconclusive = row('inconclusive', { signature: 'v3:tee_strategy:tee_strategy:inconclusive', updated_at: '2026-10-05T00:00:00.000Z' });
    expect(dedupeBySubject([sharp, inconclusive]).map((r) => r.id)).toEqual(['inconclusive']);
    expect(dedupeBySubject([inconclusive, sharp]).map((r) => r.id)).toEqual(['inconclusive']);
  });

  it('on an updated_at tie, the copy whose window reaches the newer round wins', () => {
    const older = row('older', { windowEnd: '2026-09-10' });
    const newer = row('newer', { windowEnd: '2026-09-15' });
    expect(dedupeBySubject([older, newer]).map((r) => r.id)).toEqual(['newer']);
  });

  it('compares timestamps as instants, not as text', () => {
    // 01:00 at +02:00 is 23:00 UTC the day before: older, though it sorts later as text.
    const offset = row('offset', { updated_at: '2026-10-02T01:00:00+02:00' });
    const utc = row('utc', { updated_at: '2026-10-02T00:00:00.000Z' });
    expect(dedupeBySubject([offset, utc]).map((r) => r.id)).toEqual(['utc']);
    expect(dedupeBySubject([utc, offset]).map((r) => r.id)).toEqual(['utc']);
    // The same instant spelled two ways is a tie, so rank order decides.
    const a = row('a', { updated_at: '2026-10-02T00:00:00+00:00' });
    const b = row('b', { updated_at: '2026-10-02T00:00:00.000Z' });
    expect(dedupeBySubject([a, b]).map((r) => r.id)).toEqual(['a']);
    expect(dedupeBySubject([b, a]).map((r) => r.id)).toEqual(['b']);
  });

  it('then the later created_at, then rank order', () => {
    const first = row('first', { created_at: '2026-08-01T00:00:00.000Z' });
    const later = row('later', { created_at: '2026-08-20T00:00:00.000Z' });
    expect(dedupeBySubject([first, later]).map((r) => r.id)).toEqual(['later']);
    expect(dedupeBySubject([row('x'), row('y')]).map((r) => r.id)).toEqual(['x']);
  });

  it('a row with no stored updated_at never wins on the mapper\'s "now" stand-in', () => {
    const mapped = mapRowToRankable({
      id: 'no-stamp', player_id: 'p-1', category: 'tee', insight_type: 'tee_strategy', title: 'T', content: 'c',
      signature: 's', evidence: { metric: 'sg_ott', strokes_impact: 1, confidence: 0.5 }, metadata: null,
      lifecycle_state: 'detected', status: 'active', priority: 'medium', acknowledged_at: null, resolved_at: null,
      created_at: '2026-09-01T00:00:00.000Z', updated_at: null,
    });
    expect(mapped?.source_updated_at).toBeNull();
    const stamped = row('stamped', { updated_at: '2026-09-02T00:00:00.000Z', source_updated_at: '2026-09-02T00:00:00.000Z' });
    expect(dedupeBySubject([mapped!, stamped]).map((r) => r.id)).toEqual(['stamped']);
  });

  it('another generator on the same subject is a different read: rank order holds the slot, as before', () => {
    const composite = row('composite', { insight_type: 'composite', updated_at: '2026-09-01T00:00:00.000Z' });
    const base = row('base', { updated_at: '2026-09-30T00:00:00.000Z' });
    expect(dedupeBySubject([composite, base]).map((r) => r.id)).toEqual(['composite']);
  });

  it('a newer twin of the first row still wins past a row of another generator', () => {
    const stale = row('stale', { updated_at: '2026-09-01T00:00:00.000Z' });
    const composite = row('composite', { insight_type: 'composite', updated_at: '2026-09-30T00:00:00.000Z' });
    const fresh = row('fresh', { updated_at: '2026-09-20T00:00:00.000Z' });
    expect(dedupeBySubject([stale, composite, fresh]).map((r) => r.id)).toEqual(['fresh']);
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
    const v2 = row('v2', { metric: 'par_scoring_par4', category: 'scoring', insight_type: 'par_scoring', updated_at: '2026-08-01T00:00:00.000Z' });
    const v3 = row('v3', { metric: 'scoring_par_4', category: 'scoring', insight_type: 'par_scoring', updated_at: '2026-09-01T00:00:00.000Z' });
    expect(issueSubjectKey(v2)).toBe(issueSubjectKey(v3));
    expect(dedupeBySubject([v2, v3]).map((r) => r.id)).toEqual(['v3']);
  });

  it('composes with collapseParScoring the way every surface calls it', () => {
    const p3 = row('p3', { metric: 'scoring_par_3', category: 'scoring' });
    const p4 = row('p4', { metric: 'scoring_par_4', category: 'scoring' });
    const out = dedupeBySubject(collapseParScoring([p4, p3, row('tee')]));
    expect(out.map((r) => r.title).sort()).toEqual(['Scoring by par type', 'Title tee']);
  });
});

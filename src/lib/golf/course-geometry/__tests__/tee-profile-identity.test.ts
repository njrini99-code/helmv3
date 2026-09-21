import { describe, expect, it } from 'vitest';
import corpus from '@/test/fixtures/course-geometry/factory/catalog-invariants.json';
import { parseScorecardProfile, resolveTeeProfile } from '../catalog';

const courseId = '11111111-1111-4111-8111-111111111111';
const teeId = '22222222-2222-4222-8222-222222222222';
const make = (revision: string, id = teeId) => parseScorecardProfile({
  ...corpus.base, profileId: `white-${revision[0]}`, libraryBinding: { courseId, teeId: id }, revision,
  source: { ...corpus.base.source, snapshotHash: 'c'.repeat(64) },
});
describe('tee profile identity', () => {
  it('uses IDs even when two tees have the same name', () => {
    const a = make('a'.repeat(64));
    const b = make('b'.repeat(64), '33333333-3333-4333-8333-333333333333');
    const input = { layoutId: a.layoutId, courseId, teeId };
    expect(resolveTeeProfile([b, a], input)).toEqual({ status: 'resolved', profile: a });
    expect(resolveTeeProfile([a, b], { ...input, teeId: 'White' })).toEqual({ status: 'unavailable' });
  });
  it('requires an explicit revision when multiple revisions exist', () => {
    const a = make('a'.repeat(64)), b = make('b'.repeat(64));
    const input = { layoutId: a.layoutId, courseId, teeId };
    expect(resolveTeeProfile([a, b], input)).toEqual({ status: 'revision_required' });
    expect(resolveTeeProfile([b, a], { ...input, revision: a.revision })).toEqual({ status: 'resolved', profile: a });
    expect(resolveTeeProfile([{ ...a, teeName: 'Renamed' }], input).status).toBe('resolved');
    expect(resolveTeeProfile([a], { ...input, layoutId: 'different-nine' }).status).toBe('unavailable');
  });
});

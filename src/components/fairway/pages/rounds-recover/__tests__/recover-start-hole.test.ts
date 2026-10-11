import { describe, expect, it } from 'vitest';
import { mapModernPendingRound } from '../FairwayRecoverRound';

type Queued = Parameters<typeof mapModernPendingRound>[0];

describe('Fairway recover: a shotgun start survives the offline queue', () => {
  const queued = (startHole?: number) =>
    ({
      id: 'r1',
      playerId: 'p1',
      draftData: {
        step: 'tracking',
        setupData: { courseName: 'Finley GC', roundType: 'practice', roundDate: '2026-10-10', ...(startHole ? { startHole } : {}) },
        holes: [],
        completedHoleStats: [],
        currentHoleIndex: 5,
      },
    }) as unknown as Queued;

  it('keeps the start hole the round was set up with', () => {
    expect(mapModernPendingRound(queued(6))?.draftData.setupData.startHole).toBe(6);
  });

  it('leaves it unset for a round that starts on the first hole', () => {
    expect(mapModernPendingRound(queued())?.draftData.setupData.startHole).toBeUndefined();
  });
});

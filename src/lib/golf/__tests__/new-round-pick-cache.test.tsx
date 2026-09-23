import { beforeEach, describe, expect, it } from 'vitest';
import {
  PENDING_PICK_TTL_MS,
  clearPendingTeePick,
  loadPendingTeePick,
  savePendingTeePick,
} from '../new-round-pick-cache';
import type { TeeRoundDefaults } from '@/app/golf/actions/course-library';

const PLAYER = 'player-1';

const defaults: TeeRoundDefaults = {
  teeId: 'tee-1',
  teeName: 'Championship',
  category: 'tournament',
  courseId: 'course-1',
  courseName: 'Oviinbyrd Golf Club',
  courseCity: 'MacTier',
  courseState: 'ON',
  holesCount: 18,
  isDraft: false,
  courseRating: 75.6,
  slopeRating: 146,
  holes: Array.from({ length: 18 }, (_, i) => ({ holeNumber: i + 1, par: 4, yardage: 400, handicapIndex: null })),
  courseImageUrl: null,
  courseNormalizedName: 'oviinbyrd golf club',
};

describe('new-round pick cache', () => {
  beforeEach(() => {
    window.localStorage.clear();
  });

  it('round-trips the tee defaults per player', () => {
    savePendingTeePick(PLAYER, defaults);
    expect(loadPendingTeePick(PLAYER)).toEqual(defaults);
    expect(loadPendingTeePick('someone-else')).toBeNull();
  });

  it('expires and drops a stale pick', () => {
    savePendingTeePick(PLAYER, defaults);
    expect(loadPendingTeePick(PLAYER, Date.now() + PENDING_PICK_TTL_MS + 1)).toBeNull();
    // The stale record is removed, not merely ignored.
    expect(window.localStorage.getItem(`golf-new-round-pick:${PLAYER}`)).toBeNull();
  });

  it('rejects a malformed record instead of restoring garbage', () => {
    window.localStorage.setItem(`golf-new-round-pick:${PLAYER}`, JSON.stringify({ v: 1, ts: Date.now(), defaults: { teeId: 'x' } }));
    expect(loadPendingTeePick(PLAYER)).toBeNull();
    window.localStorage.setItem(`golf-new-round-pick:${PLAYER}`, 'not json');
    expect(loadPendingTeePick(PLAYER)).toBeNull();
  });

  it('clears on demand', () => {
    savePendingTeePick(PLAYER, defaults);
    clearPendingTeePick(PLAYER);
    expect(loadPendingTeePick(PLAYER)).toBeNull();
  });
});

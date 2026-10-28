import { describe, expect, it } from 'vitest';

import {
  groupPlayerPracticeReviews,
  isVisibleToPlayer,
  PLAYER_PRACTICE_REVIEW_COLUMNS,
  type PlayerPracticeReviewRow,
} from '@/lib/baseball/read-models/player-practice-reviews';

function row(overrides: Partial<PlayerPracticeReviewRow>): PlayerPracticeReviewRow {
  return {
    id: 'r1',
    practice_id: 'practice-1',
    focus_area: 'Two-strike approach',
    conclusion: 'Chase rate fell after the two-strike station.',
    verdict: null,
    visibility: 'player_visible',
    player_ids: ['player-1'],
    ...overrides,
  };
}

describe('isVisibleToPlayer: visible-only, own-only', () => {
  it('shows a player_visible review that names the player', () => {
    expect(isVisibleToPlayer(row({}), 'player-1')).toBe(true);
  });

  it('hides staff_only and restricted reviews, even the player’s own', () => {
    expect(isVisibleToPlayer(row({ visibility: 'staff_only' }), 'player-1')).toBe(false);
    expect(isVisibleToPlayer(row({ visibility: 'restricted' }), 'player-1')).toBe(false);
  });

  it('hides a teammate’s visible review', () => {
    expect(isVisibleToPlayer(row({ player_ids: ['player-2'] }), 'player-1')).toBe(false);
  });

  it('hides a team-level review that names no players', () => {
    expect(isVisibleToPlayer(row({ player_ids: [] }), 'player-1')).toBe(false);
    expect(isVisibleToPlayer(row({ player_ids: null }), 'player-1')).toBe(false);
  });

  it('shows nothing to a viewer with no player id (a coach)', () => {
    expect(isVisibleToPlayer(row({}), null)).toBe(false);
  });
});

describe('groupPlayerPracticeReviews', () => {
  it('keeps only this player’s visible reviews, grouped by practice', () => {
    const grouped = groupPlayerPracticeReviews(
      [
        row({ id: 'mine-a', practice_id: 'practice-1', verdict: 'worked' }),
        row({ id: 'staff', practice_id: 'practice-1', visibility: 'staff_only' }),
        row({ id: 'restricted', practice_id: 'practice-1', visibility: 'restricted' }),
        row({ id: 'teammate', practice_id: 'practice-1', player_ids: ['player-2'] }),
        row({ id: 'team-level', practice_id: 'practice-1', player_ids: [] }),
        row({ id: 'mine-b', practice_id: 'practice-2', player_ids: ['player-2', 'player-1'] }),
      ],
      'player-1',
    );
    expect([...grouped.keys()].sort()).toEqual(['practice-1', 'practice-2']);
    expect(grouped.get('practice-1')!.map((r) => r.id)).toEqual(['mine-a']);
    expect(grouped.get('practice-2')!.map((r) => r.id)).toEqual(['mine-b']);
    expect(grouped.get('practice-1')![0]).toEqual({
      id: 'mine-a',
      practiceId: 'practice-1',
      focusArea: 'Two-strike approach',
      conclusion: 'Chase rate fell after the two-strike station.',
      verdict: 'worked',
    });
  });

  it('drops a review with no conclusion text and an unknown verdict', () => {
    const grouped = groupPlayerPracticeReviews(
      [row({ id: 'blank', conclusion: '   ' }), row({ id: 'odd-verdict', verdict: 'proven' })],
      'player-1',
    );
    expect(grouped.get('practice-1')!.map((r) => [r.id, r.verdict])).toEqual([['odd-verdict', null]]);
  });

  it('returns an empty map for no rows (the held policy not yet applied)', () => {
    expect(groupPlayerPracticeReviews(null, 'player-1').size).toBe(0);
    expect(groupPlayerPracticeReviews([], 'player-1').size).toBe(0);
  });

  it('selects no staff-only columns', () => {
    for (const col of ['confounders', 'source_refs', 'disposition', 'metric_before', 'metric_after', 'notes']) {
      expect(PLAYER_PRACTICE_REVIEW_COLUMNS).not.toContain(col);
    }
  });
});

import { describe, expect, it } from 'vitest';
import { normalizeNotificationRow, notificationActionUrl } from '../unified-notifications-model';

/**
 * GAP-R-01: "A focus area got worse" opens the player's Development tab. Rows the verdict job wrote before the fix link
 * `/golf/dashboard/players/<id>`, which took two hops to the Game tab; their data names the category and the player, so
 * the feed points them at the Development tab as it reads them. No other row moves.
 */
const old = {
  id: 'n1',
  type: 'dev_plan_assigned',
  title: 'A focus area got worse',
  body: 'Lag putting: …',
  action_url: '/golf/dashboard/players/p-1',
  created_at: '2026-11-10T12:00:00.000Z',
  read_at: null,
  data: { coachhelm_category: 'focus_area_verdict', verdict: 'got_worse', focus_area_id: 'fa-1', player_id: 'p-1' },
};

describe('a focus-area verdict row opens Stats on the Development tab', () => {
  it('an old row is pointed at the Development tab as it is read', () => {
    expect(normalizeNotificationRow(old).action_url).toBe('/golf/dashboard/stats?player=p-1&tab=dev');
  });

  it('a new row already carries the address and keeps it', () => {
    const now = { ...old, action_url: '/golf/dashboard/stats?player=p-1&tab=dev' };
    expect(notificationActionUrl(now)).toBe('/golf/dashboard/stats?player=p-1&tab=dev');
  });

  it('leaves every other row alone', () => {
    expect(notificationActionUrl({ action_url: '/golf/dashboard/players/p-1', data: { coachhelm_category: 'insight' } })).toBe('/golf/dashboard/players/p-1');
    expect(notificationActionUrl({ action_url: '/golf/dashboard/players/p-2', data: old.data })).toBe('/golf/dashboard/players/p-2');
    expect(notificationActionUrl({ action_url: '/golf/dashboard/calendar', data: null })).toBe('/golf/dashboard/calendar');
    expect(notificationActionUrl({ action_url: null, data: old.data })).toBeNull();
  });

  it('never builds an address from a player value that is not an id', () => {
    const odd = { action_url: '/golf/dashboard/players/a?b', data: { ...old.data, player_id: 'a?b' } };
    expect(notificationActionUrl(odd)).toBe('/golf/dashboard/players/a?b');
  });
});

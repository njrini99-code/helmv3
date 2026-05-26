/**
 * W42 — notification router tests.
 *
 * Critical correctness target: routing decisions feed every push +
 * email send. A bug here either spams users or silently drops
 * important updates.
 */

import { describe, it, expect } from 'vitest';
import {
  routeNotification,
  shouldDeliver,
  NOTIFICATION_CATEGORIES,
} from '@/lib/coachhelm/v3/notifications/router';
import type { NotificationPrefs } from '@/lib/coachhelm/v3/notifications/router';

function prefs(over: Partial<NotificationPrefs> = {}): NotificationPrefs {
  return {
    prefs: over.prefs ?? {
      round_review_ready: { push: true, email: false, in_app: true },
      new_insight: { push: false, email: false, in_app: true },
      weekly_digest: { push: false, email: true, in_app: false },
    },
    quiet_mode: over.quiet_mode ?? false,
  };
}

describe('routeNotification', () => {
  it('returns category channels verbatim when quiet_mode is off', () => {
    const r = routeNotification('round_review_ready', prefs());
    expect(r.push).toBe(true);
    expect(r.email).toBe(false);
    expect(r.in_app).toBe(true);
    expect(r.exempted_from_quiet).toBe(false);
  });

  it('zeroes all channels when quiet_mode is on and category is NOT exempt', () => {
    const r = routeNotification('new_insight', prefs({ quiet_mode: true }));
    expect(r.push).toBe(false);
    expect(r.email).toBe(false);
    expect(r.in_app).toBe(false);
    expect(r.exempted_from_quiet).toBe(false);
  });

  it('round_review_ready is exempt from quiet_mode', () => {
    const r = routeNotification('round_review_ready', prefs({ quiet_mode: true }));
    expect(r.push).toBe(true);
    expect(r.in_app).toBe(true);
    expect(r.exempted_from_quiet).toBe(true);
  });

  it('coach_assigned_goal is exempt from quiet_mode', () => {
    const r = routeNotification(
      'coach_assigned_goal',
      prefs({
        prefs: {
          coach_assigned_goal: { push: true, email: false, in_app: true },
        },
        quiet_mode: true,
      }),
    );
    expect(r.push).toBe(true);
    expect(r.exempted_from_quiet).toBe(true);
  });

  it('falls back to in_app-only default when category has no prefs row', () => {
    const r = routeNotification('goal_achieved', prefs({ prefs: {} }));
    expect(r.push).toBe(false);
    expect(r.email).toBe(false);
    expect(r.in_app).toBe(true);
  });
});

describe('shouldDeliver', () => {
  it('returns true when any channel is on', () => {
    expect(shouldDeliver('round_review_ready', prefs())).toBe(true);
  });

  it('returns false when all channels are off', () => {
    expect(
      shouldDeliver(
        'new_insight',
        prefs({
          prefs: { new_insight: { push: false, email: false, in_app: false } },
        }),
      ),
    ).toBe(false);
  });

  it('returns false for non-exempt categories under quiet_mode', () => {
    expect(shouldDeliver('new_insight', prefs({ quiet_mode: true }))).toBe(false);
  });
});

describe('NOTIFICATION_CATEGORIES', () => {
  it('exposes the 10 categories defined in Part XXII', () => {
    expect(NOTIFICATION_CATEGORIES).toHaveLength(10);
  });
});

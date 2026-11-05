import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_NOTIFICATION_PREFERENCES, type NotificationPreferences } from '@/lib/notifications/types';

vi.mock('@/lib/flags/is-enabled', () => ({ isFlagEnabled: vi.fn(() => false) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerEvent: vi.fn(), logServerError: vi.fn(), logServerException: vi.fn() }));
vi.mock('@/lib/notifications/email', () => ({ getUserNotificationPreferences: vi.fn() }));

import { generatePushPayload, shouldSendPush } from '../push';

/** W-PP-11: the practice plan push is gated by `push_events` and Quiet mode, and opens the plan the caller named. */

const prefs = (over: Record<string, unknown>) => ({ ...DEFAULT_NOTIFICATION_PREFERENCES, ...over }) as NotificationPreferences;

describe('practice_plan push', () => {
  it('follows push_events, and not push_messages', () => {
    expect(shouldSendPush('practice_plan', prefs({ push_events: true, push_messages: false, quiet_mode: false }))).toBe(true);
    expect(shouldSendPush('practice_plan', prefs({ push_events: false, push_messages: true, quiet_mode: false }))).toBe(false);
  });

  it('Quiet mode holds it even with push_events on', () => {
    expect(shouldSendPush('practice_plan', prefs({ push_events: true, quiet_mode: true }))).toBe(false);
  });

  it('carries the caller words and opens the plan, with a safe default', () => {
    const url = '/golf/dashboard/practice/plan/plan-1';
    expect(generatePushPayload('practice_plan', { title: 'Tuesday practice', body: 'Your group starts on the range.', url })).toMatchObject({ title: 'Tuesday practice', body: 'Your group starts on the range.', data: { url } });
    expect(generatePushPayload('practice_plan', {}).data.url).toBe('/golf/dashboard');
  });
});

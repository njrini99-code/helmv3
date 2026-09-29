import { describe, it, expect, vi } from 'vitest';

vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/notifications/push', () => ({ sendPushNotification: vi.fn() }));
vi.mock('@/lib/notifications/email', () => ({ sendEmailNotification: vi.fn() }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError: vi.fn() }));

import {
  COACHHELM_PER_CATEGORY_IN_APP_TYPES,
  inAppTypeFor,
} from '@/lib/coachhelm/v3/notifications/dispatch';

describe('inAppTypeFor (audit row 53)', () => {
  it('stays on the legacy enum value until the enum migration is applied', () => {
    expect(COACHHELM_PER_CATEGORY_IN_APP_TYPES).toBe(false);
    expect(inAppTypeFor('goal_missed')).toBe('dev_plan_assigned');
  });

  it('writes a per-category type once the switch is flipped', () => {
    expect(inAppTypeFor('goal_missed', true)).toBe('coachhelm_goal_missed');
    expect(inAppTypeFor('round_review_ready', true)).toBe('coachhelm_round_review_ready');
  });
});

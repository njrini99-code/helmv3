import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('../email', () => ({ getUserNotificationPreferences: vi.fn() }));

const { generatePushPayload } = await import('../push');

const url = (type: Parameters<typeof generatePushPayload>[0], data: Record<string, unknown>) =>
  String(generatePushPayload(type, data).data.url).replace(/^https?:\/\/[^/]+/, '');

describe('push payload deep links (NAV-IA3)', () => {
  it('opens the exact event, qualifier and round when the sender gives an id', () => {
    expect(url('event_rsvp_reminder', { eventId: 'ev-1' })).toBe('/golf/dashboard/calendar?event=ev-1');
    expect(url('qualifier_created', { qualifierId: 'q-1' })).toBe('/golf/dashboard/qualifiers/q-1');
    expect(url('qualifier_updated', { qualifierId: 'q-1' })).toBe('/golf/dashboard/qualifiers/q-1');
    expect(url('round_submitted', { roundId: 'r-1' })).toBe('/golf/dashboard/rounds/r-1');
  });

  it('falls back to the list without an id, and ignores ids that are not plain tokens', () => {
    expect(url('event_rsvp_reminder', {})).toBe('/golf/dashboard/calendar');
    expect(url('qualifier_created', { qualifierId: '../x?y' })).toBe('/golf/dashboard/qualifiers');
    expect(url('round_submitted', {})).toBe('/golf/dashboard/stats/team');
  });

  it('sends a plan assignment to the player plan tab, not the redirect shim', () => {
    expect(url('dev_plan_assigned', {})).toBe('/golf/dashboard/coachhelm?view=development');
  });
});

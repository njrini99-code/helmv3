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

  it('shows a CoachHelm dispatch its own title, body and in-app path', () => {
    const p = generatePushPayload('coachhelm_insight', {
      audience: 'player',
      title: 'Goal missed',
      body: 'Your fairways goal closed short. Tap to review it.',
      url: '/golf/dashboard/coachhelm?view=development',
    });
    expect(p.title).toBe('Goal missed');
    expect(p.body).toBe('Your fairways goal closed short. Tap to review it.');
    expect(String(p.data.url).replace(/^https?:\/\/[^/]+/, '')).toBe('/golf/dashboard/coachhelm?view=development');
  });

  it('keeps the coach post-round copy and ignores an off-site url', () => {
    const coach = generatePushPayload('coachhelm_insight', { insightTitle: '2 new insights after round', audience: 'coach' });
    expect(coach.title).toBe('New CoachHelm Insight');
    expect(coach.body).toBe('2 new insights after round');
    const offsite = url('coachhelm_insight', { audience: 'player', url: '//evil.example/x' });
    expect(offsite.startsWith('/golf/dashboard')).toBe(true);
    expect(offsite).not.toContain('evil');
  });
});

describe('qualifier selection outcome push (audit row 55)', () => {
  it('shows the outcome copy the notifier composed, not a generic "Qualifier Updated"', () => {
    const p = generatePushPayload('qualifier_updated', {
      qualifierName: 'Fall Qualifier',
      qualifierId: 'q-1',
      outcome: 'not_scored',
      title: 'No qualifier score recorded',
      body: 'Fall Qualifier: no score was recorded for you, so you were not ranked. Check with your coach.',
    });
    expect(p.title).toBe('No qualifier score recorded');
    expect(p.body).toContain('no score was recorded');
  });

  it('keeps the generic copy for a plain qualifier update', () => {
    const p = generatePushPayload('qualifier_updated', { qualifierName: 'Fall Qualifier' });
    expect(p.title).toBe('Qualifier Updated');
    expect(p.body).toBe('Fall Qualifier');
  });
});

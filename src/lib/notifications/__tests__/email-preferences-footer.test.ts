import { beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * GAP-R-02: every email's "Manage preferences" footer opens the settings of the product it is about. GolfHelm mail goes
 * to Settings' Notifications section; BaseballHelm mail goes to BaseballHelm's settings, never to golf's (a
 * BaseballHelm-only recipient was bounced through the golf dashboard to /golf/signup).
 */
vi.mock('@/lib/supabase/admin', () => ({ createAdminClient: vi.fn() }));
vi.mock('@/lib/email/outbound-gate', () => ({ gateCustomerEmail: vi.fn(() => ({ allowed: true })) }));

const { __testables, emailPreferencesPath } = await import('../email');
const { generateEmailTemplate } = __testables;

const footerHref = (html: string) => /<a href="([^"]+)"[^>]*>Manage preferences<\/a>/.exec(html)?.[1];

beforeEach(() => {
  process.env.NEXT_PUBLIC_APP_URL = 'https://app.example.test';
});

describe('the email footer’s Manage preferences link', () => {
  it('names each product’s own settings', () => {
    expect(emailPreferencesPath('golf')).toBe('/golf/dashboard/settings/notifications');
    expect(emailPreferencesPath('baseball')).toBe('/baseball/dashboard/settings');
  });

  it('BaseballHelm’s watchlist, pipeline and profile-view mail open BaseballHelm settings', () => {
    for (const type of ['watchlist_add', 'pipeline_stage_change', 'profile_view'] as const) {
      expect(footerHref(generateEmailTemplate(type, {}).html), type).toBe('https://app.example.test/baseball/dashboard/settings');
    }
  });

  it('a message email follows the product its sender passed', () => {
    expect(footerHref(generateEmailTemplate('new_message', { product: 'baseball' }).html)).toBe('https://app.example.test/baseball/dashboard/settings');
    expect(footerHref(generateEmailTemplate('new_message', { product: 'golf' }).html)).toBe('https://app.example.test/golf/dashboard/settings/notifications');
    expect(footerHref(generateEmailTemplate('new_message', {}).html)).toBe('https://app.example.test/golf/dashboard/settings/notifications');
  });

  it('GolfHelm mail opens the Notifications section, not the top of Settings', () => {
    for (const type of ['team_announcement', 'task_assigned', 'dev_plan_assigned'] as const) {
      expect(footerHref(generateEmailTemplate(type, {}).html), type).toBe('https://app.example.test/golf/dashboard/settings/notifications');
    }
  });
});

describe('the BaseballHelm send helpers say which product they are', () => {
  it('watchlist, pipeline, profile view and a baseball message pass product: baseball; a golf message passes golf', async () => {
    vi.resetModules();
    const send = vi.fn().mockResolvedValue({ success: true });
    vi.doMock('../email', () => ({ sendEmailNotification: send }));
    vi.doMock('../in-app', () => ({ recordInAppNotification: vi.fn() }));
    vi.doMock('../push', () => ({}));
    const n = await import('../index');
    await n.notifyWatchlistAdd('u1', 'p@example.test', 'Coach Ruiz', 'State');
    await n.notifyPipelineStageChange('u1', 'p@example.test', 'State', 'watchlist');
    await n.notifyProfileView('u1', 'p@example.test', 'A coach from Texas');
    await n.notifyNewMessage('u1', 'p@example.test', 'Coach Ruiz', 'Hi', 'c1');
    await n.notifyNewMessage('u1', 'p@example.test', 'Coach Ruiz', 'Hi', 'c1', 'golf');
    const products = send.mock.calls.map((c) => [c[0], (c[3] as { product?: string }).product]);
    expect(products).toEqual([
      ['watchlist_add', 'baseball'],
      ['pipeline_stage_change', 'baseball'],
      ['profile_view', 'baseball'],
      ['new_message', 'baseball'],
      ['new_message', 'golf'],
    ]);
    vi.doUnmock('../email');
    vi.doUnmock('../in-app');
    vi.doUnmock('../push');
  });
});

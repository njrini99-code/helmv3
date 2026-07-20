// =============================================================================
// src/app/golf/actions/__tests__/crm-insights.test.ts
//
// Regression coverage for the "insights" wiring-audit fixes:
//   1. getTemplatePerformance / getClickDestinations must call their RPC via
//      the service-role admin client (authenticated/anon EXECUTE was
//      revoked on both functions), not the cookie/session client — after
//      requireAdmin() has already verified the caller is an admin.
//   2. All five RPC-backed actions re-throw on error instead of silently
//      returning [] / null / a zeroed summary — see this file's fetchAll()
//      Promise.allSettled pattern in InsightsDashboard.tsx.
//   3. getDeliverabilitySummary passes '90d' straight through to
//      get_resend_activity_stats instead of aliasing it to 'all'.
//   4. (2026-07-20 metric-alignment fix) getDeliverabilitySummary maps the
//      "Sent" KPI from the RPC's `sent` field (sent_at IS NOT NULL), not
//      `total` (every row in the window, including never-sent ones) — and
//      delivery_rate/bounce_rate use `sent` as their denominator to match.
//   5. (2026-07-20 metric-alignment fix) getDeliverabilitySummary and
//      getCrmFunnel now re-throw on RPC error instead of swallowing it to a
//      zeroed summary / null, matching the other three insights actions.
//   6. (2026-07-20 metric-alignment fix) getTemplatePerformance's open_rate/
//      click_rate return null (not a rate against sent_count) when
//      delivered_count is 0, instead of fabricating a rate.
// =============================================================================

import { describe, it, expect, vi, beforeEach } from 'vitest';

const mocks = vi.hoisted(() => ({
  getUser: vi.fn(async () => ({ data: { user: { id: 'admin-1' } } })),
  usersSingle: vi.fn(async () => ({ data: { role: 'admin' } })),
  sessionRpc: vi.fn(),
  adminRpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({
    auth: { getUser: mocks.getUser },
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: mocks.usersSingle,
        })),
      })),
    })),
    rpc: mocks.sessionRpc,
  })),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({
    rpc: mocks.adminRpc,
  })),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
}));

import {
  getTemplatePerformance,
  getClickDestinations,
  getTimeToOpenDistribution,
  getDeliverabilitySummary,
  getCrmFunnel,
} from '../crm-insights';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.getUser.mockResolvedValue({ data: { user: { id: 'admin-1' } } });
  mocks.usersSingle.mockResolvedValue({ data: { role: 'admin' } });
});

describe('getTemplatePerformance', () => {
  it('calls get_crm_template_performance via the admin (service-role) client, not the session client', async () => {
    mocks.adminRpc.mockResolvedValue({ data: [], error: null });

    await getTemplatePerformance('30d');

    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'get_crm_template_performance',
      { p_window: '30d' },
    );
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });

  it('re-throws instead of swallowing an RPC error to []', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function get_crm_template_performance', code: '42501' },
    });

    await expect(getTemplatePerformance('30d')).rejects.toThrow(/Failed to load template performance/);
  });

  it('still enforces the admin check before calling the RPC', async () => {
    mocks.usersSingle.mockResolvedValue({ data: { role: 'coach' } });

    await expect(getTemplatePerformance('30d')).rejects.toThrow('Forbidden');
    expect(mocks.adminRpc).not.toHaveBeenCalled();
  });

  it('returns a null rate (not a rate against sent_count) when delivered_count is 0', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: [
        {
          template_id: 't1',
          template_name: 'Cold outreach',
          sent_count: 10,
          delivered_count: 0,
          opened_count: 0,
          clicked_count: 0,
          bounced_count: 0,
        },
      ],
      error: null,
    });

    const [row] = await getTemplatePerformance('30d');

    expect(row.open_rate).toBeNull();
    expect(row.click_rate).toBeNull();
  });

  it('rates opened/clicked against delivered_count when delivered_count > 0', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: [
        {
          template_id: 't1',
          template_name: 'Cold outreach',
          sent_count: 10,
          delivered_count: 8,
          opened_count: 4,
          clicked_count: 2,
          bounced_count: 2,
        },
      ],
      error: null,
    });

    const [row] = await getTemplatePerformance('30d');

    expect(row.open_rate).toBe(0.5);
    expect(row.click_rate).toBe(0.25);
  });
});

describe('getClickDestinations', () => {
  it('calls get_crm_click_destinations via the admin (service-role) client, not the session client', async () => {
    mocks.adminRpc.mockResolvedValue({ data: [], error: null });

    await getClickDestinations('7d', 25);

    expect(mocks.adminRpc).toHaveBeenCalledWith(
      'get_crm_click_destinations',
      { p_window: '7d', p_limit: 25 },
    );
    expect(mocks.sessionRpc).not.toHaveBeenCalled();
  });

  it('re-throws instead of swallowing an RPC error to []', async () => {
    mocks.adminRpc.mockResolvedValue({
      data: null,
      error: { message: 'permission denied for function get_crm_click_destinations', code: '42501' },
    });

    await expect(getClickDestinations('7d')).rejects.toThrow(/Failed to load click destinations/);
  });
});

describe('getTimeToOpenDistribution', () => {
  it('re-throws instead of swallowing an RPC error to []', async () => {
    mocks.sessionRpc.mockResolvedValue({
      data: null,
      error: { message: 'boom', code: 'XX000' },
    });

    await expect(getTimeToOpenDistribution('30d')).rejects.toThrow(/Failed to load time-to-open distribution/);
  });
});

describe('getDeliverabilitySummary', () => {
  it('passes the "90d" window straight through to get_resend_activity_stats instead of aliasing to "all"', async () => {
    mocks.sessionRpc.mockResolvedValue({
      data: {
        total: 120,
        sent: 100,
        delivered: 90,
        opened: 40,
        clicked: 10,
        bounced: 5,
        complained: 1,
      },
      error: null,
    });

    const summary = await getDeliverabilitySummary('90d');

    expect(mocks.sessionRpc).toHaveBeenCalledWith('get_resend_activity_stats', { p_window: '90d' });
    expect(summary.window).toBe('90d');
    expect(summary.total_sent).toBe(100);
  });

  it('maps the "Sent" KPI from `sent` (sent_at IS NOT NULL), not `total` (every row in the window)', async () => {
    // `total` intentionally differs from `sent` here — rows that landed in
    // the window but haven't gone out yet (draft/queued) count toward
    // `total` but must never inflate the "Sent" KPI.
    mocks.sessionRpc.mockResolvedValue({
      data: {
        total: 250,
        sent: 100,
        delivered: 90,
        opened: 40,
        clicked: 10,
        bounced: 5,
        complained: 1,
      },
      error: null,
    });

    const summary = await getDeliverabilitySummary('30d');

    expect(summary.total_sent).toBe(100);
    expect(summary.total_sent).not.toBe(250);
    // delivery_rate / bounce_rate denominators track `sent`, matching the
    // "Sent" KPI they're displayed next to.
    expect(summary.delivery_rate).toBe(0.9);
    expect(summary.bounce_rate).toBe(0.05);
  });

  it('re-throws (does not return a zeroed summary) when the RPC errors', async () => {
    mocks.sessionRpc.mockResolvedValue({
      data: null,
      error: { message: 'boom', code: 'XX000' },
    });

    await expect(getDeliverabilitySummary('30d')).rejects.toThrow(/Failed to load deliverability summary/);
  });
});

describe('getCrmFunnel', () => {
  it('re-throws (does not return null) when the RPC errors', async () => {
    mocks.sessionRpc.mockResolvedValue({
      data: null,
      error: { message: 'boom', code: 'XX000' },
    });

    await expect(getCrmFunnel('30d')).rejects.toThrow(/Failed to load outreach funnel/);
  });

  it('still returns null (not a throw) when the RPC succeeds with no row', async () => {
    mocks.sessionRpc.mockResolvedValue({ data: null, error: null });

    await expect(getCrmFunnel('30d')).resolves.toBeNull();
  });
});

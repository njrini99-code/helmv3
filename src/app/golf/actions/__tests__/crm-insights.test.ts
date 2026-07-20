// =============================================================================
// src/app/golf/actions/__tests__/crm-insights.test.ts
//
// Regression coverage for the "insights" wiring-audit fixes:
//   1. getTemplatePerformance / getClickDestinations must call their RPC via
//      the service-role admin client (authenticated/anon EXECUTE was
//      revoked on both functions), not the cookie/session client — after
//      requireAdmin() has already verified the caller is an admin.
//   2. All three RPC-backed actions re-throw on error instead of silently
//      returning [] — see this file's fetchAll() try/catch pattern.
//   3. getDeliverabilitySummary passes '90d' straight through to
//      get_resend_activity_stats instead of aliasing it to 'all'.
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
        total: 100,
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

  it('returns a zeroed summary (not a throw) when the RPC errors', async () => {
    mocks.sessionRpc.mockResolvedValue({
      data: null,
      error: { message: 'boom', code: 'XX000' },
    });

    const summary = await getDeliverabilitySummary('30d');

    expect(summary).toEqual({
      window: '30d',
      total_sent: 0,
      delivered: 0,
      opened: 0,
      clicked: 0,
      bounced: 0,
      complained: 0,
      delivery_rate: null,
      open_rate: null,
      click_rate: null,
      bounce_rate: null,
    });
  });
});

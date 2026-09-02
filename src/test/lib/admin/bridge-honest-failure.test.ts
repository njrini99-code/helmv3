/**
 * The Bridge must never fail toward reassurance.
 *
 * Three separate paths turned a broken query into a positive claim of health:
 *   - incident-feed.ts destructured only `data`, so a PostgREST fault became
 *     `0 incidents` on the nav badge, KPI strip, triage queue and Errors tab at
 *     once — and the agreement test certified all four matched, on zero.
 *   - briefing.ts wrapped all seven "Needs your eyes" checks in
 *     `catch { return null }`, and an empty list renders a green "All clear".
 *   - provider faults never reached the classifier branch built for them, so a
 *     spent Anthropic balance read as an app defect.
 */
import { describe, it, expect, vi } from 'vitest';
import { classifyIncident } from '@/lib/admin/incident-classification';
import { extractErrorCode } from '@/lib/admin/incident-report';

describe('provider faults reach the integration classifier', () => {
  // The branch has existed since day one; until now only tests passed errorCode,
  // so every real provider fault classified as a generic app defect.
  const PROVIDER_CODES = [
    'provider_anthropic_credit_exhausted',
    'provider_vercel_ai_gateway_credit_exhausted',
    'provider_inngest_invalid_credential',
    'provider_sentry_rate_limited',
  ];

  it.each(PROVIDER_CODES)('classifies %s as an integration fault, not a defect', (code) => {
    const withCode = classifyIncident({
      title: 'AI features are unavailable',
      message: 'the Anthropic account is out of credit',
      severity: 'error',
      source: 'server_action',
      errorCode: code,
    });
    expect(withCode.klass).toBe('integration');
    expect(withCode.reason).toContain(code);
  });

  it('is the errorCode — not the wording — that does the work', () => {
    // Same text, no code: this is what every production row got before the fix.
    const withoutCode = classifyIncident({
      title: 'AI features are unavailable',
      message: 'the Anthropic account is out of credit',
      severity: 'error',
      source: 'server_action',
      errorCode: null,
    });
    expect(withoutCode.klass).not.toBe('integration');
  });

  it('reads the code off the metadata shape the logger actually writes', () => {
    // server-error-logger persists context.errorCode as metadata.errorCode
    // (camelCase). Verified against a real production row 2026-08-06.
    expect(extractErrorCode({ errorCode: 'provider_inngest_invalid_credential' }))
      .toBe('provider_inngest_invalid_credential');
    expect(extractErrorCode({ error_code: 'provider_x_y' })).toBeNull();
    expect(extractErrorCode({})).toBeNull();
    expect(extractErrorCode(null)).toBeNull();
  });
});

describe('the nav badge refuses to report a fault as zero', () => {
  // overview.ts turned the throw below back into `0` with `catch { return 0 }`,
  // and unstable_cache then held that false zero for 60s — no badge, exactly
  // what "no incidents" renders. Twenty lines away layout.tsx did the opposite
  // for the Health badge ("null — never 0").
  it('fetchBridgeErrorBadge resolves null — never 0 — when the feed read fails', async () => {
    vi.resetModules();
    vi.doMock('next/cache', () => ({
      unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
      revalidateTag: vi.fn(),
      updateTag: vi.fn(),
    }));
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }));
    vi.doMock('@/lib/admin/vercel-api', () => ({ fetchVercelDeployments: vi.fn(), deployAgeMinutes: vi.fn() }));
    vi.doMock('@/lib/admin/data/feature-health', () => ({
      fetchFeatureHealth: vi.fn(),
      summarizeFeatureHealth: vi.fn(),
      computeFeatureHealthBanner: vi.fn(),
    }));
    vi.doMock('@/lib/admin/data/incident-feed', () => ({
      DEFAULT_INCIDENT_WINDOW_HOURS: 24,
      cachedIncidentFeed: vi.fn(),
      buildIncidentFeedFromSources: vi.fn(),
      queryAppErrorEvents: async () => {
        throw new Error('statement timeout');
      },
    }));
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { fetchBridgeErrorBadge } = await import('@/lib/admin/data/overview');
    await expect(fetchBridgeErrorBadge()).resolves.toBeNull();

    warn.mockRestore();
    vi.doUnmock('@/lib/admin/data/incident-feed');
    vi.doUnmock('@/lib/admin/data/feature-health');
    vi.doUnmock('@/lib/admin/vercel-api');
    vi.doUnmock('@/lib/supabase/admin');
    vi.doUnmock('next/cache');
  });
});

describe('the incident feed refuses to report a fault as zero', () => {
  it('throws when the underlying page read fails', async () => {
    vi.resetModules();
    vi.doMock('@/lib/supabase/admin', () => ({ createAdminClient: () => ({ from: () => ({}) }) }));
    vi.doMock('@/lib/supabase/fetch-all-rows', () => ({
      // Exactly what fetch-all-rows returns when the FIRST page fails.
      fetchAllRowsResult: async () => ({ data: null, error: { message: 'statement timeout' } }),
    }));

    const { queryAppErrorEvents } = await import('@/lib/admin/data/incident-feed');

    // Previously resolved to [] — which every caller renders as a confident 0.
    await expect(queryAppErrorEvents({ windowHours: 24 })).rejects.toThrow(/statement timeout/);
    vi.doUnmock('@/lib/supabase/fetch-all-rows');
    vi.doUnmock('@/lib/supabase/admin');
  });
});

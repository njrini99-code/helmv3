import { describe, it, expect, vi, beforeEach } from 'vitest';

// vi.mock is hoisted above imports, so the spy must be created in a hoisted
// block too — a plain top-level const is not initialised when the factory runs.
const { logServerError } = vi.hoisted(() => ({ logServerError: vi.fn(async () => {}) }));
vi.mock('@/lib/server-error-logger', () => ({ logServerError }));

import {
  summarizeSettledFailures,
  reportSettledFailures,
  allSettledReported,
  MAX_FAILURE_REASONS,
} from '@/lib/settled-failures';

describe('summarizeSettledFailures', () => {
  it('counts every rejection but keeps only DISTINCT reasons', () => {
    const results: PromiseSettledResult<unknown>[] = [
      { status: 'fulfilled', value: 1 },
      { status: 'rejected', reason: new Error('permission denied for table baseball_players') },
      { status: 'rejected', reason: new Error('permission denied for table baseball_players') },
      { status: 'rejected', reason: new Error('APNs 410 Unregistered') },
    ];
    const { failed, reasons } = summarizeSettledFailures(results);
    expect(failed).toBe(3);
    expect(reasons).toEqual([
      'permission denied for table baseball_players',
      'APNs 410 Unregistered',
    ]);
  });

  it('bounds distinct reasons so one systemic failure cannot write one per recipient', () => {
    const results: PromiseSettledResult<unknown>[] = Array.from({ length: 50 }, (_, i) => ({
      status: 'rejected' as const,
      reason: new Error(`distinct failure ${i}`),
    }));
    const { failed, reasons } = summarizeSettledFailures(results);
    expect(failed).toBe(50);
    expect(reasons).toHaveLength(MAX_FAILURE_REASONS);
  });

  it('describes non-Error rejections instead of dropping them', () => {
    const { reasons } = summarizeSettledFailures([
      { status: 'rejected', reason: 'plain string' },
      { status: 'rejected', reason: { code: '42501' } },
    ]);
    expect(reasons).toContain('plain string');
    expect(reasons.some((r) => r.includes('42501'))).toBe(true);
  });

  it('reports nothing when everything succeeded', () => {
    const { failed, reasons } = summarizeSettledFailures([
      { status: 'fulfilled', value: 'a' },
      { status: 'fulfilled', value: 'b' },
    ]);
    expect(failed).toBe(0);
    expect(reasons).toEqual([]);
  });
});

describe('reportSettledFailures — the INC-2026-08-27 regression', () => {
  beforeEach(() => logServerError.mockClear());

  it('writes each distinct cause so admin_events (and the Bridge) sees it', async () => {
    await reportSettledFailures(
      [
        { status: 'fulfilled', value: 1 },
        { status: 'rejected', reason: new Error('permission denied for table baseball_players') },
        { status: 'rejected', reason: new Error('permission denied for table baseball_players') },
      ],
      { action: 'cron.eventReminders', featureArea: 'calendar', label: '24h' },
    );

    expect(logServerError).toHaveBeenCalledTimes(1);
    const [message, context] = logServerError.mock.calls[0] as [string, Record<string, unknown>];
    // The COUNT alone is what made this invisible for two days. Both must be present.
    expect(message).toContain('2 of 3 failed');
    expect(message).toContain('permission denied for table baseball_players');
    expect(context).toMatchObject({ action: 'cron.eventReminders', featureArea: 'calendar' });
  });

  it('stays silent when nothing failed', async () => {
    await reportSettledFailures([{ status: 'fulfilled', value: 1 }], { action: 'x' });
    expect(logServerError).not.toHaveBeenCalled();
  });

  it('does not change control flow — a rejection never propagates', async () => {
    const results = await allSettledReported(
      [Promise.resolve('ok'), Promise.reject(new Error('boom'))],
      { action: 'notifications.fanout' },
    );
    expect(results).toHaveLength(2);
    expect(results[0]?.status).toBe('fulfilled');
    expect(results[1]?.status).toBe('rejected');
    expect(logServerError).toHaveBeenCalledTimes(1);
  });
});

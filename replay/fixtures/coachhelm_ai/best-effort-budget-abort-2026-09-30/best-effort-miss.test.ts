/**
 * Regression: a best-effort enrichment that trips its OWN abort budget is
 * designed degradation, not an incident.
 *
 * Production, 2026-09-28 → 2026-09-30: `fetchShotDriversByCategory` and
 * `getTopInsightForPlayer`'s urgent pass logged every budget abort at
 * 'warning', so each one landed on the Bridge triage queue
 * (/admin/errors/8ff00f0e — 7 rows in 24h, reopened 3x; /admin/errors/20ed2ddd
 * — reopened 4x). Both carry a NOT A DEFECT analysis, so every Close sweep
 * resolved them and the next abort re-opened them as REGRESSED: a loop that
 * asks a human to triage the design working as intended.
 *
 * The budget miss is now 'info' with durableCollapse (same treatment as the
 * CAS backoff in #2066, 57d84dd1). Any OTHER failure on the same path is not
 * a budget miss and stays a 'warning' so a real regression still surfaces.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const { logServerError, logServerEvent } = vi.hoisted(() => ({
  logServerError: vi.fn().mockResolvedValue(undefined),
  logServerEvent: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@/lib/server-error-logger', () => ({ logServerError, logServerEvent }));

import { isBudgetAbort, logBestEffortMiss } from '../best-effort-miss';

const ctx = {
  action: 'insight-delivery.fetchShotDriversByCategory',
  featureArea: 'insights',
  playerId: 'p1',
};

describe('isBudgetAbort', () => {
  it.each([
    'AbortError: This operation was aborted', // 8ff00f0e, verbatim
    'TimeoutError: The operation was aborted due to timeout', // 20ed2ddd, verbatim
    'canceling statement due to statement timeout',
  ])('treats %s as a budget miss', (msg) => {
    expect(isBudgetAbort(msg)).toBe(true);
  });

  it.each([
    'column golf_shots.club does not exist',
    'permission denied for table golf_shots',
    'TypeError: fetch failed',
    '',
  ])('does not treat %s as a budget miss', (msg) => {
    expect(isBudgetAbort(msg)).toBe(false);
  });
});

describe('logBestEffortMiss', () => {
  beforeEach(() => {
    logServerError.mockClear();
    logServerEvent.mockClear();
  });

  it('logs a budget abort at info with durableCollapse and skipSentry — never a warning', async () => {
    await logBestEffortMiss(
      'fetchShotDriversByCategory failed (continuing without shot drivers)',
      'AbortError: This operation was aborted',
      ctx,
    );
    expect(logServerError).not.toHaveBeenCalled();
    expect(logServerEvent).toHaveBeenCalledTimes(1);
    const [message, context, severity] = logServerEvent.mock.calls[0]!;
    expect(message).toBe(
      'fetchShotDriversByCategory failed (continuing without shot drivers): AbortError: This operation was aborted',
    );
    expect(context).toMatchObject({ ...ctx, skipSentry: true, durableCollapse: true });
    expect(severity).toBe('info');
  });

  it('keeps any other failure a warning so a real regression still reaches triage', async () => {
    await logBestEffortMiss(
      'fetchShotDriversByCategory failed (continuing without shot drivers)',
      'column golf_shots.club does not exist',
      ctx,
    );
    expect(logServerEvent).not.toHaveBeenCalled();
    expect(logServerError).toHaveBeenCalledTimes(1);
    const [message, context, severity] = logServerError.mock.calls[0]!;
    expect(message).toBe(
      'fetchShotDriversByCategory failed (continuing without shot drivers): column golf_shots.club does not exist',
    );
    expect(context).toMatchObject({ ...ctx, skipSentry: true });
    expect(severity).toBe('warning');
  });
});

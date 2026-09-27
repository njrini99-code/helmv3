/**
 * Regression for JAVASCRIPT-NEXTJS-XG / -XE: "Round setup restored after
 * reload" is the pending-tee-pick recovery WORKING, but it was reported via
 * `logError(new Error(...))` → `Sentry.captureException`, which opened
 * error-category issues for a success path. The signal must survive (it is
 * the only evidence of a mid-setup reload) as an info-level Sentry log plus a
 * breadcrumb — and must never become an exception again.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const sentry = vi.hoisted(() => ({
  captureException: vi.fn(),
  captureMessage: vi.fn(),
  addBreadcrumb: vi.fn(),
  flush: vi.fn(() => Promise.resolve(true)),
  logger: { trace: vi.fn(), debug: vi.fn(), info: vi.fn(), warn: vi.fn(), error: vi.fn(), fatal: vi.fn() },
  metrics: { count: vi.fn(), gauge: vi.fn(), distribution: vi.fn() },
}));

vi.mock('@sentry/nextjs', () => sentry);

import {
  ROUND_SETUP_RESTORED_EVENT,
  reportRoundSetupRestoredAfterReload,
} from '../new-round-setup-restore-signal';

describe('reportRoundSetupRestoredAfterReload', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('emits one info-level structured log carrying the same diagnostic context as before', () => {
    vi.stubGlobal('navigator', {
      onLine: true,
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_7 like Mac OS X) Mobile/15E148 HelmSportsLabsApp',
    });
    reportRoundSetupRestoredAfterReload({
      courseId: '0d647d6e-cf24-4a86-bddf-a3b4b4f4a7ad',
      teeId: '9307bc0f-5cf3-40fa-a33e-06b560d4fe0d',
    });

    expect(sentry.logger.info).toHaveBeenCalledTimes(1);
    const [event, attributes] = sentry.logger.info.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe(ROUND_SETUP_RESTORED_EVENT);
    expect(attributes).toMatchObject({
      event: ROUND_SETUP_RESTORED_EVENT,
      sport: 'golf',
      feature: 'round_tracking',
      action: 'round_setup_restore',
      result: 'restored',
      component: 'NewRoundClient',
      route: '/golf/dashboard/rounds/new',
      course_id: '0d647d6e-cf24-4a86-bddf-a3b4b4f4a7ad',
      tee_id: '9307bc0f-5cf3-40fa-a33e-06b560d4fe0d',
      navigator_online: true,
      is_native: true,
    });
    expect(sentry.logger.error).not.toHaveBeenCalled();
    expect(sentry.logger.warn).not.toHaveBeenCalled();
  });

  it('leaves a golf.round breadcrumb so a later real error in the session shows the restore', () => {
    reportRoundSetupRestoredAfterReload({ courseId: 'c-1', teeId: 't-1' });

    expect(sentry.addBreadcrumb).toHaveBeenCalledTimes(1);
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({
        category: 'golf.round',
        level: 'info',
        message: 'Round setup restored after reload',
      }),
    );
  });

  it('never reports the recovery as an exception or an issue-creating message', () => {
    reportRoundSetupRestoredAfterReload({ courseId: 'c-1', teeId: 't-1' });

    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('NewRoundClient restore call site', () => {
  it('routes the restore through the info-level helper, not logError(new Error(...))', () => {
    const source = readFileSync(
      resolve(process.cwd(), 'src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx'),
      'utf8',
    );
    expect(source).not.toMatch(/new Error\(\s*['"]Round setup restored after reload['"]/);
    expect(source).toMatch(/reportRoundSetupRestoredAfterReload\(\{\s*courseId: pending\.courseId,\s*teeId: pending\.teeId\s*\}\)/);
  });
});

/**
 * Regression for Bridge fingerprints 633f48a5 ("Round start failed:
 * duplicate_completed_round") and e2530283 ("Round start blocked: Round date
 * cannot be in the future."). Both are the New Round guards WORKING, but they
 * were reported through `logError(new Error(...))`, which opened Bridge
 * incidents for expected outcomes. They must survive as info-level Sentry
 * logs plus a breadcrumb, and must never become exceptions again.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

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
  ROUND_START_DUPLICATE_WARNED_EVENT,
  ROUND_START_VALIDATION_BLOCKED_EVENT,
  reportDuplicateCompletedRoundWarned,
  reportRoundStartValidationBlocked,
} from '../round-start-guard-signal';

describe('reportDuplicateCompletedRoundWarned', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits one info-level structured log with the start context', () => {
    reportDuplicateCompletedRoundWarned({
      completedRoundId: 'r-1',
      courseId: 'c-1',
      teeId: 't-1',
      roundType: 'practice',
      roundDate: '2026-09-25',
    });

    expect(sentry.logger.info).toHaveBeenCalledTimes(1);
    const [event, attributes] = sentry.logger.info.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe(ROUND_START_DUPLICATE_WARNED_EVENT);
    expect(attributes).toMatchObject({
      sport: 'golf',
      feature: 'round_tracking',
      action: 'round_start',
      result: 'duplicate_completed_round_warned',
      completed_round_id: 'r-1',
      course_id: 'c-1',
      tee_id: 't-1',
      round_type: 'practice',
      round_date: '2026-09-25',
    });
    expect(sentry.logger.error).not.toHaveBeenCalled();
    expect(sentry.logger.warn).not.toHaveBeenCalled();
  });

  it('never reports the guard as an exception or an issue-creating message', () => {
    reportDuplicateCompletedRoundWarned({
      completedRoundId: 'r-1',
      courseId: null,
      teeId: null,
      roundType: undefined,
      roundDate: undefined,
    });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
    expect(sentry.addBreadcrumb).toHaveBeenCalledWith(
      expect.objectContaining({ category: 'golf.round', level: 'info' }),
    );
  });
});

describe('reportRoundStartValidationBlocked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('emits one info-level structured log naming the validation message', () => {
    reportRoundStartValidationBlocked({
      validationError: 'Round date cannot be in the future.',
      roundType: 'practice',
      roundDate: '2026-09-30',
    });

    expect(sentry.logger.info).toHaveBeenCalledTimes(1);
    const [event, attributes] = sentry.logger.info.mock.calls[0] as [string, Record<string, unknown>];
    expect(event).toBe(ROUND_START_VALIDATION_BLOCKED_EVENT);
    expect(attributes).toMatchObject({
      action: 'round_start_validation',
      result: 'blocked',
      validation_error: 'Round date cannot be in the future.',
    });
    expect(sentry.captureException).not.toHaveBeenCalled();
    expect(sentry.captureMessage).not.toHaveBeenCalled();
  });
});

describe('NewRoundClient guard call sites', () => {
  const source = readFileSync(
    resolve(process.cwd(), 'src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx'),
    'utf8',
  );

  it('routes duplicate_completed_round through the info helper, not reportStartFailure/logError', () => {
    expect(source).not.toMatch(/reportStartFailure\(\s*['"]duplicate_completed_round['"]/);
    expect(source).toMatch(/reportDuplicateCompletedRoundWarned\(\{/);
  });

  it('routes a validation block through the info helper, not logError(new Error(...))', () => {
    expect(source).not.toMatch(/new Error\(\s*`Round start blocked:/);
    expect(source).toMatch(/reportRoundStartValidationBlocked\(\{/);
  });

  it('keeps genuine start failures on logError', () => {
    expect(source).toMatch(/reportStartFailure\('server_rejected'/);
    expect(source).toMatch(/new Error\(`Round start failed: \$\{reason\}`\)/);
  });
});

import { describe, expect, it } from 'vitest';
import {
  PARKED_OUTCOME_CODES,
  classifyThrown,
  isParkedTerminalState,
  outcomeFromTriggerResult,
  retryPolicyFor,
  terminalStateFor,
} from '@/lib/coachhelm/v3/engine/analysis-outcome';

const NOW = '2026-09-12T20:00:00.000Z';

describe('outcomeFromTriggerResult', () => {
  it('a clean success is succeeded — zero findings included', () => {
    expect(outcomeFromTriggerResult({ success: true, insights_created: 0 }).kind).toBe('succeeded');
  });

  it('a success that dropped generators is partial', () => {
    const outcome = outcomeFromTriggerResult({ success: true, partial: true });
    expect(outcome.kind).toBe('partial');
    expect(outcome.code).toBe('engine_partial_failure');
  });

  it('a player below the coach round floor is waiting_for_data, not a failure', () => {
    const outcome = outcomeFromTriggerResult({
      success: false,
      error: 'player has 2 completed rounds, coach floor is 3',
      code: 'engine_below_round_floor',
      details: { completedRounds: 2, floor: 3 },
    });
    expect(outcome.kind).toBe('waiting_for_data');
    expect(outcome.details).toEqual({ completedRounds: 2, floor: 3 });
  });

  it('no rounds in the lookback is waiting_for_data', () => {
    expect(
      outcomeFromTriggerResult({ success: false, error: 'No completed rounds', code: 'engine_no_recent_rounds' }).kind,
    ).toBe('waiting_for_data');
  });

  it('a teamless player is not_applicable', () => {
    expect(
      outcomeFromTriggerResult({ success: false, error: 'No active team membership', code: 'engine_no_team_membership' }).kind,
    ).toBe('not_applicable');
  });

  it('an org without a coach is not_applicable', () => {
    expect(
      outcomeFromTriggerResult({ success: false, error: 'Coach not found', code: 'engine_no_coach' }).kind,
    ).toBe('not_applicable');
  });

  it('a coach or team switch-off is disabled', () => {
    expect(
      outcomeFromTriggerResult({ success: false, error: 'CoachHelm disabled for team', code: 'engine_disabled' }).kind,
    ).toBe('disabled');
  });

  it('a timeout is a retryable failure', () => {
    expect(
      outcomeFromTriggerResult({ success: false, error: 'statement timed out', code: 'engine_timeout' }).kind,
    ).toBe('retryable_failure');
  });

  it('an uncoded failure is a permanent failure that keeps its message', () => {
    const outcome = outcomeFromTriggerResult({ success: false, error: 'Failed to save insights' });
    expect(outcome.kind).toBe('permanent_failure');
    expect(outcome.code).toBe('engine_error');
    expect(outcome.message).toBe('Failed to save insights');
  });

  it('keeps the original exception when the engine preserved one', () => {
    const outcome = outcomeFromTriggerResult({
      success: false,
      error: 'analysis threw',
      code: 'engine_error',
      cause: { name: 'TypeError', message: "Cannot read properties of undefined (reading 'x')", stack: 'TypeError: …' },
    });
    expect(outcome.cause?.name).toBe('TypeError');
    expect(outcome.cause?.message).toContain('reading');
  });
});

describe('classifyThrown', () => {
  it('a timeout is retryable and keeps the exception', () => {
    const err = new Error('canceling statement due to statement timeout');
    const outcome = classifyThrown(err);
    expect(outcome.kind).toBe('retryable_failure');
    expect(outcome.code).toBe('engine_timeout');
    expect(outcome.cause?.message).toBe(err.message);
    expect(outcome.cause?.stack).toBe(err.stack);
  });

  it('a network / dependency fault is retryable', () => {
    expect(classifyThrown(new Error('fetch failed: ECONNRESET')).code).toBe('engine_transient');
    expect(classifyThrown(Object.assign(new Error('boom'), { code: '57P01' })).code).toBe('engine_transient');
  });

  it('a missing auth session is named as such, and only when it is one', () => {
    expect(classifyThrown(new Error('Auth session missing!')).code).toBe('engine_session_expired');
    expect(classifyThrown(new TypeError("Cannot read properties of undefined (reading 'length')")).code).toBe(
      'engine_error',
    );
  });

  it('an unknown exception is a permanent failure that stays inspectable', () => {
    const err = new RangeError('Invalid array length');
    const outcome = classifyThrown(err);
    expect(outcome.kind).toBe('permanent_failure');
    expect(outcome.cause).toMatchObject({ name: 'RangeError', message: 'Invalid array length' });
  });

  it('a non-Error throw is still described', () => {
    expect(classifyThrown('nope').cause?.message).toBe('nope');
  });
});

describe('terminalStateFor', () => {
  it('succeeded stamps analyzed and clears the failure columns', () => {
    expect(terminalStateFor(outcomeFromTriggerResult({ success: true }), NOW)).toEqual({
      coachhelm_analyzed_at: NOW,
      coachhelm_failed_at: null,
      coachhelm_failure_reason: null,
    });
  });

  it('partial stamps analyzed and keeps the partial marker', () => {
    expect(terminalStateFor(outcomeFromTriggerResult({ success: true, partial: true }), NOW)).toEqual({
      coachhelm_analyzed_at: NOW,
      coachhelm_failed_at: null,
      coachhelm_failure_reason: 'engine_partial_failure',
    });
  });

  it.each([
    ['engine_below_round_floor', 'waiting_for_data'],
    ['engine_no_recent_rounds', 'waiting_for_data'],
    ['engine_no_team_membership', 'not_applicable'],
    ['engine_no_coach', 'not_applicable'],
    ['engine_disabled', 'disabled'],
  ] as const)('%s parks the round: no analyzed stamp, NO failure stamp, code recorded', (code, kind) => {
    const outcome = outcomeFromTriggerResult({ success: false, error: 'x', code });
    expect(outcome.kind).toBe(kind);
    const state = terminalStateFor(outcome, NOW);
    expect(state).toEqual({
      coachhelm_analyzed_at: null,
      coachhelm_failed_at: null,
      coachhelm_failure_reason: code,
    });
    expect(PARKED_OUTCOME_CODES.has(code)).toBe(true);
    expect(isParkedTerminalState(state)).toBe(true);
  });

  it('retryable and permanent failures stamp failed_at with the code', () => {
    expect(terminalStateFor(classifyThrown(new Error('timed out')), NOW)).toEqual({
      coachhelm_analyzed_at: null,
      coachhelm_failed_at: NOW,
      coachhelm_failure_reason: 'engine_timeout',
    });
    expect(terminalStateFor(classifyThrown(new RangeError('bad')), NOW)).toEqual({
      coachhelm_analyzed_at: null,
      coachhelm_failed_at: NOW,
      coachhelm_failure_reason: 'engine_error',
    });
  });

  it('a parked row is not one that was never processed, and not a failed one', () => {
    expect(isParkedTerminalState({ coachhelm_analyzed_at: null, coachhelm_failed_at: null, coachhelm_failure_reason: null })).toBe(false);
    expect(
      isParkedTerminalState({ coachhelm_analyzed_at: null, coachhelm_failed_at: NOW, coachhelm_failure_reason: 'engine_no_recent_rounds' }),
    ).toBe(false);
  });
});

describe('retryPolicyFor', () => {
  it('names a wake-up event for every non-failure kind', () => {
    expect(retryPolicyFor('succeeded').mode).toBe('on_new_evidence');
    expect(retryPolicyFor('partial').mode).toBe('bounded_retry');
    expect(retryPolicyFor('waiting_for_data').mode).toBe('wake_on_round');
    expect(retryPolicyFor('not_applicable').mode).toBe('wake_on_membership');
    expect(retryPolicyFor('disabled').mode).toBe('wake_on_settings');
  });

  it('bounds retries for transient faults and sends hard failures to repair', () => {
    const retryable = retryPolicyFor('retryable_failure');
    expect(retryable.mode).toBe('backoff_with_deadline');
    expect(retryable.minBackoffMs).toBeGreaterThan(0);
    expect(retryable.maxAttempts).toBeGreaterThanOrEqual(2);
    expect(retryPolicyFor('permanent_failure').mode).toBe('manual_repair');
  });
});

describe('uncoded envelopes', () => {
  it('reads only transient-vs-permanent off the text, never an expected state', () => {
    expect(outcomeFromTriggerResult({ success: false, error: 'statement timed out' }).code).toBe('engine_timeout');
    expect(outcomeFromTriggerResult({ success: false, error: 'fetch failed: ECONNRESET' }).code).toBe('engine_transient');
    // "No completed rounds" text without a code is NOT promoted to waiting_for_data.
    const uncoded = outcomeFromTriggerResult({ success: false, error: 'No completed rounds in the last 90 days' });
    expect(uncoded.kind).toBe('permanent_failure');
    expect(uncoded.code).toBe('engine_error');
  });
});

describe('retry bookkeeping on the reason column', () => {
  it('round-trips attempts and exhaustion', async () => {
    const { formatFailureReason, parseFailureReason, RETRY_MAX_ATTEMPTS } = await import(
      '@/lib/coachhelm/v3/engine/analysis-outcome'
    );
    expect(formatFailureReason('engine_timeout', 1)).toBe('engine_timeout');
    expect(formatFailureReason('engine_timeout', 2)).toBe('engine_timeout:r2');
    expect(formatFailureReason('engine_timeout', 3, true)).toBe('engine_timeout:exhausted');
    expect(parseFailureReason('engine_timeout')).toEqual({ code: 'engine_timeout', attempt: 1, exhausted: false });
    expect(parseFailureReason('engine_timeout:r3')).toEqual({ code: 'engine_timeout', attempt: 3, exhausted: false });
    expect(parseFailureReason('engine_timeout:exhausted')).toEqual({ code: 'engine_timeout', attempt: 1, exhausted: true });
    expect(parseFailureReason(null)).toBeNull();
    expect(parseFailureReason('something odd 123')).toEqual({ code: 'something odd 123', attempt: 1, exhausted: false });
    expect(RETRY_MAX_ATTEMPTS).toBeGreaterThanOrEqual(2);
  });

  it('a covered round is analyzed and keeps its marker', () => {
    const state = terminalStateFor(
      { kind: 'succeeded', code: 'engine_covered_by_later_run', message: 'covered' },
      NOW,
    );
    expect(state).toEqual({
      coachhelm_analyzed_at: NOW,
      coachhelm_failed_at: null,
      coachhelm_failure_reason: 'engine_covered_by_later_run',
    });
  });
});

describe('attempt-aware terminal state', () => {
  it('counts retryable attempts on the reason and marks the last one exhausted', () => {
    const outcome = classifyThrown(new Error('statement timeout'));
    expect(terminalStateFor(outcome, NOW).coachhelm_failure_reason).toBe('engine_timeout');
    expect(terminalStateFor(outcome, NOW, { attempt: 2 }).coachhelm_failure_reason).toBe('engine_timeout:r2');
    expect(terminalStateFor(outcome, NOW, { attempt: 3 }).coachhelm_failure_reason).toBe('engine_timeout:exhausted');
  });

  it('a permanent failure never counts attempts', () => {
    expect(terminalStateFor(classifyThrown(new RangeError('bad')), NOW, { attempt: 2 }).coachhelm_failure_reason).toBe(
      'engine_error',
    );
  });
});

import { describe, it, expect } from 'vitest';
import { classifyDashboardFailure } from '../dashboard-error-classifier';

/**
 * getPlayerCoachHelmDashboardImpl's outer catch used to collapse every
 * failure into the same generic error with no errorCode, so the page could
 * never distinguish a transient DB hiccup (worth retrying) from a genuine
 * bug. This suite locks in the classification contract that
 * insights.ts and coachhelm/page.tsx both depend on.
 */
describe('classifyDashboardFailure', () => {
  it('classifies a Postgres deadlock (40P01) as TRANSIENT_FAILURE', () => {
    const error = { code: '40P01', message: 'deadlock detected' };
    expect(classifyDashboardFailure(error)).toBe('TRANSIENT_FAILURE');
  });

  it('classifies a statement timeout (57014) as TRANSIENT_FAILURE', () => {
    const error = { code: '57014', message: 'canceling statement due to statement timeout' };
    expect(classifyDashboardFailure(error)).toBe('TRANSIENT_FAILURE');
  });

  it('classifies a connection failure (08006) as TRANSIENT_FAILURE', () => {
    const error = { code: '08006', message: 'connection to server was lost' };
    expect(classifyDashboardFailure(error)).toBe('TRANSIENT_FAILURE');
  });

  it('falls back to message matching when .code was dropped (ShotPatternMiner.savePatterns re-throw)', () => {
    // ShotPatternMiner.savePatterns throws `new Error('Failed to save
    // CoachHelm shot patterns: ' + error.message)` — the pg SQLSTATE code is
    // lost, but Postgres's own message text survives.
    const error = new Error('Failed to save CoachHelm shot patterns: deadlock detected');
    expect(classifyDashboardFailure(error)).toBe('TRANSIENT_FAILURE');
  });

  it('matches message text case-insensitively', () => {
    const error = new Error('Connection Reset by peer');
    expect(classifyDashboardFailure(error)).toBe('TRANSIENT_FAILURE');
  });

  it('classifies a unique-constraint violation as UNKNOWN (not retryable)', () => {
    const error = { code: '23505', message: 'duplicate key value violates unique constraint' };
    expect(classifyDashboardFailure(error)).toBe('UNKNOWN');
  });

  it('classifies a plain application error as UNKNOWN', () => {
    const error = new Error('Player not found in golf_players');
    expect(classifyDashboardFailure(error)).toBe('UNKNOWN');
  });

  it('classifies a non-Error thrown value as UNKNOWN', () => {
    expect(classifyDashboardFailure('some string failure')).toBe('UNKNOWN');
    expect(classifyDashboardFailure(null)).toBe('UNKNOWN');
    expect(classifyDashboardFailure(undefined)).toBe('UNKNOWN');
  });

  it('does not false-positive on an unrelated error with "connection"/"timeout" as substrings of a longer word', () => {
    // The fallback matches whole phrases ("connection terminated", "timeout
    // exceeded", ...), not bare "connection"/"timeout" — so an unrelated
    // message that merely contains those words as part of a larger token
    // (a feature-flag name, here) must NOT be misclassified as retryable.
    const error = new Error('Feature flag "connection_timeout_ui" not found');
    expect(classifyDashboardFailure(error)).toBe('UNKNOWN');
  });
});

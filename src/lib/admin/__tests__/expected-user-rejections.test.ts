import { describe, it, expect } from 'vitest';
import { classifySoftFailure, isUserInputRejection } from '../observe-action-result';

/**
 * Messages that are the platform telling a user something, not the platform
 * breaking.
 *
 * Each string below was filed as an error-severity DEFECT in a real 24h
 * incident export (2026-08-05) while being the correct response to what the
 * person did. A queue full of those teaches you to stop reading it, which is
 * how the genuine failures sitting beside them get missed.
 *
 * The headline case: a Shenandoah player already on the Women's roster opened
 * the MEN'S invite link. Refusing her is the one-team-per-player rule doing its
 * job — it should not page anyone.
 */

const EXPECTED_REJECTIONS = [
  "You are already on Shenandoah University Women's Golf. Golf players can only be on one team at a time.",
  'You are already a member of this team',
  'End time must be after the start time',
  'Password must contain at least one special character (!@#$%^&*...)',
  'Invalid join code',
  'Please complete your player profile before joining a team',
  // Pre-existing entries — kept so a future edit to the list cannot quietly
  // drop them while adding the new ones.
  'Invalid email or password',
  'An account with this email already exists. Please sign in instead.',
];

/** Things that ARE defects and must keep their error severity. */
const REAL_FAILURES = [
  'Failed to create team. Please try again.',
  '[addSecondTeam] Team creation failed: code=42501 msg=new row violates row-level security policy',
  'Failed to join team. Please try again.',
  'Could not set up your coach profile. Please try again.',
];

describe('expected user-input rejections are not incidents', () => {
  it.each(EXPECTED_REJECTIONS)('classifies as user input, not a defect: %s', (message) => {
    expect(isUserInputRejection(message)).toBe(true);
  });

  it.each(EXPECTED_REJECTIONS)('never reaches error severity or Sentry: %s', (message) => {
    const { severity, skipSentry } = classifySoftFailure(message, null);
    expect(severity).not.toBe('error');
    expect(skipSentry).toBe(true);
  });

  it.each(REAL_FAILURES)('still reports a genuine failure as an error: %s', (message) => {
    const { severity, skipSentry } = classifySoftFailure(message, null);
    expect(severity).toBe('error');
    expect(skipSentry).toBe(false);
  });

  it('does not swallow a team-creation failure just because it mentions a team', () => {
    // The nearest miss: the new "already on ... team" pattern must not widen
    // far enough to catch the RLS failure that broke team creation for a week.
    expect(isUserInputRejection('Failed to create team. Please try again.')).toBe(false);
  });
});

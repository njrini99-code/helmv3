import { describe, expect, it } from 'vitest';
import { friendlyReason, isRawBrowserFailure } from '../lib/friendly-reason';

/** Audit A-06: a browser's own network wording is never shown as the reason; the caller's hint is. */
describe('friendlyReason · browser network wording', () => {
  it.each([
    'Load failed',
    'TypeError: Load failed',
    'Failed to fetch',
    'NetworkError when attempting to fetch resource.',
    'The network connection was lost.',
    'The Internet connection appears to be offline.',
    'Could not connect to the server.',
    'The request timed out.',
    'The operation was aborted.',
    'AbortError: signal is aborted without reason',
    'signal timed out',
    'The operation timed out.',
    'The user aborted a request.',
  ])('%s gives no reason, so the hint is shown', (raw) => {
    expect(isRawBrowserFailure(raw)).toBe(true);
    expect(friendlyReason(raw)).toBeNull();
  });

  it('app wording that mentions a timeout or a failure still passes through', () => {
    expect(isRawBrowserFailure('That tee time was already taken')).toBe(false);
    expect(friendlyReason('That tee time was already taken')).toBe('That tee time was already taken.');
    expect(friendlyReason('The upload took too long and timed out at the club')).toBe('The upload took too long and timed out at the club.');
    expect(friendlyReason('Not authenticated')).toMatch(/Sign in again/);
  });
});

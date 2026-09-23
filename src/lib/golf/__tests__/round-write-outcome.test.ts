import { describe, expect, it } from 'vitest';
import { isUnreadableWriteFailure } from '../round-write-outcome';

describe('isUnreadableWriteFailure', () => {
  it('treats a killed/aborted transport as an unknown outcome (the write may have landed)', () => {
    // iOS Safari on phone lock / app switch (prod error_logs 2026-09-15,
    // "auto-save initial attempt").
    expect(isUnreadableWriteFailure(new TypeError('Load failed'))).toBe(true);
    // Chrome.
    expect(isUnreadableWriteFailure(new TypeError('Failed to fetch'))).toBe(true);
    // Page freeze.
    const abort = new Error('The operation was aborted.');
    abort.name = 'AbortError';
    expect(isUnreadableWriteFailure(abort)).toBe(true);
    // Next's deployment-transition wording.
    expect(isUnreadableWriteFailure(new Error('An unexpected response was received from the server.'))).toBe(true);
  });

  it('treats a server-thrown action error (Next digest) as a known rollback — nothing landed', () => {
    const serverError = Object.assign(new Error('Server action failed'), { digest: '1234567890' });
    expect(isUnreadableWriteFailure(serverError)).toBe(false);
  });

  it('does not widen the B2 self-heal for an unrecognised throw (would forgive a genuine conflict)', () => {
    expect(isUnreadableWriteFailure(new Error('Auto-save could not re-create the round'))).toBe(false);
    expect(isUnreadableWriteFailure('boom')).toBe(false);
    expect(isUnreadableWriteFailure(undefined)).toBe(false);
  });
});

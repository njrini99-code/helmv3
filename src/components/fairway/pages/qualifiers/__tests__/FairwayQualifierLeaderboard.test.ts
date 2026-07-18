/**
 * Regression test for `deriveCommittedSelections`
 * (FairwayQualifierLeaderboard.tsx) — audit finding W1 "qual-contradict":
 * a completed qualifier showed "Not selected" for every entrant, including
 * the top-4 who were clearly selected.
 *
 * Root cause: the `golf_qualifier_selections` fetch's `error` was never
 * checked — `sels ?? []` silently turned a FAILED read into an
 * empty-but-truthy Set, so every entrant's badge fell to "Not selected"
 * instead of the honest "we don't know yet" fallback.
 */
import { describe, it, expect } from 'vitest';
import { deriveCommittedSelections } from '../FairwayQualifierLeaderboard';

describe('deriveCommittedSelections', () => {
  it('returns the confirmed Set when selection is finalized and the read succeeds', () => {
    const result = deriveCommittedSelections('selected', {
      data: [{ player_id: 'p1' }, { player_id: 'p2' }],
      error: null,
    });

    expect(result).not.toBeNull();
    expect(result?.has('p1')).toBe(true);
    expect(result?.has('p3')).toBe(false);
  });

  it('never treats a FAILED fetch as "confirmed zero selections"', () => {
    // Regression: this used to render every entrant — including a genuine
    // top-4 — as "Not selected" instead of falling back to the merit tier.
    const result = deriveCommittedSelections('selected', {
      data: null,
      error: { message: 'network down' },
    });

    expect(result).toBeNull();
  });

  it('returns null while selection is still open/closed (not finalized)', () => {
    const result = deriveCommittedSelections('closed', { data: [], error: null });
    expect(result).toBeNull();
  });

  it('returns an empty (but honest) Set only on a genuinely successful zero-row read', () => {
    const result = deriveCommittedSelections('selected', { data: [], error: null });
    expect(result).not.toBeNull();
    expect(result?.size).toBe(0);
  });
});

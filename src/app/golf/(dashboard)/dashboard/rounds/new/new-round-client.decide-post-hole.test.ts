/**
 * Unit tests for decidePostHoleCompleteAction — the post-save navigation
 * decision in new-round-client.tsx's handleHoleComplete.
 *
 * CONFIRMED P1 (production-readiness mission, 2026-07-09): new-round-client
 * was missing the `allHolesScored` refresh check inside its `isReEdit`
 * branch that continue-round-client.tsx already has — a post-completion
 * score correction on a non-final hole that happened to complete the round
 * silently returned to the active frontier instead of surfacing the finish
 * confirmation, leaving a stale scorecard with no path to submit. These
 * tests lock in parity with continue-round-client.tsx's behavior.
 *
 * No time, no I/O, no rendering — pure function only.
 */

import { describe, it, expect } from 'vitest';
import { decidePostHoleCompleteAction } from './new-round-client';

describe('decidePostHoleCompleteAction — re-edit path (the P1 fix)', () => {
  it('re-editing a non-final hole that completes the round shows the finish confirmation (not a silent return-to-frontier)', () => {
    const out = decidePostHoleCompleteAction({
      allHolesScored: true,
      isReEdit: true,
      holeIndex: 4, // hole 5 of 18 — NOT the final hole index
      totalHoles: 18,
    });
    expect(out).toEqual({ type: 'finish' });
  });

  it('re-editing a hole that does NOT complete the round returns to the active frontier', () => {
    const out = decidePostHoleCompleteAction({
      allHolesScored: false,
      isReEdit: true,
      holeIndex: 4,
      totalHoles: 18,
    });
    expect(out).toEqual({ type: 'return-to-frontier' });
  });

  it('re-editing the final hole and completing the round shows the finish confirmation', () => {
    const out = decidePostHoleCompleteAction({
      allHolesScored: true,
      isReEdit: true,
      holeIndex: 17,
      totalHoles: 18,
    });
    expect(out).toEqual({ type: 'finish' });
  });
});

describe('decidePostHoleCompleteAction — normal (non-re-edit) progression, unchanged', () => {
  it('advances to the next hole when more holes remain', () => {
    const out = decidePostHoleCompleteAction({
      allHolesScored: false,
      isReEdit: false,
      holeIndex: 4,
      totalHoles: 18,
    });
    expect(out).toEqual({ type: 'advance', nextHoleIndex: 5 });
  });

  it('shows the finish confirmation when completing the final hole for the first time', () => {
    const out = decidePostHoleCompleteAction({
      allHolesScored: true,
      isReEdit: false,
      holeIndex: 17,
      totalHoles: 18,
    });
    expect(out).toEqual({ type: 'finish' });
  });

  it('shows the finish confirmation for the last hole even if a scoring gap elsewhere means allHolesScored is false', () => {
    // Matches the pre-existing top-level fallback branch: reaching the last
    // hole index with nowhere left to advance always surfaces the confirm
    // step, regardless of allHolesScored (unchanged behavior).
    const out = decidePostHoleCompleteAction({
      allHolesScored: false,
      isReEdit: false,
      holeIndex: 17,
      totalHoles: 18,
    });
    expect(out).toEqual({ type: 'finish' });
  });
});

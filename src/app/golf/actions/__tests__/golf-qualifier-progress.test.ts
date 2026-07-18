/**
 * Regression test for `derivePlayerQualifierProgress` (golf.ts) — audit
 * finding W1 "qual-contradict": a qualifier card could show "Completed" +
 * a real posted TOTAL/TO PAR + THRU reading "Not started", all for the same
 * entry, because `completedRoundNumbers` was derived independently from
 * `roundsCompleted`/`totalScore`/`totalToPar`:
 *   - it dropped any completed round whose (nullable) `qualifier_round_number`
 *     was null, even though that round still counted toward the total, and
 *   - it stayed `[]` on the entries-only fallback path (no matching
 *     `golf_rounds` rows at all), even when the entry's aggregate columns
 *     had a real score.
 *
 * The fix makes `completedRoundNumbers.length` always equal `roundsCompleted`
 * so THRU can never contradict the scored totals or the "Completed" badge.
 */
import { describe, it, expect, vi } from 'vitest';

// golf.ts is a 'use server' action file — importing it pulls in its full
// module graph. Mirror the minimal mock set from
// golf-save-partial-round.test.ts so the import doesn't touch a real
// Supabase client / Next.js server runtime.
vi.mock('@/lib/supabase/server', () => ({
  createClient: vi.fn(async () => ({})),
}));

vi.mock('@/lib/supabase/admin', () => ({
  createAdminClient: vi.fn(() => ({})),
}));

vi.mock('next/server', () => ({
  after: vi.fn((cb: () => Promise<void> | void) => cb()),
}));

vi.mock('next/cache', () => ({
  revalidatePath: vi.fn(),
  updateTag: vi.fn(),
}));

vi.mock('@/lib/server-error-logger', () => ({
  logServerError: vi.fn(async () => {}),
  logServerException: vi.fn(async () => {}),
}));

vi.mock('@/lib/coachhelm/v2/post-round-trigger', () => ({
  postRoundTrigger: vi.fn(async () => {}),
}));

vi.mock('@/lib/cache/golf-stats-calculator', () => ({
  invalidateOnRoundComplete: vi.fn(async () => {}),
}));

vi.mock('@/lib/admin-logger', () => ({
  logRoundSubmitted: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications', () => ({
  notifyQualifierCreated: vi.fn(async () => {}),
}));

vi.mock('@/lib/notifications/email', () => ({
  sendEmailNotification: vi.fn(async () => ({ success: true })),
}));

vi.mock('@/lib/notifications/push', () => ({
  sendBulkPushNotification: vi.fn(async () => {}),
}));

import { derivePlayerQualifierProgress } from '../qualifier-progress';

describe('derivePlayerQualifierProgress', () => {
  it('reports full progress when every round has a real qualifier_round_number', () => {
    const result = derivePlayerQualifierProgress(
      [
        { qualifier_round_number: 1, total_score: 72, score_to_par: 0 },
        { qualifier_round_number: 2, total_score: 70, score_to_par: -2 },
      ],
      { roundsCompleted: null, totalScore: null, totalToPar: null },
    );

    expect(result.roundsCompleted).toBe(2);
    expect(result.completedRoundNumbers).toEqual([1, 2]);
    expect(result.totalScore).toBe(142);
    expect(result.totalToPar).toBe(-2);
  });

  it('never shows THRU "Not started" when a completed round has a null qualifier_round_number', () => {
    // Regression: a round missing its round-number column used to be dropped
    // from `completedRoundNumbers` entirely (falling to `[]` → "Not started")
    // while still counting toward `roundsCompleted`/`totalScore`.
    const result = derivePlayerQualifierProgress(
      [{ qualifier_round_number: null, total_score: 70, score_to_par: -2 }],
      { roundsCompleted: null, totalScore: null, totalToPar: null },
    );

    expect(result.roundsCompleted).toBe(1);
    expect(result.completedRoundNumbers).toHaveLength(1);
    expect(result.completedRoundNumbers).not.toEqual([]);
    expect(result.totalScore).toBe(70);
    expect(result.totalToPar).toBe(-2);
  });

  it('never shows THRU "Not started" on the entries-only fallback path (no golf_rounds rows)', () => {
    // Regression: this is the exact "Completed + Not started + TOTAL 70 /
    // TO PAR -2 on the same card" contradiction from the audit — a
    // golf_qualifier_entries row with a real aggregate score, but zero
    // matching golf_rounds rows.
    const result = derivePlayerQualifierProgress([], {
      roundsCompleted: 4,
      totalScore: 70,
      totalToPar: -2,
    });

    expect(result.roundsCompleted).toBe(4);
    expect(result.completedRoundNumbers).toEqual([1, 2, 3, 4]);
    expect(result.totalScore).toBe(70);
    expect(result.totalToPar).toBe(-2);
  });

  it('stays honestly "not started" when there is truly no progress', () => {
    const result = derivePlayerQualifierProgress([], {
      roundsCompleted: 0,
      totalScore: null,
      totalToPar: null,
    });

    expect(result.roundsCompleted).toBe(0);
    expect(result.completedRoundNumbers).toEqual([]);
    expect(result.totalScore).toBeNull();
    expect(result.totalToPar).toBeNull();
  });
});

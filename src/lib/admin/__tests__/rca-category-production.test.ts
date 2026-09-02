/**
 * The category vocabulary, checked against what production actually contains.
 *
 * WHY REAL STRINGS. `rca-category.ts` already has unit tests for its four
 * canonical prefixes. Those prove the mapping is self-consistent; they cannot
 * prove it matches reality, because every fixture in them was written by the
 * same person who wrote the matcher. The openings below were read out of
 * production on 2026-08-30:
 *
 *     select left(metadata->>'suggestedFix', 70), count(*)
 *     from admin_events where event_type = 'rca_analysis' group by 1;
 *
 * They are quoted verbatim, including the em-dash/double-hyphen split and the
 * curly apostrophe, because those decorations are exactly what a matcher gets
 * wrong.
 */
import { describe, it, expect } from 'vitest';
import { deriveRcaCategory } from '@/lib/admin/rca-category';

/** Verbatim production openings, 2026-08-30. */
const PRODUCTION = [
  ['NOT A DEFECT -- expected, already-mitigated client network noise. src/', 'not-a-defect'],
  ['NOT A DEFECT — the safety guardrail worked as intended and the caller ', 'not-a-defect'],
  ['NEEDS MORE EVIDENCE -- commit bdc09c915 (deployed 2026-08-28 01:36 UTC', 'needs-more-evidence'],
  ['ALREADY FIXED -- commit c83cecc21 (PR #1634, committed 2026-08-27 15:5', 'already-fixed'],
  ['FIX HERE (shared with bf7c2b2a, 1e3e8fb4) -- same reproduction steps a', 'fix-here'],
  ['FIX HERE (shared with bf7c2b2a) — reproduce by client-side navigating ', 'fix-here'],
  // Legacy free prose that IS unambiguous on its own words.
  ['Already fixed. Commit 3b4204e is confirmed (git merge-base --is-ancest', 'already-fixed'],
  ['Already applied. memory/ledgers/deployments.md records that at 2026-08', 'already-fixed'],
] as const;

/**
 * Openings that are genuinely ambiguous between ALREADY FIXED and NOT A
 * DEFECT. They MUST stay uncategorized: the two categories carry different
 * resolve evidence (a commit SHA versus a named control flow), so picking
 * whichever is convenient would be the `unknown -> healthy` move the
 * engineering OS forbids.
 */
const MUST_STAY_UNCATEGORIZED = [
  'No fix needed for individual occurrences. The code’s own reasoning (er',
  'No code change needed. If the coach wants this player to submit anothe',
  'No fix needed - single occurrence, known noise class, no evidence of a',
  'No fix needed; already classified as transient network noise. If faile',
  'No urgent fix needed - the design already treats this as self-healing ',
] as const;

describe('category derivation against real production analyses', () => {
  it.each(PRODUCTION)('%s -> %s', (opening, expected) => {
    expect(deriveRcaCategory(opening)).toBe(expected);
  });

  it.each(MUST_STAY_UNCATEGORIZED)('stays uncategorized rather than guessing: %s', (opening) => {
    expect(deriveRcaCategory(opening)).toBe('uncategorized');
  });

  it('an actionable finding written WITHOUT the contract prefix is uncategorized, visibly', () => {
    // This is the most consequential row in production: a concrete, actionable
    // instruction naming a file and a line. It does not open with FIX HERE, so
    // it derives to `uncategorized` — and that is CORRECT behaviour for the
    // matcher. Guessing "this looks actionable, call it fix-here" is precisely
    // the drift this module was written to stop.
    //
    // The finding being uncategorized is a routine-prompt problem, not a
    // mapping problem, and the fix belongs there. Recorded here so a future
    // reader does not "fix" the matcher instead.
    const opening = 'Add `code: "qualifier_closed"` to the return at golf.ts:1770, mirrorin';
    expect(deriveRcaCategory(opening)).toBe('uncategorized');
  });

  it('every production opening lands in a DECLARED category — none disappear', () => {
    // The failure mode that actually loses data is a value that maps to
    // nothing. Two thirds of production was once invisible to the repair half
    // because it filtered `suggestedFix ilike 'FIX HERE%'` in SQL.
    const all = [...PRODUCTION.map(([o]) => o), ...MUST_STAY_UNCATEGORIZED];
    for (const opening of all) {
      const c = deriveRcaCategory(opening);
      expect(c, opening).toBeTruthy();
      expect(
        ['fix-here', 'already-fixed', 'not-a-defect', 'needs-more-evidence', 'uncategorized'],
        opening,
      ).toContain(c);
    }
  });
});

/**
 * The category vocabulary is the only thing joining the two halves of the
 * self-healing loop, and until 2026-08-27 it lived exclusively in two routine
 * prompts stored outside this repository — so nothing here could fail when
 * they disagreed. These cases are the contract.
 *
 * Every string under "production analyses" is a REAL `suggestedFix` opening
 * read out of `admin_events` on 2026-08-27, not an invented example. That
 * matters: the previous version of this handoff was a SQL `ilike 'FIX HERE%'`
 * calibrated against the vocabulary its author imagined the writer would use,
 * and it silently matched 5 of 15 rows.
 */
import { describe, it, expect } from 'vitest';
import {
  deriveRcaCategory,
  isRepairCandidate,
  isAutoResolvable,
  RCA_CATEGORIES,
  RCA_CANONICAL_PREFIX,
  RCA_CATEGORY_LABEL,
} from '@/lib/admin/rca-category';

describe('deriveRcaCategory — the four canonical prefixes', () => {
  it('routes each canonical prefix to its own category', () => {
    for (const [category, prefix] of Object.entries(RCA_CANONICAL_PREFIX)) {
      expect(deriveRcaCategory(`${prefix} — some detail follows.`)).toBe(category);
    }
  });

  it('accepts the prefix on its own, with no trailing detail', () => {
    expect(deriveRcaCategory('FIX HERE')).toBe('fix-here');
  });

  it('is case-insensitive — a model writing "Fix here" still routes', () => {
    expect(deriveRcaCategory('Fix here — golf.ts:1770 returns no code.')).toBe('fix-here');
    expect(deriveRcaCategory('not a defect: expected control flow.')).toBe('not-a-defect');
  });

  it('tolerates markdown emphasis and leading whitespace', () => {
    expect(deriveRcaCategory('  **FIX HERE** — see below')).toBe('fix-here');
    expect(deriveRcaCategory('- NEEDS MORE EVIDENCE: no stack trace was captured.')).toBe(
      'needs-more-evidence',
    );
  });

  it('does NOT match a prefix that merely appears later in the sentence', () => {
    // "we could FIX HERE if we wanted" is a passing mention, not a verdict.
    expect(deriveRcaCategory('The caller retries, so we could FIX HERE if we wanted.')).toBe(
      'uncategorized',
    );
  });
});

describe('deriveRcaCategory — production analyses written before the vocabulary existed', () => {
  it('recognises an explicit already-fixed claim', () => {
    // Three real rows opened this way, each naming a commit.
    expect(
      deriveRcaCategory(
        'Already fixed. Commit 3b4204e is confirmed (git merge-base --is-ancestor) an ancestor of the SHA currently serving production.',
      ),
    ).toBe('already-fixed');
    expect(
      deriveRcaCategory(
        'Already applied. memory/ledgers/deployments.md records that at 2026-08-23 21:05 local the promote landed.',
      ),
    ).toBe('already-fixed');
  });

  it('leaves the "No fix needed" family UNCATEGORIZED rather than guessing', () => {
    // Five real rows. Each is ambiguous between ALREADY FIXED (a commit
    // shipped) and NOT A DEFECT (expected behaviour) — and those two carry
    // different resolve evidence, so collapsing them would be `unknown →
    // healthy`. The Bridge shows them; no automatic path acts on them.
    const ambiguous = [
      'No fix needed; already classified as transient network noise.',
      'No code change needed. If the coach wants this player to submit another round, raise golf_qualifiers.num_rounds.',
      'No fix needed for individual occurrences. The code’s own reasoning (error-logging.ts) is that one dropped request is expected.',
      'No fix needed - single occurrence, known noise class, no evidence of a spike.',
      'No urgent fix needed - the design already treats this as self-healing and throttles duplicate writes.',
    ];
    for (const fix of ambiguous) {
      expect(deriveRcaCategory(fix)).toBe('uncategorized');
    }
  });

  it('leaves a bare imperative UNCATEGORIZED — it is actionable, but it is not a claim about category', () => {
    // The single most actionable finding on the board on 2026-08-27, and the
    // one the old `ilike 'FIX HERE%'` filter could never see. It reaches the
    // repair routine through isRepairCandidate('uncategorized'), not through
    // a lookup entry invented for this one sentence.
    const real =
      'Add `code: "qualifier_closed"` to the return at golf.ts:1770, mirroring the fix already applied at golf.ts:708.';
    expect(deriveRcaCategory(real)).toBe('uncategorized');
    expect(isRepairCandidate(deriveRcaCategory(real))).toBe(true);
  });
});

describe('deriveRcaCategory — degenerate input', () => {
  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['whitespace only', '   \n\t '],
    ['punctuation only', '***'],
  ])('returns uncategorized for %s rather than throwing', (_label, input) => {
    expect(deriveRcaCategory(input as string | null | undefined)).toBe('uncategorized');
  });
});

describe('routing predicates', () => {
  it('sends fix-here and uncategorized to the repair half, and nothing else', () => {
    const repairable = RCA_CATEGORIES.filter(isRepairCandidate);
    expect(repairable).toEqual(['fix-here', 'uncategorized']);
  });

  it('allows only the two evidence-bearing categories to close an incident', () => {
    const closable = RCA_CATEGORIES.filter(isAutoResolvable);
    expect(closable).toEqual(['already-fixed', 'not-a-defect']);
  });

  it('never lets uncategorized close an incident — that is resolving on text nobody could classify', () => {
    expect(isAutoResolvable('uncategorized')).toBe(false);
  });

  it('gives every category a label, so the Bridge can never render a bare slug', () => {
    for (const category of RCA_CATEGORIES) {
      expect(RCA_CATEGORY_LABEL[category]).toBeTruthy();
    }
  });
});

/**
 * The same student signs up twice — once with a personal address, once with
 * the school one — and appears twice on their coach's roster with their data
 * split across the two rows (#1477).
 *
 * Measured against production 2026-08-18. Every duplicate pair has a DIFFERENT
 * `user_id` and a personal-vs-institutional email:
 *
 *     Hunter Swidzinski   hunterswidz@gmail.com     / hs8639@uncw.edu
 *     Duncan Wheeler      duncanwheeler00@gmail.com / dwheeler@hsc.edu
 *     Larsen Gallimore    larsengallimore@gmail.com / lgallimore@guilford.edu
 *
 * Two things follow, and both matter for what the fix can be.
 *
 * FIRST, a `user_id` uniqueness guard — the fix #1477 proposes — would have
 * prevented NONE of these. Each signup is a genuinely distinct auth identity.
 *
 * SECOND, the Duncan Wheeler pair is not the "unguarded double-submit" the
 * issue reads it as. The rows are 95 seconds apart (18:50:05 -> 18:51:40) with
 * two different addresses: that is a person registering, realising they used
 * the wrong email, and registering again — not one submit fired twice.
 *
 * So the create path cannot reject this, and it should not: two people may
 * legitimately share a name, and blocking a signup on that would lock a real
 * student out of their team. What the system CAN do is stop the coach finding
 * out by accident. Hunter's rounds attach to one row, so the other reads as a
 * player who has never played, and any per-player surface resolves to whichever
 * id it happens to pick.
 *
 * Detection is within-team by construction, which also excludes the deliberate
 * `Demo University Golf` / `Demo University Golf (Pat)` clone pairs — those are
 * the buyer demo and must never be flagged.
 *
 * Precision today: one group across every team in production, and it is a real
 * duplicate.
 */
import { describe, it, expect } from 'vitest';
import { findSuspectedDuplicateMembers } from '@/lib/golf/duplicate-roster-members';

function member(
  id: string,
  first: string,
  last: string,
  over: { email?: string | null; status?: string | null } = {},
) {
  return {
    id,
    first_name: first,
    last_name: last,
    email: over.email ?? `${id}@example.edu`,
    status: over.status ?? 'active',
  };
}

describe('findSuspectedDuplicateMembers', () => {
  it('flags the same name appearing twice on one roster — the Hunter case', () => {
    const found = findSuspectedDuplicateMembers([
      member('a', 'Hunter', 'Swidzinski', { email: 'hunterswidz@gmail.com' }),
      member('b', 'Hunter', 'Swidzinski', { email: 'hs8639@uncw.edu' }),
      member('c', 'Connor', 'Lynde'),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]!.memberIds).toEqual(['a', 'b']);
    expect(found[0]!.name).toBe('Hunter Swidzinski');
  });

  it('carries both emails, which is the only thing that tells them apart', () => {
    const found = findSuspectedDuplicateMembers([
      member('a', 'Hunter', 'Swidzinski', { email: 'hunterswidz@gmail.com' }),
      member('b', 'Hunter', 'Swidzinski', { email: 'hs8639@uncw.edu' }),
    ]);

    expect(found[0]!.emails).toEqual(['hunterswidz@gmail.com', 'hs8639@uncw.edu']);
  });

  it('ignores case and stray whitespace in the name', () => {
    const found = findSuspectedDuplicateMembers([
      member('a', 'hunter', 'swidzinski'),
      member('b', 'Hunter ', ' Swidzinski'),
    ]);

    expect(found).toHaveLength(1);
  });

  it('does not flag a roster with no repeats', () => {
    expect(
      findSuspectedDuplicateMembers([
        member('a', 'Connor', 'Lynde'),
        member('b', 'Luke', 'Wise'),
      ]),
    ).toEqual([]);
  });

  it('only counts ACTIVE members — a removed row is not a live duplicate', () => {
    const found = findSuspectedDuplicateMembers([
      member('a', 'Hunter', 'Swidzinski'),
      member('b', 'Hunter', 'Swidzinski', { status: 'inactive' }),
    ]);

    expect(found).toEqual([]);
  });

  it('never flags the same member id twice', () => {
    // Defensive: a join that fans out must not manufacture a duplicate.
    const dup = member('a', 'Hunter', 'Swidzinski');
    expect(findSuspectedDuplicateMembers([dup, { ...dup }])).toEqual([]);
  });

  it('skips rows with no usable name rather than grouping them together', () => {
    // Two nameless rows are not "the same player"; grouping them would invent
    // a duplicate out of missing data.
    const found = findSuspectedDuplicateMembers([
      member('a', '', ''),
      member('b', '', ''),
      { id: 'c', first_name: null, last_name: null, email: null, status: 'active' },
    ]);

    expect(found).toEqual([]);
  });

  it('reports three-way collisions as one group, not two pairs', () => {
    const found = findSuspectedDuplicateMembers([
      member('a', 'Hunter', 'Swidzinski'),
      member('b', 'Hunter', 'Swidzinski'),
      member('c', 'Hunter', 'Swidzinski'),
    ]);

    expect(found).toHaveLength(1);
    expect(found[0]!.memberIds).toHaveLength(3);
  });
});

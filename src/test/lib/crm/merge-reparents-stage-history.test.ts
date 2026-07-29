/**
 * mergeCoaches() must re-point EVERY child table keyed by coach_id.
 *
 * THE BUG THIS PINS. `crm_stage_transitions` was absent from
 * COACH_CHILD_TABLES, so merging a duplicate left its pipeline history pointing
 * at the merged coach — who is then soft-archived and therefore invisible. The
 * surviving record showed a stage timeline with a hole in it, and nothing
 * errored. Measured when fixed: 2,401 transitions exist in production and 83 sit
 * on archived coaches.
 *
 * WHY THIS TEST IS STRUCTURAL RATHER THAN BEHAVIOURAL. `crm-dedup.ts` is a
 * `'use server'` module, and Next only permits async exports from one — so
 * COACH_CHILD_TABLES cannot be exported for a normal unit test to import
 * without either making it a needless async function or moving it to a second
 * file purely to satisfy a test. (That constraint is not hypothetical: it broke
 * an earlier attempt to export a pure helper from an actions file in this
 * repo.) Asserting against the source text is the honest trade — it verifies the
 * list, and it is explicit that it verifies the LIST and not the loop.
 *
 * What it therefore does NOT prove: that the re-pointing loop actually runs
 * against each table. It proves the table is enrolled. The loop itself is four
 * lines and shared across every entry, so enrollment is the part that regresses.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const SOURCE = readFileSync(
  join(process.cwd(), 'src/app/golf/actions/crm-dedup.ts'),
  'utf8',
);

/** The declaration block, isolated so prose elsewhere cannot satisfy the test. */
function coachChildTablesBlock(): string {
  const start = SOURCE.indexOf('const COACH_CHILD_TABLES');
  expect(start, 'COACH_CHILD_TABLES declaration not found').toBeGreaterThan(-1);
  const end = SOURCE.indexOf('] as const;', start);
  expect(end, 'COACH_CHILD_TABLES terminator not found').toBeGreaterThan(start);
  return SOURCE.slice(start, end);
}

/** Quoted entries only — comments in the block must not count as membership. */
function enrolledTables(): string[] {
  const block = coachChildTablesBlock()
    .split('\n')
    .filter((line) => !line.trim().startsWith('//'))
    .join('\n');
  // `m[1]` is `string | undefined` under strict mode even though a matched
  // capture group is always present; filter rather than assert non-null.
  return [...block.matchAll(/'([a-z_]+)'/g)]
    .map((m) => m[1])
    .filter((name): name is string => typeof name === 'string');
}

describe('mergeCoaches re-parents every coach-keyed child table', () => {
  it('includes crm_stage_transitions — the one that was missing', () => {
    expect(enrolledTables()).toContain('crm_stage_transitions');
  });

  /**
   * Guards against a silent shrink. Anything removed from this list stops being
   * re-pointed on merge and starts orphaning rows, with no error at runtime —
   * exactly how the stage-transitions gap went unnoticed.
   */
  it('still enrolls every table known to be keyed by coach_id', () => {
    const enrolled = enrolledTables();
    for (const table of [
      'crm_contact_log',
      'crm_sequence_enrollments',
      'crm_replies',
      'crm_notes',
      'crm_tasks',
      'crm_stage_transitions',
    ]) {
      expect(enrolled, `${table} must be re-pointed on merge`).toContain(table);
    }
  });

  it('re-points by coach_id and never hard-deletes the merged record', () => {
    // The merge contract: children move, the loser is soft-archived. A DELETE
    // here would destroy the history this whole fix exists to preserve.
    expect(SOURCE).toContain("update({ coach_id: keep_id })");
    expect(SOURCE).toContain('is_archived: true');
    expect(SOURCE).not.toMatch(/\.delete\(\)\s*\n?\s*\.eq\('id', merge_id\)/);
  });

  /** Non-vacuity: the extractor must actually be reading real entries. */
  it('extractor finds a plausible list rather than silently matching nothing', () => {
    const enrolled = enrolledTables();
    expect(enrolled.length).toBeGreaterThanOrEqual(6);
    expect(enrolled.every((t) => t.startsWith('crm_'))).toBe(true);
  });
});

/**
 * QA fixture round ids — seeded data, kept in production by owner decision.
 *
 * `supabase/migrations/20260901120000_integrity_completed_round_zero_scored_holes.sql`
 * (Check 6: `completed_round_zero_scored_holes`) documents four `golf_rounds`
 * rows that reached production through a direct service-role insert, not any
 * application save path — the evidence is in the ids themselves: a patterned
 * sequential uuid, three of the four sharing `created_at` to the microsecond,
 * no `course_id`, and `current_hole=1` while `holes_played=18`. 2026-09-02,
 * owner decision: KEPT, not removed — Check 6 names them out of scope by id
 * rather than paging on known data every morning.
 *
 * This module is the SAME exclusion for the Bridge's incident feed: an
 * incident whose evidence traces back to one of these rounds is a fixture,
 * not a production defect, and must say so rather than reading as one more
 * unattributed failure. The ids are a literal copy of the migration's array
 * because nothing in this runtime path can read a `.sql` file — see
 * `qa-fixture-rounds.test.ts`, which reads the migration itself and asserts
 * this constant still matches it, so the two cannot drift silently.
 */
export const QA_FIXTURE_ROUND_IDS: readonly string[] = [
  '0b000000-0000-4000-b000-000000000001',
  '0b000000-0000-4000-b000-000000000002',
  '0b000000-0000-4000-b000-000000000003',
  '0b000000-0000-4000-b000-000000000004',
];

const QA_FIXTURE_ROUND_ID_SET: ReadonlySet<string> = new Set(
  QA_FIXTURE_ROUND_IDS.map((id) => id.toLowerCase()),
);

/** `null`/non-fixture input is never a fixture — only an exact id match counts. */
export function isQaFixtureRoundId(roundId: string | null | undefined): boolean {
  if (!roundId) return false;
  return QA_FIXTURE_ROUND_ID_SET.has(roundId.toLowerCase());
}

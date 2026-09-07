/**
 * Par bounds for GolfHelm.
 *
 * There are two different bounds and they are deliberately not the same
 * number. Keeping them apart is the whole point of this file.
 *
 * ENTRY bound (`MIN_PAR`..`MAX_PAR`, 3..5) governs what a par value may be
 * when it is being CREATED — the hole-config step of a new round, the tee
 * editor drawer, and the server-side normalizer both forms funnel into.
 * Real courses do not have par 6 holes; offering one was an entry defect.
 *
 * READ bound (3..6) governs par values already stored in `golf_course_holes`
 * / `golf_course_tee_holes`. It stays wide on purpose. `isTeeComplete` and
 * the round-submission schemas in `src/app/golf/actions/golf.ts` all read
 * stored course data back out, and a round played on a course that recorded
 * a par 6 before this change must still save. Narrowing the read bound would
 * turn an old course into an unsavable round, which is a data-loss shape, not
 * a validation improvement.
 *
 * So: tighten writes, leave reads alone. If the stored par-6 rows are ever
 * confirmed empty or migrated, the read bound can follow — that is a separate,
 * data-dependent decision.
 */

/** Lowest par a new hole may be assigned. */
export const MIN_PAR = 3;

/** Highest par a new hole may be assigned. */
export const MAX_PAR = 5;

/** The par values offered as choices in entry UI, in display order. */
export const PAR_CHOICES: readonly number[] = [3, 4, 5];

/**
 * Widest par a value ALREADY STORED may hold and still be considered valid.
 * Only read paths use this. Never widen entry to match it.
 */
export const MAX_STORED_PAR = 6;

/**
 * Par choices for an editor opened over an existing hole: the entry choices,
 * plus the hole's own current par when that par predates the 3-5 clamp. A
 * legacy par 6 therefore stays visible and selected instead of silently
 * snapping to the first option the moment the editor renders.
 */
export function parChoicesFor(currentPar: number): readonly number[] {
  if (PAR_CHOICES.includes(currentPar)) return PAR_CHOICES;
  if (!Number.isFinite(currentPar)) return PAR_CHOICES;
  return [...PAR_CHOICES, currentPar].sort((a, b) => a - b);
}

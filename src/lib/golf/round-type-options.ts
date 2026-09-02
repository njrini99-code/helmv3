/**
 * The round types a submitted round can be changed to, and the shapes the
 * change action takes.
 *
 * WHY THIS IS ITS OWN MODULE AND NOT PART OF THE ACTION
 * ----------------------------------------------------
 * These used to live in `src/app/golf/actions/round-type.ts`, which carries
 * `'use server'`. A "use server" module may export **only async functions** —
 * every export becomes a callable server-action endpoint — so a plain
 * `export const EDITABLE_ROUND_TYPES = [...]` there is a build error, not a
 * style preference. It went unnoticed because nothing imported the component
 * that used it, so the module was never pulled into a client bundle.
 *
 * The interfaces and the type alias would have been fine to leave behind
 * (types are erased before the check ever runs), but keeping the whole
 * vocabulary in one non-server module is what stops the next person from
 * re-adding a const next to them.
 */

/**
 * Deliberately the three types that exist in production (tournament 240,
 * practice 124, qualifier 14) rather than every string the codebase has ever
 * written. `'casual'` appears in a handful of source literals but in zero rows,
 * and `stats-data.ts` also tolerates a legacy `'qualifying'` spelling on read —
 * neither is offered here, because an edit control is not the place to mint new
 * vocabulary into a free-text column.
 */
export const EDITABLE_ROUND_TYPES = ['practice', 'tournament', 'qualifier'] as const;
export type EditableRoundType = (typeof EDITABLE_ROUND_TYPES)[number];

export interface UpdateRoundTypeInput {
  roundId: string;
  roundType: EditableRoundType;
  /** Required when changing TO 'qualifier'. Ignored otherwise. */
  qualifierId?: string | null;
  /** Which round of the qualifier this is. Defaults to 1. */
  qualifierRoundNumber?: number | null;
}

export interface UpdateRoundTypeResult {
  success: boolean;
  error?: string;
}

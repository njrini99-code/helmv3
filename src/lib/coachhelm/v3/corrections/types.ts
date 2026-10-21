/**
 * CoachHelm corrections (Slice 6a): the five chips a coach can put on a read,
 * the reason chips under "Not this", and the row shape of
 * `golf_coachhelm_corrections` (04-output-specs §1.4, 03 §7.2).
 *
 * The table's migration is HELD (20261020121000), so the row type is written
 * here by hand instead of coming from `src/lib/types/database.ts`. After the
 * owner applies it and runs `npm run db:types`, the generated Row matches this.
 *
 * Pure: no imports with side effects, safe for client and server.
 */

export const CORRECTION_KINDS = [
  'not_this',
  'wrong_cause',
  'already_on_it',
  'snooze',
  'confirm',
] as const;
export type CorrectionKind = (typeof CORRECTION_KINDS)[number];

export const CORRECTION_REASONS = ['wrong', 'not_important', 'already_know'] as const;
export type CorrectionReason = (typeof CORRECTION_REASONS)[number];

export const CORRECTION_AUTHOR_ROLES = ['coach', 'player'] as const;
export type CorrectionAuthorRole = (typeof CORRECTION_AUTHOR_ROLES)[number];

/**
 * Kinds a player may record on their own read. The other three ("Wrong
 * cause", "Already on it", "Show later") change what the coach and the
 * player see, so they are the coach's (03 §7.2). The table enforces the same
 * rule (`golf_coachhelm_corrections_player_kinds`).
 */
export const PLAYER_CORRECTION_KINDS: ReadonlySet<CorrectionKind> = new Set([
  'not_this',
  'confirm',
]);

/** Length caps, mirrored by the table's CHECK constraints. */
export const ALTERNATIVE_CAUSE_MAX = 120;
export const FREE_TEXT_MAX = 500;

export const CORRECTIONS_TABLE = 'golf_coachhelm_corrections';

/** One `golf_coachhelm_corrections` row (04 §1.4, exact columns). */
export interface CorrectionRow {
  id: string;
  insight_id: string;
  player_id: string;
  team_id: string | null;
  author_user_id: string;
  author_role: CorrectionAuthorRole;
  kind: CorrectionKind;
  reason: CorrectionReason | null;
  alternative_cause_label: string | null;
  free_text: string | null;
  checkpoint_round_id: string | null;
  created_at: string;
}

/**
 * True for the "table is not there yet" answers: Postgres 42P01 (undefined
 * table) and PostgREST PGRST205 (table not in the schema cache). The
 * migration is held, so code that reads or writes the table treats these as
 * "corrections not available" rather than as a failure.
 */
export function isMissingTableError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const code = (error as { code?: unknown }).code;
  return code === '42P01' || code === 'PGRST205';
}

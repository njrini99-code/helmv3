/** Every SQL token from the held practice migrations, to a catalog code and its words. `practice-errors.test.ts` reads the migration files, so a new token can't ship unmapped. */
export const PRACTICE_ERRORS: Readonly<Record<string, { code: string; message: string }>> = {
  practice_plan_stale: { code: 'CH-17505', message: 'This plan changed somewhere else. Load the latest.' },
  practice_plan_all_day: { code: 'CH-17110', message: 'Give this practice a start and end time to plan it.' },
  practice_plan_event_cancelled: { code: 'CH-17117', message: 'This practice was cancelled, so its plan can’t be published.' },
  practice_plan_not_practice: { code: 'CH-17001', message: 'A plan needs a practice on the calendar.' },
  practice_plan_empty: { code: 'CH-17116', message: 'Add a block to publish.' },
  practice_plan_not_published: { code: 'CH-17004', message: 'That plan isn’t published.' },
  practice_plan_forbidden: { code: 'CH-17001', message: 'You can’t change this plan.' },
  practice_plan_folder: { code: 'CH-17001', message: 'A folder name is 1 to 60 characters and can’t be Team.' },
  practice_plan_why: { code: 'CH-17001', message: 'That plan couldn’t be saved.' },
  practice_plan_title: { code: 'CH-17001', message: 'Name the plan in 1 to 80 characters.' },
  practice_plan_step: { code: 'CH-17001', message: 'That plan couldn’t be saved.' },
  practice_plan_target: { code: 'CH-17001', message: 'That plan couldn’t be saved.' },
  practice_plan_body_fields: { code: 'CH-17001', message: 'That plan couldn’t be saved.' },
  practice_plan_body_size: { code: 'CH-17109', message: 'That plan is too long to save.' },
  practice_plan_body_version: { code: 'CH-17001', message: 'That plan couldn’t be saved.' },
  practice_plan_block: { code: 'CH-17109', message: 'One of the blocks has a value out of range.' },
  practice_plan_block_group: { code: 'CH-17104', message: 'A block names a group that isn’t in this plan.' },
  practice_plan_groups: { code: 'CH-17109', message: 'A plan can have up to 6 groups.' },
  practice_plan_group_player: { code: 'CH-17001', message: 'A group names a player who isn’t in this plan.' },
  practice_plan_layout: { code: 'CH-17109', message: 'A plan can have up to 40 blocks and 6 hours.' },
  practice_plan_station: { code: 'CH-17109', message: 'A block can have up to 8 stations.' },
  practice_plan_course: { code: 'CH-17114', message: 'Pick the holes for Course.' },
  practice_plan_own: { code: 'CH-17001', message: 'An own-work line is up to 140 characters.' },
  practice_plan_drill: { code: 'CH-17001', message: 'That drill isn’t in the bank.' },
  practice_plan_coach_not_on_staff: { code: 'CH-17001', message: 'That coach isn’t on staff.' },
  practice_plan_player_not_on_team: { code: 'CH-17001', message: 'That player isn’t on the team.' },
  practice_plan_qualifier: { code: 'CH-17001', message: 'That qualifier isn’t on this team.' },
  practice_plan_card: { code: 'CH-17014', message: 'Published. The plan card didn’t post to team chat.' },
  practice_plan_changes: { code: 'CH-17003', message: 'Couldn’t republish.' },
  practice_plan_no_rain_layout: { code: 'CH-17001', message: 'This plan has no rain layout.' },
  practice_plan_rain_active: { code: 'CH-17001', message: 'The rain layout is on. Switch back first.' },
  practice_plan_variant: { code: 'CH-17001', message: 'That plan couldn’t be saved.' },
  practice_makeup_due: { code: 'CH-17009', message: 'Couldn’t create the make-up.' },
};

export function practiceErrorOf(message: string | null | undefined): { code: string; message: string; token: string | null } {
  const token = message ? Object.keys(PRACTICE_ERRORS).find((t) => message.includes(t)) : undefined;
  return token ? { ...PRACTICE_ERRORS[token]!, token } : { code: 'CH-17001', message: 'That plan couldn’t be saved.', token: null };
}

/**
 * The errors that mean the held block isn't applied, or only part of it is: Practice is unavailable, never a crash and never "didn't load" (N-00 §0.5).
 * A missing table (PGRST205, 42P01), a missing function (PGRST202, 42883), and a missing column (PGRST204, 42703): a database with some of the
 * twelve migrations answers a read that names a later one's column with the last two.
 */
const PRACTICE_MISSING = new Set(['PGRST205', 'PGRST202', 'PGRST204', '42P01', '42883', '42703']);
export const isPracticeMissing = (code: string | null | undefined): boolean => !!code && PRACTICE_MISSING.has(code);

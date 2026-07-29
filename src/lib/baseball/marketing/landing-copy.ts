import { isRecruitingEnabled } from '@/lib/baseball/product-modules';

/**
 * The BaseballHelm public landing page's copy, resolved against the product
 * module registry.
 *
 * WHY THIS EXISTS. `/baseball` is the front door — the page a coach who
 * clicked a shared link reads before anything else — and it led with
 * recruiting: the `<title>` and both social cards said "Recruiting & Team
 * Management", the H1 said "Recruiting and team operations for college
 * baseball", the hero promised "the prospect pipeline", and a full feature
 * section ("THE WAR ROOM · PIPELINE") sold moving a prospect from Watchlist to
 * Committed with 20-80 grades.
 *
 * None of that is reachable. The registry's own stated reason for the sunset
 * is that BaseballHelm "is being sold as a team-operations and player-
 * development product; the recruiting module was the least complete surface
 * area and diluted the pitch" — and the pitch is this page. A prospect who
 * arrives for the pipeline and cannot find it does not conclude the module is
 * disabled; they conclude the product does not work.
 *
 * WHAT REPLACES IT. Not a gap. Removing the pipeline section alone would leave
 * three sections and a page that reads like something was cut. The fourth
 * section is practice + readiness + attendance, which is real, shipped and
 * verifiable: `baseball_practice_attendance` (present/limited/absent/excused),
 * `baseball_event_attendance`, the readiness gate on Player Today, and the
 * Lift Lab assignment surfaced by `hasLiftToday`. Every sentence below is a
 * claim about code that exists today.
 *
 * REVERSIBILITY. Flip `PRODUCT_MODULES.recruiting.enabled` and every original
 * word returns, byte for byte, with no edit to the page. The recruiting copy
 * is preserved here rather than deleted, for the same reason the routes are.
 */
export interface BaseballLandingCopy {
  /** `<title>` and both social cards. */
  metaTitle: string;
  /** Hero H1. */
  heroHeading: string;
  /** Hero paragraph + every `description` in metadata. */
  heroDescription: string;
  /** Body of the roster feature section. */
  rosterBody: string;
  /** Body of the passport feature section. */
  passportBody: string;
  /** Whether the "THE WAR ROOM · PIPELINE" section renders. */
  showPipelineSection: boolean;
  /** The section that stands in its place while recruiting is off. */
  showPracticeSection: boolean;
}

const RECRUITING_ON: BaseballLandingCopy = {
  metaTitle: 'BaseballHelm — Recruiting & Team Management for College Baseball',
  heroHeading: 'Recruiting and team operations for college baseball.',
  heroDescription:
    "BaseballHelm brings the roster, the stat sheet, and the prospect pipeline into one system — built for college, JUCO, high school, and showcase programs, not adapted from someone else's spreadsheet.",
  rosterBody:
    'Rosters, positions, class years, and status live in one place your whole staff can see — not a spreadsheet six people are editing at once. Add a player once; every surface, from the lineup card to the recruiting file, reads from the same record.',
  passportBody:
    'Measurables, video, and development notes fill in as the season happens — a living file a player owns, and a coach or scout can trust, not a static PDF from three years ago.',
  showPipelineSection: true,
  showPracticeSection: false,
};

const RECRUITING_OFF: BaseballLandingCopy = {
  metaTitle: 'BaseballHelm — Team Operations & Player Development for Baseball',
  heroHeading: 'Team operations and player development for baseball.',
  heroDescription:
    "BaseballHelm brings the roster, the schedule, and the stat sheet into one system — built for college, JUCO, high school, and showcase programs, not adapted from someone else's spreadsheet.",
  rosterBody:
    'Rosters, positions, class years, and status live in one place your whole staff can see — not a spreadsheet six people are editing at once. Add a player once; every surface, from the lineup card to the player’s own passport, reads from the same record.',
  passportBody:
    'Measurables, video, and development notes fill in as the season happens — a living file a player owns and a coach can trust, not a static PDF from three years ago.',
  showPipelineSection: false,
  showPracticeSection: true,
};

export function resolveBaseballLandingCopy(): BaseballLandingCopy {
  return isRecruitingEnabled() ? RECRUITING_ON : RECRUITING_OFF;
}

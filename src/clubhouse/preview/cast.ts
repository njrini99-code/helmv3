/**
 * The one preview cast: who is on the demo team, in every lane's fixtures. Plain data, no imports, nothing computed, so
 * a fixture in any lane can read it. Used only by /clubhouse-preview, which returns 404 in production.
 *
 * Why it exists (design review, 10 Nov 2026): each lane's fixtures named their own team, so one walk through the
 * preview showed "Finley University" on Ask and "Demo University Golf" on Team, Jonah with 18 rounds on one screen and
 * 21 on another, and the penalty read on Eli's page and on Jonah's file. A lane fixture takes its people, class years,
 * round counts and read owners from here and adds only its own screen's figures.
 *
 * Where the names come from: the approved design pages. No two pages draw the same team, so this is the set they share.
 *   - Team, Read and Lenses (and Ask by first name) draw Eli Brandt, Jonah Okafor, Priya Natarajan, Theo Marchetti and
 *     Sam Whitfield with the class years and round counts below, under head coach Maya Reyes.
 *   - Messages draws Eli Brandt as a Junior too, and adds Dana Reyes (assistant coach) and Owen Park (Junior).
 *   - Practice, Messages, Ask and Read use Ava; Practice uses Sofia and Owen. Their surnames are the handoff's
 *     (`fixtures.ts`): Ava Lindqvist, Sofia Alvarez.
 *   - Lenses, Messages, Practice and Classes/Roster/Home name the team "Demo University Golf"; Ask, Read, Team and
 *     Quick chat call the squad "Varsity". Both are true here: the team's name and the squad's.
 *   - My stats and player Home greet Jonah, and the player Ask draws Jonah Okafor: he is the player whose own screens
 *     the preview shows.
 *
 * Where the designs disagree with each other, this file picks once:
 *   - Sam Whitfield has 3 rounds (Team's roster, Lenses' "No reads yet"). Team's two Sam reads say "from 6 rounds";
 *     a player is read only from 4 full rounds, so Sam has no read anywhere.
 *   - Roster, coach Home and Team stats draw a different six (Cole Bennett and others) and Practice a different nine.
 *     Those lanes use this cast instead.
 */

export type CastYearKey = 'sr' | 'jr' | 'so' | 'fr';
export type CastClassYear = 'Senior' | 'Junior' | 'Sophomore' | 'Freshman';

export interface CastPlayer {
  /** The short id every fixture already uses for this player (`playerId: 'eli'`). */
  id: string;
  name: string;
  first: string;
  /** The short form a tight row shows: first name and the surname's initial. */
  short: string;
  initials: string;
  classYear: CastClassYear;
  yearKey: CastYearKey;
  /** 2026-27 season: Senior 2027, Junior 2028, Sophomore 2029, Freshman 2030. */
  gradYear: number;
  /** Rounds on file this season. Every screen that prints a round count for this player prints this one. */
  rounds: number;
  /** Fewer than 4 full rounds: no reads yet. Fewer than 5: an early figure (a hollow coin on Team). */
  early: boolean;
  status: 'active' | 'injured';
}

export interface CastRead {
  /** The insight id the read's own page opens with (`in-pen` is the Read design's; the others are named here). */
  id: string;
  playerId: string;
  title: string;
  area: 'Course and scoring' | 'Putting' | 'Approach' | 'Off the tee' | 'Around the green';
  level: 'Priority' | 'Worth closing';
  /** The rounds the read stands on: the player's own count, never another figure. */
  rounds: number;
}

export const CAST_TEAM = {
  id: 'preview-team',
  /** The team's name: a group chat's title, a plan's letterhead, Ask's "no roster" line. */
  name: 'Demo University Golf',
  /** The squad a coach with two teams switches between, and the context line under a large title. */
  squad: 'Varsity',
  season: '2026-27',
  timezone: 'America/New_York',
  /** The home course the designs share (Lenses, Read, Messages, Quick chat, My stats). */
  homeCourse: 'Lonnie Poole',
} as const;

export const CAST_COACH = {
  id: 'preview-coach',
  name: 'Maya Reyes',
  first: 'Maya',
  /** How a player's screen names her ("set by Coach Reyes"). */
  formal: 'Coach Reyes',
  initials: 'MR',
  title: 'Head coach',
} as const;

export const CAST_ASSISTANT = {
  id: 'dana',
  name: 'Dana Reyes',
  first: 'Dana',
  initials: 'DR',
  title: 'Assistant coach',
} as const;

/** Ordered as the Team design lists them, then the three the other designs add. */
export const CAST_PLAYERS: readonly CastPlayer[] = [
  { id: 'eli', name: 'Eli Brandt', first: 'Eli', short: 'Eli B.', initials: 'EB', classYear: 'Junior', yearKey: 'jr', gradYear: 2028, rounds: 21, early: false, status: 'active' },
  { id: 'jonah', name: 'Jonah Okafor', first: 'Jonah', short: 'Jonah O.', initials: 'JO', classYear: 'Senior', yearKey: 'sr', gradYear: 2027, rounds: 18, early: false, status: 'active' },
  { id: 'priya', name: 'Priya Natarajan', first: 'Priya', short: 'Priya N.', initials: 'PN', classYear: 'Sophomore', yearKey: 'so', gradYear: 2029, rounds: 16, early: false, status: 'active' },
  { id: 'theo', name: 'Theo Marchetti', first: 'Theo', short: 'Theo M.', initials: 'TM', classYear: 'Freshman', yearKey: 'fr', gradYear: 2030, rounds: 4, early: true, status: 'active' },
  { id: 'sam', name: 'Sam Whitfield', first: 'Sam', short: 'Sam W.', initials: 'SW', classYear: 'Junior', yearKey: 'jr', gradYear: 2028, rounds: 3, early: true, status: 'active' },
  { id: 'sofia', name: 'Sofia Alvarez', first: 'Sofia', short: 'Sofia A.', initials: 'SA', classYear: 'Senior', yearKey: 'sr', gradYear: 2027, rounds: 22, early: false, status: 'active' },
  { id: 'ava', name: 'Ava Lindqvist', first: 'Ava', short: 'Ava L.', initials: 'AL', classYear: 'Junior', yearKey: 'jr', gradYear: 2028, rounds: 19, early: false, status: 'active' },
  { id: 'owen', name: 'Owen Park', first: 'Owen', short: 'Owen P.', initials: 'OP', classYear: 'Junior', yearKey: 'jr', gradYear: 2028, rounds: 11, early: false, status: 'injured' },
];

/** The same players by id, for a fixture that names one. */
export const CAST: Readonly<Record<'eli' | 'jonah' | 'priya' | 'theo' | 'sam' | 'sofia' | 'ava' | 'owen', CastPlayer>> = {
  eli: CAST_PLAYERS[0]!,
  jonah: CAST_PLAYERS[1]!,
  priya: CAST_PLAYERS[2]!,
  theo: CAST_PLAYERS[3]!,
  sam: CAST_PLAYERS[4]!,
  sofia: CAST_PLAYERS[5]!,
  ava: CAST_PLAYERS[6]!,
  owen: CAST_PLAYERS[7]!,
};

/** Eight on the roster: seven playing and one injured. The season's rounds on file, all players. */
export const CAST_COUNTS = { players: 8, active: 7, injured: 1, rounds: 114 } as const;

/** The player whose own screens the preview shows (player Home, My stats, player Ask, the player lens). */
export const CAST_VIEWER_PLAYER_ID = 'jonah';
/** The player whose file and read the coach's CoachHelm screens open on (Read, Lenses, the Team read sheet). */
export const CAST_FOCUS_PLAYER_ID = 'eli';

/**
 * Each player's top read, as Lenses' roster and the Read page draw it. One read has one owner: the penalty read is
 * Eli's on every screen. Sam has none (3 rounds); the designs draw none for Sofia, Ava or Owen, so a lane that needs
 * one for them writes it in its own fixture and keeps the player's round count.
 */
export const CAST_TOP_READS: readonly CastRead[] = [
  { id: 'in-pen', playerId: 'eli', title: 'Penalty strokes: 1.1 a round', area: 'Course and scoring', level: 'Priority', rounds: 21 },
  { id: 'in-downhill', playerId: 'jonah', title: 'Downhill putts from 4 to 6 ft', area: 'Putting', level: 'Priority', rounds: 18 },
  { id: 'in-breaks', playerId: 'priya', title: 'Under-reading left-to-right breaks', area: 'Putting', level: 'Worth closing', rounds: 16 },
  { id: 'in-doubles', playerId: 'theo', title: 'Double bogey or worse: 16%', area: 'Course and scoring', level: 'Worth closing', rounds: 4 },
];

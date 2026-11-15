/**
 * The demo team's story: who is on it, how each player plays, and where the
 * team plays. Everything here is invented. No name, place or score comes from
 * a real person or a real team's data (DD-02): the generator simulates every
 * shot from the skill numbers below.
 *
 * Changing anything in this file changes generated rows, so bump
 * GENERATOR_VERSION with it; the writer then replaces what it wrote before.
 */

/** Bump on any change that alters generated rows. The writer stores it on every ledger row. */
export const GENERATOR_VERSION = 1;

/** The seed every production run uses. A different seed gives a different, equally valid team (tests use several). */
export const DEFAULT_SEED = 'demo-university-golf-100';

export type ClassYear = 'freshman' | 'sophomore' | 'junior' | 'senior';

/**
 * How a player plays, as offsets from a solid college scratch player. Positive
 * is better. The round simulator turns these into shot outcomes; the database
 * then computes strokes gained from the shots, so the numbers on screen come
 * from the same code path as a real round.
 */
export interface Skill {
  /** Average drive in yards. */
  drive: number;
  /** Share of par-4 and par-5 tee shots that find the fairway (0 to 1). */
  fairway: number;
  /** Approach quality: shifts green-hit odds and proximity. 0 is scratch, +1 is very good, -1 is poor. */
  approach: number;
  /** Chipping and pitching quality on the same scale. */
  shortGame: number;
  /** Putting quality on the same scale. */
  putting: number;
  /** Chance that a tee shot on a par 4 or par 5 ends in a penalty area or out of bounds. */
  penaltyRate: number;
  /** Day-to-day swing: the standard deviation of a round's form, on the same scale as the skills. */
  volatility: number;
}

/** A change in form across the season: from `from` (inclusive) the named skills shift by `delta`, phased in over `rampDays`. */
export interface FormShift {
  /** Offset in days from the academic-year anchor (1 Aug). */
  fromDay: number;
  rampDays: number;
  delta: Partial<Pick<Skill, 'approach' | 'shortGame' | 'putting' | 'fairway' | 'penaltyRate'>>;
}

export type StoryKey =
  | 'steady_senior'
  | 'boom_or_bust'
  | 'improving_freshman'
  | 'slumping_senior'
  | 'bubble'
  | 'strong_putter'
  | 'transfer'
  | 'injured'
  | 'walk_on';

export interface DemoPlayerStory {
  key: StoryKey;
  firstName: string;
  lastName: string;
  classYear: ClassYear;
  hometown: string;
  state: string;
  jersey: number;
  /** One line a coach would say about the player; used in the coverage summary, never written to a row. */
  storyLine: string;
  skill: Skill;
  shifts: FormShift[];
  /** In the five-man lineup by default (the bubble player fights for the fifth spot). */
  lineupRegular: boolean;
  /** Days from 1 Aug when the player joined (transfer); 0 for everyone else. */
  joinedDay: number;
  /** Days from 1 Aug from which the player is out injured, or null. */
  injuredFromDay: number | null;
  /** Days from 1 Aug when the player is cleared to play again. */
  injuredUntilDay: number | null;
  /** Days from 1 Aug from which the player can be entered in a tournament (a transfer sits out the fall). */
  eventEligibleDay: number;
}

const SCRATCH: Skill = {
  drive: 288,
  fairway: 0.6,
  approach: 0,
  shortGame: 0,
  putting: 0,
  penaltyRate: 0.025,
  volatility: 0.35,
};

function skill(over: Partial<Skill>): Skill {
  return { ...SCRATCH, ...over };
}

/**
 * The roster. Day offsets count from 1 Aug of the academic year, so the story
 * repeats every season on the same calendar: day 70 is 10 Oct.
 */
export const DEMO_ROSTER: readonly DemoPlayerStory[] = [
  {
    key: 'steady_senior',
    firstName: 'Owen',
    lastName: 'Hartley',
    classYear: 'senior',
    hometown: 'Greenville',
    state: 'SC',
    jersey: 1,
    storyLine: 'Steady No. 1: the lowest scoring average on the team, rarely above 74.',
    skill: skill({ drive: 292, fairway: 0.68, approach: 0.55, shortGame: 0.3, putting: 0.2, penaltyRate: 0.012, volatility: 0.22 }),
    shifts: [],
    lineupRegular: true,
    joinedDay: 0,
    injuredFromDay: null,
    injuredUntilDay: null,
    eventEligibleDay: 0,
  },
  {
    key: 'boom_or_bust',
    firstName: 'Rhys',
    lastName: 'Calloway',
    classYear: 'junior',
    hometown: 'Knoxville',
    state: 'TN',
    jersey: 7,
    storyLine: 'Boom or bust: the longest hitter, and the most penalty strokes on the team.',
    skill: skill({ drive: 312, fairway: 0.47, approach: 0.25, shortGame: -0.1, putting: 0.05, penaltyRate: 0.075, volatility: 0.6 }),
    shifts: [],
    lineupRegular: true,
    joinedDay: 0,
    injuredFromDay: null,
    injuredUntilDay: null,
    eventEligibleDay: 0,
  },
  {
    key: 'improving_freshman',
    firstName: 'Theo',
    lastName: 'Lindqvist',
    classYear: 'freshman',
    hometown: 'Overland Park',
    state: 'KS',
    jersey: 14,
    storyLine: 'Improving freshman: about four shots better than in the first month of the season.',
    skill: skill({ drive: 280, fairway: 0.58, approach: -0.55, shortGame: -0.45, putting: -0.35, penaltyRate: 0.035, volatility: 0.4 }),
    shifts: [
      { fromDay: 28, rampDays: 55, delta: { approach: 1.0, shortGame: 0.55, putting: 0.45 } },
    ],
    lineupRegular: false,
    joinedDay: 0,
    injuredFromDay: null,
    injuredUntilDay: null,
    eventEligibleDay: 0,
  },
  {
    key: 'slumping_senior',
    firstName: 'Grant',
    lastName: 'Whitaker',
    classYear: 'senior',
    hometown: 'Lexington',
    state: 'KY',
    jersey: 3,
    storyLine: 'Slumping senior: scoring up three to five shots since early October, and the approach play is the cause.',
    skill: skill({ drive: 290, fairway: 0.64, approach: 0.45, shortGame: 0.2, putting: 0.1, penaltyRate: 0.02, volatility: 0.28 }),
    shifts: [
      { fromDay: 62, rampDays: 14, delta: { approach: -0.4 } },
    ],
    lineupRegular: true,
    joinedDay: 0,
    injuredFromDay: null,
    injuredUntilDay: null,
    eventEligibleDay: 0,
  },
  {
    key: 'bubble',
    firstName: 'Elliot',
    lastName: 'Marsh',
    classYear: 'sophomore',
    hometown: 'Asheville',
    state: 'NC',
    jersey: 22,
    storyLine: 'Bubble fifth man: fights for the last lineup spot in every qualifier, and won one in October.',
    skill: skill({ drive: 284, fairway: 0.62, approach: 0.15, shortGame: 0.1, putting: 0.05, penaltyRate: 0.025, volatility: 0.3 }),
    shifts: [],
    lineupRegular: false,
    joinedDay: 0,
    injuredFromDay: null,
    injuredUntilDay: null,
    eventEligibleDay: 0,
  },
  {
    key: 'strong_putter',
    firstName: 'Jonah',
    lastName: 'Pruitt',
    classYear: 'junior',
    hometown: 'Chattanooga',
    state: 'TN',
    jersey: 9,
    storyLine: 'Best putter on the team; gives it back with the irons.',
    skill: skill({ drive: 276, fairway: 0.66, approach: -0.35, shortGame: 0.3, putting: 0.85, penaltyRate: 0.02, volatility: 0.27 }),
    shifts: [],
    lineupRegular: true,
    joinedDay: 0,
    injuredFromDay: null,
    injuredUntilDay: null,
    eventEligibleDay: 0,
  },
  {
    key: 'transfer',
    firstName: 'Mateo',
    lastName: 'Serrano',
    classYear: 'junior',
    hometown: 'Tucson',
    state: 'AZ',
    jersey: 18,
    storyLine: 'Transfer who joined in November and sits out the fall events: too few rounds to read yet.',
    skill: skill({ drive: 296, fairway: 0.6, approach: 0.25, shortGame: 0.1, putting: 0, penaltyRate: 0.03, volatility: 0.32 }),
    shifts: [],
    lineupRegular: false,
    joinedDay: 92,
    injuredFromDay: null,
    injuredUntilDay: null,
    eventEligibleDay: 165,
  },
  {
    key: 'injured',
    firstName: 'Caleb',
    lastName: 'Northcott',
    classYear: 'sophomore',
    hometown: 'Roanoke',
    state: 'VA',
    jersey: 11,
    storyLine: 'Out with a wrist injury since 10 Oct; cleared for the spring.',
    skill: skill({ drive: 286, fairway: 0.63, approach: 0.2, shortGame: 0.15, putting: 0.15, penaltyRate: 0.022, volatility: 0.3 }),
    shifts: [],
    lineupRegular: false,
    joinedDay: 0,
    injuredFromDay: 70,
    injuredUntilDay: 175,
    eventEligibleDay: 0,
  },
  {
    key: 'walk_on',
    firstName: 'Sam',
    lastName: 'Okafor',
    classYear: 'freshman',
    hometown: 'Columbus',
    state: 'OH',
    jersey: 31,
    storyLine: 'Walk-on: plays every qualifier, has not cracked the lineup yet.',
    skill: skill({ drive: 272, fairway: 0.56, approach: -0.6, shortGame: -0.35, putting: -0.25, penaltyRate: 0.04, volatility: 0.42 }),
    shifts: [],
    lineupRegular: false,
    joinedDay: 0,
    injuredFromDay: null,
    injuredUntilDay: null,
    eventEligibleDay: 0,
  },
];

export interface DemoHole {
  par: 3 | 4 | 5;
  yards: number;
}

export interface DemoVenue {
  key: string;
  name: string;
  city: string;
  state: string;
  tees: string;
  rating: number;
  slope: number;
  holes: readonly DemoHole[];
}

function layout(spec: string, yards: readonly number[]): DemoHole[] {
  if (spec.length !== 18 || yards.length !== 18) throw new Error('A venue needs 18 pars and 18 yardages');
  return spec.split('').map((p, i) => ({ par: Number(p) as 3 | 4 | 5, yards: yards[i]! }));
}

/** Invented venues. The home course hosts practice rounds and qualifiers; the others host the tournaments. */
export const DEMO_VENUES: readonly DemoVenue[] = [
  {
    key: 'home',
    name: 'Cedar Ridge Golf Club',
    city: 'Millbrook',
    state: 'NC',
    tees: 'Blue',
    rating: 73.4,
    slope: 136,
    holes: layout('454343445435443454', [412, 548, 431, 188, 446, 214, 468, 401, 437, 427, 205, 539, 455, 392, 176, 418, 571, 441]),
  },
  {
    key: 'lakes',
    name: 'Harbor Lakes Golf Club',
    city: 'Port Ellis',
    state: 'SC',
    tees: 'Black',
    rating: 74.1,
    slope: 139,
    holes: layout('443454534454343445', [421, 438, 201, 455, 552, 409, 177, 571, 444, 403, 448, 541, 229, 433, 187, 452, 418, 559]),
  },
  {
    key: 'pines',
    name: 'Whispering Pines Country Club',
    city: 'Ashdale',
    state: 'GA',
    tees: 'Gold',
    rating: 73.0,
    slope: 133,
    holes: layout('445434354445343454', [398, 429, 537, 194, 441, 383, 168, 551, 452, 416, 404, 529, 211, 447, 185, 436, 566, 425]),
  },
  {
    key: 'links',
    name: 'Stonegate Links',
    city: 'Briar Falls',
    state: 'VA',
    tees: 'Blue',
    rating: 72.6,
    slope: 131,
    holes: layout('435443454453434544', [409, 197, 544, 433, 381, 216, 452, 559, 427, 418, 533, 174, 446, 403, 548, 189, 437, 455]),
  },
  {
    key: 'dunes',
    name: 'Sandhill Dunes Golf Course',
    city: 'Carver',
    state: 'NC',
    tees: 'Black',
    rating: 74.4,
    slope: 140,
    holes: layout('454434534445435344', [439, 561, 423, 207, 452, 418, 183, 574, 446, 431, 448, 412, 553, 196, 444, 221, 587, 459]),
  },
  {
    key: 'oaks',
    name: 'Twin Oaks Golf Club',
    city: 'Haddon',
    state: 'TN',
    tees: 'Blue',
    rating: 72.9,
    slope: 134,
    holes: layout('454345434443545344', [404, 552, 436, 186, 415, 538, 421, 172, 447, 410, 433, 195, 541, 429, 568, 181, 422, 451]),
  },
];

export function venue(key: string): DemoVenue {
  const v = DEMO_VENUES.find((x) => x.key === key);
  if (!v) throw new Error(`Unknown demo venue ${key}`);
  return v;
}

export const parOf = (v: DemoVenue): number => v.holes.reduce((s, h) => s + h.par, 0);

/** Invented opponents for tournament fields. */
export const DEMO_FIELD_TEAMS: readonly string[] = [
  'Brookfield College',
  'Coastal Pines University',
  'Eastmoor State',
  'Highland Valley College',
  'Lakeview University',
  'Marlow College',
  'North Ridge State',
  'Redstone University',
  'Saint Albans College',
  'Westbury State',
  'Willow Creek University',
  'Fairhaven College',
];

/** How the demo school is shown in a tournament field (the real team row keeps its own name). */
export const DEMO_US_FIELD_NAME = 'Demo University';

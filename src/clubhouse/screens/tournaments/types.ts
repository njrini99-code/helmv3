/**
 * P016 Tournaments: the shared UI shapes every view reads (plan 4.33 sections 4.4, 11.1, 12 and the Phase 1 type
 * block). Types only: no functions, no I/O, client-safe. Everything here is plain JSON (no Map, Set, Date or class),
 * because the data crosses from a server route or the preview page into client views.
 *
 * Conventions:
 *   - Dates are `yyyy-mm-dd` (the team's day); instants are ISO strings with an offset. Every view takes `now` from
 *     its data, never from the clock, so a server render and its hydration agree.
 *   - Scores are whole strokes; to-par is signed (negative is under par). `null` means no data, never zero.
 *   - Team math (counting and dropped sets, team totals, places, W-L-T) arrives computed. A view reads it and never
 *     recomputes it: the engine is `scoring.ts` and `standings.ts` (built on their own branch), the preview fixtures
 *     carry the same results precomputed.
 *
 * This file is base-owned (see README.md in this folder): a view that needs a field nobody else needs declares a
 * local type that extends one of these, in its own file.
 */

// ── The engine's types (plan 16, step 1.1), declared here as types only ──────────────────────────────────────────

export type TourFormat = {
  kind: '5c4' | '6c5' | '6c4' | 'custom' | 'match' | 'medal_match' | 'individual';
  players: number;
  counting: number;
  holes: 9 | 18;
};
export type ScoreStatus = 'ok' | 'wd' | 'dq' | 'dq_pending';
export interface PlayerRoundScore {
  playerId: string;
  role: 'lineup' | 'alternate' | 'individual';
  slot: number | null;
  total: number | null;
  toPar: number | null;
  status: ScoreStatus;
  /** 5L.7.1 adds `holesLeft` (carried for projections, not used by the math). */
  live?: { thru: number; toPar: number; holesLeft?: number };
}
export interface TeamRoundResult {
  kind: 'complete' | 'incomplete' | 'live' | 'none';
  total: number | null;
  toPar: number | null;
  counting: string[];
  dropped: string[];
  tiedAtBoundary: string[];
  reason?: 'too_few_scores';
  missing?: string[];
  /** 5L.7.1: for `live`, how many counting scores are not on the course yet ("3 of 4 counting in"); 0 otherwise. */
  short?: number;
}
export interface TeamEventResult {
  kind: 'complete' | 'incomplete' | 'live';
  total: number | null;
  toPar: number | null;
  rounds: TeamRoundResult[];
  droppedTotal: number | null;
}

// ── Vocabulary ──────────────────────────────────────────────────────────────────────────────────────────────────

/** How settled a number is (D-84). `upcoming` before any round starts. */
export type ChTourTrust = 'upcoming' | 'live' | 'suspended' | 'final' | 'official';
/** Who produced a number (D-84, D-88): the quieter label beside the trust. */
export type ChTourSource = 'card' | 'coach' | 'estimate' | 'pasted';
export type ChTourRoundStatus = 'upcoming' | 'live' | 'suspended' | 'final' | 'official';
export type ChTourEventKind = 'regular' | 'conference' | 'regional' | 'national' | 'exhibition';
export type ChTourTiebreak = 'ties_stand' | 'ncaa' | 'playoff' | 'card_playoff';
export type ChTourStartType = 'tee_times' | 'shotgun' | 'two_tees';
export type ChTourEntryRole = 'lineup' | 'alternate' | 'individual';
/** D-92: only the A squad feeds team stats and the season record. */
export type ChTourSquad = 'A' | 'B';
/** The event desk's emphasis across the week (principle 3). */
export type ChTourMood = 'prep' | 'live' | 'result' | 'review';
/** A player's score in a round, as Who counted draws it. */
export type ChTourCount = 'counted' | 'dropped' | 'tie' | 'individual' | 'none';
export type ChTourDivision = 'd1' | 'd2' | 'd3' | 'naia' | 'njcaa';
export type ChTourGender = 'mens' | 'womens';
export type ChTourAvailability = 'available' | 'injured' | 'academic' | 'not_travelling';
/** Why a round is left out of a figure (5.13). */
export type ChTourExclusion = 'nine-holes' | 'individual' | 'wd' | 'dq' | 'no-shot-data' | 'totals-only' | 'coach-excluded';

/** W-L-T, from finishes against every other team in a field (2.3). */
export interface ChTourRecord {
  w: number;
  l: number;
  t: number;
}

// ── People, courses, seasons ───────────────────────────────────────────────────────────────────────────────────

export interface ChTourPlayer {
  id: string;
  name: string;
  /** First name, for sentences ("Ava counts more often"). */
  first: string;
  initials: string;
  /** Class year as the roster says it: "Junior", "Graduated 2026". */
  year: string;
  avatarUrl: string | null;
  /** Graduated or left: stays with the events they played, never offered for a lineup. */
  alumni: boolean;
  availability: ChTourAvailability;
}

export interface ChTourCourseHole {
  n: number;
  par: number;
  handicap: number | null;
  yards: number | null;
}

export interface ChTourCourse {
  id: string;
  name: string;
  tees: string;
  par: number;
  /** Course rating of the tees played; null when the course has none (projections then fall back to par). */
  rating: number | null;
  holes: ChTourCourseHole[];
}

export interface ChTourSeason {
  /** `2026-27` */
  id: string;
  /** `2026–27`, with the en dash the design writes. */
  label: string;
  start: string;
  end: string;
  division: ChTourDivision | null;
  gender: ChTourGender;
  conference: string | null;
  /** The official ranking the coach entered (2.3: GolfHelm never computes one). */
  ranking: { value: number; enteredAt: string } | null;
}

export interface ChTourTeam {
  id: string;
  name: string;
  /** The page's eyebrow: "Varsity · Fall 2026". */
  label: string;
  timezone: string;
}

// ── An event and its rounds ────────────────────────────────────────────────────────────────────────────────────

/** A competition round: one `golf_events` row tied to the tournament (D-81). */
export interface ChTourRound {
  roundEventId: string;
  eventId: string;
  number: number;
  date: string;
  courseId: string;
  startType: ChTourStartType;
  firstTeeAt: string | null;
  status: ChTourRoundStatus;
  /** One player's par for the round (72), so a team's par is `par × counting`. */
  par: number;
  /** Two rounds share a date: a 36-hole day. */
  thirtySix: boolean;
}

export interface ChTourEntry {
  playerId: string;
  role: ChTourEntryRole;
  /** 1 to 5 (or 6) for a lineup player, null otherwise. */
  slot: number | null;
  squad: ChTourSquad;
}

/** One player's score in one round (`golf_tournament_player_rounds`), with its trust, source and counting state. */
export interface ChTourPlayerRound {
  eventId: string;
  roundEventId: string;
  roundNumber: number;
  playerId: string;
  role: ChTourEntryRole;
  slot: number | null;
  squad: ChTourSquad;
  total: number | null;
  toPar: number | null;
  status: ScoreStatus;
  source: ChTourSource;
  trust: ChTourTrust;
  /** The linked `golf_rounds` id, or null for an entered score. */
  roundId: string | null;
  /** Hole-by-hole scores exist (a totals-only round counts in team scores, never in hole figures). */
  holesKnown: boolean;
  /** Strokes-gained data exists for this round (the design's shot dot). */
  shotData: boolean;
  /** The host's official total when it differs from our card (D-82: shown, never silently picked). */
  officialTotal: number | null;
  live?: { thru: number; toPar: number; holesLeft?: number };
  /** Precomputed from the round's TeamRoundResult. */
  count: ChTourCount;
}

/** A round's team result, with the round it belongs to. */
export interface ChTourTeamRound extends TeamRoundResult {
  roundNumber: number;
  roundEventId: string;
  /** The team's par for the round: one player's par times the counting number. */
  par: number;
}

export interface ChTourFieldTeam {
  id: string;
  name: string;
  /** Our own row. */
  us: boolean;
  squad: ChTourSquad;
  /** False for an opponent outside our division: shown, but not in the D1 record (D-91). */
  sameDivision: boolean;
  seed: number | null;
  /** Round totals in round order; null where not entered or not played yet. */
  rounds: Array<number | null>;
  total: number | null;
  toPar: number | null;
  /** "T3"; null while not placed. */
  place: string | null;
  placeN: number | null;
  /** Live: holes played by the team's last group. */
  thru: number | null;
  enteredAt: string | null;
  source: ChTourSource;
}

export interface ChTourField {
  /** Teams in the field, ours included. */
  size: number;
  /** How many of them have results entered ("Field entered: 9 of 14 teams"). */
  entered: number;
  teams: ChTourFieldTeam[];
  /** Postseason line drawn on the field table: "Top 5 advance", "Cut". */
  line: { kind: 'advance' | 'cut' | 'match_play'; label: string; places: number } | null;
  asOf: string | null;
}

export interface ChTourLineupState {
  status: 'none' | 'draft' | 'published' | 'scheduled' | 'locked';
  /** Our earliest round-1 tee time minus the lock minutes; null before tee times exist. */
  locksAt: string | null;
  publishAt: string | null;
  publishedAt: string | null;
  /** The reveal receipt, coach-only (D-90): "Seen by 7 of 9". */
  seen: { by: number; of: number } | null;
  /** Lineup slots filled and needed: "4 of 5 set". */
  set: number;
  of: number;
}

export interface ChTourEvent {
  id: string;
  seasonId: string;
  name: string;
  /** "Oakmont", for tight places. */
  short: string;
  host: string | null;
  startDate: string;
  endDate: string;
  courseIds: string[];
  format: TourFormat;
  kind: ChTourEventKind;
  tiebreak: ChTourTiebreak;
  status: 'upcoming' | 'live' | 'complete';
  trust: ChTourTrust;
  mood: ChTourMood;
  rounds: ChTourRound[];
  entries: ChTourEntry[];
  playerRounds: ChTourPlayerRound[];
  team: { rounds: ChTourTeamRound[]; result: TeamEventResult | null };
  field: ChTourField | null;
  finish: { place: string; placeN: number; of: number } | null;
  /** The W-L-T this event added to the season (2.3), A squad only. */
  record: ChTourRecord | null;
  coverage: { scorecards: number; withShots: number };
  resultsUrl: string | null;
  lineup: ChTourLineupState;
  /** A quiet line for upcoming events: "Lineup from the Pinehurst qualifier · 4 of 5 set". */
  note: string | null;
  /** A calendar tournament event with no tournament row yet: shown as "Set up". */
  legacy: boolean;
  /** P-5 4.11: when the tournament row was made (the season home's "Set up today"). */
  createdAt?: string | null;
}

// ── Season home (5.1) ──────────────────────────────────────────────────────────────────────────────────────────

export interface ChTourWeekTick {
  at: string;
  kind: 'lock' | 'reveal' | 'travel' | 'practice' | 'round' | 'results';
  label: string;
  done: boolean;
}

export interface ChTourReadiness {
  key: 'lineup' | 'travel' | 'tees' | 'course';
  done: boolean;
  /** The sentence for the first missing one: "Lineup isn't set · locks Fri 7:50 AM". */
  label: string;
  due: string | null;
}

export interface ChTourNextUp {
  eventId: string;
  readiness: ChTourReadiness[];
  ticks: ChTourWeekTick[];
  alsoThisWeek: Array<{ eventId: string; label: string }>;
  /** The hero's one primary action by state (5.1.1). */
  action: 'build' | 'publish' | 'open' | 'follow' | 'review';
}

export interface ChTourFinishPlace {
  place: number;
  /** The season record after finishing here. */
  record: ChTourRecord;
  pct: number;
  /** Keeps the team at or above .500. */
  keeps: boolean;
}

export interface ChTourSeasonPath {
  division: ChTourDivision | null;
  gender: ChTourGender;
  /** False where the division's rules are not verified yet (D-91): the line shows record, rounds and ranking only. */
  tracked: boolean;
  record: ChTourRecord;
  /** Ties count half (Q-170 default); null with no results. */
  pct: number | null;
  /** The finish line for the next event with a known field (7.P.1), precomputed from the standings module. */
  finishLine: { eventId: string; fieldSize: number; places: ChTourFinishPlace[] } | null;
  checkpoints: Array<{ label: string; met: boolean | null }>;
  rounds: { played: number; scheduled: number; target: number | null };
  dates: { used: number; of: number | null };
  ranking: { value: number; enteredAt: string } | null;
  notCounted: Array<{ eventId: string; reason: string }>;
  resultsDue: string | null;
}

export interface ChTourFormPoint {
  roundId: string;
  date: string;
  toPar: number | null;
  counted: boolean | null;
}

export interface ChTourCountLadderRow {
  playerId: string;
  counted: number;
  played: number;
  /** counted ÷ played in complete A-squad rounds; null with none. */
  rate: number | null;
  /** Under 4 team-event rounds: drawn dashed, "2 rounds · early". */
  early: boolean;
  form: ChTourFormPoint[];
  commitment: string | null;
}

export interface ChTourHeatCell {
  toPar: number | null;
  /** Against the team's average for that event (A.7.9). */
  vsTeam: number | null;
  counted: number;
  played: number;
}

export interface ChTourHeatmap {
  playerIds: string[];
  eventIds: string[];
  /** Keyed `${playerId}:${eventId}`; a missing key is a player who didn't play the event. */
  cells: Record<string, ChTourHeatCell>;
}

export interface ChTourHomeData {
  now: string;
  team: ChTourTeam;
  season: ChTourSeason;
  seasons: ChTourSeason[];
  players: ChTourPlayer[];
  courses: Record<string, ChTourCourse>;
  /** Every event of the seasons shown, oldest first. */
  events: ChTourEvent[];
  next: ChTourNextUp | null;
  path: ChTourSeasonPath | null;
  ladder: ChTourCountLadderRow[];
  heatmap: ChTourHeatmap;
  /** The link inbox teaser. */
  links: { candidates: number; high: number } | null;
  errors: Partial<Record<'events' | 'path' | 'ladder' | 'heatmap' | 'links' | 'untracked', true>>;
  /** P-5 4.11.3: this season's tournament events on the calendar that aren't tracked yet, grouped (coach only). */
  untracked?: import('./setup-groups').ChTourSetupGroup[];
}

// ── Event desk (5.4, 5.6, 5.7, 5.13) ──────────────────────────────────────────────────────────────────────────

export type ChTourDeskTab = 'overview' | 'live' | 'counted' | 'holes' | 'compare' | 'review';

/** The desk's URL state (4.3). */
export interface ChTourDeskSearch {
  tab: ChTourDeskTab;
  /** `all` or a round number. */
  round: 'all' | number;
  /** Who counted: team or players. */
  view: 'team' | 'players';
  /** Holes: to par, scores or counting. */
  holes: 'to-par' | 'scores' | 'counting';
}

export interface ChTourHoleScore {
  n: number;
  par: number;
  strokes: number | null;
  source: ChTourSource;
  disputed: boolean;
}

/** One player's card for one round. */
export interface ChTourHoleCard {
  playerId: string;
  roundNumber: number;
  roundEventId: string;
  holes: ChTourHoleScore[];
  /** Started on this hole (shotgun or the 10th tee). */
  startHole: number;
}

/** The hole ledger, resolved (D-88): one card per player per round that has holes. */
export interface ChTourHoleLedger {
  courseId: string;
  pars: number[];
  handicaps: Array<number | null>;
  cards: ChTourHoleCard[];
  /** Rounds entered as totals only: in team scores, never in hole figures. */
  totalsOnly: Array<{ playerId: string; roundNumber: number }>;
}

/** What a figure opens in the evidence drawer (5.13). */
export interface ChTourEvidenceRef {
  title: string;
  /** The figure as written, or null when there is none (the drawer shows the no-data mark). */
  figure: string | null;
  /** The formula in words: "Counting rate = rounds that counted ÷ rounds played in team events". */
  formula: string;
  denominator: string;
  rounds: Array<{
    key: string;
    label: string;
    date: string;
    value: string | null;
    included: boolean;
    reason: ChTourExclusion | null;
    /** The exclusion in words, where the reason is outside `ChTourExclusion` (the metrics engine names more): "Excluded: nine holes". */
    reasonWords?: string | null;
  }>;
}

/** "Where the event turned" (the design's finding cards; later the MomentumWorm pins). */
export interface ChTourFinding {
  id: string;
  chip: string;
  title: string;
  body: string;
  tone: 'gain' | 'loss' | 'neutral';
  round: number | null;
  /** The desk tab the card's link opens, and its words. */
  link: { tab: ChTourDeskTab; label: string };
  evidence: ChTourEvidenceRef | null;
}

export interface ChTourStory {
  /** Six-hole splits for the counting scores, to par. */
  splits: Array<{ label: string; toPar: number | null }>;
  bounceBack: { made: number; of: number } | null;
  birdieStreak: { playerId: string; length: number; round: number } | null;
  swingHole: { n: number; toPar: number } | null;
}

export interface ChTourTrip {
  stops: Array<{
    at: string;
    kind: 'depart' | 'hotel' | 'practice' | 'round' | 'return';
    label: string;
    detail: string | null;
    /** The old time, struck through, when it changed. */
    changedFrom: string | null;
  }>;
  wear: string | null;
  packing: string[];
}

export interface ChTourDeskData {
  now: string;
  event: ChTourEvent;
  players: ChTourPlayer[];
  courses: Record<string, ChTourCourse>;
  holes: ChTourHoleLedger | null;
  findings: ChTourFinding[];
  story: ChTourStory | null;
  review: ChTourReview | null;
  travel: ChTourTrip | null;
  adviceGivers: string[];
  /** The previous edition at the same course, for the desk's Compare (5.4). */
  previous: { eventId: string; name: string } | null;
  errors: Partial<Record<'rounds' | 'holes' | 'field' | 'review' | 'travel', true>>;
  /**
   * P-5 4.11.5: what the desk's Cancel tournament, Restore tournament and Stop tracking need. Null when it couldn't be
   * read: the menu then offers nothing rather than a write that would be refused.
   */
  track?: ChTourTrack | null;
}

export interface ChTourTrack {
  /** The tournament's optimistic-lock version. */
  version: number;
  /** Every round's calendar entry is cancelled. */
  cancelled: boolean;
  official: boolean;
  /** The first round with a score entered, or null: a scored tournament stays tracked. */
  scoredRound: number | null;
  /** How many calendar entries (rounds) it has. */
  entries: number;
}

// ── Review, history, link inbox (5.9, 5.10, 5.12) ──────────────────────────────────────────────────────────────

export interface ChTourLeak {
  key: string;
  label: string;
  /** Against the team's season baseline, in the unit; null under the sample floor. */
  delta: number | null;
  se: number | null;
  better: 'lower' | 'higher';
  unit: 'strokes' | 'pts' | 'pct' | 'sg';
}

export interface ChTourReviewPlayer {
  playerId: string;
  /** Event to par against the player's own season average. */
  vsSeason: number | null;
  vsSeasonSe: number | null;
  costlyHoles: Array<{ n: number; toPar: number }>;
  reflection: { text: string; at: string } | null;
  fields: { shot: string; decision: string; focus: string };
  shared: { shot: boolean; decision: boolean; focus: boolean };
}

export interface ChTourReview {
  /** The review opens when every round is Final (5.9.3). */
  open: boolean;
  layers: Array<{ id: string; observation: string; evidence: string; hypothesis: string }>;
  leak: ChTourLeak[];
  players: ChTourReviewPlayer[];
  notes: Array<{ id: string; author: string; kind: 'coach' | 'reflection'; text: string }>;
  /** Players with no reflection yet. */
  missingReflections: string[];
  savedAt: string | null;
}

export interface ChTourReviewData {
  now: string;
  event: ChTourEvent;
  players: ChTourPlayer[];
  review: ChTourReview | null;
  findings: ChTourFinding[];
  errors: Partial<Record<'review' | 'findings', true>>;
}

export interface ChTourHistoryPoint {
  eventId: string;
  /** Team rounds against course rating, per round (lower is better). */
  actual: number | null;
  /** The same, returning players only. */
  matched: number | null;
  /** Our average per round minus the field's, where the field is entered. */
  vsField: number | null;
  rounds: number;
  players: number;
  scorecardsOnly: boolean;
}

export interface ChTourHeadToHead {
  team: string;
  record: ChTourRecord;
  strokeDiff: number | null;
  events: Array<{ eventId: string; us: number | null; them: number | null }>;
}

export interface ChTourHistorySplit {
  key: 'kind' | 'day' | 'start';
  label: string;
  groups: Array<{ label: string; mean: number | null; n: number; se: number | null }>;
}

/** History's URL state (4.3). */
export interface ChTourHistorySearch {
  mode: 'actual' | 'matched';
  adjust: 'raw' | 'field';
}

export interface ChTourHistoryData {
  now: string;
  seasons: ChTourSeason[];
  players: ChTourPlayer[];
  courses: Record<string, ChTourCourse>;
  events: ChTourEvent[];
  trend: ChTourHistoryPoint[];
  /** The middle 50% of this season's team results. */
  band: { lo: number; hi: number } | null;
  matchedPlayers: string[];
  headToHead: ChTourHeadToHead[];
  splits: ChTourHistorySplit[];
  errors: Partial<Record<'trend' | 'headToHead' | 'splits', true>>;
}

export interface ChTourLinkCandidate {
  roundId: string;
  playerId: string;
  date: string;
  courseName: string | null;
  score: number;
  toPar: number | null;
  suggestion: { eventId: string; roundNumber: number; confidence: 'high' | 'medium' | 'low' } | null;
}

export interface ChTourLinksData {
  now: string;
  players: ChTourPlayer[];
  candidates: ChTourLinkCandidate[];
  events: Array<{ id: string; name: string; rounds: Array<{ number: number; date: string; courseName: string }> }>;
  /** Lineup players with no round for an event round ("1 lineup player has no round linked for R2"). */
  missing: Array<{ eventId: string; roundNumber: number; playerId: string }>;
  dismissed: number;
  errors: Partial<Record<'candidates', true>>;
}

// ── Comparison (6, A.6.4) ──────────────────────────────────────────────────────────────────────────────────────

export type ChTourScopeSubject =
  | { kind: 'player'; id: string }
  | { kind: 'team' }
  | { kind: 'matched' }
  | { kind: 'lineup'; eventId: string }
  | { kind: 'group'; id: string }
  | { kind: 'field'; eventId: string };

export type ChTourScopeContext =
  | { kind: 'all' }
  | { kind: 'events' }
  | { kind: 'qual' }
  | { kind: 'practice' }
  | { kind: 'event'; id: string; rounds: number[] | null }
  | { kind: 'course'; id: string };

export type ChTourScopePeriod = { kind: 'season' } | { kind: 'last-season' } | { kind: 'l10' } | { kind: 'l20' } | { kind: 'range'; from: string; to: string };

export type ChTourScopeRefine = { kind: '18d' } | { kind: '36d' } | { kind: 'count' } | { kind: 'shot' } | { kind: 'exclude'; roundId: string };

/** One side of a comparison. Its URL token (`p:ava.ctx:events.per:season`) is parsed and printed by `compare/scope.ts`. */
export interface ChTourScope {
  subject: ChTourScopeSubject;
  context: ChTourScopeContext;
  period: ChTourScopePeriod;
  refine: ChTourScopeRefine[];
}

/** Compare's URL state (4.3): raw tokens, parsed by the view. */
export interface ChTourCompareSearch {
  a: string | null;
  b: string | null;
  /** Metric group. */
  m: string | null;
  bench: 'team' | 'field' | 'd1' | 'top25' | null;
  /** Divider position, percent. */
  split: number | null;
}

/** Every round a comparison can draw on (the design's round-level records; `ChCompareRound` in plan 6.13). */
export interface ChTourCompareRound {
  /** `golf_rounds.id`, or `entered:<roundEventId>:<playerId>`. */
  id: string;
  playerId: string;
  date: string;
  context: 'event' | 'qualifier' | 'practice';
  eventId: string | null;
  roundEventId: string | null;
  roundNumber: number | null;
  courseId: string;
  holes: 9 | 18;
  totalOnly: boolean;
  score: number;
  par: number;
  toPar: number;
  /** Score minus the course rating, per 18 (null without a rating). */
  vsRating: number | null;
  vsField: number | null;
  /** Lineup rounds only; individuals and practice are null. */
  counting: { counted: boolean; tie: boolean; drop: number | null; lineupSize: number } | null;
  individual: boolean;
  sg: { ott: number; app: number; arg: number; putt: number } | null;
  /** The event round was a WD, or a DQ (pending or final): every figure lists it out. */
  status?: 'wd' | 'dq';
  stats: {
    gir: number;
    /** Holes with a GIR mark: a hole with none is not a miss. */
    girOf: number;
    fw: number;
    fwOf: number;
    /** Null when a scored hole has no putt count (a missing count is not zero). */
    putts: number | null;
    threePutts: number;
    scrMade: number;
    scrOf: number;
    birdiesPlus: number;
    doublesPlus: number;
    penalties: number;
    proximityFt: number | null;
  };
  trust: ChTourTrust | 'practice';
}

export interface ChTourCompareData {
  now: string;
  team: ChTourTeam;
  seasons: ChTourSeason[];
  players: ChTourPlayer[];
  courses: Record<string, ChTourCourse>;
  events: ChTourEvent[];
  rounds: ChTourCompareRound[];
  /** Returning players: in the lineup both this season and last. */
  matchedPlayers: string[];
  /** Event-scoped compare (the desk's tab) presets A to this event. */
  eventId: string | null;
  errors: Partial<Record<'rounds' | 'field' | 'holes', true>>;
}

// ── Event form and lineup builder (5.2, 5.3) ──────────────────────────────────────────────────────────────────

export interface ChTourEventDraft {
  name: string;
  host: string;
  startDate: string;
  endDate: string;
  resultsUrl: string;
  notes: string;
  format: TourFormat;
  kind: ChTourEventKind;
  tiebreak: ChTourTiebreak;
  rounds: Array<{ date: string; courseId: string | null; startType: ChTourStartType; firstTee: string | null }>;
  fieldSize: number | null;
  fieldTeams: string[];
  line: { kind: 'advance' | 'cut' | 'match_play'; places: number } | null;
  adviceGivers: string[];
  qualifierId: string | null;
  itineraryId: string | null;
  /** Optimistic-lock version on edit ("This event changed since you opened it"). */
  version: number | null;
}

export interface ChTourFormData {
  now: string;
  /** The team the event is saved to, and its clock: a round's first tee is a wall-clock time in this zone. */
  teamId: string;
  timezone: string;
  /** Today in the team's zone (the new event's first day). */
  today: string;
  mode: 'new' | 'edit';
  /** The event being edited; null for a new one. */
  eventId: string | null;
  initial: ChTourEventDraft;
  courses: Array<{ id: string; name: string; tees: string[] }>;
  qualifiers: Array<{ id: string; name: string; status: 'open' | 'closed' }>;
  staff: Array<{ id: string; name: string }>;
  itineraries: Array<{ id: string; label: string }>;
  /** A calendar tournament event this form adopts as round 1. */
  fromCalendar: { eventId: string; title: string } | null;
  errors: Partial<Record<'courses' | 'qualifiers' | 'staff' | 'itineraries', true>>;
}

export interface ChTourCandidate {
  playerId: string;
  availability: ChTourAvailability;
  form: ChTourFormPoint[];
  qualifying: { place: string; total: number; toPar: number } | null;
  countRate: number | null;
  countRounds: number;
  /** Count chance band (D-93); null below the 6-round gate. The exact figure is for the evidence drawer only. */
  chance: 'usually' | 'often' | 'sometimes' | null;
  chancePct: number | null;
  eligibleRounds: number;
  /** Their rounds at this event's course. */
  course: { rounds: number; avgToPar: number | null };
}

export interface ChTourLineupData {
  now: string;
  event: ChTourEvent;
  players: ChTourPlayer[];
  candidates: ChTourCandidate[];
  slots: Array<{ slot: number; playerId: string | null; reason: string | null; squad: ChTourSquad }>;
  alternate: string | null;
  individuals: string[];
  /** Projected team range (D-93: never one number); null below the gate, with who is short. */
  projection: {
    perRound: { lo: number; mid: number; hi: number };
    event: { lo: number; mid: number; hi: number };
  } | null;
  projectionShort: Array<{ playerId: string; have: number; need: number }>;
  lineup: ChTourLineupState;
  qualifier: { id: string; name: string } | null;
  errors: Partial<Record<'roster' | 'qualifier' | 'projection', true>>;
}

// ── Live round (5L) ────────────────────────────────────────────────────────────────────────────────────────────

/** A moment the live feed names ("Jo is now counting"). */
export interface ChTourMoment {
  id: string;
  at: string;
  kind: 'now_counting' | 'dropped' | 'moved_inside' | 'finished' | 'birdie_run' | 'dispute' | 'quiet' | 'field';
  playerId: string | null;
  text: string;
}

export interface ChTourLivePlayer {
  playerId: string;
  slot: number | null;
  role: 'lineup' | 'individual';
  teeAt: string | null;
  startHole: number;
  holes: Array<ChTourHoleScore & { pending: boolean }>;
  thru: number | null;
  toPar: number | null;
  status: ScoreStatus;
  card: 'none' | 'check' | 'returned';
  count: ChTourCount;
  lastPostAt: string | null;
  projection: { total: number; lo: number; hi: number; countOdds: number | null } | null;
}

/** What the live screen starts from (the snapshot RPC, 5L.8.2); `live-model.ts` derives the view from it. */
export interface ChTourLiveSnapshot {
  now: string;
  seq: number;
  event: ChTourEvent;
  round: ChTourRound;
  players: ChTourPlayer[];
  course: ChTourCourse;
  lanes: ChTourLivePlayer[];
  /** Precomputed live team round: counting set, short, to par so far. */
  team: TeamRoundResult;
  field: ChTourField | null;
  presence: Array<{ coachId: string; name: string; withPlayerId: string | null }>;
  appScoring: 'record_only' | 'off';
  moments: ChTourMoment[];
  projection: { toPar: number; lo: number; hi: number } | null;
  errors: Partial<Record<'field' | 'holes' | 'presence', true>>;
}

// ── Player view and moments (5.11) ─────────────────────────────────────────────────────────────────────────────

/** The record-only competition window (D-87), as `window.ts` returns it. */
export interface ChTourWindow {
  in: boolean;
  until: string | null;
  day: string | null;
}

export interface ChTourReveal {
  status: 'lineup' | 'alternate' | 'individual' | 'not_travelling';
  slot: number | null;
  of: number;
  /** The travelling lineup's names in order, for a lineup player only. */
  lineup: string[];
  privateLine: string | null;
  qualifying: { outcome: 'placed' | 'not_scored' | 'none'; place: number | null; toPar: number | null } | null;
  next: { label: string; date: string } | null;
  postseason: boolean;
  /** The first view: the card rises once (5.11.2). */
  firstView: boolean;
  changedFrom: ChTourReveal['status'] | null;
  lockedAt: string | null;
}

export interface ChTourPlayerMoment {
  kind: 'reveal' | 'trip' | 'tee_times' | 'window' | 'post_round' | 'round_final' | 'result' | 'reflection' | 'notes';
  at: string;
  label: string;
}

export interface ChTourPlayerEvent {
  event: ChTourEvent;
  /** Null before the reveal: "Lineup not published yet · locks Fri 7:50 AM". */
  reveal: ChTourReveal | null;
  trip: ChTourTrip | null;
  /** Teammates' scores, only once a round is Final and outside the player's window (D-85). */
  results: { visible: boolean; reason: 'not_final' | 'in_window' | null };
  sharedNotes: Array<{ label: string; text: string; author: string; updatedAt: string }>;
  reflection: { state: 'unwritten' | 'draft' | 'saved'; went: string; strokes: string; next: string; shot: string } | null;
  moments: ChTourPlayerMoment[];
  following: boolean;
}

export interface ChTourPlayerSeason {
  counted: number;
  of: number;
  rounds: number;
  /** 15 for D1 individual eligibility; null where not tracked. */
  roundsTarget: number | null;
  perEighteen: { event: number | null; qualifier: number | null; practice: number | null };
  n: { event: number; qualifier: number; practice: number };
  early: boolean;
}

export interface ChTourPlayerData {
  now: string;
  me: ChTourPlayer;
  team: ChTourTeam;
  /** The list (`/tournaments` for a player): upcoming first, then past events with the player's own line. */
  list: Array<{
    eventId: string;
    name: string;
    startDate: string;
    endDate: string;
    courseName: string;
    status: ChTourEvent['status'];
    mine: { place: string | null; total: number | null; counted: number; of: number } | null;
  }>;
  /** The open event; null on the list. */
  event: ChTourPlayerEvent | null;
  window: ChTourWindow;
  season: ChTourPlayerSeason;
  errors: Partial<Record<'events' | 'trip' | 'season', true>>;
}

// ── View props (the contract every view keeps) ────────────────────────────────────────────────────────────────

/**
 * How the read went: `ready` draws the data (its sections may still carry `errors` flags: partial), `loading` draws
 * the view's skeleton at its final geometry, `failed` draws the whole-page failure (the one read didn't load).
 */
export type ChTourLoad = 'ready' | 'loading' | 'failed';

export interface ChTourViewBase {
  load?: ChTourLoad;
  /** Force the phone or the desktop layout; omitted, the view follows `useChPhone()`. */
  phone?: boolean;
}

export interface TournamentsHomeProps extends ChTourViewBase {
  data: ChTourHomeData;
  /** P-5 8.7: follow the calendar's tournament events (realtime). The route turns it on; tests and the preview don't. */
  live?: boolean;
}
export interface EventDeskProps extends ChTourViewBase {
  data: ChTourDeskData;
  search: ChTourDeskSearch;
}
export interface ReviewProps extends ChTourViewBase {
  data: ChTourReviewData;
  /** Inside the desk's Review tab: no page head, no page root. */
  embedded?: boolean;
}
export interface HistoryProps extends ChTourViewBase {
  data: ChTourHistoryData;
  search: ChTourHistorySearch;
}
export interface LinkInboxProps extends ChTourViewBase {
  data: ChTourLinksData;
}
export interface CompareProps extends ChTourViewBase {
  data: ChTourCompareData;
  search: ChTourCompareSearch;
  /** Inside the desk's Compare tab: no page head, A preset to the event. */
  embedded?: boolean;
}
export interface LineupBuilderProps extends ChTourViewBase {
  data: ChTourLineupData;
}
export interface EventFormProps extends ChTourViewBase {
  data: ChTourFormData;
}
export interface LiveRoundProps extends ChTourViewBase {
  data: ChTourLiveSnapshot;
  /** Inside the desk's Live tab: no page head. */
  embedded?: boolean;
  /** Preview only: replay a scripted feed instead of subscribing (5L.12's simulated feed). */
  simulate?: boolean;
}
export interface PlayerEventProps extends ChTourViewBase {
  data: ChTourPlayerData;
}

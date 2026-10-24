/**
 * P016 Tournaments preview fixtures, ported by hand from the design's `design/handoff/tour-data.js` as typed `ChTour*`
 * data (plan 16, step 2.1). Players theo, sofia, ava, jonah, eli, priya and will; events e21 to e35; e33 Oakmont is the
 * fixed fixture with the design's numbers (team 287, 286, 285, total 858, −6); e32 is 6 count 5; e34 and e35 are
 * upcoming; e33 has a field of 14 teams; the live variant puts e34's first round on the course.
 *
 * Team math arrives precomputed, as it will from the engine: `countRound` below marks each round's lowest whole-round
 * scores as counting once, when the module loads (fixture data only, not the engine: a view reads `count` and the team
 * rounds and never recomputes them). Qualifier and practice rounds for the comparison pool come from a seeded generator,
 * so every visit draws the same numbers. Everything returned is plain JSON.
 *
 * `tourFixture(state)` returns every view's data for one preview state (`?state=` on /clubhouse-preview/tournament*).
 */
import type {
  ChTourCandidate,
  ChTourCompareData,
  ChTourCompareRound,
  ChTourCountLadderRow,
  ChTourCourse,
  ChTourDeskData,
  ChTourEntry,
  ChTourEvent,
  ChTourField,
  ChTourFieldTeam,
  ChTourFinding,
  ChTourFormData,
  ChTourHeatmap,
  ChTourHistoryData,
  ChTourHoleLedger,
  ChTourHomeData,
  ChTourLinksData,
  ChTourLineupData,
  ChTourLiveSnapshot,
  ChTourLivePlayer,
  ChTourLoad,
  ChTourPlayer,
  ChTourPlayerData,
  ChTourPlayerRound,
  ChTourRecord,
  ChTourReview,
  ChTourReviewData,
  ChTourRound,
  ChTourSeason,
  ChTourSeasonPath,
  ChTourTeam,
  ChTourTeamRound,
  ChTourTrip,
  ChTourTrust,
  TeamEventResult,
  TourFormat,
} from '../screens/tournaments/types';

// ── Preview states ───────────────────────────────────────────────────────────────────────────────────────────────

export const TOUR_PREVIEW_STATES = ['ready', 'loading', 'empty', 'failed', 'partial', 'thin', 'provisional', 'live'] as const;
export type ChTourPreviewState = (typeof TOUR_PREVIEW_STATES)[number];

export function parseTourPreviewState(state: string | undefined): ChTourPreviewState {
  return (TOUR_PREVIEW_STATES as readonly string[]).includes(state ?? '') ? (state as ChTourPreviewState) : 'ready';
}

/** The fixture's clock: Wednesday of the week before Pinehurst ("In 6 days"). The live state moves it into round 1. */
export const TOUR_NOW = '2026-10-14T12:00:00-04:00';
export const TOUR_NOW_LIVE = '2026-10-20T13:40:00-04:00';

// ── A seeded generator (fixture only) ───────────────────────────────────────────────────────────────────────────

function rng(seed: number) {
  let s = seed | 0;
  return () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** One decimal, and never a negative zero (it reads as −0.0 and doesn't survive JSON). */
const round1 = (v: number) => Math.round(v * 10) / 10 + 0;
const sum = (xs: number[]) => xs.reduce((a, b) => a + b, 0);
const mean = (xs: number[]) => (xs.length ? sum(xs) / xs.length : null);

// ── Team, seasons, players, courses ─────────────────────────────────────────────────────────────────────────────

const TEAM: ChTourTeam = { id: 'preview-team', name: 'Varsity', label: 'Varsity · Fall 2026', timezone: 'America/New_York' };

const SEASONS: ChTourSeason[] = [
  { id: '2026-27', label: '2026–27', start: '2026-08-01', end: '2027-06-30', division: 'd1', gender: 'mens', conference: 'Coastal', ranking: { value: 58, enteredAt: '2026-10-12' } },
  { id: '2025-26', label: '2025–26', start: '2025-08-01', end: '2026-06-30', division: 'd1', gender: 'mens', conference: 'Coastal', ranking: { value: 71, enteredAt: '2026-05-04' } },
];

type PlayerDef = { id: string; name: string; year: string; base: number; sg: [number, number, number, number]; alumni?: boolean };
const PLAYER_DEFS: PlayerDef[] = [
  { id: 'theo', name: 'Theo Marchetti', year: 'Senior', base: 71.0, sg: [0.7, 0.5, 0.1, 0.3] },
  { id: 'sofia', name: 'Sofia Alvarez', year: 'Senior', base: 71.8, sg: [0.2, 0.6, 0.2, 0.1] },
  { id: 'ava', name: 'Ava Lindqvist', year: 'Junior', base: 72.3, sg: [0.3, 0.1, 0.3, 0.0] },
  { id: 'jonah', name: 'Jonah Okafor', year: 'Sophomore', base: 72.6, sg: [0.1, -0.2, 0.1, -0.2] },
  { id: 'eli', name: 'Eli Brandt', year: 'Junior', base: 72.9, sg: [-0.1, 0.0, -0.2, 0.2] },
  { id: 'priya', name: 'Priya Natarajan', year: 'Freshman', base: 74.4, sg: [-0.3, -0.4, 0.0, -0.1] },
  { id: 'will', name: 'Will Harper', year: 'Graduated 2026', base: 72.0, sg: [0.2, 0.2, 0.0, 0.1], alumni: true },
];
const PLAYERS: ChTourPlayer[] = PLAYER_DEFS.map((p) => {
  const [first, last] = p.name.split(' ') as [string, string];
  return { id: p.id, name: p.name, first, initials: `${first[0]}${last[0]}`, year: p.year, avatarUrl: null, alumni: !!p.alumni, availability: 'available' };
});
const DEF = Object.fromEntries(PLAYER_DEFS.map((p) => [p.id, p])) as Record<string, PlayerDef>;
/** Returning players: in a lineup both last season and this one (the design's MATCHED). */
const MATCHED = ['theo', 'sofia', 'ava', 'jonah'];
/** Active roster: everyone but the graduate. */
const ROSTER = PLAYERS.filter((p) => !p.alumni).map((p) => p.id);

const PARS_72 = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 5];
const PARS_71 = [4, 4, 3, 4, 5, 4, 3, 4, 5, 4, 4, 3, 5, 4, 4, 3, 4, 4];
const HANDICAPS = [7, 11, 17, 3, 13, 1, 15, 9, 5, 8, 12, 18, 6, 2, 14, 16, 10, 4];
const course = (id: string, name: string, tees: string, par: 71 | 72, rating: number): ChTourCourse => ({
  id,
  name,
  tees,
  par,
  rating,
  holes: (par === 72 ? PARS_72 : PARS_71).map((p, i) => ({ n: i + 1, par: p, handicap: HANDICAPS[i] ?? null, yards: null })),
});
const COURSES: Record<string, ChTourCourse> = {
  oak: course('oak', 'Oakmont CC', 'Blue tees', 72, 74.1),
  sed: course('sed', 'Sedgefield CC', 'Tournament tees', 72, 73.4),
  dog: course('dog', 'Dogwood Lakes', 'Black tees', 72, 73.0),
  pin: course('pin', 'Pinehurst No. 2', 'Blue tees', 72, 75.3),
  home: course('home', 'Home course', 'Blue tees', 71, 72.2),
  ric: course('ric', 'Riverside Links', 'Back tees', 72, 73.6),
  hol: course('hol', 'Holly Ridge', 'Blue tees', 71, 72.8),
  lak: course('lak', 'Lakeside GC', 'Tips', 72, 74.0),
};

// ── Events ──────────────────────────────────────────────────────────────────────────────────────────────────────

const F5C4: TourFormat = { kind: '5c4', players: 5, counting: 4, holes: 18 };
const F6C5: TourFormat = { kind: '6c5', players: 6, counting: 5, holes: 18 };

type EventDef = {
  id: string;
  season: string;
  name: string;
  short: string;
  course: string;
  /** One date per round; two equal dates make a 36-hole day. */
  rounds: string[];
  format: TourFormat;
  /** Our finish and the field size. */
  finish?: [number, number];
  /** Lineup in slot order, then individuals. */
  lineup: string[];
  ind?: string[];
  /** Whole-round scores per player, in round order (the design's numbers for e33). */
  scores?: Record<string, number[]>;
  /** Rounds with shot data per player (1 or 0); default: most rounds. */
  shot?: Record<string, number[]>;
  /** Last season's conference event has scorecards only (the design's `missing`). */
  scorecardsOnly?: boolean;
  note?: string;
  start?: ChTourRound['startType'];
};

const EVENT_DEFS: EventDef[] = [
  // Last season
  { id: 'e21', season: '2025-26', name: 'Riverside Intercollegiate', short: 'Riverside', course: 'ric', rounds: ['2025-09-15', '2025-09-15', '2025-09-16'], format: F5C4, finish: [6, 15], lineup: ['theo', 'sofia', 'ava', 'will', 'jonah'], scores: { theo: [72, 70, 73], sofia: [73, 75, 72], ava: [74, 72, 73], will: [71, 73, 74], jonah: [77, 74, 76] } },
  { id: 'e22', season: '2025-26', name: 'Holly Ridge Classic', short: 'Holly Ridge', course: 'hol', rounds: ['2025-10-06', '2025-10-07'], format: F5C4, finish: [9, 12], lineup: ['theo', 'sofia', 'ava', 'will', 'jonah'], scores: { theo: [72, 73], sofia: [74, 72], ava: [73, 75], will: [71, 74], jonah: [77, 74] } },
  { id: 'e23', season: '2025-26', name: 'Lakeside Invitational', short: 'Lakeside', course: 'lak', rounds: ['2026-03-02', '2026-03-03', '2026-03-04'], format: F5C4, finish: [5, 14], lineup: ['theo', 'sofia', 'ava', 'will', 'jonah'], scores: { theo: [71, 73, 72], sofia: [74, 72, 73], ava: [73, 74, 72], will: [72, 73, 74], jonah: [76, 75, 77] } },
  { id: 'e24', season: '2025-26', name: 'Conference Championship', short: 'Conference', course: 'dog', rounds: ['2026-04-19', '2026-04-20', '2026-04-21'], format: F5C4, finish: [4, 10], lineup: ['theo', 'sofia', 'ava', 'will', 'jonah'], scores: { theo: [70, 72, 71], sofia: [72, 71, 73], ava: [73, 72, 71], will: [71, 73, 72], jonah: [75, 74, 73] }, scorecardsOnly: true },
  // This season
  { id: 'e31', season: '2026-27', name: 'Sedgefield Invitational', short: 'Sedgefield', course: 'sed', rounds: ['2026-09-08', '2026-09-08', '2026-09-09'], format: F5C4, finish: [5, 12], lineup: ['theo', 'sofia', 'ava', 'eli', 'jonah'], ind: ['priya'], scores: { theo: [71, 72, 70], sofia: [72, 73, 74], ava: [74, 72, 73], eli: [73, 75, 72], jonah: [76, 74, 75], priya: [77, 76, 74] } },
  { id: 'e32', season: '2026-27', name: 'Dogwood Collegiate', short: 'Dogwood', course: 'dog', rounds: ['2026-09-21', '2026-09-22', '2026-09-23'], format: F6C5, finish: [4, 13], lineup: ['theo', 'sofia', 'ava', 'eli', 'jonah', 'priya'], scores: { theo: [71, 70, 72], sofia: [72, 73, 71], ava: [73, 72, 74], eli: [74, 73, 72], jonah: [75, 76, 73], priya: [76, 74, 75] } },
  {
    id: 'e33',
    season: '2026-27',
    name: 'Oakmont Fall Classic',
    short: 'Oakmont',
    course: 'oak',
    rounds: ['2026-10-05', '2026-10-06', '2026-10-07'],
    format: F5C4,
    finish: [3, 14],
    lineup: ['theo', 'sofia', 'ava', 'jonah', 'eli'],
    ind: ['priya'],
    // The spec's five-count-four table mapped to the roster (plan 16, rule 2).
    scores: { theo: [70, 73, 71], sofia: [72, 71, 74], ava: [74, 70, 72], jonah: [75, 76, 69], eli: [71, 72, 73], priya: [76, 74, 73] },
    // 11 of 15 team rounds with shot data.
    shot: { theo: [1, 1, 1], sofia: [1, 1, 0], ava: [1, 1, 1], jonah: [0, 1, 1], eli: [1, 0, 0], priya: [1, 1, 1] },
  },
  { id: 'e34', season: '2026-27', name: 'Pinehurst Intercollegiate', short: 'Pinehurst', course: 'pin', rounds: ['2026-10-20', '2026-10-21'], format: F5C4, lineup: [], note: 'Lineup from the Pinehurst qualifier · 4 of 5 set', start: 'two_tees' },
  { id: 'e35', season: '2026-27', name: 'Holly Ridge Classic', short: 'Holly Ridge', course: 'hol', rounds: ['2026-11-02', '2026-11-03'], format: F5C4, lineup: [], note: 'Qualifier opens Oct 24' },
];

/** Fixture-only: a round's lowest `counting` whole-round lineup scores count; a tie at the line counts the lower slot. */
function countRound(scores: Array<{ playerId: string; slot: number; total: number }>, format: TourFormat) {
  const sorted = [...scores].sort((a, b) => a.total - b.total || a.slot - b.slot);
  const counting = sorted.slice(0, format.counting);
  const dropped = sorted.slice(format.counting);
  const line = counting[counting.length - 1]?.total;
  const tied = line != null && dropped.some((d) => d.total === line) ? sorted.filter((s) => s.total === line).map((s) => s.playerId) : [];
  return { counting: counting.map((s) => s.playerId), dropped: dropped.map((s) => s.playerId), tied, total: sum(counting.map((s) => s.total)) };
}

const OPPONENTS = ['Harbor State', 'Pine Valley', 'Northfield', 'Coastal Tech', 'Ridgeway', 'Lakeshore', 'Summit', 'Eastbrook', 'Westmont', 'Bayside College', 'Granite Falls', 'Cedar Point', 'Riverbend', 'Highland', 'Fairhaven'];

/** Oakmont's field of 14 (us third), with one tie and one team outside our division. */
const OAKMONT_FIELD: Array<[string, number]> = [
  ['Harbor State', 851],
  ['Pine Valley', 855],
  ['Varsity', 858],
  ['Northfield', 861],
  ['Coastal Tech', 864],
  ['Ridgeway', 866],
  ['Lakeshore', 866],
  ['Summit', 869],
  ['Eastbrook', 872],
  ['Westmont', 875],
  ['Bayside College', 878],
  ['Granite Falls', 881],
  ['Cedar Point', 886],
  ['Riverbend', 893],
];

function splitTotal(total: number, rounds: number, k: number): number[] {
  const base = Math.floor(total / rounds);
  const out = Array.from({ length: rounds }, (_, i) => base + ((i + k) % 3) - 1);
  out[rounds - 1] = total - sum(out.slice(0, -1));
  return out;
}

function placeLabels(totals: number[]): string[] {
  return totals.map((t) => {
    const ahead = totals.filter((x) => x < t).length;
    const tied = totals.filter((x) => x === t).length > 1;
    return `${tied ? 'T' : ''}${ahead + 1}`;
  });
}

function buildField(def: EventDef, ourRounds: number[], par: number): ChTourField {
  const [place, size] = def.finish ?? [0, 0];
  const ours = sum(ourRounds);
  const r = rng(def.id.split('').reduce((h, c) => h * 31 + c.charCodeAt(0), 7));
  const rows: Array<[string, number]> =
    def.id === 'e33'
      ? OAKMONT_FIELD
      : Array.from({ length: size }, (_, i) => {
          const at = i + 1;
          if (at === place) return ['Varsity', ours] as [string, number];
          const offset = at < place ? -(place - at) * 3 - Math.floor(r() * 2) - 1 : (at - place) * 3 + Math.floor(r() * 2) + 1;
          return [OPPONENTS[(i + def.id.length + Number(def.id.slice(1))) % OPPONENTS.length] ?? 'Opponent', ours + offset] as [string, number];
        });
  const totals = rows.map(([, t]) => t);
  const places = placeLabels(totals);
  const teams: ChTourFieldTeam[] = rows.map(([name, total], i) => {
    const us = name === 'Varsity';
    const rounds = us ? ourRounds : splitTotal(total, ourRounds.length, i);
    return {
      id: `${def.id}-${us ? 'us' : name.toLowerCase().replace(/\s+/g, '-')}`,
      name,
      us,
      squad: 'A',
      sameDivision: name !== 'Bayside College',
      seed: null,
      rounds,
      total,
      toPar: total - par,
      place: places[i] ?? null,
      placeN: Number((places[i] ?? '0').replace('T', '')),
      thru: null,
      enteredAt: `${def.rounds[def.rounds.length - 1]}T19:30:00-04:00`,
      source: us ? 'card' : 'pasted',
    };
  });
  return { size, entered: size, teams, line: null, asOf: teams[0]?.enteredAt ?? null };
}

/** W-L-T from a finish, against teams in our division only (2.3, D-91). */
function recordOf(field: ChTourField): ChTourRecord {
  const us = field.teams.find((t) => t.us);
  const rec = { w: 0, l: 0, t: 0 };
  if (!us?.total) return rec;
  for (const o of field.teams) {
    if (o.us || !o.sameDivision || o.total == null) continue;
    if (o.total > us.total) rec.w += 1;
    else if (o.total < us.total) rec.l += 1;
    else rec.t += 1;
  }
  return rec;
}

function shotFlag(def: EventDef, playerId: string, i: number, r: () => number): boolean {
  if (def.scorecardsOnly) return false;
  const given = def.shot?.[playerId]?.[i];
  if (given != null) return given === 1;
  return r() > 0.15;
}

function buildEvent(def: EventDef, trust: ChTourTrust = 'official'): ChTourEvent {
  const c = COURSES[def.course]!;
  const rounds: ChTourRound[] = def.rounds.map((date, i) => ({
    roundEventId: `${def.id}-r${i + 1}`,
    eventId: def.id,
    number: i + 1,
    date,
    courseId: def.course,
    startType: def.start ?? 'tee_times',
    firstTeeAt: `${date}T08:10:00-04:00`,
    status: def.scores ? trust : 'upcoming',
    par: c.par,
    thirtySix: def.rounds.filter((d) => d === date).length > 1,
  }));
  const entries: ChTourEntry[] = [
    ...def.lineup.map((playerId, i) => ({ playerId, role: 'lineup' as const, slot: i + 1, squad: 'A' as const })),
    ...(def.ind ?? []).map((playerId) => ({ playerId, role: 'individual' as const, slot: null, squad: 'A' as const })),
  ];
  const playerRounds: ChTourPlayerRound[] = [];
  const teamRounds: ChTourTeamRound[] = [];
  const r = rng(def.id.length * 97 + Number(def.id.slice(1)));
  if (def.scores) {
    rounds.forEach((rd, i) => {
      const lineup = def.lineup.map((playerId, s) => ({ playerId, slot: s + 1, total: def.scores![playerId]![i]! }));
      const k = countRound(lineup, def.format);
      teamRounds.push({
        kind: 'complete',
        total: k.total,
        toPar: k.total - c.par * def.format.counting,
        counting: k.counting,
        dropped: k.dropped,
        tiedAtBoundary: k.tied,
        dqSwapPreview: null,
        roundNumber: rd.number,
        roundEventId: rd.roundEventId,
        par: c.par * def.format.counting,
      });
      for (const e of entries) {
        const total = def.scores![e.playerId]![i]!;
        const count = e.role === 'individual' ? 'individual' : k.tied.includes(e.playerId) && k.dropped.includes(e.playerId) ? 'tie' : k.counting.includes(e.playerId) ? 'counted' : 'dropped';
        playerRounds.push({
          eventId: def.id,
          roundEventId: rd.roundEventId,
          roundNumber: rd.number,
          playerId: e.playerId,
          role: e.role,
          slot: e.slot,
          squad: 'A',
          total,
          toPar: total - c.par,
          status: 'ok',
          source: 'card',
          trust,
          roundId: `${rd.roundEventId}-${e.playerId}`,
          holesKnown: true,
          shotData: shotFlag(def, e.playerId, i, r),
          officialTotal: null,
          count,
        });
      }
    });
  }
  const done = teamRounds.length > 0;
  const result: TeamEventResult | null = done
    ? {
        kind: 'complete',
        total: sum(teamRounds.map((t) => t.total ?? 0)),
        toPar: sum(teamRounds.map((t) => t.toPar ?? 0)),
        rounds: teamRounds,
        droppedTotal: sum(playerRounds.filter((p) => p.count === 'dropped' || p.count === 'tie').map((p) => p.total ?? 0)),
      }
    : null;
  const field = done && def.finish ? buildField(def, teamRounds.map((t) => t.total ?? 0), c.par * def.format.counting * rounds.length) : null;
  const team = playerRounds.filter((p) => p.role !== 'individual');
  return {
    id: def.id,
    seasonId: def.season,
    name: def.name,
    short: def.short,
    host: null,
    startDate: def.rounds[0]!,
    endDate: def.rounds[def.rounds.length - 1]!,
    courseIds: [def.course],
    format: def.format,
    kind: def.id === 'e24' ? 'conference' : 'regular',
    tiebreak: def.id === 'e24' ? 'ncaa' : 'ties_stand',
    status: done ? 'complete' : 'upcoming',
    trust: done ? trust : 'upcoming',
    mood: done ? 'result' : 'prep',
    rounds,
    entries,
    playerRounds,
    team: { rounds: teamRounds, result },
    field,
    finish: def.finish && done ? { place: String(def.finish[0]), placeN: def.finish[0], of: def.finish[1] } : null,
    record: field ? recordOf(field) : null,
    coverage: { scorecards: team.length, withShots: team.filter((p) => p.shotData).length },
    resultsUrl: done ? `https://results.example.org/${def.id}` : null,
    lineup: done
      ? { status: 'locked', locksAt: `${def.rounds[0]}T07:50:00-04:00`, publishAt: null, publishedAt: `${def.rounds[0]}T07:00:00-04:00`, seen: { by: 7, of: 7 }, set: def.format.players, of: def.format.players }
      : def.id === 'e34'
        ? { status: 'draft', locksAt: '2026-10-20T07:50:00-04:00', publishAt: null, publishedAt: null, seen: null, set: 4, of: 5 }
        : { status: 'none', locksAt: null, publishAt: null, publishedAt: null, seen: null, set: 0, of: 5 },
    note: def.note ?? null,
    legacy: false,
  };
}

// ── The comparison pool: every round the comparison can draw on ─────────────────────────────────────────────────

const QUALIFIER_DATES = ['2025-09-02', '2025-09-04', '2025-09-26', '2025-09-29', '2026-02-18', '2026-02-20', '2026-04-08', '2026-04-10', '2026-08-26', '2026-08-28', '2026-09-15', '2026-09-16', '2026-09-30', '2026-10-01', '2026-10-13', '2026-10-14'];
const CTX_SHIFT = {
  qualifier: { theo: -0.1, sofia: 0.1, ava: 0.2, jonah: 0.1, eli: 0.2, priya: 0.2, will: 0.1 } as Record<string, number>,
  practice: { theo: -0.6, sofia: -0.4, ava: -0.3, jonah: -0.8, eli: -0.4, priya: -0.3, will: -0.4 } as Record<string, number>,
};
const activeOn = (id: string, date: string) => (id === 'will' ? date < '2026-06-30' : id === 'priya' ? date >= '2026-08-01' : true);

function poolRound(
  r: () => number,
  args: { id: string; playerId: string; date: string; context: ChTourCompareRound['context']; courseId: string; score: number; nine?: boolean; shot?: boolean; event?: { id: string; round: number; individual: boolean; counting: ChTourCompareRound['counting'] } },
): ChTourCompareRound {
  const c = COURSES[args.courseId]!;
  const holes = args.nine ? 9 : 18;
  const par = args.nine ? Math.round(c.par / 2) : c.par;
  const rating = c.rating == null ? null : args.nine ? c.rating / 2 : c.rating;
  const perf = rating == null ? 0 : ((args.score - rating) / holes) * 18;
  const p = DEF[args.playerId]!;
  const gir = Math.max(3, Math.min(holes, Math.round(holes * (0.64 - perf * 0.035) + (r() - 0.5) * 2)));
  const fwOf = args.nine ? 7 : 14;
  const fw = Math.max(2, Math.min(fwOf, Math.round(fwOf * (0.62 - perf * 0.02) + (r() - 0.5) * 2)));
  const putts = Math.round(holes * 1.66 + perf * 0.25 + (r() - 0.5) * 3);
  const scrOf = holes - gir;
  const shot = args.shot ?? r() > (args.context === 'practice' ? 0.35 : 0.15);
  return {
    id: args.id,
    playerId: args.playerId,
    date: args.date,
    context: args.context,
    eventId: args.event?.id ?? null,
    roundEventId: args.event ? `${args.event.id}-r${args.event.round}` : null,
    roundNumber: args.event?.round ?? null,
    courseId: args.courseId,
    holes,
    totalOnly: false,
    score: args.score,
    par,
    toPar: args.score - par,
    vsRating: rating == null ? null : round1(((args.score - rating) / holes) * 18),
    vsField: null,
    counting: args.event?.counting ?? null,
    individual: args.event?.individual ?? false,
    sg:
      shot && !args.nine
        ? { ott: round1(p.sg[0] + (r() - 0.5) * 0.9), app: round1(p.sg[1] + (r() - 0.5) * 1.1), arg: round1(p.sg[2] + (r() - 0.5) * 0.7), putt: round1(p.sg[3] + (r() - 0.5) * 1.0) }
        : null,
    stats: {
      gir,
      fw,
      fwOf,
      putts,
      threePutts: Math.max(0, Math.round((putts - holes * 1.6) / 2.2 + (r() - 0.3))),
      scrMade: Math.max(0, Math.min(scrOf, Math.round(scrOf * (0.55 - perf * 0.02 + p.sg[2] * 0.05) + (r() - 0.5)))),
      scrOf,
      birdiesPlus: Math.max(0, Math.round(holes * (0.16 - perf * 0.012) + (r() - 0.5) * 1.5)),
      doublesPlus: Math.max(0, Math.round(holes * (0.05 + perf * 0.008) + (r() - 0.5) * 1.2)),
      penalties: Math.max(0, Math.round((args.context === 'event' && args.playerId === 'jonah' ? 1.0 : args.context === 'practice' ? 0.3 : 0.6) * (holes / 18) + (r() - 0.5) * 1.4)),
      proximityFt: shot ? Math.round(33 + perf * 1.4 + (r() - 0.5) * 6) : null,
    },
    trust: args.context === 'practice' ? 'practice' : 'official',
  };
}

function buildPool(events: ChTourEvent[]): ChTourCompareRound[] {
  const r = rng(26);
  const out: ChTourCompareRound[] = [];
  for (const e of events) {
    if (e.status !== 'complete') continue;
    const fieldAvg = e.field ? mean(e.field.teams.filter((t) => !t.us && t.total != null).map((t) => (t.total ?? 0) / (e.rounds.length * e.format.counting))) : null;
    for (const pr of e.playerRounds) {
      const tr = e.team.rounds.find((t) => t.roundNumber === pr.roundNumber);
      const lineupSize = e.format.players;
      const drop = tr ? Math.min(...e.playerRounds.filter((x) => x.roundNumber === pr.roundNumber && tr.dropped.includes(x.playerId)).map((x) => x.total ?? 0)) : null;
      const row = poolRound(r, {
        id: pr.roundId ?? `entered:${pr.roundEventId}:${pr.playerId}`,
        playerId: pr.playerId,
        date: e.rounds[pr.roundNumber - 1]!.date,
        context: 'event',
        courseId: e.courseIds[0]!,
        score: pr.total ?? 0,
        shot: pr.shotData,
        event: {
          id: e.id,
          round: pr.roundNumber,
          individual: pr.role === 'individual',
          counting: pr.role === 'individual' ? null : { counted: pr.count === 'counted', tie: pr.count === 'tie' || !!tr?.tiedAtBoundary.includes(pr.playerId), drop: Number.isFinite(drop) ? drop : null, lineupSize },
        },
      });
      out.push({ ...row, vsField: fieldAvg == null ? null : round1((pr.total ?? 0) - fieldAvg), trust: e.trust === 'upcoming' ? 'official' : e.trust });
    }
  }
  QUALIFIER_DATES.forEach((date, i) => {
    const courseId = i % 3 === 0 ? 'home' : i % 3 === 1 ? 'hol' : 'dog';
    for (const p of PLAYER_DEFS) {
      if (!activeOn(p.id, date)) continue;
      const score = Math.round(p.base + (CTX_SHIFT.qualifier[p.id] ?? 0) + ((COURSES[courseId]!.rating ?? 73) - 73) + (r() - 0.5) * 4.5);
      out.push(poolRound(r, { id: `q-${p.id}-${date}`, playerId: p.id, date, context: 'qualifier', courseId, score }));
    }
  });
  let i = 0;
  for (let t = Date.parse('2025-08-20T12:00:00Z'); t <= Date.parse('2026-10-12T12:00:00Z'); t += 86_400_000 * 9, i += 1) {
    const date = new Date(t).toISOString().slice(0, 10);
    const month = Number(date.slice(5, 7));
    if (month === 6 || month === 7 || month === 12) continue;
    PLAYER_DEFS.forEach((p, j) => {
      if ((i + j) % 3 === 0 || !activeOn(p.id, date)) return;
      const nine = (i + j) % 7 === 0;
      const s = p.base + (CTX_SHIFT.practice[p.id] ?? 0) + ((COURSES.home!.rating ?? 73) - 73) + (r() - 0.5) * 4;
      out.push(poolRound(r, { id: `p-${p.id}-${date}`, playerId: p.id, date, context: 'practice', courseId: 'home', score: Math.round(nine ? s / 2 : s), nine }));
    });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

// ── Hole by hole (Oakmont), summing to each round's score ───────────────────────────────────────────────────────

function holesFor(seed: string, score: number, pars: number[]): number[] {
  const r = rng(seed.split('').reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7));
  const out = pars.map(() => 0);
  let diff = score - sum(pars);
  const order = pars.map((_, i) => i).sort((a, b) => ((a * 7919 + Math.floor(r() * 1000)) % 97) - ((b * 7919 + Math.floor(r() * 1000)) % 97));
  for (let k = 0; diff !== 0 && k < 400; k += 1) {
    const i = order[k % pars.length]!;
    if (diff > 0 && out[i]! < 2) {
      out[i]! += 1;
      diff -= 1;
    } else if (diff < 0 && out[i]! > -1) {
      out[i]! -= 1;
      diff += 1;
    }
  }
  return pars.map((p, i) => p + out[i]!);
}

function holeLedger(e: ChTourEvent): ChTourHoleLedger {
  const c = COURSES[e.courseIds[0]!]!;
  const pars = c.holes.map((h) => h.par);
  return {
    courseId: c.id,
    pars,
    handicaps: c.holes.map((h) => h.handicap),
    cards: e.playerRounds.map((pr) => {
      const strokes = holesFor(`${pr.roundEventId}-${pr.playerId}`, pr.total ?? 0, pars);
      return {
        playerId: pr.playerId,
        roundNumber: pr.roundNumber,
        roundEventId: pr.roundEventId,
        startHole: pr.slot != null && pr.slot > 3 ? 10 : 1,
        holes: strokes.map((s, i) => ({ n: i + 1, par: pars[i]!, strokes: s, source: 'card' as const, disputed: false })),
      };
    }),
    totalsOnly: [],
  };
}

// ── Derived views of the fixture (fixture-only arithmetic) ──────────────────────────────────────────────────────

const pct = (rec: ChTourRecord) => (rec.w + rec.l + rec.t ? (rec.w + rec.t / 2) / (rec.w + rec.l + rec.t) : null);
const addRec = (a: ChTourRecord, b: ChTourRecord): ChTourRecord => ({ w: a.w + b.w, l: a.l + b.l, t: a.t + b.t });

function seasonPath(events: ChTourEvent[], fieldSize: number | null, nextId: string | null): ChTourSeasonPath {
  const mine = events.filter((e) => e.seasonId === '2026-27');
  const done = mine.filter((e) => e.status === 'complete');
  const record = done.reduce((acc, e) => addRec(acc, e.record ?? { w: 0, l: 0, t: 0 }), { w: 0, l: 0, t: 0 });
  const dates = new Set(done.flatMap((e) => e.rounds.map((r) => r.date)));
  return {
    division: 'd1',
    gender: 'mens',
    tracked: true,
    record,
    pct: pct(record),
    finishLine:
      fieldSize && nextId
        ? {
            eventId: nextId,
            fieldSize,
            places: Array.from({ length: fieldSize }, (_, i) => {
              const after = addRec(record, { w: fieldSize - (i + 1), l: i, t: 0 });
              const p = pct(after) ?? 0;
              return { place: i + 1, record: after, pct: Math.round(p * 1000) / 1000, keeps: p >= 0.5 };
            }),
          }
        : null,
    checkpoints: [
      { label: 'Regular season', met: null },
      { label: '+ Conference stroke play', met: null },
      { label: '+ Conference match play', met: null },
    ],
    rounds: { played: sum(done.map((e) => e.rounds.length)), scheduled: sum(mine.filter((e) => e.status !== 'complete').map((e) => e.rounds.length)), target: 15 },
    dates: { used: dates.size, of: 24 },
    ranking: SEASONS[0]!.ranking,
    notCounted: [],
    resultsDue: null,
  };
}

function ladder(events: ChTourEvent[], pool: ChTourCompareRound[]): ChTourCountLadderRow[] {
  const season = events.filter((e) => e.seasonId === '2026-27' && e.status === 'complete');
  const rows = ROSTER.map((id) => {
    const lineupRounds = season.flatMap((e) => e.playerRounds.filter((p) => p.playerId === id && p.role === 'lineup'));
    const counted = lineupRounds.filter((p) => p.count === 'counted').length;
    const played = lineupRounds.length;
    const form = pool
      .filter((r) => r.playerId === id && r.holes === 18 && r.context !== 'practice' && r.date <= TOUR_NOW.slice(0, 10))
      .slice(-5)
      .map((r) => ({ roundId: r.id, date: r.date, toPar: r.toPar, counted: r.counting ? r.counting.counted : null }));
    return { playerId: id, counted, played, rate: played ? counted / played : null, early: played < 4, form, commitment: id === 'priya' ? 'In qualifier' : null };
  });
  return rows.sort((a, b) => (b.rate ?? -1) - (a.rate ?? -1));
}

function heatmap(events: ChTourEvent[]): ChTourHeatmap {
  const done = events.filter((e) => e.status === 'complete');
  const cells: ChTourHeatmap['cells'] = {};
  for (const e of done) {
    const team = e.playerRounds.filter((p) => p.role !== 'individual');
    const teamAvg = mean(team.map((p) => p.toPar ?? 0)) ?? 0;
    for (const id of new Set(e.playerRounds.map((p) => p.playerId))) {
      const mine = e.playerRounds.filter((p) => p.playerId === id);
      const avg = mean(mine.map((p) => p.toPar ?? 0));
      cells[`${id}:${e.id}`] = { toPar: avg == null ? null : round1(avg), vsTeam: avg == null ? null : round1(avg - teamAvg), counted: mine.filter((p) => p.count === 'counted').length, played: mine.length };
    }
  }
  return { playerIds: PLAYERS.map((p) => p.id), eventIds: done.map((e) => e.id), cells };
}

// ── e33: findings, story, review (the design's words) ───────────────────────────────────────────────────────────

const OAKMONT_FINDINGS: ChTourFinding[] = [
  {
    id: 'f-r3',
    chip: 'Round 3 · 285',
    title: 'Jonah had the highest total but the team’s best final round.',
    body: 'His 69 counted after two dropped rounds. Without it Sofia’s 74 counts and the team finishes 5 strokes worse.',
    tone: 'gain',
    round: 3,
    link: { tab: 'holes', label: 'See round 3 holes' },
    evidence: null,
  },
  {
    id: 'f-pen',
    chip: 'Penalties',
    title: 'Penalty strokes are the clearest cost to review.',
    body: 'All 15 team scorecards recorded penalties by hole, so this holds even where shot data is missing.',
    tone: 'loss',
    round: null,
    link: { tab: 'review', label: 'Open the review' },
    evidence: null,
  },
  {
    id: 'f-cov',
    chip: '4 rounds without shot data',
    title: 'Strokes gained covers 11 of 15 team rounds.',
    body: 'Official scores are complete. SG figures on this event use the 11 rounds with shot data only.',
    tone: 'neutral',
    round: null,
    link: { tab: 'compare', label: 'Compare with coverage shown' },
    evidence: null,
  },
];

function oakmontReview(pool: ChTourCompareRound[]): ChTourReview {
  const team = pool.filter((r) => r.eventId === 'e33' && !r.individual);
  const penalties = sum(team.map((r) => r.stats.penalties));
  const jonah = team.filter((r) => r.playerId === 'jonah').sort((a, b) => (a.roundNumber ?? 0) - (b.roundNumber ?? 0));
  return {
    open: true,
    layers: [
      {
        id: 'l-jonah',
        observation: 'Jonah’s 69 in the final round was the team’s best score of the event and counted, after two rounds that did not.',
        evidence: 'R1 75 and R2 76, both dropped · R3 69 counted · 2 of 3 rounds with shot data',
        hypothesis: `Penalty strokes went ${jonah.map((r) => r.stats.penalties).join(', then ')} across the three rounds. Worth asking what changed in his strategy before assuming it will repeat.`,
      },
      {
        id: 'l-pen',
        observation: `The team took ${penalties} penalty strokes across ${team.length} team rounds, recorded hole by hole.`,
        evidence: 'All 15 team scorecards · penalties recorded per hole',
        hypothesis: 'All three holes have water short of the green. A club-down rule on those approaches is one option to discuss.',
      },
      {
        id: 'l-sofia',
        observation: 'Sofia’s R3 74 was her highest round and didn’t count. The data can’t say why.',
        evidence: 'R3 scorecard only · no shot data for that round',
        hypothesis: 'Unknown. Ask Sofia for her reflection before drawing a conclusion.',
      },
    ],
    leak: [
      { key: 'par3', label: 'Par 3 scoring', delta: 0.2, se: 0.11, better: 'lower', unit: 'strokes' },
      { key: 'par4', label: 'Par 4 scoring', delta: -0.1, se: 0.07, better: 'lower', unit: 'strokes' },
      { key: 'par5', label: 'Par 5 scoring', delta: -0.3, se: 0.1, better: 'lower', unit: 'strokes' },
      { key: 'bogey', label: 'Bogey avoidance', delta: 3, se: 4, better: 'higher', unit: 'pts' },
      { key: 'birdie', label: 'Birdies per round', delta: 0.4, se: 0.3, better: 'higher', unit: 'strokes' },
      { key: 'close', label: 'Closing nine', delta: -0.6, se: 0.5, better: 'lower', unit: 'strokes' },
    ],
    players: ['theo', 'sofia', 'ava', 'jonah', 'eli', 'priya'].map((playerId) => ({
      playerId,
      vsSeason: playerId === 'jonah' ? 1.4 : playerId === 'theo' ? -0.6 : 0.3,
      vsSeasonSe: 0.9,
      costlyHoles: [
        { n: 13, toPar: 2 },
        { n: 7, toPar: 1 },
      ],
      reflection: playerId === 'jonah' ? { text: 'Stopped aiming at flags on the par 3s on day two. Felt calmer.', at: '2026-10-08T09:10:00-04:00' } : playerId === 'theo' ? { text: 'Putter felt good. Left a few short on fast greens in R2.', at: '2026-10-08T08:40:00-04:00' } : null,
      fields: { shot: '', decision: '', focus: '' },
      shared: { shot: false, decision: false, focus: false },
    })),
    notes: [
      { id: 'n1', author: 'Maya Reyes', kind: 'coach', text: 'Course played firm. We under-clubbed into 13 all week.' },
      { id: 'n2', author: 'Jonah Okafor', kind: 'reflection', text: 'Stopped aiming at flags on the par 3s on day two. Felt calmer.' },
      { id: 'n3', author: 'Theo Marchetti', kind: 'reflection', text: 'Putter felt good. Left a few short on fast greens in R2.' },
    ],
    missingReflections: ['sofia', 'eli'],
    savedAt: '2026-10-09T16:20:00-04:00',
  };
}

const PINEHURST_TRIP: ChTourTrip = {
  stops: [
    { at: '2026-10-19T13:00:00-04:00', kind: 'depart', label: 'Depart', detail: 'Practice facility', changedFrom: null },
    { at: '2026-10-19T17:30:00-04:00', kind: 'hotel', label: 'Pine Needles Lodge', detail: 'Room with Eli', changedFrom: null },
    { at: '2026-10-19T15:00:00-04:00', kind: 'practice', label: 'Practice round', detail: 'Pinehurst No. 2', changedFrom: null },
    { at: '2026-10-20T08:10:00-04:00', kind: 'round', label: 'Round 1', detail: 'Hole 10', changedFrom: null },
    { at: '2026-10-21T08:30:00-04:00', kind: 'round', label: 'Round 2', detail: 'Hole 1', changedFrom: '2026-10-21T08:10:00-04:00' },
    { at: '2026-10-21T17:00:00-04:00', kind: 'return', label: 'Return', detail: 'Practice facility', changedFrom: null },
  ].sort((a, b) => a.at.localeCompare(b.at)) as ChTourTrip['stops'],
  wear: 'Fri: navy polo, khaki. Sat: white polo, navy.',
  packing: ['Rain gear', 'Yardage book', 'Two dozen balls', 'Team polos'],
};

// ── The live round (e34, round 1) ──────────────────────────────────────────────────────────────────────────────

/** Played holes as to-par per hole, in play order from the start hole. */
const LIVE_PLAY: Array<{ playerId: string; slot: number | null; role: 'lineup' | 'individual'; startHole: number; toPars: number[] }> = [
  { playerId: 'theo', slot: 1, role: 'lineup', startHole: 1, toPars: [0, 0, -1, 0, 0, 0, -1, 0, 0, 1, 0, -1, -1, 0] },
  { playerId: 'sofia', slot: 2, role: 'lineup', startHole: 1, toPars: [0, 1, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0, 0] },
  { playerId: 'ava', slot: 3, role: 'lineup', startHole: 1, toPars: [0, 0, 0, 1, 0, -1, 0, 0, 0, 0, 0, 0] },
  { playerId: 'jonah', slot: 4, role: 'lineup', startHole: 10, toPars: [1, 0, 0, -1, 0, 1, 0, 0, 0, 0, 0, 0] },
  { playerId: 'eli', slot: 5, role: 'lineup', startHole: 10, toPars: [0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0] },
  { playerId: 'priya', slot: null, role: 'individual', startHole: 10, toPars: [1, 0, 1, 0, 0, 1, 0, 0, 1, 0] },
];

function liveSnapshot(e34: ChTourEvent): ChTourLiveSnapshot {
  const c = COURSES.pin!;
  const pars = c.holes.map((h) => h.par);
  const round: ChTourRound = { ...e34.rounds[0]!, status: 'live', firstTeeAt: '2026-10-20T08:10:00-04:00' };
  const lanes: ChTourLivePlayer[] = LIVE_PLAY.map((lp) => {
    const played = new Map(lp.toPars.map((tp, k) => [((lp.startHole - 1 + k) % 18) + 1, tp]));
    const toPar = sum(lp.toPars);
    return {
      playerId: lp.playerId,
      slot: lp.slot,
      role: lp.role,
      teeAt: lp.startHole === 1 ? '2026-10-20T08:10:00-04:00' : '2026-10-20T08:20:00-04:00',
      startHole: lp.startHole,
      holes: pars.map((par, i) => {
        const tp = played.get(i + 1);
        const disputed = lp.playerId === 'sofia' && i + 1 === 7;
        const pending = lp.playerId === 'jonah' && i + 1 === 3;
        return { n: i + 1, par, strokes: tp == null ? null : par + tp, source: lp.playerId === 'ava' ? ('coach' as const) : ('card' as const), disputed, pending };
      }),
      thru: lp.toPars.length,
      toPar,
      status: 'ok',
      card: 'none',
      count: lp.role === 'individual' ? 'individual' : lp.playerId === 'eli' ? 'dropped' : 'counted',
      lastPostAt: '2026-10-20T13:31:00-04:00',
      projection: lp.role === 'individual' ? null : { total: 72 + toPar + (lp.playerId === 'theo' ? -1 : 0), lo: 72 + toPar - 2, hi: 72 + toPar + 2, countOdds: null },
    };
  });
  const teams: ChTourFieldTeam[] = [
    ['Harbor State', -4],
    ['Pine Valley', -2],
    ['Northfield', -1],
    ['Varsity', -1],
    ['Summit', 1],
    ['Coastal Tech', 2],
    ['Eastbrook', 3],
    ['Granite Falls', 4],
    ['Ridgeway', 6],
  ].map(([name, toPar], i, all) => {
    const tps = all.map(([, t]) => t as number);
    const ahead = tps.filter((t) => t < (toPar as number)).length;
    const tied = tps.filter((t) => t === toPar).length > 1;
    return {
      id: `e34-${String(name).toLowerCase().replace(/\s+/g, '-')}`,
      name: name as string,
      us: name === 'Varsity',
      squad: 'A',
      sameDivision: true,
      seed: null,
      rounds: [null, null],
      total: null,
      toPar: toPar as number,
      place: `${tied ? 'T' : ''}${ahead + 1}`,
      placeN: ahead + 1,
      thru: 12 + (i % 3),
      enteredAt: '2026-10-20T13:28:00-04:00',
      source: name === 'Varsity' ? 'card' : 'coach',
    } satisfies ChTourFieldTeam;
  });
  return {
    now: TOUR_NOW_LIVE,
    seq: 214,
    event: {
      ...e34,
      status: 'live',
      trust: 'live',
      mood: 'live',
      rounds: [round, e34.rounds[1]!],
      entries: LIVE_PLAY.map((lp) => ({ playerId: lp.playerId, role: lp.role, slot: lp.slot, squad: 'A' as const })),
      lineup: { ...e34.lineup, status: 'locked', set: 5, seen: { by: 9, of: 9 }, publishedAt: '2026-10-16T18:00:00-04:00' },
      note: null,
    },
    round,
    players: PLAYERS,
    course: c,
    lanes,
    team: { kind: 'live', total: null, toPar: -1, counting: ['theo', 'ava', 'sofia', 'jonah'], dropped: ['eli'], tiedAtBoundary: [], dqSwapPreview: null, short: 0 },
    field: { size: 15, entered: 9, teams, line: null, asOf: '2026-10-20T13:28:00-04:00' },
    presence: [
      { coachId: 'coach-maya', name: 'Maya Reyes', withPlayerId: 'ava' },
      { coachId: 'coach-dan', name: 'Dan Ellis', withPlayerId: 'jonah' },
    ],
    appScoring: 'record_only',
    moments: [
      { id: 'm1', at: '2026-10-20T13:31:00-04:00', kind: 'now_counting', playerId: 'jonah', text: 'Jonah is now counting. Team −1, T3.' },
      { id: 'm2', at: '2026-10-20T13:31:00-04:00', kind: 'dropped', playerId: 'eli', text: 'Eli is 1 behind Jonah for the last count.' },
      { id: 'm3', at: '2026-10-20T13:12:00-04:00', kind: 'birdie_run', playerId: 'theo', text: 'Theo birdied 12 and 13.' },
      { id: 'm4', at: '2026-10-20T12:58:00-04:00', kind: 'dispute', playerId: 'sofia', text: 'Sofia’s 7th: card 5, coach 4. Check before she signs.' },
      { id: 'm5', at: '2026-10-20T12:40:00-04:00', kind: 'field', playerId: null, text: 'Field updated: 9 of 15 teams.' },
    ],
    projection: { toPar: -2, lo: -6, hi: 2 },
    errors: {},
  };
}

// ── Assembling a state ─────────────────────────────────────────────────────────────────────────────────────────

export interface ChTourFixture {
  state: ChTourPreviewState;
  load: ChTourLoad;
  home: ChTourHomeData;
  /** Every event's desk, by event id. */
  desks: Record<string, ChTourDeskData>;
  review: ChTourReviewData;
  history: ChTourHistoryData;
  links: ChTourLinksData;
  compare: ChTourCompareData;
  lineup: ChTourLineupData;
  form: { create: ChTourFormData; edit: ChTourFormData };
  live: ChTourLiveSnapshot;
  /** The player's view (Jonah), the list and each event they can open, by event id. */
  player: { list: ChTourPlayerData; events: Record<string, ChTourPlayerData> };
}

function events(state: ChTourPreviewState): ChTourEvent[] {
  if (state === 'empty') return [];
  let defs = EVENT_DEFS;
  // Thin: early in the season, Sedgefield is the only result so far.
  if (state === 'thin') defs = EVENT_DEFS.filter((d) => d.season !== '2026-27' || d.id === 'e31' || !d.scores);
  const out = defs.map((d) => buildEvent(d, state === 'provisional' && d.id === 'e33' ? 'final' : 'official'));
  if (state === 'provisional') {
    const e33 = out.find((e) => e.id === 'e33');
    const sofia = e33?.playerRounds.find((p) => p.playerId === 'sofia' && p.roundNumber === 3);
    // The imported leaderboard has Sofia at 73 in round 3; her card says 74 (the design's provisional scenario).
    if (sofia) sofia.officialTotal = 73;
  }
  if (state === 'live') {
    const e34 = out.find((e) => e.id === 'e34');
    if (e34) {
      e34.status = 'live';
      e34.trust = 'live';
      e34.mood = 'live';
      e34.rounds[0] = { ...e34.rounds[0]!, status: 'live' };
      e34.lineup = { ...e34.lineup, status: 'locked', set: 5, seen: { by: 9, of: 9 }, publishedAt: '2026-10-16T18:00:00-04:00' };
      e34.entries = LIVE_PLAY.map((lp) => ({ playerId: lp.playerId, role: lp.role, slot: lp.slot, squad: 'A' }));
      e34.note = null;
    }
  }
  return out;
}

function emptyDesk(now: string, e: ChTourEvent): ChTourDeskData {
  return { now, event: e, players: PLAYERS, courses: COURSES, holes: null, findings: [], story: null, review: null, travel: null, adviceGivers: [], previous: null, errors: {} };
}

/** The upcoming Pinehurst event, kept even in the empty state so the desk, lineup and live views have an event. */
function pinehurst(all: ChTourEvent[]): ChTourEvent {
  return all.find((e) => e.id === 'e34') ?? buildEvent(EVENT_DEFS.find((d) => d.id === 'e34')!);
}

export function tourFixture(state: ChTourPreviewState): ChTourFixture {
  const load: ChTourLoad = state === 'loading' ? 'loading' : state === 'failed' ? 'failed' : 'ready';
  const live = state === 'live';
  const now = live ? TOUR_NOW_LIVE : TOUR_NOW;
  const all = events(state);
  const pool = buildPool(all);
  const thisSeason = all.filter((e) => e.seasonId === '2026-27');
  const complete = all.filter((e) => e.status === 'complete');
  const e34 = pinehurst(all);
  const partial = state === 'partial';
  const empty = state === 'empty';

  const home: ChTourHomeData = {
    now,
    team: TEAM,
    season: SEASONS[0]!,
    seasons: SEASONS,
    players: PLAYERS,
    courses: COURSES,
    events: all,
    next: empty
      ? null
      : {
          eventId: 'e34',
          readiness: [
            { key: 'lineup', done: live, label: live ? 'Lineup published' : 'Lineup isn’t set · locks Tue 7:50 AM', due: '2026-10-20T07:50:00-04:00' },
            { key: 'travel', done: true, label: 'Travel posted', due: '2026-10-19T13:00:00-04:00' },
            { key: 'tees', done: live, label: live ? 'Tee times entered' : 'Tee times aren’t entered', due: '2026-10-19T18:00:00-04:00' },
            { key: 'course', done: true, label: 'Course set', due: null },
          ],
          ticks: [
            { at: '2026-10-16T18:00:00-04:00', kind: 'reveal', label: 'Reveal', done: live },
            { at: '2026-10-19T13:00:00-04:00', kind: 'travel', label: 'Depart', done: live },
            { at: '2026-10-19T15:00:00-04:00', kind: 'practice', label: 'Practice round', done: live },
            { at: '2026-10-20T07:50:00-04:00', kind: 'lock', label: 'Lineup locks', done: live },
            { at: '2026-10-20T08:10:00-04:00', kind: 'round', label: 'Round 1', done: false },
            { at: '2026-10-21T08:10:00-04:00', kind: 'round', label: 'Round 2', done: false },
          ],
          alsoThisWeek: [],
          action: live ? 'follow' : 'build',
        },
    path: empty ? { ...seasonPath([], null, null), record: { w: 0, l: 0, t: 0 }, pct: null } : seasonPath(all, 15, 'e34'),
    ladder: empty ? [] : ladder(all, pool),
    heatmap: heatmap(all),
    links: empty ? null : { candidates: 3, high: 1 },
    errors: partial ? { path: true, heatmap: true } : {},
  };

  const desks: Record<string, ChTourDeskData> = {};
  for (const e of [...all, ...(all.some((x) => x.id === 'e34') ? [] : [e34])]) {
    const d = emptyDesk(now, e);
    if (e.id === 'e33') {
      d.holes = partial ? null : holeLedger(e);
      d.findings = OAKMONT_FINDINGS;
      d.story = { splits: [{ label: '1–6', toPar: 1 }, { label: '7–12', toPar: 2 }, { label: '13–18', toPar: -9 }], bounceBack: { made: 9, of: 21 }, birdieStreak: { playerId: 'jonah', length: 3, round: 3 }, swingHole: { n: 13, toPar: 6 } };
      d.review = oakmontReview(pool);
      d.adviceGivers = ['Maya Reyes', 'Dan Ellis'];
      d.previous = null;
      d.errors = partial ? { holes: true, field: true } : {};
      if (partial) d.event = { ...e, field: null };
    }
    if (e.id === 'e34') {
      d.travel = PINEHURST_TRIP;
      d.adviceGivers = ['Maya Reyes', 'Dan Ellis'];
      d.previous = null;
    }
    if (e.id === 'e35') d.previous = { eventId: 'e22', name: 'Holly Ridge Classic 2025' };
    desks[e.id] = d;
  }

  const oak = desks.e33;
  const review: ChTourReviewData = oak
    ? { now, event: oak.event, players: PLAYERS, review: oak.review, findings: oak.findings, errors: partial ? { review: true } : {} }
    : { now, event: e34, players: PLAYERS, review: null, findings: [], errors: {} };

  const rating = (e: ChTourEvent) => COURSES[e.courseIds[0]!]?.rating ?? 72;
  const trend = complete.map((e) => {
    const team = e.playerRounds.filter((p) => p.role !== 'individual');
    const matched = team.filter((p) => MATCHED.includes(p.playerId));
    const r = rating(e);
    const fieldOthers = e.field?.teams.filter((t) => !t.us && t.total != null) ?? [];
    const fieldPer = fieldOthers.length ? mean(fieldOthers.map((t) => (t.total ?? 0) / (e.rounds.length * e.format.counting))) : null;
    const ours = e.team.result?.total != null ? e.team.result.total / (e.rounds.length * e.format.counting) : null;
    return {
      eventId: e.id,
      actual: round1(mean(team.map((p) => (p.total ?? 0) - r)) ?? 0),
      matched: matched.length ? round1(mean(matched.map((p) => (p.total ?? 0) - r)) ?? 0) : null,
      vsField: fieldPer != null && ours != null ? round1(ours - fieldPer) : null,
      rounds: team.length,
      players: new Set(team.map((p) => p.playerId)).size,
      scorecardsOnly: e.coverage.withShots === 0,
    };
  });
  const seasonVals = trend.filter((t) => complete.find((e) => e.id === t.eventId)?.seasonId === '2026-27').map((t) => t.actual ?? 0).sort((a, b) => a - b);
  const opponents = new Map<string, { record: ChTourRecord; diff: number; events: Array<{ eventId: string; us: number | null; them: number | null }> }>();
  for (const e of complete.filter((x) => x.seasonId === '2026-27')) {
    const us = e.field?.teams.find((t) => t.us);
    for (const o of e.field?.teams ?? []) {
      if (o.us || !us?.total || o.total == null) continue;
      const cur = opponents.get(o.name) ?? { record: { w: 0, l: 0, t: 0 }, diff: 0, events: [] };
      cur.record = addRec(cur.record, o.total > us.total ? { w: 1, l: 0, t: 0 } : o.total < us.total ? { w: 0, l: 1, t: 0 } : { w: 0, l: 0, t: 1 });
      cur.diff += us.total - o.total;
      cur.events.push({ eventId: e.id, us: us.total, them: o.total });
      opponents.set(o.name, cur);
    }
  }
  const history: ChTourHistoryData = {
    now,
    seasons: SEASONS,
    players: PLAYERS,
    courses: COURSES,
    events: complete,
    trend,
    band: seasonVals.length >= 2 ? { lo: round1(((seasonVals[0] ?? 0) + (seasonVals[1] ?? 0)) / 2), hi: round1(((seasonVals[seasonVals.length - 2] ?? 0) + (seasonVals[seasonVals.length - 1] ?? 0)) / 2) } : null,
    matchedPlayers: MATCHED,
    headToHead: [...opponents].map(([team, v]) => ({ team, record: v.record, strokeDiff: v.diff, events: v.events })).sort((a, b) => b.events.length - a.events.length || a.team.localeCompare(b.team)),
    splits: [
      { key: 'day', label: 'Holes per day', groups: [{ label: '18-hole days', mean: 0.9, n: 33, se: 0.4 }, { label: '36-hole days', mean: 1.6, n: 20, se: 0.6 }] },
      { key: 'kind', label: 'Event type', groups: [{ label: 'Regular season', mean: 1.1, n: 68, se: 0.3 }, { label: 'Conference', mean: -0.4, n: 15, se: 0.6 }] },
      { key: 'start', label: 'Start', groups: [{ label: 'Tee times', mean: 1.0, n: 83, se: 0.3 }, { label: 'Shotgun', mean: null, n: 0, se: null }] },
    ],
    errors: partial ? { headToHead: true } : {},
  };
  if (empty) {
    history.headToHead = [];
    history.splits = [];
  }

  const links: ChTourLinksData = {
    now,
    players: PLAYERS,
    candidates: empty
      ? []
      : [
          { roundId: 'g-eli-0923', playerId: 'eli', date: '2026-09-23', courseName: 'Dogwood Lakes', score: 72, toPar: 0, suggestion: { eventId: 'e32', roundNumber: 3, confidence: 'high' } },
          { roundId: 'g-priya-1006', playerId: 'priya', date: '2026-10-06', courseName: null, score: 74, toPar: 2, suggestion: { eventId: 'e33', roundNumber: 2, confidence: 'medium' } },
          { roundId: 'g-theo-1008', playerId: 'theo', date: '2026-10-08', courseName: 'Oakmont CC', score: 70, toPar: -2, suggestion: { eventId: 'e33', roundNumber: 3, confidence: 'low' } },
        ],
    events: complete.map((e) => ({ id: e.id, name: e.name, rounds: e.rounds.map((r) => ({ number: r.number, date: r.date, courseName: COURSES[r.courseId]?.name ?? '' })) })),
    missing: empty ? [] : [{ eventId: 'e32', roundNumber: 3, playerId: 'eli' }],
    dismissed: empty ? 0 : 2,
    errors: partial ? { candidates: true } : {},
  };

  const compare: ChTourCompareData = {
    now,
    team: TEAM,
    seasons: SEASONS,
    players: PLAYERS,
    courses: COURSES,
    events: all,
    rounds: state === 'thin' ? pool.filter((r) => r.playerId !== 'jonah' || r.date < '2026-09-10') : pool,
    matchedPlayers: MATCHED,
    eventId: null,
    errors: partial ? { field: true } : {},
  };

  const QUAL: Record<string, { place: string; total: number; toPar: number }> = {
    theo: { place: '1', total: 143, toPar: -1 },
    sofia: { place: '2', total: 145, toPar: 1 },
    ava: { place: '3', total: 146, toPar: 2 },
    eli: { place: '4', total: 147, toPar: 3 },
    jonah: { place: '5', total: 148, toPar: 4 },
    priya: { place: '6', total: 151, toPar: 7 },
  };
  const CHANCE: Record<string, [ChTourCandidate['chance'], number]> = { theo: ['usually', 0.88], sofia: ['usually', 0.74], ava: ['often', 0.63], eli: ['often', 0.51], jonah: ['sometimes', 0.34], priya: ['sometimes', 0.22] };
  const lad = home.ladder;
  const lineup: ChTourLineupData = {
    now,
    event: e34,
    players: PLAYERS,
    candidates: empty
      ? []
      : ROSTER.map((id) => {
          const row = lad.find((l) => l.playerId === id);
          const rounds = pool.filter((r) => r.playerId === id && r.holes === 18 && r.context !== 'practice');
          const atCourse = pool.filter((r) => r.playerId === id && r.courseId === 'pin');
          const [chance, chancePct] = CHANCE[id] ?? [null, null];
          return {
            playerId: id,
            availability: 'available' as const,
            form: row?.form ?? [],
            qualifying: QUAL[id] ?? null,
            countRate: row?.rate ?? null,
            countRounds: row?.played ?? 0,
            chance: rounds.length >= 6 ? chance : null,
            chancePct: rounds.length >= 6 ? chancePct : null,
            eligibleRounds: rounds.length,
            course: { rounds: atCourse.length, avgToPar: atCourse.length ? round1(mean(atCourse.map((r) => r.toPar)) ?? 0) : null },
          };
        }),
    slots: [1, 2, 3, 4, 5].map((slot) => ({ slot, playerId: empty ? null : (['theo', 'sofia', 'ava', 'eli'][slot - 1] ?? null), reason: slot === 4 && !empty ? 'Qualified 4th; counted 2 of 3 at Oakmont.' : null, squad: 'A' as const })),
    alternate: null,
    individuals: [],
    projection: null,
    projectionShort: [],
    lineup: empty ? { ...e34.lineup, status: 'none', set: 0 } : e34.lineup,
    qualifier: empty ? null : { id: 'q-pinehurst', name: 'Pinehurst qualifier' },
    errors: partial ? { qualifier: true } : {},
  };

  const draft = (eventId: string | null): ChTourFormData['initial'] => {
    const e = eventId ? all.find((x) => x.id === eventId) : null;
    return {
      name: e?.name ?? '',
      host: '',
      startDate: e?.startDate ?? '',
      endDate: e?.endDate ?? '',
      resultsUrl: e?.resultsUrl ?? '',
      notes: '',
      format: e?.format ?? F5C4,
      kind: e?.kind ?? 'regular',
      tiebreak: e?.tiebreak ?? 'ties_stand',
      rounds: e ? e.rounds.map((r) => ({ date: r.date, courseId: r.courseId, startType: r.startType, firstTee: r.firstTeeAt })) : [{ date: '', courseId: null, startType: 'tee_times', firstTee: null }],
      fieldSize: e ? (e.field?.size ?? 15) : null,
      fieldTeams: [],
      line: null,
      adviceGivers: e ? ['coach-maya', 'coach-dan'] : [],
      qualifierId: e ? 'q-pinehurst' : null,
      itineraryId: e ? 'it-pinehurst' : null,
      version: e ? 3 : null,
    };
  };
  const formBase = {
    now,
    courses: Object.values(COURSES).map((c) => ({ id: c.id, name: c.name, tees: [c.tees] })),
    qualifiers: [
      { id: 'q-pinehurst', name: 'Pinehurst qualifier', status: 'closed' as const },
      { id: 'q-holly', name: 'Holly Ridge qualifier', status: 'open' as const },
    ],
    staff: [
      { id: 'coach-maya', name: 'Maya Reyes' },
      { id: 'coach-dan', name: 'Dan Ellis' },
    ],
    itineraries: [{ id: 'it-pinehurst', label: 'Pinehurst · Oct 19 to 21' }],
    fromCalendar: null,
    errors: partial ? { qualifiers: true as const } : {},
  };
  const form = {
    create: { ...formBase, mode: 'new' as const, eventId: null, initial: draft(null) },
    edit: { ...formBase, mode: 'edit' as const, eventId: 'e34', initial: draft('e34') },
  };

  const liveSnap = liveSnapshot(e34);
  if (partial) liveSnap.errors = { field: true };

  const jonah = PLAYERS.find((p) => p.id === 'jonah')!;
  const mineIn = (e: ChTourEvent) => {
    const rows = e.playerRounds.filter((p) => p.playerId === 'jonah');
    if (!rows.length) return null;
    return { place: null, total: sum(rows.map((p) => p.total ?? 0)), counted: rows.filter((p) => p.count === 'counted').length, of: rows.length };
  };
  const list = [...all]
    .filter((e) => e.seasonId === '2026-27')
    .sort((a, b) => (a.status === 'complete') === (b.status === 'complete') ? (a.status === 'complete' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)) : a.status === 'complete' ? 1 : -1)
    .map((e) => ({ eventId: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate, courseName: COURSES[e.courseIds[0]!]?.name ?? '', status: e.status, mine: e.status === 'complete' ? mineIn(e) : null }));
  const seasonRounds = pool.filter((r) => r.playerId === 'jonah' && r.date >= '2026-08-01');
  const per18 = (ctx: ChTourCompareRound['context']) => {
    const rs = seasonRounds.filter((r) => r.context === ctx && r.holes === 18);
    return { v: rs.length ? round1(mean(rs.map((r) => r.toPar)) ?? 0) : null, n: rs.length };
  };
  const jonahLineup = thisSeason.flatMap((e) => e.playerRounds.filter((p) => p.playerId === 'jonah' && p.role === 'lineup'));
  const playerBase: ChTourPlayerData = {
    now,
    me: jonah,
    team: TEAM,
    list,
    event: null,
    window: live ? { in: true, until: '2026-10-20T20:10:00-04:00', day: '2026-10-20' } : { in: false, until: null, day: null },
    season: {
      counted: jonahLineup.filter((p) => p.count === 'counted').length,
      of: jonahLineup.length,
      rounds: jonahLineup.length,
      roundsTarget: 15,
      perEighteen: { event: per18('event').v, qualifier: per18('qualifier').v, practice: per18('practice').v },
      n: { event: per18('event').n, qualifier: per18('qualifier').n, practice: per18('practice').n },
      early: jonahLineup.length < 4,
    },
    errors: partial ? { trip: true } : {},
  };
  const playerEvents: Record<string, ChTourPlayerData> = {};
  for (const e of [...thisSeason, ...(thisSeason.some((x) => x.id === 'e34') ? [] : [e34])]) {
    const entry = e.entries.find((x) => x.playerId === 'jonah');
    const revealed = e.lineup.status === 'locked' || e.lineup.status === 'published';
    playerEvents[e.id] = {
      ...playerBase,
      event: {
        event: e,
        reveal:
          revealed && entry
            ? {
                status: entry.role === 'lineup' ? 'lineup' : entry.role,
                slot: entry.slot,
                of: e.format.players,
                lineup: entry.role === 'lineup' ? e.entries.filter((x) => x.role === 'lineup').map((x) => PLAYERS.find((p) => p.id === x.playerId)?.name ?? '') : [],
                privateLine: null,
                qualifying: { outcome: 'placed', place: 5, toPar: 4 },
                next: null,
                postseason: false,
                firstView: false,
                changedFrom: null,
                lockedAt: e.lineup.locksAt,
              }
            : null,
        trip: e.id === 'e34' && !partial ? PINEHURST_TRIP : null,
        results: e.status === 'complete' ? { visible: true, reason: null } : live && e.id === 'e34' ? { visible: false, reason: 'in_window' } : { visible: false, reason: 'not_final' },
        sharedNotes: e.id === 'e33' ? [{ label: 'Next block focus', text: 'Par 3 club selection: middle of the green, every time.', author: 'Maya Reyes', updatedAt: '2026-10-09T16:20:00-04:00' }] : [],
        reflection: e.id === 'e33' ? { state: 'saved', went: 'Stopped aiming at flags on the par 3s on day two.', strokes: 'Two penalty strokes on 13 in round 1.', next: 'Commit to the safe side off the tee.', shot: '' } : null,
        moments: [],
        following: true,
      },
    };
  }

  return {
    state,
    load,
    home,
    desks,
    review,
    history,
    links,
    compare,
    lineup,
    form,
    live: liveSnap,
    player: { list: playerBase, events: playerEvents },
  };
}

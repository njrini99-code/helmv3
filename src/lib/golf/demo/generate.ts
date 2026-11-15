/**
 * The demo team generator (DD-01, DD-03, DD-06 to DD-11, DD-16 to DD-18).
 *
 * `generateDemoTeam` is a pure function of (seed, team, today, time zone,
 * coach): it returns every row the demo team should hold today, with stable
 * ids. Nothing here reads or writes a database; `writer.ts` diffs the result
 * against what the generator wrote before and applies the difference, for the
 * demo team only.
 *
 * Time model: the season is anchored to the academic year (see calendar.ts),
 * never to today. A round on a given day is simulated from its own seeded
 * stream, so it is identical on every run; a daily run only adds the rounds
 * that have newly been played and moves statuses forward (a qualifier goes
 * live, a tournament goes final). Rows that fall out of the window are
 * removed by the writer.
 */
import type { Json, TablesInsert } from '@/lib/types/database';
import { toSaveBody, type PlanBodyV2, type PlanBlock } from '@/lib/coachhelm/v3/practice-plan/model';
import {
  academicYearFor,
  addDays,
  buildSeasonPlan,
  dayLabel,
  daysBetween,
  instantAt,
  weekday,
  type AcademicYear,
  type PlannedQualifier,
  type PlannedTournament,
  type SeasonPlan,
} from './calendar';
import { Rng, stableUuid } from './rng';
import { daySkill, playRound, type SimRound } from './round-sim';
import {
  DEFAULT_SEED,
  DEMO_FIELD_TEAMS,
  DEMO_ROSTER,
  DEMO_US_FIELD_NAME,
  GENERATOR_VERSION,
  parOf,
  venue,
  type DemoPlayerStory,
  type Skill,
  type StoryKey,
} from './story';

export const DEMO_TABLES = [
  'golf_players',
  'golf_team_members',
  'golf_team_seasons',
  'golf_events',
  'golf_event_attendance',
  'golf_tournaments',
  'golf_tournament_rounds',
  'golf_tournament_entries',
  'golf_tournament_round_lineups',
  'golf_tournament_field_teams',
  'golf_tournament_field_scores',
  'golf_qualifiers',
  'golf_qualifier_round_courses',
  'golf_rounds',
  'golf_holes',
  'golf_shots',
  'golf_qualifier_entries',
  'golf_qualifier_selections',
  'golf_tournament_player_rounds',
  'golf_practice_plans',
  'golf_practice_plan_versions',
  'golf_tasks',
  'golf_task_assignments',
  'golf_announcements',
  'golf_travel_itineraries',
  'golf_messages',
] as const;

/** Every table the generator writes, in insert order (a parent before its children). Deletes run in reverse. */
export type DemoTable = (typeof DEMO_TABLES)[number];

/** The columns that identify a row of each table: its primary key. */
export const DEMO_TABLE_KEYS: Record<DemoTable, readonly string[]> = {
  golf_players: ['id'],
  golf_team_members: ['id'],
  golf_team_seasons: ['team_id', 'season'],
  golf_events: ['id'],
  golf_event_attendance: ['id'],
  golf_tournaments: ['id'],
  golf_tournament_rounds: ['round_event_id'],
  golf_tournament_entries: ['tournament_id', 'player_id'],
  golf_tournament_round_lineups: ['round_event_id', 'player_id'],
  golf_tournament_field_teams: ['id'],
  golf_tournament_field_scores: ['field_team_id', 'round_number'],
  golf_qualifiers: ['id'],
  golf_qualifier_round_courses: ['id'],
  golf_rounds: ['id'],
  golf_holes: ['id'],
  golf_shots: ['id'],
  golf_qualifier_entries: ['id'],
  golf_qualifier_selections: ['qualifier_id', 'player_id'],
  golf_tournament_player_rounds: ['round_event_id', 'player_id'],
  golf_practice_plans: ['id'],
  golf_practice_plan_versions: ['id'],
  golf_tasks: ['id'],
  golf_task_assignments: ['id'],
  golf_announcements: ['id'],
  golf_travel_itineraries: ['id'],
  golf_messages: ['id'],
};

export type DemoRow = Record<string, Json | undefined>;

export function rowKey(table: DemoTable, row: DemoRow): string {
  return DEMO_TABLE_KEYS[table].map((k) => String(row[k])).join('|');
}

export interface GenerateInput {
  teamId: string;
  /** Today in the team's zone, YYYY-MM-DD. */
  today: string;
  /** The team's IANA zone (golf_team_settings.timezone). */
  timeZone: string;
  /** The auth user id of the demo team's head coach: author of plans, tasks, announcements and messages. */
  coachUserId: string;
  /** The team channel conversation; without one no messages are generated. */
  teamChannelId?: string | null;
  seed?: string;
}

export interface DemoPlayerSummary {
  key: string;
  name: string;
  story: string;
  rounds: number;
  /** Completed qualifier and tournament rounds since 1 Aug (practice out). */
  seasonScoringRounds: number;
  withShots: number;
  first: string | null;
  last: string | null;
  /** Mean strokes to par over season scoring rounds. */
  seasonToPar: number | null;
  penaltiesPerRound: number | null;
  puttsPerRound: number | null;
}

export interface DemoDataset {
  version: number;
  seed: string;
  teamId: string;
  today: string;
  year: AcademicYear;
  tables: Record<DemoTable, DemoRow[]>;
  players: DemoPlayerSummary[];
  /** Notes for the summary: the live qualifier, the next tournament and its lineup. */
  highlights: string[];
}

interface PlayerRecord {
  story: DemoPlayerStory;
  id: string;
}

interface PlayedRound {
  id: string;
  player: PlayerRecord;
  date: string;
  type: 'practice' | 'qualifier' | 'tournament';
  venueKey: string;
  sim: SimRound;
  withShots: boolean;
  qualifierKey: string | null;
  qualifierRound: number | null;
  tournamentKey: string | null;
  tournamentRound: number | null;
  endsAt: string;
}

const LOOKBACK_DAYS = 120;
const LOOKAHEAD_DAYS = 100;
const WEATHER = ['Sunny, light wind', 'Overcast, calm', 'Breezy, 10 to 15 mph', 'Warm and humid', 'Cool morning, sunny afternoon', 'Gusty, 20 mph'] as const;

/** Story day offset → skill shift, phased in over the ramp. */
function shiftsAt(story: DemoPlayerStory, dayOffset: number): Partial<Skill> {
  const out: Partial<Skill> = {};
  for (const sh of story.shifts) {
    if (dayOffset < sh.fromDay) continue;
    const k = Math.min(1, (dayOffset - sh.fromDay + 1) / Math.max(1, sh.rampDays));
    for (const [name, delta] of Object.entries(sh.delta) as Array<[keyof Skill, number]>) {
      out[name] = (out[name] ?? 0) + delta * k;
    }
  }
  return out;
}

function onTeamInYear(story: DemoPlayerStory, plan: SeasonPlan, current: AcademicYear): boolean {
  if (plan.year.startYear === current.startYear) return true;
  // A previous season: freshmen and the transfer were not on the team yet.
  return story.classYear !== 'freshman' && story.key !== 'transfer';
}

function available(story: DemoPlayerStory, plan: SeasonPlan, date: string): boolean {
  const day = daysBetween(plan.year.anchor, date);
  if (day < story.joinedDay) return false;
  if (story.injuredFromDay !== null && day >= story.injuredFromDay && day < (story.injuredUntilDay ?? 10_000)) return false;
  return true;
}

/** Available, and allowed to be entered in a tournament on that day. */
function eligible(story: DemoPlayerStory, plan: SeasonPlan, date: string): boolean {
  return available(story, plan, date) && daysBetween(plan.year.anchor, date) >= story.eventEligibleDay;
}

/** Share of rounds logged shot by shot. */
const SHOT_DETAIL_SHARE = 0.7;
const GOLDEN = 0.6180339887498949;

function graduationYear(story: DemoPlayerStory, year: AcademicYear): number {
  const left = { senior: 1, junior: 2, sophomore: 3, freshman: 4 }[story.classYear];
  return year.startYear + left;
}

const HANDICAP: Record<string, number> = {
  steady_senior: -2.6,
  boom_or_bust: -0.4,
  improving_freshman: 3.1,
  slumping_senior: -1.8,
  bubble: 0.6,
  strong_putter: 0.2,
  transfer: -0.8,
  injured: -0.6,
  walk_on: 4.2,
};

/** Generate the demo team as it should look on `today`. */
export function generateDemoTeam(input: GenerateInput): DemoDataset {
  const seed = input.seed ?? DEFAULT_SEED;
  const { teamId, today, timeZone, coachUserId } = input;
  const id = (key: string) => stableUuid(seed, key);
  const at = (date: string, hhmm: string) => instantAt(date, hhmm, timeZone);
  const year = academicYearFor(today);
  const plans = [year.startYear - 1, year.startYear, year.startYear + 1].map((y) =>
    buildSeasonPlan({ startYear: y, anchor: `${y}-08-01`, label: `${y}-${String((y + 1) % 100).padStart(2, '0')}` }),
  );
  const current = plans[1]!;
  const roundFrom = [current.fall.from, addDays(today, -LOOKBACK_DAYS)].sort()[0]!;
  const eventFrom = addDays(today, -LOOKBACK_DAYS);
  const eventTo = addDays(today, LOOKAHEAD_DAYS);
  const inEventWindow = (d: string) => d >= eventFrom && d <= eventTo;

  const tables = Object.fromEntries(DEMO_TABLES.map((t) => [t, [] as DemoRow[]])) as Record<DemoTable, DemoRow[]>;
  const put = (table: DemoTable, row: DemoRow) => tables[table].push(row);

  // ---------------------------------------------------------------- roster
  const players: PlayerRecord[] = [];
  for (const story of DEMO_ROSTER) {
    const joined = addDays(year.anchor, story.joinedDay);
    if (story.joinedDay > 0 && joined > today) continue;
    const p: PlayerRecord = { story, id: id(`player:${story.key}`) };
    players.push(p);
    const entryAug = `${graduationYear(story, year) - 4}-08-15`;
    const joinedAt = story.joinedDay > 0 ? at(joined, '10:00') : at(entryAug, '10:00');
    const playerRow: TablesInsert<'golf_players'> = {
      id: p.id,
      first_name: story.firstName,
      last_name: story.lastName,
      hometown: story.hometown,
      state: story.state,
      graduation_year: graduationYear(story, year),
      handicap_index: HANDICAP[story.key] ?? null,
      onboarding_completed: true,
      profile_complete: true,
      is_test: false,
      user_id: null,
      email: null,
      created_at: joinedAt,
    };
    put('golf_players', playerRow);
    const member: TablesInsert<'golf_team_members'> = {
      id: id(`member:${story.key}`),
      team_id: teamId,
      player_id: p.id,
      status: 'active',
      jersey_number: story.jersey,
      joined_at: joinedAt,
      approved_at: joinedAt,
      created_at: joinedAt,
    };
    put('golf_team_members', member);
  }
  const byKey = new Map(players.map((p) => [p.story.key, p]));

  const season: TablesInsert<'golf_team_seasons'> = {
    team_id: teamId,
    season: year.label,
    division: 'd1',
    conference: 'Demo Conference',
    official_rank: null,
    official_rank_at: null,
  };
  put('golf_team_seasons', season);

  // ---------------------------------------------------------------- rounds
  const played: PlayedRound[] = [];
  // Shot detail follows a golden-ratio sequence per player and season, so
  // every player sits near the share instead of wherever chance lands; the
  // sequence only grows, so a past round never changes its mind.
  const detailCount = new Map<string, number>();
  const playRoundFor = (plan: SeasonPlan, p: PlayerRecord, date: string, type: PlayedRound['type'], venueKey: string, slot: string, extra: Partial<PlayedRound>, endsAt: string): PlayedRound => {
    const key = `round:${plan.year.startYear}:${p.story.key}:${date}:${slot}`;
    const rng = new Rng(seed, key);
    const shifted = shiftsAt(p.story, daysBetween(plan.year.anchor, date));
    const s = daySkill(rng, p.story.skill, shifted, p.story.key === 'boom_or_bust' ? 0.3 : 0);
    const sim = playRound(rng, venue(venueKey).holes, s);
    const dk = `${plan.year.startYear}:${p.story.key}`;
    const n = detailCount.get(dk) ?? 0;
    detailCount.set(dk, n + 1);
    const withShots = (new Rng(seed, `detail:${dk}`).next() + n * GOLDEN) % 1 < SHOT_DETAIL_SHARE;
    const r: PlayedRound = {
      id: id(key), player: p, date, type, venueKey, sim, withShots,
      qualifierKey: null, qualifierRound: null, tournamentKey: null, tournamentRound: null, endsAt, ...extra,
    };
    played.push(r);
    return r;
  };

  interface QualifierResult {
    plan: SeasonPlan;
    q: PlannedQualifier;
    /** player key → rounds in order */
    cards: Map<StoryKey, PlayedRound[]>;
    complete: boolean;
    started: boolean;
  }
  const qualifierResults = new Map<string, QualifierResult>();
  interface Lineup {
    lineup: PlayerRecord[];
    individuals: PlayerRecord[];
    alternate: PlayerRecord | null;
    /** The deciding qualifier is over, so the whole lineup is known. */
    decided: boolean;
  }
  const lineups = new Map<string, Lineup>();

  for (const plan of plans) {
    const roster = players.filter((p) => onTeamInYear(p.story, plan, year));
    const days = new Set<string>([...plan.practiceRoundDays, ...plan.qualifiers.flatMap((q) => q.days), ...plan.tournaments.flatMap((t) => t.days)]);
    const ordered = [...days].filter((d) => d < today).sort();
    const pastRoundsOf = (pk: string, before: string, types: PlayedRound['type'][]) =>
      played.filter((r) => r.player.story.key === pk && r.date < before && types.includes(r.type));

    for (const date of ordered) {
      // Practice rounds: most of the available players go out.
      if (plan.practiceRoundDays.includes(date)) {
        for (const p of roster) {
          if (!available(p.story, plan, date)) continue;
          if (!new Rng(seed, `practice-round:${plan.year.startYear}:${p.story.key}:${date}`).chance(0.65)) continue;
          playRoundFor(plan, p, date, 'practice', 'home', 'p', {}, at(date, '17:30'));
        }
      }
      // Qualifier rounds: everyone available plays.
      for (const q of plan.qualifiers) {
        q.days.forEach((d, i) => {
          if (d !== date) return;
          const res = qualifierResults.get(`${plan.year.startYear}:${q.key}`) ?? { plan, q, cards: new Map(), complete: false, started: true };
          qualifierResults.set(`${plan.year.startYear}:${q.key}`, res);
          for (const p of roster) {
            if (!available(p.story, plan, date)) continue;
            // An exempt player skips the qualifier for the spring opener.
            if (q.key === 'q-spring-opener' && exemptFor(plan, q).some((e) => e.story.key === p.story.key)) continue;
            const r = playRoundFor(plan, p, date, 'qualifier', q.venueKey, `q${i + 1}`, { qualifierKey: q.key, qualifierRound: i + 1 }, at(date, '13:00'));
            const card = res.cards.get(p.story.key) ?? [];
            card.push(r);
            res.cards.set(p.story.key, card);
          }
        });
      }
      // Tournament rounds: the entered players.
      for (const t of plan.tournaments) {
        t.days.forEach((d, i) => {
          if (d !== date) return;
          const lu = lineupFor(plan, t);
          for (const p of [...lu.lineup, ...lu.individuals]) {
            if (!eligible(p.story, plan, date)) continue;
            const end = at(date, i === 0 ? '13:00' : '18:00');
            playRoundFor(plan, p, date, 'tournament', t.venueKey, `t${i + 1}`, { tournamentKey: t.key, tournamentRound: i + 1 }, end);
          }
        });
      }
    }

    // ------------------------------------------------ lineup decisions
    function exemptFor(pl: SeasonPlan, q: PlannedQualifier): PlayerRecord[] {
      if (q.key !== 'q-spring-opener') return [];
      // The three best fall scoring averages among the regulars are exempt.
      const start = q.days[0]!;
      const ranked = roster
        .filter((p) => p.story.lineupRegular && available(p.story, pl, start))
        .map((p) => {
          const rs = pastRoundsOf(p.story.key, start, ['qualifier', 'tournament']).filter((r) => r.date >= pl.fall.from);
          const avg = rs.length ? rs.reduce((s, r) => s + r.sim.total - r.sim.par, 0) / rs.length : 99;
          return { p, avg };
        })
        .sort((a, b) => a.avg - b.avg || a.p.story.key.localeCompare(b.p.story.key));
      return ranked.slice(0, 3).map((x) => x.p);
    }

    function standings(res: QualifierResult): Array<{ p: PlayerRecord; total: number; last: number; n: number }> {
      return [...res.cards.entries()]
        .map(([k, rs]) => ({ p: byKey.get(k)!, total: rs.reduce((s, r) => s + r.sim.total - r.sim.par, 0), last: rs[rs.length - 1]!.sim.total, n: rs.length }))
        .sort((a, b) => b.n - a.n || a.total - b.total || a.last - b.last || a.p.story.key.localeCompare(b.p.story.key));
    }

    function lineupFor(pl: SeasonPlan, t: PlannedTournament): Lineup {
      const cacheKey = `${pl.year.startYear}:${t.key}`;
      const cached = lineups.get(cacheKey);
      if (cached) return cached;
      const start = t.days[0]!;
      const deciding = pl.qualifiers.find((q) => q.forTournamentKey === t.key)
        ?? [...pl.qualifiers].filter((q) => q.days[q.days.length - 1]! < start).sort((a, b) => (a.days[0]! < b.days[0]! ? 1 : -1))[0]
        ?? null;
      const res = deciding ? qualifierResults.get(`${pl.year.startYear}:${deciding.key}`) : undefined;
      const decided = !!deciding && deciding.days[deciding.days.length - 1]! < today && deciding.days[deciding.days.length - 1]! < start;
      let lineup: PlayerRecord[];
      if (t.springOpener && deciding) {
        const exempt = exemptFor(pl, deciding);
        const fromQ = decided && res ? standings(res).filter((s) => eligible(s.p.story, pl, start)).slice(0, deciding.spots).map((s) => s.p) : [];
        lineup = [...exempt, ...fromQ];
      } else {
        const regulars = roster.filter((p) => p.story.lineupRegular && eligible(p.story, pl, start));
        const need = 5 - regulars.length;
        const fromQ = decided && res
          ? standings(res).filter((s) => !s.p.story.lineupRegular && eligible(s.p.story, pl, start)).slice(0, need).map((s) => s.p)
          : [];
        lineup = [...regulars, ...fromQ];
      }
      const taken = new Set(lineup.map((p) => p.story.key));
      const rest = decided && res
        ? standings(res).filter((s) => !taken.has(s.p.story.key) && eligible(s.p.story, pl, start)).map((s) => s.p)
        : [];
      // Two individuals when the field allows it; the spring opener takes an alternate instead.
      const individuals = t.springOpener || t.eventKind === 'conference' ? [] : rest.slice(0, 2);
      const alternate = t.springOpener ? rest[0] ?? null : null;
      const out: Lineup = { lineup, individuals, alternate, decided };
      lineups.set(cacheKey, out);
      return out;
    }

    // Lineups for tournaments that have not started yet are still decided (for entries).
    for (const t of plan.tournaments) lineupFor(plan, t);
  }

  // ----------------------------------------------------- round rows
  const roundsInWindow = played.filter((r) => r.date >= roundFrom && r.date < today);
  const roundIdsInWindow = new Set(roundsInWindow.map((r) => r.id));
  for (const r of roundsInWindow) {
    const v = venue(r.venueKey);
    const plan = plans.find((pl) => pl.year.startYear === academicYearFor(r.date).startYear)!;
    const qId = r.qualifierKey ? id(`qualifier:${plan.year.startYear}:${r.qualifierKey}`) : null;
    const round: TablesInsert<'golf_rounds'> = {
      id: r.id,
      player_id: r.player.id,
      team_id: teamId,
      course_id: null,
      course_name: v.name,
      course_city: v.city,
      course_state: v.state,
      course_rating: v.rating,
      course_slope: v.slope,
      tees_played: v.tees,
      round_date: r.date,
      round_type: r.type,
      holes_played: 18,
      total_score: r.sim.total,
      front_nine: r.sim.front,
      back_nine: r.sim.back,
      score_to_par: r.sim.total - r.sim.par,
      status: 'completed',
      current_hole: 18,
      total_putts: r.sim.putts,
      total_fairways_hit: r.sim.fairwaysHit,
      total_fairways: r.sim.fairways,
      total_gir: r.sim.gir,
      total_gir_possible: 18,
      total_penalties: r.sim.penalties,
      weather_conditions: new Rng(seed, `${r.id}:weather`).pick(WEATHER),
      notes: null,
      qualifier_id: qId,
      qualifier_round_number: r.qualifierRound,
      is_test: false,
      created_at: r.endsAt,
      updated_at: r.endsAt,
    };
    put('golf_rounds', round);
    for (const h of r.sim.holes) {
      const holeId = id(`hole:${r.id}:${h.hole_number}`);
      const hole: TablesInsert<'golf_holes'> = {
        id: holeId,
        round_id: r.id,
        hole_number: h.hole_number,
        par: h.par,
        score: h.score,
        putts: h.putts,
        fairway_hit: h.fairway_hit,
        gir: h.gir,
        up_and_down: h.up_and_down,
        sand_save: h.sand_save,
        penalty_strokes: h.penalty_strokes,
        yardage: h.yardage,
        notes: null,
        created_at: r.endsAt,
      };
      put('golf_holes', hole);
      if (!r.withShots) continue;
      for (const s of h.shots) {
        const shot: TablesInsert<'golf_shots'> = {
          id: id(`shot:${r.id}:${h.hole_number}:${s.shot_number}`),
          round_id: r.id,
          hole_id: holeId,
          hole_number: h.hole_number,
          shot_number: s.shot_number,
          shot_type: s.shot_type,
          club_type: s.club_type,
          lie_before: s.lie_before,
          distance_to_hole_before: s.distance_to_hole_before,
          distance_unit_before: s.distance_unit_before,
          result: s.result,
          lie_after: s.lie_after,
          distance_to_hole_after: s.distance_to_hole_after,
          distance_unit_after: s.distance_unit_after,
          distance_unit: s.distance_unit_before,
          shot_distance: s.shot_distance,
          is_penalty: s.is_penalty,
          penalty_type: s.penalty_type,
          putt_made: s.putt_made,
          putt_distance_feet: s.putt_distance_feet,
          miss_direction: s.miss_direction,
          created_at: r.endsAt,
        };
        put('golf_shots', shot);
      }
    }
  }

  // -------------------------------------------------------------- events
  const memberIdsOn = (plan: SeasonPlan, date: string) =>
    players.filter((p) => onTeamInYear(p.story, plan, year) && daysBetween(plan.year.anchor, date) >= p.story.joinedDay);

  const addEvent = (plan: SeasonPlan, key: string, e: Omit<TablesInsert<'golf_events'>, 'id' | 'team_id'>, date: string, attendance: boolean) => {
    const eventId = id(`event:${plan.year.startYear}:${key}`);
    const createdAt = at(addDays(date, -14), '09:00');
    put('golf_events', { id: eventId, team_id: teamId, status: 'confirmed', created_by: coachUserId, created_at: createdAt, updated_at: createdAt, recurring: false, ...e });
    if (attendance) addAttendance(plan, eventId, date, String(e.start_time), String(e.event_type));
    return eventId;
  };

  const addAttendance = (plan: SeasonPlan, eventId: string, date: string, startIso: string, type: string) => {
    const past = date < today;
    const soon = !past && daysBetween(today, date) <= 14;
    if (!past && !soon) return;
    for (const p of memberIdsOn(plan, date)) {
      const rng = new Rng(seed, `attend:${eventId}:${p.story.key}`);
      const injured = !available(p.story, plan, date);
      const row: TablesInsert<'golf_event_attendance'> = {
        id: id(`attendance:${eventId}:${p.story.key}`),
        event_id: eventId,
        player_id: p.id,
        created_at: at(addDays(date, -7), '12:00'),
      };
      if (injured && type !== 'meeting') {
        Object.assign(row, { status: 'excused', notes: 'Injury: cleared by the trainer for meetings only', rsvp_at: at(addDays(date, -2), '18:00') });
      } else if (past) {
        const roll = rng.next();
        const outcome = roll < 0.9 ? 'present' : roll < 0.94 ? 'late' : roll < 0.97 ? 'excused' : 'no_show';
        if (outcome === 'excused') {
          Object.assign(row, { status: 'excused', notes: rng.pick(['Exam', 'Class lab', 'Doctor appointment']), rsvp_at: at(addDays(date, -1), '19:00') });
        } else {
          const minutesLate = outcome === 'late' ? rng.int(6, 20) : 0;
          Object.assign(row, {
            status: 'attending',
            attendance_status: outcome,
            checked_in: outcome !== 'no_show',
            checked_in_at: outcome === 'no_show' ? null : new Date(Date.parse(startIso) + (minutesLate - rng.int(0, 10)) * 60_000).toISOString(),
            rsvp_at: at(addDays(date, -2), '20:00'),
          });
        }
      } else {
        const roll = rng.next();
        const status = roll < 0.78 ? 'accepted' : roll < 0.95 ? 'pending' : 'declined';
        Object.assign(row, { status, rsvp_at: status === 'pending' ? null : at(addDays(today, -1), '20:00') });
      }
      put('golf_event_attendance', row);
    }
  };

  const home = venue('home');
  const homeLocation = `${home.name}, ${home.city}, ${home.state}`;
  for (const plan of plans) {
    for (const d of plan.practiceDays) {
      if (!inEventWindow(d)) continue;
      const isRound = plan.practiceRoundDays.includes(d);
      addEvent(plan, `practice:${d}`, {
        title: isRound ? 'Practice round' : 'Team practice',
        event_type: 'practice',
        start_time: at(d, isRound ? '13:00' : '14:30'),
        end_time: at(d, isRound ? '17:30' : '17:30'),
        all_day: false,
        location: homeLocation,
        requires_rsvp: true,
        description: isRound ? '18 holes, groups posted the night before.' : 'Range, short game area and putting green.',
      }, d, true);
    }
    for (const d of plan.meetingDays) {
      if (!inEventWindow(d)) continue;
      addEvent(plan, `meeting:${d}`, {
        title: 'Team meeting',
        event_type: 'meeting',
        start_time: at(d, '13:30'),
        end_time: at(d, '14:15'),
        all_day: false,
        location: 'Golf team room',
        requires_rsvp: false,
        description: 'Schedule, travel and results.',
      }, d, true);
    }
    for (const q of plan.qualifiers) {
      q.days.forEach((d, i) => {
        if (!inEventWindow(d)) return;
        addEvent(plan, `qualifier:${q.key}:${i + 1}`, {
          title: `${q.name} · Round ${i + 1}`,
          event_type: 'qualifier',
          start_time: at(d, '08:00'),
          end_time: at(d, '13:00'),
          all_day: false,
          location: homeLocation,
          requires_rsvp: false,
          description: `${q.spots === 1 ? 'One lineup spot' : `${q.spots} lineup spots`} for the ${plan.tournaments.find((t) => t.key === q.forTournamentKey)?.name ?? 'next event'}.`,
        }, d, true);
      });
    }
  }

  // ---------------------------------------------------------- qualifiers
  const qualifierRows = new Map<string, { id: string; status: string }>();
  for (const plan of plans) {
    for (const q of plan.qualifiers) {
      const first = q.days[0]!;
      const last = q.days[q.days.length - 1]!;
      if (!(last >= roundFrom && first <= eventTo)) continue;
      const qId = id(`qualifier:${plan.year.startYear}:${q.key}`);
      const status = last < today ? 'completed' : first < today ? 'in_progress' : 'upcoming';
      const t = plan.tournaments.find((x) => x.key === q.forTournamentKey)!;
      const v = venue(q.venueKey);
      const qRow: TablesInsert<'golf_qualifiers'> = {
        id: qId,
        team_id: teamId,
        name: q.name,
        description: `${q.days.length} rounds at ${v.name}. ${q.spots === 1 ? 'Low total takes the open lineup spot' : `Low ${q.spots} totals take the open lineup spots`} for the ${t.name}.`,
        status,
        start_date: first,
        end_date: last,
        entry_deadline: addDays(first, -2),
        course_name: v.name,
        rules: 'Stroke play, 18 holes a round. Ties go to the lower last round, then the round before.',
        num_rounds: q.days.length,
        selection_slots_total: q.spots,
        selection_slots_coach_pick: 0,
        selection_state: status === 'completed' ? 'selected' : status === 'in_progress' ? 'scoring' : 'open',
        spots_available: q.spots,
        target_tournament_id: id(`tournament:${plan.year.startYear}:${t.key}`),
        created_by: coachUserId,
        is_test: false,
        created_at: at(addDays(first, -10), '09:00'),
        updated_at: at(status === 'upcoming' ? addDays(first, -10) : addDays(last < today ? last : addDays(today, -1), 0), '18:00'),
      };
      put('golf_qualifiers', qRow);
      qualifierRows.set(`${plan.year.startYear}:${q.key}`, { id: qId, status });
      q.days.forEach((_, i) => {
        put('golf_qualifier_round_courses', {
          id: id(`qualifier-course:${qId}:${i + 1}`),
          qualifier_id: qId,
          round_number: i + 1,
          course_name: v.name,
          course_id: null,
          tee_id: null,
          created_at: at(addDays(first, -10), '09:00'),
        } satisfies TablesInsert<'golf_qualifier_round_courses'>);
      });

      // Entries: everyone eligible once the entry deadline passes.
      if (today < addDays(first, -2)) continue;
      const res = qualifierResults.get(`${plan.year.startYear}:${q.key}`);
      const cards = [...(res?.cards.entries() ?? [])].map(([k, rs]) => ({ p: byKey.get(k)!, rs: rs.filter((r) => r.date < today) }));
      const ranked = cards
        .filter((c) => c.rs.length > 0)
        .map((c) => ({ ...c, total: c.rs.reduce((s, r) => s + r.sim.total, 0), toPar: c.rs.reduce((s, r) => s + r.sim.total - r.sim.par, 0) }))
        .sort((a, b) => b.rs.length - a.rs.length || a.toPar - b.toPar || a.rs[a.rs.length - 1]!.sim.total - b.rs[b.rs.length - 1]!.sim.total);
      const entrants = new Set(ranked.map((c) => c.p.story.key));
      // Eligible players who have not posted yet (future rounds) still have an entry.
      for (const p of players) {
        if (!onTeamInYear(p.story, plan, year) || entrants.has(p.story.key)) continue;
        if (!available(p.story, plan, last) && !available(p.story, plan, first)) continue;
        if (q.key === 'q-spring-opener' && lineups.get(`${plan.year.startYear}:${q.forTournamentKey}`)?.lineup.slice(0, 3).some((e) => e.story.key === p.story.key)) continue;
        if (status === 'completed') continue;
        put('golf_qualifier_entries', {
          id: id(`qualifier-entry:${qId}:${p.story.key}`),
          qualifier_id: qId,
          player_id: p.id,
          status: 'entered',
          rounds_completed: 0,
          created_at: at(addDays(first, -3), '12:00'),
          updated_at: at(addDays(first, -3), '12:00'),
        } satisfies TablesInsert<'golf_qualifier_entries'>);
      }
      let pos = 0;
      ranked.forEach((c, i) => {
        const prev = ranked[i - 1];
        const tied = !!prev && prev.toPar === c.toPar && prev.rs.length === c.rs.length;
        if (!tied) pos = i + 1;
        const lastRound = c.rs[c.rs.length - 1]!;
        put('golf_qualifier_entries', {
          id: id(`qualifier-entry:${qId}:${c.p.story.key}`),
          qualifier_id: qId,
          player_id: c.p.id,
          status: status === 'completed' ? 'completed' : 'entered',
          rounds_completed: c.rs.length,
          total_score: c.total,
          total_to_par: c.toPar,
          score: lastRound.sim.total,
          round_id: lastRound.id,
          position: pos,
          is_tied: tied || (ranked[i + 1]?.toPar === c.toPar && ranked[i + 1]?.rs.length === c.rs.length),
          created_at: at(addDays(first, -3), '12:00'),
          updated_at: lastRound.endsAt,
        } satisfies TablesInsert<'golf_qualifier_entries'>);
      });
      if (status === 'completed') {
        const eligibleTop = ranked.filter((c) => {
          const lu = lineups.get(`${plan.year.startYear}:${q.forTournamentKey}`);
          return lu ? lu.lineup.some((p) => p.story.key === c.p.story.key) && !c.p.story.lineupRegular : false;
        });
        const springPicks = q.key === 'q-spring-opener' ? ranked.slice(0, q.spots) : eligibleTop.slice(0, q.spots);
        for (const c of springPicks) {
          put('golf_qualifier_selections', {
            qualifier_id: qId,
            player_id: c.p.id,
            selection_type: 'top_score',
            selected_at: at(addDays(last, 1), '09:00'),
            selected_by_user_id: coachUserId,
            coach_reasoning: null,
          } satisfies TablesInsert<'golf_qualifier_selections'>);
        }
      }
    }
  }

  // --------------------------------------------------------- tournaments
  const highlights: string[] = [];
  for (const plan of plans) {
    for (const t of plan.tournaments) {
      const first = t.days[0]!;
      const last = t.days[t.days.length - 1]!;
      // A tournament shows once it is within the look-ahead, or once the qualifier for it does.
      const shown = first <= eventTo || plan.qualifiers.some((q) => q.forTournamentKey === t.key && q.days[0]! <= eventTo);
      if (!(last >= roundFrom && shown)) continue;
      const tId = id(`tournament:${plan.year.startYear}:${t.key}`);
      const v = venue(t.venueKey);
      const lu = lineups.get(`${plan.year.startYear}:${t.key}`)!;
      const started = first < today;
      const finished = last < today;
      const firstTee = at(first, t.teeTimes[0]!);
      const publishOn = addDays(first, -4);
      const published = lu.decided && lu.lineup.length >= 5 && (today > publishOn || started);
      const tournament: TablesInsert<'golf_tournaments'> = {
        id: tId,
        team_id: teamId,
        name: t.name,
        start_date: first,
        end_date: last,
        course_id: null,
        format: '5c4',
        players_per_team: 5,
        counting: 4,
        holes_per_round: 18,
        rounds_count: t.days.length,
        event_kind: t.eventKind,
        tiebreak: 'ncaa',
        field_size: t.eventKind === 'conference' ? 10 : 12,
        substitutions: false,
        lock_minutes: 10,
        lineup_locked_at: started ? new Date(Date.parse(firstTee) - 10 * 60_000).toISOString() : null,
        lineup_published_at: published ? at(publishOn, '16:00') : null,
        official_at: finished ? at(addDays(last, 1), '12:00') : null,
        host: t.eventKind === 'conference' ? t.host : v.name,
        created_by: coachUserId,
        created_at: at(addDays(first, -60), '09:00'),
        updated_at: at(finished ? addDays(last, 1) : addDays(first, -60), '12:00'),
        version: 1,
      };
      put('golf_tournaments', tournament);

      // Round events and rounds.
      const roundEventIds: string[] = [];
      t.days.forEach((d, i) => {
        const tee = at(d, t.teeTimes[i]!);
        const eventId = id(`event:${plan.year.startYear}:tournament:${t.key}:${i + 1}`);
        roundEventIds.push(eventId);
        put('golf_events', {
          id: eventId,
          team_id: teamId,
          title: `${t.name} · Round ${i + 1}`,
          event_type: 'tournament',
          start_time: tee,
          end_time: new Date(Date.parse(tee) + 5 * 3_600_000).toISOString(),
          all_day: false,
          location: `${v.name}, ${v.city}, ${v.state}`,
          status: 'confirmed',
          requires_rsvp: false,
          recurring: false,
          created_by: coachUserId,
          created_at: at(addDays(first, -60), '09:00'),
          updated_at: at(addDays(first, -60), '09:00'),
        } satisfies TablesInsert<'golf_events'>);
        put('golf_tournament_rounds', {
          round_event_id: eventId,
          tournament_id: tId,
          team_id: teamId,
          round_number: i + 1,
          course_id: null,
          course_label: v.name,
          start_type: 'tee_times',
          first_tee_at: tee,
          status: d < today ? 'final' : 'upcoming',
          status_changed_at: d < today ? at(d, '18:30') : at(addDays(first, -60), '09:00'),
          event_adopted: false,
        } satisfies TablesInsert<'golf_tournament_rounds'>);
      });

      // Entries and round lineups, once the lineup is known.
      const entered: Array<{ p: PlayerRecord; role: 'lineup' | 'individual' | 'alternate'; slot: number | null }> = [];
      // The spring opener's exempt players are entered once its qualifier
      // starts; every other event shows its known lineup three weeks out.
      const deciding = plan.qualifiers.find((q) => q.forTournamentKey === t.key);
      const showEntries = started || (t.springOpener ? !!deciding && deciding.days[0]! < today : today >= addDays(first, -21));
      if (showEntries) {
        lu.lineup.forEach((p, i) => entered.push({ p, role: 'lineup', slot: i + 1 }));
        if (lu.decided) {
          lu.individuals.forEach((p) => entered.push({ p, role: 'individual', slot: null }));
          if (lu.alternate) entered.push({ p: lu.alternate, role: 'alternate', slot: null });
        }
      }
      for (const e of entered) {
        put('golf_tournament_entries', {
          tournament_id: tId,
          player_id: e.p.id,
          team_id: teamId,
          role: e.role,
          slot: e.slot,
          created_at: at(addDays(first, -5), '16:00'),
          updated_at: at(addDays(first, -5), '16:00'),
        } satisfies TablesInsert<'golf_tournament_entries'>);
        if (e.role === 'alternate') continue;
        roundEventIds.forEach((eventId) => {
          put('golf_tournament_round_lineups', {
            round_event_id: eventId,
            player_id: e.p.id,
            team_id: teamId,
            role: e.role,
            slot: e.slot,
          } satisfies TablesInsert<'golf_tournament_round_lineups'>);
        });
      }

      // Scores: our rounds link to the player's golf round.
      const ourTotals: number[] = [];
      t.days.forEach((d, i) => {
        if (d >= today) return;
        const counting: number[] = [];
        for (const e of entered) {
          if (e.role === 'alternate') continue;
          const r = played.find((x) => x.tournamentKey === t.key && x.tournamentRound === i + 1 && x.player.id === e.p.id && academicYearFor(x.date).startYear === plan.year.startYear);
          if (!r) continue;
          if (e.role === 'lineup') counting.push(r.sim.total);
          put('golf_tournament_player_rounds', {
            round_event_id: roundEventIds[i]!,
            player_id: e.p.id,
            team_id: teamId,
            round_id: roundIdsInWindow.has(r.id) ? r.id : null,
            entered_total: roundIdsInWindow.has(r.id) ? null : r.sim.total,
            status: 'ok',
            link_source: 'coach',
            updated_by: coachUserId,
            updated_at: r.endsAt,
          } satisfies TablesInsert<'golf_tournament_player_rounds'>);
        }
        counting.sort((a, b) => a - b);
        ourTotals.push(counting.slice(0, 4).reduce((s, x) => s + x, 0));
      });

      // The field: invented schools, scores around a college field's level.
      const others = [...DEMO_FIELD_TEAMS].sort((a, b) => (new Rng(seed, `${t.key}:${a}`).next() < new Rng(seed, `${t.key}:${b}`).next() ? -1 : 1)).slice(0, (t.eventKind === 'conference' ? 10 : 12) - 1);
      const par4 = parOf(v) * 4;
      const field = [
        { name: DEMO_US_FIELD_NAME, us: true, totals: ourTotals },
        ...others.map((name) => {
          const strength = new Rng(seed, `strength:${t.key}:${name}`).normal(5, 7);
          return {
            name,
            us: false,
            totals: t.days.map((d, i) => (d < today ? Math.round(par4 + strength + new Rng(seed, `score:${t.key}:${name}:${i}`).normal(0, 6)) : null)).filter((x): x is number => x !== null),
          };
        }),
      ];
      const sums = field.map((f) => f.totals.reduce((s, x) => s + x, 0));
      field.forEach((f, i) => {
        const ftId = id(`field-team:${tId}:${f.name}`);
        const place = finished ? 1 + sums.filter((s) => s < sums[i]!).length : null;
        const tiedPlace = finished ? sums.filter((s) => s === sums[i]!).length > 1 : false;
        put('golf_tournament_field_teams', {
          id: ftId,
          team_id: teamId,
          tournament_id: tId,
          name: f.name,
          is_us: f.us,
          is_b_team: false,
          same_division: true,
          seed: null,
          final_place: place,
          final_place_tied: tiedPlace,
          final_total: finished ? sums[i]! : null,
        } satisfies TablesInsert<'golf_tournament_field_teams'>);
        f.totals.forEach((total, r) => {
          if (total <= 0) return;
          put('golf_tournament_field_scores', {
            field_team_id: ftId,
            team_id: teamId,
            round_number: r + 1,
            total,
            thru: 18,
            entered_at: at(t.days[r]!, '19:00'),
          } satisfies TablesInsert<'golf_tournament_field_scores'>);
        });
      });

      if (!started && first <= eventTo && highlights.filter((h) => h.startsWith('Next tournament')).length === 0) {
        const names = entered.filter((e) => e.role === 'lineup').map((e) => `${e.p.story.firstName} ${e.p.story.lastName}`);
        highlights.push(`Next tournament: ${t.name}, ${dayLabel(first)}${names.length ? `; lineup ${names.length} of 5 set: ${names.join(', ')}` : '; lineup not set'}.`);
      }

      // Travel for away events: a travel day and an itinerary.
      if (inEventWindow(addDays(first, -1))) {
        const travelDay = addDays(first, -1);
        const travelEventId = id(`event:${plan.year.startYear}:travel:${t.key}`);
        put('golf_events', {
          id: travelEventId,
          team_id: teamId,
          title: `Travel to ${t.name}`,
          event_type: 'travel',
          start_time: at(travelDay, '11:00'),
          end_time: at(travelDay, '17:00'),
          all_day: false,
          location: `${v.city}, ${v.state}`,
          status: 'confirmed',
          requires_rsvp: false,
          recurring: false,
          description: 'Vans leave from the athletics center. Practice round on arrival.',
          created_by: coachUserId,
          created_at: at(addDays(first, -21), '09:00'),
          updated_at: at(addDays(first, -21), '09:00'),
        } satisfies TablesInsert<'golf_events'>);
        const travellers = entered.filter((e) => e.role !== 'alternate').map((e) => e.p);
        const rooms: Json = travellers.reduce<Array<{ room: string; players: string[] }>>((acc, p, i) => {
          if (i % 2 === 0) acc.push({ room: String(201 + acc.length), players: [p.id] });
          else acc[acc.length - 1]!.players.push(p.id);
          return acc;
        }, []);
        put('golf_travel_itineraries', {
          id: id(`travel:${plan.year.startYear}:${t.key}`),
          team_id: teamId,
          event_id: travelEventId,
          event_name: t.name,
          destination: `${v.city}, ${v.state}`,
          departure_date: travelDay,
          departure_time: '11:00',
          departure_location: 'Athletics center, west lot',
          return_date: last,
          return_time: '19:00',
          transportation_type: 'van',
          hotel_name: `Lakeside Inn ${v.city}`,
          hotel_address: `100 Lakeside Drive, ${v.city}, ${v.state}`,
          hotel_phone: null,
          hotel_confirmation: null,
          room_assignments: travellers.length ? rooms : null,
          gear_list: ['Rain gear', 'Team polos (3)', 'Yardage book', 'Range balls are provided'],
          uniform_requirements: 'Round 1 navy, round 2 white, round 3 grey.',
          notes: null,
          is_test: false,
          created_by: coachUserId,
          created_at: at(addDays(first, -21), '09:00'),
          updated_at: at(addDays(first, -21), '09:00'),
        } satisfies TablesInsert<'golf_travel_itineraries'>);
      }
    }
  }

  // ------------------------------------------------- live qualifier note
  for (const [k, q] of qualifierRows) {
    if (q.status !== 'in_progress') continue;
    const res = qualifierResults.get(k);
    const name = res?.q.name ?? k;
    highlights.push(`Live qualifier: ${name}, ${res ? res.q.days.filter((d) => d < today).length : 0} of ${res?.q.days.length ?? 0} rounds played.`);
  }

  // ------------------------------------------------------- practice plans
  const practiceEvents = tables.golf_events.filter((e) => e.event_type === 'practice' && e.title === 'Team practice');
  for (const e of practiceEvents) {
    const local = localDate(String(e.start_time), timeZone);
    const offset = daysBetween(today, local);
    // Plans for the last four weeks of sessions and the next two; the coach
    // publishes two days ahead, so the sessions after that are still drafts.
    if (offset < -28 || offset > 14) continue;
    const planId = id(`plan:${String(e.id)}`);
    const focus = new Rng(seed, `plan-focus:${planId}`).pick(PLAN_FOCI);
    const plan = plans.find((pl) => pl.year.startYear === academicYearFor(local).startYear)!;
    const roster = memberIdsOn(plan, local).filter((p) => available(p.story, plan, local)).map((p) => p.id);
    const body = planBody(planId, focus, roster);
    const isDraft = offset > 1;
    const publishedAt = at(addDays(local, -2), '17:00');
    const createdAt = at(addDays(local, -3), '10:00');
    put('golf_practice_plans', {
      id: planId,
      team_id: teamId,
      kind: 'event',
      event_id: String(e.id),
      title: focus.title,
      status: isDraft ? 'draft' : 'published',
      step: isDraft ? 'drills' : 'review',
      active_variant: 'main',
      body: toSaveBody(body) as Json,
      // Publishing bumps the draft's version, as golf_practice_plan_publish does.
      version: isDraft ? 1 : 2,
      edited_after_publish: false,
      published_version: isDraft ? null : 1,
      published_at: isDraft ? null : publishedAt,
      first_published_at: isDraft ? null : publishedAt,
      completed_at: null,
      created_by: coachUserId,
      updated_by: coachUserId,
      created_at: createdAt,
      updated_at: isDraft ? createdAt : publishedAt,
    } satisfies TablesInsert<'golf_practice_plans'>);
    if (!isDraft) {
      put('golf_practice_plan_versions', {
        id: id(`plan-version:${planId}:1`),
        plan_id: planId,
        team_id: teamId,
        kind: 'event',
        event_id: String(e.id),
        version: 1,
        title: focus.title,
        body: publicBody(body, focus.title, e),
        changes: [],
        notified: true,
        is_live: true,
        published_by: coachUserId,
        published_at: publishedAt,
      } satisfies TablesInsert<'golf_practice_plan_versions'>);
    }
  }

  // ------------------------------------------- tasks and announcements
  for (const plan of plans) {
    for (const t of plan.tournaments) {
      const first = t.days[0]!;
      const due = addDays(first, -6);
      if (!inEventWindow(due) || daysBetween(today, due) > 30) continue;
      const taskId = id(`task:${plan.year.startYear}:${t.key}:travel-form`);
      const created = addDays(due, -10);
      if (created > today) continue;
      const lu = lineups.get(`${plan.year.startYear}:${t.key}`)!;
      const travellers = lu.decided ? [...lu.lineup, ...lu.individuals] : players.filter((p) => eligible(p.story, plan, first));
      const done = due < today;
      put('golf_tasks', {
        id: taskId,
        team_id: teamId,
        title: `Travel form: ${t.name}`,
        description: `Confirm travel, dietary needs and class conflicts for ${dayLabel(addDays(first, -1))} to ${dayLabel(t.days[t.days.length - 1]!)}.`,
        due_date: due,
        priority: 'medium',
        status: done ? 'completed' : 'pending',
        category: 'travel',
        task_type: 'form',
        assigned_by: coachUserId,
        is_test: false,
        completed_at: done ? at(due, '20:00') : null,
        created_at: at(created, '09:00'),
        updated_at: at(done ? due : created, '20:00'),
      } satisfies TablesInsert<'golf_tasks'>);
      for (const p of travellers) {
        const finished = done || new Rng(seed, `task-done:${taskId}:${p.story.key}`).chance(0.5);
        put('golf_task_assignments', {
          id: id(`task-assignment:${taskId}:${p.story.key}`),
          task_id: taskId,
          player_id: p.id,
          status: finished ? 'completed' : 'pending',
          completed_at: finished ? at(done ? addDays(due, -1) : addDays(today, -1), '21:00') : null,
          assigned_at: at(created, '09:00'),
          created_at: at(created, '09:00'),
          updated_at: at(created, '09:00'),
        } satisfies TablesInsert<'golf_task_assignments'>);
      }
    }
    for (const t of plan.tournaments) {
      const lu = lineups.get(`${plan.year.startYear}:${t.key}`)!;
      const first = t.days[0]!;
      const announceOn = addDays(first, -4);
      if (!lu.decided || lu.lineup.length < 5 || announceOn >= today || !inEventWindow(announceOn)) continue;
      const names = lu.lineup.map((p) => `${p.story.firstName} ${p.story.lastName}`);
      const ind = lu.individuals.map((p) => `${p.story.firstName} ${p.story.lastName}`);
      put('golf_announcements', {
        id: id(`announcement:${plan.year.startYear}:${t.key}:lineup`),
        team_id: teamId,
        title: `Lineup: ${t.name}`,
        body: `Lineup for ${dayLabel(first)}: ${names.join(', ')}.${ind.length ? ` Playing as individuals: ${ind.join(', ')}.` : ''} Vans leave ${dayLabel(addDays(first, -1))} at 11:00.`,
        urgency: 'normal',
        requires_acknowledgement: false,
        send_email: false,
        send_push: false,
        publish_at: at(announceOn, '16:00'),
        published_at: at(announceOn, '16:00'),
        is_test: false,
        created_by: coachUserId,
        created_at: at(announceOn, '15:30'),
        updated_at: at(announceOn, '16:00'),
      } satisfies TablesInsert<'golf_announcements'>);
    }
  }

  // ------------------------------------------------------------ messages
  if (input.teamChannelId) {
    const recent = tables.golf_events
      .filter((e) => (e.event_type === 'practice' || e.event_type === 'qualifier' || e.event_type === 'travel'))
      .map((e) => ({ e, date: localDate(String(e.start_time), timeZone) }))
      .filter(({ date }) => daysBetween(date, today) >= 1 && daysBetween(date, today) <= 28)
      .sort((a, b) => (a.date < b.date ? -1 : 1));
    for (const { e, date } of recent) {
      const postOn = addDays(date, -1);
      if (postOn >= today) continue;
      const kind = String(e.event_type);
      const dow = weekday(date);
      if (kind === 'practice' && dow !== 1 && dow !== 3) continue;
      const content =
        kind === 'travel'
          ? `Vans leave ${dayLabel(date)} at 11:00 from the west lot. Bags packed the night before, travel polos on.`
          : kind === 'qualifier'
            ? `${String(e.title)} is ${dayLabel(date)}, first group off at 8:00. Pairings are on the calendar.`
            : `${String(e.title) === 'Practice round' ? 'Practice round' : 'Practice'} ${dayLabel(date)} at ${String(e.title) === 'Practice round' ? '1:00' : '2:30'}. The plan is up in Practice.`;
      put('golf_messages', {
        id: id(`message:${String(e.id)}`),
        conversation_id: input.teamChannelId,
        sender_id: coachUserId,
        content,
        kind: 'text',
        payload: null,
        has_attachments: false,
        is_deleted: false,
        notify_anyway: false,
        created_at: at(postOn, '19:30'),
      } satisfies TablesInsert<'golf_messages'>);
    }
  }

  // ------------------------------------------------------------- summary
  const summaries: DemoPlayerSummary[] = players.map((p) => {
    const mine = roundsInWindow.filter((r) => r.player.id === p.id);
    const seasonScoring = mine.filter((r) => r.type !== 'practice' && r.date >= current.fall.from && r.date >= year.anchor);
    const avg = (f: (r: PlayedRound) => number, rs: PlayedRound[]) => (rs.length ? Math.round((rs.reduce((s, r) => s + f(r), 0) / rs.length) * 100) / 100 : null);
    const dates = mine.map((r) => r.date).sort();
    return {
      key: p.story.key,
      name: `${p.story.firstName} ${p.story.lastName}`,
      story: p.story.storyLine,
      rounds: mine.length,
      seasonScoringRounds: seasonScoring.length,
      withShots: mine.filter((r) => r.withShots).length,
      first: dates[0] ?? null,
      last: dates[dates.length - 1] ?? null,
      seasonToPar: avg((r) => r.sim.total - r.sim.par, seasonScoring),
      penaltiesPerRound: avg((r) => r.sim.penalties, seasonScoring),
      puttsPerRound: avg((r) => r.sim.putts, seasonScoring),
    };
  });

  return { version: GENERATOR_VERSION, seed, teamId, today, year, tables, players: summaries, highlights };
}

function localDate(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
  } catch {
    return iso.slice(0, 10);
  }
}

interface PlanFocus {
  title: string;
  focus: string;
  blocks: Array<{ title: string; len: number; place: string; note: string }>;
}

const PLAN_FOCI: readonly PlanFocus[] = [
  {
    title: 'Wedges inside 100 and lag putting',
    focus: 'Proximity from 50 to 100 yards; no three-putts from 30 feet.',
    blocks: [
      { title: 'Warm-up', len: 15, place: 'Range', note: 'Half swings to full, ten balls a club.' },
      { title: 'Wedge ladder', len: 40, place: 'Short game area', note: '50, 65, 80, 95 yards. Score inside 15 feet.' },
      { title: 'Lag putting', len: 30, place: 'Putting green', note: '30, 40 and 50 feet. Every putt finishes inside 3 feet.' },
      { title: 'Pressure finish', len: 15, place: 'Putting green', note: 'Make 10 in a row from 4 feet.' },
    ],
  },
  {
    title: 'Driver fairways and penalty avoidance',
    focus: 'Fairway finder under pressure; pick the safe side on tight holes.',
    blocks: [
      { title: 'Warm-up', len: 15, place: 'Range', note: 'Alignment sticks out.' },
      { title: 'Fairway gates', len: 35, place: 'Range', note: 'Hit 10 drives through a 30-yard gate. Record the count.' },
      { title: 'Course management walk', len: 30, place: 'Holes 1 to 3', note: 'Talk through the miss on each tee.' },
      { title: 'Bunker play', len: 20, place: 'Practice bunker', note: 'Out and inside 10 feet, five in a row.' },
    ],
  },
  {
    title: 'Approach from 150 and up-and-downs',
    focus: 'Greens from 140 to 170; save par when we miss.',
    blocks: [
      { title: 'Warm-up', len: 15, place: 'Range', note: 'Stock 7-iron flight.' },
      { title: 'Approach game', len: 40, place: 'Range', note: '150, 160, 170 to a 30-foot circle. Track greens hit.' },
      { title: 'Up and down challenge', len: 30, place: 'Short game area', note: 'Nine spots, play each to the hole.' },
      { title: 'Short putts', len: 15, place: 'Putting green', note: 'Circle drill at 3 and 5 feet.' },
    ],
  },
];

/**
 * The body a published version holds, as golf_practice_plan_public_body and
 * golf_practice_plan_publish write it: plan fields with the active layout's
 * blocks at the top level, no variants, and the event's times.
 */
function publicBody(body: PlanBodyV2, title: string, event: DemoRow): Json {
  const { variants, ...fields } = body;
  return {
    ...fields,
    variant: 'main',
    blocks: variants.main.blocks.map((b) => ({ ...b })),
    title,
    drills: {},
    eventStart: event.start_time ?? null,
    eventEnd: event.end_time ?? null,
    eventLocation: event.location ?? null,
    dueOn: null,
  } as unknown as Json;
}

function planBody(planId: string, focus: PlanFocus, playerIds: string[]): PlanBodyV2 {
  const blocks: PlanBlock[] = focus.blocks.map((b, i) => ({
    id: `${planId.slice(0, 8)}-b${i + 1}`,
    kind: 'team',
    title: b.title,
    len: b.len,
    coach: null,
    note: b.note,
    place: b.place,
    drill: null,
  }));
  return {
    v: 2,
    focus: focus.focus,
    notes: '',
    place: 'Cedar Ridge Golf Club',
    arrivalBufferMin: 15,
    bring: [{ item: 'Alignment sticks', qty: 1 }],
    players: playerIds,
    groups: [],
    variants: { main: { blocks }, rain: null },
  };
}

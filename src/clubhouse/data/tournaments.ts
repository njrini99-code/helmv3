import 'server-only';
import { createClient } from '@/lib/supabase/server';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { readGolfPlayerProfiles } from '@/lib/golf/player-profiles';
import { todayIsoInZone } from '@/lib/golf/timezone';
import { logServerEvent } from '@/lib/server-error-logger';
import { isTourSchemaMissing } from '@/lib/golf/tournament-refusals';
import { isoDay } from '../lib/dates';
import { chLogServer } from '../lib/track-server';
import { suggestLinks, type LinkCandidateRound, type LinkEventRound } from '../screens/tournaments/links';
import {
  courseOf,
  playerOf,
  seasonIdOf,
  seasonsFor,
  shapeEvent,
  shapeHoles,
  type TourCourseInput,
  type TourHoleRow,
  type TourLinkedRound,
  type TourPlayerInput,
  type TourRawEvent,
  type TourRawRound,
} from './tournaments-shape';
import {
  TOUR_COLUMNS,
  tourTable,
  type TourAdviceGiverRow,
  type TourEntryRow,
  type TourFieldScoreRow,
  type TourFieldTeamRow,
  type TourLinkCandidateRow,
  type TourLinkDismissalRow,
  type TourPlayerNoteRow,
  type TourPlayerRoundRow,
  type TourReflectionRow,
  type TourReviewRow,
  type TourRoundLineupRow,
  type TourRoundRow,
  type TourRow,
  type TourTeamSeasonRow,
} from '@/lib/golf/tournaments-tables';
import type {
  ChTourCompareData,
  ChTourCompareRound,
  ChTourCourse,
  ChTourDeskData,
  ChTourEvent,
  ChTourEventDraft,
  ChTourFormData,
  ChTourHeadToHead,
  ChTourHistoryData,
  ChTourHistoryPoint,
  ChTourHomeData,
  ChTourLineupData,
  ChTourLinksData,
  ChTourLiveSnapshot,
  ChTourNextUp,
  ChTourPlayer,
  ChTourPlayerData,
  ChTourReview,
  ChTourTeam,
} from '../screens/tournaments/types';

/**
 * P016 Tournaments loaders: the seventeen held tables (typed by hand in `tournaments-tables.ts`) read through the
 * server client under RLS, shaped by `tournaments-shape.ts` and the engines into the view shapes the preview fixtures
 * produce. Every loader answers one of four ways:
 *   - `ready`: the data (sections whose own read failed carry their `errors` flag);
 *   - `not_set_up`: a tournament table or RPC is missing (the held migrations are not applied: PGRST205, 42P01,
 *     PGRST202 …). The route draws "not set up yet" (CH-16302), never a crash and never an empty season;
 *   - `missing`: the event is not this team's (or does not exist);
 *   - `failed`: the page's one read failed (the view's CH-16201).
 * Lists that grow (tournaments, rounds, scores, the comparison pool, holes) page past PostgREST's 1,000-row cap.
 *
 * Players: held file 2 still lets a player read a lineup the coach is drafting until file 4 replaces those rules, so
 * the player loader is the first line (D-85): it reads the events, their dates and the player's own rows only.
 */

export type TourLoad<T> = { kind: 'ready'; data: T } | { kind: 'not_set_up' } | { kind: 'missing' } | { kind: 'failed' };

type Supabase = Awaited<ReturnType<typeof createClient>>;
type ReadError = { message: string; code?: string | null };

export interface TourCtx {
  supabase: Supabase;
  teamId: string;
  role: 'coach' | 'player';
  playerId: string | null;
  now: string;
}

class NotSetUp extends Error {}
class ReadFailed extends Error {
  constructor(
    readonly read: string,
    override readonly cause: ReadError,
  ) {
    super(`${read}: ${cause.message}`);
  }
}

let reportedNotSetUp = false;

/** The held schema is not there yet: said once per server process, as an event, not an error (preview and dev read production). */
function noteNotSetUp(read: string): void {
  if (reportedNotSetUp) return;
  reportedNotSetUp = true;
  void logServerEvent(`[clubhouse tournaments] ${read}: the held Tournaments migrations are not applied; showing "not set up yet"`, {
    action: 'clubhouse.tournaments.notSetUp',
    featureArea: 'calendar_events',
    tags: { ui: 'clubhouse', surface: 'tournaments' },
  });
}

function check<T>(read: string, res: { data: T[] | null; error: ReadError | null }): T[] {
  if (res.error) {
    if (isTourSchemaMissing(res.error)) {
      noteNotSetUp(read);
      throw new NotSetUp(read);
    }
    throw new ReadFailed(read, res.error);
  }
  return res.data ?? [];
}

/** Runs a loader body, turning the two read failures into their answers. */
async function guard<T>(surface: string, body: () => Promise<TourLoad<T>>): Promise<TourLoad<T>> {
  try {
    return await body();
  } catch (err) {
    if (err instanceof NotSetUp) return { kind: 'not_set_up' };
    if (err instanceof ReadFailed) {
      chLogServer(`tournaments.${surface}`, err.read, err.cause, 'calendar_events');
      return { kind: 'failed' };
    }
    throw err;
  }
}

/** Every row of one paginated query (ordered, so pages never overlap). */
async function all<T>(read: string, make: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: ReadError | null }>): Promise<T[]> {
  return check(read, await fetchAllRowsResult<T>(make));
}

/** Every row for a list of ids, in chunks (URL length) and pages (the row cap). */
async function allIn<T>(read: string, ids: readonly string[], make: (chunk: string[], from: number, to: number) => PromiseLike<{ data: T[] | null; error: ReadError | null }>): Promise<T[]> {
  const out: T[] = [];
  for (const chunk of chunkIds([...new Set(ids)])) out.push(...(await all(read, (from, to) => make(chunk, from, to))));
  return out;
}

/** Each section's own read: a failure flags the section instead of failing the page. */
async function section<T>(surface: string, read: string, body: () => Promise<T>): Promise<{ ok: true; value: T } | { ok: false }> {
  try {
    return { ok: true, value: await body() };
  } catch (err) {
    if (err instanceof NotSetUp) throw err;
    chLogServer(`tournaments.${surface}`, read, err instanceof ReadFailed ? err.cause : err, 'calendar_events');
    return { ok: false };
  }
}


// ── Context ─────────────────────────────────────────────────────────────────────────────────────────────────────

export async function tourContext(team: { role: 'coach'; teamId: string } | { role: 'player'; teamId: string; playerId: string }): Promise<TourCtx> {
  return {
    supabase: await createClient(),
    teamId: team.teamId,
    role: team.role,
    playerId: team.role === 'player' ? team.playerId : null,
    now: new Date().toISOString(),
  };
}

interface TeamInfo {
  team: ChTourTeam;
  gender: 'mens' | 'womens';
  today: string;
}

async function readTeam(ctx: TourCtx): Promise<TeamInfo> {
  const [{ data, error }, settings] = await Promise.all([
    ctx.supabase.from('golf_teams').select('id, name, timezone, gender').eq('id', ctx.teamId).maybeSingle(),
    ctx.supabase.from('golf_team_settings').select('timezone').eq('team_id', ctx.teamId).maybeSingle(),
  ]);
  if (error || !data) throw new ReadFailed('team', error ?? { message: 'team not found' });
  // The team's clock as Calendar reads it (golf_team_settings), then the team row's; a round day is a date on it.
  const tz = (!settings.error && settings.data?.timezone) || data.timezone || 'America/New_York';
  const today = todayIsoInZone(tz, new Date(ctx.now));
  const season = seasonIdOf(today);
  const label = `${data.name} · ${season.slice(0, 4)}–${season.slice(5)}`;
  return { team: { id: data.id, name: data.name, label, timezone: tz }, gender: data.gender === 'womens' ? 'womens' : 'mens', today };
}

async function readSeasonProfiles(ctx: TourCtx): Promise<TourTeamSeasonRow[]> {
  return all<TourTeamSeasonRow>('seasons', (from, to) =>
    tourTable(ctx.supabase, 'golf_team_seasons').select(TOUR_COLUMNS.golf_team_seasons).eq('team_id', ctx.teamId).order('season', { ascending: true }).range(from, to),
  );
}

/** The roster as the views name it: every membership (alumni stay with the events they played). */
async function readPlayers(ctx: TourCtx, seasonEndYear: number): Promise<ChTourPlayer[]> {
  const members = await all<{ player_id: string; status: string | null; availability: string | null }>('roster', (from, to) =>
    ctx.supabase.from('golf_team_members').select('player_id, status, availability').eq('team_id', ctx.teamId).order('player_id', { ascending: true }).range(from, to),
  );
  const profiles = await readGolfPlayerProfiles(ctx.supabase, { playerIds: members.map((m) => m.player_id) });
  if (profiles.error) throw new ReadFailed('profiles', profiles.error);
  const byId = new Map(profiles.data.map((p) => [p.id, p]));
  return members
    .map((m): TourPlayerInput => {
      const p = byId.get(m.player_id);
      return { id: m.player_id, firstName: p?.first_name ?? null, lastName: p?.last_name ?? null, avatarUrl: p?.avatar_url ?? null, graduationYear: p?.graduation_year ?? null, status: m.status, availability: m.availability };
    })
    .map((p) => playerOf(p, seasonEndYear))
    .sort((a, b) => Number(a.alumni) - Number(b.alumni) || a.name.localeCompare(b.name));
}

async function readCourses(ctx: TourCtx, courseIds: readonly string[], teeIds: readonly string[]): Promise<{ courses: Record<string, ChTourCourse>; tees: Map<string, { par: number | null; rating: number | null; name: string }> }> {
  const ids = courseIds.filter(Boolean);
  const rows = ids.length
    ? await allIn<{ id: string; name: string; par: number | null; course_rating: number | null }>('courses', ids, (chunk, from, to) =>
        ctx.supabase.from('golf_courses').select('id, name, par, course_rating').in('id', chunk).order('id', { ascending: true }).range(from, to),
      )
    : [];
  const teeRows = teeIds.length
    ? await allIn<{ id: string; course_id: string; tee_name: string; total_par: number | null; course_rating: number | null }>('tees', teeIds, (chunk, from, to) =>
        ctx.supabase.from('golf_course_tees').select('id, course_id, tee_name, total_par, course_rating').in('id', chunk).order('id', { ascending: true }).range(from, to),
      )
    : [];
  const tees = new Map(teeRows.map((t) => [t.id, { par: t.total_par, rating: t.course_rating, name: t.tee_name }]));
  const courses: Record<string, ChTourCourse> = {};
  for (const c of rows) {
    const tee = teeRows.find((t) => t.course_id === c.id);
    const input: TourCourseInput = { id: c.id, name: c.name, par: tee?.total_par ?? c.par, rating: tee?.course_rating ?? c.course_rating, tees: tee?.tee_name ?? null };
    courses[c.id] = courseOf(input);
  }
  return { courses, tees };
}

// ── Events ──────────────────────────────────────────────────────────────────────────────────────────────────────

interface EventsRead {
  events: ChTourEvent[];
  raws: TourRawEvent[];
  courses: Record<string, ChTourCourse>;
  /** Linked GolfHelm rounds with holes, for the desk's ledger. */
  linkedIds: string[];
}

/**
 * The team's tournaments (or the given ones) with everything an event needs. `own` limits the scores read to one
 * player's (the player loader: never teammates' rows or the lineup).
 */
async function readEvents(ctx: TourCtx, tz: string, opts: { ids?: string[]; own?: string } = {}): Promise<EventsRead> {
  const base = (from: number, to: number) => {
    let q = tourTable(ctx.supabase, 'golf_tournaments').select(TOUR_COLUMNS.golf_tournaments).eq('team_id', ctx.teamId);
    if (opts.ids) q = q.in('id', opts.ids);
    return q.order('start_date', { ascending: true }).order('id', { ascending: true }).range(from, to);
  };
  const ts = await all<TourRow>('tournaments', base);
  if (!ts.length) return { events: [], raws: [], courses: {}, linkedIds: [] };
  const tids = ts.map((t) => t.id);
  const rounds = await allIn<TourRoundRow>('rounds', tids, (chunk, from, to) =>
    tourTable(ctx.supabase, 'golf_tournament_rounds').select(TOUR_COLUMNS.golf_tournament_rounds).in('tournament_id', chunk).order('round_event_id', { ascending: true }).range(from, to),
  );
  const rids = rounds.map((r) => r.round_event_id);
  const own = opts.own;
  const [events, entries, lineups, playerRounds, fieldTeams] = await Promise.all([
    allIn<{ id: string; start_time: string }>('roundEvents', rids, (chunk, from, to) =>
      ctx.supabase.from('golf_events').select('id, start_time').in('id', chunk).order('id', { ascending: true }).range(from, to),
    ),
    own
      ? Promise.resolve([] as TourEntryRow[])
      : allIn<TourEntryRow>('entries', tids, (chunk, from, to) =>
          tourTable(ctx.supabase, 'golf_tournament_entries').select(TOUR_COLUMNS.golf_tournament_entries).in('tournament_id', chunk).order('player_id', { ascending: true }).range(from, to),
        ),
    own
      ? Promise.resolve([] as TourRoundLineupRow[])
      : allIn<TourRoundLineupRow>('roundLineups', rids, (chunk, from, to) =>
          tourTable(ctx.supabase, 'golf_tournament_round_lineups').select(TOUR_COLUMNS.golf_tournament_round_lineups).in('round_event_id', chunk).order('player_id', { ascending: true }).range(from, to),
        ),
    allIn<TourPlayerRoundRow>('playerRounds', rids, (chunk, from, to) => {
      let q = tourTable(ctx.supabase, 'golf_tournament_player_rounds').select(TOUR_COLUMNS.golf_tournament_player_rounds).in('round_event_id', chunk);
      if (own) q = q.eq('player_id', own);
      return q.order('player_id', { ascending: true }).range(from, to);
    }),
    own
      ? Promise.resolve([] as TourFieldTeamRow[])
      : allIn<TourFieldTeamRow>('fieldTeams', tids, (chunk, from, to) =>
          tourTable(ctx.supabase, 'golf_tournament_field_teams').select(TOUR_COLUMNS.golf_tournament_field_teams).in('tournament_id', chunk).order('id', { ascending: true }).range(from, to),
        ),
  ]);
  const fieldScores = fieldTeams.length
    ? await allIn<TourFieldScoreRow>('fieldScores', fieldTeams.map((f) => f.id), (chunk, from, to) =>
        tourTable(ctx.supabase, 'golf_tournament_field_scores').select(TOUR_COLUMNS.golf_tournament_field_scores).in('field_team_id', chunk).order('field_team_id', { ascending: true }).order('round_number', { ascending: true }).range(from, to),
      )
    : [];

  const linkedIds = playerRounds.map((p) => p.round_id).filter((x): x is string => !!x);
  const [linkedRows, holeRounds] = await Promise.all([
    allIn<{ id: string; status: string | null; total_score: number | null; strokes_gained_total: number | null }>('linkedRounds', linkedIds, (chunk, from, to) =>
      ctx.supabase.from('golf_rounds').select('id, status, total_score, strokes_gained_total').in('id', chunk).order('id', { ascending: true }).range(from, to),
    ),
    allIn<{ round_id: string }>('linkedHoles', linkedIds, (chunk, from, to) =>
      ctx.supabase.from('golf_holes').select('round_id').in('round_id', chunk).not('score', 'is', null).order('id', { ascending: true }).range(from, to),
    ),
  ]);
  const withHoles = new Set(holeRounds.map((h) => h.round_id));
  const linked: Record<string, TourLinkedRound> = {};
  for (const r of linkedRows) linked[r.id] = { total: r.total_score, completed: r.status === 'completed', holes: withHoles.has(r.id), shots: r.strokes_gained_total != null };

  const courseIds = [...new Set([...ts.map((t) => t.course_id), ...rounds.map((r) => r.course_id)].filter((x): x is string => !!x))];
  const teeIds = [...new Set(rounds.map((r) => r.tee_id).filter((x): x is string => !!x))];
  const { courses, tees } = await readCourses(ctx, courseIds, teeIds);
  const startById = new Map(events.map((e) => [e.id, e.start_time]));

  const raws: TourRawEvent[] = ts.map((t) => {
    const mine = rounds.filter((r) => r.tournament_id === t.id);
    const ids = new Set(mine.map((r) => r.round_event_id));
    const ftIds = new Set(fieldTeams.filter((f) => f.tournament_id === t.id).map((f) => f.id));
    return {
      t,
      rounds: mine.map((r): TourRawRound => {
        const start = startById.get(r.round_event_id);
        const courseId = r.course_id ?? t.course_id;
        return { ...r, date: start ? isoDay(start, tz) : t.start_date, par: (r.tee_id ? tees.get(r.tee_id)?.par : null) ?? (courseId ? (courses[courseId]?.par ?? null) : null) };
      }),
      entries: entries.filter((e) => e.tournament_id === t.id),
      roundLineups: lineups.filter((l) => ids.has(l.round_event_id)),
      playerRounds: playerRounds.filter((p) => ids.has(p.round_event_id)),
      linked,
      fieldTeams: fieldTeams.filter((f) => f.tournament_id === t.id),
      fieldScores: fieldScores.filter((s) => ftIds.has(s.field_team_id)),
    };
  });
  return { events: raws.map((r) => shapeEvent(r, ctx.now)), raws, courses, linkedIds };
}

// ── Season home ─────────────────────────────────────────────────────────────────────────────────────────────────

/** The hero's readiness and week (5.1): what is set and what is not, from the event's own rows only. */
function nextUp(e: ChTourEvent, courses: Record<string, ChTourCourse>): ChTourNextUp {
  const r1 = e.rounds[0];
  const lineupDone = e.lineup.status === 'locked' || e.lineup.status === 'published';
  const tees = e.rounds.length > 0 && e.rounds.every((r) => r.firstTeeAt != null);
  const course = e.courseIds.length > 0 && e.courseIds.every((id) => courses[id]);
  const readiness: ChTourNextUp['readiness'] = [
    { key: 'lineup', done: lineupDone, label: lineupDone ? 'Lineup published' : `Lineup isn’t set · ${e.lineup.set} of ${e.lineup.of}`, due: e.lineup.locksAt },
    { key: 'tees', done: tees, label: tees ? 'Tee times entered' : 'Tee times aren’t entered', due: null },
    { key: 'course', done: course, label: course ? 'Course set' : 'Course isn’t set', due: null },
  ];
  const ticks: ChTourNextUp['ticks'] = [
    ...(e.lineup.locksAt ? [{ at: e.lineup.locksAt, kind: 'lock' as const, label: 'Lineup locks', done: e.lineup.status === 'locked' }] : []),
    ...e.rounds.filter((r) => r.firstTeeAt).map((r) => ({ at: r.firstTeeAt!, kind: 'round' as const, label: `Round ${r.number}`, done: r.status !== 'upcoming' })),
  ].sort((a, b) => a.at.localeCompare(b.at));
  const action: ChTourNextUp['action'] = e.status === 'live' ? 'follow' : e.lineup.status === 'none' || e.lineup.status === 'draft' ? 'build' : 'open';
  return { eventId: e.id, readiness: r1 ? readiness : readiness.slice(1), ticks, alsoThisWeek: [], action };
}

async function linkTeaser(ctx: TourCtx, events: ChTourEvent[]): Promise<{ candidates: number; high: number } | null> {
  if (ctx.role !== 'coach') return null;
  const { data, error } = await ctx.supabase.rpc('golf_tournament_link_candidates' as never, { p_team_id: ctx.teamId } as never);
  if (error) throw isTourSchemaMissing(error) ? new NotSetUp('linkCandidates') : new ReadFailed('linkCandidates', error);
  const rows = (data ?? []) as TourLinkCandidateRow[];
  const suggestions = suggestLinks(rows.map(candidateOf), eventRoundsOf(events));
  return { candidates: rows.length, high: suggestions.filter((s) => s.match?.confidence === 'high' && !s.ambiguous).length };
}

const candidateOf = (r: TourLinkCandidateRow): LinkCandidateRound => ({ id: r.round_id, playerId: r.player_id, date: r.round_date, courseId: r.course_id, courseName: r.course_name, score: r.total_score, roundType: r.round_type });

function eventRoundsOf(events: readonly ChTourEvent[]): LinkEventRound[] {
  return events.flatMap((e) => e.rounds.map((r) => ({ roundEventId: r.roundEventId, tournamentId: e.id, tournamentName: e.name, roundNumber: r.number, date: r.date, courseId: r.courseId || null })));
}

export async function loadTournamentsHome(ctx: TourCtx): Promise<TourLoad<ChTourHomeData>> {
  return guard<ChTourHomeData>('home', async () => {
    const info = await readTeam(ctx);
    const seasonEnd = Number(seasonIdOf(info.today).slice(0, 4)) + 1;
    const [profiles, players] = await Promise.all([readSeasonProfiles(ctx), readPlayers(ctx, seasonEnd)]);
    const read = await section('home', 'events', () => readEvents(ctx, info.team.timezone));
    const events = read.ok ? read.value.events : [];
    const seasons = seasonsFor(events.map((e) => e.startDate), info.today, info.gender, profiles);
    const season = seasons.find((s) => s.id === seasonIdOf(info.today)) ?? seasons[0]!;
    const upcoming = events.filter((e) => e.status !== 'complete').sort((a, b) => a.startDate.localeCompare(b.startDate));
    const links = await section('home', 'links', () => linkTeaser(ctx, events));
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        team: info.team,
        season,
        seasons,
        players,
        courses: read.ok ? read.value.courses : {},
        events,
        next: upcoming[0] ? nextUp(upcoming[0], read.ok ? read.value.courses : {}) : null,
        // The season path needs the division's rules verified (D-91), the ladder and heat map their own engines' loaders:
        // not built in this pass, so their sections stay empty rather than invented.
        path: null,
        ladder: [],
        heatmap: { playerIds: [], eventIds: [], cells: {} },
        links: links.ok ? links.value : null,
        errors: { ...(read.ok ? {} : { events: true as const }), ...(links.ok ? {} : { links: true as const }) },
      },
    };
  });
}

// ── Event desk (and its Review tab) ─────────────────────────────────────────────────────────────────────────────

async function readReview(ctx: TourCtx, e: ChTourEvent): Promise<ChTourReview> {
  const [reviews, notes, reflections] = await Promise.all([
    all<TourReviewRow>('review', (from, to) => tourTable(ctx.supabase, 'golf_tournament_reviews').select(TOUR_COLUMNS.golf_tournament_reviews).eq('tournament_id', e.id).order('tournament_id').range(from, to)),
    all<TourPlayerNoteRow>('playerNotes', (from, to) => tourTable(ctx.supabase, 'golf_tournament_player_notes').select(TOUR_COLUMNS.golf_tournament_player_notes).eq('tournament_id', e.id).order('player_id').range(from, to)),
    all<TourReflectionRow>('reflections', (from, to) => tourTable(ctx.supabase, 'golf_tournament_reflections').select(TOUR_COLUMNS.golf_tournament_reflections).eq('tournament_id', e.id).order('player_id').range(from, to)),
  ]);
  const rv = reviews[0] ?? null;
  const team = [...new Set(e.playerRounds.filter((p) => p.role !== 'alternate').map((p) => p.playerId))];
  return {
    open: e.rounds.length > 0 && e.rounds.every((r) => r.status === 'final' || r.status === 'official'),
    layers: rv && (rv.observation || rv.hypothesis) ? [{ id: 'review', observation: rv.observation ?? '', evidence: '', hypothesis: rv.hypothesis ?? '' }] : [],
    // Leaks against the season baseline and players' season comparisons need the metric engine's season pool: left
    // empty (shown as nothing to say), never zero.
    leak: [],
    players: team.map((playerId) => {
      const n = notes.find((x) => x.player_id === playerId);
      const r = reflections.find((x) => x.player_id === playerId);
      const shared = n?.shared_at != null;
      return {
        playerId,
        vsSeason: null,
        vsSeasonSe: null,
        costlyHoles: [],
        reflection: r ? { text: r.body, at: r.updated_at } : null,
        fields: { shot: n?.shot_of_day ?? '', decision: n?.decision ?? '', focus: n?.next_focus ?? '' },
        shared: { shot: shared, decision: shared, focus: shared },
      };
    }),
    notes: reflections.map((r) => ({ id: `reflection:${r.player_id}`, author: r.player_id, kind: 'reflection' as const, text: r.body })),
    missingReflections: team.filter((id) => !reflections.some((r) => r.player_id === id)),
    savedAt: rv?.updated_at ?? null,
  };
}

async function staffNames(ctx: TourCtx): Promise<Array<{ id: string; name: string; userId: string }>> {
  const staff = await all<{ coach_id: string }>('staff', (from, to) => ctx.supabase.from('golf_team_coach_staff').select('coach_id').eq('team_id', ctx.teamId).order('coach_id').range(from, to));
  const coaches = await allIn<{ id: string; user_id: string; full_name: string | null }>('coaches', staff.map((s) => s.coach_id), (chunk, from, to) =>
    ctx.supabase.from('golf_coaches').select('id, user_id, full_name').in('id', chunk).order('id').range(from, to),
  );
  return coaches.map((c) => ({ id: c.id, userId: c.user_id, name: c.full_name?.trim() || 'Coach' }));
}

export async function loadTournamentDesk(ctx: TourCtx, eventId: string): Promise<TourLoad<ChTourDeskData>> {
  return guard<ChTourDeskData>('desk', async () => {
    const info = await readTeam(ctx);
    const seasonEnd = Number(seasonIdOf(info.today).slice(0, 4)) + 1;
    const [read, players] = await Promise.all([readEvents(ctx, info.team.timezone), readPlayers(ctx, seasonEnd)]);
    const event = read.events.find((e) => e.id === eventId);
    if (!event) return { kind: 'missing' };
    const linked = event.playerRounds.filter((p) => p.roundId && p.holesKnown).map((p) => p.roundId!);
    const [holes, review, givers] = await Promise.all([
      section('desk', 'holes', async () =>
        shapeHoles(
          event,
          await allIn<TourHoleRow>('holes', linked, (chunk, from, to) =>
            ctx.supabase.from('golf_holes').select('round_id, hole_number, par, score').in('round_id', chunk).order('round_id').order('hole_number').range(from, to),
          ),
        ),
      ),
      section('desk', 'review', () => readReview(ctx, event)),
      section('desk', 'adviceGivers', async () => {
        const rows = await all<TourAdviceGiverRow>('adviceGivers', (from, to) =>
          tourTable(ctx.supabase, 'golf_tournament_advice_givers').select(TOUR_COLUMNS.golf_tournament_advice_givers).eq('tournament_id', eventId).order('user_id').range(from, to),
        );
        const staff = await staffNames(ctx);
        return rows.map((r) => staff.find((s) => s.userId === r.user_id)?.name ?? 'Coach');
      }),
    ]);
    const previous = read.events
      .filter((e) => e.id !== event.id && e.startDate < event.startDate && e.courseIds.some((c) => event.courseIds.includes(c)))
      .sort((a, b) => b.startDate.localeCompare(a.startDate))[0];
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        event,
        players,
        courses: read.courses,
        holes: holes.ok ? holes.value : null,
        // "Where the event turned" and the six-hole story are the findings engine's (not built in this pass): none
        // rather than invented ones.
        findings: [],
        story: null,
        review: review.ok ? review.value : null,
        // Travel is the itinerary link (form's itineraryId), not stored by the held tables yet.
        travel: null,
        adviceGivers: givers.ok ? givers.value : [],
        previous: previous ? { eventId: previous.id, name: previous.name } : null,
        errors: { ...(holes.ok ? {} : { holes: true as const }), ...(review.ok ? {} : { review: true as const }) },
      },
    };
  });
}

// ── History ─────────────────────────────────────────────────────────────────────────────────────────────────────

const mean = (xs: readonly number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const round1 = (v: number | null) => (v == null ? null : Math.round(v * 10) / 10 + 0);

/** Lineup players who played an event both this season and last (returning players, the matched sample). */
function matchedPlayersOf(events: readonly ChTourEvent[], season: string): string[] {
  const prev = `${Number(season.slice(0, 4)) - 1}-${season.slice(2, 4)}`;
  const inSeason = (id: string) => new Set(events.filter((e) => e.seasonId === id).flatMap((e) => e.playerRounds.filter((p) => p.role === 'lineup' && p.total != null).map((p) => p.playerId)));
  const a = inSeason(season);
  const b = inSeason(prev);
  return [...a].filter((x) => b.has(x)).sort();
}

export function historyTrend(events: readonly ChTourEvent[], courses: Record<string, ChTourCourse>, matched: readonly string[]): ChTourHistoryPoint[] {
  return events
    .filter((e) => e.status === 'complete')
    .map((e) => {
      const team = e.playerRounds.filter((p) => p.role !== 'individual' && p.total != null);
      // Against the course rating; a course without one is read against its par (the same stand-in the comparison uses).
      const vs = (p: (typeof team)[number]) => {
        const round = e.rounds.find((r) => r.roundEventId === p.roundEventId);
        const rating = round ? (courses[round.courseId]?.rating ?? round.par) : 72;
        return p.total! - rating;
      };
      const m = team.filter((p) => matched.includes(p.playerId));
      const others = e.field?.teams.filter((t) => !t.us && t.total != null) ?? [];
      const perFieldRound = others.length ? mean(others.map((t) => t.total! / (e.rounds.length * e.format.counting))) : null;
      const ours = e.team.result?.total != null ? e.team.result.total / (e.rounds.length * e.format.counting) : null;
      return {
        eventId: e.id,
        actual: round1(mean(team.map(vs))),
        matched: m.length ? round1(mean(m.map(vs))) : null,
        vsField: perFieldRound != null && ours != null ? round1(ours - perFieldRound) : null,
        rounds: team.length,
        players: new Set(team.map((p) => p.playerId)).size,
        scorecardsOnly: e.coverage.withShots === 0,
      };
    });
}

export function headToHeadOf(events: readonly ChTourEvent[], season: string): ChTourHeadToHead[] {
  const out = new Map<string, ChTourHeadToHead>();
  for (const e of events.filter((x) => x.status === 'complete' && x.seasonId === season)) {
    const us = e.field?.teams.find((t) => t.us);
    if (us?.total == null) continue;
    for (const o of e.field?.teams ?? []) {
      if (o.us || o.total == null) continue;
      const cur = out.get(o.name) ?? { team: o.name, record: { w: 0, l: 0, t: 0 }, strokeDiff: 0, events: [] };
      if (o.total > us.total) cur.record.w += 1;
      else if (o.total < us.total) cur.record.l += 1;
      else cur.record.t += 1;
      cur.strokeDiff = (cur.strokeDiff ?? 0) + (us.total - o.total);
      cur.events.push({ eventId: e.id, us: us.total, them: o.total });
      out.set(o.name, cur);
    }
  }
  return [...out.values()].sort((a, b) => b.events.length - a.events.length || a.team.localeCompare(b.team));
}

export async function loadTournamentHistory(ctx: TourCtx): Promise<TourLoad<ChTourHistoryData>> {
  return guard<ChTourHistoryData>('history', async () => {
    const info = await readTeam(ctx);
    const seasonEnd = Number(seasonIdOf(info.today).slice(0, 4)) + 1;
    const [read, players, profiles] = await Promise.all([readEvents(ctx, info.team.timezone), readPlayers(ctx, seasonEnd), readSeasonProfiles(ctx)]);
    const season = seasonIdOf(info.today);
    const complete = read.events.filter((e) => e.status === 'complete');
    const matched = matchedPlayersOf(read.events, season);
    const trend = historyTrend(complete, read.courses, matched);
    const vals = trend.filter((t) => complete.find((e) => e.id === t.eventId)?.seasonId === season && t.actual != null).map((t) => t.actual!).sort((a, b) => a - b);
    const q = (p: number) => vals[Math.min(vals.length - 1, Math.max(0, Math.round(p * (vals.length - 1))))]!;
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        seasons: seasonsFor(read.events.map((e) => e.startDate), info.today, info.gender, profiles),
        players,
        courses: read.courses,
        events: complete,
        trend,
        // The middle half of this season's results; under four events there is no band to draw.
        band: vals.length >= 4 ? { lo: q(0.25), hi: q(0.75) } : null,
        matchedPlayers: matched,
        headToHead: headToHeadOf(read.events, season),
        // Splits by day, kind and start need the standard errors of the metrics engine's pool: not built in this pass.
        splits: [],
        errors: {},
      },
    };
  });
}

// ── Comparison ──────────────────────────────────────────────────────────────────────────────────────────────────

interface PoolRound {
  id: string;
  player_id: string;
  round_date: string;
  round_type: string | null;
  course_id: string | null;
  total_score: number | null;
  holes_played: number | null;
  score_to_par: number | null;
  total_putts: number | null;
  total_penalties: number | null;
  strokes_gained_tee: number | null;
  strokes_gained_approach: number | null;
  strokes_gained_around_green: number | null;
  strokes_gained_putting: number | null;
}

interface PoolHole {
  round_id: string;
  par: number;
  score: number | null;
  putts: number | null;
  gir: boolean | null;
  fairway_hit: boolean | null;
  penalty_strokes: number | null;
}

export function holeStats(holes: readonly PoolHole[], round: Pick<PoolRound, 'total_putts' | 'total_penalties'>): ChTourCompareRound['stats'] {
  const played = holes.filter((h) => h.score != null);
  const missed = played.filter((h) => h.gir === false);
  return {
    gir: played.filter((h) => h.gir === true).length,
    fw: played.filter((h) => h.par > 3 && h.fairway_hit === true).length,
    fwOf: played.filter((h) => h.par > 3 && h.fairway_hit != null).length,
    putts: played.length ? played.reduce((a, h) => a + (h.putts ?? 0), 0) : (round.total_putts ?? 0),
    threePutts: played.filter((h) => (h.putts ?? 0) >= 3).length,
    scrMade: missed.filter((h) => h.score! <= h.par).length,
    scrOf: missed.length,
    birdiesPlus: played.filter((h) => h.score! <= h.par - 1).length,
    doublesPlus: played.filter((h) => h.score! >= h.par + 2).length,
    penalties: played.length ? played.reduce((a, h) => a + (h.penalty_strokes ?? 0), 0) : (round.total_penalties ?? 0),
    proximityFt: null,
  };
}

/** Every round a comparison can draw on: the team's completed GolfHelm rounds this season and last, and entered tournament scores. */
async function readPool(ctx: TourCtx, read: EventsRead, playerIds: readonly string[], today: string): Promise<ChTourCompareRound[]> {
  const since = `${Number(seasonIdOf(today).slice(0, 4)) - 1}-08-01`;
  const rounds = await allIn<PoolRound>('poolRounds', playerIds, (chunk, from, to) =>
    ctx.supabase
      .from('golf_rounds')
      .select('id, player_id, round_date, round_type, course_id, total_score, holes_played, score_to_par, total_putts, total_penalties, strokes_gained_tee, strokes_gained_approach, strokes_gained_around_green, strokes_gained_putting')
      .in('player_id', chunk)
      .eq('status', 'completed')
      .eq('is_test', false)
      .gte('round_date', since)
      .order('id', { ascending: true })
      .range(from, to),
  );
  const holes = await allIn<PoolHole>('poolHoles', rounds.map((r) => r.id), (chunk, from, to) =>
    ctx.supabase.from('golf_holes').select('round_id, par, score, putts, gir, fairway_hit, penalty_strokes').in('round_id', chunk).order('id', { ascending: true }).range(from, to),
  );
  const byRound = new Map<string, PoolHole[]>();
  for (const h of holes) byRound.set(h.round_id, [...(byRound.get(h.round_id) ?? []), h]);
  const extraCourses = rounds.map((r) => r.course_id).filter((c): c is string => !!c && !read.courses[c]);
  if (extraCourses.length) Object.assign(read.courses, (await readCourses(ctx, [...new Set(extraCourses)], [])).courses);

  const linkedTo = new Map<string, { e: ChTourEvent; pr: ChTourEvent['playerRounds'][number] }>();
  for (const e of read.events) for (const pr of e.playerRounds) if (pr.roundId) linkedTo.set(pr.roundId, { e, pr });

  const fieldPerRound = (e: ChTourEvent, n: number) => {
    const others = e.field?.teams.filter((t) => !t.us && t.rounds[n - 1] != null) ?? [];
    return others.length ? mean(others.map((t) => t.rounds[n - 1]! / e.format.counting)) : null;
  };
  const counting = (e: ChTourEvent, pr: ChTourEvent['playerRounds'][number]): ChTourCompareRound['counting'] => {
    if (pr.role !== 'lineup') return null;
    const tr = e.team.rounds.find((r) => r.roundNumber === pr.roundNumber);
    if (!tr || tr.kind !== 'complete') return null;
    return { counted: pr.count === 'counted', tie: pr.count === 'tie', drop: null, lineupSize: tr.counting.length + tr.dropped.length };
  };
  const out: ChTourCompareRound[] = [];
  for (const r of rounds) {
    if (r.total_score == null) continue;
    const holesPlayed: 9 | 18 = (r.holes_played ?? 18) <= 9 ? 9 : 18;
    const course = r.course_id ? read.courses[r.course_id] : undefined;
    const par = course ? (holesPlayed === 9 ? Math.round(course.par / 2) : course.par) : r.score_to_par != null ? r.total_score - r.score_to_par : holesPlayed === 9 ? 36 : 72;
    const rating = course?.rating != null ? (holesPlayed === 9 ? course.rating / 2 : course.rating) : null;
    const own = byRound.get(r.id) ?? [];
    const link = linkedTo.get(r.id);
    const sg = r.strokes_gained_tee != null && r.strokes_gained_approach != null && r.strokes_gained_around_green != null && r.strokes_gained_putting != null ? { ott: r.strokes_gained_tee, app: r.strokes_gained_approach, arg: r.strokes_gained_around_green, putt: r.strokes_gained_putting } : null;
    const fpr = link ? fieldPerRound(link.e, link.pr.roundNumber) : null;
    out.push({
      id: r.id,
      playerId: r.player_id,
      date: r.round_date,
      context: link ? 'event' : r.round_type === 'qualifier' ? 'qualifier' : 'practice',
      eventId: link?.e.id ?? null,
      roundEventId: link?.pr.roundEventId ?? null,
      roundNumber: link?.pr.roundNumber ?? null,
      courseId: r.course_id ?? '',
      holes: holesPlayed,
      totalOnly: own.length === 0,
      score: r.total_score,
      par,
      toPar: r.total_score - par,
      vsRating: rating != null ? Math.round(((r.total_score - rating) / holesPlayed) * 18 * 10) / 10 : null,
      vsField: fpr != null ? Math.round((r.total_score - fpr) * 10) / 10 : null,
      counting: link ? counting(link.e, link.pr) : null,
      individual: link?.pr.role === 'individual',
      sg,
      stats: holeStats(own, r),
      trust: link ? link.pr.trust : 'practice',
    });
  }
  // Entered tournament scores (no GolfHelm round): event rounds with totals only.
  for (const e of read.events) {
    for (const pr of e.playerRounds) {
      if (pr.roundId || pr.total == null || pr.source !== 'coach') continue;
      const round = e.rounds.find((x) => x.roundEventId === pr.roundEventId)!;
      const course = read.courses[round.courseId];
      const fpr = fieldPerRound(e, pr.roundNumber);
      out.push({
        id: `entered:${pr.roundEventId}:${pr.playerId}`,
        playerId: pr.playerId,
        date: round.date,
        context: 'event',
        eventId: e.id,
        roundEventId: pr.roundEventId,
        roundNumber: pr.roundNumber,
        courseId: round.courseId,
        holes: e.format.holes,
        totalOnly: true,
        score: pr.total,
        par: round.par,
        toPar: pr.total - round.par,
        vsRating: course?.rating != null ? Math.round(((pr.total - course.rating) / e.format.holes) * 18 * 10) / 10 : null,
        vsField: fpr != null ? Math.round((pr.total - fpr) * 10) / 10 : null,
        counting: counting(e, pr),
        individual: pr.role === 'individual',
        sg: null,
        stats: holeStats([], { total_putts: null, total_penalties: null }),
        trust: pr.trust,
      });
    }
  }
  return out.sort((a, b) => a.date.localeCompare(b.date) || a.id.localeCompare(b.id));
}

export async function loadTournamentCompare(ctx: TourCtx, eventId: string | null): Promise<TourLoad<ChTourCompareData>> {
  return guard<ChTourCompareData>('compare', async () => {
    const info = await readTeam(ctx);
    const seasonEnd = Number(seasonIdOf(info.today).slice(0, 4)) + 1;
    const [read, players, profiles] = await Promise.all([readEvents(ctx, info.team.timezone), readPlayers(ctx, seasonEnd), readSeasonProfiles(ctx)]);
    const pool = await section('compare', 'pool', () => readPool(ctx, read, players.map((p) => p.id), info.today));
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        team: info.team,
        seasons: seasonsFor(read.events.map((e) => e.startDate), info.today, info.gender, profiles),
        players,
        courses: read.courses,
        events: read.events,
        rounds: pool.ok ? pool.value : [],
        matchedPlayers: matchedPlayersOf(read.events, seasonIdOf(info.today)),
        eventId: eventId && read.events.some((e) => e.id === eventId) ? eventId : null,
        errors: pool.ok ? {} : { rounds: true },
      },
    };
  });
}

// ── Link inbox ──────────────────────────────────────────────────────────────────────────────────────────────────

export async function loadTournamentLinks(ctx: TourCtx): Promise<TourLoad<ChTourLinksData>> {
  return guard<ChTourLinksData>('links', async () => {
    const info = await readTeam(ctx);
    const seasonEnd = Number(seasonIdOf(info.today).slice(0, 4)) + 1;
    const [read, players] = await Promise.all([readEvents(ctx, info.team.timezone), readPlayers(ctx, seasonEnd)]);
    const cands = await section('links', 'candidates', async () => {
      const { data, error } = await ctx.supabase.rpc('golf_tournament_link_candidates' as never, { p_team_id: ctx.teamId } as never);
      if (error) throw isTourSchemaMissing(error) ? new NotSetUp('linkCandidates') : new ReadFailed('linkCandidates', error);
      return (data ?? []) as TourLinkCandidateRow[];
    });
    const dismissed = await all<TourLinkDismissalRow>('dismissals', (from, to) =>
      tourTable(ctx.supabase, 'golf_tournament_link_dismissals').select(TOUR_COLUMNS.golf_tournament_link_dismissals).eq('team_id', ctx.teamId).order('round_id').range(from, to),
    );
    const rows = cands.ok ? cands.value : [];
    const taken = read.events.flatMap((e) => e.playerRounds.filter((p) => p.total != null || p.roundId).map((p) => ({ playerId: p.playerId, roundEventId: p.roundEventId })));
    const suggestions = suggestLinks(rows.map(candidateOf), eventRoundsOf(read.events), { taken });
    const eventOf = new Map(read.events.flatMap((e) => e.rounds.map((r) => [r.roundEventId, e.id] as const)));
    const courseName = (id: string) => read.courses[id]?.name ?? '';
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        players,
        candidates: suggestions.map((s) => {
          const row = rows.find((r) => r.round_id === s.round.id)!;
          return {
            roundId: row.round_id,
            playerId: row.player_id,
            date: row.round_date,
            courseName: row.course_name,
            score: row.total_score ?? 0,
            toPar: row.score_to_par,
            suggestion: s.match ? { eventId: eventOf.get(s.match.eventRound.roundEventId) ?? s.match.eventRound.tournamentId, roundNumber: s.match.eventRound.roundNumber, confidence: s.match.confidence } : null,
          };
        }),
        events: read.events.map((e) => ({ id: e.id, name: e.name, rounds: e.rounds.map((r) => ({ number: r.number, date: r.date, courseName: courseName(r.courseId) })) })),
        // Lineup players with no score in a round that has started.
        missing: read.events.flatMap((e) =>
          e.rounds
            .filter((r) => r.status !== 'upcoming')
            .flatMap((r) =>
              e.playerRounds
                .filter((p) => p.roundNumber === r.number && p.role === 'lineup' && p.total == null && !p.roundId)
                .map((p) => ({ eventId: e.id, roundNumber: r.number, playerId: p.playerId })),
            ),
        ),
        dismissed: dismissed.length,
        errors: cands.ok ? {} : { candidates: true },
      },
    };
  });
}

// ── Event form, lineup, live (the placeholder views keep their final props) ─────────────────────────────────────

function draftOf(e: ChTourEvent | null, t: TourRow | null, givers: string[]): ChTourEventDraft {
  return {
    name: e?.name ?? '',
    host: t?.host ?? '',
    startDate: e?.startDate ?? '',
    endDate: e?.endDate ?? '',
    resultsUrl: e?.resultsUrl ?? '',
    notes: '',
    format: e?.format ?? { kind: '5c4', players: 5, counting: 4, holes: 18 },
    kind: e?.kind ?? 'regular',
    tiebreak: e?.tiebreak ?? 'ties_stand',
    rounds: e ? e.rounds.map((r) => ({ date: r.date, courseId: r.courseId || null, startType: r.startType, firstTee: r.firstTeeAt })) : [{ date: '', courseId: null, startType: 'tee_times', firstTee: null }],
    fieldSize: t?.field_size ?? null,
    fieldTeams: e?.field?.teams.filter((x) => !x.us).map((x) => x.name) ?? [],
    line: t?.line_kind && t.line_value ? { kind: t.line_kind, places: t.line_value } : null,
    adviceGivers: givers,
    qualifierId: null,
    itineraryId: null,
    version: t?.version ?? null,
  };
}

export async function loadTournamentForm(ctx: TourCtx, eventId: string | null, fromEventId: string | null): Promise<TourLoad<ChTourFormData>> {
  return guard<ChTourFormData>('form', async () => {
    const info = await readTeam(ctx);
    const read = await readEvents(ctx, info.team.timezone, eventId ? { ids: [eventId] } : {});
    const idx = eventId ? read.events.findIndex((e) => e.id === eventId) : -1;
    if (eventId && idx < 0) return { kind: 'missing' };
    const givers = eventId
      ? (
          await all<TourAdviceGiverRow>('adviceGivers', (from, to) =>
            tourTable(ctx.supabase, 'golf_tournament_advice_givers').select(TOUR_COLUMNS.golf_tournament_advice_givers).eq('tournament_id', eventId).order('user_id').range(from, to),
          )
        ).map((g) => g.user_id)
      : [];
    const [staff, quals, from] = await Promise.all([
      section('form', 'staff', () => staffNames(ctx)),
      section('form', 'qualifiers', () =>
        all<{ id: string; name: string; status: string | null }>('qualifiers', (f, t) => ctx.supabase.from('golf_qualifiers').select('id, name, status').eq('team_id', ctx.teamId).eq('is_test', false).order('start_date', { ascending: false }).range(f, t)),
      ),
      fromEventId
        ? section('form', 'fromCalendar', async () => {
            const { data, error } = await ctx.supabase.from('golf_events').select('id, title').eq('id', fromEventId).eq('team_id', ctx.teamId).maybeSingle();
            if (error) throw new ReadFailed('fromCalendar', error);
            return data ? { eventId: data.id, title: data.title } : null;
          })
        : Promise.resolve({ ok: true as const, value: null }),
    ]);
    const courses = Object.values(read.courses).map((c) => ({ id: c.id, name: c.name, tees: c.tees ? [c.tees] : [] }));
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        mode: eventId ? 'edit' : 'new',
        eventId,
        initial: draftOf(idx >= 0 ? read.events[idx]! : null, idx >= 0 ? read.raws[idx]!.t : null, givers),
        courses,
        qualifiers: quals.ok ? quals.value.map((q) => ({ id: q.id, name: q.name, status: q.status === 'completed' || q.status === 'closed' ? ('closed' as const) : ('open' as const) })) : [],
        staff: staff.ok ? staff.value.map((s) => ({ id: s.userId, name: s.name })) : [],
        // Itineraries are linked by the form once a column holds the link (not in the held tables).
        itineraries: [],
        fromCalendar: from.ok ? from.value : null,
        errors: { ...(staff.ok ? {} : { staff: true as const }), ...(quals.ok ? {} : { qualifiers: true as const }) },
      },
    };
  });
}

export async function loadTournamentLineup(ctx: TourCtx, eventId: string): Promise<TourLoad<ChTourLineupData>> {
  return guard<ChTourLineupData>('lineup', async () => {
    const info = await readTeam(ctx);
    const seasonEnd = Number(seasonIdOf(info.today).slice(0, 4)) + 1;
    const [read, players] = await Promise.all([readEvents(ctx, info.team.timezone, { ids: [eventId] }), readPlayers(ctx, seasonEnd)]);
    const event = read.events[0];
    if (!event) return { kind: 'missing' };
    const lineup = event.entries.filter((x) => x.role === 'lineup');
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        event,
        players,
        // Count chance, form and the projection are the lineup lane's engines (D-93: never below the gate): the roster
        // with its availability only until that view is built.
        candidates: players.filter((p) => !p.alumni).map((p) => ({ playerId: p.id, availability: p.availability, form: [], qualifying: null, countRate: null, countRounds: 0, chance: null, chancePct: null, eligibleRounds: 0, course: { rounds: 0, avgToPar: null } })),
        slots: Array.from({ length: event.format.players }, (_, i) => ({ slot: i + 1, playerId: lineup.find((x) => x.slot === i + 1)?.playerId ?? null, reason: null, squad: 'A' as const })),
        alternate: event.entries.find((x) => x.role === 'alternate')?.playerId ?? null,
        individuals: event.entries.filter((x) => x.role === 'individual').map((x) => x.playerId),
        projection: null,
        projectionShort: [],
        lineup: event.lineup,
        qualifier: null,
        errors: {},
      },
    };
  });
}

/** The live round is held file 6 (100500, not written): the snapshot is the event's own state, with no hole feed. */
export async function loadTournamentLive(ctx: TourCtx, eventId: string): Promise<TourLoad<ChTourLiveSnapshot>> {
  return guard<ChTourLiveSnapshot>('live', async () => {
    const info = await readTeam(ctx);
    const seasonEnd = Number(seasonIdOf(info.today).slice(0, 4)) + 1;
    const [read, players] = await Promise.all([readEvents(ctx, info.team.timezone, { ids: [eventId] }), readPlayers(ctx, seasonEnd)]);
    const event = read.events[0];
    if (!event) return { kind: 'missing' };
    const round = event.rounds.find((r) => r.status === 'live' || r.status === 'suspended') ?? event.rounds.find((r) => r.status === 'upcoming') ?? event.rounds[event.rounds.length - 1];
    if (!round) return { kind: 'missing' };
    const team = event.team.rounds.find((r) => r.roundNumber === round.number);
    const course: ChTourCourse = read.courses[round.courseId] ?? { id: round.courseId, name: '', tees: '', par: round.par, rating: null, holes: [] };
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        seq: 0,
        event,
        round,
        players,
        course,
        lanes: [],
        team: team ?? { kind: 'none', total: null, toPar: null, counting: [], dropped: [], tiedAtBoundary: [] },
        field: event.field,
        presence: [],
        appScoring: 'off',
        moments: [],
        projection: null,
        errors: {},
      },
    };
  });
}

// ── The player's view ───────────────────────────────────────────────────────────────────────────────────────────

/**
 * A player's Tournaments: the events and their dates, and their own rows only (reveal, results, notes and reflections
 * are held file 4's surfaces: not read here, so a draft lineup or a teammate's score never reaches the player).
 */
export async function loadPlayerTournaments(ctx: TourCtx, eventId: string | null): Promise<TourLoad<ChTourPlayerData>> {
  return guard<ChTourPlayerData>('player', async () => {
    if (!ctx.playerId) return { kind: 'missing' };
    const info = await readTeam(ctx);
    const seasonEnd = Number(seasonIdOf(info.today).slice(0, 4)) + 1;
    const [read, players] = await Promise.all([readEvents(ctx, info.team.timezone, { own: ctx.playerId }), readPlayers(ctx, seasonEnd)]);
    const me = players.find((p) => p.id === ctx.playerId);
    if (!me) return { kind: 'missing' };
    const season = seasonIdOf(info.today);
    const list = read.events
      .filter((e) => e.seasonId === season)
      .sort((a, b) => (a.status === 'complete') === (b.status === 'complete') ? (a.status === 'complete' ? b.startDate.localeCompare(a.startDate) : a.startDate.localeCompare(b.startDate)) : a.status === 'complete' ? 1 : -1)
      .map((e) => ({ eventId: e.id, name: e.name, startDate: e.startDate, endDate: e.endDate, courseName: read.courses[e.courseIds[0] ?? '']?.name ?? '', status: e.status, mine: null }));
    const open = eventId ? read.events.find((e) => e.id === eventId) : null;
    if (eventId && !open) return { kind: 'missing' };
    return {
      kind: 'ready',
      data: {
        now: ctx.now,
        me,
        team: info.team,
        list,
        event: open
          ? {
              // The player's copy of the event carries no lineup and no teammates' scores (D-85).
              event: { ...open, entries: [], playerRounds: open.playerRounds.filter((p) => p.playerId === ctx.playerId), team: { rounds: [], result: null }, field: null },
              reveal: null,
              trip: null,
              results: { visible: false, reason: open.status === 'complete' ? null : 'not_final' },
              sharedNotes: [],
              reflection: null,
              moments: [],
              following: false,
            }
          : null,
        window: { in: false, until: null, day: null },
        season: { counted: 0, of: 0, rounds: 0, roundsTarget: null, perEighteen: { event: null, qualifier: null, practice: null }, n: { event: 0, qualifier: 0, practice: 0 }, early: true },
        // The player's season line (counted, per 18) is held file 4's: zeros here are never drawn (the view is a placeholder).
        errors: {},
      },
    };
  });
}

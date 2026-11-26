import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRowsResult } from '@/lib/supabase/fetch-all-rows';
import { chunkIds } from '@/lib/supabase/chunk-ids';
import { logServerError } from '@/lib/server-error-logger';
import { FAILURE_SEVERITIES } from '@/lib/admin/severity';
import { DEMO_TEAM_IDS } from '@/app/golf/actions/admin/demo-teams';
import { fetchPulseGrid, type PulseGridResult, type PulseTeamRow } from '@/lib/admin/data/pulse-grid';
import { readSessionEvents, readSessions } from '@/lib/admin/clubhouse/live';
import { failingCodes } from '@/lib/admin/clubhouse/live-model';
import { PLATFORM_WORDS } from '@/lib/admin/clubhouse/live-scope';
import {
  DAY_MS,
  WINDOW_DAYS,
  buildTimeline,
  dailyPeopleActive,
  isTestTeam,
  summarizePerson,
  summarizeTeamPeople,
  teamState,
  windowDays,
  type Member,
  type PersonSummary,
  type Sport,
  type TeamActivityRow,
  type TeamPeopleSummary,
  type TeamState,
  type TimelineItem,
  type Touch,
} from './people-space-model';

/**
 * People space reads (Bridge B17 teams by activity, B18 one team). Definitions and shaping live in
 * `people-space-model.ts`; this file only reads.
 *
 * COST BOUND: a fixed number of queries per page, never one per person. The list page reuses Teams pulse
 * (`fetchPulseGrid`, ~11 reads) for state, the 30-day line and errors, then adds: 4 membership reads, 3 platform
 * reads for rounds, games and events (paged past the 1,000-row cap), and 4 reads keyed by the roster's user ids
 * (sign-ins, golf and baseball messages, Clubhouse sessions), each chunked at ID_CHUNK_SIZE (the `.in()` URL limit)
 * and paged. Only teams with no sign-in in the window get a further `.limit(1)` all-time lookup (two at most each).
 * The team page reads the same sources scoped to one team.
 *
 * HONESTY: every read checks `.error`. A failed read is named in `degraded` and the page says the numbers are
 * incomplete; it never turns into a confident zero.
 *
 * PRIVACY: players may be minors. This reads names, sign-in times and Clubhouse device only because
 * /admin/users/[id], the team page and the Clubhouse person page already show them to super admins. It never reads
 * or returns an email or phone number, and writes nothing. Message activity is shown per coach but only at team level
 * for players: a player's message count and message times are never tied to their name (security review 2026-11-26).
 *
 * CALLER must have passed requireSuperAdmin(): every read uses the service-role client.
 */

type Admin = ReturnType<typeof createAdminClient>;
type DbError = { message: string; code?: string | null } | null;
type Page<T> = PromiseLike<{ data: T[] | null; error: DbError }>;

const iso = (t: number) => new Date(t).toISOString();

class Reads {
  readonly degraded = new Set<string>();
  constructor(readonly admin: Admin, private readonly action: string) {}

  async note(label: string, error: DbError): Promise<void> {
    if (!error) return;
    this.degraded.add(label);
    await logServerError(`${this.action}: ${label} read failed: ${error.message}`, {
      action: this.action,
      feature: 'admin_bridge',
      errorCode: error.code ?? undefined,
    });
  }

  async paged<T>(label: string, build: (from: number, to: number) => Page<T>): Promise<T[]> {
    const { data, error } = await fetchAllRowsResult<T>(build);
    await this.note(label, error);
    return data ?? [];
  }

  /** One `.in()` read per chunk of ids, each paged. */
  async byIds<T>(label: string, ids: readonly string[], build: (batch: string[], from: number, to: number) => Page<T>): Promise<T[]> {
    const out: T[] = [];
    for (const batch of chunkIds([...new Set(ids)])) {
      out.push(...(await this.paged<T>(label, (from, to) => build(batch, from, to))));
    }
    return out;
  }
}

// ---------------------------------------------------------------------------
// Membership: who is on which team, as coach or player
// ---------------------------------------------------------------------------

type PlayerEmbed = { user_id: string; first_name: string | null; last_name: string | null } | null;
type CoachEmbed = { user_id: string; full_name: string | null; title: string | null } | null;
type GolfMemberRow = { team_id: string; player_id: string; golf_players: PlayerEmbed };
type BaseballMemberRow = { team_id: string; player_id: string; baseball_players: PlayerEmbed };
type GolfStaffRow = { team_id: string; coach_id: string; is_primary: boolean | null; golf_coaches: CoachEmbed };
type BaseballStaffRow = { team_id: string; coach_id: string; is_primary: boolean | null; title: string | null; baseball_coaches: CoachEmbed };

interface Roster {
  members: Member[];
  /** golf_players.id -> users.id, for golf_rounds.player_id. */
  playerUser: Map<string, string>;
  /** golf_coaches.id / baseball_coaches.id -> users.id, for created_by on games and events. */
  coachUser: Map<string, string>;
}

const playerName = (p: PlayerEmbed) => [p?.first_name, p?.last_name].filter(Boolean).join(' ').trim() || null;

async function readRoster(r: Reads, sports: readonly Sport[], teamId?: string): Promise<Roster> {
  const { admin } = r;
  const scope = <Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q => (teamId ? q.eq('team_id', teamId) : q);
  const golf = sports.includes('golf');
  const baseball = sports.includes('baseball');
  const [gm, gs, bm, bs] = await Promise.all([
    golf
      ? r.paged<GolfMemberRow>('golf roster', (from, to) =>
          scope(admin.from('golf_team_members').select('team_id, player_id, golf_players(user_id, first_name, last_name)').eq('status', 'active'))
            .order('id', { ascending: true })
            .range(from, to) as unknown as Page<GolfMemberRow>,
        )
      : [],
    golf
      ? r.paged<GolfStaffRow>('golf staff', (from, to) =>
          scope(admin.from('golf_team_coach_staff').select('team_id, coach_id, is_primary, golf_coaches(user_id, full_name, title)'))
            .order('id', { ascending: true })
            .range(from, to) as unknown as Page<GolfStaffRow>,
        )
      : [],
    baseball
      ? r.paged<BaseballMemberRow>('baseball roster', (from, to) =>
          scope(admin.from('baseball_team_members').select('team_id, player_id, baseball_players(user_id, first_name, last_name)').eq('status', 'active'))
            .order('id', { ascending: true })
            .range(from, to) as unknown as Page<BaseballMemberRow>,
        )
      : [],
    baseball
      ? r.paged<BaseballStaffRow>('baseball staff', (from, to) =>
          // No status filter, matching Teams pulse's staff membership, so "people" means the same on both screens.
          scope(admin.from('baseball_team_coach_staff').select('team_id, coach_id, is_primary, title, baseball_coaches(user_id, full_name, title)'))
            .order('id', { ascending: true })
            .range(from, to) as unknown as Page<BaseballStaffRow>,
        )
      : [],
  ]);
  const members: Member[] = [];
  const playerUser = new Map<string, string>();
  const coachUser = new Map<string, string>();
  const seen = new Set<string>();
  const add = (m: Member) => {
    const key = `${m.teamId}:${m.userId}`;
    // Someone both coaching and rostered on one team counts once, as a coach.
    if (seen.has(key)) return;
    seen.add(key);
    members.push(m);
  };
  for (const s of gs) {
    if (!s.golf_coaches?.user_id) continue;
    coachUser.set(s.coach_id, s.golf_coaches.user_id);
    add({ teamId: s.team_id, userId: s.golf_coaches.user_id, role: 'coach', name: s.golf_coaches.full_name, title: s.golf_coaches.title, isPrimary: !!s.is_primary });
  }
  for (const s of bs) {
    if (!s.baseball_coaches?.user_id) continue;
    coachUser.set(s.coach_id, s.baseball_coaches.user_id);
    add({ teamId: s.team_id, userId: s.baseball_coaches.user_id, role: 'coach', name: s.baseball_coaches.full_name, title: s.title ?? s.baseball_coaches.title, isPrimary: !!s.is_primary });
  }
  for (const m of gm) {
    if (!m.golf_players?.user_id) continue;
    playerUser.set(m.player_id, m.golf_players.user_id);
    add({ teamId: m.team_id, userId: m.golf_players.user_id, role: 'player', name: playerName(m.golf_players), title: null, isPrimary: false });
  }
  for (const m of bm) {
    if (!m.baseball_players?.user_id) continue;
    add({ teamId: m.team_id, userId: m.baseball_players.user_id, role: 'player', name: playerName(m.baseball_players), title: null, isPrimary: false });
  }
  return { members, playerUser, coachUser };
}

// ---------------------------------------------------------------------------
// Timestamps people left behind
// ---------------------------------------------------------------------------

type RoundRow = { team_id: string | null; player_id: string; created_at: string | null; status: string | null };
type GameRow = { team_id: string; created_by: string | null; created_at: string | null; status: string };
type EventRow = { team_id: string; created_by: string | null; created_at: string | null };
type SessionRow = { user_id: string | null; team_id: string | null; last_at: string; platform: string };

interface TouchRead {
  touches: Touch[];
  /** Completed rounds (golf) and games (baseball) per team, with their timestamps. */
  teamRounds: Map<string, string[]>;
  teamEvents: Map<string, number>;
  /** Latest Clubhouse platform per user, in words. */
  device: Map<string, string>;
  sessions: SessionRow[];
}

async function readTouches(r: Reads, roster: Roster, sinceIso: string, teamId?: string): Promise<TouchRead> {
  const { admin } = r;
  const userIds = [...new Set(roster.members.map((m) => m.userId))];
  const team = <Q extends { eq: (c: string, v: string) => Q }>(q: Q): Q => (teamId ? q.eq('team_id', teamId) : q);
  const [logins, golfMessages, baseballMessages, sessions, rounds, games, golfEvents, baseballEvents] = await Promise.all([
    r.byIds<{ user_id: string | null; created_at: string | null }>('sign-ins', userIds, (batch, from, to) =>
      admin
        .from('admin_events')
        .select('user_id, created_at')
        .eq('event_type', 'login')
        .gte('created_at', sinceIso)
        .in('user_id', batch)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    r.byIds<{ sender_id: string; created_at: string | null }>('golf messages', userIds, (batch, from, to) =>
      admin
        .from('golf_messages')
        .select('sender_id, created_at')
        .not('is_deleted', 'is', true)
        .gte('created_at', sinceIso)
        .in('sender_id', batch)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    r.byIds<{ sender_id: string; created_at: string | null }>('baseball messages', userIds, (batch, from, to) =>
      admin
        .from('baseball_messages')
        .select('sender_id, created_at')
        .gte('created_at', sinceIso)
        .in('sender_id', batch)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    r.byIds<SessionRow>('clubhouse sessions', userIds, (batch, from, to) =>
      admin
        .from('clubhouse_sessions')
        .select('user_id, team_id, last_at, platform')
        .gte('last_at', sinceIso)
        .in('user_id', batch)
        .order('session_id', { ascending: true })
        .range(from, to),
    ),
    r.paged<RoundRow>('golf rounds', (from, to) =>
      team(admin.from('golf_rounds').select('team_id, player_id, created_at, status').gte('created_at', sinceIso))
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<RoundRow>,
    ),
    r.paged<GameRow>('baseball games', (from, to) =>
      team(admin.from('baseball_games').select('team_id, created_by, created_at, status').gte('created_at', sinceIso))
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<GameRow>,
    ),
    r.paged<EventRow>('golf events', (from, to) =>
      team(admin.from('golf_events').select('team_id, created_by, created_at').gte('created_at', sinceIso))
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<EventRow>,
    ),
    r.paged<EventRow>('baseball events', (from, to) =>
      team(admin.from('baseball_events').select('team_id, created_by, created_at').gte('created_at', sinceIso))
        .order('id', { ascending: true })
        .range(from, to) as unknown as Page<EventRow>,
    ),
  ]);

  const touches: Touch[] = [];
  const push = (userId: string | null | undefined, at: string | null | undefined, kind: Touch['kind'], source: string) => {
    if (userId && at) touches.push({ userId, at, kind, source });
  };
  for (const l of logins) push(l.user_id, l.created_at, 'sign_in', 'admin_events');
  for (const m of golfMessages) push(m.sender_id, m.created_at, 'message', 'golf_messages');
  for (const m of baseballMessages) push(m.sender_id, m.created_at, 'message', 'baseball_messages');
  const device = new Map<string, { at: string; platform: string }>();
  for (const s of sessions) {
    push(s.user_id, s.last_at, 'session', 'clubhouse_sessions');
    if (!s.user_id) continue;
    const prev = device.get(s.user_id);
    if (!prev || Date.parse(s.last_at) > Date.parse(prev.at)) device.set(s.user_id, { at: s.last_at, platform: s.platform });
  }
  const teamRounds = new Map<string, string[]>();
  const addRound = (t: string | null, at: string | null) => {
    if (!t || !at) return;
    teamRounds.set(t, [...(teamRounds.get(t) ?? []), at]);
  };
  for (const g of rounds) {
    push(roster.playerUser.get(g.player_id), g.created_at, 'round', 'golf_rounds');
    if (g.status === 'completed') addRound(g.team_id, g.created_at);
  }
  for (const g of games) {
    push(g.created_by ? roster.coachUser.get(g.created_by) : null, g.created_at, 'game', 'baseball_games');
    if (g.status === 'completed') addRound(g.team_id, g.created_at);
  }
  const teamEvents = new Map<string, number>();
  for (const [rows, source] of [
    [golfEvents, 'golf_events'],
    [baseballEvents, 'baseball_events'],
  ] as const) {
    for (const e of rows) {
      push(e.created_by ? roster.coachUser.get(e.created_by) : null, e.created_at, 'event', source);
      if (e.created_at) teamEvents.set(e.team_id, (teamEvents.get(e.team_id) ?? 0) + 1);
    }
  }
  return {
    touches,
    teamRounds,
    teamEvents,
    device: new Map([...device].map(([u, d]) => [u, PLATFORM_WORDS[d.platform] ?? d.platform])),
    sessions,
  };
}

/** The latest recorded sign-in of any of these users, ever (one `.limit(1)` read per id chunk). */
async function signInEver(r: Reads, userIds: readonly string[]): Promise<{ userId: string; at: string } | null> {
  let best: { userId: string; at: string } | null = null;
  for (const batch of chunkIds([...new Set(userIds)])) {
    const { data, error } = await r.admin
      .from('admin_events')
      .select('user_id, created_at')
      .eq('event_type', 'login')
      .in('user_id', batch)
      .order('created_at', { ascending: false })
      .limit(1);
    await r.note('all-time sign-ins', error);
    const row = (data ?? [])[0] as { user_id: string | null; created_at: string | null } | undefined;
    if (row?.user_id && row.created_at && (!best || Date.parse(row.created_at) > Date.parse(best.at))) best = { userId: row.user_id, at: row.created_at };
  }
  return best;
}

/** Was a round (golf) or game (baseball) ever logged for this team? One `.limit(1)` read. */
async function anyRoundEver(r: Reads, teamId: string, sport: Sport): Promise<boolean> {
  const table = sport === 'golf' ? 'golf_rounds' : 'baseball_games';
  const { data, error } = await r.admin.from(table).select('id').eq('team_id', teamId).limit(1);
  await r.note('all-time rounds', error);
  return (data ?? []).length > 0;
}

function touchesByUser(touches: readonly Touch[]): Map<string, Touch[]> {
  const out = new Map<string, Touch[]>();
  for (const t of touches) out.set(t.userId, [...(out.get(t.userId) ?? []), t]);
  return out;
}

const inLast = (list: readonly string[] | undefined, now: number, days: number) =>
  (list ?? []).filter((at) => now - Date.parse(at) <= days * DAY_MS).length;

async function safePulse(r: Reads): Promise<PulseGridResult | null> {
  try {
    const pulse = await fetchPulseGrid('attention');
    if (/INCOMPLETE THIS RUN/.test(pulse.degradedNote)) r.degraded.add('Teams pulse');
    return pulse;
  } catch (e) {
    await r.note('Teams pulse', { message: e instanceof Error ? e.message : String(e) });
    return null;
  }
}

// ---------------------------------------------------------------------------
// B17: every team, by activity
// ---------------------------------------------------------------------------

export interface TeamsActivityResult {
  rows: TeamActivityRow[];
  degraded: string[];
  generatedAt: string;
}

export async function readTeamsActivity(): Promise<TeamsActivityResult> {
  const r = new Reads(createAdminClient(), 'admin.people-space.readTeamsActivity');
  const now = new Date();
  const since = iso(now.getTime() - WINDOW_DAYS * DAY_MS);
  const [pulse, roster] = await Promise.all([safePulse(r), readRoster(r, ['golf', 'baseball'])]);
  if (!pulse) return { rows: [], degraded: [...r.degraded], generatedAt: now.toISOString() };
  const read = await readTouches(r, roster, since);
  const byUser = touchesByUser(read.touches);
  const membersByTeam = new Map<string, Member[]>();
  for (const m of roster.members) membersByTeam.set(m.teamId, [...(membersByTeam.get(m.teamId) ?? []), m]);

  const rows = await Promise.all(
    pulse.teams.map(async (t: PulseTeamRow): Promise<TeamActivityRow> => {
      const members = membersByTeam.get(t.teamId) ?? [];
      const people = members.map((m) =>
        summarizePerson(m, byUser.get(m.userId) ?? [], { now, errors30d: null, device: null, roundsArePerPerson: t.sport === 'golf' }),
      );
      const summary = summarizeTeamPeople(people);
      let lastSignIn = summary.lastSignIn ? { at: summary.lastSignIn.at, role: summary.lastSignIn.role } : null;
      if (!lastSignIn && members.length > 0) {
        const ever = await signInEver(r, members.map((m) => m.userId));
        const who = ever ? members.find((m) => m.userId === ever.userId) : undefined;
        if (ever && who) lastSignIn = { at: ever.at, role: who.role };
      }
      const hasHistory = t.halo !== 'silent' || lastSignIn !== null || (await anyRoundEver(r, t.teamId, t.sport));
      const rounds = read.teamRounds.get(t.teamId);
      return {
        teamId: t.teamId,
        name: t.name,
        sport: t.sport,
        isTest: isTestTeam(t.teamId, t.name, DEMO_TEAM_IDS),
        players: summary.players.total,
        coaches: summary.coaches.total,
        people: summary.people,
        activeToday: summary.activeToday,
        active7d: summary.active7d,
        active30d: summary.active30d,
        playersActive7d: summary.players.active7d,
        coachesActive7d: summary.coaches.active7d,
        lastSignIn,
        activity: t.buckets.map((b) => b.activity),
        rounds30d: rounds?.length ?? 0,
        rounds7d: inLast(rounds, now.getTime(), 7),
        errors30d: t.errors30d,
        state: teamState(t.halo, hasHistory),
        daysSinceActivity: t.lastActivityDate ? t.daysSinceActivity : null,
        attentionScore: t.attentionScore,
        href: `/admin/spaces/people/${t.teamId}`,
      };
    }),
  );
  return { rows, degraded: [...r.degraded], generatedAt: now.toISOString() };
}

// ---------------------------------------------------------------------------
// B18: one team
// ---------------------------------------------------------------------------

export interface TeamFacts {
  rounds30d: number;
  rounds7d: number;
  messages30d: number;
  messages7d: number;
  events30d: number;
  nextEventAt: string | null;
  /** Golf only (CoachHelm); null for baseball or when the read failed. */
  insights30d: number | null;
  insightsRead: number | null;
  errors30d: number | null;
  errorsToday: number | null;
  /** Clubhouse sessions in the last 24 hours; null for baseball (BaseballHelm sends no Clubhouse signals). */
  clubhouseSessionsToday: number | null;
}

export interface TeamCodes {
  state: 'ok' | 'no-signal' | 'error' | 'not-golf';
  rows: Array<{ code: string; page: string; count: number; sessions: number }>;
  failedSessions: number;
  truncated: boolean;
  error?: string;
}

export interface TeamPeopleResult {
  team: { id: string; name: string; sport: Sport; isTest: boolean };
  state: TeamState | null;
  daysSinceActivity: number | null;
  people: PersonSummary[];
  summary: TeamPeopleSummary;
  chart: { values: number[]; roundDays: number[]; days: string[] };
  facts: TeamFacts;
  timeline: TimelineItem[];
  codes: TeamCodes;
  /** The coach a "View as" opens: the primary coach, else the first coach on file. */
  viewAsUserId: string | null;
  degraded: string[];
  generatedAt: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Null when the id is not a team in either sport (the page calls notFound()). */
export async function readTeamPeople(teamId: string): Promise<TeamPeopleResult | null> {
  if (!UUID.test(teamId)) return null;
  const admin = createAdminClient();
  const r = new Reads(admin, 'admin.people-space.readTeamPeople');
  const now = new Date();
  const nowMs = now.getTime();
  const since = iso(nowMs - WINDOW_DAYS * DAY_MS);

  const [golfTeam, baseballTeam] = await Promise.all([
    admin.from('golf_teams').select('id, name').eq('id', teamId).maybeSingle(),
    admin.from('baseball_teams').select('id, name').eq('id', teamId).maybeSingle(),
  ]);
  if (golfTeam.error && baseballTeam.error) throw new Error(`people-space team lookup: ${golfTeam.error.message}`);
  const found = golfTeam.data ? { ...golfTeam.data, sport: 'golf' as const } : baseballTeam.data ? { ...baseballTeam.data, sport: 'baseball' as const } : null;
  if (!found) return null;
  const sport = found.sport;

  const [pulse, roster] = await Promise.all([safePulse(r), readRoster(r, [sport], teamId)]);
  const pulseRow = pulse?.teams.find((t) => t.teamId === teamId) ?? null;
  const members = roster.members;
  const userIds = members.map((m) => m.userId);
  const read = await readTouches(r, roster, since, teamId);
  const byUser = touchesByUser(read.touches);

  const [errorRows, insights, nextEvent, codes] = await Promise.all([
    r.byIds<{ user_id: string | null }>('errors by person', userIds, (batch, from, to) =>
      admin
        .from('admin_events')
        .select('user_id')
        .eq('event_type', 'error')
        .eq('resolved', false)
        .in('severity', FAILURE_SEVERITIES)
        .gte('created_at', since)
        .in('user_id', batch)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    sport === 'golf'
      ? admin.from('golf_coach_insights').select('created_at, acknowledged_at').eq('team_id', teamId).gte('created_at', since).limit(1000)
      : Promise.resolve(null),
    admin
      .from(sport === 'golf' ? 'golf_events' : 'baseball_events')
      .select('start_time')
      .eq('team_id', teamId)
      .gte('start_time', now.toISOString())
      .order('start_time', { ascending: true })
      .limit(1),
    sport === 'golf' ? readTeamCodes(teamId, since) : Promise.resolve<TeamCodes>({ state: 'not-golf', rows: [], failedSessions: 0, truncated: false }),
  ]);
  const errorsReadFailed = r.degraded.has('errors by person');
  const errorsByUser = new Map<string, number>();
  for (const e of errorRows) if (e.user_id) errorsByUser.set(e.user_id, (errorsByUser.get(e.user_id) ?? 0) + 1);
  if (insights) await r.note('CoachHelm insights', insights.error);
  await r.note('next event', nextEvent.error);

  // Only people with no sign-in in the window need the all-time lookup (one small read each, on one team).
  const signedInWindow = new Set(read.touches.filter((t) => t.kind === 'sign_in').map((t) => t.userId));
  const ever = new Map<string, string | null>();
  await Promise.all(
    [...new Set(userIds)]
      .filter((u) => !signedInWindow.has(u))
      .map(async (u) => {
        const hit = await signInEver(r, [u]);
        ever.set(u, hit?.at ?? null);
      }),
  );

  const people = members.map((m) =>
    summarizePerson(m, byUser.get(m.userId) ?? [], {
      now,
      signInEver: ever.get(m.userId) ?? null,
      errors30d: errorsReadFailed ? null : errorsByUser.get(m.userId) ?? 0,
      device: read.device.get(m.userId) ?? null,
      roundsArePerPerson: sport === 'golf',
    }),
  );
  const summary = summarizeTeamPeople(people);
  const memberIds = new Set(userIds);
  const chart = { ...dailyPeopleActive(read.touches, memberIds, now), days: windowDays(now) };

  const rounds = read.teamRounds.get(teamId);
  const messages = read.touches.filter((t) => t.kind === 'message');
  const insightRows = insights && !insights.error ? ((insights.data ?? []) as Array<{ created_at: string | null; acknowledged_at: string | null }>) : null;
  const facts: TeamFacts = {
    rounds30d: rounds?.length ?? 0,
    rounds7d: inLast(rounds, nowMs, 7),
    messages30d: messages.length,
    messages7d: inLast(messages.map((m) => m.at), nowMs, 7),
    events30d: read.teamEvents.get(teamId) ?? 0,
    nextEventAt: ((nextEvent.data ?? [])[0] as { start_time: string } | undefined)?.start_time ?? null,
    insights30d: insightRows ? insightRows.length : null,
    insightsRead: insightRows ? insightRows.filter((i) => i.acknowledged_at).length : null,
    errors30d: pulseRow ? pulseRow.errors30d : null,
    errorsToday: pulseRow ? (pulseRow.buckets[pulseRow.buckets.length - 1]?.errors ?? 0) : null,
    clubhouseSessionsToday:
      sport === 'golf' && !r.degraded.has('clubhouse sessions')
        ? read.sessions.filter((s) => s.team_id === teamId && nowMs - Date.parse(s.last_at) <= DAY_MS).length
        : null,
  };

  const extra: TimelineItem[] = (insightRows ?? [])
    .filter((i): i is { created_at: string; acknowledged_at: string | null } => !!i.created_at)
    .map((i) => ({ at: i.created_at, kind: 'insight' as const, what: 'CoachHelm wrote an insight', who: null, role: null, source: 'golf_coach_insights' }));
  const timeline = buildTimeline(
    read.touches.filter((t) => memberIds.has(t.userId)),
    new Map(members.map((m) => [m.userId, { name: m.name, role: m.role }])),
    extra,
  );

  const coaches = members.filter((m) => m.role === 'coach');
  const viewAs = coaches.find((c) => c.isPrimary) ?? coaches[0] ?? null;

  return {
    team: { id: found.id, name: found.name, sport, isTest: isTestTeam(found.id, found.name, DEMO_TEAM_IDS) },
    state: pulseRow
      ? teamState(pulseRow.halo, pulseRow.halo !== 'silent' || summary.lastSignIn !== null || (await anyRoundEver(r, teamId, sport)))
      : null,
    daysSinceActivity: pulseRow?.lastActivityDate ? pulseRow.daysSinceActivity : null,
    people,
    summary,
    chart,
    facts,
    timeline,
    codes,
    viewAsUserId: viewAs?.userId ?? null,
    degraded: [...r.degraded],
    generatedAt: now.toISOString(),
  };
}

/**
 * CH codes this team hit in 30 days, from Clubhouse session events. Only sessions that had a failure keep their
 * events (Clubhouse signals plan §4.5), so this lists failures, never a full page history.
 */
async function readTeamCodes(teamId: string, sinceIso: string): Promise<TeamCodes> {
  const sessions = await readSessions({ teamId, sinceIso, failedOnly: true, limit: 200 });
  if (sessions.state === 'no-signal') return { state: 'no-signal', rows: [], failedSessions: 0, truncated: false };
  if (sessions.state === 'error') return { state: 'error', rows: [], failedSessions: 0, truncated: false, error: sessions.error };
  const events = await readSessionEvents(sessions.data.map((s) => s.session_id));
  if (events.state === 'no-signal') return { state: 'no-signal', rows: [], failedSessions: sessions.data.length, truncated: false };
  if (events.state === 'error') return { state: 'error', rows: [], failedSessions: sessions.data.length, truncated: false, error: events.error };
  return {
    state: 'ok',
    rows: failingCodes(events.data),
    failedSessions: sessions.data.length,
    truncated: !!sessions.truncated || !!events.truncated,
  };
}

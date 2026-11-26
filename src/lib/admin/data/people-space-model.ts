/**
 * People space (Bridge B17 / B18): the pure shaping behind "who uses Helm, team by team".
 * The reads live in `people-space.ts`; everything here is deterministic over already-fetched rows, so it is
 * unit-tested without a database (`__tests__/people-space.test.ts`).
 *
 * DEFINITIONS (one place, so the list and the team page always agree):
 *   - A person is ACTIVE in a window when any of their own timestamps falls inside it: a recorded sign-in
 *     (admin_events login), a round they logged (golf_rounds.player_id), a game or event their coach record created
 *     (baseball_games / golf_events / baseball_events created_by), a message they sent (golf_messages /
 *     baseball_messages sender_id) or a Clubhouse session (clubhouse_sessions.last_at). There is no per-team 7-day
 *     count anywhere else (users.ts activePlayers is 30-day only), so this one is rebuilt from those timestamps.
 *   - Windows are rolling: "today" is the last 24 hours, "this week" the last 7 x 24 hours, "30 days" the last
 *     30 x 24 hours. The 30-day strips and the per-day chart bucket by UTC day, like Teams pulse.
 *   - users.last_seen is NOT used: only the BaseballHelm shell writes it (LastSeenUpdater), so for golf it is stale.
 *   - A team's STATE follows the Teams pulse halo (pulse-grid.ts) so the two screens never disagree: fresh is
 *     active, cooling is slipping, silent splits into dormant (something was ever recorded: a sign-in or a round or
 *     game) and never started (nothing ever recorded).
 *   - "Sign-in" means a RECORDED sign-in: an admin_events row written by logLogin(). Sign-ins before that logger
 *     existed are not counted, so a person with none reads "no sign-in recorded", not "never signed in".
 */

export const DAY_MS = 86_400_000;
export const WINDOW_DAYS = 30;

export type Sport = 'golf' | 'baseball';
export type PersonRole = 'coach' | 'player';
export type TeamState = 'active' | 'slipping' | 'dormant' | 'never';
export type PulseHaloInput = 'fresh' | 'cooling' | 'silent';
export type TouchKind = 'sign_in' | 'round' | 'game' | 'message' | 'event' | 'session';

/** Where each kind of timestamp comes from, shown on the Activity tab next to every row. */
export const TOUCH_SOURCE: Readonly<Record<TouchKind, string>> = {
  sign_in: 'admin_events',
  round: 'golf_rounds',
  game: 'baseball_games',
  message: 'messages',
  event: 'events',
  session: 'clubhouse_sessions',
};

export const TOUCH_WORDS: Readonly<Record<TouchKind, string>> = {
  sign_in: 'Signed in',
  round: 'Logged a round',
  game: 'Logged a game',
  message: 'Sent a message',
  event: 'Scheduled an event',
  session: 'Opened Clubhouse',
};

export interface Member {
  teamId: string;
  userId: string;
  role: PersonRole;
  name: string | null;
  title: string | null;
  isPrimary: boolean;
}

/** One timestamp a person left behind. `source` is the table it was read from. */
export interface Touch {
  userId: string;
  at: string;
  kind: TouchKind;
  source: string;
  /** The team a round, game or event belongs to. Such a touch counts only for that team, on the list and the team page alike. */
  teamId?: string | null;
}

const TEAM_BOUND: ReadonlySet<TouchKind> = new Set(['round', 'game', 'event']);

/** A person's touches as one team sees them: a round, game or event counts only for the team it carries. */
export function touchesForTeam(touches: readonly Touch[], teamId: string): Touch[] {
  return touches.filter((t) => !TEAM_BOUND.has(t.kind) || t.teamId === teamId);
}

export interface PersonSummary {
  userId: string;
  role: PersonRole;
  name: string | null;
  title: string | null;
  isPrimary: boolean;
  /** Latest recorded sign-in, from the window or the all-time lookup. Null: none recorded. */
  lastSignInAt: string | null;
  lastActive: { at: string; kind: TouchKind } | null;
  activeToday: boolean;
  active7d: boolean;
  active30d: boolean;
  /** 30 UTC days, oldest first: nothing, active, or logged a round/game that day. */
  days: Array<'none' | 'active' | 'round'>;
  daysActive30: number;
  /** Golf rounds this person logged in 30 days; null where rounds are not per person (baseball games). */
  rounds30d: number | null;
  messages30d: number;
  /** Error rows attributed to this person in 30 days; null when the read failed. */
  errors30d: number | null;
  /** Platform of their latest Clubhouse session; null when none was recorded. */
  device: string | null;
  /** Whole days since their last activity; null when nothing was ever recorded in the window. */
  quietDays: number | null;
}

export interface RoleSplit {
  total: number;
  activeToday: number;
  active7d: number;
  active30d: number;
  /** People of this role with no recorded sign-in at all. */
  noSignIn: number;
  lastSignInAt: string | null;
}

export interface LastSignIn {
  at: string;
  role: PersonRole;
  name: string | null;
  userId: string;
}

export interface TeamPeopleSummary {
  people: number;
  activeToday: number;
  active7d: number;
  active30d: number;
  coaches: RoleSplit;
  players: RoleSplit;
  lastSignIn: LastSignIn | null;
}

// ---------------------------------------------------------------------------
// Small helpers
// ---------------------------------------------------------------------------

const ms = (iso: string): number => Date.parse(iso);

export function dayKey(iso: string): string {
  return new Date(ms(iso)).toISOString().slice(0, 10);
}

/** The 30 UTC day keys of the window, oldest first, ending today. */
export function windowDays(now: Date, days = WINDOW_DAYS): string[] {
  const out: string[] = [];
  for (let i = days - 1; i >= 0; i -= 1) out.push(new Date(now.getTime() - i * DAY_MS).toISOString().slice(0, 10));
  return out;
}

/** "just now", "12 min ago", "5 hours ago", "1 day ago", "34 days ago". */
export function ago(iso: string | null, now: Date): string | null {
  if (!iso) return null;
  const diff = Math.max(0, now.getTime() - ms(iso));
  const min = Math.floor(diff / 60_000);
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} ${hours === 1 ? 'hour' : 'hours'} ago`;
  const days = Math.floor(hours / 24);
  return `${days} ${days === 1 ? 'day' : 'days'} ago`;
}

export function latest(a: string | null, b: string | null): string | null {
  if (!a) return b;
  if (!b) return a;
  return ms(a) >= ms(b) ? a : b;
}

/** The pulse halo plus "was anything ever recorded" gives the four states. */
export function teamState(halo: PulseHaloInput, hasHistory: boolean): TeamState {
  if (halo === 'fresh') return 'active';
  if (halo === 'cooling') return 'slipping';
  return hasHistory ? 'dormant' : 'never';
}

export const STATE_WORDS: Readonly<Record<TeamState, string>> = {
  active: 'active',
  slipping: 'slipping',
  dormant: 'dormant',
  never: 'never started',
};

const TEST_NAME = [/\btest\b/i, /\bdemo\b/i, /\be2e\b/i, /\bqa\b/i];

/**
 * Test or demo team: one of the seeded DEMO_TEAM_IDS, or a name that says test / demo / e2e / qa as a word. The
 * word boundary keeps a real program whose name merely contains those letters ("Contest") out.
 */
export function isTestTeam(teamId: string, name: string, demoIds: ReadonlySet<string>): boolean {
  if (demoIds.has(teamId)) return true;
  return TEST_NAME.some((p) => p.test(name));
}

// ---------------------------------------------------------------------------
// One person
// ---------------------------------------------------------------------------

export function summarizePerson(
  member: Member,
  touches: readonly Touch[],
  o: {
    now: Date;
    /** All-time latest recorded sign-in when the window held none (the reader looks it up only then). */
    signInEver?: string | null;
    errors30d: number | null;
    device: string | null;
    roundsArePerPerson: boolean;
  },
): PersonSummary {
  const now = o.now.getTime();
  const keys = windowDays(o.now);
  const index = new Map(keys.map((k, i) => [k, i]));
  const days: PersonSummary['days'] = keys.map(() => 'none');
  let lastActive: PersonSummary['lastActive'] = null;
  // Any activity, for the active flags. A player's message counts as activity, but its time is never shown beside
  // their name (players may be minors): it stays out of lastActive, the day strip and "quiet N days".
  let lastAnyAt: number | null = null;
  let lastSignInAt: string | null = null;
  let rounds = 0;
  let messages = 0;
  for (const t of touches) {
    const at = ms(t.at);
    if (!Number.isFinite(at) || at > now + 60_000) continue;
    const hidden = member.role === 'player' && t.kind === 'message';
    if (lastAnyAt === null || at > lastAnyAt) lastAnyAt = at;
    if (!hidden && (!lastActive || at > ms(lastActive.at))) lastActive = { at: t.at, kind: t.kind };
    if (t.kind === 'sign_in') lastSignInAt = latest(lastSignInAt, t.at);
    if (now - at > WINDOW_DAYS * DAY_MS) continue;
    if (t.kind === 'round') rounds += 1;
    if (t.kind === 'message') messages += 1;
    if (hidden) continue;
    const i = index.get(dayKey(t.at));
    if (i === undefined) continue;
    if (t.kind === 'round' || t.kind === 'game') days[i] = 'round';
    else if (days[i] === 'none') days[i] = 'active';
  }
  lastSignInAt = latest(lastSignInAt, o.signInEver ?? null);
  const since = lastAnyAt === null ? null : now - lastAnyAt;
  const shownSince = lastActive ? now - ms(lastActive.at) : null;
  return {
    userId: member.userId,
    role: member.role,
    name: member.name,
    title: member.title,
    isPrimary: member.isPrimary,
    lastSignInAt,
    lastActive,
    activeToday: since !== null && since <= DAY_MS,
    active7d: since !== null && since <= 7 * DAY_MS,
    active30d: since !== null && since <= WINDOW_DAYS * DAY_MS,
    days,
    daysActive30: days.filter((d) => d !== 'none').length,
    rounds30d: o.roundsArePerPerson ? rounds : null,
    messages30d: messages,
    errors30d: o.errors30d,
    device: o.device,
    quietDays: shownSince === null ? null : Math.floor(shownSince / DAY_MS),
  };
}

// ---------------------------------------------------------------------------
// One team's people
// ---------------------------------------------------------------------------

function split(people: readonly PersonSummary[]): RoleSplit {
  let lastSignInAt: string | null = null;
  for (const p of people) lastSignInAt = latest(lastSignInAt, p.lastSignInAt);
  return {
    total: people.length,
    activeToday: people.filter((p) => p.activeToday).length,
    active7d: people.filter((p) => p.active7d).length,
    active30d: people.filter((p) => p.active30d).length,
    noSignIn: people.filter((p) => p.lastSignInAt === null).length,
    lastSignInAt,
  };
}

/** Who signed in last. A tie goes to the coach, whose sign-in is the one an operator acts on. */
export function lastSignInOf(people: readonly PersonSummary[]): LastSignIn | null {
  let best: LastSignIn | null = null;
  for (const p of people) {
    if (!p.lastSignInAt) continue;
    const t = ms(p.lastSignInAt);
    if (!best || t > ms(best.at) || (t === ms(best.at) && p.role === 'coach' && best.role !== 'coach')) {
      best = { at: p.lastSignInAt, role: p.role, name: p.name, userId: p.userId };
    }
  }
  return best;
}

export function summarizeTeamPeople(people: readonly PersonSummary[]): TeamPeopleSummary {
  const coaches = people.filter((p) => p.role === 'coach');
  const players = people.filter((p) => p.role === 'player');
  return {
    people: people.length,
    activeToday: people.filter((p) => p.activeToday).length,
    active7d: people.filter((p) => p.active7d).length,
    active30d: people.filter((p) => p.active30d).length,
    coaches: split(coaches),
    players: split(players),
    lastSignIn: lastSignInOf(people),
  };
}

/** People table order: most recent sign-in first, then by name; people with none recorded last. */
export type PeopleSort = 'signin' | 'active' | 'name';
export const PEOPLE_SORTS: readonly PeopleSort[] = ['signin', 'active', 'name'];

export function sortPeople(people: readonly PersonSummary[], sort: PeopleSort): PersonSummary[] {
  const byName = (a: PersonSummary, b: PersonSummary) => (a.name ?? '').localeCompare(b.name ?? '') || a.userId.localeCompare(b.userId);
  const desc = (a: string | null, b: string | null) => (a === b ? 0 : a === null ? 1 : b === null ? -1 : ms(b) - ms(a));
  return [...people].sort((a, b) => {
    if (sort === 'name') return byName(a, b);
    if (sort === 'active') return b.daysActive30 - a.daysActive30 || desc(a.lastActive?.at ?? null, b.lastActive?.at ?? null) || byName(a, b);
    return desc(a.lastSignInAt, b.lastSignInAt) || byName(a, b);
  });
}

/** Distinct people active on each UTC day of the window, and the days a round or game was logged. */
export function dailyPeopleActive(
  touches: readonly Touch[],
  memberIds: ReadonlySet<string>,
  now: Date,
): { values: number[]; roundDays: number[] } {
  const keys = windowDays(now);
  const index = new Map(keys.map((k, i) => [k, i]));
  const sets = keys.map(() => new Set<string>());
  const rounds = new Set<number>();
  for (const t of touches) {
    const i = index.get(dayKey(t.at));
    if (i === undefined) continue;
    if (t.kind === 'round' || t.kind === 'game') rounds.add(i);
    if (memberIds.has(t.userId)) sets[i]!.add(t.userId);
  }
  return { values: sets.map((s) => s.size), roundDays: [...rounds].sort((a, b) => a - b) };
}

// ---------------------------------------------------------------------------
// The teams list
// ---------------------------------------------------------------------------

export interface TeamActivityRow {
  teamId: string;
  name: string;
  sport: Sport;
  isTest: boolean;
  players: number;
  coaches: number;
  people: number;
  activeToday: number;
  active7d: number;
  active30d: number;
  playersActive7d: number;
  coachesActive7d: number;
  lastSignIn: { at: string; role: PersonRole } | null;
  /** Teams pulse's 30 daily activity counts, oldest first. */
  activity: number[];
  /** Golf: completed rounds. Baseball: completed games. */
  rounds30d: number;
  rounds7d: number;
  errors30d: number;
  state: TeamState;
  /** Whole days since Teams pulse last saw activity; null when it saw none in 30 days. */
  daysSinceActivity: number | null;
  attentionScore: number;
  href: string;
}

export type TeamsSort = 'active' | 'seen' | 'attention' | 'errors';
export const TEAMS_SORTS: readonly TeamsSort[] = ['active', 'seen', 'attention', 'errors'];

export interface TeamsParams {
  sport: Sport | 'all';
  sort: TeamsSort;
  hideTest: boolean;
}

type Params = Record<string, string | string[] | undefined>;
const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

/** Unknown values fall back to the defaults: a stale bookmark still opens the page. */
export function parseTeamsParams(sp: Params): TeamsParams {
  const sport = first(sp.sport);
  const sort = first(sp.sort);
  return {
    sport: sport === 'golf' || sport === 'baseball' ? sport : 'all',
    sort: (TEAMS_SORTS as readonly string[]).includes(sort ?? '') ? (sort as TeamsSort) : 'active',
    hideTest: first(sp.test) === 'hide',
  };
}

export function teamsHref(p: TeamsParams, change: Partial<TeamsParams> = {}): string {
  const next = { ...p, ...change };
  const q = new URLSearchParams();
  if (next.sport !== 'all') q.set('sport', next.sport);
  if (next.sort !== 'active') q.set('sort', next.sort);
  if (next.hideTest) q.set('test', 'hide');
  const s = q.toString();
  return s ? `/admin/spaces/people?${s}` : '/admin/spaces/people';
}

export function filterTeams(rows: readonly TeamActivityRow[], p: Pick<TeamsParams, 'sport' | 'hideTest'>): TeamActivityRow[] {
  return rows.filter((r) => (p.sport === 'all' || r.sport === p.sport) && !(p.hideTest && r.isTest));
}

const STATE_ORDER: Readonly<Record<TeamState, number>> = { active: 0, slipping: 1, dormant: 2, never: 3 };

export function sortTeams(rows: readonly TeamActivityRow[], sort: TeamsSort): TeamActivityRow[] {
  const seen = (a: TeamActivityRow, b: TeamActivityRow) => {
    const x = a.lastSignIn?.at ?? null;
    const y = b.lastSignIn?.at ?? null;
    return x === y ? 0 : x === null ? 1 : y === null ? -1 : ms(y) - ms(x);
  };
  const name = (a: TeamActivityRow, b: TeamActivityRow) => a.name.localeCompare(b.name);
  return [...rows].sort((a, b) => {
    switch (sort) {
      case 'seen':
        return seen(a, b) || name(a, b);
      case 'attention':
        return b.attentionScore - a.attentionScore || name(a, b);
      case 'errors':
        return b.errors30d - a.errors30d || STATE_ORDER[a.state] - STATE_ORDER[b.state] || name(a, b);
      case 'active':
      default:
        return (
          b.active7d - a.active7d ||
          b.active30d - a.active30d ||
          STATE_ORDER[a.state] - STATE_ORDER[b.state] ||
          seen(a, b) ||
          name(a, b)
        );
    }
  });
}

export function stateCounts(rows: readonly TeamActivityRow[]): Record<TeamState, number> {
  const out: Record<TeamState, number> = { active: 0, slipping: 0, dormant: 0, never: 0 };
  for (const r of rows) out[r.state] += 1;
  return out;
}

const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine', 'Ten'];
const sentenceNumber = (n: number) => NUMBER_WORDS[n] ?? String(n);
const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

/** "6 of 27 teams active in two weeks." / "21 quiet for two weeks." and a lede built only from the rows. */
export function teamsHeadline(rows: readonly TeamActivityRow[]): { title: string; second: string; lede: string } {
  const c = stateCounts(rows);
  const recent = c.active + c.slipping;
  const quiet = c.dormant + c.never;
  // "Active" here is the last two weeks (active + slipping), and says so: the strip's "active" is the last two days.
  const title = rows.length === 0 ? 'No teams to show.' : `${recent} of ${rows.length} ${plural(rows.length, 'team', 'teams')} active in two weeks.`;
  const second = quiet === 0 ? 'None quiet for two weeks.' : `${quiet} quiet for two weeks.`;
  const activeTest = rows.filter((r) => r.state === 'active' && r.isTest).length;
  const rounds7d = rows.reduce((s, r) => s + r.rounds7d, 0);
  const parts: string[] = [];
  parts.push(
    `${sentenceNumber(c.active)} ${plural(c.active, 'team', 'teams')} did something in the last two days` +
      (activeTest > 0 && c.active > 0 ? `, and ${activeTest === c.active ? (c.active === 1 ? 'it is a' : 'all are') : activeTest} test or demo ${plural(activeTest, 'team', 'teams')}.` : '.'),
  );
  if (c.slipping > 0) parts.push(`${sentenceNumber(c.slipping)} more ${plural(c.slipping, 'is', 'are')} slipping (3 to 14 days).`);
  parts.push(rounds7d === 0 ? 'Nobody logged a round or game this week.' : `${rounds7d} ${plural(rounds7d, 'round or game', 'rounds and games')} logged this week.`);
  return { title, second, lede: parts.join(' ') };
}

export type NeedsKind = 'errors-slipping' | 'went-quiet' | 'staff-only';

export interface NeedsCard {
  kind: NeedsKind;
  row: TeamActivityRow;
}

/**
 * Up to three "needs you" cards, one per rule, each a different team:
 *   1. errors-slipping: the slipping real team with the most errors in 30 days (errors > 0).
 *   2. went-quiet: the dormant real team with the biggest roster.
 *   3. staff-only: a team active this week only through its coaches or staff, with no player active.
 * Test and demo teams are left out of rules 1 and 2 (their errors and silence are expected); rule 3 keeps them,
 * because "it only looks active because staff were testing" is exactly what it is there to catch.
 */
export function needsCards(rows: readonly TeamActivityRow[]): NeedsCard[] {
  const used = new Set<string>();
  const out: NeedsCard[] = [];
  const pick = (kind: NeedsKind, pool: TeamActivityRow[], by: (a: TeamActivityRow, b: TeamActivityRow) => number) => {
    const row = pool.filter((r) => !used.has(r.teamId)).sort((a, b) => by(a, b) || a.name.localeCompare(b.name))[0];
    if (!row) return;
    used.add(row.teamId);
    out.push({ kind, row });
  };
  pick('errors-slipping', rows.filter((r) => !r.isTest && r.state === 'slipping' && r.errors30d > 0), (a, b) => b.errors30d - a.errors30d);
  pick('went-quiet', rows.filter((r) => !r.isTest && r.state === 'dormant' && r.people > 0), (a, b) => b.people - a.people);
  pick(
    'staff-only',
    rows.filter((r) => r.coachesActive7d > 0 && r.playersActive7d === 0 && r.players > 0),
    (a, b) => b.players - a.players,
  );
  return out;
}

// ---------------------------------------------------------------------------
// The team page
// ---------------------------------------------------------------------------

export type TeamTab = 'people' | 'activity' | 'errors';
export const TEAM_TABS: readonly TeamTab[] = ['people', 'activity', 'errors'];

export function parseTeamParams(sp: Params): { tab: TeamTab; sort: PeopleSort } {
  const tab = first(sp.tab);
  const sort = first(sp.sort);
  return {
    tab: (TEAM_TABS as readonly string[]).includes(tab ?? '') ? (tab as TeamTab) : 'people',
    sort: (PEOPLE_SORTS as readonly string[]).includes(sort ?? '') ? (sort as PeopleSort) : 'signin',
  };
}

export interface TimelineItem {
  at: string;
  kind: TouchKind | 'insight';
  /** What happened, in plain words. */
  what: string;
  /** Who did it: a name, or "A coach" / "A player" when the name is not on file; null for team-level rows. */
  who: string | null;
  role: PersonRole | null;
  source: string;
}

/**
 * The Activity tab: newest first, each row tagged with the table it came from. Titles are built from names and
 * roles only (never an email), and capped so a busy team stays readable.
 */
export function buildTimeline(
  touches: readonly Touch[],
  members: ReadonlyMap<string, Pick<Member, 'name' | 'role'>>,
  extra: readonly TimelineItem[],
  limit = 60,
): TimelineItem[] {
  const items: TimelineItem[] = touches.map((t) => {
    const m = members.get(t.userId);
    // Privacy (players may be minors): when a player sent a message is never tied to their name; it reads "A player".
    const anonymous = t.kind === 'message' && m?.role === 'player';
    const who = anonymous ? 'A player' : m?.name ?? (m ? (m.role === 'coach' ? 'A coach' : 'A player') : null);
    return { at: t.at, kind: t.kind, what: TOUCH_WORDS[t.kind], who, role: m?.role ?? null, source: t.source };
  });
  return [...items, ...extra].sort((a, b) => ms(b.at) - ms(a.at)).slice(0, limit);
}

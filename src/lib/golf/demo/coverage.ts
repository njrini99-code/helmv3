/**
 * The demo team coverage check. Pure: it reads a snapshot of the demo team's
 * rows (from the generator in tests and the dry run, or from the database in
 * `scripts/verify-golf-demo-coverage.ts`) and says whether a prospect would
 * see a believable, current team. Each check names the finding it guards.
 *
 * An error means the demo is wrong today (a stale season, a test row, a round
 * whose header contradicts its holes). A warning means it looks thin or off
 * (no plan for this week's practice, putting outside the believable range).
 */
import type { DemoRow, DemoTable } from './generate';
import { academicYearFor, addDays, buildSeasonPlan, daysBetween, weekdayName } from './calendar';

export type CoverageTable = Extract<
  DemoTable,
  | 'golf_players'
  | 'golf_team_members'
  | 'golf_team_seasons'
  | 'golf_rounds'
  | 'golf_holes'
  | 'golf_shots'
  | 'golf_events'
  | 'golf_event_attendance'
  | 'golf_tournaments'
  | 'golf_tournament_entries'
  | 'golf_qualifiers'
  | 'golf_qualifier_entries'
  | 'golf_practice_plans'
  | 'golf_tasks'
  | 'golf_announcements'
  | 'golf_messages'
>;

export interface DemoSnapshot {
  /** Today in the team's zone, YYYY-MM-DD. */
  today: string;
  tables: { [K in CoverageTable]?: DemoRow[] };
}

export interface CoverageCheck {
  id: string;
  /** The finding the check guards (DD-xx, DATA-xx). */
  finding: string;
  severity: 'error' | 'warn';
  ok: boolean;
  detail: string;
}

export interface CoverageReport {
  ok: boolean;
  errors: number;
  warnings: number;
  checks: CoverageCheck[];
}

const str = (row: DemoRow, k: string): string | null => (row[k] === null || row[k] === undefined ? null : String(row[k]));
const num = (row: DemoRow, k: string): number | null => (typeof row[k] === 'number' ? (row[k] as number) : row[k] === null || row[k] === undefined ? null : Number(row[k]));
const day = (row: DemoRow, k: string): string => String(row[k] ?? '').slice(0, 10);

/** Words that only test and QA rows use. Matching any of them on a demo row is a leak (DD-13). */
const TEST_COPY = /\b(momentic|qa (audit|attach)|audit testplayer|lorem ipsum)\b/i;
/** The tag the retired clone seeder appended to round notes (DD-02). */
const SEED_TAG = /\[seed[-:]|seed-from-/i;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DATED_COPY = /\b(Sunday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday) (\d{1,2}) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/g;

/** True between the first week of a term and its last week, when a coach expects fresh rounds and events. */
export function inTerm(today: string): boolean {
  const md = today.slice(5);
  return (md >= '08-25' && md <= '11-20') || (md >= '01-20' && md <= '04-30');
}

/**
 * Weekday names in copy that disagree with their date (DD-18). The year is the
 * one that puts the date nearest the row's own timestamp.
 */
export function wrongWeekdays(text: string, writtenOn: string): string[] {
  const wrong: string[] = [];
  for (const m of text.matchAll(DATED_COPY)) {
    const [whole, name, d, mon] = m;
    const month = String(MONTHS.indexOf(mon!) + 1).padStart(2, '0');
    const y = Number(writtenOn.slice(0, 4));
    const candidates = [y - 1, y, y + 1].map((yy) => `${yy}-${month}-${String(Number(d)).padStart(2, '0')}`);
    const nearest = candidates.sort((a, b) => Math.abs(daysBetween(writtenOn, a)) - Math.abs(daysBetween(writtenOn, b)))[0]!;
    if (weekdayName(nearest) !== name) wrong.push(`${whole} (is a ${weekdayName(nearest)})`);
  }
  return wrong;
}

/** The fingerprint of a scorecard: the hole scores and putts in order. */
function scorecardOf(holes: DemoRow[]): string {
  return [...holes]
    .sort((a, b) => (num(a, 'hole_number') ?? 0) - (num(b, 'hole_number') ?? 0))
    .map((h) => `${num(h, 'score')}/${num(h, 'putts')}`)
    .join(' ');
}

export function checkDemoCoverage(snap: DemoSnapshot): CoverageReport {
  const t = snap.tables;
  const today = snap.today;
  const year = academicYearFor(today);
  const plan = buildSeasonPlan(year);
  const checks: CoverageCheck[] = [];
  const add = (id: string, finding: string, severity: CoverageCheck['severity'], ok: boolean, detail: string) => checks.push({ id, finding, severity, ok, detail });
  const rows = (k: CoverageTable) => t[k] ?? [];

  // ------------------------------------------------------------- roster
  const players = new Map(rows('golf_players').map((p) => [str(p, 'id')!, p]));
  const active = rows('golf_team_members').filter((m) => str(m, 'status') === 'active');
  const activePlayers = active.map((m) => players.get(str(m, 'player_id')!)).filter((p): p is DemoRow => !!p);
  const nameOf = (id: string | null) => {
    const p = id ? players.get(id) : undefined;
    return p ? `${str(p, 'first_name') ?? ''} ${str(p, 'last_name') ?? ''}`.trim() : 'unknown player';
  };
  const testPlayers = activePlayers.filter((p) => p.is_test === true || TEST_COPY.test(`${str(p, 'first_name')} ${str(p, 'last_name')}`));
  // Eight until the transfer joins in November, nine after.
  add('roster', 'DD-01', 'error', activePlayers.length - testPlayers.length >= 8, `${activePlayers.length - testPlayers.length} active players (want 8 or more)`);
  add('no-test-players', 'DD-13', 'error', testPlayers.length === 0, testPlayers.length ? `test players on the roster: ${testPlayers.map((p) => nameOf(str(p, 'id'))).join(', ')}` : 'none');

  add('season-row', 'DATA-04', 'error', rows('golf_team_seasons').some((s) => str(s, 'season') === year.label), `season ${year.label}`);

  // ------------------------------------------------------------- rounds
  const rounds = rows('golf_rounds');
  const completed = rounds.filter((r) => str(r, 'status') === 'completed' && r.is_test !== true);
  const seasonRounds = completed.filter((r) => day(r, 'round_date') >= year.anchor && day(r, 'round_date') < today);
  const scoring = seasonRounds.filter((r) => str(r, 'round_type') !== 'practice');

  const futureRounds = completed.filter((r) => day(r, 'round_date') > today);
  add('no-future-rounds', 'DD-04', 'error', futureRounds.length === 0, futureRounds.length ? `${futureRounds.length} completed rounds dated after today` : 'none');

  const stuck = rounds.filter((r) => str(r, 'status') === 'in_progress' && daysBetween(day(r, 'round_date'), today) > 2);
  add('no-abandoned-rounds', 'DATA-02', 'error', stuck.length === 0, stuck.length ? `${stuck.length} rounds in progress for more than two days` : 'none');

  const testRows = (['golf_rounds', 'golf_qualifiers', 'golf_tasks', 'golf_announcements', 'golf_events', 'golf_messages'] as const).flatMap((k) =>
    rows(k).filter((r) => r.is_test === true).map(() => k),
  );
  add('no-test-rows', 'DD-13', 'error', testRows.length === 0, testRows.length ? `is_test rows: ${countBy(testRows)}` : 'none');

  // Competition round slots so far this season: what a full-season player could have played.
  const slots = [...plan.qualifiers.flatMap((q) => q.days), ...plan.tournaments.flatMap((x) => x.days)].filter((d) => d < today).length;
  const want = Math.min(18, Math.floor(slots * 0.6));
  const perPlayer = new Map<string, number>();
  for (const r of scoring) perPlayer.set(str(r, 'player_id')!, (perPlayer.get(str(r, 'player_id')!) ?? 0) + 1);
  const full = [...perPlayer.values()].filter((n) => n >= want).length;
  add('season-rounds', 'DD-01', 'error', slots < 3 || full >= 6, `${full} players with ${want} or more qualifier and tournament rounds this season (${slots} competition rounds so far; want 6 players)`);

  const lastBy = new Map<string, string>();
  for (const r of completed) {
    const pid = str(r, 'player_id')!;
    if ((lastBy.get(pid) ?? '') < day(r, 'round_date')) lastBy.set(pid, day(r, 'round_date'));
  }
  const quiet = activePlayers.filter((p) => {
    const last = lastBy.get(str(p, 'id')!);
    return last && daysBetween(last, today) > 21;
  });
  add('fresh-rounds', 'DD-03', inTerm(today) && quiet.length > 1 ? 'error' : 'warn', !inTerm(today) || quiet.length <= 1, quiet.length ? `no round in three weeks: ${quiet.map((p) => nameOf(str(p, 'id'))).join(', ')}` : 'every player has a recent round');

  // ------------------------------------------------------ holes and shots
  const holesBy = groupBy(rows('golf_holes'), 'round_id');
  const shotsBy = groupBy(rows('golf_shots'), 'hole_id');
  const shotRounds = new Set(rows('golf_shots').map((s) => str(s, 'round_id')));
  const share = seasonRounds.length ? seasonRounds.filter((r) => shotRounds.has(str(r, 'id'))).length / seasonRounds.length : 0;
  const enough = seasonRounds.length >= 20;
  add('shot-detail', 'DD-01', enough && share < 0.5 ? 'error' : 'warn', !enough || (share >= 0.6 && share <= 0.82), `${Math.round(share * 100)}% of season rounds have shots (want about 70%)`);

  const headerMismatch: string[] = [];
  const shotMismatch: string[] = [];
  const cards = new Map<string, string[]>();
  let holeCount = 0;
  let doubles = 0;
  let putts = 0;
  let threePutts = 0;
  let greens = 0;
  for (const r of completed) {
    const hs = holesBy.get(str(r, 'id')!) ?? [];
    if (hs.length !== 18) continue;
    const sum = (k: string) => hs.reduce((s, h) => s + (num(h, k) ?? 0), 0);
    const front = hs.filter((h) => (num(h, 'hole_number') ?? 0) <= 9).reduce((s, h) => s + (num(h, 'score') ?? 0), 0);
    const expect: Array<[string, number]> = [
      ['total_score', sum('score')],
      ['front_nine', front],
      ['back_nine', sum('score') - front],
      ['total_putts', sum('putts')],
      ['total_gir', hs.filter((h) => h.gir === true).length],
      ['total_fairways_hit', hs.filter((h) => h.fairway_hit === true).length],
      ['total_penalties', sum('penalty_strokes')],
    ];
    const off = expect.filter(([k, v]) => r[k] !== null && r[k] !== undefined && num(r, k) !== v).map(([k]) => k);
    if (off.length) headerMismatch.push(`${nameOf(str(r, 'player_id'))} ${day(r, 'round_date')}: ${off.join(', ')}`);
    const card = scorecardOf(hs);
    cards.set(card, [...(cards.get(card) ?? []), `${nameOf(str(r, 'player_id'))} ${day(r, 'round_date')}`]);
    for (const h of hs) {
      holeCount += 1;
      const score = num(h, 'score') ?? 0;
      const par = num(h, 'par') ?? 4;
      const p = num(h, 'putts') ?? 0;
      if (score >= par + 2) doubles += 1;
      if (p > 0) {
        greens += 1;
        putts += p;
        if (p >= 3) threePutts += 1;
      }
      const shots = shotsBy.get(str(h, 'id')!) ?? [];
      if (!shots.length) continue;
      const puttRows = shots.filter((s) => str(s, 'shot_type') === 'putting').length;
      if (shots.length !== score || puttRows !== p) shotMismatch.push(`${nameOf(str(r, 'player_id'))} ${day(r, 'round_date')} hole ${num(h, 'hole_number')}`);
    }
  }
  add('header-matches-holes', 'DD-11', 'error', headerMismatch.length === 0, headerMismatch.length ? `${headerMismatch.length} rounds, e.g. ${headerMismatch.slice(0, 3).join('; ')}` : 'every round header equals its hole sums');
  add('shots-match-holes', 'DD-11', 'error', shotMismatch.length === 0, shotMismatch.length ? `${shotMismatch.length} holes, e.g. ${shotMismatch.slice(0, 3).join('; ')}` : 'every logged hole has one shot row per stroke');
  const dupes = [...cards.values()].filter((v) => v.length > 1);
  add('unique-scorecards', 'DD-16', 'error', dupes.length === 0, dupes.length ? `${dupes.length} scorecards repeat, e.g. ${dupes[0]!.join(' and ')}` : `${cards.size} scorecards, none repeated`);

  const rounds18 = completed.filter((r) => (holesBy.get(str(r, 'id')!) ?? []).length === 18).length;
  const puttsPer18 = rounds18 ? putts / rounds18 : 0;
  const threeRate = greens ? threePutts / greens : 0;
  add('believable-putting', 'DD-16', 'warn', puttsPer18 >= 30.5 && puttsPer18 <= 34.5 && threeRate >= 0.04 && threeRate <= 0.13, `${puttsPer18.toFixed(1)} putts a round, three-putts on ${(threeRate * 100).toFixed(1)}% of greens (want 32 to 34, and 8 to 11%)`);
  const doubleRate = holeCount ? doubles / holeCount : 0;
  add('doubles-exist', 'DD-11', 'warn', doubleRate >= 0.02 && doubleRate <= 0.15, `${(doubleRate * 100).toFixed(1)}% of holes are double bogey or worse`);

  // ----------------------------------------------------- notes and copy
  const tagged = [
    ...rounds.filter((r) => SEED_TAG.test(str(r, 'notes') ?? '')),
    ...rows('golf_holes').filter((h) => SEED_TAG.test(str(h, 'notes') ?? '')),
  ];
  add('no-seed-tags', 'DD-02', 'error', tagged.length === 0, tagged.length ? `${tagged.length} rows carry a seed tag` : 'none');

  const copy: Array<{ where: string; text: string; on: string }> = [
    ...rows('golf_messages').filter((m) => m.is_deleted !== true).map((m) => ({ where: 'message', text: str(m, 'content') ?? '', on: day(m, 'created_at') })),
    ...rows('golf_announcements').map((a) => ({ where: 'announcement', text: `${str(a, 'title') ?? ''} ${str(a, 'body') ?? ''}`, on: day(a, 'created_at') })),
    ...rows('golf_tasks').map((x) => ({ where: 'task', text: `${str(x, 'title') ?? ''} ${str(x, 'description') ?? ''}`, on: day(x, 'created_at') })),
    ...rows('golf_events').map((e) => ({ where: 'event', text: `${str(e, 'title') ?? ''} ${str(e, 'description') ?? ''}`, on: day(e, 'start_time') })),
  ];
  const leaks = copy.filter((c) => TEST_COPY.test(c.text) || SEED_TAG.test(c.text));
  add('no-test-copy', 'DD-13', 'error', leaks.length === 0, leaks.length ? `${leaks.length} rows read like test data, e.g. ${leaks[0]!.where}: "${leaks[0]!.text.slice(0, 60)}"` : 'none');
  const badDays = copy.flatMap((c) => wrongWeekdays(c.text, c.on).map((w) => `${c.where}: ${w}`));
  add('weekdays-match-dates', 'DD-18', 'error', badDays.length === 0, badDays.length ? badDays.slice(0, 3).join('; ') : 'every weekday in copy matches its date');
  const futureCopy = [...rows('golf_messages'), ...rows('golf_announcements')].filter((r) => day(r, 'created_at') > today);
  add('no-future-messages', 'DD-05', 'error', futureCopy.length === 0, futureCopy.length ? `${futureCopy.length} messages or announcements dated after today` : 'none');

  // ------------------------------------------------- events and practice
  const events = rows('golf_events').filter((e) => str(e, 'status') !== 'cancelled');
  const nextTwoWeeks = events.filter((e) => day(e, 'start_time') >= today && day(e, 'start_time') <= addDays(today, 14));
  add('upcoming-events', 'DD-03', inTerm(today) ? 'error' : 'warn', !inTerm(today) || nextTwoWeeks.length >= 3, `${nextTwoWeeks.length} events in the next two weeks`);

  const eventDay = new Map(events.map((e) => [str(e, 'id')!, day(e, 'start_time')]));
  // Published plans for recent sessions, or plans (draft or published) for the coming ones.
  const recentPlans = rows('golf_practice_plans').filter((p) => {
    const d = eventDay.get(str(p, 'event_id') ?? '');
    if (!d || d < addDays(today, -14) || d > addDays(today, 14)) return false;
    return d >= today || str(p, 'status') === 'published';
  });
  const practiceSoon = events.some((e) => str(e, 'event_type') === 'practice' && day(e, 'start_time') >= addDays(today, -14) && day(e, 'start_time') <= addDays(today, 14));
  add('practice-plans', 'DD-10', 'warn', !practiceSoon || recentPlans.length >= 1, `${recentPlans.length} plans for sessions within two weeks of today`);

  const past = rows('golf_event_attendance').filter((a) => {
    const d = eventDay.get(str(a, 'event_id') ?? '');
    return d && d < today && d >= addDays(today, -120);
  });
  const attended = past.filter((a) => str(a, 'attendance_status') === 'present' || str(a, 'attendance_status') === 'late').length;
  const rate = past.length ? attended / past.length : 0;
  add('attendance', 'DD-10', 'warn', past.length === 0 || (rate >= 0.85 && rate <= 0.97), past.length ? `${Math.round(rate * 100)}% of ${past.length} past invitations attended (want about 92%, never 100%)` : 'no past events in range');

  // -------------------------------------------- tournaments and qualifiers
  const tournaments = rows('golf_tournaments');
  const fallTournaments = tournaments.filter((x) => day(x, 'start_date') >= year.anchor && day(x, 'start_date') <= `${year.startYear}-12-31`);
  add('fall-tournaments', 'DD-09', 'error', fallTournaments.length >= 4 && fallTournaments.length <= 5, `${fallTournaments.length} fall tournaments (want 4 or 5)`);
  const unofficial = tournaments.filter((x) => day(x, 'end_date') < addDays(today, -1) && !x.official_at);
  add('past-tournaments-final', 'DD-09', 'warn', unofficial.length === 0, unofficial.length ? `${unofficial.length} finished tournaments not marked official` : 'every finished tournament is official');

  const next = tournaments.filter((x) => day(x, 'start_date') >= today).sort((a, b) => (day(a, 'start_date') < day(b, 'start_date') ? -1 : 1))[0];
  const summer = today.slice(5) > '04-30' && today.slice(5) < '08-10';
  add('next-tournament', 'DD-09', 'warn', summer || (!!next && daysBetween(today, day(next, 'start_date')) <= 100), next ? `${str(next, 'name')} on ${day(next, 'start_date')}` : 'none scheduled');
  if (next) {
    const lineup = rows('golf_tournament_entries').filter((e) => e.tournament_id === next.id && str(e, 'role') === 'lineup');
    const q = rows('golf_qualifiers').find((x) => x.target_tournament_id === next.id);
    const due = daysBetween(today, day(next, 'start_date')) <= 21 || (!!q && day(q, 'start_date') < today);
    add('next-lineup', 'DD-09', 'warn', !due || lineup.length >= 3, `${lineup.length} lineup entries for ${str(next, 'name')}`);
  }

  const qualifiers = rows('golf_qualifiers').filter((q) => q.is_test !== true);
  const notClosed = qualifiers.filter((q) => day(q, 'end_date') < today && str(q, 'status') !== 'completed');
  add('qualifiers-closed', 'DD-08', 'error', notClosed.length === 0, notClosed.length ? `still open after their last day: ${notClosed.map((q) => str(q, 'name')).join(', ')}` : 'every past qualifier is completed');
  const unscored = qualifiers.filter((q) => str(q, 'status') === 'completed').filter((q) => {
    const es = rows('golf_qualifier_entries').filter((e) => e.qualifier_id === q.id);
    return es.length > 0 && !es.some((e) => num(e, 'total_score') !== null && num(e, 'position') !== null);
  });
  add('qualifiers-scored', 'DD-08', 'error', unscored.length === 0, unscored.length ? `completed with no scores: ${unscored.map((q) => str(q, 'name')).join(', ')}` : 'every completed qualifier has standings');
  // Only while the season still has a qualifier to play (the conference event has none).
  const seasonLeft = plan.qualifiers.some((q) => q.days[q.days.length - 1]! >= today);
  const liveOrSoon = qualifiers.some((q) => str(q, 'status') === 'in_progress' || (day(q, 'start_date') >= today && day(q, 'start_date') <= addDays(today, 28)));
  add('live-or-next-qualifier', 'DD-07', 'warn', !inTerm(today) || !seasonLeft || liveOrSoon, liveOrSoon ? 'a qualifier is live or within four weeks' : 'no qualifier live or within four weeks');

  const errors = checks.filter((c) => !c.ok && c.severity === 'error').length;
  const warnings = checks.filter((c) => !c.ok && c.severity === 'warn').length;
  return { ok: errors === 0, errors, warnings, checks };
}

export function formatCoverage(report: CoverageReport): string {
  const mark = (c: CoverageCheck) => (c.ok ? 'ok  ' : c.severity === 'error' ? 'FAIL' : 'warn');
  const lines = report.checks.map((c) => `${mark(c)} ${c.id.padEnd(24)} ${c.finding.padEnd(8)} ${c.detail}`);
  lines.push('', report.ok ? `Coverage ok (${report.warnings} warnings)` : `Coverage FAILED: ${report.errors} errors, ${report.warnings} warnings`);
  return lines.join('\n');
}

function groupBy(rs: DemoRow[], k: string): Map<string, DemoRow[]> {
  const out = new Map<string, DemoRow[]>();
  for (const r of rs) {
    const key = String(r[k]);
    const list = out.get(key);
    if (list) list.push(r);
    else out.set(key, [r]);
  }
  return out;
}

function countBy(xs: string[]): string {
  const m = new Map<string, number>();
  for (const x of xs) m.set(x, (m.get(x) ?? 0) + 1);
  return [...m.entries()].map(([k, v]) => `${k} ${v}`).join(', ');
}

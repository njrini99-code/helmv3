import { formatFixed } from '../lib/format';
import 'server-only';
import { TERMS } from '../lib/glossary';
import { createClient } from '@/lib/supabase/server';
import { resolveCoachChatContext } from '@/lib/coachhelm/v3/chat/context';
import { getTeamStrokesGained } from '@/lib/coachhelm/v3/chat/practice-reads';
import { loadTeamStrokesGained } from './team-sg';
import { parsePlanBody, parseVersionBody, type PlanBodyV2, type PlanWhy } from '@/lib/coachhelm/v3/practice-plan/model';
import { practiceTables, type PracticePlanRow, type PracticePlanVersionRow, type TeamDrillRow } from '@/lib/golf/practice-db';
import { isPracticeMissing } from '@/lib/golf/practice-errors';
import { isoDay, formatWith } from '../lib/dates';
import { editedAfterPublish, loadPlayerPractice } from './practice-plan';
import { blockDaySegs, keyOfDrill } from '../screens/practice/builder/builder-model';
import type { ChBankDrill, ChBuilderData, ChPlayerPracticeHome, ChPracticeEvent, ChPracticeHome, ChPracticeLoad, ChPracticeRow, ChPracticeState, ChPracticeTile, ChPracticeUpNext } from './practice-home-shape';

type Sb = Awaited<ReturnType<typeof createClient>>;
interface EventRow {
  id: string;
  title: string;
  start_time: string;
  end_time: string | null;
  location: string | null;
  all_day: boolean | null;
}
type PlanRow = PracticePlanRow;

const HREF = '/golf/dashboard/practice/plan/';
const DAY = 86_400_000;
const hhmm = (d: Date, zone: string) => formatWith(d, { hour: 'numeric', minute: '2-digit', timeZone: zone }).replace(/\s?[AP]M$/, '');
const clock = (d: Date, zone: string) => formatWith(d, { hour: 'numeric', minute: '2-digit', timeZone: zone });
const dayShort = (d: Date, zone: string) => formatWith(d, { weekday: 'short', month: 'short', day: 'numeric', timeZone: zone });
const dayLong = (d: Date, zone: string) => formatWith(d, { weekday: 'long', month: 'short', day: 'numeric', timeZone: zone });
/** The team-zone date as yyyy-mm-dd. */
const dayKey = (d: Date, zone: string) => isoDay(d, zone);
const span = (e: EventRow, zone: string) => {
  const s = new Date(e.start_time);
  return e.end_time ? `${hhmm(s, zone)} to ${clock(new Date(e.end_time), zone)}` : clock(s, zone);
};
const hours = (min: number) => {
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h ? (m ? `${h} h ${m}` : `${h} h`) : `${m} min`;
};

/** The first two blocks in words, each at its time. */
function blockLine(body: PlanBodyV2 | null, start: Date, zone: string): string {
  if (!body) return '';
  let at = start.getTime();
  const out: string[] = [];
  for (const b of body.variants.main.blocks.slice(0, 2)) {
    out.push(`${hhmm(new Date(at), zone)} ${b.title}`);
    at += b.len * 60_000;
  }
  return out.join(' · ');
}

function scheduleRows(body: PlanBodyV2, start: Date, zone: string): ChPracticeUpNext['rows'] {
  let at = start.getTime();
  return body.variants.main.blocks.map((b) => {
    const time = hhmm(new Date(at), zone);
    at += b.len * 60_000;
    const place = b.kind === 'stations' ? `${b.stations.length} stations` : b.kind === 'course' ? `Holes ${b.holeFrom} to ${b.holeTo}` : b.place;
    return { time, title: b.title, place, min: b.len };
  });
}

/** Up next's strip, coloured as the builder colours it. The drill bank is read only when the plan names a drill; a bank that won't read leaves the strip plain. */
async function daySegs(sb: Sb, teamId: string, body: PlanBodyV2): Promise<NonNullable<ChPracticeUpNext['day']>> {
  const blocks = body.variants.main.blocks;
  const named = blocks.some((b) => (b.kind === 'team' && b.drill) || (b.kind === 'stations' && b.stations.some((st) => st.drill)));
  const kinds = named ? new Map((await drillBank(sb, teamId).catch(() => [])).map((d) => [d.ref, d.kind])) : new Map<string, ChBankDrill['kind']>();
  return blocks.flatMap((b) => blockDaySegs(b, (d) => (d ? (kinds.get(keyOfDrill(d)) ?? 'plain') : 'plain'))).map(({ min, tone }) => ({ min, tone }));
}

function stateOf(p: PlanRow | undefined, ended: boolean): ChPracticeState {
  if (!p) return 'No plan';
  if (p.status === 'draft') return 'Draft';
  if (ended) return 'Done';
  return editedAfterPublish(p) ? 'Updated' : 'Published';
}

/** Monday to Sunday of the team-zone week holding `now`. */
function weekDays(now: Date, zone: string): Array<{ key: string; at: Date }> {
  const key = dayKey(now, zone);
  const [y, m, d] = key.split('-').map(Number);
  const noon = Date.UTC(y ?? 1970, (m ?? 1) - 1, d ?? 1, 12);
  const back = (new Date(noon).getUTCDay() + 6) % 7;
  return Array.from({ length: 7 }, (_, i) => {
    const at = new Date(noon + (i - back) * DAY);
    return { key: at.toISOString().slice(0, 10), at };
  });
}

function weekTiles<T extends { event: EventRow; state: ChPracticeState; href: string | null; eventId: string | null }>(items: T[], now: Date, zone: string): ChPracticeTile[] {
  const today = dayKey(now, zone);
  return weekDays(now, zone).map(({ key, at }) => ({
    key,
    day: formatWith(at, { weekday: 'short', timeZone: 'UTC' }),
    date: formatWith(at, { day: 'numeric', timeZone: 'UTC' }),
    today: key === today,
    items: items
      .filter((x) => dayKey(new Date(x.event.start_time), zone) === key)
      .sort((a, b) => a.event.start_time.localeCompare(b.event.start_time))
      .map((x) => ({ time: clock(new Date(x.event.start_time), zone), state: x.state, href: x.href, eventId: x.eventId })),
  }));
}

async function teamBasics(sb: Sb, teamId: string) {
  const { data, error } = await sb.from('golf_teams').select('name, timezone, organization_id').eq('id', teamId).maybeSingle();
  return error || !data ? null : { name: data.name ?? '', zone: data.timezone ?? 'America/New_York', org: data.organization_id };
}

async function activeRoster(sb: Sb, teamId: string): Promise<Array<{ id: string; name: string }> | null> {
  const { data, error } = await sb.from('golf_team_members').select('player_id, golf_players(first_name, last_name)').eq('team_id', teamId).eq('status', 'active');
  if (error) return null;
  return (data ?? []).flatMap((m) => {
    const p = m.golf_players as { first_name: string | null; last_name: string | null } | null;
    return m.player_id && p ? [{ id: m.player_id, name: [p.first_name, p.last_name].filter(Boolean).join(' ') }] : [];
  });
}

/** The coach's Practice. A missing table is "not on yet", any other failed read is the page's own "didn't load", never an empty list. */
export async function loadCoachPracticeHome(teamId: string, now: Date = new Date()): Promise<ChPracticeLoad<ChPracticeHome>> {
  const sb = await createClient();
  const db = practiceTables(sb);
  const team = await teamBasics(sb, teamId);
  if (!team) return { status: 'failed' };
  const { name: teamName, zone } = team;
  const plansRes = await db.from('golf_practice_plans').select('id, title, status, event_id, version, published_version, edited_after_publish, updated_at, body, step, team_id').eq('team_id', teamId).eq('kind', 'event').order('updated_at', { ascending: false }).limit(200);
  if (plansRes.error) return isPracticeMissing(plansRes.error.code) ? { status: 'unavailable' } : { status: 'failed' };
  const plans = (plansRes.data ?? []) as PlanRow[];
  const [upcoming, roster] = await Promise.all([
    sb.from('golf_events').select('id, title, start_time, end_time, location, all_day').eq('team_id', teamId).eq('event_type', 'practice').is('cancelled_at', null).gte('start_time', new Date(now.getTime() - 8 * DAY).toISOString()).lte('start_time', new Date(now.getTime() + 21 * DAY).toISOString()).order('start_time').limit(120),
    activeRoster(sb, teamId),
  ]);
  if (upcoming.error || !roster) return { status: 'failed' };
  const byEvent = new Map(plans.filter((p) => p.event_id).map((p) => [p.event_id!, p]));
  const known = new Map<string, EventRow>((upcoming.data ?? []).map((e) => [e.id, e]));
  const missing = plans.map((p) => p.event_id).filter((id): id is string => !!id && !known.has(id));
  if (missing.length) {
    const older = await sb.from('golf_events').select('id, title, start_time, end_time, location, all_day').in('id', missing.slice(0, 200));
    if (older.error) return { status: 'failed' };
    for (const e of older.data ?? []) known.set(e.id, e);
  }
  const rows = plans.flatMap((p): Array<ChPracticeRow & { at: string; ended: boolean }> => {
    const e = p.event_id ? known.get(p.event_id) : undefined;
    if (!e) return [];
    const start = new Date(e.start_time);
    const ended = (e.end_time ? new Date(e.end_time) : start) < now;
    const body = parsePlanBody(p.body);
    const state = stateOf(p, ended);
    return [{ id: p.id, day: dayShort(start, zone), title: p.title || e.title, time: span(e, zone), line: blockLine(body, start, zone), state, href: p.status === 'draft' ? `${HREF}${p.id}/edit` : `${HREF}${p.id}`, edits: editedAfterPublish(p), at: e.start_time, ended }];
  });
  const bare = ({ at: _a, ended: _e, ...r }: ChPracticeRow & { at: string; ended: boolean }): ChPracticeRow => r;
  const soonest = (a: { at: string }, b: { at: string }) => a.at.localeCompare(b.at);
  const drafts = rows.filter((r) => r.state === 'Draft' && !r.ended).sort(soonest).map(bare);
  const published = rows.filter((r) => r.state !== 'Draft' && !r.ended).sort(soonest).map(bare);
  const past = rows.filter((r) => r.ended).sort((a, b) => b.at.localeCompare(a.at)).map(bare);

  const events = [...known.values()];
  const week = weekTiles(
    events.map((event) => {
      const p = byEvent.get(event.id);
      const ended = (event.end_time ? new Date(event.end_time) : new Date(event.start_time)) < now;
      // A practice that has ended without a plan opens nothing: New plan plans what is coming, and its sheet lists only that (W15).
      return { event, state: stateOf(p, ended), href: p ? (p.status === 'draft' ? `${HREF}${p.id}/edit` : `${HREF}${p.id}`) : null, eventId: p || ended ? null : event.id };
    }),
    now,
    zone,
  );
  const keys = new Set(week.map((t) => t.key));
  const weekMin = events.filter((e) => keys.has(dayKey(new Date(e.start_time), zone)) && e.end_time).reduce((s, e) => s + Math.round((Date.parse(e.end_time!) - Date.parse(e.start_time)) / 60_000), 0);
  const open: ChPracticeEvent[] = events
    .filter((e) => !byEvent.has(e.id) && new Date(e.end_time ?? e.start_time) >= now && Date.parse(e.start_time) <= now.getTime() + 14 * DAY)
    .sort((a, b) => a.start_time.localeCompare(b.start_time))
    .map((e) => ({ id: e.id, label: dayLong(new Date(e.start_time), zone), detail: [e.all_day ? 'All day' : span(e, zone), e.location].filter(Boolean).join(' · '), title: e.title, place: e.location ?? '', allDay: !!e.all_day, minutes: e.end_time && !e.all_day ? Math.round((Date.parse(e.end_time) - Date.parse(e.start_time)) / 60_000) : null }));

  const nextEvent = events.filter((e) => new Date(e.end_time ?? e.start_time) >= now && !e.all_day).sort((a, b) => a.start_time.localeCompare(b.start_time))[0];
  let upNext: ChPracticeUpNext | null = null;
  if (nextEvent) {
    const p = byEvent.get(nextEvent.id);
    const body = p ? parsePlanBody(p.body) : null;
    const start = new Date(nextEvent.start_time);
    upNext = {
      title: p?.title || nextEvent.title,
      when: [dayShort(start, zone), span(nextEvent, zone), nextEvent.location].filter(Boolean).join(' · '),
      rows: body ? scheduleRows(body, start, zone) : [],
      day: body ? await daySegs(sb, teamId, body) : undefined,
      state: p ? stateOf(p, false) : undefined,
      planHref: p && p.status === 'published' ? `${HREF}${p.id}` : null,
      editHref: p ? `${HREF}${p.id}/edit` : null,
      eventId: p ? null : nextEvent.id,
    };
  }
  return {
    status: 'ready',
    data: { teamName, week, weekLine: weekMin ? `${hours(weekMin)} of practice this week` : null, upNext, drafts, published, past, open, copies: rows.filter((r) => r.state !== 'Draft' || r.ended).slice(0, 20).map((r) => ({ id: r.id, label: `${r.title} · ${r.day}` })), roster: roster.map((r) => r.id), firstRun: plans.length === 0 },
  };
}

/** A player's Practice: only live versions, which RLS holds to their team. The next one is drawn as their own path. */
export async function loadPlayerPracticeHome(teamId: string, playerId: string, now: Date = new Date()): Promise<ChPracticeLoad<ChPlayerPracticeHome>> {
  const sb = await createClient();
  const team = await teamBasics(sb, teamId);
  if (!team) return { status: 'failed' };
  const { zone } = team;
  const { data, error } = await practiceTables(sb).from('golf_practice_plan_versions').select('plan_id, version, title, event_id, body, published_at').eq('is_live', true).order('published_at', { ascending: false }).limit(60);
  if (error) return isPracticeMissing(error.code) ? { status: 'unavailable' } : { status: 'failed' };
  const live = (data ?? []) as PracticePlanVersionRow[];
  const ids = live.map((v) => v.event_id).filter((id): id is string => !!id);
  const eventsRes = ids.length ? await sb.from('golf_events').select('id, title, start_time, end_time, location, all_day').eq('team_id', teamId).in('id', ids) : { data: [] as EventRow[], error: null };
  if (eventsRes.error) return { status: 'failed' };
  const eventOf = new Map<string, EventRow>((eventsRes.data ?? []).map((e) => [e.id, e]));
  const rows = live.flatMap((v) => {
    const e = v.event_id ? eventOf.get(v.event_id) : undefined;
    if (!e) return [];
    const start = new Date(e.start_time);
    const ended = (e.end_time ? new Date(e.end_time) : start) < now;
    const row: ChPracticeRow = { id: v.plan_id, day: dayShort(start, zone), title: v.title || e.title, time: span(e, zone), line: blockLine(parseVersionBody(v.body), start, zone), state: ended ? 'Done' : 'Published', href: `${HREF}${v.plan_id}` };
    return [{ row, event: e, ended }];
  });
  const upcoming = rows.filter((r) => !r.ended).sort((a, b) => a.event.start_time.localeCompare(b.event.start_time));
  const past = rows.filter((r) => r.ended).sort((a, b) => b.event.start_time.localeCompare(a.event.start_time));
  const first = upcoming[0];
  let next: ChPlayerPracticeHome['next'] = null;
  if (first) {
    const mine = await loadPlayerPractice(first.row.id, playerId, now);
    if (mine.status === 'ready') next = { planHref: first.row.href, title: mine.data.title, when: mine.data.when, context: mine.data.context, focus: mine.data.focus, group: mine.data.group, stops: mine.data.stops };
  }
  const week = weekTiles(rows.map((r) => ({ event: r.event, state: r.row.state, href: r.row.href, eventId: null })), now, zone);
  return { status: 'ready', data: { next, week, upcoming: upcoming.slice(1).map((r) => r.row), past: past.map((r) => r.row) } };
}

const LIB_AREA: Record<string, { area: string; kind: ChBankDrill['kind'] }> = {
  putting: { area: 'Putting', kind: 'skill' },
  short_game: { area: TERMS.shortGame.long, kind: 'skill' },
  approach: { area: 'Approach', kind: 'skill' },
  tee: { area: 'Tee', kind: 'skill' },
  course_management: { area: 'Course', kind: 'random' },
  scoring: { area: 'Course', kind: 'random' },
  pressure: { area: 'Mental', kind: 'pressure' },
};
const AREA_LABEL: Record<string, string> = { putting: 'Putting', short_game: TERMS.shortGame.long, bunker: 'Bunker', approach: 'Approach', tee: 'Tee', course: 'Course', fitness: 'Fitness', mental: 'Mental' };

/** Your drills, then GolfHelm's. A team bank that isn't there yet leaves the library. */
async function drillBank(sb: Sb, teamId: string): Promise<ChBankDrill[]> {
  const [team, lib] = await Promise.all([
    practiceTables(sb).from('golf_team_drills').select('id, name, area, kind, minutes').eq('team_id', teamId).is('archived_at', null).order('name').limit(200),
    sb.from('golf_drills').select('id, title, category, duration_min').order('title').limit(200),
  ]);
  const own = team.error ? [] : ((team.data ?? []) as Array<Pick<TeamDrillRow, 'id' | 'name' | 'area' | 'kind' | 'minutes'>>);
  return [
    ...own.map((d): ChBankDrill => ({ ref: `team:${d.id}`, name: d.name, area: AREA_LABEL[d.area] ?? d.area, kind: d.kind, minutes: d.minutes, source: 'Your bank' })),
    ...(lib.error ? [] : (lib.data ?? [])).map((d): ChBankDrill => ({ ref: `lib:${d.id}`, name: d.title, area: LIB_AREA[d.category ?? '']?.area ?? 'Course', kind: LIB_AREA[d.category ?? '']?.kind ?? 'skill', minutes: d.duration_min ?? 15, source: 'GolfHelm' })),
  ];
}

const SG_NAMES: Record<string, string> = { tee: 'Off the tee', approach: 'Approach', short: TERMS.shortGame.long, putting: 'Putting' };

/** What the helper's card leads with: the team's biggest loss and the next event after this practice. Only what was read; a failed read is a line left out. */
async function helperFacts(sb: Sb, teamId: string, after: Date, zone: string): Promise<Array<{ lead: string; text: string }>> {
  const facts: Array<{ lead: string; text: string }> = [];
  const ctx = await resolveCoachChatContext(sb).catch(() => null);
  if (ctx && ctx.team_id === teamId) {
    const sg = await getTeamStrokesGained((window) => loadTeamStrokesGained(sb, { timezone: ctx.timezone, playerIds: ctx.roster.map((p) => p.id) }, window), { id: ctx.team_id, name: ctx.team_name }, { window: 'last10' }).catch(() => null);
    const areas = (sg?.detail as { areas?: Record<string, number | null> } | undefined)?.areas;
    const worst = areas ? Object.entries(areas).filter((e): e is [string, number] => typeof e[1] === 'number' && e[1] < 0).sort((a, b) => a[1] - b[1])[0] : undefined;
    if (worst) facts.push({ lead: SG_NAMES[worst[0]] ?? worst[0], text: `loses ${formatFixed(Math.abs(worst[1]))} a round, the most of any part of the game` });
  }
  const { data, error } = await sb.from('golf_events').select('title, start_time').eq('team_id', teamId).in('event_type', ['tournament', 'qualifier']).is('cancelled_at', null).gt('start_time', after.toISOString()).lte('start_time', new Date(after.getTime() + 14 * DAY).toISOString()).order('start_time').limit(1).maybeSingle();
  if (!error && data) facts.push({ lead: data.title, text: `starts ${formatWith(new Date(data.start_time), { weekday: 'long', timeZone: zone })}` });
  return facts;
}

/** A coach's plan, as the builder edits it: its draft body, the Why lines, the event's window, the roster and the bank. RLS answers coaches of the plan's team only. */
export async function loadPlanForBuilder(planId: string): Promise<{ status: 'ready'; data: ChBuilderData } | { status: 'gone' } | { status: 'unavailable' }> {
  const sb = await createClient();
  const { data, error } = await practiceTables(sb).from('golf_practice_plans').select('*').eq('id', planId).maybeSingle();
  if (error) return isPracticeMissing(error.code) ? { status: 'unavailable' } : { status: 'gone' };
  const row = data as PlanRow | null;
  const body = row ? parsePlanBody(row.body) : null;
  if (!row || !body || !row.event_id) return { status: 'gone' };
  const { data: event, error: eventError } = await sb.from('golf_events').select('id, title, start_time, end_time, location, all_day, recurrence_rule, parent_event_id').eq('id', row.event_id).maybeSingle();
  if (eventError || !event) return { status: 'gone' };
  // What players have now, for What changed on Republish. A version that won't read leaves the plain sheet.
  const { data: live } = row.status === 'published' && row.published_version != null ? await practiceTables(sb).from('golf_practice_plan_versions').select('body').eq('plan_id', row.id).eq('version', row.published_version).maybeSingle() : { data: null };
  const team = await teamBasics(sb, row.team_id);
  const roster = await activeRoster(sb, row.team_id);
  if (!team || !roster) return { status: 'gone' };
  const start = new Date(event.start_time);
  const helperOn = true;
  const [drills, facts, coaches, filed] = await Promise.all([
    drillBank(sb, row.team_id),
    helperOn ? helperFacts(sb, row.team_id, start, team.zone) : Promise.resolve([]),
    team.org ? sb.from('golf_coaches').select('full_name').eq('organization_id', team.org) : Promise.resolve({ data: [] as Array<{ full_name: string | null }>, error: null }),
    // A read that fails leaves the default folder; `practice_plan_id` comes with the held migrations, so the column isn't in the generated types yet.
    practiceTables(sb).from('golf_documents').select('folder').eq('practice_plan_id', row.id).maybeSingle(),
  ]);
  return {
    status: 'ready',
    data: {
      planId: row.id,
      teamId: row.team_id,
      eventId: row.event_id,
      version: row.version,
      status: row.status,
      liveBody: live ? parseVersionBody((live as { body: unknown }).body) : null,
      inSeries: !!event.recurrence_rule || !!event.parent_event_id,
      edited: editedAfterPublish(row),
      title: row.title ?? event.title,
      meta: [dayShort(start, team.zone), span(event, team.zone), event.location].filter(Boolean).join(' · '),
      dayWord: formatWith(start, { weekday: 'long', timeZone: team.zone }),
      start: event.start_time,
      end: event.end_time,
      zone: team.zone,
      team: team.name,
      coaches: (coaches.error ? [] : (coaches.data ?? [])).map((c) => c.full_name).filter((n): n is string => !!n),
      roster,
      body,
      why: (row.coach_why ?? {}) as Record<string, PlanWhy>,
      step: row.step === 'groups' || row.step === 'drills' || row.step === 'review' ? row.step : 'blocks',
      drills,
      folder: filed.error ? null : ((filed.data as { folder?: string | null } | null)?.folder ?? null),
      helperOn,
      facts,
    },
  };
}

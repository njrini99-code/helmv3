/**
 * refresh-golf-demo-realism.ts — data-realism freshness pass for the
 * "Demo University Golf" team (see scripts/refresh-demo-nick-rini.ts and
 * scripts/seed-demo-team-ops.ts, which this script is a companion to).
 *
 * Why (Fixes the data-realism portion of #910): a live click-through of the
 * demo account surfaced several things that read as obviously fake / stale:
 *
 *   1. Team-channel messages are all exactly 1 hour apart starting at
 *      08:00 UTC (04:00 America/New_York) — seed-demo-team-ops.ts's
 *      predecessor picked one hour per day with no variation, and because
 *      it never intended those hours as UTC, they land pre-dawn once
 *      rendered in the team's timezone. Reads as a bot, not a team chat.
 *   2. golf_events was seeded with day offsets relative to "whenever the
 *      seed last ran" (mid-June). Real time keeps moving, so today the
 *      "near future" events it created are now in the past while still
 *      marked `status: 'scheduled'` — the calendar shows "N upcoming" in
 *      its header while the agenda underneath is full of April/May dates.
 *      Several of those events also used a raw UTC hour where an Eastern
 *      local hour was intended (e.g. "07:00 UTC" for a tee time reads as
 *      3:00 AM once converted to America/New_York).
 *   3. golf_rounds.course_name is free text with ~20 typo'd/casing
 *      variants of the team's two real library courses ("poplar grove",
 *      "Poplar Grove (real)", "Poplar Grove GC", "Golden horshoe",
 *      "golden horeshoe", "Golden Horseshoe Gold", ...) instead of the
 *      canonical golf_courses rows the course library already has for
 *      them (Poplar Grove (real) / Golden Horseshoe gold course).
 *   4. The newest golf_rounds row is from whenever the base seed last
 *      ran — currently weeks old — so CoachHelm's rolling-window insights
 *      and any "updated X ago" copy read as stale the moment the demo
 *      sits untouched for more than a few days.
 *
 * What this does (idempotent, dry-run by default). The date/time math for
 * (A), (B), (D) lives in src/lib/golf/demo-realism-schedule.ts (pure,
 * unit-tested) — this file owns the Supabase reads/writes only.
 *
 *   A. Re-times every message in the team channel to a natural
 *      coach/player hour (7-9am or 3-6pm America/New_York, varied
 *      minutes), preserving each message's relative day-spacing but
 *      re-anchored so the most recent message lands yesterday (never in
 *      the future).
 *   B. Re-schedules the team's known named events using the SAME
 *      day-offsets-from-now the base seed used (so 6 stay in the past /
 *      6 stay in the future no matter when this runs — a rolling
 *      schedule), but treats every event hour as an America/New_York
 *      local time (correctly converted to UTC) instead of a raw UTC
 *      hour, so tee times/practices no longer land at 3 AM.
 *   C. Canonicalizes every golf_rounds.course_name variant of the team's
 *      two real library courses (Poplar Grove, Golden Horseshoe) to the
 *      exact name + course_id + city/state the course library already
 *      has for them. Every other course on the team (Pebble Beach,
 *      Forest Creek, Savannah Harbor, Jekyll Island, Cardinal, ...) is
 *      left untouched — those weren't the courses flagged as messy.
 *   D. If the newest golf_rounds.round_date on the team is more than 5
 *      days old, shifts EVERY team round forward by the same number of
 *      days (preserving relative spacing between rounds) so the newest
 *      round lands ~1 day ago. CoachHelm's rolling-window reads and any
 *      "last round" / "updated" copy freshen automatically because
 *      they're computed live off round_date, not stored separately.
 *
 * Scope & safety:
 *   - STRICTLY scoped to the hard-coded DEMO_TEAM_ID below. Every mutating
 *     query filters on team_id = DEMO_TEAM_ID (golf_events, golf_rounds)
 *     or a team-owned conversation id resolved FROM that team_id
 *     (golf_messages). Nothing outside this team is ever touched.
 *   - assertDemoTeamIdentity() reads the team row (+ confirms the demo
 *     coach is on staff) before any write and refuses to proceed unless
 *     they match what's hard-coded here — a guard against DEMO_TEAM_ID
 *     silently getting reassigned to a different row in some future
 *     migration.
 *   - Every write is an UPDATE against rows this script discovers by
 *     querying team-scoped tables at runtime — no DELETE, no destructive
 *     rewrite. Re-running is always safe: dates/times get recomputed
 *     relative to "now" and simply overwrite the same columns again.
 *   - REVIEWED-ONLY: this script is NOT executed as part of this PR. It
 *     runs with --confirm against prod after a human reviews it (see PR
 *     body for the proposed cadence).
 *
 * Known gap (documented, not fixed here — out of scope for this pass):
 *   One golf_rounds row (qualifier_id set) is loosely coupled to a
 *   golf_qualifiers.start_date/end_date and a golf_events row via
 *   target_tournament_id. Shifting round_date (D) does not cascade to
 *   golf_qualifiers dates. Pre-existing drift (round_date already sits a
 *   day outside its qualifier's date range) is not introduced by this
 *   script; fixing that coupling is a separate, more invasive change.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/refresh-golf-demo-realism.ts          # dry run (default)
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/refresh-golf-demo-realism.ts --confirm # write
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import {
  addDaysIso,
  computeEventSchedule,
  computeMessageSchedule,
  computeRoundDateShift,
  todayIsoInTz,
  type EventDef,
} from '../src/lib/golf/demo-realism-schedule';

// ---------------------------------------------------------------------------
// Hard-coded demo identity (verified against prod — see assertDemoTeamIdentity)
// ---------------------------------------------------------------------------

const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';
const DEMO_TEAM_NAME = 'Demo University Golf';
const DEMO_TEAM_JOIN_CODE = 'DEMO01';
// user_id of the demo coach login (demo@golfhelmdemo.com) — the sender of
// the coach-side messages/events this script re-times. Used only as an
// extra identity check, not as a write scope (writes are team_id-scoped).
const DEMO_COACH_USER_ID = '6db574a1-c72f-478a-95ee-44cd0ba3f107';

const TEAM_TZ = 'America/New_York';

// The two real golf_courses library rows the team's messy course_name
// variants should collapse onto (see header comment, section C).
const POPLAR_GROVE = {
  courseId: 'a5e38378-62a4-4cbf-ba2a-edc88df0fdc8',
  name: 'Poplar Grove (real)',
  city: 'Amherst',
  state: 'VA',
  // Case-insensitive prefix match — catches every observed variant
  // ("poplar grove", "Poplar Grove", "Poplar Grove GC", "Poplar Grove ",
  // "Poplar Grove (real)") without touching any other course.
  ilikePattern: 'poplar grove%',
} as const;
const GOLDEN_HORSESHOE = {
  courseId: '8dfc10c6-4e50-4b84-afa6-276b8e08cb7c',
  name: 'Golden Horseshoe gold course',
  city: 'Williamsburg',
  state: 'VA',
  // Catches "Golden horshoe", "golden horeshoe", "Golden Horseshoe GC",
  // "Golden Horseshoe Gold", "Golden Horseshoe gold course" — every
  // observed variant shares this prefix regardless of the horse{,s,e}shoe
  // typo in the middle.
  ilikePattern: 'golden hor%',
} as const;
const COURSE_CANON_GROUPS = [POPLAR_GROVE, GOLDEN_HORSESHOE] as const;

// Same 12 named events + day-offsets-from-now as scripts/seed-demo-team-ops.ts
// originally seeded (6 past, 6 future) — the fix here is (1) recomputing the
// offset relative to the CURRENT run time instead of a frozen seed-time
// "now" (rolling schedule), and (2) treating every hour below as an
// America/New_York LOCAL hour, correctly converted to UTC, instead of the
// raw-UTC hour the base seed used (which is what put a tee time at 3 AM).
const EVENT_DEFS: EventDef[] = [
  { title: 'Fall Swing Technique Clinic', startOffsetDays: -42, endOffsetDays: -42, startHour: 14, startMinute: 0, endHour: 17, endMinute: 0 },
  { title: 'Coastal Collegiate Invitational', startOffsetDays: -35, endOffsetDays: -34, startHour: 7, startMinute: 0, endHour: 18, endMinute: 0 },
  { title: 'Short-Game Lab — Bunker & Chipping', startOffsetDays: -28, endOffsetDays: -28, startHour: 15, startMinute: 0, endHour: 17, endMinute: 30 },
  { title: 'Academic Eligibility Check-In', startOffsetDays: -21, endOffsetDays: -21, startHour: 12, startMinute: 0, endHour: 13, endMinute: 0 },
  { title: 'Palmetto Qualifier — Travel to Greenville', startOffsetDays: -14, endOffsetDays: -12, startHour: 6, startMinute: 0, endHour: 20, endMinute: 0 },
  { title: 'Putting Lab — Gate Drill & Speed Control', startOffsetDays: -7, endOffsetDays: -7, startHour: 15, startMinute: 0, endHour: 17, endMinute: 0 },
  { title: 'Weekly Practice — Course Management Focus', startOffsetDays: 2, endOffsetDays: 2, startHour: 14, startMinute: 0, endHour: 17, endMinute: 0 },
  { title: 'Spring Preview Tournament', startOffsetDays: 10, endOffsetDays: 11, startHour: 8, startMinute: 0, endHour: 18, endMinute: 0 },
  { title: 'Pre-Season Qualifier — Spring Roster Selection', startOffsetDays: 17, endOffsetDays: 17, startHour: 9, startMinute: 0, endHour: 15, endMinute: 0 },
  { title: 'Team Film Session — Tournament Debrief', startOffsetDays: 25, endOffsetDays: 25, startHour: 18, startMinute: 0, endHour: 19, endMinute: 30 },
  { title: 'Tri-State Invitational', startOffsetDays: 38, endOffsetDays: 40, startHour: 7, startMinute: 30, endHour: 17, endMinute: 0 },
  { title: 'End-of-Season Team Banquet', startOffsetDays: 55, endOffsetDays: 55, startHour: 19, startMinute: 0, endHour: 22, endMinute: 0 },
];

// Round-date freshness thresholds (section D).
const STALE_THRESHOLD_DAYS = 5;
const TARGET_MOST_RECENT_OFFSET_DAYS = 1; // land the newest round "yesterday", not suspiciously exactly "today"

// ---------------------------------------------------------------------------
// Runtime state
// ---------------------------------------------------------------------------

let DRY = true;
const counts: Record<string, number> = {};
function record(label: string, n: number) {
  counts[label] = (counts[label] ?? 0) + n;
}

async function assertDemoTeamIdentity(supabase: SupabaseClient): Promise<void> {
  const { data, error } = await supabase
    .from('golf_teams')
    .select('id, name, join_code')
    .eq('id', DEMO_TEAM_ID)
    .maybeSingle();
  if (error) throw new Error(`assertDemoTeamIdentity: ${error.message}`);
  if (!data) {
    throw new Error(`Safety check failed: golf_teams row ${DEMO_TEAM_ID} not found. Refusing to run.`);
  }
  if (data.name !== DEMO_TEAM_NAME || data.join_code !== DEMO_TEAM_JOIN_CODE) {
    throw new Error(
      `Safety check failed: golf_teams ${DEMO_TEAM_ID} does not match the expected demo identity ` +
        `(name="${data.name}", join_code="${data.join_code}"; expected "${DEMO_TEAM_NAME}"/"${DEMO_TEAM_JOIN_CODE}"). ` +
        `Refusing to write — this id may no longer point at the demo team.`,
    );
  }
  const { data: staff, error: staffErr } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id, golf_coaches!inner(user_id)')
    .eq('team_id', DEMO_TEAM_ID);
  if (staffErr) throw new Error(`assertDemoTeamIdentity (staff): ${staffErr.message}`);
  const staffUserIds = ((staff ?? []) as Array<{ golf_coaches: { user_id: string } }>).map(
    (s) => s.golf_coaches.user_id,
  );
  if (!staffUserIds.includes(DEMO_COACH_USER_ID)) {
    throw new Error(
      `Safety check failed: expected demo coach user ${DEMO_COACH_USER_ID} is not staff on team ${DEMO_TEAM_ID}. Refusing to write.`,
    );
  }
}

// ===========================================================================
// A. Messages — natural hours, rolling recency
// ===========================================================================

async function refreshMessages(supabase: SupabaseClient, todayIso: string): Promise<void> {
  console.log('\n[A] Team-channel messages — natural hours + rolling recency');

  const { data: convo, error: convoErr } = await supabase
    .from('golf_conversations')
    .select('id')
    .eq('team_id', DEMO_TEAM_ID)
    .eq('is_team_chat', true)
    .maybeSingle();
  if (convoErr) throw new Error(`refreshMessages (conversation lookup): ${convoErr.message}`);
  if (!convo) {
    console.log('  no team-chat conversation found for demo team — skipping');
    return;
  }

  const { data: messages, error: msgErr } = await supabase
    .from('golf_messages')
    .select('id, created_at')
    .eq('conversation_id', convo.id)
    .order('created_at', { ascending: true });
  if (msgErr) throw new Error(`refreshMessages (message fetch): ${msgErr.message}`);
  const list = messages ?? [];
  if (list.length === 0) {
    console.log('  no messages in team-chat conversation — skipping');
    return;
  }

  const newTimestamps = computeMessageSchedule(
    list.map((m) => m.created_at as string),
    todayIso,
    TEAM_TZ,
  );
  console.log(`  ${list.length} messages, re-anchoring so most recent lands ${addDaysIso(todayIso, -1)}`);
  record('golf_messages', list.length);
  if (DRY) return;

  for (let i = 0; i < list.length; i++) {
    const { error } = await supabase.from('golf_messages').update({ created_at: newTimestamps[i] }).eq('id', list[i].id);
    if (error) throw new Error(`refreshMessages (update ${list[i].id}): ${error.message}`);
  }
}

// ===========================================================================
// B. Events — rolling schedule, sane (ET-correct) start times
// ===========================================================================

async function refreshEvents(supabase: SupabaseClient, todayIso: string): Promise<void> {
  console.log('\n[B] Calendar events — rolling schedule + ET-correct start times');

  const { data: events, error } = await supabase
    .from('golf_events')
    .select('id, title')
    .eq('team_id', DEMO_TEAM_ID);
  if (error) throw new Error(`refreshEvents (fetch): ${error.message}`);
  const byTitle = new Map((events ?? []).map((e) => [e.title as string, e.id as string]));

  const scheduled = computeEventSchedule(todayIso, EVENT_DEFS, TEAM_TZ);
  let matched = 0;
  for (const s of scheduled) {
    const id = byTitle.get(s.title);
    if (!id) {
      console.log(`  ⚠ event "${s.title}" not found on demo team — skipping (seed may have changed)`);
      continue;
    }
    matched++;
    console.log(`  ${s.title}: ${s.startTime} → ${s.endTime} (${s.status})`);
    if (DRY) continue;
    const { error: updErr } = await supabase
      .from('golf_events')
      .update({ start_time: s.startTime, end_time: s.endTime, status: s.status })
      .eq('id', id);
    if (updErr) throw new Error(`refreshEvents (update ${id}): ${updErr.message}`);
  }
  record('golf_events', matched);
  console.log(`  ${matched}/${EVENT_DEFS.length} known events matched + rescheduled`);
}

// ===========================================================================
// C. Course-name canonicalization
// ===========================================================================

async function canonicalizeCourses(supabase: SupabaseClient): Promise<void> {
  console.log('\n[C] Round course-name canonicalization');

  for (const group of COURSE_CANON_GROUPS) {
    if (DRY) {
      const { count, error } = await supabase
        .from('golf_rounds')
        .select('id', { count: 'exact', head: true })
        .eq('team_id', DEMO_TEAM_ID)
        .ilike('course_name', group.ilikePattern);
      if (error) throw new Error(`canonicalizeCourses (count, ${group.name}): ${error.message}`);
      console.log(`  [dry] would canonicalize ${count ?? 0} rounds matching "${group.ilikePattern}" → "${group.name}"`);
      record(`golf_rounds:course→${group.name}`, count ?? 0);
      continue;
    }
    const { data, error } = await supabase
      .from('golf_rounds')
      .update({
        course_id: group.courseId,
        course_name: group.name,
        course_city: group.city,
        course_state: group.state,
      })
      .eq('team_id', DEMO_TEAM_ID)
      .ilike('course_name', group.ilikePattern)
      .select('id');
    if (error) throw new Error(`canonicalizeCourses (update, ${group.name}): ${error.message}`);
    const n = data?.length ?? 0;
    console.log(`  canonicalized ${n} rounds matching "${group.ilikePattern}" → "${group.name}"`);
    record(`golf_rounds:course→${group.name}`, n);
  }
}

// ===========================================================================
// D. Round-date freshness — keep the newest round within ~5 days of "now"
// ===========================================================================

async function refreshRoundFreshness(supabase: SupabaseClient, todayIso: string): Promise<void> {
  console.log('\n[D] Round-date freshness (keeps CoachHelm rolling-window + "updated X" fresh)');

  const { data: rounds, error } = await supabase
    .from('golf_rounds')
    .select('id, round_date')
    .eq('team_id', DEMO_TEAM_ID);
  if (error) throw new Error(`refreshRoundFreshness (fetch): ${error.message}`);
  const list = rounds ?? [];
  if (list.length === 0) {
    console.log('  no rounds on demo team — skipping');
    return;
  }

  const roundDates = list.map((r) => r.round_date as string);
  const shiftDays = computeRoundDateShift(roundDates, todayIso, STALE_THRESHOLD_DAYS, TARGET_MOST_RECENT_OFFSET_DAYS);
  const maxDate = roundDates.reduce((a, b) => (a > b ? a : b));
  if (shiftDays === null) {
    console.log(`  newest round is ${maxDate} — within the ${STALE_THRESHOLD_DAYS}d threshold, no shift needed`);
    return;
  }

  console.log(
    `  newest round is ${maxDate} — shifting all ${list.length} rounds forward by ${shiftDays}d ` +
      `(newest lands ${addDaysIso(maxDate, shiftDays)})`,
  );
  record('golf_rounds:date-shift', list.length);
  if (DRY) return;

  for (const r of list) {
    const newDate = addDaysIso(r.round_date as string, shiftDays);
    const { error: updErr } = await supabase.from('golf_rounds').update({ round_date: newDate }).eq('id', r.id);
    if (updErr) throw new Error(`refreshRoundFreshness (update ${r.id}): ${updErr.message}`);
  }
}

// ===========================================================================
async function main() {
  DRY = !process.argv.includes('--confirm');
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  console.log(`${DRY ? '[DRY RUN] ' : ''}Refreshing Demo University Golf demo realism (team ${DEMO_TEAM_ID})...`);
  if (DRY) console.log('Printing plan, writing NOTHING. Re-run with --confirm.');

  await assertDemoTeamIdentity(supabase);
  console.log('Safety check passed: team identity + demo coach staff membership confirmed.');

  const todayIso = todayIsoInTz(TEAM_TZ);
  console.log(`"Today" in ${TEAM_TZ}: ${todayIso}`);

  await refreshMessages(supabase, todayIso);
  await refreshEvents(supabase, todayIso);
  await canonicalizeCourses(supabase);
  await refreshRoundFreshness(supabase, todayIso);

  console.log(`\n${DRY ? '[DRY RUN] would touch' : 'Touched'} rows:`);
  for (const [label, n] of Object.entries(counts)) console.log(`  ${label.padEnd(36)} ${n}`);
  console.log(`\nDone.${DRY ? ' (dry run — no writes)' : ''}`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

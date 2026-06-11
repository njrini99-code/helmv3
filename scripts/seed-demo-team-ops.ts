/**
 * Seed "team ops" surfaces for the Demo University Golf team so the app looks
 * like a real, active coaching environment.
 *
 * Surfaces seeded:
 *   1. golf_events + golf_event_attendance
 *   2. golf_tasks + golf_task_assignments (completion tracked via status/completed_at)
 *   3. golf_conversations (team channel) + golf_conversation_participants + golf_messages
 *   4. golf_announcements + golf_announcement_acknowledgements
 *   5. golf_documents
 *   6. golf_travel_itineraries
 *   7. golf_qualifiers + golf_qualifier_entries
 *
 * IDEMPOTENT: deletes only rows scoped to DEMO_TEAM_ID that were created by
 * this script (identified by team_id FK), then re-inserts.
 *
 * NOTE: golf_task_completions does NOT exist in this schema. Completion state
 * is recorded on golf_task_assignments.status + completed_at.
 *
 * Usage:
 *   DOTENV_CONFIG_PATH=.vercel/.env.production.local \
 *     npx tsx -r dotenv/config scripts/seed-demo-team-ops.ts
 *   --dry-run flag prints what it WOULD insert without writing.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DEMO_TEAM_ID = '6ecdd1a6-63fe-4beb-b094-00118f334163';

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

/** Add `days` to `base` date, return ISO timestamp string. */
function addDays(base: Date, days: number): string {
  const d = new Date(base.getTime() + days * 86_400_000);
  return d.toISOString();
}

/** Return an ISO timestamp for today at a specific hour (24h, UTC). */
function todayAt(base: Date, hourUtc: number, minuteUtc = 0): string {
  const d = new Date(base);
  d.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return d.toISOString();
}

function addDaysAt(base: Date, days: number, hourUtc: number, minuteUtc = 0): string {
  const shifted = new Date(base.getTime() + days * 86_400_000);
  shifted.setUTCHours(hourUtc, minuteUtc, 0, 0);
  return shifted.toISOString();
}

/** Chunk an array into slices of at most `size`. */
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/** Insert rows in chunks, abort on first error. */
async function bulkInsert<T extends Record<string, unknown>>(
  supabase: SupabaseClient,
  table: string,
  rows: T[],
  dryRun: boolean,
  label: string,
): Promise<void> {
  if (dryRun) {
    console.log(`  [dry-run] would insert ${rows.length} rows into ${table}`);
    return;
  }
  for (const batch of chunk(rows, 100)) {
    const { error } = await supabase.from(table).insert(batch as Parameters<ReturnType<SupabaseClient['from']>['insert']>[0]);
    if (error) throw new Error(`[${label}] insert into ${table}: ${error.message}`);
  }
  console.log(`  inserted ${rows.length} rows → ${table}`);
}

/** Delete rows scoped to demo team, log count. */
async function scopedDelete(
  supabase: SupabaseClient,
  table: string,
  filter: { column: string; value: string },
  dryRun: boolean,
  label: string,
): Promise<void> {
  if (dryRun) {
    console.log(`  [dry-run] would delete ${table} where ${filter.column}=${filter.value}`);
    return;
  }
  const { error, count } = await supabase
    .from(table)
    .delete({ count: 'exact' })
    .eq(filter.column, filter.value);
  if (error) throw new Error(`[${label}] delete from ${table}: ${error.message}`);
  console.log(`  deleted ${count ?? '?'} rows from ${table} where ${filter.column}=${filter.value}`);
}

// ---------------------------------------------------------------------------
// Runtime resolution helpers
// ---------------------------------------------------------------------------

interface PlayerRow {
  player_id: string;
  user_id: string;
  first_name: string | null;
  last_name: string | null;
}

interface CoachRow {
  id: string;   // golf_coaches.id
  user_id: string;
}

async function resolveRoster(supabase: SupabaseClient): Promise<PlayerRow[]> {
  const { data, error } = await supabase
    .from('golf_team_members')
    .select('player_id, golf_players!inner(user_id, first_name, last_name)')
    .eq('team_id', DEMO_TEAM_ID)
    .eq('status', 'active');
  if (error) throw new Error(`resolveRoster: ${error.message}`);
  return ((data ?? []) as Array<{
    player_id: string;
    golf_players: { user_id: string; first_name: string | null; last_name: string | null };
  }>).map((r) => ({
    player_id: r.player_id,
    user_id: r.golf_players.user_id,
    first_name: r.golf_players.first_name,
    last_name: r.golf_players.last_name,
  }));
}

async function resolveCoach(supabase: SupabaseClient): Promise<CoachRow> {
  // Primary coach on the demo team
  const { data: primaryData, error: primaryError } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id, golf_coaches!inner(id, user_id)')
    .eq('team_id', DEMO_TEAM_ID)
    .eq('is_primary', true)
    .limit(1)
    .maybeSingle();
  if (!primaryError && primaryData) {
    const c = primaryData as { golf_coaches: { id: string; user_id: string } };
    return { id: c.golf_coaches.id, user_id: c.golf_coaches.user_id };
  }
  // Fallback: any staff coach on the team
  const { data: anyData, error: anyError } = await supabase
    .from('golf_team_coach_staff')
    .select('coach_id, golf_coaches!inner(id, user_id)')
    .eq('team_id', DEMO_TEAM_ID)
    .limit(1)
    .maybeSingle();
  if (anyError || !anyData) throw new Error(`resolveCoach: no coach found for team ${DEMO_TEAM_ID}`);
  const c = anyData as { golf_coaches: { id: string; user_id: string } };
  return { id: c.golf_coaches.id, user_id: c.golf_coaches.user_id };
}

// ---------------------------------------------------------------------------
// 1. Events + Attendance
// ---------------------------------------------------------------------------

async function seedEvents(
  supabase: SupabaseClient,
  coach: CoachRow,
  players: PlayerRow[],
  now: Date,
  dryRun: boolean,
): Promise<string[]> {
  console.log('\n[1] Events + Attendance');

  // Delete attendance first (FK), then events
  const { data: existingEvents } = await supabase
    .from('golf_events')
    .select('id')
    .eq('team_id', DEMO_TEAM_ID);
  const existingEventIds = (existingEvents ?? []).map((e: { id: string }) => e.id);

  if (!dryRun && existingEventIds.length > 0) {
    for (const batch of chunk(existingEventIds, 100)) {
      const { error } = await supabase
        .from('golf_event_attendance')
        .delete()
        .in('event_id', batch);
      if (error) throw new Error(`delete golf_event_attendance: ${error.message}`);
    }
    console.log(`  deleted attendance for ${existingEventIds.length} existing events`);
  } else if (dryRun) {
    console.log(`  [dry-run] would delete attendance for existing events`);
  }

  await scopedDelete(supabase, 'golf_events', { column: 'team_id', value: DEMO_TEAM_ID }, dryRun, 'events');

  // Define 12 events: 6 past, 1 today, 5 future
  type EventDef = {
    id: string;
    title: string;
    event_type: string;
    start_time: string;
    end_time: string;
    location: string;
    description: string;
    status: string;
    requires_rsvp: boolean;
    isPast: boolean;
  };

  const events: EventDef[] = [
    // Past events (6)
    {
      id: randomUUID(),
      title: 'Fall Swing Technique Clinic',
      event_type: 'practice',
      start_time: addDaysAt(now, -42, 14),
      end_time:   addDaysAt(now, -42, 17),
      location: 'Demo University Practice Facility',
      description: 'Full-swing mechanics focus: ball-flight laws, D-plane fundamentals, and on-course application drills.',
      status: 'completed',
      requires_rsvp: false,
      isPast: true,
    },
    {
      id: randomUUID(),
      title: 'Coastal Collegiate Invitational',
      event_type: 'tournament',
      start_time: addDaysAt(now, -35, 7),
      end_time:   addDaysAt(now, -34, 18),
      location: 'Oceanside Golf Club — Myrtle Beach, SC',
      description: '36-hole stroke-play invitational. Tee times drawn 10 days prior. Travel departs Sunday 05:30.',
      status: 'completed',
      requires_rsvp: true,
      isPast: true,
    },
    {
      id: randomUUID(),
      title: 'Short-Game Lab — Bunker & Chipping',
      event_type: 'practice',
      start_time: addDaysAt(now, -28, 15),
      end_time:   addDaysAt(now, -28, 17, 30),
      location: 'Demo University Short-Game Area',
      description: 'Sand wedge technique, up-and-down percentages, and greenside creativity. Bring your gap, sand, and lob wedges.',
      status: 'completed',
      requires_rsvp: false,
      isPast: true,
    },
    {
      id: randomUUID(),
      title: 'Academic Eligibility Check-In',
      event_type: 'meeting',
      start_time: addDaysAt(now, -21, 12),
      end_time:   addDaysAt(now, -21, 13),
      location: 'Athletics Academic Center — Room 204',
      description: 'Mid-semester GPA review with academic advisor. Mandatory for all scholarship athletes.',
      status: 'completed',
      requires_rsvp: true,
      isPast: true,
    },
    {
      id: randomUUID(),
      title: 'Palmetto Qualifier — Travel to Greenville',
      event_type: 'travel',
      start_time: addDaysAt(now, -14, 6),
      end_time:   addDaysAt(now, -12, 20),
      location: 'Greenville Country Club — Greenville, SC',
      description: 'Van departs Athletic Complex at 06:00. Qualifier rounds Friday–Saturday.',
      status: 'completed',
      requires_rsvp: false,
      isPast: true,
    },
    {
      id: randomUUID(),
      title: 'Putting Lab — Gate Drill & Speed Control',
      event_type: 'practice',
      start_time: addDaysAt(now, -7, 15),
      end_time:   addDaysAt(now, -7, 17),
      location: 'Demo University Practice Putting Green',
      description: 'Gate drill for face-angle control, ladder drills for speed calibration, and pressure 10-ball challenges.',
      status: 'completed',
      requires_rsvp: false,
      isPast: true,
    },
    // Near-future events (5)
    {
      id: randomUUID(),
      title: 'Weekly Practice — Course Management Focus',
      event_type: 'practice',
      start_time: addDaysAt(now, 2, 14),
      end_time:   addDaysAt(now, 2, 17),
      location: 'Demo University Practice Facility',
      description: 'Simulated on-course decision-making: driving strategy, lay-up distances, and approach-angle selection. Bring your yardage book.',
      status: 'scheduled',
      requires_rsvp: false,
      isPast: false,
    },
    {
      id: randomUUID(),
      title: 'Spring Preview Tournament',
      event_type: 'tournament',
      start_time: addDaysAt(now, 10, 8),
      end_time:   addDaysAt(now, 11, 18),
      location: 'Magnolia Ridge Golf Club — Columbia, SC',
      description: '36-hole stroke play. Pairings released 5 days prior. Full travel itinerary forthcoming.',
      status: 'scheduled',
      requires_rsvp: true,
      isPast: false,
    },
    {
      id: randomUUID(),
      title: 'Pre-Season Qualifier — Spring Roster Selection',
      event_type: 'qualifier',
      start_time: addDaysAt(now, 17, 9),
      end_time:   addDaysAt(now, 17, 15),
      location: 'Demo University Home Course',
      description: 'Single 18-hole stroke-play qualifier. Top 5 earns automatic selection for the Spring Invitational. See qualifier rules doc.',
      status: 'scheduled',
      requires_rsvp: true,
      isPast: false,
    },
    {
      id: randomUUID(),
      title: 'Team Film Session — Tournament Debrief',
      event_type: 'meeting',
      start_time: addDaysAt(now, 25, 18),
      end_time:   addDaysAt(now, 25, 19, 30),
      location: 'Athletics Film Room B',
      description: 'Video review of the Spring Preview Tournament: tee-shot tendencies, approach misses, and putting from 5–15 feet.',
      status: 'scheduled',
      requires_rsvp: false,
      isPast: false,
    },
    {
      id: randomUUID(),
      title: 'Tri-State Invitational',
      event_type: 'tournament',
      start_time: addDaysAt(now, 38, 7, 30),
      end_time:   addDaysAt(now, 40, 17),
      location: 'Pinehurst No. 9 — Pinehurst, NC',
      description: '54-hole stroke-play invitational. Top regional programs invited. Travel departs Friday 05:00.',
      status: 'scheduled',
      requires_rsvp: true,
      isPast: false,
    },
    {
      id: randomUUID(),
      title: 'End-of-Season Team Banquet',
      event_type: 'meeting',
      start_time: addDaysAt(now, 55, 19),
      end_time:   addDaysAt(now, 55, 22),
      location: 'University Ballroom — Student Union',
      description: 'Annual awards dinner. Dress: business casual. Partners and families welcome.',
      status: 'scheduled',
      requires_rsvp: true,
      isPast: false,
    },
  ];

  // Insert events
  const eventRows = events.map((e) => ({
    id: e.id,
    team_id: DEMO_TEAM_ID,
    created_by: coach.id,
    title: e.title,
    event_type: e.event_type,
    start_time: e.start_time,
    end_time: e.end_time,
    location: e.location,
    description: e.description,
    status: e.status,
    requires_rsvp: e.requires_rsvp,
  }));
  await bulkInsert(supabase, 'golf_events', eventRows, dryRun, 'events');

  // Insert attendance: accepted for past, mix for future
  const attendanceRows: Array<{
    id: string;
    event_id: string;
    player_id: string;
    status: string;
    rsvp_at: string;
  }> = [];

  for (const event of events) {
    for (const player of players) {
      if (event.isPast) {
        attendanceRows.push({
          id: randomUUID(),
          event_id: event.id,
          player_id: player.player_id,
          status: 'accepted',
          rsvp_at: addDays(now, -45),
        });
      } else {
        // 60% accepted, 40% pending for future events
        const accepted = (player.player_id.charCodeAt(0) + event.start_time.charCodeAt(5)) % 10 < 6;
        attendanceRows.push({
          id: randomUUID(),
          event_id: event.id,
          player_id: player.player_id,
          status: accepted ? 'accepted' : 'pending',
          rsvp_at: accepted ? addDays(now, -2) : addDays(now, 0),
        });
      }
    }
  }
  await bulkInsert(supabase, 'golf_event_attendance', attendanceRows, dryRun, 'attendance');

  return events.map((e) => e.id);
}

// ---------------------------------------------------------------------------
// 2. Tasks + Assignments
// ---------------------------------------------------------------------------

async function seedTasks(
  supabase: SupabaseClient,
  coach: CoachRow,
  players: PlayerRow[],
  now: Date,
  dryRun: boolean,
): Promise<void> {
  console.log('\n[2] Tasks + Assignments');

  // Delete assignments first (FK), then tasks
  const { data: existingTasks } = await supabase
    .from('golf_tasks')
    .select('id')
    .eq('team_id', DEMO_TEAM_ID);
  const existingTaskIds = (existingTasks ?? []).map((t: { id: string }) => t.id);

  if (!dryRun && existingTaskIds.length > 0) {
    for (const batch of chunk(existingTaskIds, 100)) {
      const { error } = await supabase
        .from('golf_task_assignments')
        .delete()
        .in('task_id', batch);
      if (error) throw new Error(`delete golf_task_assignments: ${error.message}`);
    }
    console.log(`  deleted assignments for ${existingTaskIds.length} existing tasks`);
  } else if (dryRun) {
    console.log(`  [dry-run] would delete task assignments`);
  }

  await scopedDelete(supabase, 'golf_tasks', { column: 'team_id', value: DEMO_TEAM_ID }, dryRun, 'tasks');

  type TaskDef = {
    id: string;
    title: string;
    description: string;
    status: string;
    priority: string;
    category: string;
    due_date: string;
    completed_at: string | null;
    assignPlayerCount: number; // how many players to assign
  };

  const tasks: TaskDef[] = [
    {
      id: randomUUID(),
      title: 'Submit Pre-Season Physical Clearance Form',
      description: 'Complete the university athletic department physical exam and upload clearance form to the compliance portal before the first scheduled tournament.',
      status: 'completed',
      priority: 'high',
      category: 'compliance',
      due_date: addDaysAt(now, -10, 17),
      completed_at: addDaysAt(now, -12, 9),
      assignPlayerCount: players.length,
    },
    {
      id: randomUUID(),
      title: 'Review Spring Tournament Schedule & Confirm Conflicts',
      description: 'Check the attached spring tournament calendar against your class/exam schedule. Reply in Messaging with any unavoidable conflicts by end of week.',
      status: 'completed',
      priority: 'medium',
      category: 'administrative',
      due_date: addDaysAt(now, -5, 17),
      completed_at: addDaysAt(now, -6, 14),
      assignPlayerCount: players.length,
    },
    {
      id: randomUUID(),
      title: 'Log 3 Putting Practice Sessions (Gate Drills)',
      description: 'Complete 3 documented putting sessions using the gate-drill protocol from this week\'s lab. Log each session in the app under Practice Log.',
      status: 'completed',
      priority: 'medium',
      category: 'practice',
      due_date: addDaysAt(now, -3, 17),
      completed_at: addDaysAt(now, -4, 16),
      assignPlayerCount: 4,
    },
    {
      id: randomUUID(),
      title: 'Update Yardage Book — Home Course',
      description: 'Walk all 18 holes and annotate pin positions, layup distances, and bailout zones. Bring updated book to the Course Management Practice session.',
      status: 'in_progress',
      priority: 'high',
      category: 'practice',
      due_date: addDaysAt(now, 1, 17),
      completed_at: null,
      assignPlayerCount: players.length,
    },
    {
      id: randomUUID(),
      title: 'Complete Swing Mechanics Self-Assessment Video',
      description: 'Record a face-on and down-the-line video of your 7-iron and driver at 70% effort. Upload to GolfHelm before the technique session.',
      status: 'in_progress',
      priority: 'medium',
      category: 'practice',
      due_date: addDaysAt(now, 3, 17),
      completed_at: null,
      assignPlayerCount: 5,
    },
    {
      id: randomUUID(),
      title: 'Watch Pre-Tournament Course Overview Video',
      description: 'Review the 12-minute video breakdown of Magnolia Ridge Golf Club uploaded to Documents. Focus on par-4 driving corridors and par-3 wind exposure.',
      status: 'pending',
      priority: 'high',
      category: 'preparation',
      due_date: addDaysAt(now, 7, 17),
      completed_at: null,
      assignPlayerCount: players.length,
    },
    {
      id: randomUUID(),
      title: 'Submit Spring Invitational Travel Preferences Form',
      description: 'Complete the linked roommate preference and dietary restriction form for the Spring Invitational hotel block. Deadline is firm — no exceptions.',
      status: 'pending',
      priority: 'medium',
      category: 'travel',
      due_date: addDaysAt(now, 6, 17),
      completed_at: null,
      assignPlayerCount: players.length,
    },
    {
      id: randomUUID(),
      title: 'Individual Goal-Setting Meeting with Coach',
      description: 'Schedule a 20-minute 1:1 with Coach to review your stats dashboard, set 3 measurable goals for the spring semester, and align on your development plan.',
      status: 'pending',
      priority: 'low',
      category: 'development',
      due_date: addDaysAt(now, 14, 17),
      completed_at: null,
      assignPlayerCount: players.length,
    },
  ];

  const taskRows = tasks.map((t) => ({
    id: t.id,
    team_id: DEMO_TEAM_ID,
    title: t.title,
    description: t.description,
    status: t.status,
    priority: t.priority,
    category: t.category,
    due_date: t.due_date,
    completed_at: t.completed_at,
    assigned_by: coach.id,
  }));
  await bulkInsert(supabase, 'golf_tasks', taskRows, dryRun, 'tasks');

  // Assignments
  const assignmentRows: Array<{
    id: string;
    task_id: string;
    player_id: string;
    status: string;
    assigned_at: string;
    completed_at: string | null;
  }> = [];

  for (const task of tasks) {
    const assignedPlayers = players.slice(0, task.assignPlayerCount);
    for (const player of assignedPlayers) {
      assignmentRows.push({
        id: randomUUID(),
        task_id: task.id,
        player_id: player.player_id,
        status: task.status,
        assigned_at: addDays(now, -45),
        completed_at: task.completed_at,
      });
    }
  }
  await bulkInsert(supabase, 'golf_task_assignments', assignmentRows, dryRun, 'task_assignments');
}

// ---------------------------------------------------------------------------
// 3. Conversations + Participants + Messages
// ---------------------------------------------------------------------------

async function seedMessages(
  supabase: SupabaseClient,
  coach: CoachRow,
  players: PlayerRow[],
  now: Date,
  dryRun: boolean,
): Promise<void> {
  console.log('\n[3] Conversations + Participants + Messages');

  // Delete messages → participants → conversations scoped to team
  const { data: existingConvs } = await supabase
    .from('golf_conversations')
    .select('id')
    .eq('team_id', DEMO_TEAM_ID);
  const existingConvIds = (existingConvs ?? []).map((c: { id: string }) => c.id);

  if (!dryRun && existingConvIds.length > 0) {
    for (const batch of chunk(existingConvIds, 100)) {
      let { error } = await supabase.from('golf_messages').delete().in('conversation_id', batch);
      if (error) throw new Error(`delete golf_messages: ${error.message}`);
      ({ error } = await supabase.from('golf_conversation_participants').delete().in('conversation_id', batch));
      if (error) throw new Error(`delete golf_conversation_participants: ${error.message}`);
    }
    console.log(`  deleted messages + participants for ${existingConvIds.length} existing conversations`);
  } else if (dryRun) {
    console.log(`  [dry-run] would delete messages + participants`);
  }

  await scopedDelete(supabase, 'golf_conversations', { column: 'team_id', value: DEMO_TEAM_ID }, dryRun, 'conversations');

  const convId = randomUUID();

  const convRow = {
    id: convId,
    team_id: DEMO_TEAM_ID,
    created_by: coach.user_id,
    is_team_channel: true,
    is_team_chat: true,
    title: 'Demo University Golf — Team Channel',
  };
  await bulkInsert(supabase, 'golf_conversations', [convRow], dryRun, 'conversations');

  // Participants: coach + all players
  const participantRows = [
    { id: randomUUID(), conversation_id: convId, user_id: coach.user_id, joined_at: addDays(now, -60) },
    ...players.map((p) => ({
      id: randomUUID(),
      conversation_id: convId,
      user_id: p.user_id,
      joined_at: addDays(now, -60),
    })),
  ];
  await bulkInsert(supabase, 'golf_conversation_participants', participantRows, dryRun, 'participants');

  // 15 messages over past 14 days, alternating coach + players
  const allSenders = [coach.user_id, ...players.map((p) => p.user_id)];

  const messageDefs: Array<{ daysAgo: number; senderIndex: number; content: string }> = [
    {
      daysAgo: 14,
      senderIndex: 0, // coach
      content:
        'Good morning team — spring semester practice schedule is live in the calendar. Please review this week\'s events and confirm your attendance.',
    },
    {
      daysAgo: 13,
      senderIndex: 1,
      content: 'Coach, quick question — is the Course Management session this Thursday on the range or do we walk the course?',
    },
    {
      daysAgo: 13,
      senderIndex: 0,
      content:
        'Great question. We\'ll start on the range for 45 minutes, then head out to holes 10–18 to work on driving decisions and layup distances. Bring your 3-wood and a full bag.',
    },
    {
      daysAgo: 12,
      senderIndex: 2,
      content: 'Just finished my yardage book update for the back nine. Hole 14 has a new bunker that\'s not on the course planner — flagged it for everyone.',
    },
    {
      daysAgo: 10,
      senderIndex: 0,
      content:
        'Reminder: pre-season physicals are due by end of this week. Two of you still have not uploaded your clearance forms. Check your tasks — it\'s listed as high priority.',
    },
    {
      daysAgo: 9,
      senderIndex: 3,
      content: 'Done — clearance form uploaded. Also finished my swing video self-assessment for the mechanic review.',
    },
    {
      daysAgo: 9,
      senderIndex: 4,
      content: 'Same here — files are in. The down-the-line angle was eye-opening, my hip turn at impact is way earlier than I thought.',
    },
    {
      daysAgo: 7,
      senderIndex: 0,
      content:
        'Excellent putting lab session today. Gate drill numbers are improving across the board — let\'s keep building on this. Individual stats are updated in the app if you want to compare your before/after face-angle miss.',
    },
    {
      daysAgo: 6,
      senderIndex: 1,
      content: 'That session was really helpful. Seeing the face-angle data on the misses makes it a lot easier to self-correct.',
    },
    {
      daysAgo: 5,
      senderIndex: 0,
      content:
        'Spring Preview Tournament pairings are posted — check the calendar for your tee time. We tee off 08:00 from hole 1. Van departs 05:30 sharp from the Athletic Complex.',
    },
    {
      daysAgo: 4,
      senderIndex: 2,
      content: 'Got it. Should we bring our own snacks or is the club handling on-course refreshments?',
    },
    {
      daysAgo: 4,
      senderIndex: 0,
      content:
        'Club provides fruit and water. Bring your own energy bars and anything you normally rely on during a round. We play 36 holes that weekend so fuel accordingly.',
    },
    {
      daysAgo: 3,
      senderIndex: 5,
      content: 'Travel preferences form submitted! Also — I watched the Magnolia Ridge course video twice. That par-5 on 12 into the wind is going to be a serious lay-up decision.',
    },
    {
      daysAgo: 2,
      senderIndex: 0,
      content:
        'Yes, hole 12 is the pivotal hole. Our data shows that players who lay up to 100 yards make birdie or par 68% of the time vs. 41% going for it. We\'ll work through the decision tree in Thursday\'s session.',
    },
    {
      daysAgo: 1,
      senderIndex: 3,
      content: 'Looking forward to Thursday. Also finished the course overview video — really good breakdown of the par-3s. Wind exposure on 7 and 16 is going to be tricky.',
    },
  ];

  const messageRows = messageDefs.map((m, i) => ({
    id: randomUUID(),
    conversation_id: convId,
    sender_id: allSenders[m.senderIndex % allSenders.length],
    content: m.content,
    created_at: addDaysAt(now, -m.daysAgo, 8 + (i % 10)),
    read: m.daysAgo > 1,
  }));
  await bulkInsert(supabase, 'golf_messages', messageRows, dryRun, 'messages');
}

// ---------------------------------------------------------------------------
// 4. Announcements + Acknowledgements
// ---------------------------------------------------------------------------

async function seedAnnouncements(
  supabase: SupabaseClient,
  coach: CoachRow,
  players: PlayerRow[],
  now: Date,
  dryRun: boolean,
): Promise<void> {
  console.log('\n[4] Announcements + Acknowledgements');

  // Delete acks first (FK), then announcements
  const { data: existingAnn } = await supabase
    .from('golf_announcements')
    .select('id')
    .eq('team_id', DEMO_TEAM_ID);
  const existingAnnIds = (existingAnn ?? []).map((a: { id: string }) => a.id);

  if (!dryRun && existingAnnIds.length > 0) {
    for (const batch of chunk(existingAnnIds, 100)) {
      const { error } = await supabase
        .from('golf_announcement_acknowledgements')
        .delete()
        .in('announcement_id', batch);
      if (error) throw new Error(`delete golf_announcement_acknowledgements: ${error.message}`);
    }
    console.log(`  deleted acks for ${existingAnnIds.length} existing announcements`);
  } else if (dryRun) {
    console.log(`  [dry-run] would delete announcement acknowledgements`);
  }

  await scopedDelete(supabase, 'golf_announcements', { column: 'team_id', value: DEMO_TEAM_ID }, dryRun, 'announcements');

  type AnnDef = {
    id: string;
    title: string;
    body: string;
    urgency: string;
    requires_acknowledgement: boolean;
    created_at: string;
    published_at: string;
    ackPlayerCount: number;
  };

  const announcements: AnnDef[] = [
    {
      id: randomUUID(),
      title: 'Spring Semester Practice Schedule — Effective Immediately',
      body: 'The spring practice schedule is now posted in the Calendar. All Monday/Wednesday/Friday afternoon sessions are mandatory unless you have a documented conflict. Conflicts must be submitted at least 48 hours in advance via the Tasks system.',
      urgency: 'normal',
      requires_acknowledgement: true,
      created_at: addDaysAt(now, -21, 9),
      published_at: addDaysAt(now, -21, 9),
      ackPlayerCount: players.length,
    },
    {
      id: randomUUID(),
      title: 'Tournament Conduct & Uniform Policy Reminder',
      body: 'As we enter tournament season, please review the team uniform policy document (linked in Documents). All players must wear team-issued polos during competition rounds. Hats must be worn with brims forward. Any violation results in a team-conduct debrief with coaching staff.',
      urgency: 'normal',
      requires_acknowledgement: true,
      created_at: addDaysAt(now, -14, 10),
      published_at: addDaysAt(now, -14, 10),
      ackPlayerCount: Math.max(Math.floor(players.length * 0.6), 1),
    },
    {
      id: randomUUID(),
      title: 'Spring Preview Tournament — Final Logistics',
      body: 'Departure: Athletic Complex parking lot, 05:30 sharp. Bring your full bag, rain gear, and at least 2 dozen balls. Check-in with the tournament committee by 07:30. Post-round team debrief at 18:30 in the hotel meeting room. Travel itinerary is in the Travel section.',
      urgency: 'high',
      requires_acknowledgement: false,
      created_at: addDaysAt(now, -3, 8),
      published_at: addDaysAt(now, -3, 8),
      ackPlayerCount: 0,
    },
    {
      id: randomUUID(),
      title: 'Pre-Season Qualifier — Rules & Format',
      body: 'The Spring Roster Qualifier is scheduled for next week (see Calendar). Format: 18-hole stroke play from the gold tees. Top 5 scorers earn automatic selection for the Spring Invitational. Ties broken by scorecard playoff on holes 1, 2, 3. No caddies; players must carry or use a push cart.',
      urgency: 'normal',
      requires_acknowledgement: false,
      created_at: addDaysAt(now, -1, 14),
      published_at: addDaysAt(now, -1, 14),
      ackPlayerCount: 0,
    },
  ];

  const annRows = announcements.map((a) => ({
    id: a.id,
    team_id: DEMO_TEAM_ID,
    created_by: coach.id,
    title: a.title,
    body: a.body,
    urgency: a.urgency,
    requires_acknowledgement: a.requires_acknowledgement,
    created_at: a.created_at,
    published_at: a.published_at,
    send_email: false,
    send_push: false,
  }));
  await bulkInsert(supabase, 'golf_announcements', annRows, dryRun, 'announcements');

  // Acknowledgements
  const ackRows: Array<{ id: string; announcement_id: string; player_id: string; acknowledged_at: string }> = [];
  for (const ann of announcements) {
    const ackPlayers = players.slice(0, ann.ackPlayerCount);
    for (const player of ackPlayers) {
      ackRows.push({
        id: randomUUID(),
        announcement_id: ann.id,
        player_id: player.player_id,
        acknowledged_at: addDays(now, -Math.floor(Math.random() * 5 + 1)),
      });
    }
  }
  if (ackRows.length > 0) {
    await bulkInsert(supabase, 'golf_announcement_acknowledgements', ackRows, dryRun, 'acks');
  } else if (dryRun) {
    console.log('  [dry-run] would insert 0 ack rows (no ack-required announcements with matching players)');
  }
}

// ---------------------------------------------------------------------------
// 5. Documents
// ---------------------------------------------------------------------------

async function seedDocuments(
  supabase: SupabaseClient,
  coach: CoachRow,
  now: Date,
  dryRun: boolean,
): Promise<void> {
  console.log('\n[5] Documents');

  await scopedDelete(supabase, 'golf_documents', { column: 'team_id', value: DEMO_TEAM_ID }, dryRun, 'documents');

  const docRows = [
    {
      id: randomUUID(),
      team_id: DEMO_TEAM_ID,
      uploaded_by: coach.user_id,
      title: 'Spring Practice Schedule',
      category: 'schedule',
      description: 'Full spring semester practice and competition calendar with session focus areas and mandatory attendance dates.',
      file_url: 'https://storage.demo.helmsportslabs.com/demo-team/spring-practice-schedule-2026.pdf',
      file_type: 'application/pdf',
      is_public: false,
      created_at: addDaysAt(now, -21, 9),
    },
    {
      id: randomUUID(),
      team_id: DEMO_TEAM_ID,
      uploaded_by: coach.user_id,
      title: 'Spring Invitational Tournament Packet',
      category: 'tournament',
      description: 'Magnolia Ridge Golf Club course guide, local rules, pace-of-play policy, and scoring procedures for the Spring Preview Tournament.',
      file_url: 'https://storage.demo.helmsportslabs.com/demo-team/spring-invitational-packet-2026.pdf',
      file_type: 'application/pdf',
      is_public: false,
      created_at: addDaysAt(now, -7, 10),
    },
    {
      id: randomUUID(),
      team_id: DEMO_TEAM_ID,
      uploaded_by: coach.user_id,
      title: 'Team Uniform & Conduct Policy',
      category: 'policy',
      description: 'Official team dress code, code of conduct, and expectations for competition, travel, and campus representation.',
      file_url: 'https://storage.demo.helmsportslabs.com/demo-team/uniform-conduct-policy-2026.pdf',
      file_type: 'application/pdf',
      is_public: false,
      created_at: addDaysAt(now, -14, 10),
    },
    {
      id: randomUUID(),
      team_id: DEMO_TEAM_ID,
      uploaded_by: coach.user_id,
      title: 'Academic Eligibility & GPA Policy',
      category: 'academic',
      description: 'NCAA academic eligibility standards, team GPA requirements, mandatory tutoring thresholds, and consequences for non-compliance.',
      file_url: 'https://storage.demo.helmsportslabs.com/demo-team/academic-eligibility-policy-2026.pdf',
      file_type: 'application/pdf',
      is_public: false,
      created_at: addDaysAt(now, -30, 9),
    },
  ];
  await bulkInsert(supabase, 'golf_documents', docRows, dryRun, 'documents');
}

// ---------------------------------------------------------------------------
// 6. Travel Itineraries
// ---------------------------------------------------------------------------

async function seedTravel(
  supabase: SupabaseClient,
  coach: CoachRow,
  eventIds: string[],
  now: Date,
  dryRun: boolean,
): Promise<void> {
  console.log('\n[6] Travel Itineraries');

  await scopedDelete(supabase, 'golf_travel_itineraries', { column: 'team_id', value: DEMO_TEAM_ID }, dryRun, 'travel');

  // eventIds[4] = Palmetto Qualifier (past), eventIds[7] = Spring Preview Tournament (future)
  const travelRows = [
    {
      id: randomUUID(),
      team_id: DEMO_TEAM_ID,
      created_by: coach.id,
      event_id: eventIds.length > 4 ? eventIds[4] : null,
      event_name: 'Palmetto Qualifier — Greenville',
      destination: 'Greenville, SC',
      departure_date: addDays(now, -14).slice(0, 10),
      departure_time: '06:00',
      departure_location: 'Athletic Complex Parking Lot',
      return_date: addDays(now, -12).slice(0, 10),
      return_time: '20:00',
      hotel_name: 'Marriott Greenville Downtown',
      hotel_address: '1 Parkway E, Greenville, SC 29601',
      hotel_phone: '(864) 242-7525',
      hotel_confirmation: 'MRD-2026-Q1-DEMO',
      transportation_type: 'van',
      uniform_requirements: 'Game-day uniform Day 1 (Friday). Casual team gear Day 2 travel home.',
      gear_list: ['Full bag', 'Rain suit', 'Extra gloves', 'Yardage book', 'Sunscreen'],
      notes: 'Van capacity 12. Arrive 05:45 to load clubs. No pets. Keys to hotel rooms distributed on arrival.',
    },
    {
      id: randomUUID(),
      team_id: DEMO_TEAM_ID,
      created_by: coach.id,
      event_id: eventIds.length > 7 ? eventIds[7] : null,
      event_name: 'Spring Preview Tournament — Columbia',
      destination: 'Columbia, SC',
      departure_date: addDays(now, 10).slice(0, 10),
      departure_time: '05:30',
      departure_location: 'Athletic Complex Parking Lot',
      return_date: addDays(now, 11).slice(0, 10),
      return_time: '20:30',
      hotel_name: 'Hyatt Place Columbia/Downtown',
      hotel_address: '1415 Lady St, Columbia, SC 29201',
      hotel_phone: '(803) 233-2050',
      hotel_confirmation: 'HYP-2026-SP-DEMO',
      transportation_type: 'van',
      uniform_requirements: 'Game-day uniform both competition days. Casual team gear for evening team meeting.',
      gear_list: ['Full bag', 'Rain suit', 'Extra balls (2 dozen minimum)', 'Energy bars', 'Yardage book'],
      notes: 'Check-in at tournament desk by 07:30. Team debrief 18:30 in hotel meeting room. Curfew 22:00.',
    },
  ];
  await bulkInsert(supabase, 'golf_travel_itineraries', travelRows, dryRun, 'travel');
}

// ---------------------------------------------------------------------------
// 7. Qualifiers + Entries
// ---------------------------------------------------------------------------

async function seedQualifiers(
  supabase: SupabaseClient,
  coach: CoachRow,
  players: PlayerRow[],
  eventIds: string[],
  now: Date,
  dryRun: boolean,
): Promise<void> {
  console.log('\n[7] Qualifiers + Entries');

  // Delete entries first (FK), then qualifiers
  const { data: existingQuals } = await supabase
    .from('golf_qualifiers')
    .select('id')
    .eq('team_id', DEMO_TEAM_ID);
  const existingQualIds = (existingQuals ?? []).map((q: { id: string }) => q.id);

  if (!dryRun && existingQualIds.length > 0) {
    for (const batch of chunk(existingQualIds, 100)) {
      const { error } = await supabase
        .from('golf_qualifier_entries')
        .delete()
        .in('qualifier_id', batch);
      if (error) throw new Error(`delete golf_qualifier_entries: ${error.message}`);
    }
    console.log(`  deleted entries for ${existingQualIds.length} existing qualifiers`);
  } else if (dryRun) {
    console.log(`  [dry-run] would delete qualifier entries`);
  }

  await scopedDelete(supabase, 'golf_qualifiers', { column: 'team_id', value: DEMO_TEAM_ID }, dryRun, 'qualifiers');

  const pastQualId = randomUUID();
  const futureQualId = randomUUID();

  // eventIds[8] = Pre-Season Qualifier event (future)
  const qualifierRows = [
    {
      id: pastQualId,
      team_id: DEMO_TEAM_ID,
      created_by: coach.id,
      name: 'Fall Qualifier — Travel Team Selection',
      description: 'Single 18-hole stroke-play qualifier to determine the 5-player travel roster for fall invitational tournaments.',
      start_date: addDays(now, -35).slice(0, 10),
      end_date: addDays(now, -35).slice(0, 10),
      course_name: 'Demo University Home Course',
      status: 'completed',
      selection_state: 'selected',
      selection_slots_total: 5,
      selection_slots_coach_pick: 1,
      spots_available: 5,
      rules: '18-hole stroke play. Gold tees. No caddies. Ties broken by scorecard playoff (holes 1, 2, 3).',
      target_tournament_id: eventIds.length > 1 ? eventIds[1] : null, // Coastal Collegiate
    },
    {
      id: futureQualId,
      team_id: DEMO_TEAM_ID,
      created_by: coach.id,
      name: 'Pre-Season Qualifier — Spring Invitational',
      description: 'Determines the 5-player travel roster for the Tri-State Invitational. Top 5 scorers earn automatic selection; coach holds one discretionary pick.',
      start_date: addDays(now, 17).slice(0, 10),
      end_date: addDays(now, 17).slice(0, 10),
      course_name: 'Demo University Home Course',
      status: 'upcoming',
      selection_state: 'open',
      selection_slots_total: 5,
      selection_slots_coach_pick: 1,
      spots_available: 5,
      entry_deadline: addDays(now, 15).slice(0, 10),
      rules: 'Single 18-hole stroke play. Gold tees. No caddies. Ties broken by scorecard playoff (holes 1, 2, 3). Results posted within 24 hours.',
      target_tournament_id: eventIds.length > 10 ? eventIds[10] : null, // Tri-State Invitational
    },
  ];
  await bulkInsert(supabase, 'golf_qualifiers', qualifierRows, dryRun, 'qualifiers');

  // Past qualifier entries with scores
  const pastScores = [70, 72, 73, 75, 76, 78]; // par 72 course → +/- par
  const entryRows: Array<{
    id: string;
    qualifier_id: string;
    player_id: string;
    total_score: number;
    total_to_par: number;
    score: number;
    position: number;
    rounds_completed: number;
    status: string;
  }> = [];

  const sortedPlayers = [...players].slice(0, Math.min(players.length, pastScores.length));
  // Assign scores in order (deterministic)
  for (let i = 0; i < sortedPlayers.length; i++) {
    const rawScore = pastScores[i];
    entryRows.push({
      id: randomUUID(),
      qualifier_id: pastQualId,
      player_id: sortedPlayers[i].player_id,
      total_score: rawScore,
      total_to_par: rawScore - 72,
      score: rawScore,
      position: i + 1,
      rounds_completed: 1,
      status: 'completed',
    });
  }

  // Future qualifier entries (just registered, no scores)
  for (const player of players) {
    entryRows.push({
      id: randomUUID(),
      qualifier_id: futureQualId,
      player_id: player.player_id,
      total_score: 0,
      total_to_par: 0,
      score: 0,
      position: 0,
      rounds_completed: 0,
      status: 'registered',
    });
  }

  await bulkInsert(supabase, 'golf_qualifier_entries', entryRows, dryRun, 'qualifier_entries');
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');

  const dryRun = process.argv.includes('--dry-run');
  const supabase = createClient(url, key, { auth: { persistSession: false } });
  const now = new Date();

  console.log(`${dryRun ? '[DRY RUN] ' : ''}Seeding team ops for Demo University Golf (${DEMO_TEAM_ID})`);
  console.log(`Reference date: ${now.toISOString()}`);

  // Resolve runtime data
  console.log('\n[0] Resolving roster + coach...');
  const [players, coach] = await Promise.all([
    resolveRoster(supabase),
    resolveCoach(supabase),
  ]);
  console.log(`  coach id=${coach.id} user_id=${coach.user_id}`);
  console.log(`  ${players.length} active players:`);
  for (const p of players) {
    console.log(`    ${p.first_name} ${p.last_name} (player_id=${p.player_id})`);
  }
  if (players.length === 0) throw new Error('No active players found — cannot seed without a roster.');

  // Seed each surface
  const eventIds = await seedEvents(supabase, coach, players, now, dryRun);
  await seedTasks(supabase, coach, players, now, dryRun);
  await seedMessages(supabase, coach, players, now, dryRun);
  await seedAnnouncements(supabase, coach, players, now, dryRun);
  await seedDocuments(supabase, coach, now, dryRun);
  await seedTravel(supabase, coach, eventIds, now, dryRun);
  await seedQualifiers(supabase, coach, players, eventIds, now, dryRun);

  console.log(`\nDone.${dryRun ? ' (dry run — nothing written)' : ''}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

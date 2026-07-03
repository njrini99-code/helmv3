/**
 * seed-baseball-surfaces-demo.ts — Phase-3 BaseballHelm demo surface seed.
 *
 * Closes the gap recorded in docs/audits/BASEBALLHELM_STALE_SURFACE_AUDIT_2026-06-25.md:
 * the Phase-1 demo seed (scripts/seed-baseball-demo.ts) does not populate
 * messaging, video, tasks, strength groups, developmental plans, seasons,
 * import-source registry, or stats/aggregates — so those routes render empty
 * states for the demo login. This script is a DEPENDENT extension (same
 * pattern as scripts/seed-baseball-lifting-demo.ts): it re-derives the
 * Phase-1 org/team/coach/roster ids and seeds everything else.
 *
 * Full per-table contract (anchoring parents, route mapping, schema caveats,
 * intentional-empty list): docs/seed/BASEBALLHELM_DEMO_DATA_CONTRACT.md
 *
 * TABLES SEEDED (all scoped to the Phase-1 demo team):
 *   baseball_conversations            (2)
 *   baseball_conversation_participants(11)
 *   baseball_messages                 (9)
 *   baseball_videos                   (5)
 *   baseball_tasks                    (5)
 *   baseball_task_assignments         (8)
 *   helm_lifting_groups                (2)
 *   helm_lifting_group_members         (up to 6 — see Phase-2 note below)
 *   baseball_developmental_plans      (3)
 *   baseball_seasons                  (2)
 *   baseball_import_sources           (2)
 *   baseball_import_runs              (1 additional row)
 *   baseball_stat_uploads             (1)
 *   baseball_player_stats             (24 — 3 sessions x 8 players)
 *   baseball_player_aggregates        (8 — 1 per player)
 *
 * SAFETY / IDEMPOTENCY (identical guarantees to seed-baseball-demo.ts and
 * seed-baseball-lifting-demo.ts):
 *   - All ids are deterministic (sha1 under a fixed namespace) via detId().
 *   - All writes use .upsert({ onConflict }) — never delete-then-insert.
 *   - This script creates NO auth users. It only LOOKS UP the coach/player
 *     auth users Phase-1 already created (by email, read-only). If a lookup
 *     comes back empty, the user-dependent tables (conversations/messages)
 *     are skipped with a warning instead of failing the run.
 *   - Scoped strictly to the Phase-1 demo org/team/coach/roster ids. Phase-1
 *     MUST have run first (this script depends on ids it created). Phase-2
 *     (lifting, scripts/seed-baseball-lifting-demo.ts) does NOT need to have
 *     run for most of this script. The one exception is helm_lifting_
 *     group_members (§4): each member row needs the player's
 *     helm_lifting_athletes row (created by Phase-2) to resolve an
 *     athlete_id. If Phase-2 hasn't run yet, those member rows are skipped
 *     with a warning (never thrown) — helm_lifting_groups itself still
 *     seeds either way.
 *   - Tables/columns from a not-yet-applied migration fail closed: the
 *     upsert() wrapper catches "table/column not found" errors per table and
 *     logs a skip instead of throwing, so schema drift never aborts the run.
 *
 * SAFE BY DEFAULT — dry run unless --confirm is passed.
 *
 * Run:
 *   # Dry run (prints plan, touches nothing):
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-surfaces-demo.ts
 *   # Actually seed:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/seed-baseball-surfaces-demo.ts --confirm
 *
 * Requires: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// ---------------------------------------------------------------------------
// Shared identity (MUST match scripts/seed-baseball-demo.ts exactly).
// ---------------------------------------------------------------------------
const DEMO_DOMAIN = 'baseballhelmdemo.com';
const DEMO_COACH_EMAIL = `demo-coach@${DEMO_DOMAIN}`;
const DEMO_PLAYER_EMAIL = `demo-player@${DEMO_DOMAIN}`;

// The Phase-1 seed uses 'baseballhelm-demo-phase1' as its namespace.
const NS_P1 = 'baseballhelm-demo-phase1';
// This script uses a distinct namespace so its new child-row ids never
// collide with Phase-1 or Phase-2 (helm_lifting) keys.
const NS = 'baseballhelm-demo-phase3';

function uuidFrom(namespace: string, key: string): string {
  const h = createHash('sha1').update(`${namespace}:${key}`).digest('hex');
  const b = h.slice(0, 32).split('');
  b[12] = '5';
  b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
  const s = b.join('');
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/** New Phase-3 child-row ids. */
function detId(key: string): string {
  return uuidFrom(NS, key);
}

/** Re-derive a Phase-1 id — same algorithm, Phase-1 namespace. Never re-seeds. */
function p1Id(key: string): string {
  return uuidFrom(NS_P1, key);
}

// Phase-1 stable ids (mirrored from seed-baseball-demo.ts).
const ORG_ID = p1Id('org');
const TEAM_ID = p1Id('team');
const COACH_ID = p1Id('coach');

// Phase-1 roster (same order/keys as seed-baseball-demo.ts and
// seed-baseball-lifting-demo.ts).
const ROSTER = [
  { key: 'p1', first: 'Marcus', last: 'Rodriguez', pos: 'SS' },
  { key: 'p2', first: 'Jake', last: 'Thompson', pos: 'C' },
  { key: 'p3', first: 'Caleb', last: 'Williams', pos: 'OF' },
  { key: 'p4', first: 'Ethan', last: 'Brooks', pos: 'P' },
  { key: 'p5', first: 'Noah', last: 'Mitchell', pos: '3B' },
  { key: 'p6', first: 'Liam', last: 'Harrison', pos: '2B' },
  { key: 'p7', first: 'Aiden', last: 'Clark', pos: 'P' },
  { key: 'p8', first: 'Owen', last: 'Davis', pos: 'OF' },
] as const;
type RosterKey = (typeof ROSTER)[number]['key'];
const DEMO_PLAYER_KEY: RosterKey = 'p1';

const playerIdByKey: Record<RosterKey, string> = Object.fromEntries(
  ROSTER.map((p) => [p.key, p1Id(`player:${p.key}`)]),
) as Record<RosterKey, string>;

function playerEmail(key: RosterKey): string {
  if (key === DEMO_PLAYER_KEY) return DEMO_PLAYER_EMAIL;
  const p = ROSTER.find((r) => r.key === key)!;
  return `${p.first}.${p.last}@${DEMO_DOMAIN}`.toLowerCase();
}

// ---------------------------------------------------------------------------
// Date helpers — anchor everything to "now" so the data always looks current.
// ---------------------------------------------------------------------------
const NOW = new Date();
function isoDaysAgo(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}
function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}
function isoDaysFromNow(days: number): string {
  return isoDaysAgo(-days);
}
function dateDaysFromNow(days: number): string {
  return dateDaysAgo(-days);
}

// ---------------------------------------------------------------------------
// Upsert wrapper + counters (identical pattern to seed-baseball-lifting-demo.ts).
// ---------------------------------------------------------------------------
type Counts = Record<string, number>;
const counts: Counts = {};
let DRY = false;
let supabase: SupabaseClient;

const skipped: string[] = [];
async function upsert(table: string, rows: readonly unknown[], conflict = 'id') {
  if (rows.length === 0) return;
  counts[table] = (counts[table] ?? 0) + rows.length;
  if (DRY) return;
  const { error } = await supabase.from(table).upsert(rows as never, { onConflict: conflict });
  if (error) {
    const msg = error.message ?? '';
    if (
      /could not find the table|schema cache|does not exist|could not find the '.*' column|violates not-null constraint|violates check constraint/i.test(
        msg,
      )
    ) {
      delete counts[table];
      skipped.push(`${table} — ${msg}`);
      console.warn(`  ⚠ skipped ${table} (schema not present): ${msg}`);
      return;
    }
    throw new Error(`upsert ${table} failed: ${msg}`);
  }
}

/** Read-only lookup. Phase-3 never creates auth users — only Phase-1 does. */
async function lookupUserId(email: string): Promise<string | null> {
  const { data } = await supabase.from('users').select('id').ilike('email', email).maybeSingle();
  return (data?.id as string | undefined) ?? null;
}

/**
 * Resolve baseball_players.id → helm_lifting_athletes.id for the demo org.
 * Reimplements (rather than imports) the mapping logic in
 * src/lib/lifting/resolve-baseball-context.ts's resolveBaseballAthleteIds —
 * that helper is `import 'server-only'` and calls Next's request-scoped
 * createClient(), so it cannot run inside this standalone service-role
 * script. Returns a partial map: players without a helm_lifting_athletes row
 * (Phase-2 lifting seed not yet run) are simply absent — callers must skip
 * them, never throw.
 */
async function resolveAthleteIds(baseballPlayerIds: string[]): Promise<Record<string, string>> {
  if (baseballPlayerIds.length === 0) return {};
  const { data } = await supabase
    .from('helm_lifting_athletes')
    .select('id, sport_player_id')
    .eq('organization_id', ORG_ID)
    .eq('sport', 'baseball')
    .in('sport_player_id', baseballPlayerIds);
  const map: Record<string, string> = {};
  for (const row of (data ?? []) as Array<{ id: string; sport_player_id: string | null }>) {
    if (row.sport_player_id) map[row.sport_player_id] = row.id;
  }
  return map;
}

// ===========================================================================
async function main() {
  const confirmed = process.argv.includes('--confirm');
  DRY = !confirmed;

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (DRY) {
    console.log('[DRY RUN] No --confirm flag — printing plan, writing NOTHING.');
    console.log('[DRY RUN] Re-run with --confirm to actually seed.\n');
  }
  console.log(
    `${DRY ? '[DRY RUN] ' : ''}Seeding BaseballHelm Phase-3 surfaces (org ${ORG_ID.slice(0, 8)} / team ${TEAM_ID.slice(0, 8)})`,
  );

  // -------------------------------------------------------------------------
  // 0. Re-derive the Phase-1 auth users (read-only — never created here).
  // -------------------------------------------------------------------------
  const coachUserId = await lookupUserId(DEMO_COACH_EMAIL);
  if (!coachUserId) {
    console.warn(
      `  ⚠ ${DEMO_COACH_EMAIL} not found — has scripts/seed-baseball-demo.ts run with --confirm yet? Messaging tables will be skipped.`,
    );
  }
  const playerUserIdByKey: Partial<Record<RosterKey, string>> = {};
  for (const p of ROSTER) {
    playerUserIdByKey[p.key] = (await lookupUserId(playerEmail(p.key))) ?? undefined;
  }

  // -------------------------------------------------------------------------
  // 1. Messaging: baseball_conversations + participants + messages.
  //    Skipped entirely (with a warning, not a crash) if the Phase-1 coach
  //    auth user has not been created yet.
  // -------------------------------------------------------------------------
  const demoPlayerUserId = playerUserIdByKey[DEMO_PLAYER_KEY];
  if (coachUserId) {
    const TEAM_CHAT_ID = detId('conv:team_chat');
    const DIRECT_ID = detId('conv:direct:p1');

    await upsert('baseball_conversations', [
      {
        id: TEAM_CHAT_ID,
        team_id: TEAM_ID,
        is_team_chat: true,
        title: 'Demo University Baseball — Team Chat',
        created_by: coachUserId,
        created_at: isoDaysAgo(14),
      },
      {
        id: DIRECT_ID,
        team_id: TEAM_ID,
        is_team_chat: false,
        title: 'Coach Demo & Marcus Rodriguez',
        created_by: coachUserId,
        created_at: isoDaysAgo(5),
      },
    ]);

    const participantRows: Record<string, unknown>[] = [
      { id: detId('convpart:team_chat:coach'), conversation_id: TEAM_CHAT_ID, user_id: coachUserId, joined_at: isoDaysAgo(14), last_read_at: isoDaysAgo(0) },
    ];
    for (const p of ROSTER) {
      const uid = playerUserIdByKey[p.key];
      if (!uid) continue;
      participantRows.push({
        id: detId(`convpart:team_chat:${p.key}`),
        conversation_id: TEAM_CHAT_ID,
        user_id: uid,
        joined_at: isoDaysAgo(14),
        // Most players have read up to yesterday; a couple have unread messages.
        last_read_at: p.key === 'p1' || p.key === 'p2' ? isoDaysAgo(2) : isoDaysAgo(0),
      });
    }
    participantRows.push({
      id: detId('convpart:direct:coach'),
      conversation_id: DIRECT_ID,
      user_id: coachUserId,
      joined_at: isoDaysAgo(5),
      last_read_at: isoDaysAgo(0),
    });
    if (demoPlayerUserId) {
      participantRows.push({
        id: detId('convpart:direct:p1'),
        conversation_id: DIRECT_ID,
        user_id: demoPlayerUserId,
        joined_at: isoDaysAgo(5),
        last_read_at: isoDaysAgo(1),
      });
    }
    await upsert('baseball_conversation_participants', participantRows);

    const teamChatScript: { senderKey: 'coach' | RosterKey; content: string; daysAgo: number; read: boolean }[] = [
      { senderKey: 'coach', content: 'Reminder: practice moved to 3pm tomorrow, defense + live BP.', daysAgo: 3, read: true },
      { senderKey: 'p1', content: 'Got it, thanks Coach.', daysAgo: 3, read: true },
      { senderKey: 'p4', content: 'Will the bullpen groups be posted tonight?', daysAgo: 2, read: true },
      { senderKey: 'coach', content: 'Yes — posting the pitching plan after this message.', daysAgo: 2, read: true },
      { senderKey: 'p6', content: 'Sounds good, see everyone tomorrow.', daysAgo: 0, read: false },
    ];
    const teamChatRows = teamChatScript.map((m, i) => ({
      id: detId(`msg:team_chat:${i + 1}`),
      conversation_id: TEAM_CHAT_ID,
      sender_id: m.senderKey === 'coach' ? coachUserId : playerUserIdByKey[m.senderKey],
      content: m.content,
      read: m.read,
      created_at: isoDaysAgo(m.daysAgo),
    })).filter((m) => Boolean(m.sender_id));
    await upsert('baseball_messages', teamChatRows);

    if (demoPlayerUserId) {
      const directScript: { senderKey: 'coach' | 'p1'; content: string; daysAgo: number; read: boolean }[] = [
        { senderKey: 'coach', content: 'Marcus — great at-bats this week. Keep working the two-strike approach.', daysAgo: 4, read: true },
        { senderKey: 'p1', content: 'Thanks Coach, feeling more comfortable up there.', daysAgo: 4, read: true },
        { senderKey: 'coach', content: 'Let\u2019s get extra reps on backhand plays Thursday.', daysAgo: 1, read: true },
        { senderKey: 'p1', content: 'Works for me — what time?', daysAgo: 0, read: false },
      ];
      const directRows = directScript.map((m, i) => ({
        id: detId(`msg:direct:${i + 1}`),
        conversation_id: DIRECT_ID,
        sender_id: m.senderKey === 'coach' ? coachUserId : demoPlayerUserId,
        content: m.content,
        read: m.read,
        created_at: isoDaysAgo(m.daysAgo),
      }));
      await upsert('baseball_messages', directRows);
    }
  } else {
    skipped.push('baseball_conversations / baseball_conversation_participants / baseball_messages — Phase-1 coach auth user not found');
  }

  // -------------------------------------------------------------------------
  // 2. baseball_videos — 5 rows across 4 players, mixed video_type, one
  //    is_primary, one clip referencing a parent via parent_video_id.
  // -------------------------------------------------------------------------
  const VIDEO_P1_PRIMARY = detId('video:p1:primary');
  await upsert('baseball_videos', [
    {
      id: VIDEO_P1_PRIMARY,
      player_id: playerIdByKey.p1,
      team_id: TEAM_ID,
      title: 'Marcus Rodriguez — Full Game Footage vs. Demo Rival',
      description: 'Full defensive + offensive footage from the spring showcase game.',
      video_type: 'game_footage',
      url: 'https://demo.baseballhelmdemo.com/videos/p1-game-footage.mp4',
      thumbnail_url: 'https://demo.baseballhelmdemo.com/videos/p1-game-footage-thumb.jpg',
      duration: 5400,
      view_count: 18,
      is_primary: true,
      is_clip: false,
      created_at: isoDaysAgo(20),
    },
    {
      id: detId('video:p1:clip1'),
      player_id: playerIdByKey.p1,
      team_id: TEAM_ID,
      title: 'Marcus Rodriguez — Diving Stop Highlight',
      description: 'Clipped from the full game footage — backhand stop and throw from the hole.',
      video_type: 'highlight_reel',
      url: 'https://demo.baseballhelmdemo.com/videos/p1-clip-1.mp4',
      thumbnail_url: 'https://demo.baseballhelmdemo.com/videos/p1-clip-1-thumb.jpg',
      duration: 14,
      view_count: 42,
      is_primary: false,
      is_clip: true,
      parent_video_id: VIDEO_P1_PRIMARY,
      clip_start_time: 1820,
      clip_end_time: 1834,
      created_at: isoDaysAgo(19),
    },
    {
      id: detId('video:p2:bullpen'),
      player_id: playerIdByKey.p2,
      team_id: TEAM_ID,
      title: 'Jake Thompson — Catcher Framing Session',
      description: 'Bullpen catching session focused on pitch presentation.',
      video_type: 'bullpen',
      url: 'https://demo.baseballhelmdemo.com/videos/p2-bullpen.mp4',
      thumbnail_url: 'https://demo.baseballhelmdemo.com/videos/p2-bullpen-thumb.jpg',
      duration: 720,
      view_count: 6,
      is_primary: false,
      is_clip: false,
      created_at: isoDaysAgo(9),
    },
    {
      id: detId('video:p3:bp'),
      player_id: playerIdByKey.p3,
      team_id: TEAM_ID,
      title: 'Caleb Williams — Batting Practice Swings',
      description: 'Front-on and side-angle BP swings for swing-path review.',
      video_type: 'batting_practice',
      url: 'https://demo.baseballhelmdemo.com/videos/p3-bp.mp4',
      thumbnail_url: 'https://demo.baseballhelmdemo.com/videos/p3-bp-thumb.jpg',
      duration: 480,
      view_count: 11,
      is_primary: false,
      is_clip: false,
      created_at: isoDaysAgo(6),
    },
    {
      id: detId('video:p4:skills'),
      player_id: playerIdByKey.p4,
      team_id: TEAM_ID,
      title: 'Ethan Brooks — Bullpen Mechanics Breakdown',
      description: 'Skills video for pitching-mechanics review with the staff.',
      video_type: 'skills_video',
      url: 'https://demo.baseballhelmdemo.com/videos/p4-skills.mp4',
      thumbnail_url: 'https://demo.baseballhelmdemo.com/videos/p4-skills-thumb.jpg',
      duration: 300,
      view_count: 4,
      is_primary: false,
      is_clip: false,
      created_at: isoDaysAgo(3),
    },
  ]);

  // -------------------------------------------------------------------------
  // 3. baseball_tasks + baseball_task_assignments — every status/category/
  //    priority enum value represented at least once.
  // -------------------------------------------------------------------------
  const TASK_CONDITIONING = detId('task:conditioning');
  const TASK_ACADEMIC = detId('task:academic');
  const TASK_PRACTICE_DONE = detId('task:practice_done');
  const TASK_ADMIN_OVERDUE = detId('task:admin_overdue');
  const TASK_GAME_PREP_CANCELLED = detId('task:game_prep_cancelled');

  await upsert('baseball_tasks', [
    {
      id: TASK_CONDITIONING,
      team_id: TEAM_ID,
      title: 'Complete off-day conditioning log',
      description: 'Log your off-day running + mobility work in the app.',
      due_date: isoDaysFromNow(2),
      status: 'pending',
      category: 'conditioning',
      priority: 'high',
      reminder_at: isoDaysFromNow(1),
      is_recurring: false,
      created_by_id: COACH_ID,
      created_at: isoDaysAgo(1),
    },
    {
      id: TASK_ACADEMIC,
      team_id: TEAM_ID,
      title: 'Submit mid-semester academic check-in',
      description: 'Confirm class attendance and grades with the academic coordinator.',
      due_date: isoDaysFromNow(5),
      status: 'in_progress',
      category: 'academic',
      priority: 'normal',
      reminder_at: isoDaysFromNow(4),
      is_recurring: false,
      created_by_id: COACH_ID,
      created_at: isoDaysAgo(3),
    },
    {
      id: TASK_PRACTICE_DONE,
      team_id: TEAM_ID,
      title: 'Watch defensive positioning film',
      description: 'Review the cutoff/relay film from Tuesday practice before the next session.',
      due_date: isoDaysAgo(3),
      status: 'completed',
      category: 'practice',
      priority: 'low',
      reminder_at: isoDaysAgo(4),
      is_recurring: false,
      created_by_id: COACH_ID,
      created_at: isoDaysAgo(7),
    },
    {
      id: TASK_ADMIN_OVERDUE,
      team_id: TEAM_ID,
      title: 'Return signed travel waiver',
      description: 'Hand in the signed travel waiver for the upcoming road trip.',
      due_date: isoDaysAgo(1),
      status: 'overdue',
      category: 'administrative',
      priority: 'high',
      reminder_at: isoDaysAgo(2),
      is_recurring: false,
      created_by_id: COACH_ID,
      created_at: isoDaysAgo(10),
    },
    {
      id: TASK_GAME_PREP_CANCELLED,
      team_id: TEAM_ID,
      title: 'Scout report — rescheduled opponent',
      description: 'Game prep task for the originally-scheduled doubleheader (cancelled).',
      due_date: isoDaysFromNow(7),
      status: 'cancelled',
      category: 'game_prep',
      priority: 'normal',
      reminder_at: null,
      is_recurring: false,
      created_by_id: COACH_ID,
      created_at: isoDaysAgo(2),
    },
  ]);

  await upsert('baseball_task_assignments', [
    { id: detId('taskassign:conditioning:p1'), task_id: TASK_CONDITIONING, player_id: playerIdByKey.p1, status: 'pending' },
    { id: detId('taskassign:conditioning:p2'), task_id: TASK_CONDITIONING, player_id: playerIdByKey.p2, status: 'pending' },
    { id: detId('taskassign:academic:p3'), task_id: TASK_ACADEMIC, player_id: playerIdByKey.p3, status: 'in_progress' },
    { id: detId('taskassign:academic:p4'), task_id: TASK_ACADEMIC, player_id: playerIdByKey.p4, status: 'in_progress' },
    {
      id: detId('taskassign:practice_done:p5'),
      task_id: TASK_PRACTICE_DONE,
      player_id: playerIdByKey.p5,
      status: 'completed',
      completed_at: isoDaysAgo(3),
      notes: 'Watched and submitted notes on time.',
    },
    { id: detId('taskassign:admin_overdue:p6'), task_id: TASK_ADMIN_OVERDUE, player_id: playerIdByKey.p6, status: 'pending' },
    { id: detId('taskassign:admin_overdue:p7'), task_id: TASK_ADMIN_OVERDUE, player_id: playerIdByKey.p7, status: 'pending' },
    { id: detId('taskassign:game_prep_cancelled:p8'), task_id: TASK_GAME_PREP_CANCELLED, player_id: playerIdByKey.p8, status: 'pending' },
  ]);

  // -------------------------------------------------------------------------
  // 4. helm_lifting_groups + helm_lifting_group_members (helm Lift Lab
  //    unification — legacy baseball_strength_groups / _group_members are
  //    graveyard-bound, 0 rows in prod). group_type CHECK:
  //    static|dynamic|imported|temporary. member source CHECK:
  //    manual|rule|import. created_by_coach_id / added_by_coach_id FK
  //    helm_lifting_coaches — a Phase-2-lifting-seed identity, not the
  //    Phase-1 baseball COACH_ID above — left unset (both columns are
  //    nullable) rather than coupling to Phase-2's coach-id derivation.
  // -------------------------------------------------------------------------
  const GROUP_PITCHING = detId('stronggroup:pitching');
  const GROUP_DYNAMIC = detId('stronggroup:dynamic_high_readiness');

  await upsert('helm_lifting_groups', [
    {
      id: GROUP_PITCHING,
      organization_id: ORG_ID,
      sport: 'baseball',
      team_id: TEAM_ID,
      name: 'Pitching Staff',
      description: 'All rostered pitchers — arm-care-first lifting track.',
      group_type: 'static',
      rule_json: {},
      is_active: true,
      created_at: isoDaysAgo(30),
    },
    {
      id: GROUP_DYNAMIC,
      organization_id: ORG_ID,
      sport: 'baseball',
      team_id: TEAM_ID,
      name: 'High Readiness — This Week',
      description: 'Auto-populated from this week\u2019s readiness check-ins (green band).',
      group_type: 'dynamic',
      rule_json: { rule: 'readiness_band', operator: 'eq', value: 'green', window_days: 7 },
      is_active: true,
      created_at: isoDaysAgo(7),
    },
  ]);

  // Members need each player's helm_lifting_athletes.id (athlete_id), which
  // only exists once Phase-2 (scripts/seed-baseball-lifting-demo.ts) has run.
  // Resolve what we can and skip the rest honestly — never throw.
  const memberSpecs: {
    idKey: string;
    groupId: string;
    key: RosterKey;
    source: 'manual' | 'rule';
    daysAgo: number;
  }[] = [
    { idKey: 'groupmember:pitching:p4', groupId: GROUP_PITCHING, key: 'p4', source: 'manual', daysAgo: 30 },
    { idKey: 'groupmember:pitching:p7', groupId: GROUP_PITCHING, key: 'p7', source: 'manual', daysAgo: 30 },
    { idKey: 'groupmember:dynamic:p1', groupId: GROUP_DYNAMIC, key: 'p1', source: 'rule', daysAgo: 7 },
    { idKey: 'groupmember:dynamic:p2', groupId: GROUP_DYNAMIC, key: 'p2', source: 'rule', daysAgo: 7 },
    { idKey: 'groupmember:dynamic:p3', groupId: GROUP_DYNAMIC, key: 'p3', source: 'rule', daysAgo: 7 },
    { idKey: 'groupmember:dynamic:p5', groupId: GROUP_DYNAMIC, key: 'p5', source: 'rule', daysAgo: 7 },
  ];
  const groupAthleteMap = await resolveAthleteIds(memberSpecs.map((m) => playerIdByKey[m.key]));
  const groupMemberRows = memberSpecs
    .map((m) => {
      const athleteId = groupAthleteMap[playerIdByKey[m.key]];
      if (!athleteId) return null;
      return {
        id: detId(m.idKey),
        group_id: m.groupId,
        athlete_id: athleteId,
        source: m.source,
        starts_at: isoDaysAgo(m.daysAgo),
      };
    })
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (groupMemberRows.length < memberSpecs.length) {
    skipped.push(
      `helm_lifting_group_members — ${memberSpecs.length - groupMemberRows.length} of ${memberSpecs.length} member(s) skipped (player not yet seeded in helm_lifting_athletes; run scripts/seed-baseball-lifting-demo.ts --confirm first for full coverage)`,
    );
  }
  await upsert('helm_lifting_group_members', groupMemberRows);

  // -------------------------------------------------------------------------
  // 5. baseball_developmental_plans — 3 players, mixed active/draft status.
  // -------------------------------------------------------------------------
  await upsert('baseball_developmental_plans', [
    {
      id: detId('devplan:p1'),
      coach_id: COACH_ID,
      player_id: playerIdByKey.p1,
      team_id: TEAM_ID,
      title: 'Two-Strike Approach + Backhand Reps',
      description: 'Spring development focus: shorten up with two strikes, build backhand reaction time.',
      status: 'active',
      start_date: dateDaysAgo(30),
      end_date: dateDaysFromNow(60),
      goals: [
        { goal: 'Cut strikeout rate with two strikes by 15%', metric: 'two_strike_k_rate', target: 0.18 },
        { goal: 'Improve backhand fielding percentage', metric: 'backhand_fielding_pct', target: 0.92 },
      ],
      created_at: isoDaysAgo(30),
    },
    {
      id: detId('devplan:p2'),
      coach_id: COACH_ID,
      player_id: playerIdByKey.p2,
      team_id: TEAM_ID,
      title: 'Pitch-Framing Consistency',
      description: 'Off-season carryover plan focused on presentation and lower-zone framing.',
      status: 'active',
      start_date: dateDaysAgo(45),
      end_date: dateDaysFromNow(30),
      goals: [{ goal: 'Improve strike-zone framing grade', metric: 'framing_grade', target: 'B+' }],
      created_at: isoDaysAgo(45),
    },
    {
      id: detId('devplan:p3'),
      coach_id: COACH_ID,
      player_id: playerIdByKey.p3,
      team_id: TEAM_ID,
      title: 'Outfield Route Efficiency',
      description: 'Draft plan pending staff sign-off — first-step quickness and route efficiency on balls hit to the gap.',
      status: 'draft',
      start_date: dateDaysFromNow(7),
      end_date: dateDaysFromNow(90),
      goals: [{ goal: 'Reduce route inefficiency on gap balls', metric: 'route_efficiency_pct', target: 0.95 }],
      created_at: isoDaysAgo(2),
    },
  ]);

  // -------------------------------------------------------------------------
  // 6. baseball_seasons — see contract doc for the column-name caveat
  //    (label/phase/starts_on/ends_on/status/is_current/created_by). Honors
  //    the partial unique index on (team_id) WHERE is_current.
  // -------------------------------------------------------------------------
  await upsert('baseball_seasons', [
    {
      id: detId('season:current'),
      team_id: TEAM_ID,
      label: 'Spring 2026',
      phase: 'in_season',
      starts_on: dateDaysAgo(60),
      ends_on: dateDaysFromNow(45),
      status: 'active',
      is_current: true,
      roster_enabled: true,
      schedule_enabled: true,
      stats_enabled: true,
      practice_templates_enabled: true,
      lift_groups_enabled: true,
      performance_baselines_enabled: true,
      player_status_tracking_enabled: true,
      created_by: COACH_ID,
      created_at: isoDaysAgo(60),
    },
    {
      id: detId('season:archived_fall'),
      team_id: TEAM_ID,
      label: 'Fall 2025',
      phase: 'fall',
      starts_on: dateDaysAgo(240),
      ends_on: dateDaysAgo(150),
      status: 'archived',
      is_current: false,
      roster_enabled: true,
      schedule_enabled: true,
      stats_enabled: true,
      practice_templates_enabled: true,
      lift_groups_enabled: false,
      performance_baselines_enabled: true,
      player_status_tracking_enabled: true,
      created_by: COACH_ID,
      created_at: isoDaysAgo(240),
    },
  ]);

  // -------------------------------------------------------------------------
  // 7. baseball_import_sources + an additional baseball_import_runs row
  //    + baseball_stat_uploads. See contract doc for the column-name caveat.
  // -------------------------------------------------------------------------
  const SOURCE_TRACKMAN = detId('importsource:trackman');
  const SOURCE_GAMECHANGER = detId('importsource:gamechanger');

  await upsert('baseball_import_sources', [
    {
      id: SOURCE_TRACKMAN,
      team_id: TEAM_ID,
      source_name: 'TrackMan',
      source_type: 'trackman_csv',
      trust_level: 'device_export',
      default_visibility: 'player_visible',
      required_review: false,
      dedupe_strictness: 'standard',
      player_match_strategy: 'name_then_external_id',
      external_id_namespace: 'trackman',
      enabled: true,
      created_by: COACH_ID,
      created_at: isoDaysAgo(45),
    },
    {
      id: SOURCE_GAMECHANGER,
      team_id: TEAM_ID,
      source_name: 'GameChanger',
      source_type: 'gamechanger_xml',
      trust_level: 'staff_entered',
      default_visibility: 'staff_only',
      required_review: true,
      dedupe_strictness: 'strict',
      player_match_strategy: 'manual_only',
      external_id_namespace: 'gamechanger',
      enabled: true,
      created_by: COACH_ID,
      created_at: isoDaysAgo(20),
    },
  ]);

  const IMPORT_RUN_ID = detId('importrun:trackman_phase3');
  if (coachUserId) {
    await upsert('baseball_import_runs', [
      {
        id: IMPORT_RUN_ID,
        team_id: TEAM_ID,
        source_id: 'trackman',
        source_label: 'TrackMan (Phase-3 demo session)',
        import_type: 'stats',
        file_name: 'trackman_session_phase3_demo.csv',
        status: 'committed',
        total_rows: ROSTER.length * 3,
        matched_rows: ROSTER.length * 3,
        unmatched_rows: 0,
        valid_row_count: ROSTER.length * 3,
        warning_count: 0,
        error_count: 0,
        created_by: coachUserId,
        committed_at: isoDaysAgo(3),
        review_state: 'not_required',
        source_config_id: SOURCE_TRACKMAN,
      },
    ]);
  } else {
    skipped.push('baseball_import_runs (Phase-3 row) — Phase-1 coach auth user not found');
  }

  await upsert('baseball_stat_uploads', [
    {
      id: detId('statupload:trackman_phase3'),
      coach_id: COACH_ID,
      team_id: TEAM_ID,
      filename: 'trackman_session_phase3_demo.csv',
      status: 'completed',
      row_count: ROSTER.length * 3,
      total_rows: ROSTER.length * 3,
      processed_count: ROSTER.length * 3,
      matched_rows: ROSTER.length * 3,
      unmatched_rows: 0,
      source_id: 'trackman',
      import_run_id: IMPORT_RUN_ID,
      session_date: dateDaysAgo(3),
      session_name: 'TrackMan Session — Demo',
      stat_type: 'game',
      match_confidence: 0.95,
      completed_at: isoDaysAgo(3),
    },
  ]);

  // -------------------------------------------------------------------------
  // 8. baseball_player_stats (3 sessions per player) + baseball_player_aggregates
  //    (computed FROM the stats rows below so the averages are internally
  //    consistent, per the data contract).
  // -------------------------------------------------------------------------
  const PITCHER_KEYS: ReadonlySet<RosterKey> = new Set(['p4', 'p7']);
  const statRows: Record<string, unknown>[] = [];
  const aggregateRows: Record<string, unknown>[] = [];

  for (const [i, p] of ROSTER.entries()) {
    const isPitcher = PITCHER_KEYS.has(p.key);
    const sessions: { statType: string; daysAgo: number }[] = [
      { statType: 'practice', daysAgo: 10 },
      { statType: 'game', daysAgo: 5 },
      { statType: 'game', daysAgo: 1 },
    ];

    let totalAtBats = 0;
    let totalHits = 0;
    let gameAtBats = 0;
    let gameHits = 0;
    let practiceAtBats = 0;
    let practiceHits = 0;

    sessions.forEach((session, si) => {
      const id = detId(`stat:${p.key}:${si + 1}`);
      if (isPitcher) {
        statRows.push({
          id,
          player_id: playerIdByKey[p.key],
          team_id: TEAM_ID,
          coach_id: COACH_ID,
          stat_type: session.statType,
          session_date: dateDaysAgo(session.daysAgo),
          session_name: session.statType === 'practice' ? 'Bullpen / Live BP' : 'Demo Conference Game',
          at_bats: 0,
          hits: 0,
          innings_pitched: 3 + (si % 2),
          earned_runs: si === 0 ? 0 : 1 + (i % 2),
          hits_allowed: 2 + (si % 3),
          walks_allowed: si % 2,
          strikeouts_thrown: 4 + (i % 3),
          pitch_velocity: 88 + (i % 4),
          putouts: 1,
          assists: 1,
          errors: 0,
          source: 'manual',
          source_trust_level: session.statType === 'practice' ? 'staff_entered' : 'device_export',
          source_visibility: session.statType === 'practice' ? 'staff_only' : 'player_visible',
          notes: si === 2 ? 'Fastball velocity trending up; command still developing.' : null,
        });
      } else {
        const atBats = 3 + (si % 2);
        const hits = Math.max(0, (i + si) % 4 === 0 ? 0 : 1 + ((i + si) % 3));
        totalAtBats += atBats;
        totalHits += hits;
        if (session.statType === 'game') {
          gameAtBats += atBats;
          gameHits += hits;
        } else {
          practiceAtBats += atBats;
          practiceHits += hits;
        }
        statRows.push({
          id,
          player_id: playerIdByKey[p.key],
          team_id: TEAM_ID,
          coach_id: COACH_ID,
          stat_type: session.statType,
          session_date: dateDaysAgo(session.daysAgo),
          session_name: session.statType === 'practice' ? 'Live BP / Infield-Outfield' : 'Demo Conference Game',
          at_bats: atBats,
          hits,
          doubles: hits > 1 ? 1 : 0,
          triples: 0,
          home_runs: hits >= 3 ? 1 : 0,
          rbis: hits,
          walks: si % 2,
          strikeouts: Math.max(0, atBats - hits - (si % 2)),
          stolen_bases: p.key === 'p6' && si === 2 ? 1 : 0,
          putouts: p.pos === 'OF' || p.pos === 'SS' || p.pos === '2B' || p.pos === '3B' ? 2 + si : 0,
          assists: p.pos === 'SS' || p.pos === '2B' || p.pos === '3B' ? 1 + si : 0,
          errors: si === 1 && p.key === 'p5' ? 1 : 0,
          exit_velocity: 88 + ((i + si) % 6),
          source: 'manual',
          source_trust_level: session.statType === 'practice' ? 'staff_entered' : 'device_export',
          source_visibility: session.statType === 'practice' ? 'staff_only' : 'player_visible',
          notes: null,
        });
      }
    });

    if (!isPitcher) {
      const careerAvg = totalAtBats > 0 ? Math.round((totalHits / totalAtBats) * 1000) / 1000 : 0;
      const gameAvg = gameAtBats > 0 ? Math.round((gameHits / gameAtBats) * 1000) / 1000 : 0;
      const practiceAvg = practiceAtBats > 0 ? Math.round((practiceHits / practiceAtBats) * 1000) / 1000 : 0;
      aggregateRows.push({
        id: detId(`aggregate:${p.key}`),
        player_id: playerIdByKey[p.key],
        team_id: TEAM_ID,
        career_avg: careerAvg,
        last_5_avg: careerAvg,
        last_10_avg: careerAvg,
        practice_avg: practiceAvg,
        game_avg: gameAvg,
        pressure_gap: Math.round((gameAvg - practiceAvg) * 1000) / 1000,
        total_at_bats: totalAtBats,
        total_hits: totalHits,
        total_sessions: sessions.length,
        recent_trend: gameAvg >= practiceAvg ? 'up' : 'down',
        trend_data: { sessions: sessions.map((s) => ({ stat_type: s.statType, days_ago: s.daysAgo })) },
        last_session_at: isoDaysAgo(1),
        updated_at: isoDaysAgo(1),
      });
    } else {
      // Pitchers get a zero-batting aggregate row so the team stats page has
      // a row for every roster player (consistent with zero at-bats above).
      aggregateRows.push({
        id: detId(`aggregate:${p.key}`),
        player_id: playerIdByKey[p.key],
        team_id: TEAM_ID,
        career_avg: 0,
        last_5_avg: 0,
        last_10_avg: 0,
        practice_avg: 0,
        game_avg: 0,
        pressure_gap: 0,
        total_at_bats: 0,
        total_hits: 0,
        total_sessions: sessions.length,
        recent_trend: 'steady',
        trend_data: { sessions: sessions.map((s) => ({ stat_type: s.statType, days_ago: s.daysAgo })) },
        last_session_at: isoDaysAgo(1),
        updated_at: isoDaysAgo(1),
      });
    }
  }

  await upsert('baseball_player_stats', statRows);
  await upsert('baseball_player_aggregates', aggregateRows);

  // -------------------------------------------------------------------------
  // Report.
  // -------------------------------------------------------------------------
  console.log(`\n${DRY ? '[DRY RUN] would seed' : 'Seeded'} rows:`);
  for (const [t, n] of Object.entries(counts)) {
    console.log(`  ${t.padEnd(38)} ${n}`);
  }
  if (skipped.length) {
    console.log('\nSkipped (schema not present, or a Phase-1 dependency was missing):');
    for (const s of skipped) console.log(`  ⚠ ${s}`);
  }
  console.log(`\nTeam: Demo University Baseball (${TEAM_ID})`);
  console.log('Full per-table contract: docs/seed/BASEBALLHELM_DEMO_DATA_CONTRACT.md');
  console.log('Verify coverage with: scripts/verify-baseball-demo-coverage.ts');
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

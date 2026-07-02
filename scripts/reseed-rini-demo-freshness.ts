/**
 * reseed-rini-demo-freshness.ts — freshness pass for the Rini University
 * Baseball demo team (seeded by scripts/seed-rini-baseball-demo.ts).
 *
 * Problem: scripts/seed-rini-baseball-demo.ts computes every date relative
 * to "now" AT THE TIME IT WAS LAST RUN. Real calendar time keeps moving, so
 * every re-run of a demo (screenshots, a live walkthrough) shows the
 * upcoming game/practice/meeting sliding further into the past, readiness
 * check-ins going stale, and several feature surfaces (development plans,
 * documents, messaging) that the base seed never populated at all.
 *
 * This script is a companion, NOT a replacement: it (a) freshens dates on
 * rows the base seed already owns, using the SAME deterministic ids so it
 * UPDATEs in place (never deletes), and (b) adds a few demo-only surfaces
 * the base seed doesn't cover, under its own deterministic id namespace so
 * re-running never duplicates rows.
 *
 *   1. Re-dates the team's anchor events (practice/game/meeting) and the
 *      two "next" scheduled games to be relative to TODAY, so "this week"
 *      always shows a future game + practice + meeting.
 *   2. Seeds 2 development plans (4 goals each; one plan partially
 *      completed) so the dev-plan detail UI (goal checkboxes / progress
 *      ring) has real content to demo, for both the player-facing
 *      "My Development" (active plan) and the coach-facing dev-plans list
 *      + detail views.
 *   3. Seeds 4 team documents (playbook, schedule, travel policy,
 *      conditioning manual) as real `baseball_documents` +
 *      `baseball_document_versions` rows, backed by tiny placeholder
 *      `.txt` files uploaded through the SAME storage bucket + path
 *      pattern the app's own upload action uses (`documents` bucket,
 *      `baseball-documents/<teamId>/<file>.txt`) — not fake metadata
 *      pointing at nothing.
 *   4. Seeds 1 coach -> player conversation with 4 messages (a natural
 *      back-and-forth, most recent unread) so Messages has content.
 *   5. Re-dates the "recent" lift sessions, program assignments, and
 *      readiness check-ins (both the live `helm_lifting_*` tables AND the
 *      legacy `baseball_readiness_checkins` table a couple of surfaces
 *      still read) so the readiness/"today's lift" panels read as current.
 *
 * Idempotency:
 *   - (1) and (5) are partial-column UPSERTs (`onConflict: 'id'`) against
 *     ids the base seed already created — Postgres `ON CONFLICT DO UPDATE
 *     SET <listed columns>` never touches columns this script doesn't
 *     list, so unrelated columns (roster, box scores, etc.) are untouched.
 *     No destructive delete-then-insert anywhere.
 *   - (2)-(4) are NEW rows this script owns, keyed by deterministic ids
 *     derived from a DEDICATED namespace (`baseball-demo-reseed-v1`,
 *     see `detId2` below) — that namespace *is* the stable ownership
 *     marker: every id this script mints is reproducible from
 *     (namespace, logical key), so re-running just upserts the same rows
 *     again. Nothing is ever deleted, so there's no risk of a marker being
 *     needed to find rows to clean up — but the namespace is documented
 *     here precisely so a future cleanup pass could find them by prefix
 *     if ever needed.
 *
 * Requires the BASE seed to have already run — this only freshens dates /
 * adds a few demo-only surfaces on top of an existing team/roster/coach.
 *
 * Run:
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/reseed-rini-demo-freshness.ts          # dry run
 *   DOTENV_CONFIG_PATH=.env.local npx tsx -r dotenv/config scripts/reseed-rini-demo-freshness.ts --confirm # write
 *
 * Requires env: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Golf is NEVER touched. Only rows belonging to Rini University Baseball
 * (team + org ids below) are written.
 */
import 'dotenv/config';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { createHash } from 'node:crypto';

// --- Verified prod identity (SAME ids scripts/seed-rini-baseball-demo.ts uses) --
const COACH_USER_ID = 'c8dcf7d5-da14-439b-93c6-58d1e0dd38a0'; // njrini99@gmail.com
const PLAYER_USER_ID = '7f13c6f0-e097-4e2d-b881-70f7712a093e'; // rinin376@gmail.com
const COACH_ID = '5080d69c-4bd0-41fc-a02a-714062f2e74b';

function mkDetId(ns: string) {
  return (key: string): string => {
    const h = createHash('sha1').update(`${ns}:${key}`).digest('hex');
    const b = h.slice(0, 32).split('');
    b[12] = '5';
    b[16] = ((parseInt(b[16], 16) & 0x3) | 0x8).toString(16);
    const s = b.join('');
    return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
  };
}

// Same namespace as seed-rini-baseball-demo.ts — reusing these ids is how
// section (1)/(5) below UPDATE the base seed's rows in place.
const detId = mkDetId('rini-baseball-demo-v1');
// This script's own namespace — every row (2)-(4) below owns is minted
// from here; it's the "marker" that identifies rows this script created.
const detId2 = mkDetId('baseball-demo-reseed-v1');

const TEAM_ID = detId('team');
const PLAYER1_ID = detId('player:p1'); // Marcus Rodriguez — rinin376 login
const PLAYER2_ID = detId('player:p2'); // Jake Thompson

// Same 14-key roster order as the base seed (needed to reproduce its ids).
const ROSTER_KEYS = ['p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'p7', 'p8', 'p9', 'p10', 'p11', 'p12', 'p13', 'p14'] as const;

// --- Date helpers (TODAY-anchored, same formulas as the base seed) ---------
const NOW = new Date();
function isoDaysAgo(days: number): string {
  const d = new Date(NOW);
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}
function isoHoursAgo(hours: number): string {
  const d = new Date(NOW);
  d.setUTCHours(d.getUTCHours() - hours);
  return d.toISOString();
}
function dateDaysAgo(days: number): string {
  return isoDaysAgo(days).slice(0, 10);
}
function dateDaysFromNow(days: number): string {
  return dateDaysAgo(-days);
}

// --- Upsert wrapper (same tolerant pattern as the base seed) ---------------
type Counts = Record<string, number>;
const counts: Counts = {};
let DRY = false;
let supabase: SupabaseClient;
const skipped: string[] = [];

async function upsert(table: string, rows: readonly unknown[], conflict = 'id') {
  if (!rows.length) return;
  counts[table] = (counts[table] ?? 0) + rows.length;
  if (DRY) return;
  const { error } = await supabase.from(table).upsert(rows as never, { onConflict: conflict });
  if (error) {
    const msg = error.message || '';
    if (/could not find the table|schema cache|does not exist|could not find the '.*' column|violates not-null constraint|violates check constraint/i.test(msg)) {
      delete counts[table];
      skipped.push(`${table} — ${msg}`);
      console.warn(`  ⚠ skipped ${table}: ${msg}`);
      return;
    }
    throw new Error(`upsert ${table} failed: ${msg}`);
  }
}

/**
 * Partial-column UPDATE (not upsert) for rows this script only ever
 * FRESHENS, never creates. Postgres validates an INSERT's column list
 * against NOT-NULL constraints even when it will resolve via
 * `ON CONFLICT DO UPDATE` — so `.upsert()` with a partial payload fails on
 * these wide, mostly-NOT-NULL tables even though every row already exists.
 * A plain `.update().eq('id', id)` only ever touches the listed columns
 * and never needs to satisfy insert-time constraints. If a row doesn't
 * exist (base seed didn't fully run, or was seeded before a column was
 * added), this silently matches zero rows rather than erroring — the base
 * seed script remains the source of truth for row creation.
 */
async function updateMany(table: string, rows: { id: string; [key: string]: unknown }[]) {
  if (!rows.length) return;
  counts[table] = (counts[table] ?? 0) + rows.length;
  if (DRY) return;
  for (const { id, ...fields } of rows) {
    const { error } = await supabase.from(table).update(fields).eq('id', id);
    if (error) {
      const msg = error.message || '';
      if (/could not find the table|schema cache|does not exist|could not find the '.*' column/i.test(msg)) {
        delete counts[table];
        skipped.push(`${table} — ${msg}`);
        console.warn(`  ⚠ skipped ${table}: ${msg}`);
        return;
      }
      throw new Error(`update ${table} (id=${id}) failed: ${msg}`);
    }
  }
}

async function rowExists(table: string, id: string): Promise<boolean> {
  const { data } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
  return !!data;
}

// ===========================================================================
async function main() {
  DRY = !process.argv.includes('--confirm');
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').trim();
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY ?? '').trim();
  if (!url || !key) throw new Error('Missing NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY');
  supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });

  if (DRY) console.log('[DRY RUN] printing plan, writing NOTHING. Re-run with --confirm.\n');
  console.log(`${DRY ? '[DRY RUN] ' : ''}Freshening Rini University Baseball demo (team ${TEAM_ID.slice(0, 8)})`);

  // Guard: this script only freshens/extends an already-seeded team.
  if (!DRY) {
    const teamOk = await rowExists('baseball_teams', TEAM_ID);
    if (!teamOk) {
      throw new Error(
        `Team ${TEAM_ID} not found. Run scripts/seed-rini-baseball-demo.ts --confirm first, then re-run this script.`,
      );
    }
  } else {
    console.log('  [DRY] would verify base seed has already run (baseball_teams row exists)');
  }

  // ===========================================================================
  // 1. RE-DATE anchor events + the two "next" scheduled games
  // ===========================================================================
  console.log('\n[1/5] Re-dating events/games so this week has a future game + practice + meeting...');
  const practiceEventId = detId('event:practice');
  const gameEventId = detId('event:game');
  const meetingEventId = detId('event:meeting');
  await updateMany('baseball_events', [
    { id: practiceEventId, start_time: isoDaysAgo(-1), end_time: isoDaysAgo(-1) }, // tomorrow
    { id: gameEventId, start_time: isoDaysAgo(-3), end_time: isoDaysAgo(-3) }, // 3 days out
    { id: meetingEventId, start_time: isoDaysAgo(-2), end_time: isoDaysAgo(-2) }, // 2 days out
  ]);
  await updateMany('baseball_games', [
    { id: detId('game:next:0'), game_date: dateDaysFromNow(3) }, // vs Coastal State, tied to gameEventId
    { id: detId('game:next:1'), game_date: dateDaysFromNow(6) }, // @ Piedmont Tech
  ]);

  // ===========================================================================
  // 2. DEVELOPMENT PLANS (2 plans, 4 goals each, one partially completed)
  // ===========================================================================
  console.log('[2/5] Seeding development plans (goal checkboxes / progress demo)...');
  const plan1Id = detId2('devplan:1');
  const plan2Id = detId2('devplan:2');

  await upsert('baseball_developmental_plans', [
    {
      id: plan1Id,
      coach_id: COACH_ID,
      player_id: PLAYER1_ID,
      team_id: TEAM_ID,
      title: 'Off-Season Hitting & Speed Development',
      description: 'Focus on exit velocity, plate discipline with two strikes, and first-step quickness ahead of conference play.',
      status: 'in_progress',
      start_date: dateDaysAgo(30),
      end_date: dateDaysFromNow(60),
      goals: [
        {
          id: detId2('devplan:1:goal:1'),
          title: 'Increase exit velocity to 95+ mph',
          description: 'Tracked via bat-speed sensor during BP.',
          category: 'Hitting',
          progress: 100,
          status: 'completed',
          target_date: dateDaysAgo(5),
          coach_notes: 'Hit 96.2 mph off the tee during BP — locked in.',
          completed_at: isoDaysAgo(5),
          created_at: isoDaysAgo(30),
        },
        {
          id: detId2('devplan:1:goal:2'),
          title: 'Cut two-strike strikeout rate below 15%',
          description: 'Shorten swing and widen the zone with two strikes.',
          category: 'Hitting',
          progress: 60,
          status: 'in_progress',
          target_date: dateDaysFromNow(20),
          coach_notes: 'Good progress in cage work — carry it into games.',
          created_at: isoDaysAgo(30),
        },
        {
          id: detId2('devplan:1:goal:3'),
          title: 'Improve 60-yard split under 6.9 seconds',
          description: 'Weekly sprint work with the strength staff.',
          category: 'Speed',
          progress: 30,
          status: 'in_progress',
          target_date: dateDaysFromNow(35),
          created_at: isoDaysAgo(25),
        },
        {
          id: detId2('devplan:1:goal:4'),
          title: 'Reach 10 stolen bases this season',
          description: 'Read-and-react work on secondary leads.',
          category: 'Baserunning',
          progress: 0,
          status: 'not_started',
          target_date: dateDaysFromNow(60),
          created_at: isoDaysAgo(20),
        },
      ] as unknown as never,
      created_at: isoDaysAgo(30),
    },
    {
      id: plan2Id,
      coach_id: COACH_ID,
      player_id: PLAYER2_ID,
      team_id: TEAM_ID,
      title: 'Catching Fundamentals & Game Calling',
      description: 'Building receiving mechanics and pitch-calling instincts for a bigger role behind the plate.',
      status: 'sent',
      start_date: dateDaysAgo(10),
      end_date: dateDaysFromNow(80),
      goals: [
        {
          id: detId2('devplan:2:goal:1'),
          title: 'Reduce pop time to sub-2.0 seconds',
          description: 'Footwork + transfer drills, 3x/week.',
          category: 'Catching',
          progress: 45,
          status: 'in_progress',
          target_date: dateDaysFromNow(25),
          coach_notes: 'Transfer is quicker — keep the throw on a line.',
          created_at: isoDaysAgo(10),
        },
        {
          id: detId2('devplan:2:goal:2'),
          title: 'Call a clean 3-pitch mix through 5 innings',
          description: 'Game-plan review with pitching staff before each start.',
          category: 'Game Calling',
          progress: 0,
          status: 'not_started',
          target_date: dateDaysFromNow(40),
          created_at: isoDaysAgo(10),
        },
        {
          id: detId2('devplan:2:goal:3'),
          title: 'Improve blocking technique on balls in the dirt',
          description: 'Blocking progressions in daily pre-practice work.',
          category: 'Catching',
          progress: 20,
          status: 'in_progress',
          target_date: dateDaysFromNow(30),
          created_at: isoDaysAgo(8),
        },
        {
          id: detId2('devplan:2:goal:4'),
          title: 'Raise caught-stealing rate to 35%',
          description: 'Pop-time and exchange work tied to goal 1.',
          category: 'Catching',
          progress: 0,
          status: 'not_started',
          target_date: dateDaysFromNow(70),
          created_at: isoDaysAgo(8),
        },
      ] as unknown as never,
      created_at: isoDaysAgo(10),
    },
  ]);

  // ===========================================================================
  // 3. TEAM DOCUMENTS (real storage objects, not fake metadata)
  // ===========================================================================
  console.log('[3/5] Seeding team documents (playbook, schedule, travel policy, conditioning)...');
  const DOCS: { key: string; title: string; description: string; category: string; folder: string | null; content: string }[] = [
    {
      key: 'playbook',
      title: 'Rini University Baseball — Team Playbook (2026)',
      description: 'Offensive & defensive systems, signs, and situational rules.',
      category: 'playbook',
      folder: 'Playbook',
      content: [
        'RINI UNIVERSITY BASEBALL — TEAM PLAYBOOK (2026)',
        'Demo placeholder — replace with the full offensive/defensive systems doc.',
        '',
        '1. OFFENSIVE PHILOSOPHY',
        '   - Attack fastballs early in the count; work counts with two strikes.',
        '   - First-and-third: read the throw-through before breaking.',
        '',
        '2. SIGNS',
        '   - Standard sign sequence: indicator -> hot sign -> live sign.',
        '   - Bunt / hit-and-run / steal live off the third-base coach.',
        '',
        '3. DEFENSIVE ALIGNMENT',
        '   - Infield in on contact plays, winning run at third, < 2 outs.',
        '   - Cutoffs and relays reviewed every Tuesday.',
        '',
        '— Coach Rini',
        '',
      ].join('\n'),
    },
    {
      key: 'schedule',
      title: '2026 Season Schedule',
      description: 'Full conference + non-conference schedule with game times and locations.',
      category: 'general',
      folder: null,
      content: [
        '2026 SEASON SCHEDULE — RINI UNIVERSITY BASEBALL',
        'Demo placeholder schedule. See Calendar for the live, always-current version.',
        '',
        'Conference play begins in March; non-conference tournament dates TBD.',
        'Full opponent list, times, and locations are maintained on the team',
        'Calendar — this file is the printable reference copy.',
        '',
      ].join('\n'),
    },
    {
      key: 'travel-policy',
      title: 'Travel Policy & Code of Conduct',
      description: 'Dress code, curfew, and behavior expectations for road trips.',
      category: 'administrative',
      folder: 'Policies',
      content: [
        'TRAVEL POLICY & CODE OF CONDUCT — RINI UNIVERSITY BASEBALL',
        '',
        '- Dress code: team polo + khakis for all departures/arrivals.',
        '- Curfew: 11:00 PM the night before a game day.',
        '- Room checks at curfew; two-player rooming assignments posted by the',
        '  traveling secretary 48 hours before departure.',
        '- Report any missed connection or itinerary conflict to the head coach',
        '  immediately.',
        '',
        'Questions go to the head coach or director of operations.',
        '',
      ].join('\n'),
    },
    {
      key: 'conditioning',
      title: 'Strength & Conditioning Manual',
      description: 'In-season lifting splits and mobility work referenced in Lift Lab.',
      category: 'conditioning',
      folder: 'Playbook',
      content: [
        'STRENGTH & CONDITIONING MANUAL — RINI UNIVERSITY BASEBALL',
        '',
        'In-season split: two lower-body / two upper-body sessions per week,',
        'built around the Back Squat, Bench Press, Trap Bar Deadlift, and',
        'rotational medicine-ball work. Loads and RPE targets live in Lift Lab —',
        'this manual covers technique cues and warm-up protocol.',
        '',
        'Warm-up: 10 min general movement -> banded activation -> ramp sets.',
        '',
      ].join('\n'),
    },
  ];

  for (const doc of DOCS) {
    const docId = detId2(`doc:${doc.key}`);
    const versionId = detId2(`docv:${doc.key}`);
    const storagePath = `baseball-documents/${TEAM_ID}/${docId}.txt`;
    const buf = Buffer.from(doc.content, 'utf-8');

    let signedUrl = `dry-run://${storagePath}`;
    if (!DRY) {
      // Same bucket + path convention as uploadBaseballDocumentAction
      // (src/app/baseball/actions/documents.ts) — upsert:true so re-runs
      // overwrite the same object instead of erroring.
      const { error: uploadError } = await supabase.storage
        .from('documents')
        .upload(storagePath, buf, { contentType: 'text/plain', upsert: true });
      if (uploadError) throw new Error(`storage upload failed for ${storagePath}: ${uploadError.message}`);

      const { data: signed, error: signError } = await supabase.storage
        .from('documents')
        .createSignedUrl(storagePath, 3600);
      if (signError || !signed?.signedUrl) {
        throw new Error(`sign failed for ${storagePath}: ${signError?.message}`);
      }
      signedUrl = signed.signedUrl;
    }
    counts['storage:documents'] = (counts['storage:documents'] ?? 0) + 1;

    await upsert('baseball_documents', [{
      id: docId,
      team_id: TEAM_ID,
      title: doc.title,
      description: doc.description,
      file_url: signedUrl,
      file_type: 'text/plain',
      file_size: buf.byteLength,
      category: doc.category,
      is_player_visible: true,
      uploaded_by: COACH_USER_ID,
      version_count: 1,
      folder: doc.folder,
    }]);

    await upsert('baseball_document_versions', [{
      id: versionId,
      document_id: docId,
      file_url: signedUrl,
      version_number: 1,
      file_name: `${doc.title}.txt`,
      file_size: buf.byteLength,
      mime_type: 'text/plain',
      storage_path: storagePath,
      change_notes: 'Initial upload (demo-reseed-v1)',
      uploaded_by: COACH_USER_ID,
    }]);
  }

  // ===========================================================================
  // 4. COACH -> PLAYER CONVERSATION (4 messages)
  // ===========================================================================
  console.log('[4/5] Seeding coach -> player conversation...');
  const conversationId = detId2('conversation:coach-player1');
  await upsert('baseball_conversations', [{
    id: conversationId,
    team_id: TEAM_ID,
    is_team_chat: false,
    title: null,
    created_by: COACH_USER_ID,
    created_at: isoHoursAgo(48),
    updated_at: isoHoursAgo(2),
  }]);
  await upsert('baseball_conversation_participants', [
    { id: detId2('convpart:coach'), conversation_id: conversationId, user_id: COACH_USER_ID, joined_at: isoHoursAgo(48) },
    { id: detId2('convpart:player1'), conversation_id: conversationId, user_id: PLAYER_USER_ID, joined_at: isoHoursAgo(48) },
  ]);
  await upsert('baseball_messages', [
    {
      id: detId2('msg:1'), conversation_id: conversationId, sender_id: COACH_USER_ID,
      content: "Nice work in yesterday's live BP, Marcus — bat speed is trending up. Keep grinding on the two-strike approach before Thursday.",
      read: true, created_at: isoHoursAgo(48),
    },
    {
      id: detId2('msg:2'), conversation_id: conversationId, sender_id: PLAYER_USER_ID,
      content: 'Thanks coach — feeling a lot more under control with two strikes. Ready for Coastal State.',
      read: true, created_at: isoHoursAgo(47),
    },
    {
      id: detId2('msg:3'), conversation_id: conversationId, sender_id: COACH_USER_ID,
      content: 'Good. Check your dev plan — I added a stolen-base goal for the back half of the season.',
      read: true, created_at: isoHoursAgo(24),
    },
    {
      id: detId2('msg:4'), conversation_id: conversationId, sender_id: PLAYER_USER_ID,
      content: "Saw it, let's go. I'll get some extra reads in at first today.",
      read: false, created_at: isoHoursAgo(2),
    },
  ]);

  // ===========================================================================
  // 5. RE-DATE recent lift sessions + readiness so "Recent" feels current
  // ===========================================================================
  console.log('[5/5] Re-dating recent lift sessions / readiness check-ins...');
  const hasLiftSeed = DRY ? true : await rowExists('helm_lifting_sessions', detId('sess:0:p1'));
  if (!hasLiftSeed) {
    console.warn('  ⚠ skipped section 5 — helm_lifting_sessions has no rows from the base seed yet');
  } else {
    // 5a. Legacy baseball_readiness_checkins.check_date -> today.
    await updateMany(
      'baseball_readiness_checkins',
      ROSTER_KEYS.map((key) => ({ id: detId(`bready:${key}`), check_date: dateDaysAgo(0) })),
    );

    // 5b. Live helm_lifting_readiness_checkins.checkin_date -> within the
    // last 3 days (matches the base seed's own (i % 3) + 1 formula, just
    // re-anchored to today so it stays inside the 7-day "recent" window
    // read models like decision-room/readiness.ts filter on).
    await updateMany(
      'helm_lifting_readiness_checkins',
      ROSTER_KEYS.map((key, i) => ({ id: detId(`checkin:${key}`), checkin_date: dateDaysAgo((i % 3) + 1) })),
    );

    // 5c. Program assignments (the 2-week in-season block): 2 completed
    // weeks in the past, "today", and one upcoming.
    await updateMany('helm_lifting_program_assignments', [
      { id: detId('pa:w1l'), scheduled_date: dateDaysAgo(10), player_visible_at: isoDaysAgo(10) },
      { id: detId('pa:w1u'), scheduled_date: dateDaysAgo(7), player_visible_at: isoDaysAgo(7) },
      { id: detId('pa:w2l'), scheduled_date: dateDaysAgo(0), player_visible_at: isoDaysAgo(0) },
      { id: detId('pa:w2u'), scheduled_date: dateDaysFromNow(3), player_visible_at: isoDaysAgo(0) },
    ]);

    // 5d. Sessions per (program-assignment index `pi`, roster key) — same
    // 4-slot shape the base seed created (pi 0/1 completed in the past,
    // pi 2 = "today", pi 3 = upcoming). Title text embeds the date for
    // completed sessions, so it's redated together with scheduled_date/
    // started_at/completed_at to avoid a stale date baked into the title.
    const SESSION_SLOTS = [
      { pi: 0, exName: 'Back Squat', completed: true, date: dateDaysAgo(10), at: isoDaysAgo(10) },
      { pi: 1, exName: 'Bench Press', completed: true, date: dateDaysAgo(7), at: isoDaysAgo(7) },
      { pi: 2, exName: 'Back Squat', completed: false, date: dateDaysAgo(0), at: null as string | null },
      { pi: 3, exName: 'Bench Press', completed: false, date: dateDaysFromNow(3), at: null as string | null },
    ];
    const sessionRows: { id: string; [key: string]: unknown }[] = [];
    for (const slot of SESSION_SLOTS) {
      const title = slot.completed
        ? `${slot.exName} day — ${slot.date}`
        : slot.pi === 2
          ? `Today's lift — ${slot.exName} day`
          : `Upcoming — ${slot.exName} day`;
      for (const key of ROSTER_KEYS) {
        sessionRows.push({
          id: detId(`sess:${slot.pi}:${key}`),
          title,
          scheduled_date: slot.date,
          started_at: slot.at,
          completed_at: slot.at,
        });
      }
    }
    await updateMany('helm_lifting_sessions', sessionRows);

    // 5e. Legacy baseball_lift_results/assignments (Phase-1 "baseball
    // lift" island — still read by the Performance page).
    await updateMany(
      'baseball_lift_results',
      ROSTER_KEYS.map((key) => ({ id: detId(`bresult:bench:${key}`), performed_at: isoDaysAgo(2) })),
    );
    await updateMany('baseball_lift_assignments', [
      ...ROSTER_KEYS.map((key) => ({ id: detId(`bassign:squat:${key}`), due_date: dateDaysFromNow(3) })),
      ...ROSTER_KEYS.map((key) => ({ id: detId(`bassign:bench:${key}`), due_date: dateDaysAgo(2) })),
    ]);
  }

  // --- Report -------------------------------------------------------------
  console.log(`\n${DRY ? '[DRY RUN] would write' : 'Wrote'} rows:`);
  for (const [t, n] of Object.entries(counts)) console.log(`  ${t.padEnd(36)} ${n}`);
  if (skipped.length) {
    console.log('\nSkipped (schema mismatch):');
    for (const s of skipped) console.log(`  ⚠ ${s}`);
  }
  console.log(`\nTeam: Rini University Baseball (${TEAM_ID})`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});

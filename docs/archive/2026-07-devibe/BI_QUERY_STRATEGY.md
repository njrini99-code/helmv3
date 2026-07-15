# Business Intelligence Dashboard -- Complete Query Strategy

> **Purpose:** Replace vanity metrics with decision-making metrics computed entirely from existing tables.
> **Constraint:** No new tables, no materialized views. All computation in JavaScript after data fetch.
> **Client:** Supabase admin client (`createAdminClient()` -- service role, bypasses RLS).
> **Performance target:** All BI queries complete in < 3 seconds total via `Promise.all()` batches.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Shared Constants & Helpers](#shared-constants--helpers)
3. [Section A: Growth Metrics](#section-a-growth-metrics)
4. [Section B: Retention Metrics](#section-b-retention-metrics)
5. [Section C: Product Usage Metrics](#section-c-product-usage-metrics)
6. [Section D: Funnel & Friction Metrics](#section-d-funnel--friction-metrics)
7. [Section E: Health & Opportunity Metrics](#section-e-health--opportunity-metrics)
8. [Section F: Vercel Analytics Integration](#section-f-vercel-analytics-integration)
9. [Query Batch Plan](#query-batch-plan)
10. [JavaScript Aggregation Patterns](#javascript-aggregation-patterns)
11. [Estimated Performance Budget](#estimated-performance-budget)

---

## Architecture Overview

```
┌───────────────────────────────────────────────────────────┐
│                    Server Action                          │
│               getBIDashboardData()                        │
│                                                           │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐    │
│  │ Batch 1 │  │ Batch 2 │  │ Batch 3 │  │ Batch 4 │    │
│  │ Growth  │  │Retention│  │ Product │  │ Health  │    │
│  │ Queries │  │ Queries │  │ Usage   │  │ Queries │    │
│  └────┬────┘  └────┬────┘  └────┬────┘  └────┬────┘    │
│       │             │            │             │          │
│       └─────────────┴────────────┴─────────────┘          │
│                         │                                  │
│              Promise.all() per batch                       │
│                         │                                  │
│              ┌──────────▼──────────┐                      │
│              │  JS Aggregation     │                      │
│              │  Maps, Sets, Loops  │                      │
│              └──────────┬──────────┘                      │
│                         │                                  │
│              ┌──────────▼──────────┐                      │
│              │  Typed BI Response  │                      │
│              │  BIDashboardData    │                      │
│              └─────────────────────┘                      │
└───────────────────────────────────────────────────────────┘
```

### Key Principle: Reuse Raw Data Across Metrics

Many BI metrics share the same underlying data. Fetch raw rows once, then compute multiple metrics from the same array in JavaScript. For example, a single fetch of all `golf_rounds` rows (with `player_id, created_at, status, team_id`) feeds into:
- Growth: signup-to-activation, round growth rate
- Retention: D1/D7/D30, cohort matrix, DAU/WAU/MAU
- Product: round completion rates, rounds per player
- Health: churn detection, team activity scoring

---

## Shared Constants & Helpers

```typescript
// Time boundaries (computed once at top of function)
const now = new Date();
const ago1d  = daysAgo(1);   // 24 hours ago
const ago7d  = daysAgo(7);   // 7 days ago
const ago14d = daysAgo(14);  // 14 days ago
const ago30d = daysAgo(30);  // 30 days ago
const ago60d = daysAgo(60);  // 60 days ago
const ago90d = daysAgo(90);  // 90 days ago
const today  = todayStart(); // midnight today

// Helper: ISO string N days ago
function daysAgo(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString();
}

// Helper: start of today
function todayStart(): string {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Helper: Monday of N weeks ago
function weeksAgoMonday(weeksBack: number): string {
  const d = new Date();
  d.setDate(d.getDate() - d.getDay() + 1 - weeksBack * 7);
  d.setHours(0, 0, 0, 0);
  return d.toISOString();
}

// Helper: get ISO week key (Monday) from a date
function getWeekKey(dateStr: string): string {
  const d = new Date(dateStr);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  const monday = new Date(d);
  monday.setDate(diff);
  return monday.toISOString().slice(0, 10);
}

// Helper: get ISO date key
function getDateKey(dateStr: string): string {
  return new Date(dateStr).toISOString().slice(0, 10);
}
```

---

## Section A: Growth Metrics

### A1. Signups (Daily / Weekly / Monthly)

**Query:**
```typescript
// Q-A1: All user signups with registration dates (last 90 days)
const signupsRes = await adminDb
  .from('users')
  .select('id, role, created_at')
  .gte('created_at', ago90d)
  .order('created_at', { ascending: true });
```

**Returns:** `{ id: string, role: string | null, created_at: string }[]`

**JS Aggregation:**
```typescript
const signupRows = signupsRes.data ?? [];

// Daily signups (last 30 days)
const signupsByDay = new Map<string, number>();
for (let i = 29; i >= 0; i--) {
  const d = new Date(); d.setDate(d.getDate() - i);
  signupsByDay.set(d.toISOString().slice(0, 10), 0);
}
for (const u of signupRows) {
  if (!u.created_at) continue;
  const key = getDateKey(u.created_at);
  if (signupsByDay.has(key)) signupsByDay.set(key, (signupsByDay.get(key) ?? 0) + 1);
}

// Weekly signups (last 12 weeks)
const signupsByWeek = new Map<string, number>();
for (const u of signupRows) {
  if (!u.created_at) continue;
  const key = getWeekKey(u.created_at);
  signupsByWeek.set(key, (signupsByWeek.get(key) ?? 0) + 1);
}

// Monthly signups (last 3 months)
const signupsByMonth = new Map<string, number>();
for (const u of signupRows) {
  if (!u.created_at) continue;
  const key = u.created_at.slice(0, 7); // YYYY-MM
  signupsByMonth.set(key, (signupsByMonth.get(key) ?? 0) + 1);
}

// By role breakdown
const signupsByRole = { coach: 0, player: 0, admin: 0, unknown: 0 };
for (const u of signupRows) {
  const role = u.role ?? 'unknown';
  signupsByRole[role] = (signupsByRole[role] ?? 0) + 1;
}
```

**Feeds:** Daily/weekly/monthly signup sparklines, signup growth rate, role distribution.
**Est. response:** ~80ms (indexed on `created_at`)

---

### A2. Activated Users Count & Activation Rate

**Queries:**
```typescript
// Q-A2a: Players with onboarding status
const playersOnboardingRes = await adminDb
  .from('golf_players')
  .select('id, user_id, onboarding_completed, created_at');

// Q-A2b: Coaches with onboarding status
const coachesOnboardingRes = await adminDb
  .from('golf_coaches')
  .select('id, user_id, onboarding_completed, created_at');

// Q-A2c: All completed rounds (for "submitted at least one round" check)
// This is the CORE engagement query -- reused heavily
const allRoundsRes = await adminDb
  .from('golf_rounds')
  .select('id, player_id, team_id, status, round_type, created_at, total_score')
  .order('created_at', { ascending: false });
```

**JS Aggregation:**
```typescript
const allPlayers = playersOnboardingRes.data ?? [];
const allCoaches = coachesOnboardingRes.data ?? [];
const allRounds  = allRoundsRes.data ?? [];

// "Aha moment" = onboarding_completed + at least 1 completed round
const completedRoundPlayerIds = new Set(
  allRounds
    .filter(r => r.status === 'completed')
    .map(r => r.player_id)
);

const activatedPlayers = allPlayers.filter(
  p => p.onboarding_completed && completedRoundPlayerIds.has(p.id)
);
const activatedCoaches = allCoaches.filter(c => c.onboarding_completed);

// Activation rates
const playerActivationRate = allPlayers.length > 0
  ? Math.round((activatedPlayers.length / allPlayers.length) * 100)
  : 0;
const coachActivationRate = allCoaches.length > 0
  ? Math.round((activatedCoaches.length / allCoaches.length) * 100)
  : 0;
const overallActivationRate = (allPlayers.length + allCoaches.length) > 0
  ? Math.round(
      ((activatedPlayers.length + activatedCoaches.length) /
       (allPlayers.length + allCoaches.length)) * 100
    )
  : 0;
```

**Feeds:** Activation count, activation rate %, activation by user type.
**Est. response:** Q-A2a: ~40ms, Q-A2b: ~30ms, Q-A2c: ~120ms

---

### A3. Median Time-to-First-Value (TTFV)

**Queries:** Reuses Q-A1 (`signupsRes`), Q-A2a (`playersOnboardingRes`), Q-A2c (`allRoundsRes`).

Also needed:
```typescript
// Q-A3: User-to-player ID mapping (already fetched in A2a via user_id column)
// No additional query needed
```

**JS Aggregation:**
```typescript
// Build user signup dates map
const userSignupDates = new Map<string, string>();
for (const u of signupRows) {
  if (u.created_at) userSignupDates.set(u.id, u.created_at);
}

// Build player's first completed round date
const playerFirstRound = new Map<string, string>();
for (const r of allRounds) {
  if (r.status !== 'completed' || !r.created_at) continue;
  const existing = playerFirstRound.get(r.player_id);
  if (!existing || r.created_at < existing) {
    playerFirstRound.set(r.player_id, r.created_at);
  }
}

// Calculate TTFV for each player (signup -> first completed round)
const ttfvDays: number[] = [];
for (const player of allPlayers) {
  if (!player.user_id) continue;
  const signupDate = userSignupDates.get(player.user_id);
  const firstRoundDate = playerFirstRound.get(player.id);
  if (signupDate && firstRoundDate) {
    const diffMs = new Date(firstRoundDate).getTime() - new Date(signupDate).getTime();
    const diffDays = diffMs / 86400000;
    if (diffDays >= 0 && diffDays < 365) { // cap at 1 year
      ttfvDays.push(diffDays);
    }
  }
}

// Median calculation
ttfvDays.sort((a, b) => a - b);
const medianTTFV = ttfvDays.length > 0
  ? ttfvDays[Math.floor(ttfvDays.length / 2)]!
  : null;

// Also compute percentiles
const p25TTFV = ttfvDays.length > 0
  ? ttfvDays[Math.floor(ttfvDays.length * 0.25)]!
  : null;
const p75TTFV = ttfvDays.length > 0
  ? ttfvDays[Math.floor(ttfvDays.length * 0.75)]!
  : null;
```

**Feeds:** Median TTFV (days/hours), p25/p75 distribution, TTFV trend over time.
**Est. response:** No additional queries -- pure computation on already-fetched data.

---

### A4. Signup-to-Activation Drop-off

**Queries:** Reuses Q-A1, Q-A2a, Q-A2b, Q-A2c. No additional queries.

**JS Aggregation:**
```typescript
const totalSignups = signupRows.length;
const onboardedPlayers = allPlayers.filter(p => p.onboarding_completed).length;
const onboardedCoaches = allCoaches.filter(c => c.onboarding_completed).length;
const completedOnboarding = onboardedPlayers + onboardedCoaches;
const submittedFirstRound = completedRoundPlayerIds.size;

// Players active in the last 7 days (submitted a round)
const playersActiveLast7d = new Set(
  allRounds.filter(r => r.created_at && r.created_at >= ago7d).map(r => r.player_id)
);

const activationFunnel = [
  { stage: 'Signed Up',            count: totalSignups,         pctOfTop: 100 },
  { stage: 'Completed Onboarding', count: completedOnboarding,  pctOfTop: pct(completedOnboarding, totalSignups) },
  { stage: 'First Round Submitted',count: submittedFirstRound,  pctOfTop: pct(submittedFirstRound, totalSignups) },
  { stage: 'Active This Week',     count: playersActiveLast7d.size, pctOfTop: pct(playersActiveLast7d.size, totalSignups) },
];

// Per-step drop-off
for (let i = 1; i < activationFunnel.length; i++) {
  const prev = activationFunnel[i - 1]!;
  const curr = activationFunnel[i]!;
  curr.dropoff = prev.count - curr.count;
  curr.dropoffPct = prev.count > 0 ? Math.round((curr.dropoff / prev.count) * 100) : 0;
}

function pct(part: number, whole: number): number {
  return whole > 0 ? Math.round((part / whole) * 100) : 0;
}
```

**Feeds:** Funnel visualization (horizontal bar chart), biggest drop-off stage, drop-off % per step.
**Est. response:** Pure computation.

---

## Section B: Retention Metrics

### B1. D1 / D7 / D30 Retention

**Queries:** Reuses Q-A1 (`signupsRes`) and Q-A2c (`allRoundsRes`). Also needs:

```typescript
// Q-B1: User-to-player mapping (reuse from A2a -- golf_players has user_id)
// No additional query
```

**JS Aggregation:**
```typescript
// Build a map: player_id -> Set<dateKey> of activity dates (any round interaction)
const playerActivityDates = new Map<string, Set<string>>();
for (const r of allRounds) {
  if (!r.created_at) continue;
  const set = playerActivityDates.get(r.player_id) ?? new Set();
  set.add(getDateKey(r.created_at));
  playerActivityDates.set(r.player_id, set);
}

// Build userId -> playerId map
const userToPlayer = new Map<string, string>();
for (const p of allPlayers) {
  if (p.user_id) userToPlayer.set(p.user_id, p.id);
}

// For each user who signed up in the last 30 days, check if they were active on Day 1, Day 7, Day 30
function computeDnRetention(signupCohort: typeof signupRows, dayN: number): { retained: number; total: number; rate: number } {
  let total = 0;
  let retained = 0;
  for (const user of signupCohort) {
    if (!user.created_at) continue;
    const signupDate = new Date(user.created_at);
    const targetDate = new Date(signupDate);
    targetDate.setDate(targetDate.getDate() + dayN);
    // Only count users whose target date has passed
    if (targetDate > now) continue;
    total++;
    const playerId = userToPlayer.get(user.id);
    if (!playerId) continue;
    const activityDates = playerActivityDates.get(playerId);
    if (!activityDates) continue;
    // Check if active on targetDate (+/- 1 day window for D1, exact day for D7/D30)
    const targetKey = getDateKey(targetDate.toISOString());
    if (activityDates.has(targetKey)) {
      retained++;
    }
  }
  return { retained, total, rate: total > 0 ? Math.round((retained / total) * 100) : 0 };
}

// Use users who signed up 31+ days ago for D30, 8+ days ago for D7, 2+ days ago for D1
const d1Cohort  = signupRows.filter(u => u.created_at && u.created_at <= daysAgo(2));
const d7Cohort  = signupRows.filter(u => u.created_at && u.created_at <= daysAgo(8));
const d30Cohort = signupRows.filter(u => u.created_at && u.created_at <= daysAgo(31));

const d1Retention  = computeDnRetention(d1Cohort, 1);
const d7Retention  = computeDnRetention(d7Cohort, 7);
const d30Retention = computeDnRetention(d30Cohort, 30);
```

**Feeds:** D1/D7/D30 retention rates, trend over time (compute per-week cohort).
**Est. response:** Pure computation on already-fetched data.

---

### B2. Weekly Cohort Retention Matrix (8-week heatmap)

**Queries:** Reuses Q-A1 (`signupsRes`) and Q-A2c (`allRoundsRes`). No additional queries.

**JS Aggregation:**
```typescript
// Build player -> Set<weekKey> of weeks with activity
const playerRoundWeeks = new Map<string, Set<string>>();
for (const r of allRounds) {
  if (!r.created_at || !r.player_id) continue;
  const weekKey = getWeekKey(r.created_at);
  const set = playerRoundWeeks.get(r.player_id) ?? new Set();
  set.add(weekKey);
  playerRoundWeeks.set(r.player_id, set);
}

// Build 12-week cohort matrix
interface CohortRow {
  cohortWeek: string;       // e.g. "2026-01-06"
  cohortSize: number;       // users who signed up that week
  retentionByWeek: number[]; // [week0%, week1%, ..., weekN%]
}

const cohortMatrix: CohortRow[] = [];
for (let weeksBack = 12; weeksBack >= 1; weeksBack--) {
  const cohortStart = new Date();
  cohortStart.setDate(cohortStart.getDate() - cohortStart.getDay() + 1 - weeksBack * 7);
  cohortStart.setHours(0, 0, 0, 0);
  const cohortEnd = new Date(cohortStart);
  cohortEnd.setDate(cohortEnd.getDate() + 7);
  const cohortWeekLabel = cohortStart.toISOString().slice(0, 10);

  // Users who signed up in this week
  const cohortUsers = signupRows.filter(u => {
    if (!u.created_at) return false;
    const ts = new Date(u.created_at);
    return ts >= cohortStart && ts < cohortEnd;
  });
  const cohortPlayerIds = cohortUsers
    .map(u => userToPlayer.get(u.id))
    .filter(Boolean) as string[];
  const cohortSize = cohortUsers.length;
  if (cohortSize === 0) continue;

  const retentionByWeek: number[] = [];
  for (let weekOffset = 0; weekOffset <= 12; weekOffset++) {
    const targetWeek = new Date(cohortStart);
    targetWeek.setDate(targetWeek.getDate() + weekOffset * 7);
    if (targetWeek > now) break;

    const targetWeekKey = targetWeek.toISOString().slice(0, 10);
    const activeInWeek = cohortPlayerIds.filter(pid =>
      playerRoundWeeks.get(pid)?.has(targetWeekKey)
    ).length;
    retentionByWeek.push(
      cohortSize > 0 ? Math.round((activeInWeek / cohortSize) * 100) : 0
    );
  }

  cohortMatrix.push({ cohortWeek: cohortWeekLabel, cohortSize, retentionByWeek });
}
```

**Feeds:** Cohort retention heatmap (12-week x 12-week grid), week-over-week retention trend.
**Est. response:** Pure computation.

---

### B3. DAU / WAU / MAU & Stickiness Ratio

**Queries:** Reuses Q-A2c (`allRoundsRes`). Also uses `users.last_seen` from the platform health RPC.

For a more accurate DAU/WAU/MAU that includes non-round-submitting activity (page visits, logins), we incorporate the `last_seen` field:

```typescript
// Q-B3: Users with last_seen timestamps (from users table)
const usersLastSeenRes = await adminDb
  .from('users')
  .select('id, role, last_seen')
  .not('last_seen', 'is', null);
```

**Returns:** `{ id: string, role: string | null, last_seen: string }[]`

**JS Aggregation:**
```typescript
// Round-based activity (primary engagement signal)
const roundPlayersByDay = new Set(
  allRounds.filter(r => r.created_at && r.created_at >= ago1d).map(r => r.player_id)
);
const roundPlayersByWeek = new Set(
  allRounds.filter(r => r.created_at && r.created_at >= ago7d).map(r => r.player_id)
);
const roundPlayersByMonth = new Set(
  allRounds.filter(r => r.created_at && r.created_at >= ago30d).map(r => r.player_id)
);

// Login-based activity (broader signal via last_seen)
const loginUsersToday = new Set(
  (usersLastSeenRes.data ?? []).filter(u => u.last_seen >= today).map(u => u.id)
);
const loginUsersWeek = new Set(
  (usersLastSeenRes.data ?? []).filter(u => u.last_seen >= ago7d).map(u => u.id)
);
const loginUsersMonth = new Set(
  (usersLastSeenRes.data ?? []).filter(u => u.last_seen >= ago30d).map(u => u.id)
);

// Composite DAU/WAU/MAU (union of round submitters + logged-in users)
// For BI, we report BOTH round-based and login-based separately
const metrics = {
  // Round-based (core engagement)
  dauRounds: roundPlayersByDay.size,
  wauRounds: roundPlayersByWeek.size,
  mauRounds: roundPlayersByMonth.size,
  // Login-based (broader reach)
  dauLogins: loginUsersToday.size,
  wauLogins: loginUsersWeek.size,
  mauLogins: loginUsersMonth.size,
  // Stickiness ratio (round-based is more meaningful for B2B SaaS)
  stickinessRounds: roundPlayersByMonth.size > 0
    ? Math.round((roundPlayersByDay.size / roundPlayersByMonth.size) * 100)
    : 0,
  stickinessLogins: loginUsersMonth.size > 0
    ? Math.round((loginUsersToday.size / loginUsersMonth.size) * 100)
    : 0,
};
```

**Feeds:** DAU/WAU/MAU cards, stickiness % gauge, DAU/MAU trend sparkline.
**Est. response:** Q-B3: ~60ms. Computation on existing data.

---

### B4. Retention by User Type (Coach vs. Player)

**Queries:** Reuses Q-A1, Q-A2a, Q-A2b, Q-A2c, Q-B3. No additional queries.

**JS Aggregation:**
```typescript
// Classify users by role
const coachUserIds = new Set(allCoaches.map(c => c.user_id).filter(Boolean));
const playerUserIds = new Set(allPlayers.map(p => p.user_id).filter(Boolean));

// Coach retention: coaches active in last 7d / coaches active in last 30d
const coachesActiveWeek = (usersLastSeenRes.data ?? [])
  .filter(u => coachUserIds.has(u.id) && u.last_seen >= ago7d).length;
const coachesActiveMonth = (usersLastSeenRes.data ?? [])
  .filter(u => coachUserIds.has(u.id) && u.last_seen >= ago30d).length;
const coachWeeklyRetention = coachesActiveMonth > 0
  ? Math.round((coachesActiveWeek / coachesActiveMonth) * 100) : 0;

// Player retention: players who submitted round in last 7d / last 30d
const playerWeeklyRetention = roundPlayersByMonth.size > 0
  ? Math.round((roundPlayersByWeek.size / roundPlayersByMonth.size) * 100) : 0;
```

**Feeds:** Coach vs. player retention comparison bar chart.
**Est. response:** Pure computation.

---

## Section C: Product Usage Metrics

### C1. Feature Adoption Rates (Per Feature)

**Queries:**
```typescript
// Q-C1: Feature object counts (all-time + last 30 days)
// These run in parallel -- each is a simple count query
const [
  qualifiersAllRes,   qualifiers30dRes,
  eventsAllRes,       events30dRes,
  tasksAllRes,        tasks30dRes,
  messagesAllRes,     messages30dRes,
  documentsAllRes,    documents30dRes,
  travelAllRes,       travel30dRes,
  announcementsAllRes, announcements30dRes,
  // "Advanced" feature signals
  coachPhilosophyRes,  // CoachHelm AI adoption
  focusAreasRes,       // Development plans
  shotsCountRes,       // Shot tracking depth
  roundReviewsAllRes,  // Round reviews
  predictionsAllRes,   // AI predictions
  insightGenAllRes,    // AI insight generations
] = await Promise.all([
  adminDb.from('golf_qualifiers').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_qualifiers').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_events').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_events').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_tasks').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_tasks').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_messages').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_messages').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_documents').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_documents').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_travel_itineraries').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_travel_itineraries').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_announcements').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_announcements').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_coach_philosophy').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_player_focus_areas').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_shots').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_round_reviews').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_predictions').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_insight_generation_log').select('id', { count: 'exact', head: true }),
]);
```

**JS Aggregation:**
```typescript
const featureAdoption = [
  {
    feature: 'Rounds',
    allTime: allRounds.length,
    last30d: allRounds.filter(r => r.created_at && r.created_at >= ago30d).length,
    category: 'core',
  },
  {
    feature: 'Events / Calendar',
    allTime: eventsAllRes.count ?? 0,
    last30d: events30dRes.count ?? 0,
    category: 'team',
  },
  {
    feature: 'Messages',
    allTime: messagesAllRes.count ?? 0,
    last30d: messages30dRes.count ?? 0,
    category: 'team',
  },
  {
    feature: 'Tasks',
    allTime: tasksAllRes.count ?? 0,
    last30d: tasks30dRes.count ?? 0,
    category: 'team',
  },
  {
    feature: 'Announcements',
    allTime: announcementsAllRes.count ?? 0,
    last30d: announcements30dRes.count ?? 0,
    category: 'team',
  },
  {
    feature: 'Documents',
    allTime: documentsAllRes.count ?? 0,
    last30d: documents30dRes.count ?? 0,
    category: 'team',
  },
  {
    feature: 'Travel',
    allTime: travelAllRes.count ?? 0,
    last30d: travel30dRes.count ?? 0,
    category: 'team',
  },
  {
    feature: 'Qualifiers',
    allTime: qualifiersAllRes.count ?? 0,
    last30d: qualifiers30dRes.count ?? 0,
    category: 'advanced',
  },
  {
    feature: 'CoachHelm AI (Philosophy)',
    allTime: coachPhilosophyRes.count ?? 0,
    last30d: 0, // Philosophy is a one-time setup, not time-bound
    category: 'advanced',
  },
  {
    feature: 'Development Plans',
    allTime: focusAreasRes.count ?? 0,
    last30d: 0,
    category: 'advanced',
  },
  {
    feature: 'Shot Tracking',
    allTime: shotsCountRes.count ?? 0,
    last30d: 0, // Would need time-bound query if needed
    category: 'advanced',
  },
  {
    feature: 'Round Reviews (AI)',
    allTime: roundReviewsAllRes.count ?? 0,
    last30d: 0,
    category: 'advanced',
  },
].sort((a, b) => b.allTime - a.allTime);
```

**Feeds:** Feature adoption ranking (horizontal bars), 30d trend badges, category grouping.
**Est. response:** ~20ms per count query (head:true = no row transfer), 20 queries x 20ms = ~400ms total in one Promise.all.

---

### C2. Repeat Usage (Feature Stickiness)

**Queries:**
```typescript
// Q-C2a: Unique coaches/players who created objects (messages, tasks, etc.) in last 30d
// Use creator/user columns where available
const messageCreatorsRes = await adminDb
  .from('golf_messages')
  .select('sender_id')
  .gte('created_at', ago30d);

const taskCreatorsRes = await adminDb
  .from('golf_tasks')
  .select('created_by')
  .gte('created_at', ago30d);

const eventCreatorsRes = await adminDb
  .from('golf_events')
  .select('created_by')
  .gte('created_at', ago30d);
```

**JS Aggregation:**
```typescript
// Messages: unique senders and messages per sender
const messageSenders = new Map<string, number>();
for (const m of (messageCreatorsRes.data ?? [])) {
  if (m.sender_id) messageSenders.set(m.sender_id, (messageSenders.get(m.sender_id) ?? 0) + 1);
}
const repeatMessageUsers = [...messageSenders.values()].filter(count => count >= 5).length;
const totalMessageUsers = messageSenders.size;

// Same pattern for tasks and events
// ...

// Repeat usage ratio: users who used feature 5+ times / total users who used it
```

**Feeds:** Repeat usage % per feature, "sticky features" ranking.
**Est. response:** ~60ms per query.

---

### C3. Feature-Retention Correlation

**Queries:** Reuses Q-A2c (`allRoundsRes`), Q-B3 (`usersLastSeenRes`), plus the CoachHelm queries:

```typescript
// Q-C3a: Coaches with philosophy configured
const coachPhilosophyDetailRes = await adminDb
  .from('golf_coach_philosophy')
  .select('coach_id');

// Q-C3b: Coaches who generated insights
const insightGenCoachesRes = await adminDb
  .from('golf_insight_generation_log')
  .select('coach_id, created_at')
  .gte('created_at', ago30d)
  .not('coach_id', 'is', null);

// Q-C3c: Players with shot data
const playersWithShotsRes = await adminDb
  .from('golf_shots')
  .select('round_id');
// Then join with golf_rounds to get player_ids
```

**JS Aggregation:**
```typescript
// For each "advanced" feature, check if users of that feature have higher retention

// Example: coaches with philosophy vs. without
const coachesWithPhilosophy = new Set(
  (coachPhilosophyDetailRes.data ?? []).map(c => c.coach_id)
);

// Compare retention: what % of philosophy-using coaches were active in last 7d
// vs. coaches without philosophy
const coachUserIdMap = new Map<string, string>(); // coach_id -> user_id
for (const c of allCoaches) {
  coachUserIdMap.set(c.id, c.user_id);
}

let withPhilosophyActive7d = 0, withPhilosophyTotal = 0;
let withoutPhilosophyActive7d = 0, withoutPhilosophyTotal = 0;

for (const c of allCoaches) {
  if (!c.user_id) continue;
  const isActive = loginUsersWeek.has(c.user_id);
  if (coachesWithPhilosophy.has(c.id)) {
    withPhilosophyTotal++;
    if (isActive) withPhilosophyActive7d++;
  } else {
    withoutPhilosophyTotal++;
    if (isActive) withoutPhilosophyActive7d++;
  }
}

const philosophyRetention = withPhilosophyTotal > 0
  ? Math.round((withPhilosophyActive7d / withPhilosophyTotal) * 100) : 0;
const noPhilosophyRetention = withoutPhilosophyTotal > 0
  ? Math.round((withoutPhilosophyActive7d / withoutPhilosophyTotal) * 100) : 0;

// Repeat for: shot tracking users, qualifier users, development plan users
// This produces a feature-retention correlation table
```

**Feeds:** Feature-retention correlation chart (scatter or bar), "features that drive retention" ranking.
**Est. response:** Q-C3a/b: ~30ms each. Computation on existing data.

---

### C4. Dead Features Detection

**Queries:** Reuses feature count queries from C1.

**JS Aggregation:**
```typescript
// Dead feature = 0 objects created in last 30 days, OR < 5% of max feature usage
const maxFeature30d = Math.max(...featureAdoption.map(f => f.last30d), 1);
const deadFeatures = featureAdoption.filter(f =>
  f.last30d === 0 || (f.last30d / maxFeature30d) < 0.05
);
const healthyFeatures = featureAdoption.filter(f =>
  f.last30d > 0 && (f.last30d / maxFeature30d) >= 0.05
);
```

**Feeds:** Dead features list (with "last used" date), feature health status badges.
**Est. response:** Pure computation.

---

### C5. Object Creation Trends (Sparklines)

**Queries:**
```typescript
// Q-C5: Rounds by week (last 12 weeks) -- reuses allRoundsRes
// Additional: events, messages by week for trend comparison

const eventsWeeklyRes = await adminDb
  .from('golf_events')
  .select('created_at')
  .gte('created_at', weeksAgoMonday(12))
  .order('created_at', { ascending: true });

const messagesWeeklyRes = await adminDb
  .from('golf_messages')
  .select('created_at')
  .gte('created_at', weeksAgoMonday(12))
  .order('created_at', { ascending: true });
```

**JS Aggregation:**
```typescript
function groupByWeekFromDates(rows: { created_at: string | null }[]): Map<string, number> {
  const weeks = new Map<string, number>();
  for (const r of rows) {
    if (!r.created_at) continue;
    const key = getWeekKey(r.created_at);
    weeks.set(key, (weeks.get(key) ?? 0) + 1);
  }
  return weeks;
}

const roundsByWeek = groupByWeekFromDates(allRounds.filter(r => r.created_at && r.created_at >= weeksAgoMonday(12)));
const eventsByWeek = groupByWeekFromDates(eventsWeeklyRes.data ?? []);
const messagesByWeek = groupByWeekFromDates(messagesWeeklyRes.data ?? []);
```

**Feeds:** Multi-line sparkline chart showing object creation trends per feature.
**Est. response:** ~50ms per query.

---

## Section D: Funnel & Friction Metrics

### D1. Onboarding Step Conversion Rates

**Queries:** Reuses Q-A1, Q-A2a, Q-A2b, Q-A2c. Plus:

```typescript
// Q-D1a: Team membership (has the user joined a team?)
const teamMembershipsRes = await adminDb
  .from('golf_team_members')
  .select('player_id, team_id, status, created_at')
  .eq('status', 'active');

// Q-D1b: Player stats cache (has the user viewed stats? approximated by having stats)
const playerStatsCacheRes = await adminDb
  .from('golf_player_stats_cache')
  .select('player_id, rounds_played')
  .not('rounds_played', 'is', null);
```

**JS Aggregation:**
```typescript
// Build comprehensive onboarding funnel
const playersWithTeam = new Set(
  (teamMembershipsRes.data ?? []).map(m => m.player_id)
);
const playersWithStats = new Set(
  (playerStatsCacheRes.data ?? []).filter(s => (s.rounds_played ?? 0) > 0).map(s => s.player_id)
);
const playersWithMultipleRounds = new Set(
  [...playerRoundCounts.entries()]
    .filter(([, count]) => count >= 3)
    .map(([pid]) => pid)
);

// Player onboarding funnel (more granular than activation funnel)
const playerOnboardingFunnel = [
  { step: 'Account Created',       count: allPlayers.length },
  { step: 'Onboarding Completed',  count: allPlayers.filter(p => p.onboarding_completed).length },
  { step: 'Joined Team',           count: allPlayers.filter(p => playersWithTeam.has(p.id)).length },
  { step: 'First Round Submitted', count: allPlayers.filter(p => completedRoundPlayerIds.has(p.id)).length },
  { step: 'Stats Generated',       count: allPlayers.filter(p => playersWithStats.has(p.id)).length },
  { step: '3+ Rounds (Habit)',     count: allPlayers.filter(p => playersWithMultipleRounds.has(p.id)).length },
];

// Coach onboarding funnel
const coachesWithPhilosophy = new Set(
  (coachPhilosophyDetailRes.data ?? []).map(c => c.coach_id)
);
const coachesWhoReviewed = new Set(
  (coachRoundReviewsRes.data ?? []).filter(r => r.published_by).map(r => r.published_by!)
);

const coachOnboardingFunnel = [
  { step: 'Account Created',          count: allCoaches.length },
  { step: 'Onboarding Completed',     count: allCoaches.filter(c => c.onboarding_completed).length },
  { step: 'Philosophy Configured',    count: allCoaches.filter(c => coachesWithPhilosophy.has(c.id)).length },
  { step: 'First Round Review',       count: allCoaches.filter(c => coachesWhoReviewed.has(c.id)).length },
  { step: 'Active This Week (Login)', count: allCoaches.filter(c => c.user_id && loginUsersWeek.has(c.user_id)).length },
];

// Add conversion rates and drop-offs
function addFunnelMetrics(funnel: { step: string; count: number }[]) {
  return funnel.map((item, idx) => {
    const prev = idx === 0 ? item.count : funnel[idx - 1]!.count;
    return {
      ...item,
      conversionFromPrev: prev > 0 ? Math.round((item.count / prev) * 100) : 0,
      conversionFromTop: funnel[0]!.count > 0 ? Math.round((item.count / funnel[0]!.count) * 100) : 0,
      dropoff: Math.max(prev - item.count, 0),
      dropoffPct: prev > 0 ? Math.round(((prev - item.count) / prev) * 100) : 0,
    };
  });
}
```

**Feeds:** Player onboarding funnel, coach onboarding funnel, biggest drop-off callout.
**Est. response:** Q-D1a: ~40ms, Q-D1b: ~30ms.

---

### D2. Biggest Drop-offs (Automated Detection)

**Queries:** No additional queries -- pure analysis of D1 funnels.

**JS Aggregation:**
```typescript
// Find the step with the largest absolute drop-off
const playerFunnelWithMetrics = addFunnelMetrics(playerOnboardingFunnel);
const coachFunnelWithMetrics = addFunnelMetrics(coachOnboardingFunnel);

const biggestPlayerDropoff = playerFunnelWithMetrics
  .slice(1) // skip first step
  .sort((a, b) => b.dropoff - a.dropoff)[0];

const biggestCoachDropoff = coachFunnelWithMetrics
  .slice(1)
  .sort((a, b) => b.dropoff - a.dropoff)[0];

// Generate automated insight
const dropoffInsight = biggestPlayerDropoff
  ? `Biggest player drop-off: ${biggestPlayerDropoff.dropoff} users (${biggestPlayerDropoff.dropoffPct}%) between "${playerFunnelWithMetrics[playerFunnelWithMetrics.indexOf(biggestPlayerDropoff) - 1]?.step}" and "${biggestPlayerDropoff.step}"`
  : 'No significant drop-offs detected';
```

**Feeds:** "Biggest drop-off" callout card, drop-off % badges on funnel visualization.
**Est. response:** Pure computation.

---

### D3. Error Rates by Feature Area

**Queries:**
```typescript
// Q-D3: Error logs from last 30 days with URL context
const errorLogsRes = await adminDb
  .from('error_logs')
  .select('id, message, severity, url, user_id, created_at')
  .gte('created_at', ago30d)
  .order('created_at', { ascending: false })
  .limit(500);

// Q-D3b: Admin events with error severity
const adminErrorEventsRes = await adminDb
  .from('admin_events')
  .select('id, event_type, severity, title, url, created_at')
  .in('severity', ['error', 'critical'])
  .gte('created_at', ago30d);
```

**JS Aggregation:**
```typescript
// Map error URLs to feature areas
function urlToFeatureArea(url: string | null): string {
  if (!url) return 'Unknown';
  const path = url.toLowerCase();
  if (path.includes('/rounds'))       return 'Round Tracking';
  if (path.includes('/stats'))        return 'Stats & Analytics';
  if (path.includes('/calendar'))     return 'Calendar / Events';
  if (path.includes('/messages'))     return 'Messaging';
  if (path.includes('/roster'))       return 'Roster';
  if (path.includes('/tasks'))        return 'Tasks';
  if (path.includes('/qualifiers'))   return 'Qualifiers';
  if (path.includes('/coachhelm') || path.includes('/intelligence') || path.includes('/insights'))
    return 'CoachHelm AI';
  if (path.includes('/documents'))    return 'Documents';
  if (path.includes('/travel'))       return 'Travel';
  if (path.includes('/settings'))     return 'Settings';
  if (path.includes('/onboarding'))   return 'Onboarding';
  if (path.includes('/login') || path.includes('/signup'))
    return 'Authentication';
  if (path.includes('/admin'))        return 'Admin';
  return 'Other';
}

const errorsByFeature = new Map<string, { count: number; critical: number; lastSeen: string }>();
for (const e of (errorLogsRes.data ?? [])) {
  const area = urlToFeatureArea(e.url);
  const existing = errorsByFeature.get(area) ?? { count: 0, critical: 0, lastSeen: '' };
  existing.count++;
  if (e.severity === 'critical') existing.critical++;
  if (e.created_at && (!existing.lastSeen || e.created_at > existing.lastSeen)) {
    existing.lastSeen = e.created_at;
  }
  errorsByFeature.set(area, existing);
}

// Sort by count descending
const errorsByFeatureArea = [...errorsByFeature.entries()]
  .map(([area, data]) => ({ area, ...data }))
  .sort((a, b) => b.count - a.count);
```

**Feeds:** Error rate by feature area table, "friction zones" heatmap.
**Est. response:** Q-D3: ~80ms (limit 500), Q-D3b: ~40ms.

---

### D4. Stuck Users Identification

**Queries:** Reuses all previous queries. No additional queries needed.

**JS Aggregation:**
```typescript
// Users stuck at each funnel stage for > 7 days
const stuckUsersPerStage: { stage: string; users: StuckUser[] }[] = [];

// Stuck at "Signed Up" -- created account but never completed onboarding
const stuckAtSignup = signupRows
  .filter(u => {
    if (!u.created_at) return false;
    const daysSince = (Date.now() - new Date(u.created_at).getTime()) / 86400000;
    if (daysSince < 3) return false; // give them 3 days
    const player = allPlayers.find(p => p.user_id === u.id);
    const coach = allCoaches.find(c => c.user_id === u.id);
    return (player && !player.onboarding_completed) || (coach && !coach.onboarding_completed);
  })
  .slice(0, 25)
  .map(u => ({
    userId: u.id,
    email: '', // would need users.email, available from signupsRes
    daysSinceSignup: Math.floor((Date.now() - new Date(u.created_at!).getTime()) / 86400000),
    stuckAt: 'Signed Up (no onboarding)',
  }));

// Stuck at "Onboarded" -- completed onboarding but never submitted a round
const stuckAtOnboarded = allPlayers
  .filter(p => p.onboarding_completed && !completedRoundPlayerIds.has(p.id))
  .slice(0, 25)
  .map(p => ({
    userId: p.user_id,
    name: `${p.first_name ?? ''} ${p.last_name ?? ''}`.trim(),
    daysSinceSignup: p.created_at
      ? Math.floor((Date.now() - new Date(p.created_at).getTime()) / 86400000) : 0,
    stuckAt: 'Onboarded (no round)',
  }));
```

**Feeds:** Stuck users table per funnel stage, actionable outreach lists.
**Est. response:** Pure computation.

---

## Section E: Health & Opportunity Metrics

### E1. Team Health Scores

**Queries:** Reuses Q-A2c (`allRoundsRes`), Q-B3 (`usersLastSeenRes`), Q-D1a (`teamMembershipsRes`). Plus:

```typescript
// Q-E1a: Team metadata
const teamsRes = await adminDb
  .from('golf_teams')
  .select('id, name, organization_id, created_at, organizations(name)');

// Q-E1b: Coach-to-org mapping
const coachOrgRes = await adminDb
  .from('golf_coaches')
  .select('id, user_id, organization_id');
```

**JS Aggregation:**
```typescript
interface TeamHealthScore {
  teamId: string;
  teamName: string;
  orgName: string | null;
  score: number;            // 0-100
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: {
    activePlayerPct: number;    // % of players active in last 7d (0-25 points)
    roundsPerPlayerWeek: number; // avg rounds per player per week (0-25 points)
    coachEngagement: number;    // coach login recency + review rate (0-25 points)
    featureAdoption: number;    // how many features used (0-25 points)
  };
  playerCount: number;
  activePlayerCount: number;
  roundsThisMonth: number;
  coachLastActive: string | null;
  riskLevel: 'healthy' | 'at_risk' | 'critical';
}

// For each team:
for (const team of (teamsRes.data ?? [])) {
  const teamPlayerIds = (teamMembershipsRes.data ?? [])
    .filter(m => m.team_id === team.id)
    .map(m => m.player_id);

  // 1. Active player % (25 points)
  const activePlayersCount = teamPlayerIds.filter(pid => {
    const player = allPlayers.find(p => p.id === pid);
    return player?.user_id && loginUsersWeek.has(player.user_id);
  }).length;
  const activePlayerPct = teamPlayerIds.length > 0
    ? (activePlayersCount / teamPlayerIds.length) * 100 : 0;
  const activeScore = Math.min(Math.round(activePlayerPct / 4), 25); // 100% active = 25 pts

  // 2. Rounds per player per week (25 points)
  const teamRounds30d = allRounds.filter(r =>
    r.created_at && r.created_at >= ago30d &&
    teamPlayerIds.includes(r.player_id)
  ).length;
  const roundsPerPlayerWeek = teamPlayerIds.length > 0
    ? (teamRounds30d / teamPlayerIds.length / 4) : 0; // divide by 4 weeks
  const roundScore = Math.min(Math.round(roundsPerPlayerWeek * 12.5), 25); // 2 rounds/player/week = 25 pts

  // 3. Coach engagement (25 points)
  // ... (check coach last_seen and review rate)

  // 4. Feature breadth (25 points)
  // Count distinct feature types used by this team
  // ...

  const totalScore = activeScore + roundScore + /* coachScore + featureScore */ 0;
  const grade = totalScore >= 80 ? 'A' : totalScore >= 60 ? 'B' : totalScore >= 40 ? 'C' : totalScore >= 20 ? 'D' : 'F';
  const riskLevel = totalScore >= 50 ? 'healthy' : totalScore >= 25 ? 'at_risk' : 'critical';
}
```

**Feeds:** Team health leaderboard, health score ring per team, at-risk team alerts.
**Est. response:** Q-E1a: ~30ms, Q-E1b: ~20ms. Computation: ~5ms.

---

### E2. Power User Identification

**Queries:** Reuses Q-A2c (`allRoundsRes`). Plus:

```typescript
// Q-E2a: Player focus areas (Development Plans usage signal)
const focusAreaPlayersRes = await adminDb
  .from('golf_player_focus_areas')
  .select('player_id')
  .not('player_id', 'is', null);

// Q-E2b: Qualifier entries (Qualifier participation signal)
const qualifierPlayersRes = await adminDb
  .from('golf_qualifier_entries')
  .select('player_id');

// Q-E2c: Shots per round (Shot Tracking signal -- has shot data)
const shotRoundsRes = await adminDb
  .from('golf_shots')
  .select('round_id')
  .limit(10000); // limit for performance
// Join with rounds to get player_ids
```

**JS Aggregation:**
```typescript
// Power User Definition:
// - Active in 3 of last 4 weeks (submitted rounds)
// - Completed >= 3 rounds total in last 30 days
// - Used 2+ "advanced" features (CoachHelm AI, Qualifiers, Dev Plans, Shot Tracking, Stats Deep Dive)

// Step 1: Check weekly activity pattern (3 of 4 weeks)
const last4Weeks = [0, 1, 2, 3].map(i => {
  const start = new Date();
  start.setDate(start.getDate() - start.getDay() + 1 - i * 7);
  start.setHours(0, 0, 0, 0);
  return start.toISOString().slice(0, 10);
});

function isActiveIn3of4Weeks(playerId: string): boolean {
  const activeWeeks = playerRoundWeeks.get(playerId);
  if (!activeWeeks) return false;
  const weeksActive = last4Weeks.filter(wk => activeWeeks.has(wk)).length;
  return weeksActive >= 3;
}

// Step 2: Check 3+ completed rounds in last 30 days
const roundsLast30d = new Map<string, number>();
for (const r of allRounds) {
  if (r.status !== 'completed' || !r.created_at || r.created_at < ago30d) continue;
  roundsLast30d.set(r.player_id, (roundsLast30d.get(r.player_id) ?? 0) + 1);
}

// Step 3: Check advanced feature usage
const playersWithFocusAreas = new Set(
  (focusAreaPlayersRes.data ?? []).map(f => f.player_id)
);
const playersWithQualifiers = new Set(
  (qualifierPlayersRes.data ?? []).map(q => q.player_id)
);
const roundsWithShots = new Set(
  (shotRoundsRes.data ?? []).map(s => s.round_id)
);
const playersWithShots = new Set(
  allRounds.filter(r => roundsWithShots.has(r.id)).map(r => r.player_id)
);
const playersWithReviews = new Set(
  (coachRoundReviewsRes.data ?? [])
    .map(r => (r.golf_rounds as { player_id: string } | null)?.player_id)
    .filter(Boolean) as string[]
);

function countAdvancedFeatures(playerId: string): number {
  let count = 0;
  if (coachesWithPhilosophy.has(playerId)) count++; // This is coach-level, need different approach for players
  if (playersWithQualifiers.has(playerId)) count++;
  if (playersWithFocusAreas.has(playerId)) count++;
  if (playersWithShots.has(playerId)) count++;
  if (playersWithStats.has(playerId)) count++;
  return count;
}

// Identify power users
const powerUsers: string[] = [];
const regularUsers: string[] = [];
const casualUsers: string[] = [];

for (const player of allPlayers) {
  const monthlyRounds = roundsLast30d.get(player.id) ?? 0;
  const weeklyConsistent = isActiveIn3of4Weeks(player.id);
  const advancedFeatureCount = countAdvancedFeatures(player.id);

  if (weeklyConsistent && monthlyRounds >= 3 && advancedFeatureCount >= 2) {
    powerUsers.push(player.id);
  } else if (monthlyRounds >= 1) {
    regularUsers.push(player.id);
  } else {
    casualUsers.push(player.id);
  }
}

const powerUserPct = allPlayers.length > 0
  ? Math.round((powerUsers.length / allPlayers.length) * 100) : 0;
```

**Feeds:** Power user count, % of total, power user list with names, engagement segmentation pie chart.
**Est. response:** Q-E2a: ~20ms, Q-E2b: ~20ms, Q-E2c: ~80ms.

---

### E3. At-Risk Accounts (Churn Prediction)

**Queries:** Reuses Q-A2c, Q-B3, Q-E1. No additional queries.

**JS Aggregation:**
```typescript
// At-risk signals:
// 1. Had activity but none in last 14 days
// 2. Round frequency declining (was weekly, now nothing)
// 3. Team with < 25% active players

interface AtRiskAccount {
  type: 'player' | 'coach' | 'team';
  id: string;
  name: string;
  teamName: string | null;
  riskScore: number;          // 0-100 (higher = more at risk)
  riskSignals: string[];      // human-readable reasons
  lastActiveDate: string | null;
  daysSinceLastActive: number;
  previousActivityLevel: 'high' | 'medium' | 'low';
}

const atRiskAccounts: AtRiskAccount[] = [];

// Players at risk
for (const player of allPlayers) {
  if (!player.user_id) continue;
  const lastSeen = (usersLastSeenRes.data ?? []).find(u => u.id === player.user_id)?.last_seen;
  const daysSinceActive = lastSeen
    ? Math.floor((Date.now() - new Date(lastSeen).getTime()) / 86400000)
    : 999;

  // Only flag players who WERE active (not brand new or never-active)
  const totalRounds = playerRoundCounts.get(player.id) ?? 0;
  if (totalRounds === 0) continue; // never activated, different problem

  const riskSignals: string[] = [];
  let riskScore = 0;

  if (daysSinceActive >= 30) {
    riskScore += 40;
    riskSignals.push(`No login in ${daysSinceActive} days`);
  } else if (daysSinceActive >= 14) {
    riskScore += 25;
    riskSignals.push(`No login in ${daysSinceActive} days`);
  }

  // Check if round frequency is declining
  const roundsLast30 = roundsLast30d.get(player.id) ?? 0;
  const roundsPrev30 = allRounds.filter(r =>
    r.player_id === player.id &&
    r.created_at && r.created_at >= ago60d && r.created_at < ago30d
  ).length;

  if (roundsPrev30 > 0 && roundsLast30 === 0) {
    riskScore += 30;
    riskSignals.push(`Had ${roundsPrev30} rounds prev month, 0 this month`);
  } else if (roundsPrev30 > roundsLast30 && roundsPrev30 >= 2) {
    riskScore += 15;
    riskSignals.push(`Round frequency declining: ${roundsPrev30} -> ${roundsLast30}`);
  }

  // Only include if meaningful risk
  if (riskScore >= 25) {
    atRiskAccounts.push({
      type: 'player',
      id: player.id,
      name: `${player.first_name ?? ''} ${player.last_name ?? ''}`.trim(),
      teamName: playerTeamNameMap.get(player.id) ?? null,
      riskScore,
      riskSignals,
      lastActiveDate: lastSeen ?? null,
      daysSinceLastActive: daysSinceActive,
      previousActivityLevel: totalRounds >= 10 ? 'high' : totalRounds >= 3 ? 'medium' : 'low',
    });
  }
}

atRiskAccounts.sort((a, b) => b.riskScore - a.riskScore);
```

**Feeds:** At-risk accounts list (sortable by risk score), churn risk count badge, risk distribution chart.
**Est. response:** Pure computation.

---

### E4. Conversion-Intent Proxy Scores (Who Would Pay)

**Queries:** Reuses all previous queries. No additional queries needed.

**JS Aggregation:**
```typescript
// Proxy for "would pay" = high engagement + breadth of feature use + team size
// This is a team-level metric since pricing would be per-team/org

interface ConversionProxy {
  teamId: string;
  teamName: string;
  orgName: string | null;
  score: number;           // 0-100
  tier: 'high' | 'medium' | 'low';
  signals: {
    playerCount: number;        // More players = more value
    activePlayerPct: number;    // Higher active % = more embedded
    roundsPerWeek: number;      // More rounds = higher usage
    featureBreadth: number;     // More features = more lock-in
    aiAdoption: boolean;        // Using CoachHelm = premium signal
    dataDepth: number;          // Shot tracking, stats = power usage
    tenureDays: number;         // Longer tenure = more invested
  };
}

const conversionProxies: ConversionProxy[] = [];

for (const team of (teamsRes.data ?? [])) {
  const teamPlayerIds = (teamMembershipsRes.data ?? [])
    .filter(m => m.team_id === team.id)
    .map(m => m.player_id);

  if (teamPlayerIds.length === 0) continue;

  const activePlayers = teamPlayerIds.filter(pid => {
    const p = allPlayers.find(pl => pl.id === pid);
    return p?.user_id && loginUsersWeek.has(p.user_id);
  }).length;
  const activePlayerPct = (activePlayers / teamPlayerIds.length) * 100;

  const teamRoundsMonth = allRounds.filter(r =>
    r.created_at && r.created_at >= ago30d &&
    teamPlayerIds.includes(r.player_id)
  ).length;
  const roundsPerWeek = teamRoundsMonth / 4;

  // Feature breadth: count distinct features used
  let featureBreadth = 0;
  if (teamRoundsMonth > 0) featureBreadth++;
  // Check if team has events, messages, tasks, etc.
  // (would need team_id on those tables or derive from player membership)

  // AI adoption
  const teamOrgId = team.organization_id;
  const teamCoaches = allCoaches.filter(c => c.organization_id === teamOrgId);
  const hasAI = teamCoaches.some(c => coachesWithPhilosophy.has(c.id));

  // Tenure
  const tenureDays = team.created_at
    ? Math.floor((Date.now() - new Date(team.created_at).getTime()) / 86400000) : 0;

  // Score calculation (weighted)
  let score = 0;
  score += Math.min(teamPlayerIds.length * 3, 20);     // up to 20 pts for team size
  score += Math.min(activePlayerPct * 0.25, 25);        // up to 25 pts for active %
  score += Math.min(roundsPerWeek * 5, 20);             // up to 20 pts for round frequency
  score += hasAI ? 15 : 0;                               // 15 pts for AI adoption
  score += Math.min(tenureDays * 0.05, 10);              // up to 10 pts for tenure
  score += Math.min(featureBreadth * 2, 10);             // up to 10 pts for feature breadth
  score = Math.round(Math.min(score, 100));

  conversionProxies.push({
    teamId: team.id,
    teamName: team.name,
    orgName: (team.organizations as { name: string } | null)?.name ?? null,
    score,
    tier: score >= 70 ? 'high' : score >= 40 ? 'medium' : 'low',
    signals: {
      playerCount: teamPlayerIds.length,
      activePlayerPct: Math.round(activePlayerPct),
      roundsPerWeek: Math.round(roundsPerWeek * 10) / 10,
      featureBreadth,
      aiAdoption: hasAI,
      dataDepth: 0, // would compute from shot tracking data
      tenureDays,
    },
  });
}

conversionProxies.sort((a, b) => b.score - a.score);
```

**Feeds:** Conversion-intent leaderboard, "most likely to pay" top 5, tier distribution.
**Est. response:** Pure computation.

---

## Section F: Vercel Analytics Integration

### Vercel Web Analytics API

Vercel Web Analytics provides unique visitor and pageview data. The API is accessed via Vercel's REST API, not Supabase.

**API Configuration:**
```typescript
const VERCEL_API_TOKEN = process.env.VERCEL_API_TOKEN;
const VERCEL_TEAM_ID = process.env.VERCEL_TEAM_ID;
const VERCEL_PROJECT_ID = process.env.VERCEL_PROJECT_ID;

const VERCEL_ANALYTICS_BASE = 'https://vercel.com/api/web/insights';
```

**Query: Unique Visitors (Last 30 Days)**
```typescript
// Q-F1: Vercel Web Analytics -- unique visitors
async function getVercelAnalytics(period: '24h' | '7d' | '30d') {
  const url = new URL(`${VERCEL_ANALYTICS_BASE}`);
  url.searchParams.set('projectId', VERCEL_PROJECT_ID!);
  if (VERCEL_TEAM_ID) url.searchParams.set('teamId', VERCEL_TEAM_ID);

  // Time range mapping
  const timeRanges: Record<string, { from: string; to: string }> = {
    '24h': { from: daysAgo(1), to: new Date().toISOString() },
    '7d':  { from: daysAgo(7), to: new Date().toISOString() },
    '30d': { from: daysAgo(30), to: new Date().toISOString() },
  };
  const range = timeRanges[period]!;
  url.searchParams.set('from', range.from);
  url.searchParams.set('to', range.to);

  const res = await fetch(url.toString(), {
    headers: {
      Authorization: `Bearer ${VERCEL_API_TOKEN}`,
    },
    next: { revalidate: 300 }, // cache for 5 minutes
  });

  if (!res.ok) return null;
  return res.json() as Promise<{
    visitors: number;
    pageViews: number;
    topPages: { path: string; visitors: number; pageViews: number }[];
    topReferrers: { referrer: string; visitors: number }[];
    devices: { device: string; visitors: number }[];
    countries: { country: string; visitors: number }[];
  }>;
}
```

**Alternative: Vercel Analytics Data API (v1)**
```typescript
// If the above endpoint is not available, use the Vercel REST API v6:
// GET https://api.vercel.com/v1/web/insights/stats
// Required params: projectId, from, to, teamId (optional)
// Returns: { data: { visitors: number, pageViews: number, ... } }

async function getVercelVisitors(): Promise<{ visitors24h: number; visitors7d: number; visitors30d: number } | null> {
  if (!VERCEL_API_TOKEN || !VERCEL_PROJECT_ID) return null;

  try {
    const [day, week, month] = await Promise.all([
      getVercelAnalytics('24h'),
      getVercelAnalytics('7d'),
      getVercelAnalytics('30d'),
    ]);
    return {
      visitors24h: day?.visitors ?? 0,
      visitors7d: week?.visitors ?? 0,
      visitors30d: month?.visitors ?? 0,
    };
  } catch {
    return null;
  }
}
```

**Feeds:** Unique visitors card, device breakdown, top pages, referrer sources.
**Est. response:** ~200-500ms (external API call, cached 5 min).

**Important Notes:**
- The Vercel Analytics API requires a `VERCEL_API_TOKEN` (created in Vercel dashboard under Settings > Tokens).
- The exact endpoint format may vary. Check `https://vercel.com/docs/rest-api/endpoints/analytics` for the latest.
- Consider caching the Vercel response in a server-side variable or Redis to avoid rate limits (the `next.revalidate` option handles this in Next.js).
- If Vercel Web Analytics is not enabled on the project, this will return null and should be gracefully hidden in the UI.

---

## Query Batch Plan

All Supabase queries organized into parallel batches for optimal performance.

### Batch 1: Core User & Round Data (~200ms)

These are the "backbone" queries that feed most BI metrics:

```typescript
const [signupsRes, playersRes, coachesRes, allRoundsRes, usersLastSeenRes] = await Promise.all([
  // Q-A1: User signups (last 90 days)
  adminDb.from('users').select('id, role, created_at').gte('created_at', ago90d).order('created_at', { ascending: true }),
  // Q-A2a: Players with onboarding + user_id
  adminDb.from('golf_players').select('id, user_id, first_name, last_name, onboarding_completed, created_at, graduation_year'),
  // Q-A2b: Coaches with onboarding + user_id
  adminDb.from('golf_coaches').select('id, user_id, full_name, organization_id, onboarding_completed, created_at'),
  // Q-A2c: ALL rounds (core engagement data)
  adminDb.from('golf_rounds').select('id, player_id, team_id, status, round_type, created_at, total_score').order('created_at', { ascending: false }),
  // Q-B3: Users with last_seen (for login-based DAU/WAU/MAU)
  adminDb.from('users').select('id, role, last_seen').not('last_seen', 'is', null),
]);
```

### Batch 2: Feature Counts & Advanced Signals (~400ms)

```typescript
const [
  // Feature adoption counts (head:true = no row transfer)
  qualifiersAllRes, qualifiers30dRes,
  eventsAllRes, events30dRes,
  tasksAllRes, tasks30dRes,
  messagesAllRes, messages30dRes,
  documentsAllRes, documents30dRes,
  travelAllRes, travel30dRes,
  announcementsAllRes, announcements30dRes,
  // Advanced features
  coachPhilosophyRes, coachPhilosophyDetailRes,
  focusAreasRes, focusAreaPlayersRes,
  shotsCountRes, shotRoundsRes,
  roundReviewsAllRes,
  predictionsAllRes,
  insightGenAllRes,
  // Team data
  teamsRes,
  teamMembershipsRes,
  coachOrgRes,
  qualifierPlayersRes,
  // Stats cache
  playerStatsCacheRes,
] = await Promise.all([
  adminDb.from('golf_qualifiers').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_qualifiers').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_events').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_events').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_tasks').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_tasks').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_messages').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_messages').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_documents').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_documents').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_travel_itineraries').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_travel_itineraries').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_announcements').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_announcements').select('id', { count: 'exact', head: true }).gte('created_at', ago30d),
  adminDb.from('golf_coach_philosophy').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_coach_philosophy').select('coach_id'),
  adminDb.from('golf_player_focus_areas').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_player_focus_areas').select('player_id').not('player_id', 'is', null),
  adminDb.from('golf_shots').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_shots').select('round_id').limit(10000),
  adminDb.from('golf_round_reviews').select('id, published_by, round_id, created_at, golf_rounds(player_id, created_at)'),
  adminDb.from('golf_predictions').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_insight_generation_log').select('id', { count: 'exact', head: true }),
  adminDb.from('golf_teams').select('id, name, organization_id, created_at, organizations(name)'),
  adminDb.from('golf_team_members').select('player_id, team_id, status, created_at').eq('status', 'active'),
  adminDb.from('golf_coaches').select('id, user_id, organization_id'),
  adminDb.from('golf_qualifier_entries').select('player_id'),
  adminDb.from('golf_player_stats_cache').select('player_id, rounds_played, scoring_average').not('rounds_played', 'is', null),
]);
```

### Batch 3: Error & Friction Data (~120ms)

```typescript
const [errorLogsRes, adminErrorEventsRes] = await Promise.all([
  adminDb.from('error_logs').select('id, message, severity, url, user_id, created_at').gte('created_at', ago30d).order('created_at', { ascending: false }).limit(500),
  adminDb.from('admin_events').select('id, event_type, severity, title, url, created_at').in('severity', ['error', 'critical']).gte('created_at', ago30d),
]);
```

### Batch 4: Vercel Analytics (External, Async) (~300ms)

```typescript
// Run independently, don't block other batches
const vercelPromise = getVercelVisitors();
```

### Total Estimated Query Time

| Batch | Queries | Est. Time | Notes |
|-------|---------|-----------|-------|
| Batch 1 | 5 parallel | ~200ms | Core data (heaviest: allRounds) |
| Batch 2 | 28 parallel | ~400ms | Mostly head:true counts (~20ms each) |
| Batch 3 | 2 parallel | ~120ms | Error logs with limit |
| Batch 4 | 3 parallel | ~300ms | External API (cached) |
| JS Computation | -- | ~50ms | All aggregation logic |
| **Total** | **38 queries** | **~1.1s** | **Well under 3s target** |

---

## JavaScript Aggregation Patterns

### Pattern 1: Set-Based Unique Counting

```typescript
// For DAU/WAU/MAU, use Sets to deduplicate
const uniquePlayerIds = new Set(
  rounds.filter(r => r.created_at >= cutoff).map(r => r.player_id)
);
```

### Pattern 2: Map-Based Grouping

```typescript
// For per-player or per-team aggregation
const playerRoundCounts = new Map<string, number>();
for (const r of rounds) {
  playerRoundCounts.set(r.player_id, (playerRoundCounts.get(r.player_id) ?? 0) + 1);
}
```

### Pattern 3: Dual-Index Mapping (User ID <-> Player ID)

```typescript
// Critical: users table uses user.id, golf_players uses player.id
// Always build both directions
const userToPlayer = new Map<string, string>();
const playerToUser = new Map<string, string>();
for (const p of allPlayers) {
  if (p.user_id) {
    userToPlayer.set(p.user_id, p.id);
    playerToUser.set(p.id, p.user_id);
  }
}
```

### Pattern 4: Time-Window Bucketing

```typescript
// For weekly activity patterns, pre-compute player -> Set<weekKey>
const playerWeekActivity = new Map<string, Set<string>>();
for (const r of rounds) {
  if (!r.created_at) continue;
  const weekKey = getWeekKey(r.created_at);
  const set = playerWeekActivity.get(r.player_id) ?? new Set();
  set.add(weekKey);
  playerWeekActivity.set(r.player_id, set);
}
```

### Pattern 5: Funnel Construction

```typescript
// Build funnel from decreasing population counts
function buildFunnel(stages: { label: string; count: number }[]) {
  const topCount = stages[0]?.count ?? 1;
  return stages.map((stage, i) => ({
    ...stage,
    pctOfTop: Math.round((stage.count / topCount) * 100),
    conversionFromPrev: i === 0 ? 100
      : stages[i-1]!.count > 0
        ? Math.round((stage.count / stages[i-1]!.count) * 100)
        : 0,
    dropoff: i === 0 ? 0 : stages[i-1]!.count - stage.count,
    dropoffPct: i === 0 ? 0
      : stages[i-1]!.count > 0
        ? Math.round(((stages[i-1]!.count - stage.count) / stages[i-1]!.count) * 100)
        : 0,
  }));
}
```

---

## Estimated Performance Budget

| Component | Budget | Notes |
|-----------|--------|-------|
| Supabase query round-trips | 1500ms | 3 sequential batches of parallel queries |
| Vercel Analytics API | 300ms | Cached, non-blocking |
| JavaScript computation | 100ms | Maps, Sets, loops over in-memory arrays |
| Response serialization | 50ms | JSON.stringify of BI response |
| Network overhead | 50ms | Server action to client |
| **Total budget** | **2000ms** | **33% headroom under 3s target** |

### Performance Optimization Strategies

1. **`{ count: 'exact', head: true }`** -- For feature counts, only fetch the count header. Zero row transfer.
2. **Selective column projection** -- Only `select()` columns needed. Avoid `select('*')`.
3. **Reuse raw data** -- Fetch `golf_rounds` once, compute 15+ metrics from the same array.
4. **Limit clauses** -- Cap error logs at 500, shot data at 10,000.
5. **Index-aligned filters** -- Always filter on `created_at` (indexed), not computed values.
6. **No JOINs in Supabase** -- Use JS-side joins via Maps. Supabase nested selects (e.g., `golf_rounds(player_id)`) add latency.
7. **Parallel batching** -- Every independent query runs in the same `Promise.all()`.

### Scaling Considerations

As the platform grows beyond ~500 users / ~10,000 rounds:

- **Consider RPC functions** for heavy aggregations (e.g., cohort retention matrix) to move computation to Postgres.
- **Consider partial indexes** -- e.g., `CREATE INDEX ON golf_rounds(player_id, created_at) WHERE status = 'completed'`.
- **Consider server-side caching** -- Cache the full BI response for 60 seconds (matches existing auto-refresh interval).
- **Consider incremental computation** -- Only recompute metrics that changed since last refresh.

---

## Appendix: Complete BI Data Type

```typescript
export interface BIDashboardData {
  // Section A: Growth
  growth: {
    signupsByDay: { date: string; count: number }[];
    signupsByWeek: { week: string; count: number }[];
    signupsByMonth: { month: string; count: number }[];
    signupsByRole: { coach: number; player: number; admin: number; unknown: number };
    activatedPlayers: number;
    activatedCoaches: number;
    playerActivationRate: number;
    coachActivationRate: number;
    overallActivationRate: number;
    medianTTFV: number | null;          // days
    p25TTFV: number | null;
    p75TTFV: number | null;
    activationFunnel: FunnelStep[];
    userGrowthRateWoW: number;          // week-over-week %
    roundGrowthRateWoW: number;
  };

  // Section B: Retention
  retention: {
    d1: RetentionMetric;
    d7: RetentionMetric;
    d30: RetentionMetric;
    cohortMatrix: CohortRow[];
    dauRounds: number;
    wauRounds: number;
    mauRounds: number;
    dauLogins: number;
    wauLogins: number;
    mauLogins: number;
    stickinessRounds: number;           // DAU/MAU % (round-based)
    stickinessLogins: number;           // DAU/MAU % (login-based)
    coachWeeklyRetention: number;
    playerWeeklyRetention: number;
  };

  // Section C: Product Usage
  usage: {
    featureAdoption: FeatureAdoptionItem[];
    deadFeatures: string[];
    healthyFeatures: string[];
    powerUserCount: number;
    powerUserPct: number;
    regularUserCount: number;
    casualUserCount: number;
    roundsByWeek: { week: string; count: number }[];
    featureRetentionCorrelation: {
      feature: string;
      usersOfFeature: number;
      retentionWithFeature: number;
      retentionWithoutFeature: number;
      lift: number;                     // percentage point difference
    }[];
  };

  // Section D: Funnel & Friction
  funnel: {
    playerOnboarding: FunnelStep[];
    coachOnboarding: FunnelStep[];
    biggestPlayerDropoff: { from: string; to: string; dropoff: number; pct: number } | null;
    biggestCoachDropoff: { from: string; to: string; dropoff: number; pct: number } | null;
    errorsByFeatureArea: { area: string; count: number; critical: number; lastSeen: string }[];
    stuckUsers: { stage: string; count: number; users: StuckUser[] }[];
  };

  // Section E: Health & Opportunity
  health: {
    teamHealthScores: TeamHealthScore[];
    atRiskAccounts: AtRiskAccount[];
    atRiskCount: number;
    conversionProxies: ConversionProxy[];
    topConversionCandidates: ConversionProxy[];   // top 5 by score
  };

  // Section F: Vercel Analytics
  vercel: {
    visitors24h: number;
    visitors7d: number;
    visitors30d: number;
  } | null;

  // Meta
  meta: {
    queryTimeMs: number;
    computeTimeMs: number;
    totalTimeMs: number;
    queriedAt: string;
  };
}

interface RetentionMetric {
  retained: number;
  total: number;
  rate: number;
}

interface FunnelStep {
  step: string;
  count: number;
  pctOfTop: number;
  conversionFromPrev: number;
  dropoff: number;
  dropoffPct: number;
}

interface CohortRow {
  cohortWeek: string;
  cohortSize: number;
  retentionByWeek: number[];
}

interface FeatureAdoptionItem {
  feature: string;
  allTime: number;
  last30d: number;
  category: 'core' | 'team' | 'advanced';
}

interface StuckUser {
  userId: string;
  name: string;
  email: string;
  daysSinceSignup: number;
  stuckAt: string;
  lastActiveAt: string | null;
}

interface TeamHealthScore {
  teamId: string;
  teamName: string;
  orgName: string | null;
  score: number;
  grade: 'A' | 'B' | 'C' | 'D' | 'F';
  components: {
    activePlayerPct: number;
    roundsPerPlayerWeek: number;
    coachEngagement: number;
    featureAdoption: number;
  };
  playerCount: number;
  activePlayerCount: number;
  roundsThisMonth: number;
  coachLastActive: string | null;
  riskLevel: 'healthy' | 'at_risk' | 'critical';
}

interface AtRiskAccount {
  type: 'player' | 'coach' | 'team';
  id: string;
  name: string;
  teamName: string | null;
  riskScore: number;
  riskSignals: string[];
  lastActiveDate: string | null;
  daysSinceLastActive: number;
  previousActivityLevel: 'high' | 'medium' | 'low';
}

interface ConversionProxy {
  teamId: string;
  teamName: string;
  orgName: string | null;
  score: number;
  tier: 'high' | 'medium' | 'low';
  signals: {
    playerCount: number;
    activePlayerPct: number;
    roundsPerWeek: number;
    featureBreadth: number;
    aiAdoption: boolean;
    dataDepth: number;
    tenureDays: number;
  };
}
```

---

## Summary: Query-to-Metric Map

| BI Metric | Primary Query | Reuses From | JS Computation |
|-----------|---------------|-------------|----------------|
| Daily/weekly signups | Q-A1 (users) | -- | groupByDay/Week |
| Activation rate | Q-A2a,b,c | -- | Set intersection |
| Median TTFV | -- | Q-A1, Q-A2a,c | Sort + median |
| Activation funnel | -- | Q-A1, Q-A2a,b,c | Funnel builder |
| D1/D7/D30 retention | -- | Q-A1, Q-A2a,c | Date math + Set |
| Cohort matrix | -- | Q-A1, Q-A2a,c | Week bucketing |
| DAU/WAU/MAU | Q-B3 | Q-A2c | Set.size |
| Stickiness | -- | Q-A2c, Q-B3 | Division |
| Feature adoption | Q-C1 (20 counts) | -- | Sort + rank |
| Dead features | -- | Q-C1 | Threshold filter |
| Feature-retention | Q-C3a,b | Q-A2, Q-B3 | Cohort comparison |
| Power users | Q-E2a,b,c | Q-A2c | Multi-criteria |
| Onboarding funnel | Q-D1a,b | Q-A2, Q-C3a | Funnel builder |
| Error rates | Q-D3 | -- | URL mapping |
| Team health | Q-E1a,b | Q-A2c, Q-B3, Q-D1a | Weighted scoring |
| At-risk accounts | -- | All above | Risk scoring |
| Conversion proxies | -- | All above | Weighted scoring |
| Vercel visitors | Q-F1 (external) | -- | Pass-through |

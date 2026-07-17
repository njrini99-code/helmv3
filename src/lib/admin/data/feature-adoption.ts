import 'server-only';
import { createAdminClient } from '@/lib/supabase/admin';
import { fetchAllRows } from '@/lib/supabase/fetch-all-rows';
import {
  FEATURE_REGISTRY,
  type FeatureApp,
  type FeatureKey,
  type FeatureTier,
} from '@/lib/admin/feature-registry';

/**
 * Utilization tab (B1) — the ONE shared rollup query both the Adoption
 * Terrain heat grid and the Feature Constellation tiles/leaderboard read
 * from. Built once, reduced two ways, so neither view re-scans
 * `admin_events`.
 *
 * QUERY-COST DECISION (documented per the tasking brief's instruction to
 * pick and document the cheaper honest approach): a single paginated read
 * of `admin_events` over the trailing 84 days (12 weeks — the widest window
 * either view needs), reduced client(-server)-side in memory, beats a
 * per-feature/per-window loop (85 features × 2 windows = 170 grouped
 * queries) both in round-trips and in Supabase compute — this tab's whole
 * premise is "glance across all 85 features at once," so the read pattern
 * matches that shape. The 30-day view is a slice of the same 84-day pull;
 * the 12-week view re-buckets it into 7-day windows. Only
 * `feature,user_id,user_email,event_type,created_at,team_id` are selected
 * (no title/message/metadata/stack_trace) to keep row weight low across a
 * potentially large 84-day scan. Paginated via `fetchAllRows` per the
 * PostgREST 1000-row cap house rule.
 */

export interface FeatureAdoptionCell {
  /** UTC date (day view: 'YYYY-MM-DD') or week-start label (week view). */
  date: string;
  uniqueUsers: number;
  eventCount: number;
  /** Up to 3 event_type values by count, that bucket. */
  topEventTypes: string[];
}

export interface FeatureAdoptionRecentEvent {
  eventType: string;
  occurredAt: string;
  userEmail: string | null;
}

export interface FeatureAdoptionRow {
  key: FeatureKey;
  label: string;
  app: FeatureApp;
  tier: FeatureTier;
  primaryTable: string | null;
  healthSignal: string;
  knownGaps: string[];
  /** Last 30 days, oldest → newest, zero-filled for every day. */
  days30: FeatureAdoptionCell[];
  /** Last 12 weeks (7-day buckets), oldest → newest, zero-filled. */
  weeks12: FeatureAdoptionCell[];
  /** This row's OWN 30-day max unique-users cell — per-row log-scale
   *  normalization base (not a global max) per the Adoption Terrain spec. */
  rowMax30: number;
  rowMax12w: number;
  uniqueUsers30d: number;
  uniqueUsers7d: number;
  uniqueUsersPrev7d: number;
  /** null when the previous-7d window was 0 — honest, never a fabricated
   *  divide-by-zero percentage. */
  delta7dPct: number | null;
  /** Last 14 daily event counts (subset of days30) — Constellation Sparkline. */
  eventCount14d: number[];
  /** Consecutive trailing zero-unique-user days within the 30-day window. */
  quietDays: number;
  /** tier === 'high' && quietDays >= 3 — the spatial "dropout before red"
   *  signal from the Adoption Terrain spec. A deliberately simpler rule than
   *  feature-health.ts's full heartbeat/Sentry/RLS classifier (which needs a
   *  service-role-forbidden RPC + a live Sentry call) — this is a read-only
   *  visual echo of the same "quiet high-tier feature" idea, not a
   *  replacement for Feature Health's verdict. */
  dropoutRisk: boolean;
  topPowerUsers: Array<{ userId: string; userEmail: string | null; eventCount30d: number }>;
  recentEvents: FeatureAdoptionRecentEvent[];
}

export interface FeatureAdoptionUserRow {
  userId: string;
  userEmail: string | null;
  teamId: string | null;
  teamLabel: string | null;
  apps: FeatureApp[];
  /** Distinct feature keys touched in the last 30 days — the cross-highlight set. */
  featureKeys: FeatureKey[];
  breadth: number;
  depthEventCount: number;
  depthFeatureKey: FeatureKey | null;
  depthFeatureLabel: string | null;
}

export interface FeatureAdoptionReadouts {
  touchedToday: number;
  quiet14d: number;
  dropoutRiskCount: number;
}

export interface FeatureAdoptionResult {
  status: 'ok' | 'error';
  error?: string;
  generatedAt: string;
  rows: FeatureAdoptionRow[];
  /** Sorted breadth desc, then depth desc. Capped to the top 50 — a
   *  leaderboard, not a full user export. */
  users: FeatureAdoptionUserRow[];
  readouts: FeatureAdoptionReadouts;
}

const WINDOW_DAYS = 84; // 12 weeks
const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_EVENTS_CAP = 5;
const POWER_USERS_CAP = 5;
const LEADERBOARD_CAP = 50;

function utcDayStart(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
}

function dayKey(d: Date): string {
  return utcDayStart(d).toISOString().slice(0, 10);
}

function daysAgo(now: Date, n: number): Date {
  return new Date(utcDayStart(now).getTime() - n * DAY_MS);
}

function weekLabel(weekStart: Date): string {
  return weekStart.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
}

interface RawAdminEventRow {
  feature: string | null;
  user_id: string | null;
  user_email: string | null;
  event_type: string;
  created_at: string | null;
  team_id: string | null;
}

interface FeatureAccumulator {
  dayUsers: Map<string, Set<string>>;
  dayEvents: Map<string, number>;
  dayEventTypes: Map<string, Map<string, number>>;
  weekUsers: Map<number, Set<string>>;
  weekEvents: Map<number, number>;
  total30dUsers: Set<string>;
  users7d: Set<string>;
  usersPrev7d: Set<string>;
  userEventCounts30d: Map<string, number>;
  recentEvents: FeatureAdoptionRecentEvent[]; // newest-first, capped
}

function newAccumulator(): FeatureAccumulator {
  return {
    dayUsers: new Map(),
    dayEvents: new Map(),
    dayEventTypes: new Map(),
    weekUsers: new Map(),
    weekEvents: new Map(),
    total30dUsers: new Set(),
    users7d: new Set(),
    usersPrev7d: new Set(),
    userEventCounts30d: new Map(),
    recentEvents: [],
  };
}

function topN(counts: Map<string, number>, n: number): string[] {
  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, n)
    .map(([k]) => k);
}

/** CALLER must have passed requireSuperAdmin() first (page-level gate) —
 *  service-role read, same convention as every other data/*.ts module. */
export async function fetchFeatureAdoption(now: Date = new Date()): Promise<FeatureAdoptionResult> {
  const registryFeatures = FEATURE_REGISTRY.filter((def) => !def.excluded);
  const registryKeys = new Set<string>(registryFeatures.map((d) => d.key));
  const generatedAt = now.toISOString();

  const windowStart = daysAgo(now, WINDOW_DAYS - 1);
  const last30Start = daysAgo(now, 29);
  const last7Start = daysAgo(now, 6);
  const prev7Start = daysAgo(now, 13);
  const prev7End = daysAgo(now, 7); // exclusive upper bound of the prev-7d window

  let rawRows: RawAdminEventRow[];
  try {
    const admin = createAdminClient();
    rawRows = await fetchAllRows<RawAdminEventRow>(
      (from, to) =>
        admin
          .from('admin_events')
          .select('feature,user_id,user_email,event_type,created_at,team_id')
          .not('feature', 'is', null)
          .gte('created_at', windowStart.toISOString())
          .order('id', { ascending: true })
          .range(from, to),
      1000,
      { table: 'admin_events', action: 'fetchFeatureAdoption' },
    );
  } catch (err) {
    return {
      status: 'error',
      error: err instanceof Error ? err.message : 'Unknown error fetching admin_events',
      generatedAt,
      rows: [],
      users: [],
      readouts: { touchedToday: 0, quiet14d: 0, dropoutRiskCount: 0 },
    };
  }

  // Team-name lookups for the Power Users leaderboard's team label. Small,
  // bounded tables — paginated all the same for consistency with the house
  // pagination rule.
  let teamNameById: Map<string, string>;
  try {
    const admin = createAdminClient();
    const [golfTeams, baseballTeams] = await Promise.all([
      fetchAllRows<{ id: string; name: string | null }>(
        (from, to) => admin.from('golf_teams').select('id,name').order('id', { ascending: true }).range(from, to),
        1000,
        { table: 'golf_teams', action: 'fetchFeatureAdoption' },
      ),
      fetchAllRows<{ id: string; name: string | null }>(
        (from, to) => admin.from('baseball_teams').select('id,name').order('id', { ascending: true }).range(from, to),
        1000,
        { table: 'baseball_teams', action: 'fetchFeatureAdoption' },
      ),
    ]);
    teamNameById = new Map();
    for (const t of [...golfTeams, ...baseballTeams]) {
      if (t.name) teamNameById.set(t.id, t.name);
    }
  } catch {
    // Team labels are a courtesy annotation, not the core signal — a lookup
    // failure degrades to null labels (rendered as "—") rather than failing
    // the whole tab.
    teamNameById = new Map();
  }

  const featureByKey = new Map(registryFeatures.map((d) => [d.key, d]));
  const accByFeature = new Map<FeatureKey, FeatureAccumulator>();
  const userAgg = new Map<
    string,
    { email: string | null; teamId: string | null; features: Map<FeatureKey, number>; apps: Set<FeatureApp> }
  >();

  for (const row of rawRows) {
    if (!row.feature || !registryKeys.has(row.feature) || !row.created_at) continue;
    const featureKey = row.feature as FeatureKey;
    const def = featureByKey.get(featureKey);
    if (!def) continue;
    const createdAt = new Date(row.created_at);
    const dKey = dayKey(createdAt);
    const inLast30 = createdAt.getTime() >= last30Start.getTime();
    const inLast7 = createdAt.getTime() >= last7Start.getTime();
    const inPrev7 = createdAt.getTime() >= prev7Start.getTime() && createdAt.getTime() < prev7End.getTime();
    const weekIndex = Math.min(
      11,
      Math.max(0, Math.floor((utcDayStart(createdAt).getTime() - windowStart.getTime()) / (7 * DAY_MS))),
    );

    let acc = accByFeature.get(featureKey);
    if (!acc) {
      acc = newAccumulator();
      accByFeature.set(featureKey, acc);
    }

    acc.dayEvents.set(dKey, (acc.dayEvents.get(dKey) ?? 0) + 1);
    if (row.user_id) {
      if (!acc.dayUsers.has(dKey)) acc.dayUsers.set(dKey, new Set());
      acc.dayUsers.get(dKey)?.add(row.user_id);
    }
    let etCounts = acc.dayEventTypes.get(dKey);
    if (!etCounts) {
      etCounts = new Map();
      acc.dayEventTypes.set(dKey, etCounts);
    }
    etCounts.set(row.event_type, (etCounts.get(row.event_type) ?? 0) + 1);

    acc.weekEvents.set(weekIndex, (acc.weekEvents.get(weekIndex) ?? 0) + 1);
    if (row.user_id) {
      if (!acc.weekUsers.has(weekIndex)) acc.weekUsers.set(weekIndex, new Set());
      acc.weekUsers.get(weekIndex)?.add(row.user_id);
    }

    if (row.user_id && inLast30) {
      acc.total30dUsers.add(row.user_id);
      acc.userEventCounts30d.set(row.user_id, (acc.userEventCounts30d.get(row.user_id) ?? 0) + 1);

      let u = userAgg.get(row.user_id);
      if (!u) {
        u = { email: row.user_email, teamId: row.team_id, features: new Map(), apps: new Set() };
        userAgg.set(row.user_id, u);
      }
      // Ascending-id iteration → last write wins → "most recently seen"
      // email/team, which is the more useful value for a live leaderboard.
      if (row.user_email) u.email = row.user_email;
      if (row.team_id) u.teamId = row.team_id;
      u.apps.add(def.app);
      u.features.set(featureKey, (u.features.get(featureKey) ?? 0) + 1);
    }
    if (row.user_id && inLast7) acc.users7d.add(row.user_id);
    if (row.user_id && inPrev7) acc.usersPrev7d.add(row.user_id);

    acc.recentEvents.push({ eventType: row.event_type, occurredAt: row.created_at, userEmail: row.user_email });
    if (acc.recentEvents.length > RECENT_EVENTS_CAP) acc.recentEvents.shift();
  }

  const todayKey = dayKey(now);
  const rows: FeatureAdoptionRow[] = registryFeatures.map((def) => {
    const acc = accByFeature.get(def.key) ?? newAccumulator();

    const days30: FeatureAdoptionCell[] = [];
    for (let i = 29; i >= 0; i -= 1) {
      const d = daysAgo(now, i);
      const k = dayKey(d);
      days30.push({
        date: k,
        uniqueUsers: acc.dayUsers.get(k)?.size ?? 0,
        eventCount: acc.dayEvents.get(k) ?? 0,
        topEventTypes: topN(acc.dayEventTypes.get(k) ?? new Map(), 3),
      });
    }

    const weeks12: FeatureAdoptionCell[] = [];
    for (let w = 0; w <= 11; w += 1) {
      const weekStart = new Date(windowStart.getTime() + w * 7 * DAY_MS);
      weeks12.push({
        date: weekLabel(weekStart),
        uniqueUsers: acc.weekUsers.get(w)?.size ?? 0,
        eventCount: acc.weekEvents.get(w) ?? 0,
        topEventTypes: [],
      });
    }

    const rowMax30 = days30.reduce((m, c) => Math.max(m, c.uniqueUsers), 0);
    const rowMax12w = weeks12.reduce((m, c) => Math.max(m, c.uniqueUsers), 0);

    let quietDays = 0;
    for (let i = days30.length - 1; i >= 0; i -= 1) {
      if (days30[i]?.uniqueUsers === 0) quietDays += 1;
      else break;
    }

    const uniqueUsers7d = acc.users7d.size;
    const uniqueUsersPrev7d = acc.usersPrev7d.size;
    const delta7dPct =
      uniqueUsersPrev7d === 0 ? null : Math.round(((uniqueUsers7d - uniqueUsersPrev7d) / uniqueUsersPrev7d) * 100);

    const topPowerUsers = Array.from(acc.userEventCounts30d.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, POWER_USERS_CAP)
      .map(([userId, eventCount30d]) => ({
        userId,
        userEmail: userAgg.get(userId)?.email ?? null,
        eventCount30d,
      }));

    return {
      key: def.key,
      label: def.label,
      app: def.app,
      tier: def.tier,
      primaryTable: def.primaryTable,
      healthSignal: def.healthSignal,
      knownGaps: def.knownGaps ?? [],
      days30,
      weeks12,
      rowMax30,
      rowMax12w,
      uniqueUsers30d: acc.total30dUsers.size,
      uniqueUsers7d,
      uniqueUsersPrev7d,
      delta7dPct,
      eventCount14d: days30.slice(-14).map((c) => c.eventCount),
      quietDays,
      dropoutRisk: def.tier === 'high' && quietDays >= 3,
      topPowerUsers,
      recentEvents: [...acc.recentEvents].reverse(),
    };
  });

  // TIER_ORDER keeps app-band grouping stable even though FEATURE_REGISTRY
  // already emits golfhelm→coachhelm→baseballhelm in file order — this
  // guards the heat grid's band dividers against silent reordering if the
  // registry is ever edited without re-checking sort order.
  const APP_ORDER: Record<FeatureApp, number> = { golfhelm: 0, coachhelm: 1, baseballhelm: 2 };
  const TIER_ORDER: Record<FeatureTier, number> = { high: 0, med: 1, low: 2 };
  rows.sort((a, b) => APP_ORDER[a.app] - APP_ORDER[b.app] || TIER_ORDER[a.tier] - TIER_ORDER[b.tier]);

  const users: FeatureAdoptionUserRow[] = Array.from(userAgg.entries())
    .map(([userId, u]) => {
      let depthFeatureKey: FeatureKey | null = null;
      let depthEventCount = 0;
      for (const [fk, count] of u.features.entries()) {
        if (count > depthEventCount) {
          depthEventCount = count;
          depthFeatureKey = fk;
        }
      }
      return {
        userId,
        userEmail: u.email,
        teamId: u.teamId,
        teamLabel: u.teamId ? (teamNameById.get(u.teamId) ?? null) : null,
        apps: Array.from(u.apps),
        featureKeys: Array.from(u.features.keys()),
        breadth: u.features.size,
        depthEventCount,
        depthFeatureKey,
        depthFeatureLabel: depthFeatureKey ? (featureByKey.get(depthFeatureKey)?.label ?? null) : null,
      };
    })
    .sort((a, b) => b.breadth - a.breadth || b.depthEventCount - a.depthEventCount)
    .slice(0, LEADERBOARD_CAP);

  const readouts: FeatureAdoptionReadouts = {
    touchedToday: rows.filter((r) => (r.days30.at(-1)?.uniqueUsers ?? 0) > 0 && r.days30.at(-1)?.date === todayKey)
      .length,
    quiet14d: rows.filter((r) => r.quietDays >= 14).length,
    dropoutRiskCount: rows.filter((r) => r.dropoutRisk).length,
  };

  return { status: 'ok', generatedAt, rows, users, readouts };
}

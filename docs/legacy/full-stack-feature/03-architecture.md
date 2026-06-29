# Business Intelligence Dashboard -- Complete Architecture

> Full-stack architecture for replacing the admin Growth tab with a 5-section
> Business Intelligence tab, plus reorganization of the other 4 admin tabs.

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Backend Architecture](#2-backend-architecture)
   - 2.1 Data Type Extensions
   - 2.2 Server Action Changes
   - 2.3 Vercel API Integration
   - 2.4 Data Transformation Layer
3. [Frontend Architecture](#3-frontend-architecture)
   - 3.1 Component Hierarchy
   - 3.2 State Management
   - 3.3 Sub-Tab Navigation
   - 3.4 Chart Strategy
   - 3.5 Admin Tab Reorganization
4. [Cross-Cutting Concerns](#4-cross-cutting-concerns)
   - 4.1 Loading States
   - 4.2 Error Handling
   - 4.3 Responsive Design
   - 4.4 Performance

---

## 1. Executive Summary

The current `GrowthTab` (`src/app/golf/admin/components/GrowthTab.tsx`) is a
single-panel view that mixes growth, engagement, retention, session analytics,
and AI ROI metrics. The redesign decomposes this into a **Business Intelligence
tab** with 5 focused sections:

| Section | Name | Primary Question |
|---------|------|------------------|
| A | Growth | Are we acquiring and activating users effectively? |
| B | Retention | Do users come back? |
| C | Product Usage | Which features are they using (or not)? |
| D | Funnel & Friction | Where do users drop off? |
| E | Health & Opportunity | Which teams/users need attention or represent upsell? |

The other 4 admin tabs (Overview, People, System, Tracer) are also reorganized
to eliminate duplication and cross-reference the BI framework.

---

## 2. Backend Architecture

### 2.1 Data Type Extensions

The existing `AdminDashboardData` interface
(`src/app/golf/actions/admin-data.ts`, line 10) is extended with a single new
top-level key `bi` that contains all BI-specific computed metrics. This avoids
polluting the 40+ existing top-level keys and keeps the BI data self-contained.

```typescript
// --- File: src/app/golf/actions/admin-data.ts ---
// Add inside the AdminDashboardData interface (after line ~512)

  /** Business Intelligence computed metrics */
  bi: {
    // ===== Section A: Growth =====
    growth: {
      /** Total signups all-time */
      totalSignups: number;
      /** Signups in the last 7 / 30 days */
      signups7d: number;
      signups30d: number;
      /** Signups by day (last 30d, for trend sparkline) */
      signupsByDay: { date: string; count: number }[];
      /** Activated = completed onboarding + submitted >= 1 round */
      activatedUsers: number;
      /** activatedUsers / totalSignups * 100 */
      activationRate: number;
      /** Median hours from signup to first round submission (null = no data) */
      medianTimeToValueHours: number | null;
      /** Users who signed up in last 30d but never completed onboarding */
      dropOffBeforeOnboarding: number;
      /** Users who completed onboarding but never submitted a round */
      dropOffBeforeFirstRound: number;
      /** Week-over-week growth rate (%) */
      wowGrowthRate: number;
    };

    // ===== Section B: Retention =====
    retention: {
      /** Day-1, Day-7, Day-30 retention rates (% of users active N days after signup) */
      d1Retention: number;
      d7Retention: number;
      d30Retention: number;
      /** 8-week cohort matrix (re-uses existing cohortMatrix shape, but guaranteed 8 rows) */
      cohortMatrix: {
        cohortWeek: string;
        cohortSize: number;
        retentionByWeek: number[];
      }[];
      /** DAU/WAU/MAU stickiness */
      stickiness: {
        dau: number;
        wau: number;
        mau: number;
        dauWauRatio: number;
        dauMauRatio: number;
        wauMauRatio: number;
      };
      /** Trend of DAU/MAU ratio over the last 4 weeks */
      stickinessTrend: { week: string; dauMauRatio: number }[];
    };

    // ===== Section C: Product Usage =====
    productUsage: {
      /** Feature adoption: name, total uses, unique users, % of active users */
      features: {
        featureName: string;
        totalUses: number;
        uniqueUsers: number;
        adoptionPct: number;
      }[];
      /** Repeat usage: features used 2+ times by the same user, with repeat rate */
      repeatUsage: {
        featureName: string;
        repeatRate: number;
        avgUsesPerUser: number;
      }[];
      /** Dead features: < 5% adoption in last 30d */
      deadFeatures: string[];
      /** Object creation counts (rounds, reviews, insights, tasks, events, messages) */
      objectCreation: {
        objectType: string;
        count7d: number;
        count30d: number;
        trend: number; // % change week-over-week
      }[];
      /** Page views from analytics_events, top 15 */
      topPages: {
        pagePath: string;
        viewCount: number;
        uniqueUsers: number;
      }[];
      /** Session stats */
      sessionStats: {
        avgPagesPerSession: number;
        avgSessionDurationMin: number;
        totalSessions7d: number;
      };
    };

    // ===== Section D: Funnel & Friction =====
    funnelFriction: {
      /** Onboarding funnel: signup -> profile -> team join -> first round */
      onboardingFunnel: {
        stage: string;
        count: number;
        percentage: number;
        dropoffFromPrevious: number;
        dropoffPct: number;
      }[];
      /** Users stuck at each onboarding stage (with contact info) */
      stuckUsers: {
        stage: string;
        users: {
          id: string;
          name: string;
          email: string;
          daysSinceSignup: number;
          lastActiveAt: string | null;
        }[];
      }[];
      /** Round completion funnel */
      roundFunnel: {
        roundsStarted: number;
        roundsCompleted: number;
        roundsScored: number;
        roundsReviewed: number;
        roundsWithInsights: number;
      };
      /** Error rates by page/route (from admin_events, last 7d) */
      errorRatesByRoute: {
        route: string;
        errorCount: number;
        totalVisits: number;
        errorRate: number;
      }[];
      /** Top client errors that block user flows */
      topBlockingErrors: {
        message: string;
        occurrences: number;
        affectedUsers: number;
        lastSeen: string;
      }[];
    };

    // ===== Section E: Health & Opportunity =====
    healthOpportunity: {
      /** Per-team health scores */
      teamScores: {
        teamId: string;
        teamName: string;
        playerCount: number;
        activeCount: number;
        healthScore: number; // 0-100
        healthStatus: 'healthy' | 'warning' | 'critical';
        avgRoundsPerPlayer: number;
        lastTeamActivity: string | null;
        coachEngagementScore: number; // 0-100
      }[];
      /** Power users: top 10 by activity */
      powerUsers: {
        userId: string;
        name: string;
        email: string;
        teamName: string | null;
        totalRounds: number;
        roundsLast30d: number;
        insightsViewed: number;
        featuresUsed: number;
        lastActiveAt: string | null;
      }[];
      /** At-risk users: active in past but inactive 14d+ */
      atRiskUsers: {
        userId: string;
        name: string;
        email: string;
        teamName: string | null;
        daysSinceLastActivity: number;
        totalRounds: number;
        lastActiveAt: string | null;
      }[];
      /** Conversion proxies: engagement signals that predict retention */
      conversionProxies: {
        signal: string;
        description: string;
        usersWithSignal: number;
        retentionRate: number;
        usersWithoutSignal: number;
        retentionRateWithout: number;
        lift: number; // % lift in retention
      }[];
      /** Coach engagement ranking */
      coachEngagement: {
        coachId: string;
        coachName: string;
        teamName: string | null;
        roundsReviewed: number;
        insightsViewed: number;
        philosophyConfigured: boolean;
        lastActiveAt: string | null;
        engagementTier: 'power' | 'active' | 'passive' | 'dormant';
      }[];
    };

    // ===== Vercel Web Analytics =====
    vercelAnalytics: {
      /** Unique visitors (Vercel definition) for the last 7d and 30d */
      visitors7d: number | null;
      visitors30d: number | null;
      /** Page views from Vercel for the last 7d and 30d */
      pageViews7d: number | null;
      pageViews30d: number | null;
      /** Top pages by visits from Vercel */
      topPages: { page: string; visitors: number; pageViews: number }[];
      /** Top referrers from Vercel */
      topReferrers: { referrer: string; visitors: number }[];
      /** Device breakdown from Vercel */
      devices: { device: string; visitors: number }[];
      /** Country breakdown from Vercel (top 10) */
      countries: { country: string; visitors: number }[];
      /** Whether the Vercel API call succeeded */
      available: boolean;
      /** Error message if Vercel API failed */
      error?: string;
    };
  };
```

### 2.2 Server Action Changes

The single `getAdminDashboardData()` function in
`src/app/golf/actions/admin-data.ts` (line 597) is extended with **two new
parallel batches** after the existing Batch 5.

#### Batch 6: BI Growth + Retention + Funnel Queries

```typescript
// ============================================
// BATCH 6: BI — Growth, Retention, Funnel (parallel)
// ============================================
const [
  // Growth
  biSignups7dRes,
  biSignups30dRes,
  biActivatedRes,             // users with onboarding_completed AND >= 1 round
  biTimeToValueRes,           // RPC: median hours from created_at to first round
  biDropOffOnboardingRes,     // signups (30d) where onboarding_completed = false
  biDropOffFirstRoundRes,     // onboarded (30d) with 0 rounds

  // Retention
  biD1RetentionRes,           // % active within 1 day of signup
  biD7RetentionRes,           // % active within 7 days of signup
  biD30RetentionRes,          // % active within 30 days of signup
  biStickinessTrendRes,       // Weekly DAU/MAU snapshots (4 weeks)

  // Product Usage
  biFeatureAdoptionRes,       // analytics_events grouped by feature_name
  biRepeatUsageRes,           // analytics_events: feature_name, user_id having count > 1
  biObjectCreation7dRes,      // round, review, insight, task, event, message counts (7d)
  biObjectCreation30dRes,     // same for 30d

  // Funnel
  biErrorRatesByRouteRes,     // admin_events grouped by url, error vs non-error

  // Health
  biPowerUsersRes,            // top 10 users by rounds + feature breadth
  biAtRiskUsersRes,           // active in past, inactive 14d+

  // Conversion proxies
  biProxyPhilosophyRes,       // users whose coach has philosophy => retention?
  biProxyAIInsightsRes,       // users who viewed AI insights => retention?
] = await Promise.all([
  // Growth
  adminDb.from('users').select('id', { count: 'exact', head: true })
    .gte('created_at', ago7d),

  adminDb.from('users').select('id', { count: 'exact', head: true })
    .gte('created_at', ago30d),

  adminDb.rpc('bi_activated_users'),         // new SQL function (see below)

  adminDb.rpc('bi_median_time_to_value'),    // new SQL function

  adminDb.from('users').select('id', { count: 'exact', head: true })
    .gte('created_at', ago30d)
    .or('role.eq.golf_player,role.eq.golf_coach')
    .not('id', 'in', '(select user_id from golf_players where onboarding_completed = true)')
    .limit(0),  // We only need count

  // ... similar patterns for each query

  // Retention D1/D7/D30
  adminDb.rpc('bi_retention_rate', { days_n: 1 }),
  adminDb.rpc('bi_retention_rate', { days_n: 7 }),
  adminDb.rpc('bi_retention_rate', { days_n: 30 }),
  adminDb.rpc('bi_stickiness_trend', { weeks_back: 4 }),

  // Product usage
  adminDb.rpc('bi_feature_adoption', { since: ago30d }),
  adminDb.rpc('bi_repeat_usage', { since: ago30d }),
  adminDb.rpc('bi_object_creation', { since: ago7d }),
  adminDb.rpc('bi_object_creation', { since: ago30d }),

  // Funnel
  adminDb.rpc('bi_error_rates_by_route', { since: ago7d }),

  // Health
  adminDb.rpc('bi_power_users', { limit_n: 10 }),
  adminDb.rpc('bi_at_risk_users', { inactive_days: 14 }),

  // Conversion proxies
  adminDb.rpc('bi_proxy_philosophy_retention'),
  adminDb.rpc('bi_proxy_ai_insights_retention'),
]);
```

#### Required Supabase SQL Functions (new migration)

```sql
-- File: supabase/migrations/YYYYMMDD_bi_functions.sql

-- Activated users: completed onboarding AND submitted >= 1 round
CREATE OR REPLACE FUNCTION bi_activated_users()
RETURNS integer AS $$
  SELECT count(DISTINCT u.id)::integer
  FROM users u
  JOIN golf_players gp ON gp.user_id = u.id AND gp.onboarding_completed = true
  JOIN golf_rounds gr ON gr.player_id = gp.id AND gr.status = 'completed'
$$ LANGUAGE sql STABLE;

-- Median time to value (hours from signup to first round)
CREATE OR REPLACE FUNCTION bi_median_time_to_value()
RETURNS numeric AS $$
  SELECT percentile_cont(0.5) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (gr.created_at - u.created_at)) / 3600
  )
  FROM users u
  JOIN golf_players gp ON gp.user_id = u.id
  JOIN LATERAL (
    SELECT created_at FROM golf_rounds
    WHERE player_id = gp.id AND status = 'completed'
    ORDER BY created_at LIMIT 1
  ) gr ON true
$$ LANGUAGE sql STABLE;

-- D-N retention rate
CREATE OR REPLACE FUNCTION bi_retention_rate(days_n integer)
RETURNS numeric AS $$
  WITH signups AS (
    SELECT id, created_at
    FROM users
    WHERE created_at <= now() - make_interval(days => days_n)
      AND role IN ('golf_player', 'golf_coach')
  ),
  active AS (
    SELECT DISTINCT s.id
    FROM signups s
    JOIN golf_players gp ON gp.user_id = s.id
    JOIN golf_rounds gr ON gr.player_id = gp.id
    WHERE gr.created_at >= s.created_at + make_interval(days => days_n)
      AND gr.created_at < s.created_at + make_interval(days => days_n + 1)
  )
  SELECT CASE WHEN (SELECT count(*) FROM signups) = 0 THEN 0
    ELSE round((SELECT count(*) FROM active)::numeric /
               (SELECT count(*) FROM signups) * 100, 1) END
$$ LANGUAGE sql STABLE;

-- Weekly DAU/MAU stickiness trend
CREATE OR REPLACE FUNCTION bi_stickiness_trend(weeks_back integer)
RETURNS TABLE(week text, dau_mau_ratio numeric) AS $$
  SELECT
    date_trunc('week', d)::date::text AS week,
    round(
      count(DISTINCT CASE WHEN gr.created_at::date = d THEN gr.player_id END)::numeric /
      NULLIF(count(DISTINCT gr.player_id), 0) * 100, 1
    ) AS dau_mau_ratio
  FROM generate_series(
    now() - make_interval(weeks => weeks_back),
    now(),
    '1 week'::interval
  ) d
  LEFT JOIN golf_rounds gr ON gr.created_at >= d - interval '30 days' AND gr.created_at < d + interval '1 day'
  GROUP BY 1 ORDER BY 1
$$ LANGUAGE sql STABLE;

-- Feature adoption (from admin_analytics_events)
CREATE OR REPLACE FUNCTION bi_feature_adoption(since timestamptz)
RETURNS TABLE(feature_name text, total_uses bigint, unique_users bigint, adoption_pct numeric) AS $$
  WITH total_active AS (
    SELECT count(DISTINCT user_id) AS cnt
    FROM admin_analytics_events
    WHERE created_at >= since AND user_id IS NOT NULL
  )
  SELECT
    aae.feature_name,
    count(*) AS total_uses,
    count(DISTINCT aae.user_id) AS unique_users,
    round(count(DISTINCT aae.user_id)::numeric / NULLIF((SELECT cnt FROM total_active), 0) * 100, 1) AS adoption_pct
  FROM admin_analytics_events aae
  WHERE aae.created_at >= since
    AND aae.feature_name IS NOT NULL
    AND aae.event_type = 'feature_use'
  GROUP BY 1
  ORDER BY total_uses DESC
$$ LANGUAGE sql STABLE;

-- Repeat usage
CREATE OR REPLACE FUNCTION bi_repeat_usage(since timestamptz)
RETURNS TABLE(feature_name text, repeat_rate numeric, avg_uses_per_user numeric) AS $$
  WITH per_user AS (
    SELECT feature_name, user_id, count(*) AS uses
    FROM admin_analytics_events
    WHERE created_at >= since AND feature_name IS NOT NULL AND user_id IS NOT NULL
    GROUP BY 1, 2
  )
  SELECT
    feature_name,
    round(count(*) FILTER (WHERE uses >= 2)::numeric / NULLIF(count(*), 0) * 100, 1) AS repeat_rate,
    round(avg(uses), 1) AS avg_uses_per_user
  FROM per_user
  GROUP BY 1
  ORDER BY repeat_rate DESC
$$ LANGUAGE sql STABLE;

-- Object creation counts
CREATE OR REPLACE FUNCTION bi_object_creation(since timestamptz)
RETURNS TABLE(object_type text, cnt bigint) AS $$
  SELECT 'rounds'::text, count(*) FROM golf_rounds WHERE created_at >= since
  UNION ALL
  SELECT 'reviews', count(*) FROM golf_round_reviews WHERE created_at >= since
  UNION ALL
  SELECT 'insights', count(*) FROM golf_coach_insights WHERE created_at >= since
  UNION ALL
  SELECT 'tasks', count(*) FROM golf_tasks WHERE created_at >= since
  UNION ALL
  SELECT 'events', count(*) FROM golf_events WHERE created_at >= since
  UNION ALL
  SELECT 'messages', count(*) FROM golf_messages WHERE created_at >= since
$$ LANGUAGE sql STABLE;

-- Error rates by route
CREATE OR REPLACE FUNCTION bi_error_rates_by_route(since timestamptz)
RETURNS TABLE(route text, error_count bigint, total_visits bigint, error_rate numeric) AS $$
  SELECT
    coalesce(url, 'unknown') AS route,
    count(*) FILTER (WHERE severity IN ('error', 'critical')) AS error_count,
    count(*) AS total_visits,
    round(count(*) FILTER (WHERE severity IN ('error', 'critical'))::numeric / NULLIF(count(*), 0) * 100, 2)
  FROM admin_events
  WHERE created_at >= since AND url IS NOT NULL
  GROUP BY 1
  HAVING count(*) >= 5
  ORDER BY error_rate DESC
  LIMIT 20
$$ LANGUAGE sql STABLE;

-- Power users
CREATE OR REPLACE FUNCTION bi_power_users(limit_n integer DEFAULT 10)
RETURNS TABLE(
  user_id uuid, name text, email text, team_name text,
  total_rounds bigint, rounds_last_30d bigint, insights_viewed bigint,
  features_used bigint, last_active_at timestamptz
) AS $$
  SELECT
    u.id,
    coalesce(gp.first_name || ' ' || gp.last_name, u.email) AS name,
    u.email,
    gt.name AS team_name,
    count(DISTINCT gr.id) AS total_rounds,
    count(DISTINCT gr.id) FILTER (WHERE gr.created_at >= now() - interval '30 days') AS rounds_last_30d,
    count(DISTINCT grr.id) AS insights_viewed,
    count(DISTINCT aae.feature_name) AS features_used,
    max(gr.created_at) AS last_active_at
  FROM users u
  JOIN golf_players gp ON gp.user_id = u.id
  LEFT JOIN golf_team_members gtm ON gtm.player_id = gp.id
  LEFT JOIN golf_teams gt ON gt.id = gtm.team_id
  LEFT JOIN golf_rounds gr ON gr.player_id = gp.id
  LEFT JOIN golf_round_reviews grr ON grr.round_id = gr.id
  LEFT JOIN admin_analytics_events aae ON aae.user_id = u.id::text
  GROUP BY u.id, name, u.email, gt.name
  ORDER BY total_rounds DESC, rounds_last_30d DESC
  LIMIT limit_n
$$ LANGUAGE sql STABLE;

-- At-risk users
CREATE OR REPLACE FUNCTION bi_at_risk_users(inactive_days integer DEFAULT 14)
RETURNS TABLE(
  user_id uuid, name text, email text, team_name text,
  days_since_last_activity integer, total_rounds bigint, last_active_at timestamptz
) AS $$
  WITH user_activity AS (
    SELECT
      u.id,
      coalesce(gp.first_name || ' ' || gp.last_name, u.email) AS name,
      u.email,
      gt.name AS team_name,
      count(gr.id) AS total_rounds,
      max(gr.created_at) AS last_active_at
    FROM users u
    JOIN golf_players gp ON gp.user_id = u.id
    LEFT JOIN golf_team_members gtm ON gtm.player_id = gp.id
    LEFT JOIN golf_teams gt ON gt.id = gtm.team_id
    LEFT JOIN golf_rounds gr ON gr.player_id = gp.id
    GROUP BY u.id, name, u.email, gt.name
  )
  SELECT
    id, name, email, team_name,
    EXTRACT(days FROM now() - last_active_at)::integer,
    total_rounds,
    last_active_at
  FROM user_activity
  WHERE last_active_at IS NOT NULL
    AND last_active_at < now() - make_interval(days => inactive_days)
    AND total_rounds >= 2  -- must have been active before
  ORDER BY last_active_at ASC
  LIMIT 50
$$ LANGUAGE sql STABLE;

-- Conversion proxy: philosophy retention
CREATE OR REPLACE FUNCTION bi_proxy_philosophy_retention()
RETURNS TABLE(
  signal text, description text,
  users_with_signal bigint, retention_rate numeric,
  users_without_signal bigint, retention_rate_without numeric,
  lift numeric
) AS $$
  WITH philosophy_coaches AS (
    SELECT coach_id FROM golf_coach_philosophy WHERE philosophy IS NOT NULL
  ),
  players_with_ai AS (
    SELECT DISTINCT gp.user_id
    FROM golf_players gp
    JOIN golf_team_members gtm ON gtm.player_id = gp.id
    JOIN golf_coaches gc ON gc.team_id = gtm.team_id
    WHERE gc.id IN (SELECT coach_id FROM philosophy_coaches)
  ),
  retention AS (
    SELECT
      u.id,
      CASE WHEN u.id IN (SELECT user_id FROM players_with_ai) THEN true ELSE false END AS has_signal,
      CASE WHEN EXISTS (
        SELECT 1 FROM golf_rounds gr
        JOIN golf_players gp2 ON gp2.id = gr.player_id AND gp2.user_id = u.id
        WHERE gr.created_at >= now() - interval '7 days'
      ) THEN true ELSE false END AS retained_7d
    FROM users u WHERE u.role = 'golf_player'
  )
  SELECT
    'coach_philosophy'::text,
    'Coach has configured AI philosophy'::text,
    count(*) FILTER (WHERE has_signal),
    round(count(*) FILTER (WHERE has_signal AND retained_7d)::numeric /
          NULLIF(count(*) FILTER (WHERE has_signal), 0) * 100, 1),
    count(*) FILTER (WHERE NOT has_signal),
    round(count(*) FILTER (WHERE NOT has_signal AND retained_7d)::numeric /
          NULLIF(count(*) FILTER (WHERE NOT has_signal), 0) * 100, 1),
    round(
      (count(*) FILTER (WHERE has_signal AND retained_7d)::numeric /
       NULLIF(count(*) FILTER (WHERE has_signal), 0) -
       count(*) FILTER (WHERE NOT has_signal AND retained_7d)::numeric /
       NULLIF(count(*) FILTER (WHERE NOT has_signal), 0)) * 100, 1
    )
  FROM retention
$$ LANGUAGE sql STABLE;
```

#### Batch 7: Vercel Web Analytics (see 2.3)

```typescript
// ============================================
// BATCH 7: Vercel Web Analytics (parallel with Batch 6)
// ============================================
const vercelAnalytics = await fetchVercelAnalytics();
```

### 2.3 Vercel API Integration

A dedicated helper function fetches data from the Vercel Web Analytics REST API.
This runs server-side only inside the `getAdminDashboardData` action.

```typescript
// --- File: src/app/golf/actions/admin-data.ts (add before getAdminDashboardData) ---

interface VercelAnalyticsResult {
  visitors7d: number | null;
  visitors30d: number | null;
  pageViews7d: number | null;
  pageViews30d: number | null;
  topPages: { page: string; visitors: number; pageViews: number }[];
  topReferrers: { referrer: string; visitors: number }[];
  devices: { device: string; visitors: number }[];
  countries: { country: string; visitors: number }[];
  available: boolean;
  error?: string;
}

async function fetchVercelAnalytics(): Promise<VercelAnalyticsResult> {
  const token = process.env.VERCEL_API_TOKEN;
  const projectId = process.env.VERCEL_PROJECT_ID;
  const teamId = process.env.VERCEL_TEAM_ID;

  const empty: VercelAnalyticsResult = {
    visitors7d: null, visitors30d: null,
    pageViews7d: null, pageViews30d: null,
    topPages: [], topReferrers: [], devices: [], countries: [],
    available: false,
  };

  if (!token || !projectId) {
    return { ...empty, error: 'VERCEL_API_TOKEN or VERCEL_PROJECT_ID not configured' };
  }

  const baseUrl = 'https://vercel.com/api/web/insights';
  const teamParam = teamId ? `&teamId=${teamId}` : '';

  // All requests in parallel
  const now = new Date();
  const ago7d = new Date(now.getTime() - 7 * 86400000).toISOString();
  const ago30d = new Date(now.getTime() - 30 * 86400000).toISOString();

  const headers = { Authorization: `Bearer ${token}` };

  try {
    const [
      stats7dRes,
      stats30dRes,
      topPagesRes,
      referrersRes,
      devicesRes,
      countriesRes,
    ] = await Promise.all([
      fetch(`${baseUrl}/stats?projectId=${projectId}&from=${ago7d}&to=${now.toISOString()}${teamParam}`, {
        headers, next: { revalidate: 900 } // cache 15 min
      }),
      fetch(`${baseUrl}/stats?projectId=${projectId}&from=${ago30d}&to=${now.toISOString()}${teamParam}`, {
        headers, next: { revalidate: 900 }
      }),
      fetch(`${baseUrl}/pages?projectId=${projectId}&from=${ago30d}&to=${now.toISOString()}&limit=15${teamParam}`, {
        headers, next: { revalidate: 900 }
      }),
      fetch(`${baseUrl}/referrers?projectId=${projectId}&from=${ago30d}&to=${now.toISOString()}&limit=10${teamParam}`, {
        headers, next: { revalidate: 900 }
      }),
      fetch(`${baseUrl}/devices?projectId=${projectId}&from=${ago30d}&to=${now.toISOString()}${teamParam}`, {
        headers, next: { revalidate: 900 }
      }),
      fetch(`${baseUrl}/countries?projectId=${projectId}&from=${ago30d}&to=${now.toISOString()}&limit=10${teamParam}`, {
        headers, next: { revalidate: 900 }
      }),
    ]);

    // Parse all responses
    const [stats7d, stats30d, topPages, referrers, devices, countries] = await Promise.all([
      stats7dRes.ok ? stats7dRes.json() : null,
      stats30dRes.ok ? stats30dRes.json() : null,
      topPagesRes.ok ? topPagesRes.json() : null,
      referrersRes.ok ? referrersRes.json() : null,
      devicesRes.ok ? devicesRes.json() : null,
      countriesRes.ok ? countriesRes.json() : null,
    ]);

    return {
      visitors7d: stats7d?.visitors ?? null,
      visitors30d: stats30d?.visitors ?? null,
      pageViews7d: stats7d?.pageViews ?? null,
      pageViews30d: stats30d?.pageViews ?? null,
      topPages: (topPages?.data ?? []).map((p: Record<string, unknown>) => ({
        page: p.key as string,
        visitors: p.visitors as number,
        pageViews: p.pageViews as number,
      })),
      topReferrers: (referrers?.data ?? []).map((r: Record<string, unknown>) => ({
        referrer: r.key as string,
        visitors: r.visitors as number,
      })),
      devices: (devices?.data ?? []).map((d: Record<string, unknown>) => ({
        device: d.key as string,
        visitors: d.visitors as number,
      })),
      countries: (countries?.data ?? []).map((c: Record<string, unknown>) => ({
        country: c.key as string,
        visitors: c.visitors as number,
      })),
      available: true,
    };
  } catch (err) {
    return {
      ...empty,
      error: err instanceof Error ? err.message : 'Vercel API fetch failed',
    };
  }
}
```

**Environment variables required** (add to `.env.local` and Vercel project settings):

```
VERCEL_API_TOKEN=<bearer token from Vercel settings>
VERCEL_PROJECT_ID=<project id from Vercel dashboard>
VERCEL_TEAM_ID=<optional team id>
```

### 2.4 Data Transformation Layer

Raw query results from Batches 6-7 are transformed into the `bi` object at the
end of `getAdminDashboardData()`, just before the return statement. Key
transformation patterns:

```typescript
// --- At the end of getAdminDashboardData(), before `return { ... }` ---

// ===== BI Data Transformation =====
const biSignups7d = biSignups7dRes.count ?? 0;
const biSignups30d = biSignups30dRes.count ?? 0;
const biActivated = (biActivatedRes.data as { bi_activated_users: number }[])?.[0]?.bi_activated_users ?? 0;
const biTotalSignups = userJourney.totalSignups; // reuse existing

// Activation rate
const biActivationRate = biTotalSignups > 0
  ? Math.round((biActivated / biTotalSignups) * 100 * 10) / 10
  : 0;

// Median time to value
const biMedianTTV = (biTimeToValueRes.data as { bi_median_time_to_value: number }[])?.[0]?.bi_median_time_to_value ?? null;

// D1/D7/D30 retention
const biD1 = (biD1RetentionRes.data as { bi_retention_rate: number }[])?.[0]?.bi_retention_rate ?? 0;
const biD7 = (biD7RetentionRes.data as { bi_retention_rate: number }[])?.[0]?.bi_retention_rate ?? 0;
const biD30 = (biD30RetentionRes.data as { bi_retention_rate: number }[])?.[0]?.bi_retention_rate ?? 0;

// Feature adoption enrichment
const biFeatures = ((biFeatureAdoptionRes.data as Record<string, unknown>[]) ?? []).map(f => ({
  featureName: String(f.feature_name ?? ''),
  totalUses: Number(f.total_uses ?? 0),
  uniqueUsers: Number(f.unique_users ?? 0),
  adoptionPct: Number(f.adoption_pct ?? 0),
}));

// Object creation with week-over-week trend
const obj7d = (biObjectCreation7dRes.data as { object_type: string; cnt: number }[]) ?? [];
const obj30d = (biObjectCreation30dRes.data as { object_type: string; cnt: number }[]) ?? [];
const biObjectCreation = obj7d.map(o => {
  const monthly = obj30d.find(m => m.object_type === o.object_type);
  const weeklyAvg = monthly ? monthly.cnt / 4 : 0;
  const trend = weeklyAvg > 0 ? Math.round(((o.cnt - weeklyAvg) / weeklyAvg) * 100) : 0;
  return { objectType: o.object_type, count7d: o.cnt, count30d: monthly?.cnt ?? 0, trend };
});

// Dead features: < 5% adoption
const biDeadFeatures = biFeatures.filter(f => f.adoptionPct < 5).map(f => f.featureName);

// Conversion proxies
const proxyPhilosophy = (biProxyPhilosophyRes.data as Record<string, unknown>[])?.[0];
const proxyInsights = (biProxyAIInsightsRes.data as Record<string, unknown>[])?.[0];

const biConversionProxies = [
  proxyPhilosophy ? {
    signal: String(proxyPhilosophy.signal ?? ''),
    description: String(proxyPhilosophy.description ?? ''),
    usersWithSignal: Number(proxyPhilosophy.users_with_signal ?? 0),
    retentionRate: Number(proxyPhilosophy.retention_rate ?? 0),
    usersWithoutSignal: Number(proxyPhilosophy.users_without_signal ?? 0),
    retentionRateWithout: Number(proxyPhilosophy.retention_rate_without ?? 0),
    lift: Number(proxyPhilosophy.lift ?? 0),
  } : null,
  proxyInsights ? {
    signal: String(proxyInsights.signal ?? ''),
    description: String(proxyInsights.description ?? ''),
    usersWithSignal: Number(proxyInsights.users_with_signal ?? 0),
    retentionRate: Number(proxyInsights.retention_rate ?? 0),
    usersWithoutSignal: Number(proxyInsights.users_without_signal ?? 0),
    retentionRateWithout: Number(proxyInsights.retention_rate_without ?? 0),
    lift: Number(proxyInsights.lift ?? 0),
  } : null,
].filter(Boolean) as AdminDashboardData['bi']['healthOpportunity']['conversionProxies'];

// Final assembly (add to the return object)
// bi: { growth: {...}, retention: {...}, productUsage: {...}, funnelFriction: {...}, healthOpportunity: {...}, vercelAnalytics }
```

---

## 3. Frontend Architecture

### 3.1 Component Hierarchy

```
src/app/golf/admin/
  page.tsx                              (existing — updated)
  components/
    BusinessIntelligenceTab.tsx          (NEW - replaces GrowthTab)
    bi/                                 (NEW directory)
      BISubNav.tsx                      (NEW - 5-section tab bar)
      BISectionSkeleton.tsx             (NEW - section-level skeleton)
      sections/
        GrowthSection.tsx               (NEW - Section A)
        RetentionSection.tsx            (NEW - Section B)
        ProductUsageSection.tsx         (NEW - Section C)
        FunnelFrictionSection.tsx       (NEW - Section D)
        HealthOpportunitySection.tsx    (NEW - Section E)
      charts/
        RetentionHeatmap.tsx            (NEW - Recharts heatmap wrapper)
        StickinessTrendChart.tsx        (NEW - DAU/MAU line chart)
        FunnelBarChart.tsx              (NEW - Horizontal funnel)
        FeatureAdoptionBars.tsx         (NEW - Ranked horizontal bars)
        ObjectCreationGrid.tsx          (NEW - Sparkline-per-object grid)
        ConversionProxyTable.tsx        (NEW - Comparison table with lift)
        VercelAnalyticsPanel.tsx        (NEW - Vercel data cards + donut)
      shared/
        BIStatCard.tsx                  (NEW - BI-specific stat card variant)
        BIInsightCallout.tsx            (NEW - BI insight generator)
        TrendBadge.tsx                  (NEW - +/- % badge)
        MiniSparkline.tsx               (NEW - Thin inline sparkline)
```

#### Full Component Tree

```
page.tsx (AdminDashboardPage)
  |
  +-- AdminDashboardContent
       |
       +-- Sidebar (TABS array updated: 'growth' -> 'bi', label 'BI')
       |
       +-- [tab === 'bi']
             BusinessIntelligenceTab            <-- top-level orchestrator
               |
               +-- BISubNav                     <-- 5-section pill/tab bar
               |     props: activeSection, onSectionChange
               |
               +-- [activeSection === 'growth']
               |     GrowthSection
               |       +-- BIInsightCallout (contextual insights for growth)
               |       +-- 4x AdminStatCard (signups7d, activatedUsers, activationRate, timeToValue)
               |       +-- AdminAreaChart (signupsByDay, 30d trend)
               |       +-- FunnelBarChart (signup -> onboard -> 1st round -> active)
               |       +-- TrendBadge (wowGrowthRate)
               |       +-- VercelAnalyticsPanel (visitors, referrers, devices)
               |
               +-- [activeSection === 'retention']
               |     RetentionSection
               |       +-- 4x AdminStatCard (D1, D7, D30, DAU/MAU)
               |       +-- CohortRetentionMatrix (existing, pass bi.retention.cohortMatrix)
               |       +-- StickinessTrendChart (4-week DAU/MAU line)
               |       +-- AdminDonutChart (DAU/WAU/MAU proportions)
               |
               +-- [activeSection === 'product-usage']
               |     ProductUsageSection
               |       +-- 4x AdminStatCard (totalSessions, avgPagesPer, avgDuration, deadFeatures)
               |       +-- FeatureAdoptionBars (sorted, color-coded)
               |       +-- ObjectCreationGrid (rounds, reviews, insights, etc.)
               |       +-- SessionHeatmap (existing, pass topPages/featureUsage)
               |
               +-- [activeSection === 'funnel-friction']
               |     FunnelFrictionSection
               |       +-- FunnelBarChart (onboarding funnel with drop-off annotations)
               |       +-- FunnelBarChart (round completion funnel)
               |       +-- PlayerDropoffFunnel (existing, stuck users drill-down)
               |       +-- ErrorRateTable (route error rates)
               |       +-- TopBlockingErrors list
               |
               +-- [activeSection === 'health-opportunity']
                     HealthOpportunitySection
                       +-- 4x AdminStatCard (teams healthy/warning/critical, power users count)
                       +-- TeamHealthCards (existing, from bi.healthOpportunity.teamScores)
                       +-- PowerUsersTable (top 10 with sparklines)
                       +-- AtRiskUsersList (with days-since-active badges)
                       +-- ConversionProxyTable (signal vs no-signal retention)
                       +-- CoachEngagementRanking
```

#### Key New Components -- Props & Types

```typescript
// --- File: src/app/golf/admin/components/BusinessIntelligenceTab.tsx ---

'use client';

import { useState, useMemo, lazy, Suspense } from 'react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { BISubNav, type BISection } from './bi/BISubNav';
import { BISectionSkeleton } from './bi/BISectionSkeleton';
import { InsightCallout } from './InsightCallout';

// Lazy load sections for code splitting
const GrowthSection = lazy(() => import('./bi/sections/GrowthSection'));
const RetentionSection = lazy(() => import('./bi/sections/RetentionSection'));
const ProductUsageSection = lazy(() => import('./bi/sections/ProductUsageSection'));
const FunnelFrictionSection = lazy(() => import('./bi/sections/FunnelFrictionSection'));
const HealthOpportunitySection = lazy(() => import('./bi/sections/HealthOpportunitySection'));

interface Props {
  data: AdminDashboardData;
}

export function BusinessIntelligenceTab({ data }: Props) {
  const [activeSection, setActiveSection] = useState<BISection>('growth');

  // Memoize the BI data slice to prevent re-renders
  const bi = useMemo(() => data.bi, [data.bi]);

  return (
    <div className="space-y-6">
      {/* Contextual insight banner */}
      <InsightCallout data={data} tab="growth" />

      {/* Sub-navigation */}
      <BISubNav
        activeSection={activeSection}
        onSectionChange={setActiveSection}
      />

      {/* Active section */}
      <Suspense fallback={<BISectionSkeleton />}>
        {activeSection === 'growth' && <GrowthSection bi={bi} data={data} />}
        {activeSection === 'retention' && <RetentionSection bi={bi} data={data} />}
        {activeSection === 'product-usage' && <ProductUsageSection bi={bi} data={data} />}
        {activeSection === 'funnel-friction' && <FunnelFrictionSection bi={bi} data={data} />}
        {activeSection === 'health-opportunity' && <HealthOpportunitySection bi={bi} data={data} />}
      </Suspense>
    </div>
  );
}
```

```typescript
// --- File: src/app/golf/admin/components/bi/BISubNav.tsx ---

'use client';

import { cn } from '@/lib/utils';
import {
  TrendingUp,
  RefreshCw,
  BarChart3,
  Funnel,
  HeartPulse,
} from 'lucide-react';

export type BISection =
  | 'growth'
  | 'retention'
  | 'product-usage'
  | 'funnel-friction'
  | 'health-opportunity';

const SECTIONS: { id: BISection; label: string; shortLabel: string; Icon: React.ComponentType<{ size?: number }> }[] = [
  { id: 'growth', label: 'Growth', shortLabel: 'Growth', Icon: TrendingUp },
  { id: 'retention', label: 'Retention', shortLabel: 'Retain', Icon: RefreshCw },
  { id: 'product-usage', label: 'Product Usage', shortLabel: 'Usage', Icon: BarChart3 },
  { id: 'funnel-friction', label: 'Funnel & Friction', shortLabel: 'Funnel', Icon: Funnel },
  { id: 'health-opportunity', label: 'Health & Opp.', shortLabel: 'Health', Icon: HeartPulse },
];

interface Props {
  activeSection: BISection;
  onSectionChange: (section: BISection) => void;
}

export function BISubNav({ activeSection, onSectionChange }: Props) {
  return (
    <div className="flex gap-1 p-1 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/20 overflow-x-auto">
      {SECTIONS.map((section) => {
        const isActive = activeSection === section.id;
        const SIcon = section.Icon;
        return (
          <button
            key={section.id}
            onClick={() => onSectionChange(section.id)}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-medium',
              'transition-all duration-200 whitespace-nowrap flex-shrink-0',
              isActive
                ? 'bg-white/80 text-warm-900 shadow-sm border border-white/40'
                : 'text-warm-500 hover:text-warm-700 hover:bg-white/30'
            )}
          >
            <SIcon size={16} />
            {/* Full label on desktop, short on mobile */}
            <span className="hidden sm:inline">{section.label}</span>
            <span className="sm:hidden">{section.shortLabel}</span>
          </button>
        );
      })}
    </div>
  );
}
```

#### Section Component Example (GrowthSection)

```typescript
// --- File: src/app/golf/admin/components/bi/sections/GrowthSection.tsx ---

'use client';

import {
  UserPlus,
  CheckCircle2,
  Percent,
  Clock,
} from 'lucide-react';
import type { AdminDashboardData } from '@/app/golf/actions/admin-data';
import { AdminStatCard } from '../../AdminStatCard';
import { AdminAreaChart } from '../../AdminChart';
import { FunnelBarChart } from '../charts/FunnelBarChart';
import { VercelAnalyticsPanel } from '../charts/VercelAnalyticsPanel';
import { SectionHeader } from '@/components/golf/dashboard/premium-components';

interface Props {
  bi: AdminDashboardData['bi'];
  data: AdminDashboardData;
}

export default function GrowthSection({ bi, data }: Props) {
  const { growth } = bi;

  const signupChartData = growth.signupsByDay.map((d) => ({
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: d.count,
  }));

  // Build activation funnel stages
  const activationFunnel = [
    { label: 'Total Signups', value: growth.totalSignups, color: '#3B82F6' },
    { label: 'Completed Onboarding', value: growth.totalSignups - growth.dropOffBeforeOnboarding, color: '#2563EB' },
    { label: 'First Round', value: growth.activatedUsers, color: '#16A34A' },
    { label: 'Active This Week', value: data.userJourney.activeThisWeek, color: '#8B5CF6' },
  ];

  return (
    <div className="space-y-6">
      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <AdminStatCard
          label="Signups (7d)"
          value={growth.signups7d}
          icon={<UserPlus size={20} />}
          trend={{ value: growth.wowGrowthRate, label: 'vs last week' }}
          accentColor="blue"
        />
        <AdminStatCard
          label="Activated Users"
          value={growth.activatedUsers}
          icon={<CheckCircle2 size={20} />}
          detail="onboarded + 1st round"
          accentColor="green"
        />
        <AdminStatCard
          label="Activation Rate"
          value={growth.activationRate}
          suffix="%"
          icon={<Percent size={20} />}
          accentColor={growth.activationRate >= 50 ? 'green' : growth.activationRate >= 25 ? 'amber' : 'red'}
        />
        <AdminStatCard
          label="Time to Value"
          value={growth.medianTimeToValueHours !== null
            ? (growth.medianTimeToValueHours < 24
                ? `${Math.round(growth.medianTimeToValueHours)}h`
                : `${Math.round(growth.medianTimeToValueHours / 24)}d`)
            : '---'
          }
          icon={<Clock size={20} />}
          detail="median signup to 1st round"
          accentColor={
            growth.medianTimeToValueHours !== null && growth.medianTimeToValueHours <= 48
              ? 'green' : 'amber'
          }
        />
      </div>

      {/* Signup Trend */}
      <div>
        <SectionHeader title="Signup Trend (30 Days)" />
        <div className="glass-standard rounded-2xl p-6">
          <AdminAreaChart
            data={signupChartData}
            title="Daily Signups"
            color="#3B82F6"
            height={180}
          />
        </div>
      </div>

      {/* Activation Funnel */}
      <div>
        <SectionHeader title="Activation Funnel" />
        <div className="glass-standard rounded-2xl p-6">
          <FunnelBarChart stages={activationFunnel} />
        </div>
      </div>

      {/* Drop-off Summary */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-standard rounded-2xl p-6">
          <h3 className="text-sm font-semibold text-warm-500 uppercase tracking-wider mb-4">
            Drop-off Points
          </h3>
          <div className="space-y-3">
            <DropOffRow
              label="Before Onboarding"
              count={growth.dropOffBeforeOnboarding}
              total={growth.signups30d}
            />
            <DropOffRow
              label="Before First Round"
              count={growth.dropOffBeforeFirstRound}
              total={growth.totalSignups - growth.dropOffBeforeOnboarding}
            />
          </div>
        </div>

        {/* Vercel Visitor Metrics */}
        <VercelAnalyticsPanel analytics={bi.vercelAnalytics} />
      </div>
    </div>
  );
}

function DropOffRow({ label, count, total }: { label: string; count: number; total: number }) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="flex items-center justify-between">
      <span className="text-sm text-warm-600">{label}</span>
      <div className="flex items-center gap-2">
        <span className="text-sm font-semibold text-warm-900 tabular-nums">{count}</span>
        <span className={`text-xs font-medium px-1.5 py-0.5 rounded-full ${
          pct > 50 ? 'bg-red-50 text-red-700' : pct > 25 ? 'bg-amber-50 text-amber-700' : 'bg-primary-50 text-primary-700'
        }`}>
          {pct}%
        </span>
      </div>
    </div>
  );
}
```

### 3.2 State Management

| State | Location | Mechanism |
|-------|----------|-----------|
| `AdminDashboardData` (entire dataset) | `page.tsx` (`AdminDashboardContent`) | `useState` + server action fetch. Passed as `data` prop to all tab components. No change from current pattern. |
| Active main tab (`TabId`) | `page.tsx` | URL search param (`?tab=bi`), read via `useSearchParams()`. |
| Active BI sub-section (`BISection`) | `BusinessIntelligenceTab` | Local `useState<BISection>('growth')`. Not URL-persisted to avoid URL noise, but could optionally be persisted via `?biSection=retention`. |
| Section-internal UI state | Each section component | Local `useState` for expanded rows, tooltips, hover states. |
| Selected user/team for drill-down | Section components (e.g., `HealthOpportunitySection`) | Local `useState<string | null>` for selected IDs. |

**Key principle**: All data flows top-down from `data` prop. There is no client-side
data fetching inside BI components. The BI tab re-renders automatically when the
parent `loadData(true)` is called (auto-refresh every 60s or manual R key).

### 3.3 Sub-Tab Navigation

The `BISubNav` component renders a **pill-style horizontal tab bar** inside the
BI tab content area. Implementation details:

1. **Container**: `flex gap-1 p-1 rounded-2xl bg-white/40 backdrop-blur-sm border border-white/20`
2. **Active pill**: `bg-white/80 shadow-sm border border-white/40 text-warm-900`
3. **Inactive pill**: `text-warm-500 hover:bg-white/30`
4. **Mobile**: `overflow-x-auto` with `flex-shrink-0` on each pill. Short labels
   on `< sm` breakpoint.
5. **Keyboard**: Sections are numbered A-E. Future enhancement: `Shift+1` through
   `Shift+5` to switch sections.

**URL persistence (optional)**:

```typescript
// If URL persistence is desired:
const searchParams = useSearchParams();
const sectionFromUrl = searchParams.get('biSection') as BISection | null;
const [activeSection, setActiveSection] = useState<BISection>(sectionFromUrl ?? 'growth');

function handleSectionChange(section: BISection) {
  setActiveSection(section);
  const params = new URLSearchParams(searchParams.toString());
  params.set('biSection', section);
  router.replace(`/golf/admin?${params.toString()}`, { scroll: false });
}
```

### 3.4 Chart Strategy

Each BI section uses specific Recharts chart types. The admin dashboard currently
uses custom SVG charts (`AdminChart.tsx`), not Recharts. The new BI sections
will use **Recharts 3.6** for richer interactivity while keeping the custom
charts for simpler visualizations.

#### Chart-to-Section Mapping

| Section | Visualization | Chart Type | Component | Recharts? |
|---------|--------------|------------|-----------|-----------|
| **A: Growth** | Signup trend (30d) | Area chart | `AdminAreaChart` (existing custom SVG) | No -- existing works well |
| **A: Growth** | Activation funnel | Horizontal bars | `FunnelBarChart` (new, wraps `AdminFunnelChart`) | No -- existing works well |
| **A: Growth** | Vercel visitors donut | Donut | `AdminDonutChart` (existing) | No |
| **B: Retention** | D1/D7/D30 comparison | Bar chart | **Recharts `BarChart`** | Yes |
| **B: Retention** | Cohort heatmap | Table/heatmap | `CohortRetentionMatrix` (existing) | No -- table-based |
| **B: Retention** | Stickiness trend | Line chart | **Recharts `LineChart`** (new) | Yes |
| **B: Retention** | DAU/WAU/MAU donut | Donut | `AdminDonutChart` (existing) | No |
| **C: Product Usage** | Feature adoption ranking | Horizontal bar | **Recharts `BarChart` (horizontal)** | Yes |
| **C: Product Usage** | Object creation sparklines | Sparkline grid | `AdminSparkline` (existing) per object | No |
| **C: Product Usage** | Page heatmap | Heatmap bars | `SessionHeatmap` (existing) | No |
| **C: Product Usage** | Repeat usage | Grouped bar | **Recharts `BarChart`** | Yes |
| **D: Funnel** | Onboarding funnel | Funnel bars | `AdminFunnelChart` (existing) | No |
| **D: Funnel** | Round completion funnel | Funnel bars | `AdminFunnelChart` (existing) | No |
| **D: Funnel** | Error rate by route | Bar chart | **Recharts `BarChart`** | Yes |
| **D: Funnel** | Stuck users | Expandable table | `PlayerDropoffFunnel` (existing) | No |
| **E: Health** | Team scores radar | Radar | **Recharts `RadarChart`** | Yes |
| **E: Health** | Power users table | Data table | Custom table component | No |
| **E: Health** | Conversion proxies | Grouped bar | **Recharts `BarChart`** | Yes |
| **E: Health** | Coach engagement | Ranked list | Custom list with progress bars | No |

#### Recharts Configuration Patterns

All Recharts components follow these conventions:

```typescript
// Standard Recharts wrapper pattern
import {
  ResponsiveContainer,
  BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip,
} from 'recharts';

// Color palette (matches design system)
const COLORS = {
  primary: '#16A34A',
  primaryLight: '#22C55E',
  secondary: '#3B82F6',
  accent: '#8B5CF6',
  warning: '#F59E0B',
  danger: '#EF4444',
  muted: '#D6D3D1',   // warm-300
  grid: '#F5F5F0',    // warm-50
  text: '#1C1917',    // warm-900
  textMuted: '#78716C', // warm-500
};

// Standard tooltip style
const tooltipStyle = {
  contentStyle: {
    background: 'rgba(255,255,255,0.95)',
    backdropFilter: 'blur(16px)',
    border: '1px solid rgba(255,255,255,0.3)',
    borderRadius: '12px',
    boxShadow: '0 8px 24px rgba(0,0,0,0.08)',
    padding: '8px 12px',
  },
  labelStyle: { color: COLORS.textMuted, fontSize: 12 },
};

// Example: Retention D1/D7/D30 Bar Chart
function RetentionBarsChart({ d1, d7, d30 }: { d1: number; d7: number; d30: number }) {
  const data = [
    { name: 'D1', rate: d1 },
    { name: 'D7', rate: d7 },
    { name: 'D30', rate: d30 },
  ];

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={data} barCategoryGap="30%">
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis
          dataKey="name"
          tick={{ fill: COLORS.textMuted, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: COLORS.textMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(value: number) => [`${value}%`, 'Retention']}
          {...tooltipStyle}
        />
        <Bar dataKey="rate" radius={[6, 6, 0, 0]}>
          {data.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.rate >= 50 ? COLORS.primary : entry.rate >= 25 ? COLORS.warning : COLORS.danger}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Example: Stickiness Trend Line Chart
function StickinessTrendChart({ data }: { data: { week: string; dauMauRatio: number }[] }) {
  return (
    <ResponsiveContainer width="100%" height={200}>
      <LineChart data={data}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis
          dataKey="week"
          tick={{ fill: COLORS.textMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => new Date(v).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
        />
        <YAxis
          tick={{ fill: COLORS.textMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 'auto']}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip
          formatter={(value: number) => [`${value}%`, 'DAU/MAU']}
          {...tooltipStyle}
        />
        <Line
          type="monotone"
          dataKey="dauMauRatio"
          stroke={COLORS.primary}
          strokeWidth={2.5}
          dot={{ fill: COLORS.primary, r: 4, strokeWidth: 2, stroke: 'white' }}
          activeDot={{ r: 6, fill: COLORS.primary, stroke: 'white', strokeWidth: 3 }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

// Example: Feature Adoption Horizontal BarChart
function FeatureAdoptionChart({ features }: { features: AdminDashboardData['bi']['productUsage']['features'] }) {
  const chartData = features.slice(0, 12).map(f => ({
    name: f.featureName,
    adoption: f.adoptionPct,
    users: f.uniqueUsers,
  }));

  return (
    <ResponsiveContainer width="100%" height={Math.max(200, chartData.length * 36)}>
      <BarChart data={chartData} layout="vertical" barSize={20}>
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} horizontal={false} />
        <XAxis
          type="number"
          tick={{ fill: COLORS.textMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fill: COLORS.text, fontSize: 12 }}
          axisLine={false}
          tickLine={false}
          width={120}
        />
        <Tooltip
          formatter={(value: number, _name: string, props) => [
            `${value}% (${props.payload.users} users)`,
            'Adoption'
          ]}
          {...tooltipStyle}
        />
        <Bar dataKey="adoption" radius={[0, 6, 6, 0]}>
          {chartData.map((entry, i) => (
            <Cell
              key={i}
              fill={entry.adoption >= 50 ? COLORS.primary : entry.adoption >= 20 ? COLORS.secondary : COLORS.muted}
            />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// Example: Conversion Proxy Grouped Bar
function ConversionProxyChart({
  proxies
}: {
  proxies: AdminDashboardData['bi']['healthOpportunity']['conversionProxies']
}) {
  const chartData = proxies.map(p => ({
    signal: p.signal.replace(/_/g, ' '),
    withSignal: p.retentionRate,
    withoutSignal: p.retentionRateWithout,
    lift: p.lift,
  }));

  return (
    <ResponsiveContainer width="100%" height={200}>
      <BarChart data={chartData} barCategoryGap="25%">
        <CartesianGrid strokeDasharray="3 3" stroke={COLORS.grid} vertical={false} />
        <XAxis
          dataKey="signal"
          tick={{ fill: COLORS.textMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: COLORS.textMuted, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          domain={[0, 100]}
          tickFormatter={(v) => `${v}%`}
        />
        <Tooltip {...tooltipStyle} />
        <Bar dataKey="withSignal" name="With Signal" fill={COLORS.primary} radius={[4, 4, 0, 0]} />
        <Bar dataKey="withoutSignal" name="Without Signal" fill={COLORS.muted} radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
```

### 3.5 Admin Tab Reorganization

The 5 admin tabs are reorganized to eliminate duplication and align with the BI
framework. The tab array in `page.tsx` (line 54) changes as follows:

#### Updated TABS Array

```typescript
// --- File: src/app/golf/admin/page.tsx (replace TABS at line 54) ---

const TABS = [
  {
    id: 'overview',
    label: 'Overview',
    Icon: LayoutDashboard,
    shortcut: '1',
    description: 'Executive summary with KPIs',
  },
  {
    id: 'people',
    label: 'People',
    Icon: Users,
    shortcut: '2',
    description: 'User & team management',
  },
  {
    id: 'system',
    label: 'System',
    Icon: Cpu,
    shortcut: '3',
    description: 'Infrastructure & errors',
  },
  {
    id: 'bi',                   // CHANGED from 'growth'
    label: 'Intelligence',       // CHANGED from 'Growth'
    Icon: BarChart3,             // CHANGED from TrendingUp
    shortcut: '4',
    description: 'Business intelligence & analytics',
  },
  {
    id: 'tracer',
    label: 'Tracer',
    Icon: Crosshair,
    shortcut: '5',
    description: 'Shot tracking & error tracing',
  },
] as const;
```

#### Tab Mapping Update

```typescript
// Update tabMapping (line 151) to handle old URLs
const tabMapping: Record<string, TabId> = {
  command: 'overview',
  users: 'people',
  health: 'system',
  analytics: 'bi',     // backward compat
  growth: 'bi',        // backward compat — old Growth tab links now go to BI
  overview: 'overview',
  people: 'people',
  system: 'system',
  bi: 'bi',            // NEW
  tracer: 'tracer',
};
```

#### Tab Content Rendering Update

```typescript
// Replace line 683-684 in page.tsx:
// OLD:  {activeTab === 'growth' && <GrowthTab data={data} />}
// NEW:
{activeTab === 'bi' && <BusinessIntelligenceTab data={data} />}
```

#### Changes Per Tab

**1. Overview Tab** -- Minor changes:
- Remove the UserFunnelViz (moved to BI > Funnel section). Replace with a
  **BI Summary Card** that shows 5 key metrics (one from each BI section) with
  links to drill into each section.
- Keep: CriticalAlertsBanner, 4 KPI cards, DailyCharts, PlatformHealthCard,
  ActivityFeed, UserBreakdownCard.

**2. People Tab** -- No changes:
- Team health cards, user directory, user detail panel stay as-is.
- The BI > Health section cross-references the same `userActivity.teams` data,
  but adds scoring (healthScore, coachEngagementScore) that People does not show.

**3. System Tab** -- Minor changes:
- Remove the InfraHealthCard's API performance table (moved to BI > Funnel &
  Friction as "error rates by route").
- Keep: Error KPIs, HealthCheckGrid, CoachHelmHealthCard, error log table,
  login security, audit feed.

**4. Intelligence (BI) Tab** -- Complete replacement:
- Replaces the `GrowthTab` component entirely.
- 5 sub-sections as described in Section 3.1.

**5. Tracer Tab** -- No changes:
- Shot tracking and error tracing remain independent.

---

## 4. Cross-Cutting Concerns

### 4.1 Loading States

Each BI section has a skeleton loader that matches its layout shape.

```typescript
// --- File: src/app/golf/admin/components/bi/BISectionSkeleton.tsx ---

'use client';

import { cn } from '@/lib/utils';

export function BISectionSkeleton() {
  return (
    <div className="space-y-6 animate-pulse">
      {/* KPI row skeleton */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className={cn(
              'bg-white/65 backdrop-blur-[16px] border border-white/20 rounded-2xl p-5 md:p-6',
              'border-l-[3px] border-l-warm-200'
            )}
          >
            <div className="h-3 w-20 bg-warm-100 rounded mb-3" />
            <div className="h-8 w-16 bg-warm-100 rounded mb-2" />
            <div className="h-2 w-24 bg-warm-50 rounded" />
          </div>
        ))}
      </div>

      {/* Chart skeleton */}
      <div className="glass-standard rounded-2xl p-6">
        <div className="h-3 w-32 bg-warm-100 rounded mb-4" />
        <div className="h-48 bg-warm-50/50 rounded-xl" />
      </div>

      {/* Two-column skeleton */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="glass-standard rounded-2xl p-6">
          <div className="h-3 w-28 bg-warm-100 rounded mb-4" />
          <div className="h-36 bg-warm-50/50 rounded-xl" />
        </div>
        <div className="glass-standard rounded-2xl p-6">
          <div className="h-3 w-28 bg-warm-100 rounded mb-4" />
          <div className="h-36 bg-warm-50/50 rounded-xl" />
        </div>
      </div>
    </div>
  );
}
```

The `Suspense` boundary in `BusinessIntelligenceTab` uses this skeleton for
each lazy-loaded section. Additionally, since data is loaded at the page level
(existing behavior), the main content area already shows `StatSkeleton` and
`CardSkeleton` during initial load.

### 4.2 Error Handling

Three levels of error resilience:

**Level 1: Server Action** -- The `getAdminDashboardData` function wraps each new
batch in individual try/catch blocks. If BI queries fail, the `bi` object returns
safe defaults (zeros and empty arrays) rather than failing the entire dashboard.

```typescript
// Pattern for each new batch:
let biGrowth: AdminDashboardData['bi']['growth'];
try {
  // ... transform batch 6 results into biGrowth ...
} catch {
  biGrowth = {
    totalSignups: 0,
    signups7d: 0,
    signups30d: 0,
    signupsByDay: [],
    activatedUsers: 0,
    activationRate: 0,
    medianTimeToValueHours: null,
    dropOffBeforeOnboarding: 0,
    dropOffBeforeFirstRound: 0,
    wowGrowthRate: 0,
  };
}
```

**Level 2: Vercel API** -- The `fetchVercelAnalytics` function returns
`{ available: false, error: '...' }` on failure. Components check
`bi.vercelAnalytics.available` and show a graceful fallback:

```typescript
// In VercelAnalyticsPanel:
if (!analytics.available) {
  return (
    <div className="glass-standard rounded-2xl p-6">
      <h3 className="text-sm font-semibold text-warm-500 mb-2">Vercel Analytics</h3>
      <div className="flex items-center gap-2 text-sm text-warm-400">
        <AlertCircle size={16} />
        <span>Visitor analytics unavailable. {analytics.error || 'Check API configuration.'}</span>
      </div>
    </div>
  );
}
```

**Level 3: Component** -- Each section component is wrapped in the existing
`AdminErrorBoundary`:

```typescript
// In BusinessIntelligenceTab:
<AdminErrorBoundary title="Growth Metrics" size="md">
  <GrowthSection bi={bi} data={data} />
</AdminErrorBoundary>
```

### 4.3 Responsive Design

The BI dashboard follows the existing admin dashboard responsive patterns:

| Breakpoint | Behavior |
|------------|----------|
| `< sm` (mobile) | Sub-nav pills show short labels, single-column layout, charts auto-height |
| `sm` - `lg` (tablet) | Sub-nav shows full labels, 2-column grid for cards, charts at standard height |
| `>= lg` (desktop) | Full layout: 4-column KPI grid, 2-column chart rows, sidebar expanded |

**Specific responsive rules**:

```
KPI cards:     grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4
Chart rows:    grid-cols-1 lg:grid-cols-2 gap-4
Sub-nav:       overflow-x-auto (horizontal scroll on mobile)
Tables:        overflow-x-auto -mx-6 px-6 (breakout scroll)
Recharts:      ResponsiveContainer width="100%" height={N}
```

**Mobile-specific optimizations**:
- BISubNav pills use `flex-shrink-0` for horizontal scrolling instead of wrapping.
- Cohort heatmap uses `text-[10px]` on mobile for cell labels.
- Funnel bars collapse the label column to `w-24` on mobile.
- Error rate table hides the "total visits" column on `< md`.

### 4.4 Performance

#### Memoization Strategy

```typescript
// 1. AdminDashboardData is memoized at the section level:
//    Each section receives `bi` (the BI slice) + `data` (full data for fallback).
//    The `bi` object is memoized in BusinessIntelligenceTab:
const bi = useMemo(() => data.bi, [data.bi]);

// 2. Chart data transformations are memoized inside each section:
const signupChartData = useMemo(() =>
  bi.growth.signupsByDay.map(d => ({
    label: new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' }),
    value: d.count,
  })),
  [bi.growth.signupsByDay]
);

// 3. Expensive sorts are memoized:
const sortedFeatures = useMemo(() =>
  [...bi.productUsage.features].sort((a, b) => b.totalUses - a.totalUses),
  [bi.productUsage.features]
);

// 4. AdminStatCard is already React.memo (existing).
// 5. CohortRetentionMatrix should be wrapped in React.memo (it currently is not):
export default memo(function CohortRetentionMatrix({ cohorts }: CohortRetentionMatrixProps) { ... });
```

#### Lazy Section Rendering

Only the active section is rendered. Sections are `React.lazy` loaded:

```typescript
const GrowthSection = lazy(() => import('./bi/sections/GrowthSection'));
const RetentionSection = lazy(() => import('./bi/sections/RetentionSection'));
const ProductUsageSection = lazy(() => import('./bi/sections/ProductUsageSection'));
const FunnelFrictionSection = lazy(() => import('./bi/sections/FunnelFrictionSection'));
const HealthOpportunitySection = lazy(() => import('./bi/sections/HealthOpportunitySection'));
```

This ensures only the active section's JS bundle is loaded. The `Suspense`
boundary shows `BISectionSkeleton` while the chunk loads. Subsequent
section switches are instant (cached).

#### Server-Side Query Performance

The new SQL functions use:
- `STABLE` volatility for query plan caching.
- `LIMIT` clauses on all list-returning functions.
- `count(*, { head: true })` for count-only queries (no row transfer).
- Parallel `Promise.all` for all independent queries.
- Vercel API responses are cached with `next: { revalidate: 900 }` (15 min).

**Estimated impact on `getAdminDashboardData` latency**:
- Current: ~2-4 seconds (5 parallel batches).
- With Batches 6-7: ~3-5 seconds (+1-2s for new SQL RPC calls + Vercel API).
- Mitigation: Vercel API is cached server-side (15 min). SQL functions are
  lightweight aggregations that run in parallel.

---

## Appendix A: File Inventory

### New Files (16)

| File | Purpose |
|------|---------|
| `src/app/golf/admin/components/BusinessIntelligenceTab.tsx` | Top-level BI tab orchestrator |
| `src/app/golf/admin/components/bi/BISubNav.tsx` | 5-section pill navigation |
| `src/app/golf/admin/components/bi/BISectionSkeleton.tsx` | Section skeleton loader |
| `src/app/golf/admin/components/bi/sections/GrowthSection.tsx` | Section A |
| `src/app/golf/admin/components/bi/sections/RetentionSection.tsx` | Section B |
| `src/app/golf/admin/components/bi/sections/ProductUsageSection.tsx` | Section C |
| `src/app/golf/admin/components/bi/sections/FunnelFrictionSection.tsx` | Section D |
| `src/app/golf/admin/components/bi/sections/HealthOpportunitySection.tsx` | Section E |
| `src/app/golf/admin/components/bi/charts/RetentionHeatmap.tsx` | Recharts heatmap |
| `src/app/golf/admin/components/bi/charts/StickinessTrendChart.tsx` | Recharts line |
| `src/app/golf/admin/components/bi/charts/FunnelBarChart.tsx` | Horizontal funnel bars |
| `src/app/golf/admin/components/bi/charts/FeatureAdoptionBars.tsx` | Recharts horizontal bar |
| `src/app/golf/admin/components/bi/charts/ObjectCreationGrid.tsx` | Sparkline grid |
| `src/app/golf/admin/components/bi/charts/ConversionProxyTable.tsx` | Grouped bar comparison |
| `src/app/golf/admin/components/bi/charts/VercelAnalyticsPanel.tsx` | Vercel data display |
| `supabase/migrations/YYYYMMDD_bi_functions.sql` | 10 SQL functions |

### Modified Files (4)

| File | Changes |
|------|---------|
| `src/app/golf/actions/admin-data.ts` | Add `bi` to `AdminDashboardData`, add Batches 6-7, add `fetchVercelAnalytics()`, add transformation logic |
| `src/app/golf/admin/page.tsx` | Rename tab `growth` -> `bi`, update `TABS`, `tabMapping`, import `BusinessIntelligenceTab`, remove `GrowthTab` import |
| `src/app/golf/admin/components/OverviewTab.tsx` | Replace `UserFunnelViz` with BI Summary Card linking to BI sub-sections |
| `src/app/golf/admin/components/InsightCallout.tsx` | Add `'bi'` to `TabId` union type, add BI-specific insight generation logic |

### Deprecated Files (0 deleted, but no longer imported)

| File | Status |
|------|--------|
| `src/app/golf/admin/components/GrowthTab.tsx` | No longer imported by `page.tsx`. Can be deleted or kept for reference. |

### Reused Unchanged (7)

| File | Used In |
|------|---------|
| `AdminStatCard.tsx` | All 5 BI sections (KPI cards) |
| `AdminChart.tsx` (AdminAreaChart, AdminFunnelChart, AdminDonutChart, AdminSparkline, AdminProgressBar) | Growth, Retention, Product Usage sections |
| `CohortRetentionMatrix.tsx` | Retention section |
| `SessionHeatmap.tsx` | Product Usage section |
| `PlayerDropoffFunnel.tsx` | Funnel & Friction section |
| `TeamHealthCards.tsx` | Health & Opportunity section |
| `InsightCallout.tsx` | BusinessIntelligenceTab (top-level) |

---

## Appendix B: Implementation Order

Recommended phase ordering to deliver incrementally:

### Phase 1: Scaffolding (1 day)
1. Create `BusinessIntelligenceTab.tsx` with `BISubNav` and empty section stubs.
2. Update `page.tsx` to swap `GrowthTab` for `BusinessIntelligenceTab`.
3. Wire existing data (`data.growth`, `data.engagement`, etc.) into Section A
   (Growth) -- no new backend queries yet.

### Phase 2: Backend BI Queries (2 days)
1. Write and test the 10 SQL functions via Supabase migration.
2. Add Batches 6-7 to `getAdminDashboardData()`.
3. Add the `bi` key to `AdminDashboardData` with transformation logic.

### Phase 3: Section Build-Out (3 days)
1. Section A: Growth -- connect to `bi.growth`.
2. Section B: Retention -- connect to `bi.retention`, add Recharts line chart.
3. Section C: Product Usage -- connect to `bi.productUsage`, add Recharts bar.
4. Section D: Funnel & Friction -- connect to `bi.funnelFriction`.
5. Section E: Health & Opportunity -- connect to `bi.healthOpportunity`.

### Phase 4: Vercel Integration + Polish (1 day)
1. Implement `fetchVercelAnalytics()`.
2. Build `VercelAnalyticsPanel`.
3. Polish: responsive tweaks, loading skeletons, error boundaries.
4. Update Overview tab to include BI Summary Card.

### Phase 5: QA + Tab Reorganization (1 day)
1. Remove duplicate widgets from Overview and System tabs.
2. Test all 5 BI sections with real production data.
3. Verify backward-compatible URL routing (`?tab=growth` -> `?tab=bi`).
4. Performance profiling -- ensure dashboard load time stays under 5 seconds.

# Requirements: Business Intelligence Dashboard

## Problem Statement

The current admin "Growth" tab shows activity totals and vanity metrics instead of decision-making metrics. The admin (founder/operator) cannot answer critical product questions:
- **Which features actually drive retention** vs which ones just get clicked once?
- **Where do users get stuck and drop off** in the onboarding/activation flow?
- **Which users/teams would pay** if pricing existed?
- **What should be built, fixed, or doubled-down on** next?
- **Who is quietly churning** and what predicts that behavior?

The tab needs a complete redesign into a proper Business Intelligence dashboard that replaces vanity stats with actionable, decision-driving metrics organized around the 5-section BI framework.

## User
Platform admin (founder) — sole admin of GolfHelm, needs to understand product health and make data-driven product decisions.

## Acceptance Criteria

- [ ] Tab renamed from "Growth" to "Business Intelligence" across all admin UI (tab nav, keyboard shortcuts, descriptions)
- [ ] All 5 admin tabs reorganized around the BI framework
- [ ] **Section A: Growth** — Signups, activated users (defined as: completed onboarding + submitted first round), activation rate, median time-to-first-value, drop-off between signup and first key action
- [ ] **Section B: Retention** — D1/D7/D30 retention rates, WAU/MAU, DAU/MAU stickiness, weekly cohort retention matrix (by signup week), retention by user type (coach vs player)
- [ ] **Section C: Product Usage** — Feature adoption ranked by % of active users who used each feature in last 7/30 days, repeat usage counts, feature usage by retained vs churned users, dead features detection (<5% adoption), object creation metrics (rounds, qualifiers, events, tasks, messages, documents, reviews, insights)
- [ ] **Section D: Funnel & Friction** — Onboarding step conversion (signup → profile → first round → active week → received insights), biggest drop-off points, error/failure rates affecting engagement
- [ ] **Section E: Health & Opportunity** — Per-team health scores (active users, feature breadth, admin engagement), power user identification, at-risk accounts, conversion-intent proxy signals (high usage, many rounds, team spread, AI adoption, settings engagement)
- [ ] **Vercel Analytics Integration** — Pull unique visitor/device counts from Vercel Web Analytics API and display in the Growth section
- [ ] Recharts-based visualizations (already installed v3.6.0) for cohort heatmaps, funnels, area charts, bar charts
- [ ] Clean, premium glassmorphism UI matching existing admin design system
- [ ] All metrics computed from existing Supabase tables (no new event tracking infrastructure)

## Scope

### In Scope
- Complete redesign of the Growth tab → Business Intelligence tab
- Rename tab in admin navigation (label, icon, description, keyboard shortcut)
- 5-section BI dashboard (Growth, Retention, Product Usage, Funnel & Friction, Health & Opportunity)
- Reorganize other admin tabs as needed to align with BI framework (move overlapping metrics)
- Vercel Web Analytics API integration for unique visitors/devices
- Recharts-based charts replacing custom AdminChart where beneficial
- New computed metrics: activation rate, time-to-value, feature retention correlation, team health scores, conversion proxies
- GolfHelm "aha moment" definition: Completed onboarding + submitted first round
- Power user segment definition: Active 3 of last 4 weeks, ≥3 rounds, used 2+ advanced features

### Out of Scope
- New event-tracking infrastructure (PostHog, Mixpanel, etc.)
- New database tables for raw event storage — all metrics from existing tables
- Real-time WebSocket dashboards (keep 60-second polling pattern)
- Payment/revenue analytics (no payments yet)
- A/B testing framework
- Email/notification automation based on BI signals
- Player-facing analytics (this is admin-only)

## Technical Constraints

1. **Data fetching pattern**: Extend existing `getAdminDashboardData()` server action with parallel Supabase queries. Do not create separate data endpoints.
2. **Admin auth**: All data behind admin role check (already enforced in `admin-data.ts`)
3. **Supabase admin client**: Use `createAdminClient()` to bypass RLS for cross-team analytics
4. **Performance**: Current action runs 100+ parallel queries. New BI metrics must maintain sub-3s total response time. Use `Promise.all()` batching.
5. **Type safety**: Extend `AdminDashboardData` interface with new BI fields. TypeScript strict mode.
6. **No new tables**: All BI metrics computed from existing 75+ golf tables.
7. **Vercel API**: Use Vercel Web Analytics API (REST) called server-side in the data action. Requires `VERCEL_API_TOKEN` env var.

## Technology Stack

- **Frontend**: Next.js 16 App Router, React 19, TypeScript strict, Tailwind CSS
- **Charts**: Recharts 3.6.0 (already installed)
- **Backend**: Server Actions (no REST API routes)
- **Database**: Supabase (PostgreSQL) with admin client
- **External**: Vercel Web Analytics REST API
- **Design System**: Glassmorphism — `bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass`

## Dependencies

- **Affects all 5 admin tabs**: Full reorganization around BI framework
- **Extends `AdminDashboardData` type**: Used by OverviewTab, PeopleTab, SystemTab, GrowthTab
- **Shares data with Overview tab**: Some metrics may move to BI or be referenced from both
- **Vercel API dependency**: Requires Vercel API token in environment variables
- **Existing components reusable**: AdminStatCard, AdminChart, CohortRetentionMatrix, SessionHeatmap (may be enhanced or replaced)

## Configuration

- Stack: nextjs-typescript-supabase
- API Style: server-actions
- Complexity: complex

## GolfHelm Feature Context

### Key Tables for BI Metrics
| Table | BI Signal |
|-------|-----------|
| `users` | Signups, registration dates |
| `golf_players` | Player activation, onboarding status |
| `golf_coaches` | Coach activation, onboarding status |
| `golf_rounds` | Core engagement (round submission = key action) |
| `golf_shots` | Deep engagement signal |
| `golf_team_members` | Team health, seat activation |
| `golf_teams` | Account-level metrics |
| `golf_coach_philosophy` | AI adoption signal |
| `golf_coach_insights` | AI usage frequency |
| `golf_round_reviews` | Coach engagement depth |
| `golf_events` / `golf_tasks` / `golf_messages` | Feature adoption signals |
| `golf_qualifiers` / `golf_documents` / `golf_travel_itineraries` | Feature adoption signals |
| `golf_player_stats_cache` | Stats engagement |
| `golf_attendance_summary` | Event engagement |
| `error_logs` | Product friction / quality signals |

### GolfHelm "Aha Moment" Definition
A user is "activated" when they have:
1. Completed onboarding (`onboarding_completed = true`)
2. Submitted at least one round (`golf_rounds` with `status = 'completed'`)

### Power User Definition
- Active in 3 of last 4 weeks (submitted rounds)
- Completed ≥3 rounds total in last 30 days
- Used 2+ "advanced" features (CoachHelm AI, Qualifiers, Development Plans, Shot Tracking, Stats Deep Dive)

### Conversion Proxy Signals
- Submitted 10+ rounds
- Team has 3+ active players
- Coach uses AI insights weekly
- Coach created development plans
- Admin spent time in settings
- Used 4+ different features in last 30 days

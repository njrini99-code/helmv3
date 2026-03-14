# Admin Dashboard Upgrade Plan

> Compiled from 11 parallel research agents analyzing UI/UX design + data pipelines across all 5 admin tabs.

---

## Executive Summary

The admin dashboard has **strong foundational design** (glass aesthetic, error boundaries, real-time infrastructure) but suffers from:

1. **Fragmented data flows** — main dashboard (60s refresh) vs Tracer (20s) vs CRM (client-side)
2. **Weak cross-tab navigation** — only Overview→System link exists; no drill-through anywhere else
3. **Read-only surveillance** — almost no actionable operations (only Tracer has fix buttons)
4. **Missing business metrics** — no revenue, no churn prediction, no engagement scoring, no goals
5. **Cognitive overload** — too many metrics shown equally; no progressive disclosure
6. **No storytelling** — metrics without context, targets, or narrative interpretation

---

## Cross-Tab Cohesion Fixes (Do First)

These apply to ALL tabs and should be implemented before individual tab upgrades.

### 1. Unified Component Library
Create shared `AdminCard`, `AdminChart`, `AdminTable` components:
- Standardize glass effect: `bg-white/65 backdrop-blur-[16px] border border-white/30 rounded-2xl`
- Standardize padding: `p-4 sm:p-5 md:p-6`
- Replace BI's `GlassCard`, People's `SummaryCard`, System's inline styles

### 2. Cross-Tab Navigation
- Make player/team names clickable everywhere → navigate to People tab filtered
- Error counts → link to System tab incidents
- Health scores → link to relevant diagnostic tab
- Add breadcrumb context bar: `[Tab] / [Context]`

### 3. Shared Status System
Standardize across all tabs:
- Green = Healthy/Good
- Amber = Warning/Needs Attention
- Red = Critical/Action Required
- Blue = Information
- Gray = Neutral/Disabled

### 4. Progressive Disclosure
- Show 3-4 key metrics per section at top
- "Show more" expands to full detail
- Collapse sections admin doesn't use frequently

---

## Tab 1: Overview

### UI/UX Upgrades
| Priority | Change | Rationale |
|----------|--------|-----------|
| P1 | Reorganize into 3 zones: Status → Activity → Analysis | Most important info above fold |
| P1 | Promote critical incidents above KPI cards when active | Action items shouldn't be buried |
| P1 | Replace donut charts with horizontal bar charts | More scannable, easier to compare |
| P1 | Remove redundant metrics (user counts shown in both KPIs and Health) | Reduce noise |
| P2 | Add goal/threshold indicators to onboarding rates | "78% vs 85% target" |
| P2 | Add drill-down CTAs (funnel → People, errors → System) | Currently dead-end |
| P2 | Add "At-Risk Teams" widget (top 5 teams by inactivity) | Actionable insight |
| P3 | Split PlatformHealthCard into "Real-Time Status" + "Infrastructure Snapshot" | Too dense as single card |
| P3 | Add chart annotations for events (deployments, campaigns) | Context for trend spikes |

### Data Upgrades
| Priority | Metric | Source |
|----------|--------|--------|
| P1 | Churn risk banner (# at-risk players/coaches >14d silent) | `users.last_seen` + `golf_rounds.created_at` |
| P1 | CoachHelm adoption % (teams with AI philosophy / total teams) | `golf_coach_philosophy` / `golf_teams` |
| P1 | Engagement depth (actions per active user per week) | Aggregate rounds + reviews + messages + events |
| P1 | WoW/MoM trend comparisons on all KPIs | Compute period-over-period deltas |
| P2 | Time-to-first-value (signup → first round median) | `users.created_at` → first `golf_rounds.created_at` |
| P2 | Feature adoption sparklines (trending up/down per feature) | Weekly counts from feature tables |
| P2 | Cohort retention heatmap (8-week) | Weekly signup cohorts × retention |
| P3 | Insight action rate (% of insights acted on by coaches) | `golf_coach_insights.action_taken` |
| P3 | AI effectiveness (scoring improvement in AI vs non-AI teams) | `golf_player_stats_cache` segmented by `golf_coach_philosophy` |

---

## Tab 2: People

### UI/UX Upgrades
| Priority | Change | Rationale |
|----------|--------|-----------|
| P1 | Add role sub-tabs: All / Coaches / Players / Teams / At-Risk | Can't currently view by role |
| P1 | Add bulk actions (email, reassign team, resend onboarding) with checkboxes | No batch ops exist |
| P1 | Add onboarding status filter (Not Started / In Progress / Completed / Abandoned) | Critical for finding stuck users |
| P1 | Expand activity timeline in detail panel (full history, not just 3 events) | Can't diagnose dropoff causes |
| P2 | Add "Churn Risk" badge + lifecycle stage per user | Only binary active/inactive exists |
| P2 | Add saved filter presets ("Churning", "Never Logged In", "High Performers") | Repetitive filtering |
| P2 | Card layout on mobile instead of table (stacked rows) | Table columns hidden on mobile |
| P3 | Add user impersonation ("View as this user") | Can't diagnose their experience |
| P3 | Add cohort retention matrix (signup week × weeks retained) | No cohort visibility |

### Data Upgrades
| Priority | Metric | Source |
|----------|--------|--------|
| P1 | User engagement score (composite: rounds + reviews + messages + events) | Aggregate across feature tables |
| P1 | User lifecycle stage (brand_new → onboarding → engaged → power_user → at_risk → churned) | Computed from activity signals |
| P1 | Coach effectiveness (review quality, time-to-review, insight adoption rate) | `golf_round_reviews` + `golf_coach_insights` |
| P2 | Player progress tracking (scoring trend, improvement velocity, consistency) | `golf_rounds` + `golf_player_stats_cache` |
| P2 | Team health score (composite: active %, round submission rate, coach engagement) | `golf_team_members` + `golf_rounds` + reviews |
| P2 | Onboarding bottleneck detection (which step loses most users) | Infer from progression signals |
| P3 | Activity pattern analysis (peak usage times, session frequency) | `golf_rounds.created_at` bucketed |

### New RPC Functions Needed
```
get_user_engagement_summary(org_id) → user_id, engagement_tier, lifecycle_stage, metrics
get_team_health_dashboard(team_id) → health_score, health_tier, breakdown
get_coach_effectiveness_metrics(coach_id) → effectiveness_score, review_quality, time_to_review
get_onboarding_funnel_analysis() → step_name, completed_count, stuck_count, completion_rate
```

---

## Tab 3: System

### UI/UX Upgrades
| Priority | Change | Rationale |
|----------|--------|-----------|
| P1 | Add deployment banner (version, commit, deploy time, rollback button) | Can't correlate errors to releases |
| P1 | Add storage quota bar with growth forecast | Only shows size, no capacity planning |
| P1 | Add background job status section (stat cache refresh, insight generation, etc.) | Silent failures invisible |
| P1 | Add mobile "Ops Mode" toggle (sticky status bar + compact incident list) | On-call from phone is painful |
| P2 | Add real-time metrics widget (API latency, error rate, throughput sparklines) | Only snapshot data, no trends |
| P2 | Add incident severity triage lanes (Critical → Error → Warning → Info) | Flat list doesn't prioritize |
| P2 | Add rate limiting visibility (429 errors, throttled requests) | Users hit "mysterious failures" |
| P2 | Add external services status (Supabase, Vercel, Sentry health) | Can't distinguish "our bug" vs "their outage" |
| P3 | Add log explorer (time range, level filter, regex search, live tail) | Can't investigate custom error patterns |
| P3 | Add incident lifecycle (Open → Investigating → In Progress → Resolved → Verified) | Only "Mark Resolved" exists |
| P3 | Add feature flag dashboard with kill-switch | Must deploy to disable crashing feature |

### Data Upgrades
| Priority | Metric | Source |
|----------|--------|--------|
| P1 | API endpoint performance (p50/p95/p99 by route) | New `api_call_logs` table (hourly aggregation) |
| P1 | Error rate trends (hourly granularity, 7d/14d/30d) | New `error_rate_hourly` table |
| P1 | Database query performance (slow queries >1s) | `pg_stat_statements` via RPC |
| P2 | Auth metrics (login success/failure rate trends, session counts) | New `auth_metrics_hourly` table |
| P2 | Background job execution logs | New `background_job_logs` table |
| P2 | Cache hit rates (stats cache effectiveness) | New `cache_metrics_hourly` table |
| P3 | WebSocket connection health (active connections, message throughput) | New `websocket_metrics_hourly` table |
| P3 | Edge function performance | Supabase Management API |

### New Tables Needed
```sql
api_call_logs (route, method, duration_ms, status_code, p50_ms, p95_ms, p99_ms, recorded_at)
error_rate_hourly (hour, total_errors, critical_errors, user_facing_errors, affected_users)
auth_metrics_hourly (hour, successful_logins, failed_logins, active_sessions)
background_job_logs (job_type, status, duration_ms, error_message, started_at, completed_at)
```

### New RPC Functions Needed
```
get_api_performance(days_back) → route, p50, p95, p99, error_rate, call_count
get_system_health_snapshot() → metric_name, value, status, threshold
get_slow_queries(limit) → query, duration_ms, calls, last_executed
```

---

## Tab 4: Intelligence (Business Intelligence)

### UI/UX Upgrades
| Priority | Change | Rationale |
|----------|--------|-----------|
| P1 | Add date range picker (WoW/MoM/custom periods) | All data in fixed windows, no comparison |
| P1 | Add executive summary card at top (platform status + 3-4 key metrics + alerts) | Must scroll to understand platform |
| P1 | Add narrative callouts above each section (1-2 sentence interpretation) | Metrics without context |
| P1 | Make sub-nav sticky | Loses navigation context when scrolling |
| P2 | Add comparison mode toggle ("This week vs. last week") | Can't see if metrics accelerating |
| P2 | Add full lifecycle funnel (signup → onboarding → activation → retention) | Only covers onboarding steps |
| P2 | Add cohort drill-down (click cohort row → segment profile) | Heatmap is read-only |
| P2 | Add team drill-down (click team → detail metrics) | Tables have no clickable rows |
| P2 | Add export buttons (CSV per section, PDF report) | No reporting capability |
| P3 | Add goal/OKR cards with progress bars | No targets or benchmarks |
| P3 | Add forecasting (trend projection on signup/activation charts) | No forward-looking signals |
| P3 | Add competitive benchmarking (percentile rank vs similar teams) | No context for "is this good?" |

### Data Upgrades
| Priority | Metric | Source |
|----------|--------|--------|
| P1 | AI user retention vs non-AI (segmented D7/D30 retention) | `golf_insight_generation_log` × retention |
| P1 | Team health trend (weekly health score change) | Compute delta from `golf_rounds` + members |
| P1 | At-risk account action suggestions | Add remediation hints to risk signals |
| P2 | Feature adoption depth (frequency, not just binary yes/no) | Weekly counts per feature per user |
| P2 | Feature stickiness (% of adopters returning weekly) | Per-feature DAU/WAU |
| P2 | Seasonal trend analysis (this month vs same month last year) | Year-over-year comparison |
| P2 | Geographic/school distribution | Needs `school_id`/`conference` on `golf_teams` |
| P3 | Churn prediction model (probability score per user) | Computed from engagement signals |
| P3 | NPS proxy (insight dismissal rate, review engagement) | `golf_coach_insights.dismissed` |

### New Tables/Views Needed
```sql
-- Materialized views (refresh daily)
mv_player_engagement_weekly (player_id, week, rounds, reviews, messages, events, engagement_score)
mv_team_health_daily (team_id, date, active_player_pct, rounds_this_week, ai_user_count, risk_score)
mv_cohort_retention_matrix (cohort_week, cohort_size, retained_d1, retained_d7, retained_d30, ...)
mv_feature_adoption_timeline (feature_name, week, all_time_count, week_count, active_user_count)
mv_ai_effectiveness_summary (insight_type, team_id, period, generated, acted, improved)

-- Time-series foundation
golf_platform_metrics_daily (snapshot_date, dau, wau, mau, new_signups, rounds_today, ...)
```

---

## Tab 5: Tracer

### UI/UX Upgrades
| Priority | Change | Rationale |
|----------|--------|-----------|
| P1 | Add triage priority column to Rounds table (combines stuck + errors + quality) | Can't scan which rounds need attention |
| P1 | Make health breakdown clickable ("Quality 58% (6 issues)" → Quality tab filtered) | Macro view disconnected from actions |
| P1 | Add cross-tab navigation (player names clickable everywhere) | Must manually search across tabs |
| P1 | Fix incident workflow (Open → Investigating → In Progress → Resolved → Verified) | Only "Mark Resolved" exists |
| P2 | Add round timeline/waterfall view in Diagnostic Modal | Can't see chronological event sequence |
| P2 | Add player profile view (all issues + rounds + errors for one player) | Fragmented across 4 sub-tabs |
| P2 | Add data quality triage board (ranked: which player to fix first) | 5 sections but no unified priority |
| P2 | Add fix recommendation engine (ranked fixes with confidence + estimated time) | Diagnosis exists but remediation is manual |
| P2 | Link raw traces to parent incidents | Relationship between traces and incidents is opaque |
| P3 | Add trend analysis (quality improvement rate, resolution time SLA) | No "are we getting better?" signal |
| P3 | Add round comparison view (healthy vs broken round side-by-side) | Can't pattern-match issues |

### Data Upgrades
| Priority | Metric | Source |
|----------|--------|--------|
| P1 | Shot-level quality audit (distance consistency, lie progression, club selection) | `golf_shots` cross-validation |
| P1 | Hole-by-hole integrity (par/score/GIR/fairway/putt logic) | `golf_holes` validation rules |
| P1 | Round completion funnel (started → holes → shots → completed → cached) | `golf_rounds` status progression |
| P2 | Per-course data quality report (error rate, scoring distribution, metadata completeness) | `golf_rounds` × `golf_courses` |
| P2 | Weekly health snapshots (trend analysis table) | New `golf_tracer_health_snapshot` table |
| P2 | Device/platform breakdown (iOS vs web data quality) | Needs `platform`/`app_version` on `golf_rounds` |
| P2 | Anomaly detection (player-baseline z-scores, not just global thresholds) | `golf_rounds` statistical analysis |
| P3 | Stats cache refresh audit (success/failure rates, SG calculation success) | New `golf_stats_cache_refresh_log` table |
| P3 | Submission error categorization (auto-fixable vs user-intervention) | Error metadata enrichment |

### New RPC Functions Needed
```
rpc_tracer_shot_quality_audit(round_id) → confidence_score, questionable_shots[]
rpc_tracer_hole_integrity_report(round_id) → per_hole severity, composite quality
rpc_tracer_round_funnel_analytics(team_id, days_back) → funnel metrics, abandon analysis
rpc_tracer_course_quality_report(team_id) → per_course quality scores
rpc_tracer_player_scoring_anomalies(player_id) → z_scores, trend, explanations
```

---

## Implementation Phases

### Phase 1: Foundation (1-2 weeks)
- Unified component library (AdminCard, AdminChart, AdminTable)
- Cross-tab navigation system
- Shared status/color system standardization
- Storage quota alerts + deployment banner (System)
- Date range picker component (Intelligence)

### Phase 2: Data Pipeline (2-3 weeks)
- New RPC functions for engagement scoring + team health + coach effectiveness
- Error rate hourly aggregation table + API performance logging
- Materialized views for BI (engagement weekly, team health daily, cohort retention)
- Tracer shot/hole integrity validation RPCs

### Phase 3: UI Upgrades (2-3 weeks)
- Overview reorganization (3 zones, remove redundancy)
- People role sub-tabs + bulk actions + lifecycle badges
- System ops mode + background job status + incident triage
- Intelligence executive summary + narrative callouts + comparison mode
- Tracer triage priority + cross-linking + timeline view

### Phase 4: Polish (1-2 weeks)
- Mobile optimization across all tabs
- Progressive disclosure (collapse/expand)
- Export/reporting capability
- Goal/target tracking
- Trend forecasting

---

## New Database Objects Summary

### Tables (6 new)
1. `api_call_logs` — API performance per route
2. `error_rate_hourly` — Error trends
3. `auth_metrics_hourly` — Login/session trends
4. `background_job_logs` — Async job tracking
5. `golf_platform_metrics_daily` — Platform KPI snapshots
6. `golf_tracer_health_snapshot` — Weekly tracer health

### Materialized Views (5 new)
1. `mv_player_engagement_weekly`
2. `mv_team_health_daily`
3. `mv_cohort_retention_matrix`
4. `mv_feature_adoption_timeline`
5. `mv_ai_effectiveness_summary`

### RPC Functions (12+ new)
- User: `get_user_engagement_summary`, `get_onboarding_funnel_analysis`
- Team: `get_team_health_dashboard`, `get_coach_effectiveness_metrics`
- System: `get_api_performance`, `get_system_health_snapshot`, `get_slow_queries`
- BI: `compute_player_churn_risk`, `compute_ai_value_lift`
- Tracer: `rpc_tracer_shot_quality_audit`, `rpc_tracer_hole_integrity_report`, `rpc_tracer_round_funnel_analytics`, `rpc_tracer_course_quality_report`

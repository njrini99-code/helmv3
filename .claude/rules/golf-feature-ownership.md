---
paths:
  - "src/app/golf/**"
  - "src/lib/golf/**"
  - "src/components/golf/**"
  - "src/app/api/golf/**"
---

## COACH vs PLAYER vs TEAM — Feature Ownership

### Coach-Only Features

> **The coach intelligence surfaces were consolidated (2026-07-19 → 07-22).**
> Alerts, Patterns, Insights, Development Plans and CoachHelm Analytics are no
> longer routes of their own — they are **views inside `/dashboard/intelligence`**,
> reached by query string. The old paths survive only as `permanentRedirect`
> shims (registered `legacy: true, hidden: true` in
> `src/lib/golf/surface-registry.ts`, with belt-and-braces rules in
> `next.config.mjs`). **Editing a shim does not change what any user sees** —
> change the view inside `/dashboard/intelligence` instead.
>
> Their **action files are still live** and still the right place for data work;
> the consolidated pages call them. Only the routes are retired.

| Feature | Where it lives now | Primary Table | Action File |
|---------|--------------------|---------------|-------------|
| Intelligence Hub | `/dashboard/intelligence` — the real page | (multiple CoachHelm) | intelligence-dashboard.ts |
| Alerts | `…/intelligence?view=signals&filter=alerts` | golf_coach_insights | alerts.ts |
| Patterns | `…/intelligence?view=signals&filter=patterns` | golf_patterns_v2 | pattern-management.ts |
| Insights | `…/intelligence?view=signals&filter=insights` | golf_coach_insights | insight-management.ts |
| Development Plans | `…/intelligence?view=players` | golf_player_focus_areas | development.ts |
| CoachHelm Analytics | `…/intelligence?view=effectiveness` | golf_insight_effectiveness | coachhelm-analytics.ts |
| Coaching Settings | `/dashboard/settings/coaching-intelligence` | golf_coach_philosophy | (in settings page) |
| Create Qualifier | `/dashboard/qualifiers/new` | golf_qualifiers | golf.ts |
| Team Stats | `/dashboard/stats/team` | golf_player_stats_cache | stats.ts, stats-data.ts, stats-leak-maps.ts, stats-intelligence.ts |
| Player deep-dive | `/dashboard/players/[playerId]/game` (bare `[playerId]` redirects here) | golf_coach_insights | (see features doc) |

### Player-Only Features

> Same consolidation on the player side: the `my-*` surfaces are now **views
> inside `/dashboard/coachhelm`**, and `/dashboard/hub` folded into
> `/dashboard`. The old paths are redirect shims — see the note above.

| Feature | Where it lives now | Primary Table | Action File |
|---------|--------------------|---------------|-------------|
| Player CoachHelm | `/dashboard/coachhelm` — the real page | golf_predictions | shot-analytics.ts |
| Player home | `/dashboard` (was `/dashboard/hub`) | (travel, tasks, events) | dashboard-data.ts |
| My Development | `…/coachhelm?view=development` | golf_player_focus_areas | development.ts |
| My Standing | `…/coachhelm?view=standing` | golf_player_stats_cache | stats-data.ts |
| My Game Profile | `…/coachhelm?view=profile` | golf_predictions | shot-analytics.ts |
| My Insights | `…/coachhelm` (no separate view) | golf_coach_insights | — |
| My Qualifiers | `/dashboard/my-qualifiers` | golf_qualifier_entries | golf.ts |
| Round Entry | `/dashboard/rounds/new` | golf_rounds | golf.ts |
| Continue Round | `/dashboard/rounds/continue/[id]` | golf_shots | golf.ts |
| Round Review | `/dashboard/rounds/[id]/review` | golf_round_reviews | round-reviews.ts, round-review-system.ts |
| Classes | `/dashboard/classes` | golf_player_classes | (inline) |

### Team Features (Both Coach + Player)
| Feature | Route | Primary Table | Action File |
|---------|-------|---------------|-------------|
| Calendar & Events | `/dashboard/calendar` | golf_events | event-lifecycle.ts, attendance.ts |
| Roster | `/dashboard/roster` | golf_team_members | roster.ts |
| Messaging | `/dashboard/messages` | golf_messages | messages.ts |
| Announcements | `/dashboard/announcements` | golf_announcements | announcements.ts |
| Tasks | `/dashboard/tasks` | golf_tasks | tasks.ts |
| Documents | `/dashboard/documents` | golf_documents | documents.ts |
| Travel | `/dashboard/travel` | golf_travel_itineraries | travel.ts |
| Qualifiers (view) | `/dashboard/qualifiers` | golf_qualifiers | golf.ts |
| Stats (personal) | `/dashboard/stats` | golf_player_stats_cache | stats.ts, stats-data.ts, stats-leak-maps.ts, stats-intelligence.ts |
| Team Info | `/dashboard/team` | golf_teams | teams.ts |
| Settings | `/dashboard/settings` | users, golf_coaches/players | (inline) |

### Platform (Admin)
| Feature | Route | Action File |
|---------|-------|-------------|
| Admin Dashboard | `/golf/admin` | admin-data.ts |
| Join Team | `/golf/join/[code]` | roster.ts |

---

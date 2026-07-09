# GolfHelm Feature Registry

> Complete feature-level documentation: behavior maps, current state, and cross-feature dependencies.
> Last verified: 2026-02-13
> Source: Traced through actual codebase, not specs.

---

## Feature Status Legend

| Symbol | Meaning |
|--------|---------|
| ✅ | Complete and production-ready |
| ⚠️ | Partially implemented (key gaps noted) |
| ❌ | Scaffolded only (DB tables exist, logic missing) |

---

## TABLE OF CONTENTS

**Core Data Features:**
1. Round Tracking ✅
2. Stats & Analytics ✅
3. Qualifiers ✅

**Team Management Features:**
4. Calendar & Events ⚠️
5. Roster Management ✅
6. Task Management ⚠️
7. Messaging ✅
8. Announcements ✅
9. Documents ✅
10. Travel ⚠️
11. Academics / Classes ✅

**CoachHelm AI Features:**
12. CoachHelm AI Engine ⚠️
13. Alerts System ✅
14. Patterns Dashboard ✅
15. Insights Management ✅
16. Intelligence Dashboard ✅
17. CoachHelm Analytics ⚠️
18. Coaching Intelligence Settings ✅

**Player-Facing Features:**
19. Player Hub (merged into Dashboard Action Center, 2026-07-09) ✅
20. Player CoachHelm Dashboard ✅
21. My Development ✅
22. My Qualifiers ✅
23. Round Review (AI) ✅

**Platform Features:**
24. Team Info Page ✅
25. Development Plans (Coach) ✅
26. Settings ✅
27. Join Team Flow ✅
28. Admin Dashboard ✅

---

## 1. ROUND TRACKING ✅

### What It Does
Players create rounds with shot-by-shot tracking. Rounds populate stats, trigger AI reviews, and feed qualifier leaderboards.

### Data Flow
```
/golf/dashboard/rounds/new → NewRoundClient (4-step wizard)
  Step 1: Setup (course, type, qualifier selection, saved courses)
  Step 2: Hole config (par/yardage per hole, or skip if saved course)
  Step 3: Shot tracking (ShotTrackingComprehensive component)
    → Auto-save every 15s via useAutoSaveRound hook
    → Draft saved to golf_rounds (status: in_progress)
  Step 4: Submit → submitGolfRoundComprehensive()
    → WRITE golf_rounds (status: completed)
    → WRITE golf_holes (9-18 records)
    → WRITE golf_shots (50-120 records)
    → ASYNC: invalidateOnRoundComplete() → stats cache
    → ASYNC: triggerPlayerInsightsAfterRound() → CoachHelm
    → ASYNC: generateRoundReview() → AI review
    → ASYNC: updateQualifierEntryStats() (if qualifier)

/golf/dashboard/rounds/continue/[id] → Resume in-progress round
  → Loads round with status='in_progress'
  → Maps existing golf_shots → ShotRecord format
  → Reconstructs shot sequences, putt miss tags, approach miss directions
  → Loads course hole yardages for reference
  → Resumes from current_hole position
```

### Key Files
| Type | Path |
|------|------|
| Route (new) | `src/app/golf/(dashboard)/dashboard/rounds/new/page.tsx` |
| Route (list) | `src/app/golf/(dashboard)/dashboard/rounds/page.tsx` |
| Route (detail) | `src/app/golf/(dashboard)/dashboard/rounds/[id]/page.tsx` |
| Route (review) | `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` |
| Route (continue) | `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx` |
| Client wizard | `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx` |
| Shot tracking | `src/components/golf/ShotTrackingComprehensive.tsx` |
| Actions | `src/app/golf/actions/golf.ts` (submit, save, delete) |
| Drafts | `src/app/golf/actions/round-drafts.ts` |
| Reviews | `src/app/golf/actions/round-reviews.ts` |
| Shot analytics | `src/app/golf/actions/shot-analytics.ts` |
| Auto-save hook | `src/hooks/golf/use-auto-save-round.ts` |
| Offline engine | `src/lib/offline/sync-engine.ts` |

### DB Tables
| Table | Role |
|-------|------|
| golf_rounds | Parent record (player, course, scores, status) |
| golf_holes | Per-hole data (par, score, putts, fairway, GIR) |
| golf_shots | Shot-level (club, lie, distance, result, shot_type, miss direction) |
| golf_round_reviews | AI-generated reviews |
| golf_player_stats_cache | Aggregated player stats (50+ columns) |
| golf_round_stats_cache | Per-round stat summaries |
| golf_putting_tendencies | Putting analysis cache |
| golf_player_courses | Saved course configurations |
| golf_courses | Course records |
| golf_course_holes | Course hole yardages |

### Dependencies
- **Feeds into**: Stats Cache, CoachHelm AI, Qualifiers, Round Reviews
- **Depends on**: Courses (golf_courses), Qualifiers (if qualifier round)

### Known Gaps
| Gap | Severity | Details |
|-----|----------|---------|
| Draft data in notes field | Low | Draft JSON stored in golf_rounds.notes, collides with user notes. Needs dedicated draft_data column. |
| Offline shot sync disabled | Medium | IndexedDB offline storage disabled due to ShotRecord ↔ OfflineShot type mismatch. DB auto-save still works. |
| Coach verification workflow | Low | Sharing framework exists (shared_with_coach field), but formal approval workflow not built. |
| Strokes Gained not calculated | Medium | SG framework exists but not populated from shot data. Stats cache SG columns are null. |
| Putts-per-GIR | Low | Not properly implemented (set to null). Needs hole-level GIR data to calculate. |

---

## 2. STATS & ANALYTICS ✅

### What It Does
Aggregated player and team statistics with 50+ metrics, cached for performance. Includes scoring, short game, long game, course-by-course breakdowns, and trend analysis.

### Data Flow
```
Round completion → invalidateOnRoundComplete()
  → Mark golf_player_stats_cache stale (via Redis invalidation)
  → Attempt SG recalculation RPCs (non-critical, may not exist)
  → golf_round_stats_cache: populated at round submit time, not recalculated here
  → golf_putting_tendencies: NOT updated by this function (table exists but no app-level writes)

Stats pages:
  /golf/dashboard/stats → Player personal stats
  /golf/dashboard/stats/team → Team-wide analytics (coach only)

Player profile:
  /golf/dashboard/roster/[id] → PlayerStatsSection (coach viewing player)
    → Scoring stats, Short game, Long game
    → Course-by-course breakdown
    → Trend charts (Suspense-loaded)
```

### Key Files
| Type | Path |
|------|------|
| Route (player) | `src/app/golf/(dashboard)/dashboard/stats/page.tsx` |
| Route (team) | `src/app/golf/(dashboard)/dashboard/stats/team/page.tsx` |
| Actions | `src/app/golf/actions/stats.ts`, `stats-v2.ts`, `stats-data.ts` |
| Player stats | `src/app/golf/actions/player-profile-stats.ts` |
| Components | `src/components/golf/stats/` |
| Cache calculator | `src/lib/cache/golf-stats-calculator.ts` |

### DB Tables
| Table | Role |
|-------|------|
| golf_player_stats_cache | 50+ stat columns (scoring avg, fairway %, GIR %, putting avg, etc.) |
| golf_round_stats_cache | Per-round stat summaries |
| golf_putting_tendencies | Putting analysis (break patterns, distance buckets, miss direction) |

### Dependencies
- **Depends on**: Rounds (source data), Shots (detailed metrics)
- **Feeds into**: CoachHelm AI (pattern mining uses stats), Player Profiles, Development Plans

### Known Gaps
| Gap | Severity | Details |
|-----|----------|---------|
| Strokes Gained not populated | Medium | SG columns exist in stats cache but are null. Framework exists in codebase. |
| golf_putting_tendencies never written | Medium | Table exists in DB with RLS policies, but no app code writes to it. Stats cache invalidation does NOT update it despite being documented as a dependency. |
| Stats cache is lazy-refresh | Low | `invalidateOnRoundComplete()` marks cache stale via Redis; actual recalculation happens lazily on next read via `getStatsFromCache()` → `refreshStatsCache()`. |

---

## 3. QUALIFIERS ✅

### What It Does
Multi-round qualifier events with live leaderboard, position/tie calculation, and integration with round tracking.

### Data Flow
```
Coach: createGolfQualifier() → INSERT golf_qualifiers + golf_qualifier_entries
Player: submits round with qualifier_id → linked via golf_rounds.qualifier_id
System: updateQualifierEntryStats() → aggregates scores across rounds
Display: getQualifierLeaderboard() → positions, ties, totals
```

### Key Files
| Type | Path |
|------|------|
| Route (list) | `src/app/golf/(dashboard)/dashboard/qualifiers/page.tsx` |
| Route (detail) | `src/app/golf/(dashboard)/dashboard/qualifiers/[id]/page.tsx` |
| Route (new) | `src/app/golf/(dashboard)/dashboard/qualifiers/new/page.tsx` |
| Actions | `src/app/golf/actions/golf.ts` (qualifier functions) |
| Components | `src/components/golf/qualifiers/` |
| Hook | `src/hooks/golf/use-qualifier-realtime.ts` |

### DB Tables
golf_qualifiers, golf_qualifier_entries

### Dependencies
- **Depends on**: Rounds (qualifier rounds update entries)
- **Feeds into**: Calendar Events (qualifier as event type)

---

## 4. CALENDAR & EVENTS ⚠️

### What It Does
Full event management with RSVP, attendance tracking, recurring events, iCal feeds, and academic conflict detection. (Availability polling is NOT built — see Sub-Features below.)

### Data Flow
```
Coach creates event → createGolfEvent() → golf_events
  → Optional: send invitations to players
  → Optional: link to qualifier or travel itinerary

Player responds → respondToEvent() → golf_event_attendance
  → Status: pending | accepted | declined | tentative

Coach checks in → AttendanceCheckIn component
  → Updates checked_in + checked_in_at
  → Absence reason collection

Calendar views: MonthView, WeekView, DayView, MobileListView
  → All render from golf_events data
  → Conflict detection against classes and blocked time
```

### Sub-Features

**Recurring Events** ✅ — RRULE parsing, edit scopes: this | thisAndFuture | all
**Availability Polling** ❌ — NOT BUILT (backlog). No `availability-polling.ts`/`availability-locking.ts` or any poll UI exists in code; `golf_availability_polls`/`golf_poll_responses` are orphaned schema only (verified 2026-07-09, zero references in `src/`).
**iCal Feeds** ✅ — Token auth, RFC 5545 compliant, rate limited
**Event Status Lifecycle** ✅ — draft → confirmed → completed | cancelled
**Academic Conflict Detection** ✅ — Checks classes, blocked time, exclusions

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/calendar/page.tsx` |
| Wrapper | `src/components/golf/calendar/GolfCalendarWrapper.tsx` |
| Views | `MonthView.tsx`, `WeekView.tsx`, `DayView.tsx`, `MobileCalendarWrapper.tsx` |
| Actions | `event-lifecycle.ts`, `recurring-events.ts`, `attendance.ts` |
| Polling | _not built — no files exist (backlog)_ |
| Feeds | `calendar-feeds.ts`, `calendar-sync.ts`, `caldav-sync.ts` |
| Conflicts | `src/lib/calendar/conflicts.ts`, `src/lib/calendar/ical.ts` |

### DB Tables (17 tables)
golf_events, golf_event_attendance, golf_event_exclusions, golf_event_status_log, golf_availability_polls, golf_poll_responses, golf_academic_exclusions, golf_player_availability_blocks, golf_coach_blocked_time, golf_attendance_summary, golf_player_attendance_stats, golf_calendar_feeds, golf_calendar_notifications, golf_calendar_sync_log, golf_calendar_sync_state, golf_external_calendars, golf_recurring_events

### Dependencies
- **Feeds into**: Travel (event_id links), Qualifiers (qualifier events), Attendance stats
- **Depends on**: Player Classes (conflict detection), Team Members (attendee list)

---

## 5. ROSTER MANAGEMENT ✅

### What It Does
Invite-code-based team building. Coach generates code, players join via link, coach approves. Multi-status player management with detailed player profiles.

### Data Flow
```
Coach team has invite_code → /golf/join/[code]
Player submits → INSERT golf_team_join_requests (status: pending)
Coach approves → INSERT golf_team_members (status: active)
Coach manages → UPDATE golf_team_members.status (active|inactive|redshirt|medical|transfer)

Roster list view:
  → Player cards with avatar, name, year, handicap
  → Online status (users.last_seen < 5 min)
  → Recent rounds count, average score
  → Pending join requests section
  → Invite new player button

Player profile (/roster/[id]):
  → Profile header (name, avatar, year, contact)
  → Status & role badges
  → Recent rounds (last 5)
  → Suspense-loaded stats sections:
    → Scoring stats, Short game, Long game
    → Course-by-course breakdown
    → Trend charts
```

### Key Files
| Type | Path |
|------|------|
| Route (list) | `src/app/golf/(dashboard)/dashboard/roster/page.tsx` |
| Route (detail) | `src/app/golf/(dashboard)/dashboard/roster/[id]/page.tsx` |
| Join flow | `src/app/golf/join/[code]/page.tsx` |
| Actions | `src/app/golf/actions/roster.ts` |
| Components | `src/components/golf/roster/` |

### DB Tables
golf_players, golf_team_members, golf_team_join_requests, golf_teams, golf_team_coach_staff, users (last_seen)

---

## 6. TASK MANAGEMENT ⚠️

### What It Does
Coach assigns tasks to players. Players complete them with optional file uploads. Templates and reminders exist but auto-triggering is missing.

### Data Flow
```
createTask() → INSERT golf_tasks + golf_task_assignments per player
completeTask() → UPDATE golf_task_assignments (status, upload_url, notes)
createTaskFromTemplate() → uses golf_task_templates for defaults
setTaskReminder() → sets golf_tasks.reminder_at (NOT auto-triggered)
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/tasks/page.tsx` |
| Actions | `tasks.ts`, `task-templates.ts`, `task-reminders.ts` |
| Components | `src/components/golf/tasks/` (18 components) |
| Hook | `src/hooks/golf/use-task-realtime.ts` |

### DB Tables
golf_tasks, golf_task_assignments, golf_task_templates, golf_task_reminders

### Known Gaps
| Gap | Severity | Details |
|-----|----------|---------|
| Reminder auto-send missing | Medium | reminder_at field set but no scheduled job triggers notifications |

---

## 7. MESSAGING ✅

### What It Does
Team messaging with realtime updates, file attachments, read receipts, and typing indicators.

### Data Flow
```
sendGolfMessageWithAttachments()
  → Upload files to Supabase Storage (client-side)
  → INSERT golf_messages (has_attachments flag)
  → INSERT golf_message_attachments (per file)
  → UPDATE golf_conversation_participants.last_read_at
  → Supabase Realtime pushes to all participants
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/messages/page.tsx` |
| Actions | `messages.ts`, `message-attachments.ts` |
| Components | `src/components/golf/messages/` |
| Hook | `src/hooks/golf/use-golf-messages.ts` |

### DB Tables
golf_conversations, golf_conversation_participants, golf_messages, golf_message_attachments

---

## 8. ANNOUNCEMENTS ✅

### What It Does
Coach-to-team announcements with urgency levels, linked tasks/documents, targeted recipients, and acknowledgement tracking.

### Data Flow
```
createEnrichedAnnouncement() (transaction):
  → INSERT golf_announcements
  → INSERT golf_announcement_recipients (if targeted, else broadcast)
  → INSERT golf_announcement_documents (with sort_order)
  → For each inline task:
    → INSERT golf_tasks
    → INSERT golf_announcement_tasks (with sort_order)
    → INSERT golf_task_assignments (per recipient player)
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/announcements/page.tsx` |
| Actions | `src/app/golf/actions/announcements.ts` |
| Components | `src/components/golf/announcements/` |

### DB Tables
golf_announcements, golf_announcement_acknowledgements, golf_announcement_documents, golf_announcement_recipients, golf_announcement_tasks

### Dependencies
- **Depends on**: Tasks (inline task creation), Documents (linking)

---

## 9. DOCUMENTS ✅

### What It Does
Team document library with versioning, categories, and visibility controls. Links to announcements.

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/documents/page.tsx` |
| Actions | `src/app/golf/actions/documents.ts` |
| Components | `src/components/golf/documents/` |

### DB Tables
golf_documents, golf_document_versions

---

## 10. TRAVEL ⚠️

### What It Does
Travel itinerary creation is complete. Budget and expense tracking exists in DB but is not wired up.

### Data Flow
```
createTravelItinerary()
  → INSERT golf_travel_itineraries (transport, hotel, flight, gear list, room assignments)
  → Links to golf_events via event_id

Player view (via the Dashboard's Action Center, formerly the standalone Player Hub — see Feature 19):
  → Trip cards with destination, transport type, dates
  → Hotel info (name, address, phone, confirmation #)
  → Packing list, room assignments, uniform requirements
  → Status badges: upcoming, in transit, completed

Budget/Expenses (IMPLEMENTED in travel.ts):
  → golf_travel_budgets: setBudget(), getBudgetsForItinerary()
  → golf_travel_expenses: full CRUD + receipt upload + CSV export
  → golf_travel_expense_splits (table exists, referenced but no dedicated split logic)
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/travel/page.tsx` |
| Actions | `src/app/golf/actions/travel.ts` |
| Components | `src/components/golf/travel/` |

### DB Tables
golf_travel_itineraries, golf_travel_budgets, golf_travel_expenses, golf_travel_expense_splits

### Known Gaps
| Gap | Severity | Details |
|-----|----------|---------|
| Expense splits incomplete | Medium | Table exists but no split calculation or per-player assignment logic |
| Budget UI may be missing | Low | CRUD functions exist in travel.ts but verify UI components expose them |

---

## 11. ACADEMICS / CLASSES ✅

### What It Does
Player class schedule management with CSV import, calendar sync, weekly grid view, and academic conflict detection.

### Data Flow
```
Player adds classes:
  → Manual: AddClassModal form → INSERT golf_player_classes
  → Import: UploadScheduleModal → CSV parse → ConfirmClassesModal → bulk INSERT
  → Each class: optional syncClassToCalendar() → INSERT golf_events

Views:
  → Weekly schedule grid (Mon-Fri)
  → All classes list
  → Quick stats: total classes, credits, days/week, buildings

Calendar integration:
  → Classes sync to golf_events for conflict detection
  → removeClassFromCalendar() cleans up events
  → Academic exclusion periods block scheduling
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/classes/page.tsx` |
| Components | `src/components/golf/classes/` (AddClassModal, UploadScheduleModal, ConfirmClassesModal, ClassDetailModal) |

### DB Tables
| Table | Role |
|-------|------|
| golf_player_classes | Class records (name, instructor, days[], start/end time, building, room, credits, color) |
| golf_academic_exclusions | Date ranges to exclude from scheduling |
| golf_events | Calendar sync target for classes |

### Dependencies
- **Feeds into**: Calendar (conflict detection), Events (scheduling around classes)

---

## 12. COACHHELM AI ENGINE ⚠️ (75% complete)

### What It Does
AI intelligence layer that mines patterns from player data, generates insights, predicts performance, and creates round reviews — all personalized by the coach's philosophy settings.

### Data Flow
```
TRIGGER: Round completion → triggerPlayerInsightsAfterRound()
  OR: Manual → analyzePlayer() from insights dashboard
  OR: Team-wide → generateTeamAlerts() from alerts page

V2 ORCHESTRATOR PIPELINE:
  1. extractAllFeatures() → temporal, contextual, sequence features
  2. PatternMiner.minePatterns() → conditional, compound, anomaly patterns
  3. ShotPatternMiner → shot-level miss patterns
  4. LieSpecificAnalysis → dispersion analysis
  5. CausalEngine → root cause discovery
  6. PerformancePredictor → score predictions + confidence calibration
  7. Generate insights (stats → correlation → patterns → predictions)
  8. Filter by coach philosophy (alert toggles + confidence threshold)
  9. Persist to golf_coach_insights / golf_patterns_v2

ROUND REVIEW PIPELINE:
  1. Analyze round stats
  2. Mine round-specific patterns
  3. Discover causal relationships
  4. Generate prediction vs actual comparison
  5. Compose NLG review (summary, highlights, areas, takeaway)
  6. Persist to golf_round_reviews
```

### Sub-Features

**Pattern Mining** ✅ — 10+ mining modules, pattern lifecycle: detected → confirmed → addressed → resolved | dismissed
**Performance Predictions** ✅ — Score predictions with confidence calibration
**Round Reviews** ✅ — Auto-generated, V1 rule-based + V2 full pipeline
**Coach Philosophy** ⚠️ — Settings UI complete, but priority ranking NOT wired to insight ordering, weight distribution NOT used in predictions
**Insight Effectiveness** ⚠️ — DB schema ready, no server actions or UI
**Player Development** ⚠️ — Focus area CRUD works, outcome measurement not connected
**Feature Gates** ✅ — Three-level control: global env, per-user, per-team

### Key Files
| Type | Path |
|------|------|
| V2 Orchestrator | `src/lib/coachhelm/v2/orchestrator.ts` (1509 lines) |
| Gate | `src/lib/coachhelm/v2/gate.ts` |
| Mining (10+ files) | `src/lib/coachhelm/v2/mining/` |
| Predictions | `src/lib/coachhelm/v2/prediction/` |
| Features | `src/lib/coachhelm/v2/features/` (temporal, sequence, contextual) |
| Learning | `src/lib/coachhelm/v2/learning/` |
| Reasoning | `src/lib/coachhelm/v2/reasoning/` |
| NLG | `src/lib/coachhelm/v2/nlg/insight-composer.ts` |
| Persistence | `src/lib/coachhelm/v2/services/insight-persistence.ts` |
| Types & constants | `src/lib/coachhelm/types.ts`, `constants.ts` |
| Actions | `insight-management.ts`, `pattern-management.ts`, `round-reviews.ts`, `alerts.ts`, `coachhelm-analytics.ts`, `development.ts` |
| UI (80+ components) | `src/components/golf/coachhelm/` |

### DB Tables (18 CoachHelm tables)
golf_coach_philosophy, golf_coachhelm_settings, golf_team_coachhelm_settings, golf_coach_insights, golf_player_focus_areas, golf_round_reviews, golf_review_events, golf_review_insights, golf_patterns_v2, golf_predictions, golf_validations, golf_learned_behavior, golf_insight_generation_log, golf_insight_effectiveness, golf_insight_feedback, golf_insight_weights, golf_prediction_model_performance, golf_player_insight_preferences

### Dependencies
- **Depends on**: Rounds (primary data source), Stats Cache, Player Profiles
- **Feeds into**: Alerts, Patterns, Insights, Intelligence, Round Reviews, Development Plans, CoachHelm Analytics

### Known Gaps
| Gap | Severity | Details |
|-----|----------|---------|
| Philosophy priority ranking unused | Medium | Insights returned in hard-coded order, not by coach priorities |
| Philosophy weights unused | Medium | Prediction model uses fixed weights (60/20/10/5/5), ignores coach weights |
| Effectiveness tracking not wired | High | DB schema ready, no server actions or UI to track/display |
| Outcome measurement missing | High | No workflow for coaches to mark insights as improved/no_change/worsened |
| Player insight preferences no UI | Low | Table exists, no settings page for players |
| Behavior learner incomplete | Medium | Code exists but not integrated into insight pipeline |
| Team pattern generation unused | Low | Generator exists but rarely called |
| V1 dead code | Low | 16,808 lines of deprecated V1 code, safe to remove |
| N+1 queries in team alerts | Medium | Each player triggers 5+ DB queries during team alert generation |

---

## 13. ALERTS SYSTEM ✅

### What It Does
AI-generated real-time alerts that notify coaches about players needing attention — scoring decline, stat regression, tournament pressure, plateau detection, and more. Coach-only feature.

### Data Flow
```
/golf/dashboard/alerts → AlertsPage (server) → AlertsClient (client)
  → getCoachAlerts() → READ golf_coach_insights WHERE is_alert=true
  → Display: AlertCard per alert with level badges

Coach actions:
  → acknowledgeAlert(id) → UPDATE golf_coach_insights.acknowledged_at
  → dismissAlert(id) → UPDATE golf_coach_insights.dismissed=true
  → acknowledgeAllAlerts() → bulk UPDATE
  → dismissAllAlerts(level) → bulk UPDATE by level

Manual scan:
  → "Scan Team" button → generateAlerts()
  → Runs CoachHelm V2 pipeline → INSERT new alerts to golf_coach_insights

Filtering:
  → Level filters: All | Critical | Warning | Info | Suggestion
  → Toggle: Show/hide acknowledged
  → Badge counts per level
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/alerts/page.tsx` |
| Actions | `src/app/golf/actions/alerts.ts` |
| Components | `src/components/golf/coachhelm/alerts/` (AlertCard, etc.) |

### DB Tables
| Table | Role |
|-------|------|
| golf_coach_insights | Stores alerts (insight_type, priority, status, acknowledged_at, dismissed) |
| golf_coach_philosophy | Alert sensitivity config (aggressive/balanced/conservative), 11 alert type toggles |

### Dependencies
- **Depends on**: CoachHelm AI Engine (generates alerts), Coach Philosophy (filters)
- **Feeds into**: Development Plans (alerts can trigger focus area creation)

---

## 14. PATTERNS DASHBOARD ✅

### What It Does
Visual dashboard for coaches to view, validate, dismiss, or resolve AI-detected performance patterns across the team.

### Data Flow
```
/golf/dashboard/patterns → PatternsDashboardClient
  → getTeamPatterns() → READ golf_patterns_v2 with lifecycle state
  → getPatternStats() → Aggregated: total, detected, confirmed, addressed,
                         resolved, dismissed, by player, by type, by severity

Coach actions:
  → Validate pattern → UPDATE status: detected → confirmed
  → Address pattern → UPDATE status: confirmed → addressed
  → Resolve pattern → UPDATE status: addressed → resolved
  → Dismiss pattern → UPDATE status → dismissed
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/patterns/page.tsx` |
| Actions | `src/app/golf/actions/pattern-management.ts` |
| Components | `src/components/golf/coachhelm/patterns/` (PatternDashboard, PatternCard, PatternTimeline) |

### DB Tables
| Table | Role |
|-------|------|
| golf_patterns_v2 | Pattern records: type, conditions, outcome, confidence, lift, conviction, stroke_impact, trend, lifecycle state |

### Dependencies
- **Depends on**: CoachHelm AI Engine (mines patterns from round data)

---

## 15. INSIGHTS MANAGEMENT ✅

### What It Does
Searchable, filterable dashboard for coaches to manage all AI-generated insights across the team. Full CRUD with bulk actions and export.

### Data Flow
```
/golf/dashboard/insights → InsightsPageContent (client)
  → getInsightFilterOptions(coachId) → available players, types, priorities
  → Search + filter → paginated query on golf_coach_insights
  → Actions: acknowledge, dismiss, export, bulk operations

Filters:
  → Full-text search (title + content)
  → Player dropdown
  → Insight type (scoring_decline, stat_regression, pattern_detected, etc.)
  → Priority (critical, high, medium, low)
  → Status (new, acknowledged, dismissed)
  → Date range
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/insights/page.tsx` |
| Actions | `src/app/golf/actions/insight-management.ts`, `insight-evidence.ts` |
| Components | `src/components/golf/coachhelm/insights/` (InsightCard, InsightListView, InsightFiltersPanel, InsightSearchBar, InsightBulkActions, InsightExportModal) |

### DB Tables
golf_coach_insights, golf_insight_effectiveness, golf_insight_feedback

### Dependencies
- **Depends on**: CoachHelm AI Engine (generates insights)

---

## 16. INTELLIGENCE DASHBOARD ✅

### What It Does
Central intelligence hub displaying CoachHelm V2's team-wide AI analysis — insights, patterns, predictions, and coaching intelligence in one view. Coach-only.

### Data Flow
```
/golf/dashboard/intelligence → IntelligenceCommandCenter (variant="page")
  → Renders full-page CoachHelm V2 intelligence view
  → Team-wide metrics, per-player intelligence
  → Aggregates insights, patterns, predictions
  → Correlation discovery between metrics
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/intelligence/page.tsx` |
| Actions | `src/app/golf/actions/intelligence-dashboard.ts` |
| Components | `src/components/golf/coachhelm/v2/IntelligenceCommandCenter` |

### DB Tables
Multiple CoachHelm tables: golf_patterns_v2, golf_predictions, golf_coach_insights, golf_coach_philosophy, golf_learned_behavior

### Dependencies
- **Depends on**: CoachHelm AI Engine (all sub-systems)

---

## 17. COACHHELM ANALYTICS ⚠️

### What It Does
Coach-facing analytics dashboard measuring CoachHelm AI system effectiveness — insight adoption, prediction accuracy, pattern impact.

### Data Flow
```
/golf/dashboard/analytics/coachhelm → CoachHelmAnalyticsPage
  → getCoachHelmOverview(teamId) → overview metrics
  → getInsightEffectiveness(teamId) → adoption rates, accuracy
  → getPredictionPerformance(teamId) → model accuracy by category
  → getPatternImpact(teamId) → performance correlation with patterns
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/page.tsx` |
| Actions | `src/app/golf/actions/coachhelm-analytics.ts` |
| Components | `src/components/golf/coachhelm/analytics/` |

### DB Tables
golf_coach_insights, golf_insight_effectiveness, golf_predictions, golf_patterns_v2, golf_prediction_model_performance, golf_coach_philosophy

### Known Gaps
| Gap | Severity | Details |
|-----|----------|---------|
| Effectiveness data sparse | Medium | golf_insight_effectiveness not actively populated, so analytics dashboard shows limited data |

### Dependencies
- **Depends on**: CoachHelm AI Engine (source data), Insight Effectiveness tracking (gap)

---

## 18. COACHING INTELLIGENCE SETTINGS ✅

### What It Does
Coach configures CoachHelm AI philosophy — priorities, alert sensitivity, thresholds, weight distribution, and 11 individual alert type toggles.

### Data Flow
```
/golf/dashboard/settings/coaching-intelligence → Philosophy config form
  → Priority ranking UI (5 areas: ball striking, short game, putting, course mgmt, mental game)
  → Alert sensitivity: aggressive | balanced | conservative
  → Thresholds: decline (1.0-4.0), pressure gap (1.0-4.0), bubble zone (0.5-3.0)
  → Weight distribution: 5 weights summing to 100%
  → 11 alert toggles (scoring decline, stat regression, pressure, plateau, etc.)
  → Save → UPDATE golf_coach_philosophy
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx` |
| Components | `src/components/golf/coachhelm/settings/` (PriorityRanker, ThresholdSlider, SensitivitySlider, WeightDistributor, AlertTypeToggles) |

### DB Tables
golf_coach_philosophy (all philosophy columns)

### Dependencies
- **Feeds into**: CoachHelm AI Engine (filters insights), Alerts System (sensitivity + toggles)

---

## 19. PLAYER HUB (HOME) ✅

> **2026-07-09 — merged into the Dashboard.** The standalone "Hub" front door
> described below no longer exists as its own destination. Wave W2 nav
> consolidation (Target IA, `PRODUCTION_READINESS_MISSION_2026-07-09.md`)
> folded its triage content into the Player Dashboard as an "Action Center"
> section, one home instead of two. `/golf/dashboard/hub` is now a permanent
> server-redirect to `/golf/dashboard` (old links/bookmarks still land
> somewhere real). Full create/edit/manage surfaces for tasks and travel —
> the Hub was always read-mostly for those — remain in the **Team Hub**
> (`/golf/dashboard/team-hub`, tasks + travel tabs); full RSVP/scheduling
> remains in Calendar. `PlayerHub.tsx` / `PlayerHubWrapper.tsx` were deleted
> in Wave W1 (golf legacy-tree deletion); this section documents the current
> Action Center surface that replaced them.

### What It Does
A "needs you now" triage section on the player's Dashboard: top pending
tasks, events awaiting RSVP, recent announcements, and upcoming trips —
plus the player's top CoachHelm signal. Renders only the first few items of
each (3 tasks, 3 events, 2 trips) with a link out to the Team Hub / Calendar
for the full list; renders nothing at all when there's genuinely nothing to
triage (honest-empty, not a placeholder).

### Data Flow
```
/golf/dashboard → page.tsx (Dashboard route)
  → getPlayerHubSummaryData(teamId, playerId) [player-hub-data.ts]
    → golf_travel_itineraries WHERE team_id, departure_date >= now-120d
    → golf_task_assignments WHERE player_id (status, completed_at)
       joined to golf_tasks for title/description/due_date/category
       (same table completeTask() writes to — no dual-table read/write
       mismatch in this data path)
    → RPC get_player_hub_events(team_id, player_id, since) → golf_events +
       golf_event_attendance (RSVP status, going/maybe counts)
    → getPlayerHubAnnouncements() → RPC get_player_hub_announcements()
    → getTopInsightForPlayer() → top evidence-backed CoachHelm insight
  → passed as the `actionCenter` prop into FairwayPlayerDashboard
  → <PlayerActionCenter> renders:
      Tasks (top 3, "Open Team Hub" → team-hub?tab=tasks)
      Awaiting RSVP (top 3, "View calendar" → /golf/dashboard/calendar)
        Action: respondToEvent(eventId, status) → UPSERT golf_event_attendance
      Announcements (AnnouncementsList)
      Upcoming trips (top 2, "Open Team Hub" → team-hub?tab=travel)
      Action: completeTask(taskId) → golf_task_assignments (optimistic)

/golf/dashboard/hub → PlayerHubRedirectPage → redirect('/golf/dashboard')
```

### Key Files
| Type | Path |
|------|------|
| Route (Dashboard, fetches the data) | `src/app/golf/(dashboard)/dashboard/page.tsx` |
| Redirect (former Hub route) | `src/app/golf/(dashboard)/dashboard/hub/page.tsx` |
| Data | `src/app/golf/actions/player-hub-data.ts` (`getPlayerHubSummaryData`) |
| Component | `src/components/fairway/pages/dashboard/PlayerActionCenter.tsx` |
| Host component | `src/components/fairway/pages/dashboard/FairwayPlayerDashboard.tsx` |
| Shared presentational parts | `src/components/fairway/pages/hub/hub-parts.tsx` (TaskRow, RSVPRow, TripRow, TripDetailSheet, AnnouncementsList) |
| Management surface | `src/app/golf/(dashboard)/dashboard/team-hub/**` (full tasks/travel CRUD) |

### DB Tables
golf_travel_itineraries, golf_tasks, golf_task_assignments, golf_events, golf_event_attendance, golf_announcements (via RPC)

### Dependencies
- **Depends on**: Travel, Tasks, Calendar & Events
- **Feeds into**: nothing feeds off it directly — it is a read-mostly triage
  view over Team Hub / Calendar data

---

## 20. PLAYER COACHHELM DASHBOARD ✅

### What It Does
AI-powered performance dashboard for players. Auto-generates insights on first load, integrates CoachHelm V2 analysis with shot analytics.

### Data Flow
```
/golf/dashboard/coachhelm → Player-only page (coaches redirected)
  → getPlayerCoachHelmDashboard(playerId) → AI dashboard data
  → getPlayerShotAnalytics(playerId, 30) → last 30 days shot data
  → Auto-generates insights if none exist
  → Renders PlayerCoachHelmDashboard component

Note: /golf/dashboard/my-insights REDIRECTS here (deprecated route kept for bookmarks)
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/coachhelm/page.tsx` |
| Redirect | `src/app/golf/(dashboard)/dashboard/my-insights/page.tsx` → redirects to /coachhelm |
| Actions | `src/app/golf/actions/shot-analytics.ts`, `intelligence-dashboard.ts` |
| Components | `src/components/golf/coachhelm/PlayerCoachHelmDashboard` |

### DB Tables
golf_players, golf_rounds, golf_shots, golf_coach_philosophy, golf_patterns_v2, golf_predictions, golf_coachhelm_settings

### Dependencies
- **Depends on**: CoachHelm AI Engine, Rounds, Shot data

---

## 21. MY DEVELOPMENT ✅

### What It Does
Player view of coach-assigned development focus areas with progress tracking. Read-only — coaches create via Development Plans (Feature 25).

### Data Flow
```
/golf/dashboard/my-development → Server fetch
  → READ golf_player_focus_areas WHERE player_id
  → Group by status: Active, In Progress, Completed, Paused
  → Display: area type icon, title, description, progress bar
  → Progress: current_value / target_value as percentage
  → Trend indicators: Improving / Declining / Stable
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/my-development/page.tsx` |

### DB Tables
golf_player_focus_areas (read-only for players)

### Dependencies
- **Depends on**: Development Plans (coach creates focus areas)

---

## 22. MY QUALIFIERS ✅

### What It Does
Player view of qualifying tournaments they're entered in. Shows progress, scores, and leaderboard links.

### Data Flow
```
/golf/dashboard/my-qualifiers → getPlayerQualifiers()
  → READ golf_qualifiers + golf_qualifier_entries WHERE player_id
  → Display: qualifier name, course, dates, holes per round
  → Progress: rounds completed / total rounds
  → Score and to-par display
  → Status badges: Upcoming (slate), In Progress (amber), Complete (green), Ended (slate)
  → Action: "Enter Round" button for in-progress qualifiers → rounds/new
  → Link to full leaderboard → qualifiers/[id]
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/my-qualifiers/page.tsx` |

### DB Tables
golf_qualifiers, golf_qualifier_entries, golf_rounds

### Dependencies
- **Depends on**: Qualifiers (coach creates), Round Tracking (player enters rounds)

---

## 23. ROUND REVIEW (AI) ✅

### What It Does
AI-powered post-round analysis with comparison to player/team averages. Auto-generates on first view. V1 rule-based fallback + V2 full pipeline.

### Data Flow
```
/golf/dashboard/rounds/[id]/review → RoundReviewPage
  → getRoundReview(roundId) → check for existing review
  → If none: generateAndStoreRoundReview(roundId, playerId) → AI pipeline
  → getStatAverages(playerId) → player avg + team avg for comparison

V2 Review includes:
  → V2ReviewSummary (narrative)
  → V2PatternsSection (detected patterns for this round)
  → V2PredictionCard (predicted vs actual)
  → V2CausalInsights (cause-effect analysis)

V1 Fallback:
  → CompletionCard, GoalImpactCard, HighlightsSection
  → AreasToReviewSection, StrokesGainedSection, ReviewSummary

Player action:
  → shareRoundReviewWithCoach(reviewId) → marks review as shared
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/rounds/[id]/review/page.tsx` |
| Actions | `round-reviews.ts`, `round-review-system.ts` |
| V2 Components | `V2ReviewSummary`, `V2PatternsSection`, `V2PredictionCard`, `V2CausalInsights` |
| V1 Components | `RoundReviewDisplay`, `CompletionCard`, `HighlightsSection`, etc. |
| Stats | `RoundStatsComparison` |

### DB Tables
golf_round_reviews, golf_rounds, golf_holes, golf_shots, golf_patterns_v2, golf_predictions, golf_courses, golf_course_holes

### Dependencies
- **Depends on**: CoachHelm AI Engine, Rounds, Stats Cache

---

## 24. TEAM INFO PAGE ✅

### What It Does
Team information page with role-specific views. Coaches can edit team settings; players see read-only team info, roster snapshot, recent announcements, and pending tasks.

### Data Flow
```
/golf/dashboard/team → Role-based render
  Coach view (TeamSettingsClient):
    → Edit team name, season, join code, settings
    → Manage team configuration

  Player view (TeamInfoPlayer):
    → Coach name and avatar
    → Full roster with player cards (name, handicap, avatar)
    → Latest 5 announcements
    → Pending tasks checklist
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/team/page.tsx` |
| Components | `TeamSettingsClient`, `TeamInfoPlayer` |

### DB Tables
golf_teams, golf_coaches, golf_team_members, golf_players, golf_announcements, golf_tasks, golf_task_assignments

---

## 25. DEVELOPMENT PLANS (COACH) ✅

### What It Does
Coach tool to create and manage player development focus areas with measurable targets. Coaches select players, assign focus types with progress tracking.

### Data Flow
```
/golf/dashboard/development → DevelopmentPlansClient
  → Load all players with stats snapshot (avg score, putts, fairway %, GIR %)
  → Player grid with avatars, year, handicap, location

Create focus area:
  → Select player → Modal form
  → Choose area type (8 types: driving, iron play, short game, putting,
                       course management, mental game, fitness, other)
  → Set title, description, target metric, target value
  → Suggested metrics auto-populate by area type
  → createFocusArea() → INSERT golf_player_focus_areas

Track progress:
  → Status: Active | In Progress | Completed | Paused
  → Progress: current_value / target_value as percentage
  → Trend: Improving / Declining / Stable
  → updateFocusArea() → UPDATE golf_player_focus_areas
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/development/page.tsx` |
| Actions | `src/app/golf/actions/development.ts` |
| Components | `DevelopmentPlansClient` |

### DB Tables
| Table | Role |
|-------|------|
| golf_player_focus_areas | Focus area records (area_type, title, description, status, target/current values, dates) |
| golf_rounds | Used to calculate stats snapshot for each player |

### Dependencies
- **Depends on**: Roster (player list), Rounds (stats calculation)
- **Feeds into**: My Development (player view, Feature 21)

---

## 26. SETTINGS ✅

### What It Does
Unified settings hub for both coaches and players with role-specific sections.

### Sections
```
/golf/dashboard/settings → Multi-section settings page

Account (all users):
  → PersonalInfoPanel: name, avatar upload
  → EmailPanel: email change with verification
  → PasswordPanel: password reset

Preferences (all users):
  → NotificationsPanel: 7 notification toggles (email & push)
  → AppearancePanel: density, date format, animations, score display (localStorage)
  → LocationPanel: default course, city, state (localStorage)

Golf Settings (coaches):
  → GolfScoringPanel: scoring format, handicap system, default tees, timezone
  → SG Benchmark Level: scratch, plus_2, bogey_golfer, double_bogey
  → Link to Coaching Intelligence settings

Golf Profile (players):
  → PlayerGolfDetailsPanel: handicap, graduation year, hometown, phone

AI Features (coaches):
  → CoachHelmToggle: enable/disable CoachHelm per user

Team (role-specific):
  → Coach: TeamSettingsPanel + InviteSettingsPanel (join code management)
  → Player: join team section

Legal: Privacy Policy, Terms of Service
Danger Zone: Delete account
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/(dashboard)/dashboard/settings/page.tsx` |
| Sub-route | `settings/coaching-intelligence/page.tsx` (see Feature 18) |
| Components | `src/components/golf/settings/` (PersonalInfoPanel, EmailPanel, PasswordPanel, NotificationsPanel, AppearancePanel, LocationPanel, GolfScoringPanel, PlayerGolfDetailsPanel, TeamSettingsPanel, InviteSettingsPanel, CoachHelmToggle) |

### DB Tables
users, golf_coaches, golf_players, golf_teams, golf_team_settings, golf_coachhelm_settings, golf_coach_philosophy

### Known Gaps
| Gap | Severity | Details |
|-----|----------|---------|
| Appearance prefs not consumed | Low | localStorage values saved but UI doesn't apply density/animation/date format settings |
| Location defaults not consumed | Low | localStorage values saved but round creation doesn't pre-fill from them |

---

## 27. JOIN TEAM FLOW ✅

### What It Does
Allow players to join a coach's team via invite code link.

### Data Flow
```
/golf/join/[code] → Server validates:
  1. Check authentication (redirect to login if needed)
  2. Check player profile exists + onboarding complete
  3. If incomplete → redirect to /golf/player?joinCode=[code]
  4. Lookup team by join_code (case-insensitive)
  5. Display team info + join confirmation

Player confirms → GolfJoinTeamClient
  → INSERT golf_team_members (or golf_team_join_requests if approval required)
  → Redirect to dashboard
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/join/[code]/page.tsx` |
| Components | `GolfJoinTeamClient` |

### DB Tables
golf_teams, golf_players, golf_team_members, golf_team_join_requests, organizations

---

## 28. ADMIN DASHBOARD ✅

### What It Does
Comprehensive platform monitoring and operations center with 6 tabs covering KPIs, user activity, system health, growth analytics, sport operations, and security audit.

### Data Flow
```
/golf/admin → AdminDashboard (6 tabs)

Tab 1: COMMAND CENTER
  → Top 6 KPIs (users, rounds, AI activity, errors, growth, health score)
  → "Needs Attention" feed
  → 30-day trends, health check cards

Tab 2: USERS & ACTIVITY
  → User breakdown by role
  → Active teams, onboarding rates
  → Coach engagement scoring
  → Player dropout funnel
  → Data freshness alerts (churn risk, inactive teams)
  → User activity table with last seen

Tab 3: HEALTH & ISSUES
  → Error tracking (7d critical & total)
  → Failed logins & locked accounts
  → Health check grid (API, DB, auth, storage, realtime)
  → Error feed with stack traces
  → CoachHelm AI health

Tab 4: ANALYTICS & GROWTH
  → Platform health score, DAU/MAU stickiness
  → Power users %, churn (30d), AI adoption %
  → Growth charts (signups, rounds, usage trends)
  → Cohort retention matrix
  → Session heatmap (page views, feature usage, dead features)

Tab 5: SPORT OPERATIONS
  → Toggle Golf/Baseball view
  → Golf KPIs: scoring avg, fairway %, GIR %, putts/round
  → Team intelligence (roster composition)
  → Communication metrics
  → Strokes Gained platform averages

Tab 6: AUDIT & SECURITY
  → Audit event count, failed logins, locked accounts
  → Audit log feed, login security summary

Features:
  → Persistent status bar (health, active users, errors)
  → Keyboard shortcuts (1-6 tabs, R refresh)
  → Auto-refresh every 60s
  → URL-driven tab state (shareable)
```

### Key Files
| Type | Path |
|------|------|
| Route | `src/app/golf/admin/page.tsx` |
| Actions | `src/app/golf/actions/admin-data.ts` |

### DB Tables
Reads from ALL major tables: users, golf_coaches, golf_players, golf_teams, golf_team_members, golf_rounds, golf_shots, golf_announcements, golf_conversations, golf_messages, golf_tasks, golf_events, golf_event_attendance, golf_coach_philosophy, golf_patterns_v2, golf_predictions, golf_round_reviews, golf_insights

---

## CROSS-FEATURE DEPENDENCY MAP

```
                        ┌──────────────┐
                        │   ROUNDS     │ ← Primary data source
                        └──────┬───────┘
                               │
                  ┌────────────┼────────────┐
                  ▼            ▼            ▼
          ┌──────────┐  ┌──────────┐  ┌──────────┐
          │  STATS   │  │ ROUND    │  │QUALIFIERS│
          │  CACHE   │  │ REVIEWS  │  │          │
          └────┬─────┘  └────┬─────┘  └──────────┘
               │              │
               ▼              ▼
          ┌────────────────────────┐
          │     COACHHELM AI       │
          │  (patterns, insights,  │
          │   predictions)         │
          └────┬──────┬────────────┘
               │      │
      ┌────────┘      └────────┐
      ▼                        ▼
┌──────────────┐        ┌──────────────┐
│  COACH VIEWS │        │ PLAYER VIEWS │
│  ─ Alerts    │        │ ─ CoachHelm  │
│  ─ Patterns  │        │   Dashboard  │
│  ─ Insights  │        │ ─ Round      │
│  ─ Intel Hub │        │   Reviews    │
│  ─ Analytics │        │ ─ My Dev     │
│  ─ Dev Plans │        │ ─ My Quals   │
└──────────────┘        └──────────────┘

  PLAYER HUB aggregates:
  ┌──────────────┐
  │  PLAYER HUB  │──→ Travel (upcoming trips)
  │  (home)      │──→ Tasks (assigned to me)
  │              │──→ Events (RSVP needed)
  └──────────────┘

  INDEPENDENT FEATURES (no cross-deps):
  ┌──────────┐  ┌──────────┐  ┌──────────┐
  │ MESSAGES │  │   DOCS   │  │  ADMIN   │
  └──────────┘  └──────────┘  └──────────┘

  ANNOUNCEMENT DEPENDENCIES:
  ┌──────────────┐
  │ANNOUNCEMENTS │──→ TASKS (inline task creation)
  │              │──→ DOCS  (document linking)
  └──────────────┘

  CALENDAR DEPENDENCIES:
  ┌──────────────┐
  │   CALENDAR   │──→ ACADEMICS (conflict detection)
  │   & EVENTS   │──→ QUALIFIERS (qualifier events)
  │              │──→ TRAVEL (linked itineraries)
  │              │──→ ROSTER (attendee list)
  └──────────────┘

  SETTINGS DEPENDENCIES:
  ┌──────────────┐
  │   SETTINGS   │──→ COACH PHILOSOPHY (sub-page)
  │              │──→ COACHHELM TOGGLE
  │              │──→ TEAM SETTINGS
  │              │──→ SG BENCHMARK
  └──────────────┘
```

---

## OVERALL STATUS SUMMARY

| # | Feature | Type | Status | Completeness | Realtime | Key Gap |
|---|---------|------|--------|-------------|----------|---------|
| 1 | Round Tracking | Both | ✅ | 95% | Auto-save | Offline shots, SG calc |
| 2 | Stats & Analytics | Both | ✅ | 90% | — | SG not populated |
| 3 | Qualifiers | Both | ✅ | 100% | ✅ | — |
| 4 | Calendar & Events | Both | ⚠️ | 90% | — | Availability Polling not built (backlog) |
| 5 | Roster Management | Both | ✅ | 100% | — | — |
| 6 | Task Management | Both | ⚠️ | 85% | ✅ | Reminder auto-trigger |
| 7 | Messaging | Both | ✅ | 100% | ✅ | — |
| 8 | Announcements | Both | ✅ | 100% | — | — |
| 9 | Documents | Both | ✅ | 100% | — | — |
| 10 | Travel | Both | ⚠️ | 80% | — | Expense splits, budget UI |
| 11 | Academics / Classes | Player | ✅ | 100% | — | — |
| 12 | CoachHelm AI Engine | System | ⚠️ | 75% | — | Effectiveness, philosophy wiring |
| 13 | Alerts System | Coach | ✅ | 95% | — | — |
| 14 | Patterns Dashboard | Coach | ✅ | 95% | — | — |
| 15 | Insights Management | Coach | ✅ | 95% | — | — |
| 16 | Intelligence Dashboard | Coach | ✅ | 90% | — | — |
| 17 | CoachHelm Analytics | Coach | ⚠️ | 70% | — | Effectiveness data sparse |
| 18 | Coaching Intel Settings | Coach | ✅ | 100% | — | — |
| 19 | Player Hub (merged into Dashboard Action Center) | Player | ✅ | 100% | — | Standalone Hub route now redirects; management in Team Hub |
| 20 | Player CoachHelm | Player | ✅ | 95% | — | — |
| 21 | My Development | Player | ✅ | 100% | — | — |
| 22 | My Qualifiers | Player | ✅ | 100% | — | — |
| 23 | Round Review (AI) | Both | ✅ | 95% | — | — |
| 24 | Team Info Page | Both | ✅ | 100% | — | — |
| 25 | Development Plans | Coach | ✅ | 95% | — | — |
| 26 | Settings | Both | ✅ | 90% | — | Appearance/location prefs unused |
| 27 | Join Team Flow | Player | ✅ | 100% | — | — |
| 28 | Admin Dashboard | Admin | ✅ | 95% | Auto-refresh | — |

---

## PRIORITY GAPS (by business impact)

### High Priority
1. ~~Player Hub task completion bug~~ — **RESOLVED / stale.** `golf_task_completions` does not exist in the live schema; the current Action Center data layer (`player-hub-data.ts`, post-2026-07-09 Hub→Dashboard merge) reads `golf_task_assignments`, the same table `completeTask()` writes to. No dual-table mismatch in this path.
2. **CoachHelm effectiveness tracking** — DB ready, needs server actions + UI. Without this, coaches can't measure if AI insights are working.
3. **CoachHelm outcome measurement** — No way to close the feedback loop (mark insights as improved/no_change/worsened).
4. **Strokes Gained calculation** — Framework exists, data exists (shots table), but SG columns in stats cache are null. This is the most important golf statistic.

### Medium Priority
5. **Philosophy priority ranking** — Coach sets priorities but insights don't reorder. Quick win.
6. **Philosophy weights in predictions** — Prediction model ignores coach weight preferences. Quick win.
7. **Task reminder auto-send** — Tables and fields exist, needs a cron job or edge function.
8. **Offline shot sync** — Type alignment fix between ShotRecord and OfflineShot.
9. **CoachHelm analytics data** — Dashboard exists but effectiveness tables not actively populated.
10. **golf_putting_tendencies never populated** — Table exists with schema and RLS but no app code writes to it. Stats pipeline skips it.

### Low Priority
11. **Appearance preferences consumption** — Settings saved to localStorage but UI doesn't apply them.
12. **Location defaults consumption** — Settings saved but round creation doesn't pre-fill.
13. **Coach round verification** — Sharing works, formal approval workflow not critical yet.
14. **V1 dead code cleanup** — 16K lines of deprecated code, safe to remove.
15. **Player insight preferences UI** — Table exists, low demand.
16. **Draft data column migration** — Currently stored in notes field, works but messy.
17. **Travel expense splits** — Table exists, CRUD for expenses works, but per-player split logic not implemented.

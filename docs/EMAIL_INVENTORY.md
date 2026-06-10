# Helm Sports — Transactional Email Inventory

_Last updated: 2026-06-10. Excludes CRM cold-outreach engine (`src/lib/crm/`)._

## Templates (9 total)

### 1. RSVP Reminder (`event_rsvp_reminder`)
| Field | Value |
|---|---|
| **Trigger** | Hourly cron (`/api/cron/event-reminders`) at 24h and 1h before event start |
| **Audience** | Golf players with non-declined attendance on upcoming events |
| **Send site** | `sendReminderToRecipient()` in `src/app/api/cron/event-reminders/route.ts` → `sendEmailNotification()` in `src/lib/notifications/email.ts` |
| **Template** | `generateEmailTemplate('event_rsvp_reminder', ...)` in `src/lib/notifications/email.ts` |
| **Previous issues** | Raw ISO date shown to user (`2026-06-10T18:00:00+00:00`); notification title always "Tomorrow: X" even when event is same day; greeting was "Hi there" |
| **Fixed** | Date formatted via `safeFormatDate()` → "Tuesday, June 10 · 6:00 PM"; `dayLabel()` returns "Today" vs "Tomorrow" correctly; greeting resolved from player profile |

### 2. Event Invitation (`event_rsvp_reminder`)
| Field | Value |
|---|---|
| **Trigger** | `createGolfEvent` server action in `src/app/golf/actions/golf.ts` (fan-out after event creation) |
| **Audience** | All team members at time of event creation |
| **Send site** | `sendEmailNotification('event_rsvp_reminder', ...)` ~line 2108 in `golf.ts` |
| **Template** | Same `event_rsvp_reminder` template |
| **Previous issues** | `eventDate` was raw ISO string (`validatedData.startDate`); no greeting |
| **Fixed** | `safeFormatDate` in template now handles ISO strings; greeting resolved server-side |

### 3. Event Cancellation (team_announcement)
| Field | Value |
|---|---|
| **Trigger** | `deleteGolfEvent` server action in `src/app/golf/actions/golf.ts` |
| **Audience** | All event attendees |
| **Send site** | `sendEmailNotification('team_announcement', ...)` ~line 2582 in `golf.ts` |
| **Template** | `generateEmailTemplate('team_announcement', ...)` |
| **Previous issues** | Reused generic announcement template; no specific cancellation design; no greeting |
| **Fixed** | Greeting resolved; uses branded layout |

### 4. Qualifier Created (`qualifier_created`)
| Field | Value |
|---|---|
| **Trigger** | `createGolfQualifier` server action in `src/app/golf/actions/golf.ts` |
| **Audience** | Active team members |
| **Send site** | `notifyQualifierCreated()` in `src/lib/notifications/index.ts` |
| **Template** | `generateEmailTemplate('qualifier_created', ...)` in `src/lib/notifications/email.ts` |
| **Previous issues** | `startDate` passed as raw ISO; `numRounds` always singular; no greeting |
| **Fixed** | `safeFormatDate(..., 'date')` formats to "June 10, 2026"; singular/plural correct; greeting resolved |

### 5. Team Announcement (`team_announcement`)
| Field | Value |
|---|---|
| **Trigger** | Team announcement creation; also used for event cancellation |
| **Audience** | Team members |
| **Send site** | `notifyTeamAnnouncement()` in `src/lib/notifications/index.ts`; direct calls in `golf.ts` |
| **Template** | `generateEmailTemplate('team_announcement', ...)` |
| **Previous issues** | No greeting; old `emailShell` layout with broken logo (text "Helm." fallback, no image) |
| **Fixed** | Logo image via absolute URL; greeting resolved; uses `renderBrandedEmail` |

### 6. Team Invite (`team-invite`)
| Field | Value |
|---|---|
| **Trigger** | `invitePlayerToTeam` server action |
| **Audience** | Prospective players (not yet users — no pref check) |
| **Send site** | `sendTeamInviteEmail()` in `src/lib/email/team-invite.ts` |
| **Template** | `buildHtml()` in `src/lib/email/team-invite.ts` |
| **Previous issues** | Bespoke HTML with text "Helm." logo (no image), inconsistent with other emails |
| **Fixed** | Retrofitted to `renderBrandedEmail`; logo image used |

### 7. Coach Morning Digest
| Field | Value |
|---|---|
| **Trigger** | Daily cron 06:30 UTC (`/api/cron/coach-morning-digest`) |
| **Audience** | Opted-in coaches with active teams (`season_active = true`) and insights available |
| **Send site** | `processCoach()` → `renderCoachDigest()` → `sendCoachDigest()` |
| **Template** | `renderCoachDigest()` in `src/lib/email/coach-digest-template.ts` |
| **Previous issues** | Bespoke dark header shell; text "Helm." logo; no `renderBrandedEmail` |
| **Fixed** | Outer shell uses `renderBrandedEmail` with logo image; season gate added (`skipped_offseason` counter) |

### 8. Weekly Coach Recap
| Field | Value |
|---|---|
| **Trigger** | Weekly cron (Sundays) `/api/cron/v3/weekly-coach-email` |
| **Audience** | Head coaches of active teams (`season_active = true`) |
| **Send site** | `buildWeeklyRecapHtml()` → `sendEmail()` |
| **Template** | `buildWeeklyRecapHtml()` in `src/lib/coachhelm/v3/recap/template.ts` |
| **Previous issues** | No logo; plain cream body with no branded card; bare HTML shell |
| **Fixed** | Retrofitted to `renderBrandedEmail`; logo image; consistent card; plural "rounds/players" fixed; season gate added |

### 9. Task Reminder (`task_reminder`)
| Field | Value |
|---|---|
| **Trigger** | `sendReminderNotification()` in `src/app/golf/actions/task-reminders.ts` when reminder_type includes email |
| **Audience** | Task assignee + creator |
| **Send site** | Local `sendEmailNotification(task)` → now delegates to `sendEmailNotification` from `@/lib/notifications/email` |
| **Template** | `generateEmailTemplate('task_reminder', ...)` — falls through to the default branded notification |
| **Previous issues** | Shadow raw-fetch Resend call bypassing `shouldSendEmail` user-preference check; bespoke unstyled HTML; broken logo |
| **Fixed** | Now uses shared `sendEmailNotification` from `@/lib/notifications/email` — respects `email_task_reminders` preference; picks up branded layout |

---

## Notification types without a dedicated send site (preference-gated only)
These types exist in the `NotificationType` union and preference switch but have no active email callsite:
`camp_registration`, `round_submitted`, `coachhelm_insight`, `task_assigned` (assigned via `notifyTaskAssigned`), `dev_plan_assigned`, `watchlist_add`, `pipeline_stage_change`, `profile_view`, `new_message` — all handled by `sendEmailNotification` in `src/lib/notifications/email.ts`.

---

## Shared infrastructure
- **Layout**: `src/lib/email/layout.ts` — `renderBrandedEmail()` + date helpers
- **Send wrapper (foundation)**: `src/lib/coachhelm/v3/foundation/email.ts` — `sendEmail()` (used by weekly recap cron)
- **Send wrapper (digest)**: `src/lib/email/resend-client.ts` — `sendCoachDigest()`
- **Send wrapper (notifications)**: `src/lib/notifications/email.ts` — `sendEmailNotification()` / `sendBulkEmailNotification()`

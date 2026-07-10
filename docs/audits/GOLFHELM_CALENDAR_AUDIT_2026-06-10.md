<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: 30 of the 32 listed defects were fixed same-day in PR #259 ("remediate all 32 confirmed defects from the calendar audit"). Per project memory, 2 items remain knowingly open: availability debounce + restore-from-cancelled. Do not read the 32-item list as a live defect backlog.
KEPT FOR HISTORY -- do not delete this file.
-->

# GolfHelm Shared Calendar Audit — 20/100

## Verdict

Not production-grade. The narrow happy path — a coach creating a one-off event with pre-selected attendees, players viewing and RSVPing to it — works and is genuinely well secured (every high-severity security claim was refuted against live RLS; write-integrity and authz discipline are the best parts of this feature). Everything surrounding that path is structurally broken: **recurrence** can destroy itself (root delete cascade-wipes a whole series with no warning; series-scoped edits collapse every occurrence onto one date), **RSVP lifecycle** silently loses data (creating an event drops its RSVP config; editing an event deletes every existing invitee's RSVP), **reminders** are dead for ~93% of events (weekly cron vs hourly-designed windows), **attendance** has a full backend and zero UI, and **external calendar sync** is unreachable for every player and every mobile coach. Several of the worst defects are latent only because *other* bugs hide them — most dangerously, the series-edit collapse (P0) is unreachable today only because the page never loads series fields (P1); fixing the visibility bug alone converts a UX gap into mass schedule destruction. Those fixes must ship together.

## Scoring arithmetic

38 confirmed filings dedupe to 32 distinct defects (2 P0, 11 P1, 14 P2, 5 P3).

| Bucket | Deductions | Subtotal |
|---|---|---|
| P0 ×2 | cascade series wipe −10; series-edit date collapse −8 (latent, armed by fix #6) | −18 |
| P1 ×11 | reminders dead −8; edit wipes RSVPs −7; create drops RSVP config −6; ±3-month window −5; blocking email loop −5; series UI unreachable −4; conflict detection blind −4; ICS unreachable −4; unseeded players can't RSVP −3; ICS feed unbounded −2 (latent); cron unpaginated −2 (latent) | −50 |
| P2 ×14 | 1–3 each per table below (latent findings graded at band floor) | −28.5 |
| P3 ×5 | 0.5–1 each | −3 |
| **Raw** | | **−99.5** |
| Strengths offset | security architecture held under adversarial review (5 major claims refuted); write-integrity + authz discipline; idempotent cron machinery; transactional recurring create; full index coverage; ICS re-authorization | **+19.5** |
| **Final** | | **20/100** |

## Confirmed findings

### P0 — destructive

| # | Finding | Location | Impact |
|---|---|---|---|
| 1 | Deleting the first occurrence of a series cascade-wipes the entire series + all RSVP rows | PremiumCalendarClient.tsx:613, FairwayCalendar.tsx:344, recurring-events.ts:499; FK ON DELETE CASCADE (baseline:15745) | Root row IS occurrence #1; renders indistinguishable from a one-off (see #6) so plain Delete fires with no series dialog. Irreversible. |
| 2 | Series edit with scope thisAndFuture/all collapses every occurrence onto one date | recurring-events.ts:336-351, 376-438 | One literal start/end applied to all matched rows; both callers always send startDate, so a title-only "all events" edit rewrites the whole series. Latent only because of #6 — armed the moment #6 is fixed. |

### P1 — major (filed-count noted where duplicated across dimensions)

| # | Finding | Location | Impact |
|---|---|---|---|
| 3 | Reminders structurally dead: weekly Sunday-05:00 cron vs 25h/75min lookahead windows (filed 3×, once as P0) | vercel.json:63; cron route.ts:23-24 | ~93% of events never reminded on any channel; 1h cadence has fired 0 times ever; 7 reminder rows in prod, all from one tick. |
| 4 | Editing an event wipes all existing invitees + their RSVP history (filed 3×) | EventDetailModal.tsx:336; FairwayEventEditor.tsx:206; golf.ts:2149-2168 | Edit form seeds attendeeIds:[]; adding one player deletes every other attendance row (RSVPs, check-in state, reminder eligibility). Silent, unrecoverable, both live UIs. |
| 5 | createGolfEvent silently drops requires_rsvp / rsvp_deadline / max_attendees (filed 3×) | golf.ts:1867-1883 | Every one-off event created with RSVP on lands disarmed; coach must re-edit to arm. Prod fingerprint confirms: 0/75 events have a deadline. |
| 6 | Series edit/delete scope UI unreachable — page select omits parent_event_id/recurrence_rule | calendar page.tsx:74 | Scope picker never renders; series can't be managed; makes #1 fire with zero warning. |
| 7 | Conflict detection blind to timed team events (midnight-UTC date collapse + server-TZ parse) | availability.ts:77-128; golf.ts:2885 | The most common conflict source — an existing timed practice — never produces a warning; availability overlay shows busy players as free. |
| 8 | Whole team notified to RSVP, but players without a coach-seeded attendance row get a hard error | rsvp.ts:319; coach-only INSERT RLS | "Could not record your RSVP" for anyone not pre-picked; RSVP stats undercount. Latent-ish (current future events fully seeded). |
| 9 | Fixed ±3-month window, .limit(500) ASC, never refetched on navigation (filed 2×) | page.tsx:60-80; FairwayCalendar.tsx:410-426 | An October tournament created in June vanishes after save — indistinguishable from data loss; past-season review impossible; empty months already manifest on prod data. |
| 10 | ICS calendar subscription unreachable for all players and all mobile coaches | CalendarAvatarSidebar.tsx:297; FairwayCalendar.tsx:655-704 | "Team schedule in my phone" — the flagship student-athlete feature — is dead in the shipped UI despite a working backend. |
| 11 | Event save blocks on a sequential per-player email loop (DB prefs + Resend HTTP each) | golf.ts:1969-1988; email.ts:840-852 | ~3–10s save latency on a 15-player roster; "fire-and-forget" comment is false. |
| 12 | ICS team feed queries all events ever — no window, no limit, ASC | feeds/[token]/route.ts:229-258 | At >1000 rows the feed serves only the *oldest* 1000 — all upcoming events silently vanish from subscribers. Latent (max 48 events/team today). |
| 13 | Cron fan-out unpaginated: platform-wide .limit(500) events, unbounded attendance/player fetches (filed 2×) | cron route.ts:93-133 | Silent attendee drops at scale, never retried (idempotency marks them done). Latent today. |

### P2 — moderate

| # | Finding | Location | Impact |
|---|---|---|---|
| 14 | Class→calendar sync: RLS-dead for its only callers + banned delete-then-reinsert + offset-naive timestamps (filed 2×) | calendar-sync.ts:97-161, 133 | Feature has never worked (0 rows ever); players see no error; two armed traps if RLS is ever opened. |
| 15 | RSVP deadline stored as UTC wall-time | golf.ts:2118 | ET coach's 6 PM deadline locks at 2 PM; coach sees the time they typed, players see the shifted one. Latent (0 deadlines in prod). |
| 16 | RSVP state-machine holes + live drawer ungated (filed 2×) | rsvp.ts:310; FairwayEventDetailDrawer.tsx:230 | No lock after event start — a no-show can flip to "accepted" post-hoc; RSVP buttons render on past and non-RSVP events with no deadline display. |
| 17 | No end_time ≥ start_time validation anywhere | golf.ts:386; no DB CHECK | 3 corrupt rows live in prod (−15d/−13d/−1d); inverted DTEND exported to external calendars. |
| 18 | Update/re-invite notifications are one-shot (ignoreDuplicates) | rsvp.ts:211, 269 | Second+ reschedule never notifies; the surviving notification shows the superseded time. |
| 19 | Hard delete with no cancellation lifecycle | golf.ts:2249 | Attendees never told; cascade erases their notification history; cancelled-status guards are dead code. |
| 20 | Fetch failures render as a cheerful empty calendar | page.tsx:52, 100 | Outage indistinguishable from "my season got wiped"; supabase errors never even checked. |
| 21 | Attendance backend (check-in / no-show / reports) has zero UI; dead actions carry latent bugs (check-in overwrites RSVP, weak authz, 1000-cap stats — 3 filings folded here) | attendance.ts | Coach cannot take attendance; 0 check-ins ever recorded; fix or delete before wiring. |
| 22 | Recurrence can't express MWF, biweekly, or until-a-date; create-only | FairwayEventEditor.tsx:87-92, 658 | The canonical college practice schedule needs 3 unlinked series; a series can never be extended or re-patterned. |
| 23 | Availability overlay: up to 8 server actions × ~16 sequential queries per day-strip tap, no debounce | FairwayCalendar.tsx:162-187; golf.ts:2927-3017 | ~128 DB round-trips per tap; the legacy path's 300ms debounce was dropped. |
| 24 | getUserBusyPeriods fetches a player's lifetime accepted-RSVP history, unwindowed | availability.ts:130-139 | 1000-cap-prone; multiplied by the per-tap fan-out above. |
| 25 | Realtime channel churn (unstable deps) + keyed grid remount per navigation | PremiumCalendarClient.tsx:353-378; FairwayCalendar.tsx:696 | Leave/join on every refresh and every coach navigation; events in the gap are lost (no refetch on subscribe). |
| 26 | Route ships three calendar implementations; zero dynamic imports | page.tsx:6-10; PremiumCalendarClient.tsx:11-39 | ~97KB gzip marginal payload; players download a coach-only engine they can never render (bundle-verified). |
| 27 | Cron push/email fan-out detached via `void` with no waitUntil | cron route.ts:192, 238, 251 | Sends race serverless freeze after response; idempotency then marks them sent — permanent silent loss. |

### P3 — minor

| # | Finding | Location | Impact |
|---|---|---|---|
| 28 | anon+authenticated hold full DML + TRUNCATE on all calendar tables | baseline:21676 | Supabase platform-default; RLS gates DML, no TRUNCATE path exists — hardening note. |
| 29 | ICS token plaintext, never-expiring; regenerate deactivates ALL of a user's feeds | calendar-feeds.ts:366-393 | The regenerate scoping bug is real and reachable from live UI; token hygiene latent (256-bit entropy). |
| 30 | Any teammate can read attendance notes | attendance.ts:268-286 | Vacuous today — no code path ever writes notes. |
| 31 | Coach grid fires the player-only getPendingInvitations on every mount/navigation | PremiumCalendarClient.tsx:156; useRSVP.ts:94 | Wasted server action returning an error payload each time. |
| 32 | Flag-off path mounts two 30s notification pollers | GolfDashboardShell.tsx:207; PremiumCalendarClient.tsx:774/848 | Legacy-only duplicate polling. |

## Top-5 fix priorities

1. **Cron schedule → hourly** (`0 5 * * 0` → `0 * * * *`, vercel.json:63). The route was designed for it; idempotent upsert already makes re-runs safe. While in there: await the fan-out (or `waitUntil`) and paginate via `fetchAllRowsResult` (#3, #13, #27). **Effort: schedule = 1 line; full = half a day.** Restores the entire reminder channel.
2. **Recurrence safety bundle — must ship as one PR** (#1, #2, #6): (a) on root delete with scope 'this'/undefined, promote the next child to root (transfer recurrence_rule, repoint children) before deleting; (b) rewrite editRecurringEvent to apply per-row date deltas (or drop date fields from scoped updates) instead of one literal timestamp; (c) add parent_event_id + recurrence_rule to the page select so the scope dialog actually renders. Shipping (c) without (a)+(b) actively arms both P0s. **Effort: 1–2 days + regression tests.**
3. **Stop the attendee wipe** (#4): hydrate edit forms from existing golf_event_attendance, or change updateGolfEvent semantics to add-only with explicit removals. This is a house-rule violation (destructive delete driven by incomplete client state). **Effort: half to 1 day.**
4. **Persist RSVP config on create** (#5, #15): add requires_rsvp/rsvp_deadline/max_attendees to insertData, and store the deadline through buildDateTimeString with timezoneOffset like start_time already does. Add the end_time ≥ start_time zod refine + DB CHECK and repair the 3 corrupt rows while touching schemas (#17). **Effort: 2–4 hours.**
5. **Unblock the save path** (#11): move email/push fan-out behind `after()`/Inngest (both patterns already exist in this repo) and parallelize with Promise.allSettled. **Effort: half a day.** Then: range-driven refetch for the ±3-month window (#9) and an ICS entry point in the Fairway shell for players/mobile (#10) — each ~1 day, highest-value after the data-loss items.

## Strengths

- **Security held up under adversarial review.** Five of the scariest claims (player self-check-in fraud, cross-team attendance injection, bulk-check-in false success, class-event team-wide leakage, mobile coach lockout) were refuted against live prod RLS and reachability. Event mutations verify coach role + team ownership + 0-row detection (golf.ts:2069-2081, 2235-2263); sendEventReminderToPlayers is the gold-standard admin-client authz chain (golf.ts:2768-2801); ICS routes re-authorize via SECURITY DEFINER membership checks despite using the admin client.
- **Write-integrity discipline.** requireWriteSuccess on RSVP/invitation upserts means RLS-swallowed writes surface as real errors, with structured logging (rsvp.ts:189-193, 319-331; golf.ts:2709-2720).
- **The cron machinery itself is sound** — CRON_SECRET fail-closed auth, UNIQUE-keyed idempotent upsert, fan-out gated on newly-inserted rows (route.ts:42-46, 174-197). It's only the schedule that kills it.
- **Recurring create is transactional**: root-first insert, child stamping, rollback with orphan logging on failure (recurring-events.ts:189-271).
- **Index coverage is complete and live-verified** for every hot query path; the page fetch is windowed and parallelized; all-day events use a canonical storage convention with explicit display normalization.
- **Event documents** are the cleanest sub-feature: idempotent PK upsert + app-level same-team check + DB trigger enforcement.

## Not covered

- Load/scale testing beyond static analysis (row-cap findings are arithmetic, not measured under load).
- Real-device E2E of the live Fairway surfaces (iOS/Capacitor rendering, touch flows); bundle impact was build-verified but not field-profiled.
- ICS output validation against actual consumers (Google/Apple/Outlook parsing quirks, RFC 5545 conformance beyond the inverted-DTEND case).
- DST-transition behavior for recurring series and reminder windows (the TZ findings cover storage convention, not DST boundaries).
- The baseball vertical's parallel calendar code; the editorial/ legacy components beyond bundle and dual-poller impact.
- Push-notification delivery infrastructure (FCM/web-push token health) downstream of the fan-out code.
- Multi-team coach edge cases in RLS visibility, and Supabase realtime behavior at connection scale.
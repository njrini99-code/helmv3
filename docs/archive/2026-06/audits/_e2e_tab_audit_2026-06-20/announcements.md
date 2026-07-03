## Announcements [both]

End-to-end audit of the shared coach + player Announcements tab.

- Route: `src/app/golf/(dashboard)/dashboard/announcements/page.tsx`
- Actions: `src/app/golf/actions/announcements.ts`, `src/app/golf/actions/communication.ts` (acknowledge), `src/app/golf/actions/player-notifications.ts` (badge feed)
- Legacy components: `src/components/golf/announcements/*`
- Fairway (flag-on) components: `src/components/fairway/pages/announcements/*`
- Primary tables: `golf_announcements`, `golf_announcement_recipients`, `golf_announcement_documents`, `golf_announcement_tasks`, `golf_announcement_acknowledgements`, plus `golf_tasks` + `golf_task_assignments` for inline tasks.

---

### Actual end-to-end wiring

**Page (`page.tsx`)**
- `getGolfSessionProfile()` resolves role; unauth → `redirect('/golf/login')` (line 27-28).
- `isCoach = role === 'coach'` (line 31). Team id is resolved for coach via `resolveCoachTeamIdWithCookie` (cookie/active-team aware) and for player via `golf_team_members` lookup (line 41-49), running in parallel.
- Announcements are fetched server-side via `getAnnouncementsWithMeta(teamId, userId, isCoach, playerId)` (line 60-63). Coach-only roster + documents are fetched in the same `Promise.all` for the create flow (line 64-80), both sport-prefixed (`golf_team_members`, `golf_documents`) and bounded (`.limit(100)` / `.limit(200)`).
- `recentCount` = announcements with `published_at` within 7 days (line 94-97).
- Flag fork: `isRedesignEnabled()` → `<FairwayAnnouncements>` reusing the exact same props (line 102-115). Legacy branch renders `LargeTitleHeader` + `CreateAnnouncementFlow` (coach) + `AnnouncementsCoachView` / `AnnouncementsPlayerView`.
- Empty state, "Player Profile Not Found" state, loading.tsx and error.tsx all present.

**Read path (`getAnnouncementsWithMeta`)**
- Auth-checks `getUser()` first (line 285-286).
- Authorizes coach via `validateCoachTeamAccess` (staff-strict — must be staffed on the requested team, not just same-org) (line 305-308); authorizes player via active `golf_team_members` row (line 309-319). Falls through to "Not authorized" otherwise.
- Fetches `golf_announcements` for the team ordered by `published_at desc` (line 325-329), then batch-fetches recipients/acks/announcement_tasks/announcement_documents with `.in(announcementIds)` (good — no N+1), aggregates counts via `groupBy`.
- For players, filters the enriched list to all-team (no recipient rows) OR rows where the player is a recipient (line 439-446). Correct broadcast/targeted model.

**Detail path (`getAnnouncementDetail`)**
- Auth-checks + same coach/player team authorization (line 465-509). Loads recipients, documents (joined to `golf_documents`), tasks (joined to `golf_tasks`), assignments (`golf_task_assignments`), and acknowledgements with player info. RLS further restricts what a player actually receives (see correctness note).

**Create path (`createEnrichedAnnouncement`)**
- Auth + coach-profile check (line 98-106), team resolved via cookie-aware `getCoachTeamId` (line 108-109).
- INSERT `golf_announcements` (`created_by = coach.id`, `published_at = now`, `send_push/send_email = false`) → INSERT recipients (only when specific players selected) → INSERT `golf_announcement_documents` with `sort_order` → for each inline task: INSERT `golf_tasks`, INSERT `golf_announcement_tasks`, INSERT `golf_task_assignments` per target player.
- Fire-and-forget email (`notifyTeamAnnouncement`) + `sendBulkPushNotification` to target players, wrapped in try/catch so it never blocks creation.
- `revalidatePath('/golf/dashboard/announcements')` + `updateTag(CACHE_TAGS.DASHBOARD)` (line 260-261). No destructive delete-then-insert.

**Acknowledge (`acknowledgeAnnouncement`, communication.ts)**
- Auth + player lookup + announcement existence + active membership check. UPSERT into `golf_announcement_acknowledgements` with `onConflict: 'announcement_id,player_id', ignoreDuplicates: true`. The required UNIQUE(announcement_id, player_id) constraint EXISTS (baseline line 11863), so the no-op-on-duplicate works. `revalidatePath` after.

**Delete (`deleteAnnouncement`)**
- Auth + coach lookup + ownership check (`ann.created_by === coach.id`) then `.delete()` on `golf_announcements`. Junction tables have `ON DELETE CASCADE` (baseline lines 15485/15495/15505), so the "CASCADE handles junction tables" comment is accurate.

**Complete task (`completeAnnouncementTask`)**
- Auth + player lookup, UPDATE `golf_task_assignments` set status=completed where task_id + player_id match. Optimistic UI in `AnnouncementTaskItem` reconciles by reverting on failure (line 37-43). revalidate after.

**Global "what's new" modal**
- `NewAnnouncementsModalWrapper` (mounted in both `GolfDashboardShell` and `FairwayDashboardShell`) is player-only, debounced 5 min via localStorage, driven by `notification-badge-context` → `getPlayerNotificationCounts` which correctly filters by recipient and computes unseen via `last_seen`. Acknowledge inside the modal reuses the same server action. "View all" routes to `/golf/dashboard/announcements` (real route).

---

### Expected vs actual (feature-doc #8)

The feature doc (#8 Announcements, marked ✅ 100%) describes: coach-to-team announcements with urgency, linked tasks/documents, targeted recipients, acknowledgement tracking, and the `createEnrichedAnnouncement()` transaction order. The implementation matches this end to end (urgency enum, all-team vs targeted recipients, doc linking with sort_order, inline task creation + assignment, acknowledgement upsert, coach progress view). No declared "Known Gaps" exist for this feature, and none of the doc's promised behaviors are missing.

**FOCUS item — `season_active` gate:** The audit brief flagged a "season_active gate" for this tab. `season_active` exists only as a column on `golf_teams` (database.ts line 10577). A repo-wide search finds NO season/offseason gate applied to announcements anywhere in `src/` (page, actions, components, or shells). So either (a) announcements are intentionally NOT season-gated (announcements are arguably year-round), or (b) the gate the brief expected was never implemented for this tab. This is an INFO-level divergence, not a bug — flagging for spec confirmation.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| MEDIUM | incomplete-feature | src/app/golf/actions/announcements.ts:738 | `deleteAnnouncement` authorizes only the original author (`ann.created_by !== coach.id`). On multi-coach teams (program head + assistant, or men's/women's shared head) a co-coach cannot delete a teammate's announcement even though they share the team. | An assistant or program head cannot remove a stale/incorrect announcement posted by another staff member — they get "Not authorized to delete". | Authorize by team-staff membership (`validateCoachTeamAccess(supabase, coach.id, ann.team_id, ...)`) instead of strict author identity, matching the staff-strict model already used in the read paths. |
| LOW | wrong-data | src/app/golf/actions/announcements.ts:120-121, 248-251 | The row is always written with `send_push:false, send_email:false`, but the action unconditionally fires `sendBulkPushNotification` + `notifyTeamAnnouncement` to all target players. The persisted flags contradict the actual delivery, and there is no UI toggle to disable push/email for a given announcement. | Coaches cannot suppress push/email for low-priority notices; the stored flags are misleading for any future audit/reporting that trusts them. | Either expose push/email toggles in the create flow and honor them, or set the columns to reflect that notifications were sent (or drop the columns from the insert and document the always-notify behavior). |
| LOW | n+1 | src/app/golf/actions/announcements.ts:165-208 | Inline-task creation is a sequential await loop: per task it does INSERT golf_tasks → INSERT golf_announcement_tasks → INSERT golf_task_assignments (each awaited serially). | For an announcement with several inline tasks on a large roster this is multiple serial round-trips; slow under latency. Low impact because task counts are small in practice. | Batch the announcement_tasks and task_assignments inserts after collecting task ids, or run the per-task work with Promise.all. Acceptable as-is for small N. |
| LOW | wrong-data | src/app/golf/actions/announcements.ts:579-606 + RLS golf_task_assignments_player_select | When a PLAYER opens `getAnnouncementDetail`, the assignments query is issued unscoped (`.in(task_id, ...)`) and relies on RLS to scope it. `golf_task_assignments_player_select` returns ONLY the player's own assignment row, which is the correct outcome for the player UI (it renders only `myAssignment`). However the server code is written as if it expects all assignments back (it later filters per task), so the design intent depends silently on RLS. Not a leak — flagging as a correctness/robustness note. | None today (RLS protects it). Risk is future drift: if RLS were loosened, the player payload would include teammates' completion status. The player card does not render others' statuses anyway. | Make the server intent explicit: when the caller is a player, add `.eq('player_id', playerId)` to the assignments and acknowledgements fetches rather than depending on RLS to do the scoping. |
| INFO | revalidation | src/app/golf/actions/announcements.ts:260-261; communication.ts:121 | Coach create/delete/complete call `revalidatePath('/golf/dashboard/announcements')` + `updateTag(DASHBOARD)`; the player acknowledge in communication.ts calls only `revalidatePath` (no `updateTag(DASHBOARD)`). The dashboard notification badge is refreshed client-side via `router.refresh()` + `badges.refetch()` so the count still updates, but the cache-tag invalidation is asymmetric. | Negligible — UI is correct via client refresh; only a consistency nit. | Add `updateTag(CACHE_TAGS.DASHBOARD)` to `acknowledgeAnnouncement` for parity. |
| INFO | completeness | (no file) season_active gate | No season/offseason gate is applied to the Announcements tab anywhere in src/ (`season_active` exists only on `golf_teams`). | Per spec this tab may be intentionally year-round; flagging only because the audit brief listed a season_active gate as a focus item. | Confirm with product whether announcements should be season-gated; if yes, gate the create flow + read path on `golf_teams.season_active` like other paused features. |

---

### Correctly wired (verified, no issue)

- Role-gating: page redirects unauth; coach vs player branch is driven by `getGolfSessionProfile()` role; every server action re-checks `getUser()` and re-authorizes team membership server-side (does not trust the client). Read authorization is staff-strict (`validateCoachTeamAccess`) for coaches and active-membership for players. No cross-role leak found.
- All tables are correctly sport-prefixed (`golf_announcements`, `golf_announcement_*`, `golf_tasks`, `golf_task_assignments`, `golf_documents`, `golf_team_members`). Columns match `golfhelm-database.md`.
- Correct Supabase clients: server actions use `await createClient()` from server; client components use the client. 
- No destructive delete-then-insert in any write path. Delete relies on FK CASCADE. Acknowledge uses upsert/onConflict against a real UNIQUE constraint.
- Batch reads use `.in(...)` (no N+1 in the list path). Roster/docs reads are bounded.
- States: loading skeleton (`loading.tsx`), role-aware empty states, detail-load error fallback ("Failed to load details"), and missing-player-profile notice all present in both legacy and Fairway variants.
- Interactive controls verified wired to real handlers: New Announcement (Drawer + `createEnrichedAnnouncement`), priority/recipient/require-ack toggles, player + document pickers, add/remove inline task, Post, Cancel/close, expand chevron (lazy `getAnnouncementDetail`), document open (`openExternalUrl`), task checkbox (`completeAnnouncementTask`), Acknowledge (`acknowledgeAnnouncement`), Delete (ConfirmDialog → `deleteAnnouncement`), modal "View all" / "Got it". No dead `href="#"`, no-op onClicks, or TODO handlers found.
- Badges/realtime: the unread-announcement badge + "what's new" modal are driven by `getPlayerNotificationCounts` (recipient-filtered, `last_seen`-based) and refreshed via `badges.refetch()` on mutation; counts are real, not hardcoded.
- Cross-feature links resolve (`/golf/dashboard/announcements` exists; inline tasks integrate with the real Tasks feature; documents integrate with the real Documents feature).
- Mobile/offline: create flow uses the shared `Drawer` (swipe/ESC/focus-trap/safe-area), date/search inputs have correct `inputMode`/`enterKeyHint`; modal debounced via localStorage.

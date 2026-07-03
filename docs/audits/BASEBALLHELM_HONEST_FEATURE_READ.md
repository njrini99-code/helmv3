# BaseballHelm — The Honest Feature Read

**Date:** 2026-07-01
**Scope:** All 118 audited features across Pressbox (coach team-ops), War Room (coach recruiting), Passport (player development), auth, public, and admin surfaces.
**Method:** Per-feature code-path traces (route → read-model → server action → table → RLS), no flattery applied. A plausible-looking UI over a stubbed or mismatched data path is HALF-BUILT, not SHIPPED.

---

## 1. Top-Line Verdict

**BaseballHelm is roughly 61% genuinely production-ready by feature count (72 of 118 features SHIPPED), and meaningfully less than that by user-visible weight, because several of the broken features sit on the product's flagship daily loops.**

The good news is real: the coach spine — Command Center, Roster, Calendar, Practice Planner, Signals, Postgame, Stats Center, Import Center, Scout Packets, Pipeline/Watchlist, Decision Room, Messages, Announcements, Tasks, the entire Settings OS, and the full auth stack — is genuinely wired end-to-end with real reads, capability-gated writes, RLS, and honest empty/error states. That is a serious, defensible product core.

The bad news is also real, and it clusters exactly where a player or coach would feel it first:

- **The player Lift Lab execution loop is broken.** A player can open a lift session but cannot log a single set or complete a session — the read path returns `helm_lifting_sessions` IDs while the write actions query legacy `baseball_lift_sessions` by that same ID. Every set-log throws "Session not found." (2 BROKEN features + spillover into 2 more.)
- **Readiness check-ins vanish into a black hole.** Players submit to `helm_lifting_readiness_checkins`; every coach-facing readiness surface still reads legacy `baseball_readiness_checkins`. Coaches will never see a check-in submitted through the app, and soreness ≥3 submissions crash on an FK violation.
- **Travel "Create Trip" fails for every real coach** (auth user id written into an FK that references `baseball_coaches.id`).
- **Coach-created camps are invisible to players** (RLS requires `status='published'`; nothing ever writes 'published').
- **Discover's player peek panel always errors** (query embeds FK relationships that don't exist), and the "Message" action routes to a route that doesn't exist.
- 18 routes are pure redirect stubs — mostly harmless legacy scaffolding, but they inflate the apparent surface area of the product.

Net: **ship-ready for the coach team-ops core; NOT ship-ready for the player performance loop (Lift Lab / readiness), travel, camps, or several War Room inspection flows.** The single highest-leverage fix is the helm_lifting_* ↔ baseball_lift_* table/ID-space reconciliation — one root cause accounts for 4 of the 7 BROKEN/degraded performance features.

**Counts: SHIPPED 72 · HALF-BUILT 21 · STUB 18 · BROKEN 7.**

---

## 2. Scoreboard

### BROKEN (7) — wired-looking features whose core path fails

| Feature | Route | Why it's broken |
|---|---|---|
| lift-session (player lift execution) | /baseball/dashboard/lift/[sessionId] | Read model returns helm_lifting_sessions IDs; start/log-set/complete actions query legacy baseball_lift_sessions by that ID — logging a set always throws "Session not found." |
| lift-log (player lift home + execution) | /baseball/dashboard/lift | Same ID-space mismatch: start silently no-ops (success:true, 0 rows), log/complete throw; core player loop cannot persist. |
| readiness | /baseball/dashboard/readiness | Writes go to helm_lifting_readiness_checkins; page's own "already checked in" query + every coach reader still reads baseball_readiness_checkins; soreness≥3 triggers an uncaught FK violation via saveSorenessMap. |
| travel | /baseball/dashboard/travel | createItinerary inserts ctx.user.id into created_by, which FKs to baseball_coaches.id — every Create Trip hits a Postgres FK violation masked as a generic toast; feature unusable for real teams. |
| college-interest | /baseball/dashboard/college-interest | Nav registers it as a player feature ("flag schools, track status") but the component has zero player UI; activated players get a permanent blank page (`return null`, gate never redirects). Coach view works. |
| video-edit (Create Clip) | /baseball/dashboard/videos/[id]/edit | Coaches are silently bounced; even for players, "clips" reuse the full-length parent URL and no player honors clip_start/end — trimming is metadata-only theater; raw client insert bypasses the action layer. |
| public-team-profile | /baseball/team/[id] | Query embeds organization_staff/organization_facilities tables that don't exist anywhere in the schema — PostgREST rejects the embed, page always notFound()s for every team. |

### HALF-BUILT (21) — real data path, but a load-bearing piece is missing or discarded

| Feature | Route | The gap in one line |
|---|---|---|
| performance-overview | /baseball/dashboard/performance | Readiness KPI/queue/board read legacy baseball_readiness_checkins that nothing writes anymore; coach status edits in embedded panel never reflect in the KPI strip. |
| stats-upload | /baseball/dashboard/stats/upload | "Map Columns" and "Match Players" wizard steps are cosmetic — coach corrections are never sent to the server, which silently re-derives its own mapping/matching. |
| stats-game-detail | /baseball/dashboard/stats/games/[gameId] | PDF upload tab is a dead stub (reads then discards the file), and CSV save path is a non-transactional delete-then-insert that can wipe a box score on failure. |
| stats-games-list | /baseball/dashboard/stats/games | Delete-game button is permanently `display:none` (missing `group` class + literal `hidden`) — fully-wired delete action is unreachable from any UI. |
| discover | /baseball/dashboard/discover | Player peek panel queries nonexistent FK embeds (always "Player not found"); "Message" routes to nonexistent /messages/new. Browse/filter/watchlist are real. |
| Team Documents | /baseball/dashboard/documents | Edit/Version-History/Revert/Move-to-Folder actions fully implemented server-side but never wired into the UI; upload hardcodes category/visibility. |
| teams-manage | /baseball/dashboard/teams | No edit/delete/leave team, no invite revoke; raw client-side inserts with silently-swallowed errors and a weak duplicate Math.random code generator. |
| program | /baseball/dashboard/program | Logo upload targets a 'logos' storage bucket that doesn't exist in prod (every upload fails); no can_manage_settings enforcement in-page; overlaps a second program-settings surface. |
| practice-effectiveness | /baseball/dashboard/practice-effectiveness | 3 of the 4 verdict buttons ("Worked"/"Needs More Time"/"Not Enough Data") persist the identical `resolved` value — the schema can't record the distinction the UI promises. |
| player-detail | /baseball/dashboard/players/[id] | Performance tab always shows the empty state because liftingOrgId/athleteId props are never passed on this canonical route (sibling /profile route proves the wiring exists). |
| player-profile-coach-view | /baseball/dashboard/players/[id]/profile | "Send Message" and "Add to Watchlist" are bare buttons with no onClick/href — the only two CTAs on the page do nothing; route is an orphaned duplicate of /players/[id]. |
| camps-list | /baseball/dashboard/camps | RLS lets players see only status='published' camps but everything creates 'active' — players can never see coach-created camps; audited server actions exist but the UI bypasses them with raw client writes. |
| colleges-directory | /baseball/dashboard/colleges | State filter populated from player home states, not college states; query errors render as fake "No colleges found"; no player-type gating per spec. |
| journey | /baseball/dashboard/journey | Player's 6-value status vocabulary is completely disconnected from the coach's 5-stage pipeline; coach_name/last_contact hardcoded null; school↔event matching by fragile name string. |
| dev-plans-list | /baseball/dashboard/dev-plans | Goal schema mismatch (writer uses `completed`, actions use id/status/progress, parseGoals mints new random IDs per fetch) — goals created here can never be completed from the coach UI. |
| dev-plan-detail | /baseball/dashboard/dev-plans/[id] | Read-only shell: fully built complete/progress server actions exist but zero controls call them from this page. |
| settings-appearance | /baseball/dashboard/settings/program#appearance | Brand accent + theme persist correctly but the consumer component (BaseballProgramBrand) is never mounted anywhere — saved branding has zero visible effect. |
| settings-data-retention | /baseball/dashboard/settings/program#data-retention | 1 of 6 spec'd settings has UI; even that one (season archive policy) has no enforcement job — a decorative toggle writing an inert column. |
| settings-recruiting-preferences | /baseball/dashboard/settings/recruiting-preferences | Saves fine, but Discover never reads the philosophy table, and the match-score RPCs it references only exist in an unapplied archived migration — a closed loop nothing consumes. |
| public-player-profile | /baseball/player/[id] | Coach-facing "Message" button is dead UI (no handler/href); player_stats plumbing is a vestigial hardcoded `[]`. |
| public-program-profile | /baseball/program/[id] | Facilities/commitments sections hardcoded empty against tables that don't exist (~85 lines of unreachable UI); "Contact Program" button is dead. |

### STUB (18) — no real feature at the route

| Feature | Route | What it actually is |
|---|---|---|
| coach-dashboard-college | /baseball/coach/college | Unconditional redirect to command-center; no college-specific view exists. |
| coach-dashboard-high-school | /baseball/coach/high-school | Documented deprecated legacy-redirect to command-center. |
| coach-dashboard-juco | /baseball/coach/juco | Redirect; spec'd JUCO dual-mode toggle was never built. |
| coach-dashboard-showcase | /baseball/coach/showcase | Redirect; no showcase coach view exists anywhere. |
| team-overview | /baseball/dashboard/team | Redirect alias with a dead loading skeleton that can never render. |
| team-high-school | /baseball/dashboard/team/high-school | Bare redirect, unreachable error boundary. |
| stats-home | /baseball/dashboard/stats | Redirect-only stub → stats-center (self-documented as orphan). |
| analytics | /baseball/dashboard/analytics | Coaches are hard-redirected away; no coach analytics exists in the codebase (player analytics view exists but is a different persona). |
| performance-player-detail | /baseball/dashboard/performance/players/[id] | Redirect shim to generic player page; performance-specific view explicitly "deferred." |
| academics (as Passport/player feature) | /baseball/dashboard/academics | Coach-only route (solid for coaches); players are redirected — no player "my academics" surface exists anywhere. |
| settings-demo-mode | /baseball/dashboard/settings/demo-mode | Redirect to a settings page whose demo-mode section was deliberately removed; the column is write-blocked and inert. |
| settings-guardian-access | /baseball/dashboard/settings/guardian-access | Coach-only policy toggles; a player landing here gets a fully-disabled coach mega-form with no explanation. |
| settings-showcase-profile | /baseball/dashboard/settings/showcase-profile | Redirect to coach-only scout-access toggles; no player-owned showcase profile editor exists. |
| player-college-hub | /baseball/player/college | 5-line redirect to /player/today. |
| player-high-school-hub | /baseball/player/high-school | 5-line redirect to /player/today. |
| player-juco-hub | /baseball/player/juco | 5-line redirect to /player/today. |
| player-showcase-hub | /baseball/player/showcase | Documented deprecated legacy-redirect to /player/today. |
| marketing-home | /baseball | Session-router redirect built to fix a 404; there is no marketing/landing content at all. |

### SHIPPED (72) — genuinely wired end-to-end

| Feature | Route | One-line status |
|---|---|---|
| coach-onboarding-type-select | /baseball/(onboarding)/coach | Legacy redirect into the real wizard, which is fully wired (the redirect file itself is deletable dead code). |
| coach-onboarding-flow | /baseball/coach-onboarding | 5-step wizard → real org/coach/team/staff inserts; team-insert failure is non-fatal (watch item). |
| player-onboarding-flow | /baseball/(onboarding)/player | Real join-team + completePlayerOnboarding upsert with server-side sanitization; wiring test guards regression. |
| dashboard-home | /baseball/dashboard | Honest role dispatcher to command-center / player-today. |
| command-center | /baseball/dashboard/command-center | Real staff-gated read-model + wired invite/contract actions; insight triage props unwired here (by design?); stale loading skeleton. |
| Roster | /baseball/dashboard/roster | Full read/filter/boards/CSV/invite/lineup-save; capability-gated. |
| organization | /baseball/dashboard/organization | Showcase-gated multi-team overview; errors swallowed to empty state (polish item). |
| Calendar | /baseball/dashboard/calendar | Full CRUD + RSVP write; RSVP-read/recurring/availability honestly disabled (no baseball tables yet); attendance actions dead code. |
| events | /baseball/dashboard/events | Showcase-org event CRUD, real capability-gated actions; no edit UI on this page. |
| announcements | /baseball/dashboard/announcements | Create/delete/acknowledge fully wired with RLS on 3 real tables. |
| messages-list | /baseball/dashboard/messages | Real RPC-backed conversations + realtime; 1:1 only (team chat transform hardcoded off). |
| messages-thread | /baseball/dashboard/messages/[id] | Real send/read-receipt/realtime; minor missing not-found state. |
| tasks | /baseball/dashboard/tasks | Full CRUD + templates; reminder-setting persists but no dispatch job exists (UI-only reminders — fix or remove). |
| practice-planner | /baseball/dashboard/practice | Flagship-quality: capability-gated actions, stage-and-swap writes, publish validation, intelligence board. |
| postgame | /baseball/dashboard/postgame | Full generate/convert/dispose loop; video_evidence section permanently empty (builder never emits it). |
| signals | /baseball/dashboard/signals | 8 real actions incl. cross-subsystem materialization with idempotency; one of the strongest features. |
| stats-game-create | /baseball/dashboard/stats/games/create | Real capability-gated create → box-score route. |
| stats-game-new | /baseball/dashboard/stats/games/new | Documented alias redirect to /create (orphaned duplicate client file to delete). |
| stats-season | /baseball/dashboard/stats/season | Real season table fed by the recalc RPC pipeline; self-described "legacy" narrow scope vs Stats Center. |
| stats-center | /baseball/dashboard/stats-center | Paginated multi-table read-model with drift reconciliation, honest null rates, CSV export. |
| performance-builder | /baseball/dashboard/performance/builder | Real helm-table writes, stage-and-swap; class availability always "unknown" (no data source). |
| performance-groups | /baseball/dashboard/performance/groups | Full CRUD + dynamic rules + audit trail. |
| performance-live | /baseball/dashboard/performance/live | Real set-logging/substitution/messaging/tasks with offline queue; 20s polling. |
| performance-programs-list | /baseball/dashboard/performance/programs | Real gated list + create → editor. |
| performance-program-detail | /baseball/dashboard/performance/programs/[programId] | Full editor + publish materialization; documented double-publish race (needs unique constraint). |
| videos-list | /baseball/dashboard/videos | 5-tab library, real storage upload with rollback, ownership-scoped mutations. |
| video-detail | /baseball/dashboard/videos/[id] | Real access gating + view-count persistence (non-atomic increment). |
| Pipeline | /baseball/dashboard/pipeline | Canonical 5-stage Kanban/list/planner, all real actions with notifications. |
| watchlist | /baseball/dashboard/watchlist | Full CRUD, bulk ops, ownership + capability checks. |
| compare | /baseball/dashboard/compare | Real 4-player compare + PDF export + save; missing per-player authz check on save. |
| Saved Comparisons | /baseball/dashboard/comparisons | Real list/view/delete, RLS-scoped. |
| Decision Room | /baseball/dashboard/decision-room | 9 read-models + 6 real mutations; prod tables currently at 0 rows (unexercised under load). |
| scout-packets-list | /baseball/dashboard/scout-packets | Real roster/exposure/link-count hub. |
| player-scout-packet | /baseball/dashboard/players/[id]/scout-packet | Mint/revoke/relabel/preview all real with signal gates. |
| player-scout-packet-preview | .../scout-packet/preview | Renders the exact scout-visible model. |
| player-passport-coach-view | /baseball/dashboard/players/[id]/passport | Real visibility-resolved passport + settings writes. |
| player-stats-coach-view | /baseball/dashboard/players/[id]/stats | Real season stats + game log; year dropdown is a dead no-op control. |
| camp-detail | /baseball/dashboard/camps/[id] | Works via RLS-backed raw client writes; bypasses its own capability-checked server actions. |
| activate-recruiting | /baseball/dashboard/activate | Real capability-gated opt-in with server-side college block. |
| import-recruits (Import Center) | /baseball/dashboard/import | Preview/commit/rollback with fingerprints, review-holds, lineage snapshots — among the most complete features. |
| dev-plan-single | /baseball/dashboard/dev-plan | Real player goal completion; depends on the 2026-07-01 RLS fix migration being applied to prod. |
| my-stats | /baseball/dashboard/my-stats | Server-scoped self-only reads with honest states. |
| profile | /baseball/dashboard/profile | Real self-editor persistence; no avatar upload despite counting avatar in completion %. |
| settings-home | /baseball/dashboard/settings | Real password change + full account deletion; verify FK cascades on delete. |
| settings-ai | settings/ai → program#ai | 7 load-bearing toggles enforced by the engine, with tests + audit log. |
| settings-audit | /baseball/dashboard/settings/audit | Real capability-gated audit trail; some event-type chips may have no writers. |
| settings-imports | /baseball/dashboard/settings/imports | Registry genuinely load-bearing on the import pipeline; verify migration 20260624000460 applied. |
| settings-integrations | /baseball/dashboard/settings/integrations | Contract-only by design; credential-stripping + level-4 guardrail real. |
| settings-notifications | settings/notifications → program#notifications | Real persisted defaults + quiet hours; email/push honestly disclosed as future. |
| settings-permissions | /baseball/dashboard/settings/permissions | Real capability-map reference surface. |
| settings-philosophy | /baseball/dashboard/settings/philosophy | Real upsert with a real downstream consumer (insight generation). |
| settings-player-access | settings/player-access → program#player-access | 7 toggles enforced server-side via requiredPlayerAccess. |
| settings-privacy | /baseball/dashboard/settings/privacy | 3 real toggles after deliberate trim of 18 fake ones. |
| settings-program | /baseball/dashboard/settings/program | The consolidated Settings OS: identity, type, modules, AI, notifications — real, audited, validated. |
| settings-roles | /baseball/dashboard/settings/roles | Real per-program-type role-template reference. |
| settings-season | /baseball/dashboard/settings/season | Season CRUD real; the 7 module toggles persist but nothing enforces them yet (flagged). |
| settings-staff | /baseball/dashboard/settings/staff | Invites/capabilities/removal with privilege-escalation clamp; invite delivery is copy-link only. |
| settings-teams | /baseball/dashboard/settings/teams | Join code + policy real and RLS-enforced; first-code creation wrongly blocks HS/Showcase coaches. |
| player-passport | /baseball/player/passport | Full visibility-resolved passport + real settings writes. |
| player-practice | /baseball/player/practice | Honest published-view with server-side staff-block stripping. |
| player-timeline | /baseball/player/timeline | Real multi-source timeline + ack upserts with optimistic revert. |
| player-today | /baseball/player/today | 8-table daily loop, all controls persist; tasks card intentionally read-only. |
| public-scout-packet | /baseball/packet/[token] | Token-gated unauthenticated packet + CSV, strict rank filtering. |
| admin-demo-sessions | /baseball/admin/demo-sessions | Real admin-gated viewer; no /admin layout guard yet (single enforcement point). |
| join-invite-code | /baseball/join/[code] | Dual code resolution + atomic RPC redemption; success UI lies when approval is pending. |
| staff-join-invite-code | /baseball/staff/join/[code] | SECURITY DEFINER accept RPC with full re-validation. |
| auth-login | /baseball/login | Lockout + rate limits + role-aware redirects; hardened. |
| auth-signup | /baseball/signup | Real trigger + backstop profile creation; Google button is a disabled placeholder. |
| auth-complete-signup | /baseball/complete-signup | Real role/type completion flow. |
| auth-demo | /baseball/demo | Kill-switched, rate-limited, read-only-guarded shared demo. |
| auth-forgot-password | /baseball/forgot-password | Native Supabase reset flow. |
| auth-reset-password | /baseball/reset-password | Real session-validated password update. |

---

## 3. HALF-BUILT / STUB / BROKEN — What's Built, the Exact Gap, Effort to Finish

### 3.1 BROKEN

**lift-session + lift-log — /baseball/dashboard/lift[/[sessionId]] — Effort: M (shared fix)**
- Built: Polished player execution UI (readiness gate, per-set inputs, offline queue, PR summary); real self-only read path from helm_lifting_* tables.
- Gap: The W2-G rewire moved reads to `helm_lifting_sessions` but left `startLiftSession`/`logSetResult`/`completeLiftSession` (lifting-v11.ts:2028-2278) querying legacy `baseball_lift_sessions` by the helm ID. The two ID spaces are different UUIDs by design (`legacy_baseball_id` bridge). Start silently no-ops (returns success on 0 rows updated), log-set and complete throw. A parallel, correctly-migrated writer (`logLiftResult` in lifting.ts) exists but serves a different surface.
- Fix: Repoint the three v11 actions at helm tables (or resolve legacy_baseball_id server-side), make start check matched-row count, add one E2E covering start→log→complete against helm-only seed data, and consolidate the two logging paths.

**readiness — /baseball/dashboard/readiness — Effort: M**
- Built: Complete check-in UI + real auth-gated writes (to helm_lifting_readiness_checkins + baseball_bodyweight_entries).
- Gap: (1) Every consumer — the page's own "already checked in" query, performance-command, engine-run, decision-room, strength-groups, live-weight-room, stat-visuals — reads legacy `baseball_readiness_checkins`, which nothing writes anymore. Only a one-time backfill exists; permanent silent data loss. (2) Soreness ≥3 calls saveSorenessMap with the helm row ID against baseball_soreness_maps whose FK references the legacy table → uncaught FK violation strands the player mid-submit.
- Fix: Pick one source of truth, repoint either the write or all seven readers, fix the soreness FK, add error handling in handleSubmit, and an integration test asserting a submitted check-in appears in getPerformanceCommandData.

**travel — /baseball/dashboard/travel — Effort: S**
- Built: Full itinerary/expense UI, real read-model, zod-validated capability-gated actions, RLS.
- Gap: `createItinerary` writes `ctx.user.id` into `created_by`, which is NOT NULL FK → `baseball_coaches.id` (a different UUID). Every Create Trip fails with an FK violation swallowed into "Failed to create itinerary." Even the demo seed script makes the same mistake — the flow has never been exercised end-to-end.
- Fix: One-line change to `ctx.activeCoachId` (already on the context) + fix the seed + one integration test that actually creates a trip.

**college-interest — /baseball/dashboard/college-interest — Effort: M**
- Built: A genuinely working coach engagement dashboard (views/watchlist-adds per player).
- Gap: The nav registry serves it to players promising "flag schools and track status," but the component has zero player UI; activated players hit `return null` — a blank page, since the gate hook only redirects when NOT activated. A planned `/college-interest-player` route was never built.
- Fix: Build the player experience (or route players to journey/colleges) and correct the nav entry.

**video-edit (Create Clip) — /baseball/dashboard/videos/[id]/edit — Effort: M**
- Built: Player-only trim UI that inserts a real baseball_videos row with clip metadata.
- Gap: Coaches have no entry point and get silently bounced on direct nav. The "clip" reuses the full-length parent URL and no player component reads clip_start/end — playing a clip plays the whole video. Raw client insert bypasses the action/capability layer.
- Fix: Minimum viable: make the player seek/stop at clip bounds; move insert to a server action; decide coach scope; replace the silent redirect with an honest state.

**public-team-profile — /baseball/team/[id] — Effort: M**
- Built: Auth-gated page with real roster query and correct recruiting-privacy name masking.
- Gap: The main query embeds `organization_staff` and `organization_facilities` — tables that exist nowhere in the schema — so PostgREST rejects it and the page 404s for every team, always. Also mislabeled "(public)" while requiring a signed-in college/juco coach; no loading/error boundaries so schema failure is indistinguishable from a real 404.
- Fix: Drop or re-model the staff/facilities embeds, add error.tsx/loading.tsx, resolve the public-vs-gated intent, verify against live DB.

### 3.2 HALF-BUILT

**performance-overview — /baseball/dashboard/performance — M** — Real KPIs/board from baseball_lift_sessions, but the readiness half reads the dead legacy table (same root cause as readiness above), and coach status edits in the embedded panel write helm_lifting_sessions while KPIs read baseball_lift_sessions. Fixed automatically if the Lift Lab reconciliation is done properly.

**stats-upload — /baseball/dashboard/stats/upload — M** — 6-step wizard is real through parsing/persistence, but the server action signature accepts no columnMappings/playerMatches: everything the coach fixes in steps 2-3 is discarded and the server re-runs its own auto-detection. resolveUnmatchedPlayers is documented non-functional (raw CSV not persisted). UploadHistory reads columns the insert never writes. Fix: extend the action signature to accept the client's mapping/match state; persist raw CSV; align history columns.

**stats-game-detail — /baseball/dashboard/stats/games/[gameId] — M** — Manual box-score entry uses a proper atomic RPC; the CSV path uses forbidden delete-then-insert (data-loss risk, violates the repo's own hard rule); PDF tab advertises extraction that doesn't exist (file read then discarded). Fix: wrap CSV save in the existing RPC; delete or build the PDF tab.

**stats-games-list — /baseball/dashboard/stats/games — S** — Everything works except the delete button is unconditionally `hidden` (and its hover-reveal parent lacks `group`). One CSS fix + a deliberate delete UX.

**discover — /baseball/dashboard/discover — S** — Excellent server-derived browse/filter/watchlist layer. PlayerPeekPanel uses golf-copy-paste FK hints (`players_high_school_org_id_fkey`) that don't exist → every card click fails; "Message" routes to nonexistent /messages/new. Fix the select, build a real conversation-start flow, add one E2E click test.

**Team Documents — /baseball/dashboard/documents — M** — Upload/preview/version-upload/delete real. updateBaseballDocument, getVersionHistory, revertToVersion fully implemented with zero callers; DocumentCard's Edit/History/Move menu props never passed; upload hardcodes category:'general', is_player_visible:true. Fix: build the edit + version-history modals, add category/visibility pickers, verify storage RLS on the bucket prefix.

**teams-manage — /baseball/dashboard/teams — M** — Create team + invite genuinely persist (RLS-backed), but: no team edit/delete/leave, no invite revoke, all errors silently swallowed, weak Math.random codes duplicating a hardened server-side generator that goes unused, raw client writes instead of the mandated action layer.

**program — /baseball/dashboard/program — S** — Identity fields persist via real RLS-scoped update. Logo upload targets a 'logos' bucket confirmed absent from prod storage — the first control on the form always fails. No capability check beyond role==='coach'; overlaps /settings/program. Fix: create/repoint the bucket, add the capability gate, resolve the two-surfaces ambiguity.

**practice-effectiveness — /baseball/dashboard/practice-effectiveness — S** — The measurement engine, upsert persistence, and disposition-preserving re-runs are real and careful. But "Worked," "Needs More Time," and "Not Enough Data" all write the identical `resolved` disposition — the enum can't express the UI's promise. Extend the enum or collapse the buttons; wire (or relocate) the unused setReviewVisibility.

**player-detail — /baseball/dashboard/players/[id] — S** — Six tabs real (notes create is production-quality). Performance tab is permanently empty because the page never resolves/passes liftingOrgId/liftingAthleteId — the sibling /profile route does, proving it's a missed wire, not missing infrastructure. Also decide on exposing the already-built note edit/delete.

**player-profile-coach-view — /baseball/dashboard/players/[id]/profile — S** — Real data everywhere, but the page's only two CTAs (Send Message, Add to Watchlist) are inert buttons with no handlers, on an orphaned route reachable via breadcrumb. Wire them to existing actions or fold this page into the canonical /players/[id] and delete it.

**camps-list — /baseball/dashboard/camps — M** — Coach CRUD + player registration RPC real. Two structural failures: (1) RLS select policy requires status='published' for non-owners while everything writes 'active' — coach camps are invisible to every player, defeating the feature's purpose; (2) a full audited server-action layer (deleteCamp/checkIn/noShow/unregister) has zero callers; the UI bypasses it with raw client writes. Fix RLS-or-publish-step, wire the actions, verify E2E with a real player account.

**colleges-directory — /baseball/dashboard/colleges — S** — Browse + interest toggle real. State filter sources from baseball_players.state instead of organizations.location_state (filter can silently zero out); query errors indistinguishable from empty; no College-player gating per spec.

**journey — /baseball/dashboard/journey — M** — Real interests + engagement reads/writes. But the player's status vocabulary (interested…committed, free text, no CHECK) is a parallel universe from the coach's canonical 5-stage pipeline — the two "recruiting relationship" systems never touch. Dead coach_name UI branch, name-string event matching, status edits not recorded to the feed. Needs a product decision (unify or explicitly separate) more than code volume.

**dev-plans-list — /baseball/dashboard/dev-plans — M** — List/create/detail-read real. Goal data-shape schism: modal writes `{title, completed}` with no ID; mutation actions expect `{id, status, progress}` and are never called; parseGoals mints a fresh UUID per fetch, permanently breaking ID-based mutation for every plan created here. Unify the goal schema, persist stable IDs, wire controls.

**dev-plan-detail — /baseball/dashboard/dev-plans/[id] — S** — Honest read view over correct dual-role RLS, zero interactivity; the complete/progress actions already exist (used by the player's /dev-plan route). Wire role-branched controls + a coach edit/delete affordance.

**settings-appearance — settings/program#appearance — S** — Logo/colors/accent/theme all persist with audit. The purpose-built consumer (BaseballProgramBrand) is imported by nothing — zero grep hits — so brand accent/theme have no visible effect anywhere. Mount it in the dashboard shell, verify the CSS var is consumed, and note dark mode itself doesn't exist yet.

**settings-data-retention — settings/program#data-retention — L** — 1 of 6 spec'd policies has UI; import/audit retention columns exist with no UI; no consumer/cron reads any retention value — pure decoration today. Needs an actual data-lifecycle job plus the missing policies (or an explicit descope).

**settings-recruiting-preferences — /baseball/dashboard/settings/recruiting-preferences — M** — Beautiful save loop into a table nothing reads. Discover ignores it entirely (orders by updated_at); the match-score/percentile RPCs live only in an archived, unapplied migration; the "+5 point bonus" copy describes behavior that exists nowhere. Build the scoring layer or pull the page.

**public-player-profile — /baseball/player/[id] — S** — Access resolution, engagement logging, and watchlist toggle all real. The coach-facing "Message" button is dead UI; player_stats plumbing is a hardcoded `[]` vestige. Wire or remove both.

**public-program-profile — /baseball/program/[id] — M** — Org info, staff, and visibility-correct roster real. Facilities and commitments hardcoded `[]` against tables that don't exist (unreachable UI); "Contact Program" is a dead button; no pipeline CTA from the profile.

### 3.3 STUB (grouped)

- **Legacy redirect scaffolding (12 routes, effort: S to delete):** coach-dashboard-{college,high-school,juco,showcase}, team-overview, team-high-school, stats-home, performance-player-detail, player-{college,high-school,juco,showcase}-hub. All are unconditional redirects, several self-documented as deprecated orphans in nav-manifest/route-shell-contract tests. Decision needed: were per-type coach dashboards and per-type player hubs ever real spec intent? If yes each is an L build; if no, delete them and their dead loading/error boundaries so the route tree tells the truth.
- **analytics (coach) — L:** coaches are redirected away; no coach/Pressbox analytics exists anywhere in the codebase. If a coach analytics surface is spec intent, it's a from-scratch build.
- **academics (player lane) — L:** rock-solid coach feature; zero player-facing "my academics" surface despite spec listing an Academics tab and unused player-scoped actions (getPlayerClasses/addPlayerClass) sitting ready.
- **settings-demo-mode — S:** deliberately retired; column write-blocked, no runtime gate. Delete the route + dead boundaries or build a real demo-data gate.
- **settings-guardian-access / settings-showcase-profile — M each:** both redirect players into a disabled coach mega-form. Either build the player-facing counterpart (guardian invite/status; player-owned showcase profile) or stop presenting these as player-reachable.
- **marketing-home — L (product decision):** /baseball has no landing content at all — no hero, pricing, or CTA; it's a 404-fix session router. Fine for a private beta, a hard blocker for any public launch.

---

## 4. The Biggest Gaps (ordered by impact)

1. **Reconcile the Lift Lab table/ID split (helm_lifting_* vs baseball_lift_*/baseball_readiness_*).** One root cause breaks lift-session, lift-log, readiness, and half of performance-overview — the entire player daily performance loop, which is a headline pillar of the product. Nothing else comes close in blast radius. (M, but touches 7+ readers and 3 write actions; needs one E2E per loop.)
2. **Fix travel's created_by FK write.** One line + seed fix + test. Every coach hits it on first use. (S)
3. **Fix camps visibility (RLS 'published' vs 'active').** The recruiting-facing half of camps is unreachable; a coach's camp can never appear to a player. (S for the RLS/publish fix, M with action-layer wiring.)
4. **Fix Discover's player peek + dead message route.** The two core "inspect and contact a recruit" affordances in the War Room's discovery flow fail on every click. (S)
5. **Fix public-team-profile's nonexistent-table embeds.** The route 404s for all teams, silently. (M)
6. **Wire stats-upload's wizard corrections into the server action.** Coaches believe their column/name fixes matter; they're discarded. This is trust-destroying for the stat pipeline that feeds everything downstream. (M)
7. **Eliminate the CSV box-score delete-then-insert.** Direct data-loss risk on the official stats source of truth, violating the repo's own hard rule; the atomic RPC already exists. (S)
8. **Close the college-interest player dead-end and reconcile journey vs pipeline vocabularies.** The player-side recruiting story is currently three disconnected systems (journey statuses, coach pipeline, college-interest blank page). Needs a product decision, then modest code. (M)
9. **Sweep the dead controls and dead action layers** (documents edit/versioning, dev-plan goal controls, games delete button, profile-view CTAs, Contact Program, season-year selector, task reminders with no dispatcher). Each is small; together they are the "half-built feeling" the owner is worried about. (Mostly S each.)
10. **Delete the 12 legacy redirect stubs + orphaned duplicates** (unused NewGameClient copy, useOnboardingFlow hook, .tmp file, /profile orphan route) so the surface area you see equals the product you have. (S)
11. **Verify unapplied-migration risk in prod** — postgame, dev-plan-single (RLS fix), player-passport, timeline acks, import registry load-bearing columns all depend on migrations verified only as files. One live information_schema pass. (S, per house rule: schema_migrations is unreliable.)

---

## 5. Cross-Cutting Patterns

1. **The half-finished Lift Lab migration is the #1 systemic defect.** The W2-G rewire moved player writes to unified helm_lifting_* tables but left the v11 action layer, seven coach-facing readers, the soreness FK, and the readiness page's own dedupe query on legacy baseball_* tables. Result: silent no-op writes reported as success, hard FK crashes, and permanent coach-side data blindness. Any future table migration here must land writes + all readers + FKs in the same wave, with an integration test that round-trips a player action into a coach view.
2. **Fully-built server actions with zero UI callers (dead action layers).** Documents (update/history/revert), camps (delete/check-in/no-show/unregister), calendar attendance (get/check-in/uncheck-in), dev-plans coach mutations (completeGoal/uncompleteGoal), practice-effectiveness setReviewVisibility, the hardened invite-code generator TeamsClient ignores. Pattern: the audited, capability-checked layer gets written, then the UI ships on raw client Supabase writes or read-only shells. Either wire them or delete them — right now the security/audit story exists mostly on paper for these features.
3. **Raw client-side Supabase writes bypassing withBaseballAction.** teams-manage, camps (both pages), program page, privacy form, VideoClipper. They "work" via RLS but skip capability checks, audit logging, error surfacing, and revalidation — and are exactly where the silent-failure bugs live.
4. **Settings that persist but nothing consumes.** Brand accent/theme (consumer never mounted), data-retention policy (no lifecycle job), season module toggles (no feature checks them), recruiting preferences (Discover never reads them), demo_mode_enabled (write-blocked), task reminder_at (no dispatcher). A save button that writes an inert column is the most insidious kind of half-built — it passes every smoke test and does nothing.
5. **Queries against tables/FKs that don't exist.** organization_staff/organization_facilities (team + program public profiles), players_high_school_org_id_fkey / committed_to_org_id (PlayerPeekPanel), the archived-only match-score RPCs, the missing 'logos' bucket, travel's FK mismatch. All are golf-copy-paste or spec-drift artifacts that static types didn't catch because of `as any`/fromUntyped casts. A CI check that validates every PostgREST embed + storage bucket reference against generated types would have caught all of them.
6. **Client wizard state silently discarded server-side.** stats-upload's mapping/matching steps and VideoClipper's trim bounds both present interactive steps whose output never reaches persistence. Rule of thumb for review: every wizard step must map to a server-action parameter.
7. **Dead buttons.** At least seven visible, styled, clickable-looking controls do literally nothing (Send Message ×2, Add to Watchlist, Contact Program, games delete, season-year selector, PDF upload). Cheap to fix, disproportionately damaging to perceived quality.
8. **Legacy redirect shims accumulating (18 stubs).** The per-coach-type and per-player-type route families were superseded by command-center//player/today but never deleted; several carry dead loading skeletons/error boundaries. They cost audit time every pass and mislead anyone reading the route tree.
9. **Parallel duplicate implementations of one concept.** Two dev-plan surfaces (singular/plural), two video read-models, two player-timeline data paths (journey's use-journey vs the canonical timeline read-model), two program-settings pages, two lift-logging writers, journey-status vs pipeline-stage. Each pair is a drift factory; pick a canonical one per concept.
10. **Migration-applied uncertainty.** Multiple SHIPPED verdicts carry the caveat "if the migration is actually applied" (postgame, dev-plan RLS fix, passport share tokens, import registry columns, timeline acks). The repo's own history says recorded-but-unran migrations happen. A single scripted information_schema verification against prod should be part of release checklists.
11. **Error states that lie by omission.** A recurring pattern of `const { data } = await query` with the error ignored (colleges, organization, staff-settings, teams-manage) renders failures as pleasant empty states. The strong features (command-center, stats-center, signals) all use explicit error envelopes — that pattern should be mandatory.

---

## 6. Bottom Line for Planning

- The coach Pressbox core and Settings OS are real and close to launch-grade. Do not rebuild them; polish items are enumerated above.
- **Do not demo or ship the player performance story until the Lift Lab reconciliation lands.** It is currently a beautiful UI over a broken pipe, and it will fail in front of a user within the first minute of use.
- One focused wave (Lift Lab reconciliation + travel FK + camps RLS + Discover peek + CSV atomicity) flips 5 of the 7 BROKEN features and the worst HALF-BUILTs; that wave, plus the dead-control sweep and stub deletion, moves the honest number from ~61% to roughly 80% with mostly S/M efforts.
- The remaining distance to 100% is dominated by product decisions, not code: journey-vs-pipeline unification, player-facing academics/college-interest/showcase-profile/guardian surfaces, coach analytics, and a real marketing landing page.

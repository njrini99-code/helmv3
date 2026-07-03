# BaseballHelm Clean-Slate — Parallel Job List

> Hand each **GROUP** below to a separate Claude session. Each group is file-disjoint from the others,
> so sessions won't collide. Within a group, do the jobs as **small, single-surface PRs**.
> Source of truth: `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md` (§4). Generated 2026-07-01.

---

## Ground truth (read first, every session)

- Repo: `~/Downloads/helmv3`. Base every branch off `origin/main` (currently `5d30130f` — #421 is merged).
- **Validated ledger:** `docs/audits/HELMV3_ISSUE_LEDGER_2026-06-30.md` — per-issue root cause + evidence.
- **Intended behavior (SPEC-FIRST):** `docs/archive/2026-06/baseballhelm_revolution_plan/` — coach tabs `05_tab_specs_coach_account/NN_*`, player tabs `06_tab_specs_player_account/NN_*`. Read the matching tab's `permissions.md`, `acceptance_criteria.md`, `edge_cases.md`, `data_visible_to_player.md` **before** writing code.
- Product rules: `CLAUDE.md`. Post-mortem (why the last build drifted): `docs/audits/BASEBALLHELM_SHELL_ROUTE_POSTMORTEM_2026-06-30.md`.

## Standing rules (the contract — non-negotiable)

1. **Spec-first.** Read the V1 tab spec + the issue (`gh issue view <N>`) + the ledger evidence before coding. Where the app deliberately diverges from the spec, that's a decision to surface — not auto-treat as a bug.
2. **One surface per PR, ≤ ~15 files / ~400 lines.** This is *the* rule the post-mortem exists to enforce — PRs over the review bots' file ceilings (Greptile 100, CodeRabbit 150) get auto-skipped and duplication slips through. Never batch unrelated fixes.
3. **Delete dead code** the fix obsoletes — don't leave old+new coexisting.
4. **Branch:** `fix/baseball-<issue>-<slug>` off `origin/main`. **No direct-to-main pushes.**
5. **Migrations:** ADDITIVE only (CREATE OR REPLACE / IF NOT EXISTS). New timestamped file after `20260630230000`. `GRANT EXECUTE ... TO authenticated, service_role` only — **never anon** (Supabase re-grant gotcha). Serialize timestamps to avoid collisions.
6. **Verify before PR:** `npm run typecheck` and `npm run lint:ratchet` must pass. Put `Closes #<N>` in the PR body.
7. **Security/RLS/auth fixes:** adversarially self-review — try to break your own fix (fail-open? NULL `auth.uid()`? direct PostgREST bypass? capability-comparison direction?).
8. **Claim protocol:** before starting a GROUP, comment "claiming Group X" so sessions don't double up. Mark jobs done as you merge.

## 🔒 LOCKED files (in-flight PRs — do NOT edit until merged)

These are being changed by PRs already open/in-flight; wait for them to land or you'll conflict:

| File | Locked by | Affects jobs |
|---|---|---|
| `supabase/migrations/…is_team_staff…` | #405 (PR #542, merged/merging) | — |
| `src/app/baseball/actions/ai-governance.ts` | #510 (PR #544) | — |
| `src/app/baseball/actions/stats.ts` | #394 (in flight) | Wave 6 #379/#436 — do the non-stats.ts jobs first |
| `src/app/baseball/actions/academics.ts` | #513 (in flight) | Wave 10 #504/#509 — do the non-academics.ts jobs first |
| `src/app/baseball/actions/teams.ts` | #502 (in flight) | Wave 3 join-code (#440 also touches join flow — coordinate) |
| `src/app/baseball/actions/staff.ts` | #501 (in flight) | — |

**Do NOT touch** (owner decision): `scripts/*` hardcoded-secret issues **#516 / #391** — owner has accepted that risk; skip them.

---

## Parallelization map — 8 conflict-free groups

Each group → one session. Groups sharing a file are already merged together, so **no two groups touch the same file.**

| Group | Waves | Subsystem | Notes |
|---|---|---|---|
| **A** | 2 + 10 | Lifting + Academics | share `player-today.ts` → one session |
| **B** | 4 + 5 | Insights + Decision Room | share decision-room read-models + `StaffDecisionRoomClient.tsx` |
| **C** | 3 + 14 | Recruiting/Pipeline + Misc | share `camps/page.tsx`, `RosterClient.tsx` |
| **D** | 6 | Stats / Box Score | mostly `games.ts` + box-score (hold stats.ts jobs for #394) |
| **E** | 7 | Messaging / Notifications | self-contained (`use-messages.ts`, settings, announcements) |
| **F** | 8 + 9 | Onboarding + Documents/Video | disjoint file families |
| **G** | 11 + 12 + 13 | Mobile Chrome + Shell/Nav + Calendar | share `PlayerTodayClient.tsx`, `dashboard-shell.tsx`, `calendar/page.tsx` |
| **H** | 15 | CI / Tech debt | e2e specs + workflows only |

> Wave 1 (Security) — **DONE (staged as PRs, 2026-07-01)**, owned by primary session. All 7 clean single-surface PRs open, verified: #542(#405), #544(#510), #546(#440), #547(#513), #548(#502), #549(RLS cleanup), #551(#501). Awaiting merge + manual prod migration apply.

### ✅ Wave 1b — RLS legacy-policy cleanup — **DONE → PR #549**

Live-DB audit (2026-07-01) found RLS **is** applied (441 policies) but legacy baseline `ALL` policies grant write to **any team staff, no capability + no active-status check** — bypassing capability enforcement AND #405 via direct PostgREST (Postgres ORs permissive policies, so the legacy one wins over the newer capability-gated ones). PR #549 (`20260701000000_baseball_rls_legacy_policy_cleanup.sql`) drops the legacy ALL + adds cap-gated per-command policies on: `baseball_player_stats` (add DELETE), `baseball_staff_invitations` (add DELETE), `baseball_player_season_stats`, `baseball_box_score_uploads`, `baseball_team_invitations`. Uses `has_baseball_staff_capability()` (status+capability gated). ADDITIVE, PR-only — NOT applied to shared prod.

### 🟠 NET-NEW findings (2026-07-01, from Wave-1 live-DB work — queue after clean slate)

- **NN-1 [high → was live-broken] → DONE (PR #561, file 1):** `has_baseball_staff_capability` referenced 6 columns absent from `baseball_team_coach_staff` (`can_manage_lineups`, `can_view_readiness`, `can_modify_availability`, `can_view_private_notes`, `can_message_players`, `can_export_reports`) → `42703` for non-head coaches. **Not just latent RLS: `StaffSettingsClient.tsx` already renders live toggles for all 6, so granting any of them threw `42703` today** — this fixed a currently-broken UI feature. Fix = `20260701002000_baseball_staff_capability_columns.sql` adds all 6 (`NOT NULL DEFAULT false`, backfilled true for `is_head_coach OR is_primary`). PR-only, needs manual prod apply.
- **NN-2 [med] → DONE (PR #561, file 2):** `baseball_team_lineups` / `baseball_lineup_positions` legacy no-capability ALL policies replaced (mirrors #549): cap-gated I/U/D on `can_manage_lineups` + a staff SELECT on each (the legacy ALL was coaches' only read path; remaining SELECTs are player-only). `lineup_positions` scoped via parent-lineup `team_id`. Ordered after NN-1's column-add in the same PR. Adversarial review confirmed live: head-coach writes unaffected; 5/5 current staff `is_primary=true` so backfill is no-op-loss.
- **NN-3 [high] → DONE (PR #558):** `baseball_box_score_batting` / `baseball_box_score_pitching` gated INSERT/UPDATE/DELETE on `is_baseball_team_coach_v2` (no capability, no status) — same direct-PostgREST write bypass as #549, on the core game-stat tables. Fixed by `20260701001000_baseball_box_score_batting_pitching_rls.sql` (→ `has_baseball_staff_capability(team_id,'can_manage_stats')`, SELECT untouched). PR-only, needs manual prod apply.
- **NN-4 [low / dormant — NOT fixed]:** `has_baseball_staff_capability`'s CASE has **no branch for `can_manage_documents`** (added in `20260630180100`) → always falls through to `ELSE false`. No current policy calls the fn with that string (baseball_documents policies gate another way), so it's dormant — but a landmine if anyone later wires a documents RLS policy to `has_baseball_staff_capability(..., 'can_manage_documents')`. Add the branch when documents RLS is next touched.

---

## The jobs (by wave)

Format: `#issue [severity] title — files`. Batch same-file issues into ONE PR (noted). Do critical first.

### Group A

**Wave 2 — Lifting** (do #486 first; #491/#492 batch with it — same `publishLiftDay`)
- #486 [crit] Route program publishes into the table players read — `actions/lifting-v11.ts` (publishLiftDay)
- #492 [high] Dedup publishLiftDay assignments — `actions/lifting-v11.ts` (batch w/ #486)
- #491 [high] Empty Lift Builder selection = assign none — `actions/lift-builder.ts` (batch w/ #486)
- #456 [high] Unify Today lift/readiness onto helm_lifting — `read-models/player-today.ts`
- #457 [med] Join practice events in getPlayerPractices — `actions/practice.ts`
- #461 [med] Revert Daily Contract optimistic toggles on failure — `components/baseball/daily-contract/DailyContract.tsx`

**Wave 10 — Academics** (do #507 first — feature fully broken; #504/#509 wait for #513)
- #448 [high] Player-completable dev-plan goals — `dashboard/dev-plan/page.tsx`, `actions/dev-plans.ts`
- #507 [high] Fix Player Today coach-notes query (wrong columns) — `read-models/player-today.ts`
- #508 [med] Let college programs reach Academics — `lib/baseball/server-route-guards.ts`, `supabase/middleware.ts`
- #504 [med] Enforce academics/travel module toggles — `actions/academics.ts`,`travel.ts`,`nav-registry.ts` (after #513)
- #509 [med] Scope eligibility reads to active team — `actions/academics.ts` (after #513)

### Group B

**Wave 4 — CoachHelm Insights** (#472+#473 batch; #496 shared w/ Wave 5 — fix once)
- #472 [high] insight dismiss/feedback auth uses coach_id vs user.id — `actions/insights.ts`
- #473 [high] engine upsert reactivates dismissed insights — `coachhelm/engine-run.ts` (batch w/ #472)
- #496 [high] Decision Room "Players to discuss" read-model shape — `read-models/decision-room/focus-imports.ts`
- #474 [med] Render insight body vs description on player profile — `coachhelm/engine-run.ts` + player-profile
- #475 [med] Honor player_visible in Practice Intelligence Board — `actions/practice-intelligence.ts`
- #478 [med] Collapse competing development_milestone insights — `actions/insights.ts`
- #498 [med] Stop mislabeling stable reviews "Moved the wrong way" — `staff-decision-room/StaffDecisionRoomClient.tsx`
- #512 [med] Surface timeline ack state on coach player profile — `dashboard/players/[id]/page.tsx`

**Wave 5 — Decision Room** (#493/#494/#495/#496 = one focused rewrite of `decision-room/{agenda-ledger,focus-imports}.ts`)
- #493 [high] agenda detail crash when sourceRefs null — `StaffDecisionRoomClient.tsx` + read-model
- #495 [high] Map ledger rows to kind/label/detail/at (SELECT hits nonexistent cols) — `decision-room/agenda-ledger.ts`
- #494 [med] Map agenda rows to kind:'meeting_item' — `decision-room/agenda-ledger.ts`
- #476 [med] Preserve practice-effectiveness disposition on upsert — `actions/practice-effectiveness.ts`
- #497 [med] Align disposition filter w/ signal inbox — `decision-room/insights.ts`

### Group C

**Wave 3 — Recruiting/Pipeline/Discover/Camps** (#440 first+isolated; #427/#428 batch; #430/#431 hold for #394)
- #440 [crit] Route direct join_code through joinTeamByCode — `join/[code]/join-team-client.tsx` + page.tsx
- #427 [high] Fix pipeline drag stage resolution — `pipeline/PipelineClient.tsx`
- #442 [high] Enforce camp capacity atomically — `actions/camps.ts`, `camps/page.tsx`
- #470 [high] Privacy settings field mapping — `settings/privacy/page.tsx`, `PrivacySettings…`
- #425 [med] Route pipeline recruits to public profile — `features/pipeline-card.tsx`, `position-planner/PlayerQuickView.tsx`
- #426 [med] Align pipeline stage UI w/ 5-stage contract — `lib/recruiting/stages.ts` + PipelineClient
- #428 [med] Stop false drag-success on stage-update fail — `pipeline/PipelineClient.tsx` (batch w/ #427)
- #429 [med] Revert Discover watchlist UI on failure — `coach/discover/DiscoverView.tsx`
- #430 [med] Discover Teams pagination/counts — `actions/discover.ts` (after #394)
- #431 [med] Discover player sort server-side — `actions/discover.ts` (after #394)
- #432 [med] Fix PlayerDetailModal message nav path — `coach/PlayerDetailModal.tsx`
- #443 [med] Exclude cancelled camp regs from capacity — `camps/page.tsx` (batch w/ #442)
- #462 [med] JUCO uses recruiting ProfileEditor — `dashboard/profile/page.tsx`
- #505 [med] Align Staff Settings edit w/ can_invite_staff — `read-models/decision-room/staff-settings.ts`
- #500 [low] Don't bump scout-packet view_count on CSV — `actions/scout-packet.ts`

**Wave 14 — Misc** (#489/#490 batch — lineup)
- #490 [med] Swap/return displaced lineup player — `coach/lineup/LineupBuilder.tsx`
- #489 [med] Check saveLineup result before success toast — `roster/RosterClient.tsx` (batch w/ #490)
- #446 [med] Travel past/upcoming classification — `baseball/travel/TravelClient.tsx`
- #447 [med] Camp date off-by-one — `camps/page.tsx` + `camps/[id]` (coordinate w/ #442/#443)
- #459 [med] Wire activate page to activateRecruitingExposure — `dashboard/activate/page.tsx`
- #477 [med] Preserve postgame disposition on upsert — `actions/postgame.ts`
- #503 [med] Enforce season module toggles at runtime — `actions/team-season-settings.ts`
- #467 [low] Repair/remove dead demo-mode link — `lib/baseball/settings-route-aliases.ts`
- #511 [low] Player-visible scope control on coach notes — `player-profile/PlayerProfileClient.tsx`

### Group D — Wave 6 Stats/Box Score (#434 first — shared `sumInningsPitched`; #433/#437 batch in games.ts)
- #433 [high] Preload box-score lines when editing — `stats/games/[gameId]/page.tsx`, box-score
- #434 [high] Sum innings in outs not decimals — `box-score/BoxScoreView.tsx`,`BoxScoreEntry.tsx`, stats-center
- #435 [med] Scope player game log to season year — `actions/games.ts`, players/[id]/stats
- #437 [med] CSV upload completes game + recalcs — `actions/games.ts` (batch w/ #433)
- #439 [med] Wire season-year selector — `stats/season/page.tsx`
- #499 [med] Preserve Compare column order from URL — `compare/CompareClient.tsx`
- #438 [low] Count ties in W-L summary — `baseball/games/GamesList.tsx`
- #379 [med] reconcile seeded stats w/ Stats Center — `read-models/command-center.ts`, stats.ts *(after #394)*
- #436 [med] Compute OBP/SLG/OPS in aggregates — `actions/stats.ts` *(after #394)*

### Group E — Wave 7 Messaging (#450/#455/#451 in use-messages.ts; #454/#466 in settings)
- #450 [med] Failed sends = failures — `hooks/use-messages.ts`
- #455 [med] Update read receipts — `hooks/use-messages.ts` (batch w/ #450), `messages/ChatWindow.tsx`
- #451 [low] Clear unread badges on open — `hooks/use-messages.ts` (batch)
- #449 [med] Ack CTA before others ack — `announcements/AnnouncementsPlayerView.tsx`
- #452 [med] Refresh announcements after create/delete — `announcements/page.tsx` + CreateAnnouncementFlow
- #454 [med] Persist notification prefs + honor — `settings/page.tsx`, `actions/messages`
- #466 [med] Stop faking coach notif saves — `settings/page.tsx` (batch w/ #454)

### Group F

**Wave 8 — Onboarding** (#468/#469/#471 batch — same coach-onboarding page)
- #464 [high] Player onboarding completes via UPSERT — `(onboarding)/player/page.tsx`
- #441 [med] Fix showcase copy-invite-link path — `teams/TeamsClient.tsx`
- #468 [med] Block "invite S&C" without email — `coach-onboarding/page.tsx`
- #469 [med] Align password validation w/ server — `coach-onboarding/page.tsx` (batch)
- #471 [med] Persist/remove cosmetic plan selection — `coach-onboarding/page.tsx` (batch)

**Wave 9 — Documents/Video** (#487/#488 batch — VideoLibraryClient; #506 after #421-plumbing)
- #453 [high] Wire documents upload/new-version — `documents/documents-client.tsx`
- #487 [med] Video uploads via saveMyVideo — `features/video-upload.tsx`, `video/VideoLibraryClient.tsx`
- #488 [med] Refresh Video Library after mutations — `video/VideoLibraryClient.tsx` (batch w/ #487)
- #506 [low] Expose can_manage_documents in matrix — `staff/StaffSettingsClient.tsx`

### Group G — Waves 11 (mobile chrome) + 12 (shell/nav) + 13 (calendar)
Mobile (all CSS/layout, need device repro — see §5): #479,#480,#481,#482,#483,#484,#485
Shell/nav: #460 (Today practice CTA route — `PlayerTodayClient.tsx`), #463 (teamless timeline/passport), #465 (reset redirect msg-key)
Calendar: #458 [high] team-tz todayIso (`player/today/page.tsx`), #444 (events zero-team spinner), #445 (persist requires_rsvp)

### Group H — Wave 15 CI/Tech debt
- #372 [med] Make authenticated smoke tests mandatory — `e2e/baseball-phase1.spec.ts`, `playwright.yml`
- #373 [low] Extend route crawler to authed sessions — `scripts/route-crawler-baseball.mjs`
- #377 [low] Business/product-truth contracts — `src/contracts/baseball/**` (new)
- #382 [low] Seeded prod smoke for stats — `e2e/baseball-phase1.spec.ts` + workflow

---

## §5 NEEDS_REPRO (20 issues — need the app running / a real device)
The mobile-chrome wave (#479–#485) plus drag-and-drop, timezone, and race-condition items require a live app/device to fully validate. Static fix + then confirm on device before closing. (Full list in the ledger §5.)

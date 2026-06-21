# GolfHelm E2E Tab Audit — Remediation Plan (2026-06-20)

Synthesized from 7 slice clustering passes over the canonical 156-finding ledger
(`docs/audits/_e2e_tab_audit_2026-06-20/REMEDIATION_LEDGER.csv`). Every F-id
(F001–F156) is mapped to exactly one cluster. The filled ledger is the
completeness spine; this file is the execution plan.

---

## 1. Executive Approach

The audit surfaced 156 findings across 28 GolfHelm tabs. Root-cause clustering
collapses them into **45 clusters** in three waves (F015 + F024 refuted → dropped; A4 enum dropped → app-only; 154 actionable findings):

- **Wave A (DB / security)** — one ordered, review-gated migration sequence
  applied to a Supabase **preview branch**, gated by RLS tests + `get_advisors`
  + live `information_schema`/`pg_policies`/`pg_enum` re-queries. CRITICAL IDOR
  first. Nothing in Wave B/C that depends on a schema change may land until the
  matching Wave-A migration is merged and verified on prod.
- **Wave B** — high-value code clusters: those that *depend on* Wave-A DDL
  (e.g. the Patterns column remap needs the two new `golf_patterns_v2` columns),
  plus the parallel-safe CRITICAL/HIGH/MEDIUM behavioral fixes. CRITICAL/HIGH and
  any security-sensitive scoping change are **review-gated**; LOW/MEDIUM run
  **autonomously**.
- **Wave C** — independent LOW long tail (cosmetic, legacy-only retire/skip,
  doc-honesty, latent pagination). All **autonomous**.

**Dedupe rule applied:** where the DB-security slice and a tab slice both claimed
a finding, **DB wins** (the schema/RLS/grant change is the gating fix); the tab
slice's code-side follow-up is folded into that cluster's notes and serialized
*after* the DDL merges. This affected F001/F002/F018/F058/F120 (db ⊃ coach),
F007 (db ⊃ shared). (F015 refuted on verification — dropped; see Wave-A note.)

**Legacy posture:** prod runs the Fairway redesign (`NEXT_PUBLIC_REDESIGN=true`).
Findings on flag-off-only forks are `retire-dead-code` (delete) or `skip-dormant`
(won't-fix); only live-Fairway-path findings are `fix`. NOTE: several files
labeled "legacy" (`PremiumCalendarClient`, `EventDetailModal`, `MobileEventSheet`,
`GolfCalendarWrapper`) are **reused unchanged on the live Fairway calendar grid**
— those are `fix`, not retire.

---

## 2. The Three Binding Decisions

1. **AUTONOMY = HYBRID.** LOW/MEDIUM code fixes run autonomously. CRITICAL/HIGH
   and **all** DB/security changes are **review-gated** (pause for human sign-off
   before merge/apply). Each cluster carries an explicit `autonomyTier`.
2. **LEGACY = SKIP/RETIRE.** No fixes are planned to legacy (flag-off) behavior.
   Legacy-only findings → `retire-dead-code` or `skip-dormant`. Live-path → `fix`.
3. **VERIFICATION = LIVE-REPRO + TESTS.** Every behavioral finding has an exact
   browser red→green step (demo coach `demo@golfhelmdemo.com` / `Demo2026` and
   player `rinin376@gmail.com` on "Demo University Golf"). DB findings get an RLS
   test + a live policy/grant re-query. Everything also gets typecheck + lint +
   vitest. (Live-repro reality check: the prod demo player is Cole Bennett on a
   **men's** team with 2 head coaches — women's-anchor (F006) and active-focus-area
   repros (F005/F073/F074) require seeding; multi-team/inactive/>50-round repros
   (F031/F081/F087/F088/F095) need fixtures the demo team may lack → vitest guard +
   documented manual repro where a live fixture is infeasible.)

---

## 3. Cluster Table

Ordered by wave, then severity. DB-dep = depends on a Wave-A migration.
HOT = touches a shared hot file (serialize). Effort: S/M/L.

### Wave A — DB / Security migrations (ALL review-gated, applied to preview branch first)

| Cluster | Wave | Autonomy | SevMax | #f | ledgerIds | files | DB-dep | verification | effort |
|---|---|---|---|---|---|---|---|---|---|
| A1 messaging RPC IDOR + anon EXECUTE + soft-deleted leak | A | review-gated | CRITICAL | 2 | F004, F071 | 20260618000000_harden_get_golf_conversations_rpc.sql | self | RLS test: demo player calling rpc with coach's user id → 0 rows/42501; `role_routine_grants` shows NO anon; soft-deleted msg excluded from preview+unread; browser: own threads unchanged. +tc/lint/vitest | M |
| A2 golf_documents player SELECT honors is_public | A | review-gated | CRITICAL | 1 | F003 | 20260618000100_golf_documents_select_is_public.sql | self | RLS test: player SELECT of is_public=false doc → 0 rows (was 1); coach → 1; `pg_policies` qual contains is_public. Code companion (documents.ts player guard) folded → docs-travel, serialized after. +tc/lint/vitest | M |
| A3 player-self UPDATE policy on golf_player_focus_areas | A | review-gated | CRITICAL | 1 | F005 | 20260618000200_focus_areas_player_self_update.sql | self | RLS test: demo player UPDATE own focus area → rowCount=1 (was 0 silent no-op); unrelated player → 0; both _update_coach+_update_player exist. Code companion (development.ts 0-row=hard error) folded → coachhelm dev cluster + player-intel. +browser my-development | M |
| ~~A4 enum +injured/redshirt~~ **DROPPED → app-only** | — | — | — | 0 | F007 | — | — | **Decision: DROP from UI** (no enum migration). Fix moved to B4 — remove Injured/Redshirt from the status pickers, leaving active/inactive. | — |
| ~~A5 credits int→numeric~~ **DROPPED** | — | — | — | 0 | F015 | — | — | **Refuted** in audit §6 — credits int/float is not a real defect. Half-credit support would be a separate enhancement, not a bug fix; out of scope. | — |
| A6 revoke over-broad anon GRANT ALL (reviews+patterns_v2) | A | review-gated | MEDIUM | 2 | F086, F113 | 20260618000500_relock_anon_grants_reviews_patterns.sql | self | REVOKE ALL FROM anon (mirror 20260528011000); `role_table_grants` anon→0 rows; anon key SELECT/INSERT denied; authenticated writes still work. Do NOT re-grant anon. +tc/lint/vitest | S |
| A7 patterns_v2 add addressed_at + coach_notes columns | A | review-gated | CRITICAL | 4 | F001, F002, F018, F058 | 20260618000600_patterns_v2_addressed_at_coach_notes.sql, database.ts | self | ADD COLUMN IF NOT EXISTS; `information_schema` 2 cols; coach UPDATE lifecycle/addressed_at/coach_notes → rowCount=1 (was 42703). **Must merge BEFORE** the Patterns code remap (B1) which edits pattern-management.ts (HOT). +tc/lint/vitest | M |
| A8 focus_areas progress_notes default → {entries:[]} | A | review-gated | LOW | 1 | F120 | 20260618000700_focus_areas_progress_notes_default.sql | self | ALTER DEFAULT (no row rewrite); `information_schema` column_default; insert+read → {entries:[]}. Bundle in same focus-areas window as A3. +tc/lint/vitest | S |
| A9 (OPTIONAL) golf_rounds.team_id backfill + coach RLS-via-membership | A | review-gated | LOW | 1 | F147 | 20260618000800_rounds_team_id_backfill.sql (conditional) | self | Root is the WRITE path (golf.ts getPlayerTeamId returns null for non-active members). Do NOT loosen RLS (would leak cross-team). Fix = carry team_id on round write (code, → rounds cluster B) + optional one-off backfill of existing NULL-team rounds. Author migration only if owner picks the backfill route. | M |

### Wave B — code clusters (Wave-A-dependent + high-value parallel-safe)

| Cluster | Wave | Autonomy | SevMax | #f | ledgerIds | files | DB-dep | verification | effort |
|---|---|---|---|---|---|---|---|---|---|
| B1 Patterns lifecycle column remap + read-back | B | review-gated | CRITICAL | (code for A7) | F001,F002,F018,F058 | pattern-management.ts (HOT), PatternCard.tsx, PatternValidationModal.tsx | A7 | browser: Confirm+Address a pattern persists across refresh; Coach Notes + Validated timestamp render; unit asserts payload references only real cols. Remap validated_at→validation_date, validated_by→validator_coach_id/validated_by_coach, addressed_at/coach_notes→new A7 cols, notes→resolution_notes. +tc/lint/vitest | M |
| B2 Tasks read-model unification → golf_task_assignments | B | review-gated | CRITICAL | 5 | F010,F011,F033,F035,F027 | use-task-realtime.ts (HOT), tasks/page.tsx, dashboard-data.ts (HOT) | none | browser: coach progress N/M; player sees+completes task (stays); player root home Today lists task. F027 (player root actionItems) folded here — same root. Subscribe realtime to golf_task_assignments. +vitest+tc/lint | L |
| B3 Notification delivery consolidation (coach UI + unified defaults) | B | review-gated | CRITICAL | 5 | F008,F009,F032,F091,F149 | FairwaySettingsGeneral.tsx (HOT w/ B16), notification-preferences.ts, notifications/types.ts, CommandPalette.tsx | none | browser: coach Notifications panel persists to users.notification_preferences; palette no longer dead-ends; delivery-gate test off→no send; defaults aligned; .maybeSingle() on write read. No anon grant; leave orphaned golf_player_notification_state in place (skip). +tc/lint/vitest | L |
| B4 Roster status pickers (drop injured/redshirt) + active-status filters | B | review-gated | HIGH | 4 | F007(code),F083,F153,F154 | FairwayPlayerStatusBadge.tsx, FairwayPlayerActionsMenu.tsx, PlayerStatusBadge.tsx, PlayerActionsMenu.tsx, golf.ts (HOT), roster/page.tsx, team/page.tsx, team-hub/page.tsx | none | browser: status picker offers only active/inactive (Injured/Redshirt removed → no failing enum write); ghost pending/removed members no longer render/count. App-only per DROP decision. +vitest+tc/lint | M |
| B5 Multi-coach team resolution + staff-strict authz | B | review-gated | HIGH | 3 | F031,F036,F037 | golf.ts (HOT), team/page.tsx, announcements.ts | none | browser (multi-coach org): updatePlayerStatus persists (resolveCoachTeamIdWithCookie); player team page shows head coach; co-coach deletes peer announcement (validateCoachTeamAccess). +vitest+tc/lint | M |
| B6 Calendar restore-from-cancelled control | B | review-gated | HIGH | 1 | F013 | FairwayCalendar.tsx, PremiumCalendarClient.tsx | none | browser: soft-cancel event → Restore button renders → updateGolfEvent status:'confirmed' un-cancels. PremiumCalendarClient is LIVE (reused on Fairway grid). +tc/lint/vitest | S |
| B7 Messaging attachments render + signed download | B | review-gated | HIGH | 1 | F022 | MessageThreadPane.tsx | none | browser: send image+pdf → recipient sees gallery (image inline, file download chip via getSignedUrlsForAttachments). Legacy renderer skip-dormant. +tc/lint/vitest | M |
| B8 Document download via signed URL (private bucket) | B | review-gated | HIGH | 2 | F020,F021 | FairwayDocuments.tsx, documents-client.tsx, documents.ts | none | browser: Download → file downloads (was 403). Route through signed URL (reuse getPreviewUrl pattern). Legacy twin fixed-while-touching. is_public enforcement = A2. +tc/lint | S |
| B9 Alerts urgent-severity normalization (filter+chip+badge) | B | review-gated | HIGH | 2 | F016,F048 | alerts/page.tsx, FairwayCoachHelmSignals.tsx (HOT) | none | browser: urgent alert renders by default; applied chip reads "Critical"; signalCount matches feed. Normalize urgent→critical in UI vocab; keep DB fetch ['urgent','high']. +vitest+tc/lint | S |
| B10 What-If improvements + prediction baseline wiring | B | review-gated | HIGH | 3 | F025,F026,F080 | coachhelm-data.ts, FairwayPlayerCoachHelm.tsx (HOT w/ B23), WhatIfPanel.tsx | none | browser (LIVE-reproduced): What-If shows ranked improvements + Simulate; Predicted shows finite score; projected = baseline + projectedScoringChange. +unit+tc/lint | M |
| B11 My Standing: StandingStrip pga_omitted + counterfactual line | B | review-gated | CRITICAL | 2 | F006,F028 | StandingStrip.tsx, my-standing/page.tsx | none | F006 needs WOMEN'S-team player seeded → no reference tick/Readout when pga_omitted; F028 CounterfactualLine restored under each strip on flag-on. +component test+tc/lint | M |
| B12 Chat create_goal confirm gate (security-sensitive write) | B | review-gated | HIGH | 1 | F017 | agent.ts, tools.ts, ChatMessageList.tsx, ChatDrawer.tsx, AskThreadPane.tsx | none | browser: "create goal…","yes" → NO golf_goals row until explicit Confirm card click; Cancel writes nothing. +tc/lint/vitest | L |
| B13 Development route SELECT: provenance + sparkline + outcome read-back | B | review-gated | HIGH | 3 | F019,F064,F065 | development/page.tsx, PlayersGridView.tsx, FocusAreaCard.tsx | none | browser: SourceChip link renders; sparkline draws; "Did the coaching land?" advances via from_insight_id join (code-only; outcome_status stays on golf_coach_insights). +tc/lint/vitest | M |
| B14 Classes edit + error feedback + calendar resync | B | review-gated | HIGH | 4 | F014,F043,F044,F103 | AddClassModal.tsx, classes/page.tsx, ClassDetailModal.tsx | none | browser: edit opens prefilled; save failure toasts; calendar resync (detectSemester default); semester subtitle hidden when empty. No destructive delete-then-insert. (F015 half-credits dropped — refuted.) +vitest+tc/lint | M |
| B15 Onboarding Suspense + avatar + orphan cleanup + coach resume + player-record guard | B | review-gated | HIGH | 5 | F023,F077,F078,F079,F131 | onboarding/player/page.tsx, onboarding/coach/page.tsx, onboarding.ts | none | browser: /player Suspense clean build; coach visiting /player writes NO stray golf_players row (F131); avatar_url written; coach wizard resumes; outer catch deletes createdCoachId. (F024 player→coach escalation refuted — optional cheap symmetric guard while here.) +integration+tc/lint | L |
| B16 Settings general resilience + Distance Units + multi-org gating | B | autonomous | MEDIUM | 3 | F089,F090,F150 | FairwaySettingsGeneral.tsx (HOT w/ B3), use-distance-units.ts | none | browser: failed profile fetch → error+Retry (was infinite skeleton); Distance Units panel persists; cross-org team-settings save gated so org update can't half-apply. No new RLS. +tc/lint/vitest | M |
| B17 Coach-home KPI sparklines/deltas + Today + Action Items | B | autonomous | MEDIUM | 3 | F045,F046,F104 | FairwayCoachDashboard.tsx | none | browser: MetricCards show delta+sparkline; Today region + Action Items render from already-computed enhancedData. Presentational only. +component test+tc/lint | M |
| B18 Auth: server-action reuse + reset recovery + safe returnTo + signup revalidate | B | review-gated | MEDIUM | 4 | F038,F039,F099,F100 | forgot-password/page.tsx, reset-password/page.tsx, login/page.tsx, auth.ts | none | browser: forgot via rate-limited action, generic msg; full reset E2E (recovery session/exchangeCodeForSession); returnTo via isSafeInternalPath; signup revalidates. F039 needsLiveVerify. +tc/lint/vitest | M |
| B19 Coaching settings self-gate (infinite-skeleton fix) | B | autonomous | MEDIUM | 1 | F059 | settings/coaching-intelligence/page.tsx | none | browser: player deep-link → coach-only notice/redirect (mirror notifications gate); coach still sees page. +tc/lint/vitest | S |
| B20 Coaching settings: persisted controls → engine wiring (LARGE) | B | review-gated | MEDIUM | 4 | F060,F061,F062,F115 | insights.ts, orchestrator.ts, AlertTypeToggles.tsx, WeightDistributor.tsx | none | per-control browser red→green: alert toggle suppresses type; verbosity flows to NLG; weights/bubble-zone measurable OR hide-until-wired. RECOMMEND per-control sub-PRs; human scope sign-off. +tc/lint/vitest | L |
| B21 Insights stats-scope + error state + trend chip honesty | B | autonomous | MEDIUM | 3 | F054,F055,F111 | insight-management.ts, InsightsPageContent.tsx | none | browser: StatCards match list count; read failure → error banner (not empty state); Active card drops false up-arrow. +tc/lint/vitest | M |
| B22 Insights create-focus-area dual-path unify | B | autonomous | MEDIUM | 1 | F056 | InsightsPageContent.tsx, InsightCard.tsx | none | pick ONE promotion path; promote active+resolved → single flow/action. +tc/lint/vitest | S |
| B23 Player CoachHelm hero: percentile not ordinal | B | autonomous | LOW | 1 | F132 | FairwayPlayerCoachHelm.tsx (HOT w/ B10) | none | browser: "82nd pct"/"top 18%" + "team percentile" label. SERIALIZE after B10 (same HOT file). +render test+tc/lint | S |
| B24 Analytics prediction-accuracy source-of-truth + SSR error state | B | autonomous | MEDIUM | 2 | F050,F051 | coachhelm-analytics.ts (HOT w/ B25), analytics/coachhelm/page.tsx, FairwayEffectiveness.tsx | none | browser: hero + overview accuracy from same rollup source + match; SSR {success:false} → InlineNotice (was falsely empty). +tc/lint/vitest | M |
| B25 Analytics raw-read pagination (1000-row cap) | B | autonomous | LOW | 1 | F107 | coachhelm-analytics.ts (HOT w/ B24) | none | fetchAllRowsResult/.range(); vitest mocks >1000 rows aggregated. SERIALIZE after B24 (same file). +tc/lint | M |
| B26 Round Review team-average wiring | B | autonomous | MEDIUM | 1 | F085 | round-review-system.ts | none | browser: "vs team" column shows real averages (resolve active team inside getStatAverages, post-auth). +vitest+tc/lint | M |
| B27 Rounds-list active-status filter + pagination | B | autonomous | MEDIUM | 2 | F087,F088 | rounds/page.tsx, FairwayRoundsLibrary.tsx | none | browser: inactive-roster rounds excluded; >50 rounds reachable via range/load-more (fetchAllRowsResult). +tc/lint/vitest | M |
| B28 Player-detail vs game/print access-model consistency | B | review-gated | MEDIUM | 1 | F081 | game/page.tsx, game/print/page.tsx, players/[playerId]/page.tsx | none | access-control scoping → gated. Gate /game+/print to active team (cookie). Multi-team fixture or documented manual repro. +tc/lint | M |
| B29 Team Stats roundIds .in() chunking (414 risk) | B | autonomous | MEDIUM | 1 | F095 | stats/team/page.tsx (HOT w/ B30) | none | chunk 300 ids/batch + merge; vitest >300 ids → ceil(N/300) calls. SERIALIZE w/ B30 (same file). +tc/lint | M |
| B30 Team Stats putts denominator + standing fan-out batch | B | autonomous | LOW | 2 | F155,F156 | stats/team/page.tsx (HOT w/ B29), v3/standing/loader.ts | none | putts over holesWithPutts; batched golf_player_standing .in(); vitest both. SERIALIZE w/ B29. +tc/lint | M |
| B31 Coach surfaces: denial + error destinations | B | autonomous | MEDIUM | 2 | F052,F114 | coachhelm/genome/[playerId]/page.tsx, coachhelm/qualifying/[id]/error.tsx | none | browser: genome non-coach → clean redirect /golf/dashboard (was bare 404); qualifying error home → /golf/dashboard/qualifiers (was player dead-end). +tc/lint | S |
| B32 Travel dormant schema features (splits + event link) | B | autonomous | MEDIUM | 2 | F067,F068 | FairwayItineraryModal.tsx, ExpenseForm.tsx | none | minimal: remove 'split' option until CRUD built; add optional event picker (event_id). PRODUCT GATE: build splits (L) vs remove option (S). +vitest+tc/lint | M |
| B33 Course Library discoverability + error + tee-count cap + raw label | B | autonomous | MEDIUM | 4 | F063,F117,F118,F119 | FairwayDashboardShell.tsx, CommandPalette.tsx, courses/error.tsx, course-library.ts, whats-new.ts | none | browser: Courses nav entry (coach+player) + palette; courses/error.tsx; getCourseTeeCounts paginated; pattern_type → human label. +vitest+tc/lint | M |
| B34 Calendar event status + all-day drag | B | autonomous | MEDIUM | 2 | F042,F041 | golf.ts (HOT), PremiumCalendarClient.tsx (HOT w/ B6) | none | browser: one-off event badge "Confirmed"; drag all-day stays all-day. golf.ts + PremiumCalendarClient both HOT. +vitest+tc/lint | S |
| B35 Messaging read/badge/notif hygiene | B | autonomous | MEDIUM | 3 | F072,F124,F125 | use-golf-messages.ts, messages.ts | none | markRead awaited/caught; badge clears on open (app-side; RPC is_deleted=F071); notif fan-out batched. +vitest+tc/lint | M |
| B36 Demo-enter analytics on Fairway shell | B | review-gated | HIGH | 1 | F012 | FairwayDashboardShell.tsx (HOT w/ B33) | none | browser: demo gate → demo_coach_entered PostHog fires once. Mount DemoEnterTracker in FairwayDashboardContent. +tc/lint | S |
| B37 Recruiting HQ: body-size limit + popup-blocker + dead revalidate | B | review-gated | HIGH | 3 | F030,F082,F141 | recruit-documents.ts, FairwayRecruitDocuments.tsx, next.config.mjs | none | browser: upload 2–25MB doc succeeds (raise serverActions.bodySizeLimit OR route via signed upload); download opens in user-gesture (resolve URL before window.open or open-then-set-href); drop dead revalidatePath. +tc/lint | M |
| B38 Qualifier coach status lifecycle (no caller / no transition) | B | review-gated | HIGH | 2 | F029,F138 | golf.ts (HOT), use-qualifier-realtime.ts, QualifierLeaderboardRealtime.tsx | none | browser: wire updateQualifierStatus to a coach control or auto-transition on round submit (upcoming→in_progress→completed); realtime reads num_rounds/holes_per_round from real source (cols don't exist → prop fallback honest). +vitest+tc/lint | M |

### Wave C — independent LOW long tail (autonomous)

| Cluster | Wave | Autonomy | SevMax | #f | ledgerIds | files | DB-dep | verification | effort |
|---|---|---|---|---|---|---|---|---|---|
| C1 Development progress_notes shape + cross-tab revalidate | C | autonomous | LOW | 2 | F121,F066 | development.ts (HOT) | A8 | F066 0-row update → success:false (verifyPlayerAccess); F121 add /insights+/analytics/coachhelm revalidate; progress_notes stays {entries}. SERIALIZE w/ A3 companion (same HOT file). +vitest+tc/lint | S |
| C2 Insights single-row + generate revalidate parity | C | autonomous | LOW | 1 | F112 | insights.ts (HOT) | none | add /insights revalidatePath to generate+3 single-row actions. +tc/lint | S |
| C3 Insights searchParams type contract (category) | C | autonomous | LOW | 1 | F110 | insights/page.tsx | none | add category?:string; FairwayBrief deep-link filters. +tc/lint | S |
| C4 Coaching settings dead duplicate write path | C | autonomous | LOW | 1 | F116 | coaching-philosophy.ts, useCoachPhilosophy.ts | none | pick ONE source of truth (route hook via server action OR delete unused). onConflict needs authenticated UPDATE grant. +tc/lint | S |
| C5 My Development paused bucket + legacy error state | C | autonomous | MEDIUM | 2 | F126,F075 | my-development/page.tsx | none | F126 (live) include 'paused' in buckets; F075 legacy error branch (vitest only). +tc/lint | S |
| C6 My Development trend + review source-link round id | C | autonomous | MEDIUM | 2 | F073,F074 | my-development/page.tsx, FairwayMyDevelopment.tsx, FocusAreaCard.tsx | none | seed focus area w/ progress_notes+from_review_id: sparkline draws; review link resolves via golf_round_reviews.round_id. +unit+tc/lint | M |
| C7 Genome teaser label + legacy degenerate-radar gate | C | autonomous | LOW | 2 | F108,F109 | player-dashboard-parts.tsx, my-game-profile/page.tsx | none | F108 (live) relabel teaser "Strokes-gained shape"; F109 (legacy) gate radar on >=3 non-null / rounds_basis>=8 (vitest). +tc/lint | S |
| C8 Self surfaces: My Standing skeleton scope + Game Profile cross-link | C | autonomous | LOW | 2 | F136,F137 | my-standing/loading.tsx, CoachHelmSubNav.tsx | none | F136 fairwayScope matte skeleton; F137 Game Profile tab/cross-link in shell. +tc/lint | S |
| C9 Percent + to-par normalization correctness | C | autonomous | LOW | 2 | F134,F151 | player-fingerprint.ts, stats-data.ts | none | toPct(0.01)≈1 (drop magnitude guess for 0–100 cols); toPar normalized to 18-hole basis. +vitest+tc/lint | M |
| C10 Round-flow dead resume UI + unconditional unload guard | C | autonomous | LOW | 2 | F144,F145 | rounds/new/new-round-client.tsx, rounds/continue/[id]/continue-round-client.tsx | none | F144 delete dead resume prompt (resume lives on /rounds) OR re-enable; F145 gate beforeunload on unsaved changes. +tc/lint | M |
| C11 Emergency-save cross-draft loss | C | autonomous | MEDIUM | 1 | F084 | emergency-save.ts | none | clearEmergencySave(id) leaves `_new` intact; only id=null clears `_new`. +vitest+tc/lint | S |
| C12 Announcements robustness nits (flags + n+1 + explicit scope) | C | autonomous | LOW | 3 | F096,F097,F098 | announcements.ts | none | flags match delivery; batch task inserts; explicit .eq player_id (RLS test). No destructive writes. +vitest+tc/lint | S |
| C13 Travel legacy date-only off-by-one (twin) | C | autonomous | LOW | 1 | F122 | travel/travel-client.tsx | none | reuse parseDateLocal in legacy header; vitest today=upcoming under US tz. (Live Fairway already correct.) +tc/lint | S |
| C14 Calendar dormant sub-features + range pagination cap | C | autonomous | MEDIUM | 3 | F040,F101,F102 | MobileEventSheet.tsx, calendar/page.tsx, use-calendar-range-events.ts, golfhelm-features.md | none | F040 downgrade spec claim (no poll feature); F101 surface recurrence on mobile or doc limit; F102 doc/paginate 500-cap. +tc/lint | S |
| C15 Onboarding plus-handicap sign | C | autonomous | LOW | 1 | F130 | onboarding/player/page.tsx | none | '+2.4'→-2.4 parse; browser persists -2.4. +vitest+tc/lint | S |
| C16 Join-by-code cross-role + login preservation + label | C | autonomous | MEDIUM | 3 | F069,F070,F123 | join/[code]/page.tsx, join/[code]/golf-join-team-client.tsx, golf-sign-in-form.tsx | none | coach branch (no stray golf_players row); login preserves ?joinCode; "Class of 2027" label not raw year. +tc/lint/vitest | M |
| C17 Join-request banner realtime refresh | C | autonomous | LOW | 1 | F105 | JoinRequestAlert.tsx | none | new request appears within poll/realtime/focus window. +tc/lint | S |
| C18 Roster navigation: player-redirect bounce + divergent destinations | C | autonomous | LOW | 2 | F142,F143 | roster/[id]/page.tsx, FairwayPlayerCard.tsx, FairwayPlayerActionsMenu.tsx | none | F142 player → clean /golf/dashboard redirect; F143 rename kebab "AI Insights". +tc/lint | S |
| C19 My Qualifiers correctness (date / errors / badge / holes) | C | autonomous | LOW | 4 | F076,F127,F128,F129 | my-qualifiers/FairwayMyQualifiers.tsx, my-qualifiers/page.tsx, my-qualifiers-client.tsx | none | F076 string-split date (live); F127 check rounds error; F128 Complete-badge math (N>=N+1 never true); F129 holesPerRound not hardcoded 18 (legacy). +vitest+tc/lint | M |
| C20 Qualifier coach legacy display nits (dash table / button variant) | C | autonomous | LOW | 2 | F139,F140 | qualifiers/[id]/QualifierRoundBreakdown.tsx, qualifiers/new/new-qualifier-client.tsx | none | legacy flag-off only → skip-dormant (Fairway path already correct); vitest render guard if touched. +tc/lint | S |
| C21 Player Hub requires_upload hardcode | C | autonomous | LOW | 1 | F135 | hub/page.tsx | none | read from real column (task/template data-model) instead of hardcoded false; folds with task model. +tc/lint | S |
| C22 Retire orphaned + legacy-only dead code | C | autonomous | LOW | 3 | F146,F133,F148 | round-review/StrokesGainedSection.tsx, round-review/index.ts | none | F146 delete StrokesGainedSection + barrel export (knip green); F133/F148 skip-dormant (legacy flag-off). +tc/lint | S |
| C23 Tasks dead-code retire + reminder cron | C | mixed | MEDIUM | 5 | F034,F152,F092,F093,F094 | tasks.ts (HOT), task-reminders.ts, api/cron/task-reminders/route.ts, vercel.json, TaskCard.tsx, TasksList.tsx, tasks/page.tsx | none | F152 delete 3 zero-caller actions; F034 retire legacy TaskCard fork (review-gated deletion); F092/93/94 new cron (golf_tasks.reminder_at, recipients via golf_players.user_id) + delete broken task-reminders.ts queue. tasks.ts HOT → serialize w/ B2. +vitest+tc/lint | M |
| C24 CoachHelm legacy skip-dormant (chat history / frozen analytics cards) | C | skip-dormant | MEDIUM | 2 | F053,F049 | (none — won't-fix) | none | F053 ChatHistoryClient flag-off only; F049 frozen summary cards only in legacy CoachHelmAnalyticsDashboard (live FairwayEffectiveness re-fetches). Document deferred-legacy in ledger. | S |
| C25 Alerts acknowledge-all legacy parity retire | C | autonomous | LOW | 1 | F106 | alerts.ts | none | delete orphaned alerts.ts readers (acknowledgeAllAlerts/acknowledgeAlert/dismissAlert/getCoachAlerts/dismissAllAlerts); keep generateAlerts+CoachAlert type. Live path (acknowledgeInsight) unaffected. +tc/lint | S |

---

## 4. File-Ownership / Parallelization Batches

A "batch" = clusters that touch **disjoint** file sets and may run in parallel.
Clusters sharing any file (especially a HOT file) are placed in the **same batch
position serialized**, i.e. one owner runs them sequentially.

### HOT-file serialization chains (one owner each, sequential)

- **`src/app/golf/actions/golf.ts`** → B4 (status param) → B5 (team resolver) →
  B34 (createGolfEvent status) → B38 (qualifier status). ONE owner, sequential.
  (Land as one golf.ts pass or strictly ordered PRs.)
- **`pattern-management.ts`** → A7 DDL merges first, then **B1** (the only code
  editor). Serialize: DDL → code.
- **`dashboard-data.ts`** + **`use-task-realtime.ts`** → **B2** owns both
  (+ folds F027). C21 (hub/page.tsx requires_upload) is the same task data-model
  → same owner as B2, after B2.
- **`tasks.ts`** → **C23** owns; serialize after B2 (B2 reads assignments, C23
  retires dead writers + cron). No other cluster touches tasks.ts.
- **`development.ts`** → A3 code companion (0-row hard error) → **C1** (F066/F121).
  ONE owner sequential. (B13 touches development/page.tsx + components, NOT
  development.ts → parallel-safe with C1.)
- **`FairwayCoachHelmSignals.tsx`** → **B9** (urgent normalize) → B1-sibling
  (silent-rollback setError, folded into B1 verification path) → bulk-selection
  (folded). ONE owner sequential. (Also touched lightly by B3 notification
  surface — coordinate; core B3 fix is in FairwaySettingsGeneral.tsx.)
- **`FairwayPlayerCoachHelm.tsx`** → **B10** (what-if) → **B23** (percentile). Seq.
- **`coachhelm-analytics.ts`** → **B24** (source-of-truth) → **B25** (pagination). Seq.
- **`FairwaySettingsGeneral.tsx`** → **B3** (notifications) → **B16** (resilience/
  units). Seq.
- **`PremiumCalendarClient.tsx`** → **B6** (restore modal) → **B34** (all-day drag). Seq.
- **`stats/team/page.tsx`** → **B29** (chunking) → **B30** (putts/fan-out). Seq.
- **`FairwayDashboardShell.tsx`** → **B33** (Courses nav) → **B36** (DemoEnterTracker). Seq.
- **onboarding (`onboarding.ts` + `player/page.tsx`)** → **B15** → **C15**
  (handicap) → **C16** touches join + sign-in-form (player/page.tsx only at the
  joinCode redirect, coordinate). Seq for player/page.tsx + onboarding.ts.

### Parallel-safe batches (no shared files between members)

- **Batch B-α (Wave-A-dependent, after their DDL):** B1 (after A7), B4 (after A4),
  B14 (after A5). [B1=pattern files, B4=roster files+golf.ts, B14=classes files —
  B4 holds the golf.ts lock, so B4 runs in the golf.ts chain.]
- **Batch B-β (independent CRITICAL/HIGH):** B2, B3, B7, B8, B11, B12, B13, B37.
  (Disjoint files; B2 holds dashboard-data/use-task-realtime; B3 holds
  FairwaySettingsGeneral.)
- **Batch B-γ (independent MEDIUM/LOW, parallel):** B17, B19, B21, B22, B26, B27,
  B31, B32. (All disjoint.)
- **Batch B-δ (HOT-chain owners, run their chains):** golf.ts chain (B4→B5→B34→B38);
  FairwayPlayerCoachHelm (B10→B23); coachhelm-analytics (B24→B25); FairwaySettings
  (B3→B16); PremiumCalendar (B6→B34 — B34 is in both golf.ts and calendar chains →
  single owner does B34 once, after both predecessors); stats/team (B29→B30);
  DashboardShell (B33→B36); FairwayCoachHelmSignals (B9 + folded).
- **Batch C-parallel (Wave C, all disjoint or own-chain):** C2,C3,C4,C5,C6,C7,C8,
  C9,C10,C11,C12,C13,C14,C16,C17,C18,C19,C20,C22,C25 in parallel; C1 in the
  development.ts chain; C21+C23 in the task chain; C24 is no-op (skip-dormant).

> NOTE on B34: it is the one cluster sitting on **two** chains (golf.ts + Premium
> CalendarClient). Assign B34 to a single owner who runs it after B6 (calendar
> predecessor) and after B4→B5 (golf.ts predecessors) — i.e. last in the golf.ts
> chain, which is also after the calendar chain finishes.

---

## 5. Wave-by-Wave Execution Order

### Wave A — DB / security (review-gated, preview branch)

1. Create a Supabase **preview branch** (`mcp__supabase__create_branch`).
2. Apply A1→A8 **in order** (each its own migration; one reviewed PR):
   A1 (IDOR) → A2 (docs RLS) → A3 (focus-area player UPDATE) →
   A6 (anon relock) → A7 (patterns cols) →
   A8 (progress_notes default). (A4 dropped → app-only; A5 dropped — F015 refuted.) A9 (rounds team_id backfill) only if owner elects
   the backfill route.
3. After **all** DDL applies: regenerate `database.ts` types **once**
   (`mcp__supabase__generate_typescript_types`) — needed by A7. This is a
   single coordinated step (database.ts is shared by many slices).
4. Gate: run `*.rls.test.ts` (new + existing), `mcp__supabase__get_advisors`
   (security + performance), and the live re-queries named in each cluster
   (`information_schema` / `pg_policies` / `pg_enum` / `role_table_grants` /
   `role_routine_grants`). Confirm migrations actually ran (recorded-but-unran guard).
5. Human sign-off → merge to prod DB.

### Wave B — code (after Wave A merged + verified)

1. **Wave-A-dependent first:** B1 (needs A7), B4 (needs A4), B14 (needs A5),
   C1 (needs A8 default; runs in development.ts chain).
2. **Independent CRITICAL/HIGH** (Batch B-β) in parallel with the HOT-chain owners
   (Batch B-δ).
3. **Independent MEDIUM/LOW** (Batch B-γ) once owners free up.
4. Review-gate every CRITICAL/HIGH cluster and every security-sensitive scoping
   change (B28 access model, B12 chat write, B18 auth, B36 demo tracker, B37
   recruiting upload, B38 qualifier write). Autonomous-merge LOW/MEDIUM after
   green typecheck/lint/vitest + live-repro.

### Wave C — independent LOW long tail (autonomous)

Batch C-parallel; chain-bound clusters (C1, C21, C23) after their predecessors.
C24 is documentation-only (skip-dormant).

---

## 6. Verification Protocol

### Live-repro harness

- **Accounts:** coach `demo@golfhelmdemo.com` / `Demo2026`; player
  `rinin376@gmail.com` (Cole Bennett, men's team, 2 head coaches) on
  "Demo University Golf". The `/golf/demo` gate is server-disabled on prod — use
  the documented shared logins.
- **Tooling:** Playwright/Chrome-devtools MCP for browser red→green; Supabase MCP
  `execute_sql` for live re-queries and row-state confirmation.
- **Seeded fixtures required (demo data gaps):**
  - Women's-team player → B11/F006 (pga_omitted).
  - Active focus area with `progress_notes.entries[]` + `from_review_id` →
    A3/F005, C6/F073, C6/F074, B13.
  - Multi-team head coach (active-team cookie) → B5/F031/F036, B28/F081.
  - Inactive/ex-roster player with rounds → B27/F087.
  - >50 completed team rounds → B27/F088; >1000-round roster → B29/F095 (vitest
    guard if infeasible live).
- Where a live fixture is infeasible, the cluster carries a **vitest guard** plus
  a no-regression render check on demo data, and the manual repro is documented.

### Per-finding gates

- **Behavioral findings** (silent no-op, dead control, wrong data): browser
  red→green step (exact route + action) **AND** typecheck + lint + vitest.
- **DB findings** (Wave A): RLS test (`*.rls.test.ts`) + live policy/grant
  re-query + `get_advisors` clean + recorded-and-ran confirmation.
- **Legacy retire (`retire-dead-code`):** grep proves zero live importers; knip
  (CircleCI weekly) no longer flags; build green.
- **Legacy skip (`skip-dormant`):** documented won't-fix; no prod live-repro
  (unreachable with flag on).

---

## 7. Gotcha Guardrails (must hold for every cluster)

1. **Never GRANT ALL / EXECUTE to anon or PUBLIC.** A1 REVOKES anon EXECUTE
   (does not re-grant); A6 REVOKES anon GRANT ALL on reviews+patterns_v2;
   A2/A3/A4/A7 use DROP/CREATE POLICY / CREATE OR REPLACE / ALTER without
   recreating any table in `public` (no accidental anon re-grant). Recreating a
   matview/table auto-grants anon → if ever done, REVOKE after and verify via
   `pg_class.relacl`.
2. **No destructive delete-then-insert** in any save/submit/sync path. B14
   calendar resync stays a diff; C6/A3 progress_notes stays read-modify-write
   append; C12 announcements stays batched-insert; B8 download is a signed-URL
   read. `.upsert(onConflict)` needs an authenticated UPDATE grant even for
   inserts (C4 note).
3. **PostgREST 1000-row cap** — paginate large reads via `fetchAllRowsResult` /
   `.order('id').range()`: B25, B27, B29, B33 (getCourseTeeCounts), C14 (500-cap).
4. **Do NOT `rm -rf .next`** (Turbopack cold-compile wedge breaks
   /golf/dashboard/* routes).
5. **Migrations ordered + recorded** — all Wave-A dated after `20260617190000`;
   verify each column/policy/enum value in `information_schema`/`pg_policies`/
   `pg_enum` (a migration can be recorded-but-unran). (A4 enum migration was
   DROPPED — Injured/Redshirt removed from the UI instead, app-only in B4.)
6. **HOT-file collisions** — golf.ts, tasks.ts, dashboard-data.ts, development.ts,
   pattern-management.ts, FairwayCoachHelmSignals.tsx, use-task-realtime.ts, the
   prod baseline migration. Every cluster touching one is flagged in §4 and
   serialized to a single owner; never edited in parallel.
7. **`database.ts` regen** is a single coordinated step after all Wave-A DDL
   (A7 columns), not per-cluster — it is shared by many slices.

---

## Appendix: Out-of-ledger DB hardening (recommended follow-ups, no F-id)

Surfaced by the db-security slice; **not** assigned (no ledger F-id) — recommend
filing as separate tickets:

1. `golf_teams_select_by_join_code` USING (join_code IS NOT NULL) lets any
   authenticated user enumerate every team's join_code/name/org_id — tighten to
   membership or an explicit lookup RPC.
2. `golf_player_classes_update_player` has USING but no WITH CHECK → a player
   could re-point `player_id` on UPDATE; add WITH CHECK mirroring USING.
3. Broader ~90-table anon GRANT ALL sweep beyond round_reviews/patterns_v2 (A6
   only covers the two ledger-flagged tables; RLS is the backstop today).
4. `verify_coach_owns_player` SECURITY DEFINER `GRANT ALL TO anon` boolean oracle
   (baseline line ~20952) — same anon-grant class; include in a SECURITY DEFINER
   grant audit.

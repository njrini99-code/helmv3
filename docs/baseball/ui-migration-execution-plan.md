<!-- BaseballHelm "Living Annual" — UI migration EXECUTION plan.
     Companion to design-system-living-annual.md (north star) + ui-migration-map.md (coverage matrix).
     This doc is the build-ready, parallel-safe execution plan: per-surface specs + batch schedule + conflict map.
     Audience: Sonnet 5 implementation agents. Each surface section is written so an agent needs ZERO re-discovery.
     Branch: batch/baseball-fixes. Author: lead planner. 2026-07-01. -->

# BaseballHelm — "Living Annual" UI Migration Execution Plan

> **STATUS (2026-07-15, code-verified): EXECUTED.** All 29 surfaces across
> §4's batch schedule (Batch 0 through Batch H) have landed on
> `batch/bbh-finish-0714`. Batch H — the owner-cleanup batch this plan
> gated on "F+G" completing — shipped tonight as PR #820
> (`PlayerPassportCard.tsx` + dead `layout/header.tsx`/`mobile-menu-button.tsx`
> deleted, zero real importers verified first). This document is now a
> **historical execution record**, not an open plan: §3's per-surface specs
> and §4's batch schedule describe work that already happened. Do not treat
> any surface below as still queued — `docs/baseball/ui-migration-map.md`
> carries the current one-line status header; this file is the detailed
> build log underneath it. `nav-registry.ts`'s 3-lane restructure remains
> explicitly deferred/owner-gated (§6 — unchanged, still frozen).

**Goal:** migrate EVERY remaining baseball surface onto the Living-Annual kit
(`src/components/baseball/living-annual/`) so the product reads as one publication.
A surface is **done** only when it (1) composes from the kit — no bespoke card/header/empty/stat
display remains, (2) collapses its `isRedesignEnabled` fork and **deletes** the legacy component it
replaces, (3) checks its box on `ui-migration-map.md` + updates `memory/context/baseballhelm-features.md`,
(4) is tsc + eslint clean.

**Already done — do NOT touch:** `command-center` (reference: `src/components/baseball/command-center/CommandCenterFairway.tsx`).
**In progress concurrently — do NOT touch its files:** `stats-center`
(`src/app/baseball/(dashboard)/dashboard/stats-center/{page,loading,error}.tsx` +
`src/components/baseball/stats-center/{StatsCenterClient,StatsUploadClient,UploadHistory}.tsx`).

---

## 0. How to read this plan

- **Lanes = ink.** Pressbox (coach team-ops) + Passport (player dev) = **green** (`ink="team"`).
  War Room (coach recruiting) = **clay** (`ink="pursuit"`). The active lane's ink is the wayfinding;
  never mix inks within a lane's chrome. `--clay` dark canvas is quarantined to `<ClayCanvas>` viz only.
- **Presentation only.** Never touch a read model, server action, hook, RLS, or query. You re-skin the
  SAME props the surface already assembles. If you find yourself editing anything under
  `src/lib/baseball/read-models/`, `**/actions/**`, or a `supabase/` file — STOP; that is out of scope.
- **One surface per change.** Each surface folds into `batch/baseball-fixes` on its own; keep the diff
  scoped to the files listed in that surface's **Files owned** block.

## 1. The fork-collapse recipe (apply on EVERY surface)

The migration end-state matches `command-center/page.tsx`: **no fork, always render the kit version,
legacy deleted.** Two starting shapes:

**Shape A — a `*Fairway.tsx` variant already exists and the surface forks on the flag**
(roster, calendar, announcements, tasks, documents, messages — these Fairway variants are shallow
Fairway-primitive reskins that do NOT yet import the kit):
1. Rebuild the `*Fairway.tsx` variant to compose the Living-Annual kit (SectionMasthead / PaperCard /
   EmptyIssue / RuledStatLine / PlayerRowPlate / etc.) — replacing its bespoke Fairway cards/headers/empties.
2. In the page or client, **delete the `if (isRedesignEnabled()) { … }` branch** and the legacy
   render path below it; always return the kit variant wrapped in `fairwayScope('min-h-full')` (or the
   surface's existing shell class).
3. **Delete the legacy component** the old branch rendered, plus its now-orphaned imports. Run `tsc` +
   `knip` mentally: no dangling import, no unused legacy file.

**Shape B — pure legacy, no fork yet** (everything else):
1. Create a `*Fairway.tsx` (or rewrite the client in place) composing the kit.
2. Point `page.tsx` at it, wrapped in `fairwayScope('min-h-full')`, with **no** `isRedesignEnabled`
   fork (the shell flag already gates the whole subtree; per the command-center precedent pages render
   the kit unconditionally).
3. Delete the replaced legacy client/cards + orphaned imports.

**Scope wrapper:** the shell (`BaseballFairwayShell`) already provides `.living-annual` (cream) around
the whole subtree; pages still add `.fairway-ds` themselves via `fairwayScope(...)` exactly as
`command-center/page.tsx` does. Do not remove `.living-annual` handling; do not add a second one.

**Non-negotiables (a reviewer will reject a violation):**
- No yellow/amber warning boxes anywhere → every zero/empty/soft-error is `<EmptyIssue variant=…>` or a
  ghosted `<RuledStatLine ghost>`. Grep your diff for `bg-yellow` / `bg-amber` / `warning` and kill them.
- Every changeable number is a `<StatReadout>` (tabular odometer). Never spring a number.
- `--clay` / `<ClayCanvas>` only inside a viz frame — never a page/card/sidebar background.
- Numerals carry contrast (near-black graphite ≥7:1); labels stay quiet. Leaders/bests get green.
- `prefers-reduced-motion` is first-class (the kit atoms already honor it — don't re-animate around them).

## 2. Kit cheat-sheet (confirmed prop signatures — copy these, don't re-derive)

**Page header (every surface):** `<SectionMasthead eyebrow="THE PRESSBOX · …" title="Roster"
ink="team|pursuit" actions={…}>{tabs?}</SectionMasthead>` — green/clay 3px accent rule baked in.

**Surfaces:** `<PaperCard registrationTick? className="p-…">` (flat cream, hairline, letterpress inset — the
ONLY card). `<ClayCanvas label aspect>` (dark viz frame only). `<HairlineRule ink="team|pursuit|hairline" weight?/>`.

**Empty/error:** `<EmptyIssue variant="stats|pipeline|roster|signals|today|messages|documents|calendar|tasks|generic" ink? action?/>`
or `<EditorsLetter title body signoff? live? ink/>`. Presets already carry the copy + STANDING-BY dot.

**Stat display:**
- `<RuledStatLine label value unit? size="row|hero" verified? ghost? leader? emphasis? ink? decimals?/>` — THE atom.
- `<StatReadout value decimals? prefix? suffix? emphasis? flashOnChange? pr? ariaLabel?/>` — any changeable number.
- `<StatLineStack items={RuledStatLineProps[]} gap="tight|normal"/>` — passport measurable column.
- `<SlashLine avg obp slg size? leader="avg|obp|slg" ink?/>` — `.341 / .420 / .611` (auto leading-zero drop).
- `<KPIContentsStrip items={{label,value,unit?,leader?,emphasis?,decimals?}[]} columns?/>` — masthead KPIs on green rules.
- `<PlayerRowPlate firstName lastName jerseyNumber? position? stats={{label?,value,decimals?,leader?}[]} href?|onClick? ink?/>`
  + `<PlayerRowPlateHeader columns={string[]}/>` — the record-book roster/stats row + aligned header.

**Recruiting (clay):**
- `<RecruitCard firstName lastName position? classYear? state? topStat={{label,value,unit?}} grades={{tool,value,present?}[]} daysSinceContact? stage? onClick?/>` — mini box-score pipeline chip (GradeStamps + AgingBar + stage InkBadge).
- `<GradeStamp value tool present? size?/>` · `<GradeStampGrid grades columns?/>` — 20-80 evaluation.
- `<ToolRail value future? label compare? ink?/>` · `<ToolRailStack tools={{tool,value,present?,future?}[]} compare?/>` — 20-80 scale + Decision-Room compare overlay.
- `<AgingBar days max?/>` — clay days-since-contact (darkens toward deadline; clay lane only).
- `<CommitSeal label variant="commit" size?/>` / `<PacketSeal label size?/>` — oxblood ceremony seals.
- `<TearSheet player={{firstName,lastName,eyebrow?}} measurables={RuledStatLineProps[]} footer? >{viz}</TearSheet>` — scout packet.

**Player identity:** `<Masthead given surname dateline? registrationTick? accentRule? scrollShrink? ink?/>` (two-line name block).
`<Eyebrow items={string[]}|children ink="muted|team|pursuit"/>`. `<PositionChip label ink? size?/>`. `<InkBadge label tone="neutral|team|pursuit|sodium" variant?/>`. `<LiveDot ink="team|sodium" label?/>`.

**Viz (data→prop mapping):**
- `<ClimbArc points={{label?,value}[]} goal? unit? title? />` — season/skill-over-time on PAPER; <2 points → honest empty. (dev-plan, timeline, practice-effectiveness, lift progress.)
- `<BreakPlot pitches={{type,hbreak,vbreak,velo?,count?}[]} compareTo? title?/>` — pitch break on ClayCanvas; hbreak/vbreak in inches (±22 clamp). (pitcher analytics/passport.)
- `<SprayChart battedBalls={{x,y,outcome?}[]} surface="clay|paper" title?/>` — batted balls; x,y normalised [0,1], home plate bottom-centre. (hitter analytics/passport.)

**Formatters:** `formatRate(v, decimals)` (drops leading zero <1 → `.341`), `formatRatio`, `formatInnings`.

---

## 3. Per-surface specifications

> Filled from the parallel surface-mapping pass. Each section states current shape (A/B), files owned,
> data to preserve, kit composition, ink + viz, legacy to delete, gotchas, effort, and EmptyIssue variant.

**Legend per surface:** *Class* = starting shape — **(A)** shallow `*Fairway.tsx` reskin already forks on the flag (upgrade it to the kit + collapse fork); **(B)** pure legacy, no fork (build a Fairway variant, wire page unconditionally). *Owns* = the exact files that change (edited / **created** / ~~deleted~~) — an agent touches nothing outside this list.

### 3.1 THE PRESSBOX — coach team-ops · GREEN (`ink="team"`)

#### roster · `/baseball/dashboard/roster` · **Class A** · **L**
- **Files:** page `src/app/baseball/(dashboard)/dashboard/roster/page.tsx`; client `roster/RosterClient.tsx` (**fork @464**, legacy body 542–1072); variant `roster/RosterFairway.tsx` (Fairway primitives, no kit).
- **Preserve:** `getRoster(ctx.activeTeamId)` read-model (`members, aggregates, rosterError, aggregatesError`), `saveLineup` action, `useAuth`/`useTeamStore`. All props already flow into `RosterFairway` — keep verbatim.
- **Compose:** `ViewHeader`→`SectionMasthead`+`Eyebrow`; 4× `MetricCard`→`KPIContentsStrip`; `PlayerCard` grid + Position/Status/Development boards→`PlayerRowPlate`(+`PlayerRowPlateHeader`)+`SlashLine`+`PositionChip`; amber `aggregatesWarning` `InlineNotice`→`EditorsLetter` ("Signals are catching up"); `EmptyState`→`EmptyIssue variant="roster"`.
- **Empty/gotchas:** coach-only wall (`role!=='coach'`) + `aggregatesError` degraded state stay honest (EditorsLetter, never a zero card); mobile stat columns (`w-20`) must not overflow; two-error read-model kept.
- **Owns:** edit `RosterClient.tsx` (delete fork+legacy body), rewrite `RosterFairway.tsx` to kit; ~~roster/PlayerRow.tsx~~, ~~roster/RosterToolbar.tsx~~ if orphaned.

#### calendar · `/baseball/dashboard/calendar` · **Class A** · **M**
- **Files:** page `.../calendar/page.tsx` (**forks @205 + @258**); variant `src/components/baseball/calendar/CalendarFairway.tsx`; grid `BaseballCalendarWrapper`→`PremiumCalendarClient` (reused verbatim, NOT migrated).
- **Preserve:** the `fromUntyped(supabase,'baseball_events')` **exact column list (LOAD-BEARING — `requires_rsvp` does NOT exist and breaks the query)**; props `events, teamMembers, teamId, isCoach, currentUserId, upcomingEvents, eventTypeCounts`; `all_day` local-midnight normalization.
- **Compose:** recruiting-empty `EmptyState`→`EmptyIssue variant="calendar"` (CTA to `/discover`); `StatusPill` summary→`InkBadge`/`LiveDot`; page chrome→`SectionMasthead`. Keep the full-height `SHELL` + `overflow-hidden` so `PremiumCalendarClient` `h-full` resolves.
- **Empty/gotchas:** two empties (college-coach recruiting vs no-events); role `both` (`isCoach` from session); `isCollegeCoach && !teamId` branch.
- **Owns:** edit `calendar/page.tsx` (collapse both forks), rewrite `CalendarFairway.tsx`.

#### announcements · `/baseball/dashboard/announcements` · **Class A** · **M**
- **Files:** page `.../announcements/page.tsx` (`'use client'`, **fork @104**, legacy body 122–210); variant `announcements/AnnouncementsFairway.tsx`.
- **Preserve:** `getAnnouncementsWithMeta`, coach roster fetch; reuse `AnnouncementsCoachView`/`AnnouncementsPlayerView`/`CreateAnnouncementFlow` verbatim; `recentCount`.
- **Compose:** `ViewHeader`+Create→`SectionMasthead`+action; `StatusPill`→`InkBadge`/`LiveDot`; states→`EmptyIssue variant="announcements"` (NEW preset — Batch 0) + `EditorsLetter` for errors; delete legacy `Header` body.
- **Empty/gotchas:** role `both`; no dedicated preset today (add `announcements` in Batch 0).
- **Owns:** edit `announcements/page.tsx`, rewrite `AnnouncementsFairway.tsx`.

#### tasks · `/baseball/dashboard/tasks` · **Class A** · **M**
- **Files:** page `.../tasks/page.tsx` (`'use client'`, **fork @162**, legacy body 183–261); variant `tasks/TasksFairway.tsx`.
- **Preserve:** `getTeamTasks`/`getPlayerTasks`/`getTaskAssignments`, roster fetch; reuse `TasksList`/`CreateTaskModal`.
- **Compose:** `ViewHeader`→`SectionMasthead`; overdue `InlineNotice tone="warning"` + `ReminderBanner`→`InkBadge`/`LiveDot` (**keep as a live alert, NOT an empty state**); `Segmented` filter kept; `EmptyState`→`EmptyIssue variant="tasks"`; delete legacy `Header` body.
- **Owns:** edit `tasks/page.tsx`, rewrite `TasksFairway.tsx`.

#### documents · `/baseball/dashboard/documents` · **Class A** · **M**
- **Files:** page `.../documents/page.tsx` (walls); client `documents/documents-client.tsx` (**fork @138**, legacy body 193–311); variant `documents/DocumentsFairway.tsx`.
- **Preserve:** `getTeamDocuments(teamId, isCoach)` + `createBaseballDocument`/`deleteBaseballDocument`/`uploadBaseballDocument`/`uploadNewVersion`; **the hidden file-input / preview / version-modal slots stay in the client** (not the kit component); reuse `DocumentCard`.
- **Compose:** `ViewHeader`→`SectionMasthead`; `EmptyState`→`EmptyIssue variant="documents"`; page walls (no-team, error)→`EmptyIssue`/`EditorsLetter`.
- **Empty/gotchas:** two empties (`totalCount===0` vs filtered "no results"); role `both`.
- **Owns:** edit `documents-client.tsx` (collapse fork), rewrite `DocumentsFairway.tsx`, (opt) `documents/page.tsx` walls.

#### travel · `/baseball/dashboard/travel` · **Class B** · **L** · ⚠ PR #555
- **Files:** page `.../travel/page.tsx` (`'use client'`, role-detect + fetch); client `src/components/baseball/travel/TravelClient.tsx` (415, contains `ItineraryCard`); **no variant**.
- **Preserve:** `getTeamItineraries` + `deleteItinerary`/`getItineraryExpenses`/`getExpenseSummary` + `CreateItineraryModal`/`ExpenseForm`; inline role detection; `handleSaved`→`window.location.reload()`; local-noon date parse (TZ "Past" fix).
- **Compose:** `<h1>`→`SectionMasthead`; glass `IconMapPin` empty→`EmptyIssue variant="travel"` (NEW preset); `ItineraryCard` glass accordion→`PaperCard`+`HairlineRule`+`InkBadge` (transport); no-team/error walls→`EmptyIssue`/`EditorsLetter`. Do NOT reintroduce a global `<Header>` (shell owns the top bar).
- **Gotchas:** **known merge collision with PR #555 on `TravelClient.tsx` — GATE this surface on #555's status.** Only pure-legacy team-ops surface.
- **Owns:** **create** `travel/TravelFairway.tsx`, edit `travel/page.tsx`, edit `TravelClient.tsx`.

#### my-stats · `/baseball/dashboard/my-stats` · **Class B** · **M** (player)
- **Files:** page `.../my-stats/page.tsx`; client `my-stats/MyStatsClient.tsx` (262); subs `components/baseball/player-stats/{StatsOverviewCards,TrendChart,GameVsPracticeChart,SessionHistory}` + `season-stats/MySeasonStats.tsx` (**all exclusive to my-stats — no Stats-Center overlap**).
- **Preserve:** `getMyStats`/`getMyAggregates` + `getMySeasonStats`; `requireBaseballPlayerRoute()` + `force-dynamic`.
- **Compose:** `Header`→`SectionMasthead`+`Eyebrow`; avatar/name/jersey→`PlayerRowPlateHeader`+`PositionChip`+`InkBadge`(#); AVG/OBP/SLG/OPS grid→`SlashLine`+`StatReadout`(OPS); counting stats→`RuledStatLine`/`StatLineStack` (batting vs pitching); quick cards + `StatsOverviewCards`→`KPIContentsStrip`; error→`EditorsLetter`; empty→`EmptyIssue variant="stats"`. Swap hand-rolled leading-zero-drop for kit `formatRate`.
- **Viz:** `TrendChart` (recharts, avg over `session_date`)→**`ClimbArc`** (`{label:session_date, value:avg}`). `GameVsPracticeChart`→paired `StatReadout`/`SlashLine` (comparison, NOT ClimbArc). No SprayChart/BreakPlot (no coords).
- **Owns:** edit `my-stats/page.tsx`, `MyStatsClient.tsx`, `player-stats/*` (5), `season-stats/MySeasonStats.tsx`.

#### practice · `/baseball/dashboard/practice` · **Class B** · **L**
- **Files:** page `.../practice/page.tsx`; client `components/baseball/practice-planner/PracticePlannerClient.tsx` (**1377**) + 7 subs (`TimeRailBuilder`, `PracticeIntelligenceBoard`, `ScrimmagePanel`, `BlockObjectiveEditor`, `PracticeRecapPanel`, `PracticePrintExport`, `ScrimmageLineupBuilder`).
- **Preserve:** `getTeamPractices`/`savePractice`/`publishPractice`/`recordPracticeAttendance`/`getClassConflictsForPractice` + `getPracticeIntelligence`/`convertSignalToBlock` + `getPracticeObjectives` + roster/staff reads. **Keep the coach-editor vs player-read-only branch (both paths).**
- **Compose:** `Header`→`SectionMasthead`; block/time-rail cards→`PaperCard`; `EmptyState`→`EmptyIssue`; validation warning badges→`InkBadge`(warning)+`HairlineRule`; `PracticeCard`→`PlayerRowPlate`/`PaperCard`. No viz.
- **Gotchas:** **remove the stray artifact `practice-planner/PracticeIntelligenceBoard.tsx.tmp.67976.7dc61ff02da0`**; overlap/owner/conflict validation + attendance + scrimmage-lineup are the regression risk → **split into several ≤15-file PRs.**
- **Owns:** edit `practice/page.tsx` + `practice-planner/` (8 files), ~~the .tmp artifact~~.

#### practice-effectiveness · `/baseball/dashboard/practice-effectiveness` · **Class B** · **M**
- **Files:** page `.../practice-effectiveness/page.tsx` (62); client `components/baseball/practice-effectiveness/PracticeEffectivenessClient.tsx` (549).
- **Preserve:** `getPracticeEffectivenessData()` read-model (`authorized, reviews, focusRollup, summary`) + `runPracticeEffectiveness`/`setReviewDisposition`. **Honesty vocab `DIRECTION_META`/`TIER_LABEL`/`SCOPE_LABEL` survives verbatim — it is the product.**
- **Compose:** header→`SectionMasthead`+`Eyebrow`; honesty-note `Card`→`EditorsLetter`; `StatTile` strip→`KPIContentsStrip`/`StatReadout`; `ReviewCard`→`PaperCard`+`InkBadge`+`GradeStamp`(confidence tier); `FocusRollupItem`→`RuledStatLine`/`PlayerRowPlate`; `EmptyState`→`EmptyIssue variant="generic"`.
- **Empty/gotchas:** coach + `can_manage_practice`; two empties (no reviews vs filtered); "too early" tone→`GradeStamp`/`InkBadge`. Low viz (skip ClimbArc).
- **Owns:** edit `practice-effectiveness/page.tsx`, `PracticeEffectivenessClient.tsx`.

#### postgame · `/baseball/dashboard/postgame` · **Class B** · **M**
- **Files:** page `.../postgame/page.tsx` (87); client `components/baseball/postgame/PostgameReviewClient.tsx` (611).
- **Preserve:** `getPostgameReview` read-model + `generatePostgameReview`/`convertPostgameItemToTimeline`/`convertPostgameItemToPractice`/`setPostgameItemDisposition`; **keep `SourceTrustBadge`**.
- **Compose:** header→`SectionMasthead`+`Eyebrow`; game-picker pills→`InkBadge`/`ToolRailStack` + `LiveDot` has-review dot; review-header→`PaperCard`+`InkBadge`+`GradeStamp`(confidencePct); section headers→`SectionMasthead`/`HairlineRule`; `ItemCard`→`PaperCard`+`InkBadge`(priority)+`SourceTrustBadge`; amber import-warnings→`InkBadge`.
- **Empty/gotchas:** coach + **`coach_type` must be college|juco (else redirect)** + `can_manage_stats` (3 layers); **SIX empty branches** (error/forbidden-lock/setup/no-games/no-review/zero-items)→`EmptyIssue variant="generic"` (lock for forbidden) — keep `unauthorizedReason` forbidden-vs-setup copy split.
- **Owns:** edit `postgame/page.tsx`, `PostgameReviewClient.tsx`.

#### import · `/baseball/dashboard/import` · **Class B** · **L**
- **Files:** page `.../import/page.tsx` (200); shell `components/baseball/import-center/ImportCenterShell.tsx` (147) hosting `ImportWizardClient`+`EventImportWizard`; subs `import-center/{ManualMapPanel,SourceDetectionCard,ImportDiffViewer}`.
- **Preserve:** `getImportRuns`/`listImportSources` + adapter registries; **do NOT touch page.tsx `mergeRegisteredSources` / adapter wiring**; props `teamId, teamName, players, recentRuns, eventSources, registeredSources`.
- **Compose:** shell header→`SectionMasthead`; mode segmented→`InkBadge` tabs; `SourceDetectionCard bg-warning`→`InkBadge`/`PaperCard`; `ImportDiffViewer` before/after + `border-warning` boxes→`RuledStatLine` rows + `InkBadge`(warning); parse-notes→`PaperCard`. No viz.
- **Empty/gotchas:** coach + **`can_manage_imports` server redirect** (explicitly not nav-hiding); format variance XML/CSV/TSV/XLSX/PDF; source trust/required-review policy badges; multi-step wizard mobile → **split PRs.**
- **Owns:** edit `import/page.tsx` + `import-center/` (6 files).

#### analytics · `/baseball/dashboard/analytics` · **Class B** · **S–M** (player, recruiting)
- **Files:** page `.../analytics/page.tsx` (11) + `analytics/layout.tsx`; client `analytics/AnalyticsClient.tsx` (224). **Audience = PLAYER recruiting-view analytics** (coaches redirected to command-center) — NOT batting/pitching stats.
- **Preserve:** `useAnalytics()` hook (`stats{profileViews,watchlistAdds,videoViews,messagesSent}, viewsOverTime[], topSchools[]`).
- **Compose:** `Header`→`SectionMasthead`+`Eyebrow`; 4 stat cards→`KPIContentsStrip`/`StatReadout`; `viewsOverTime` recharts `LineChart`→**`ClimbArc`** (`{label:date, value:views}`); top-schools→`PlayerRowPlate`/`RuledStatLine`; empties→`EmptyIssue variant="discover"` (NEW) or `generic`.
- **Ink ruling:** stays **green** chrome (it's in the player green-lane nav), but recruiting-heat accents may use `InkBadge tone="sodium"` for "a school viewed you"; **do NOT use full clay chrome** (clay chrome = War Room only, two-ink law).
- **Owns:** edit `analytics/page.tsx`, `analytics/layout.tsx`, `AnalyticsClient.tsx`.

#### performance · `/baseball/dashboard/performance` · **Class B** · **L** (coach lift)
- **Files:** page `.../performance/page.tsx` (272); clients `components/baseball/performance/PerformanceCommandCenter.tsx` (569) + `PerformanceDashboardClient.tsx` (1082). Sub-routes (builder/groups/live/programs → own large clients; `players/[id]`=redirect-only, skip) — **defer sub-routes to a follow-up PR.**
- **Preserve:** `getPerformanceCommandData` + Lab resolvers/adapters + `helm_lifting_*` reads; props `kpis, board, readiness, readinessWithheld, playerNameById, canManageLifting`, and `roster, assignments, exercises, readiness, embedded`.
- **Compose:** CC header + 4 pill links→`SectionMasthead`+Buttons; 7 KPI glass cards (amber tones)→`KPIContentsStrip`+`StatReadout`; Today Weight-Room board→`PaperCard`+`StatLineStack`; readiness queue→`PlayerRowPlate`; `· stale`→`InkBadge`; Dashboard `Tabs` kept+reskinned, section cards→`PaperCard`, `EmptyState`→`EmptyIssue variant="today"/"generic"`.
- **Viz:** richest lift surface — PR/lift trends→**`ClimbArc`**/`StatReadout`.
- **Empty/gotchas:** coach + (`can_manage_lifting` OR `can_view_readiness`) redirect; `readinessWithheld` withholding UI stays honest; `helm_lifting_*` via adapters (don't touch). → **split PRs** (CC vs Dashboard).
- **Owns:** edit `performance/page.tsx`, `PerformanceCommandCenter.tsx`, `PerformanceDashboardClient.tsx`.

#### messages/[id] · `/baseball/dashboard/messages/[id]` · **Class B** · **S** (M if converge)
- **Files:** page `.../messages/[id]/page.tsx` (87 — **the page IS the client**; no separate file). **Correction: does NOT share `MessagesFairway`** (that is the list page only). The shared thread UI it duplicates is `src/components/messages/ChatWindow.tsx`.
- **Preserve:** `useMessages(conversationId)`/`useConversations()` + `sendMessage` + auto-scroll `messagesEndRef`. Do not touch the send path.
- **Compose:** `Header`(backHref)→`SectionMasthead` with back affordance; hand-rolled bubbles→`PaperCard`/`InkBadge` kit bubble; composer container reskin. `EmptyIssue variant="messages"` for conversation-not-found.
- **Gotchas:** reconcile mobile `h-[calc(100dvh-4rem)]`. **Optional (M):** converge onto a kit-composed `ChatWindow` to delete ~35 lines of divergent bubbles — but that makes `ChatWindow.tsx` a shared edit (also used by the list page) → coordinate. Default = keep isolated (S).
- **Owns:** edit `messages/[id]/page.tsx` only (isolated path).

#### settings/staff · `/baseball/dashboard/settings/staff` · **Class B** · **M**
- **Files:** page `.../settings/staff/page.tsx` (45); client `components/baseball/staff/StaffSettingsClient.tsx` (785).
- **Preserve:** `getStaffSettingsData()` + `inviteStaff`/`revokeStaffInvite`/`resendStaffInvite`/`updateStaffCapabilities`/`removeStaff`; **`CAPABILITY_DEFS` matrix + `ROLE_PRESETS` — reskin the container only, preserve the form + `role="switch"` ARIA**; keep `LazyMotion`/`useReducedMotion` + `ConfirmDialog`.
- **Compose:** header→`SectionMasthead`; read-only notice→`EditorsLetter`/`InkBadge`; invite `Card`→`PaperCard`; `StaffRow` `Card`s→`PaperCard`/`PlayerRowPlate` + `Badge`→`InkBadge`; "No staff yet"→`EmptyIssue variant="generic"`.
- **Empty/gotchas:** coach + `can_invite_staff`; read-only viewer sees roster, no edit.
- **Owns:** edit `settings/staff/page.tsx`, `StaffSettingsClient.tsx`.

#### settings/program · `/baseball/dashboard/settings/program` · **Class B** · **M–L**
- **Files:** page `.../settings/program/page.tsx` (43); client `components/baseball/settings/ProgramSettingsClient.tsx` (1151) + `AiAuditLog` (reused).
- **Preserve:** `getProgramSettings()` + `updateProgramSettings`/`changeProgramType`/`updateProgramIdentity` + variant-engine terminology + dirty-tracking + brand-hex guard + **two independent save paths (settings doc vs `baseball_teams` identity)**; **PRESERVE form primitives (`ToggleRow`/`Field`/`Checkbox`/`Select`/`Input`) — reskin containers only.**
- **Compose:** refactor the `SectionCard` helper ONCE →`PaperCard`+`SectionMasthead`/`Eyebrow`/`HairlineRule` (**all 11 sections inherit**); `Header`+in-header Save→`SectionMasthead`+`Button` (keep sticky-save); lock notice→`EditorsLetter`; coach-access `EmptyState`→`EmptyIssue variant="generic"`.
- **Gotchas:** coach + `can_manage_settings`; **program-type variance is the defining trait** (keep variant-driven copy dynamic); **keep reveal-on-MOUNT (not `whileInView` — that left a ~6,900px blank);** preserve `#anchor` deep-links + `scroll-mt-24`.
- **Owns:** edit `settings/program/page.tsx`, `ProgramSettingsClient.tsx`.

### 3.2 THE WAR ROOM — coach recruiting · CLAY (`ink="pursuit"`)

#### pipeline · `/baseball/dashboard/pipeline` · **Class B** · **L**
- **Files:** page `.../pipeline/page.tsx` (7, guard); client `pipeline/PipelineClient.tsx` (1026); legacy board `src/components/features/pipeline-column.tsx` + `pipeline-card.tsx` (**baseball-only callers — safe to delete**).
- **Preserve:** `useWatchlist()` + **dnd-kit** (`DndContext`/`DragOverlay`/`PointerSensor` 8px/`closestCorners`) + `updateStage`→`updateWatchlistStatus` + the `closestCorners` over-resolution + `PIPELINE_STAGE_IDS` guard + revert-on-failure + keyboard nav (j/k/Enter/x); reuse `PlayerDetailModal`/`PlayerPeekPanel`/`PositionPlanner`.
- **Compose (clay):** `PipelineStatsSummary` (amber/blue/purple tiles)→`KPIContentsStrip` clay + `StatReadout flashOnChange` (odometer); `Header`→`SectionMasthead ink="pursuit"`; columns→`Eyebrow`/`HairlineRule ink="pursuit"`; draggable `PipelineCard`→**`RecruitCard`** (GradeStamps + `AgingBar` + stage `InkBadge`); empty→`EmptyIssue variant="pipeline"` (clay); list/filter chrome→clay `PaperCard`.
- **Ceremony:** **`CommitSeal`** on drop into `committed` (drag-success branch after `updateStage`); `StatReadout flashOnChange` on the moving counts.
- **Gotchas:** **stage enum is EXACTLY 5 (`watchlist|high_priority|offer_extended|committed|uninterested`) — the DB enum `baseball_pipeline_stage` rejects extras; never reintroduce `contacted`/`campus_visit`.** Preserve mobile `overflow-x-auto snap-x`. `requireRecruitingCoachRoute()`. → **split PRs.**
- **Owns:** **create** `src/components/baseball/pipeline/PipelineFairway.tsx`, edit `pipeline/page.tsx` + `PipelineClient.tsx`, ~~features/pipeline-column.tsx~~, ~~features/pipeline-card.tsx~~.

#### discover · `/baseball/dashboard/discover` · **Class B** · **M–L**
- **Files:** page `.../discover/page.tsx` (7, guard); client `discover/DiscoverClient.tsx` (512) + `src/components/coach/discover/DiscoverView.tsx` (751) + `FilterPanel.tsx` (643).
- **Preserve:** `getDiscoverPlayers`/`getDiscoverTeams`/`getWatchlistIds`/`getStateCounts` + URL-param filters + 300ms debounce + **AbortController request cancellation** + 24/pg + `players|teams` mode; reuse `PlayerPeekPanel`/`TeamPeekPanel`.
- **Compose (clay):** `Header`→`SectionMasthead ink="pursuit"` + "N found" `StatReadout`; player cards→`RecruitCard` + `InkBadge`(watchlisted); `FilterPanel`→clay filters (keep `ToolRail` idiom for velo/exit ranges; **mobile filter drawer survives**); error→kit inline; empty→`EmptyIssue variant="discover"` (NEW) / `pipeline`.
- **Gotchas:** preserve abort-on-refilter (no re-fetch loops). `requireRecruitingCoachRoute()`.
- **Owns:** edit `discover/page.tsx`, `DiscoverClient.tsx`, `coach/discover/DiscoverView.tsx`, `coach/discover/FilterPanel.tsx`.

#### watchlist · `/baseball/dashboard/watchlist` · **Class B** · **L**
- **Files:** page `.../watchlist/page.tsx` (7, guard) + `WatchlistPageClient.tsx` (17, Suspense); client `watchlist/WatchlistClient.tsx` (1015).
- **Preserve:** `useWatchlist()` + `removeFromWatchlist`/`updateWatchlistStatus`/`addWatchlistNote`/`addToWatchlist` + **direct client add-search query (`baseball_players` where `recruiting_activated=true` + `.not('id','in',…)` exclusion — untouched)** + CSV export; reuse `PlayerPeekPanel`.
- **Compose (clay):** `Header`→`SectionMasthead ink="pursuit"`; desktop table + mobile cards→`RecruitCard`/`PlayerRowPlate ink="pursuit"`; `Badge` stage pills→`InkBadge tone="pursuit"` (`sodium` for committed); empty glass→`EmptyIssue variant="pipeline"` (clay); no-match→clay filter-empty; modals reskinned.
- **Ceremony:** `CommitSeal` when a row's stage `<Select>` → `committed`; `StatReadout` header count. Optional: replace `prompt()`-based bulk note with a kit input.
- **Gotchas:** 5-stage enum kept exactly. `requireRecruitingCoachRoute()`. `use-watchlist.ts` is read-only-shared with pipeline (different batch).
- **Owns:** edit `watchlist/page.tsx` (opt), `WatchlistPageClient.tsx`, `WatchlistClient.tsx`.

#### scout-packets · `/baseball/dashboard/scout-packets` · **Class B** · **S**
- **Files:** page `.../scout-packets/page.tsx` (75, owns its UI); list `src/components/baseball/passport/ScoutPacketRosterList.tsx` (194). (`ScoutPacketManager`/`ScoutPacketView` in the same dir are the per-player packet detail — out of this surface's scope.)
- **Preserve:** `getScoutPacketRoster()` (`exportEnabled, entries[]` with `exposed/liveLinkCount/position/gradYear/playerId/name`) + row link `/players/[id]/scout-packet`.
- **Compose (clay):** header→`SectionMasthead ink="pursuit"`; **`bg-amber-50` "export off" guardrail banner→`EditorsLetter ink="pursuit"` (kills the yellow box)**; rows→**`TearSheet`** per player + `InkBadge`/`ToolRail` chips; empty/no-match→`EmptyIssue`.
- **Ceremony:** **`PacketSeal` (variant `packet`, "ISSUED")** — the canonical home for the wax Helm seal (TearSheet header / on issuance).
- **Gotchas:** coach + (`can_export_reports` OR `is_head_coach`) redirect; keep the honest 3-state chip (`N live` / `Ready to share` / `Internal`); `ScoutPacketRosterList` lives in `passport/` dir but is a **different file** than the Passport lane's `PlayerPassportCard.tsx` (no conflict).
- **Owns:** edit `scout-packets/page.tsx`, `passport/ScoutPacketRosterList.tsx` (+ opt **create** `ScoutPacketsFairway.tsx`).

#### decision-room · `/baseball/dashboard/decision-room` · **Class B** · **L**
- **SCOPE CORRECTION:** this is a **staff Meeting-Mode agenda + action-bar + Decision Ledger** (two-pane), **NOT** a player-tool `ToolRailStack` compare. The compare grid is the separate `/baseball/dashboard/compare` route (gated `can_manage_roster`), **not in this migration**.
- **Files:** page `.../decision-room/page.tsx` (52); client `src/components/baseball/staff-decision-room/StaffDecisionRoomClient.tsx` (**1711 — the biggest**).
- **Preserve:** `getDecisionRoomData()` (13 read-model arrays + 5 counters) + `markMeetingItemDiscussed`/`resolveMeetingItem`/`reopenMeetingItem`/`recordDecisionNote`/`createMeetingItem`/`convertSignalToPracticeBlock`/`convertSignalToAction`/`recordActionOutcomes` (these materialize real subsystem objects — do not stub).
- **Compose (clay):** two-pane; `Card`/`Badge`/`EmptyState`→`PaperCard`/`InkBadge`/`EmptyIssue` clay; amber accents (`717,780,1510,1567,1628`)→clay `severityTone`→`InkBadge tone="pursuit"/"sodium"`; headers→`SectionMasthead ink="pursuit"`; Decision Ledger rows→`PaperCard`/`RuledStatLine`; empty agenda→`EmptyIssue` clay.
- **Ceremony:** a recorded decision (`recordDecisionNote`/`resolveMeetingItem`) → a `CommitSeal`-style "decision made" stamp on the ledger entry; `StatReadout flashOnChange` on `decisionCount`/`openAgendaCount`/`outcomeMovedCount`.
- **Gotchas:** page auth + read-model `can_manage_settings` (`withBaseballAction`); readiness/availability sub-gated on `can_view_readiness` → **keep honest-empty, don't fabricate.** 1711 lines → **split by pane into several ≤15-file PRs.** `actions/signals.ts convertSignalToAction` is read-only-shared with signals.
- **Owns:** edit `decision-room/page.tsx`, `StaffDecisionRoomClient.tsx` (+ new Fairway variant).

#### signals · `/baseball/dashboard/signals` · **Class B** · **L**
- **SCOPE CORRECTION:** an **operational coaching-signal triage inbox** (4 views: Feed/Compact/Grouped/Board; `severity: critical|warning|info` + disposition `new/acknowledged/converted/resolved`), **NOT** a commit/offer/milestone ticker. No CommitSeal here.
- **Files:** page `.../signals/page.tsx` (108); client `src/components/baseball/signals/SignalInboxClient.tsx` (557) + `SignalCard`/`SignalDrillDown`/`CommandSignalStack`/`ConvertToActionDialog`/`signal-presentation.ts`.
- **Preserve:** `getSignalInbox(teamId,{limit:200})` + `acknowledgeSignal`/`setSignalDisposition`/`recordSignalFeedback`/`convertSignalToAction`/`runOperationalSignalDetection` + URL-backed view/group/severity state + roster/staff joins.
- **Compose (clay):** view-switcher→`SectionMasthead ink="pursuit"` + clay tabs; Board columns→`Eyebrow`/`HairlineRule ink="pursuit"` + severity `InkBadge`; cards→clay `PaperCard`/`RecruitCard`-style; **the many amber boxes (`SignalInboxClient 350`, `signal-presentation 42`, `CommandSignalStack 142`, `SignalDrillDown 194`, `ConvertToActionDialog 168`, live pulse `536`)→`InkBadge tone="sodium"/"pursuit"` + `EditorsLetter`**; live dot→**`LiveDot ink="sodium"`**; empty→`EmptyIssue variant="signals"`.
- **Gotchas:** honest `authorized:false` envelope for non-staff; write affordances gated on `can_manage_stats`. **`CommandSignalStack` is ALSO rendered inside the already-migrated command-center — reskin WITHOUT regressing the Pressbox cover (or build a signals-local variant).**
- **Owns:** edit `signals/page.tsx`, `signals/` component family (`CommandSignalStack` with care).

### 3.3 THE PASSPORT — player development · GREEN (`ink="team"`)

#### passport · `/baseball/player/passport` · **Class B** · **L**
- **Files:** page `src/app/baseball/(player-dashboard)/player/passport/page.tsx` (138); client `src/components/baseball/passport/PlayerPassportCard.tsx` (639) + write surface `PassportVisibilityControls.tsx` (466).
- **Preserve:** `getPlayerPassport` + `getPassportSettingsForEditor` (`{mode:'full'}`); `PassportReadModel` sections (`identity, measurables, developmentStory, media, performance, completeness, visibilityState, withheldFieldCount, authorized`); **`PassportVisibilityControls` is a WRITE surface — keep its mutations, only wrap in `PaperCard`.**
- **Compose (green):** header→**`Masthead`** (given/SURNAME from `identity` name, `scrollShrink`+`registrationTick`) + `Eyebrow` (POSITION·CLASS·STATE); `MeasurableTile` grid→`RuledStatLine`(verified/ghost) in `StatLineStack` (absent measurables render **ghost em-dash**, not omitted); `SeasonStat`/game-log table→`RuledStatLine`+`SlashLine`+`PlayerRowPlate`; `ExposurePill`→`InkBadge`; `SectionTitle`→`SectionMasthead`; `Card`→`PaperCard`; amber exposure banners→`EditorsLetter`.
- **Completeness dies:** `CompletenessMeter` %-bar + signal list → **the file fills in**: incomplete signals become **ghost `RuledStatLine`** rows (visible gaps in the spread, not a progress bar).
- **CRITICAL honesty:** every measurable is currently `source:'manual'`/`verified:false` (read-model hardcode 674–705) → `RuledStatLine verified={false}`; only pass `verified` when `measurable.trust.verified===true`. Media CAN be verified (`review_status==='approved'`).
- **Viz:** `SprayChart`/`ClimbArc` ship **honest-empty** until batted-ball coords / per-session series exist (game-logs carry only H-AB today).
- **Gotchas:** SELF-ONLY; teamless→`/baseball/player/today`; unauthorized→own not-available empty; `withheldFieldCount` honesty survives; **`PlayerPassportCard.tsx` is also the compact embed in `PlayerTodayClient:93` — do NOT delete it here; build a new `PlayerPassportFairway` and leave the card for Today (deletion is Batch H).**
- **Owns:** edit `passport/page.tsx`, **create** `passport/PlayerPassportFairway.tsx`, wrap `PassportVisibilityControls.tsx`. (Do NOT edit/delete `PlayerPassportCard.tsx`.)

#### today · `/baseball/player/today` · **Class B** · **L**
- **Files:** page `src/app/baseball/(player-dashboard)/player/today/page.tsx` (188); clients `PlayerTodayClient.tsx` (**1768**) + `PlayerTodayTeamless.tsx` (266).
- **Preserve:** `getPlayerToday`/`getPlayerDailyContract`/`getPlayerPassport` + lifting slot (`getPlayerSorenessToday`/`getPlayerBodyweightHistory`/`getPlayerNutritionPlans`) + props `model, dailyContract, passport, activeRole, todayIso, performanceSlot`; reuse `DailyContract` + `SorenessCheckCard`/`WeightCheckInCard`/`NutritionPlanCard` verbatim + teamless `processTeamInvitation`.
- **Compose (green):** header→`Masthead`/`SectionMasthead` + `Eyebrow`(todayIso); reuse `DailyContract` verbatim; **compact passport embed→kit `TearSheet` / compact `RuledStatLine` stack (do NOT import `PlayerPassportCard` — decouple from Passport)**; many `EmptyState`→`EmptyIssue variant="today"`.
- **Gotchas:** SELF-ONLY; teamless renders `PlayerTodayTeamless` (a real join screen, NOT a redirect); lifting slot try/catch→null (never breaks the page); TEAM-tz "today" correctness; largest client (1768) → **split PRs.** **Different batch from passport** (both once used `PlayerPassportCard`).
- **Owns:** edit `today/page.tsx`, **create** `PlayerTodayFairway.tsx` (+ teamless variant), edit `PlayerTodayClient.tsx`.

#### dev-plan (development) · `/baseball/dashboard/dev-plan` · **Class B** · **M–L**
- **Files:** page `.../dev-plan/page.tsx` (**745 — the page IS the client**; inline `GoalCard`/`DevPlanSkeleton`/`EmptyState`/`GoalsList`).
- **Preserve:** `getActiveDevPlan(player.id)` + `completeGoalAsPlayer`/`uncompleteGoalAsPlayer` (player-owned writes) + optimistic refetch; `categorizedGoals`/`completionPercent`/`avgProgress`.
- **Compose (green):** `Header`→`SectionMasthead`; `GoalCard` glass + inline progress bars→`PaperCard`+`RuledStatLine`/`AgingBar`; coach-notes blue box→`EditorsLetter`; tabs kept; celebration card→**`CommitSeal`** ceremony (goals-complete payoff).
- **Completeness dies + primary ClimbArc:** `ProgressRing completionPercent`→**`ClimbArc`** (goal `progress`/`completed_at` over `target_date`, `goal=100`) + `RuledStatLine` stats (Active/Upcoming/Done). The **"No development plan yet" empty + "how it works" card→`EmptyIssue variant="dev-plan"` (NEW preset)** — the marquee empty.
- **Gotchas:** player-only; honor `prefersReducedMotion`. → optionally lift to a server page (M→L).
- **Owns:** edit `dev-plan/page.tsx` (extract to `PlayerDevPlanFairway`).

#### timeline · `/baseball/player/timeline` · **Class B** · **M**
- **Files:** page `src/app/baseball/(player-dashboard)/player/timeline/page.tsx` (133); client `PlayerTimelineClient.tsx` (129) → shared `src/components/baseball/player-profile/ProfileTimeline.tsx` (406).
- **Preserve:** `getPlayerTimeline`/`getTimelineAcksForViewer` + ack mutation + server-side viewer-role filtering; props `model, initialAcks`.
- **Compose (green):** header→`Masthead`/`SectionMasthead`+`Eyebrow`; timeline rail→`Trace` + `RuledStatLine` + `InkBadge` source stamps + keep `SourceTrustBadge`; `EmptyState`→`EmptyIssue variant="signals"`/`generic`.
- **Gotchas:** **`ProfileTimeline` is SHARED with the COACH player-profile surface — build the Fairway timeline INSIDE the variant; do NOT edit `ProfileTimeline.tsx` (that would re-skin the coach surface).** `hiddenCount` honesty ("N moments hidden at your access level") survives; non-player→honest empty; teamless→today.
- **Owns:** edit `timeline/page.tsx`, `PlayerTimelineClient.tsx`, **create** `PlayerTimelineFairway.tsx`. (Do NOT edit `ProfileTimeline.tsx`.)

#### profile · `/baseball/dashboard/profile` · **Class B** · **M**
- **Files:** page `.../profile/page.tsx` (91, `'use client'`); clients `src/components/features/profile-editor.tsx` (507, HS/recruiting) + `src/components/baseball/profile/CollegeProfileEditor.tsx` (806, college).
- **Preserve:** `useAuth` `player`/`updatePlayer` + **both editors are WRITE surfaces — preserve every field/handler, reskin chrome only.**
- **Compose (green):** `Header`→`SectionMasthead`; form-section cards→`PaperCard`; **`calculateProfileCompletion` + `ProgressRing` (CollegeProfileEditor 68–112) DIES → the file fills in via ghost `RuledStatLine` rows for `missingFields`**; "View Public Profile"→`InkBadge`/`Button`.
- **Gotchas:** coach→`/command-center` redirect; player-type branch (`isCollegePlayer`→`CollegeProfileEditor` vs `ProfileEditor`); **`components/features/profile-editor.tsx` is a non-baseball path — wrap/reskin WITHOUT breaking other consumers; verify no golf usage first.**
- **Owns:** edit `profile/page.tsx`, `CollegeProfileEditor.tsx`, wrap `features/profile-editor.tsx`.

#### college-interest · `/baseball/dashboard/college-interest` · **Class B** · **M**
- **Files:** page `.../college-interest/page.tsx` (8, `force-dynamic`); client `CollegeInterestClient.tsx` (568). **Primarily a COACH surface** (which colleges view YOUR players) despite the Passport grouping; player states are gate screens.
- **Preserve:** direct client Supabase reads (`baseball_team_coach_staff`→teamId, `baseball_team_members`→playerIds, `baseball_player_engagement_events` join) + grouping/stats/filter + **the anonymity model `isAnonymous = !event.coach_id` ("A college coach" vs named coach/school) — load-bearing; never leak identity when `coach_id` is null.** `usePlayerRecruitingGate` states.
- **Compose (green):** `Header`→`SectionMasthead`; 4 stat cards→`KPIContentsStrip`; per-player interest cards→`PlayerRowPlate`/`RecruitCard` + `InkBadge` engagement stamps; empty→`EmptyIssue variant="signals"` ("the wire is quiet"); `IconLock` gate cards→`EditorsLetter`.
- **Ink ruling:** recruiting data, but keep **green chrome** (green-lane nav); `sodium`/`pursuit` accents ok for interest heat — no full clay chrome.
- **Gotchas:** 3 player-gate states (college-player "Not available" / non-activated / non-coach) + coach view; heavy `lg:` responsive forks on mobile.
- **Owns:** edit `college-interest/page.tsx`, `CollegeInterestClient.tsx`.

#### activate · `/baseball/dashboard/activate` · **Class B** · **S–M** · CEREMONY
- **Files:** page `.../activate/page.tsx` (80, server-gated — closest to command-center shape); client `ActivateRecruitingClient.tsx` (230).
- **Preserve:** `getSessionProfile` + **the gated `activateRecruitingExposure` action (enforces the program `recruiting_exposure_enabled` toggle — a raw client `updatePlayer` would bypass it)** + `updatePlayer` store-sync + `router.push`.
- **Compose (green):** college-guard `Card`+`IconLock`→`EditorsLetter` "Not available"; `Header`→`SectionMasthead`; hero gradient→`Masthead`/`EditorsLetter`; `FEATURES` cards→`PaperCard`+`RuledStatLine`; privacy card→`PaperCard`; error red box→`EditorsLetter`.
- **Ceremony (centerpiece):** CTA "Activate recruiting"→**`CommitSeal`** (label `LIVE`/`ACTIVATED`, `stampPress`+`inkBleed`); **sequence `router.push` AFTER the stamp; reduced-motion → seal rendered pressed.** Note: `CommitSeal` is oxblood/`--pursuit-deep` by design — the one place a green-lane surface uses a clay ceremony seal (keep green chrome + oxblood seal).
- **Gotchas:** non-player→command-center, activated→today, **college-player→"Not Available" (page 50–72) — preserve the server guard.** HS/JUCO/Showcase activate.
- **Owns:** edit `activate/page.tsx`, **create** `ActivateRecruitingFairway.tsx`, edit `ActivateRecruitingClient.tsx`.

---

## 4. Batch schedule + conflict map

**Total surfaces to migrate: 29** (Pressbox 16 · War Room 6 · Passport 7). command-center is done; stats-center is concurrent.

### 4.1 Why parallelism is nearly free here
Every surface owns a **disjoint set of files** (its own `page.tsx` + client + component directory). The migration is presentation-only, so surfaces **import** shared files (`nav-registry.ts`, `@/components/layout/header`, `@/components/ui/*`, the living-annual barrels, shared read-models/actions/hooks) but **never edit them**. Therefore the only real parallel-collision risks are the handful below — everything else can run concurrently.

**Cross-surface edit collisions (the ONLY things that force sequencing):**
| Shared file | Surfaces | Rule |
|---|---|---|
| `PlayerPassportCard.tsx` | passport + today | **Different batches (F vs G).** Both build NEW Fairway files and stop importing the card; owner deletes it in Batch H. |
| `molecules/EmptyIssue.tsx` | announcements, travel, discover, dev-plan (need new presets) | **Owner adds all presets ONCE in Batch 0.** Surface agents never edit it. |
| `TravelClient.tsx` | travel ↔ external **PR #555** | **Gate travel on PR #555.** |

**Read-only shared (safe in parallel — imported, never edited):** `use-watchlist.ts` (pipeline/watchlist), `actions/signals.ts` (signals/decision-room), `ProfileTimeline.tsx` (timeline — build Fairway-only, don't edit), `features/profile-editor.tsx` (profile — wrap, don't edit), `CommandSignalStack.tsx` (signals — reskin without regressing command-center), `Header`, `ui/*`, barrels, `nav-registry.ts`, `BaseballFairwayShell.tsx`, `layout.tsx`.

### 4.2 Ordered batch schedule
Batches are ordered for pattern maturity + reviewer load; A–G are otherwise independent (Batch 0 blocks all; F precedes G; H follows F+G). Within a batch, every surface is file-isolated → **run its agents concurrently.** Effort-L surfaces internally split into several ≤15-file PRs (`practice`, `import`, `performance`, `pipeline`, `decision-room`, `passport`, `today`).

**Batch 0 — OWNER PRE-FLIGHT (one small PR; blocks all):**
- Add `EmptyIssue` presets to `molecules/EmptyIssue.tsx`: `announcements`, `travel`, `discover`, `dev-plan` (extend `EmptyIssueVariant` + `EMPTY_ISSUE_PRESETS`). Additive only.
- Confirm PR #555 status (gates travel).
- Restate freeze: no surface agent edits `nav-registry.ts`, `BaseballFairwayShell.tsx`, `(dashboard)/layout.tsx`, the three barrels, `Header`, or `ui/*`.

**Batch A — Pressbox consistency-pass (warm-up; 5 concurrent):** `calendar` · `announcements` · `tasks` · `documents` · `messages/[id]`
- Owns: `{calendar/page.tsx, CalendarFairway.tsx}` · `{announcements/page.tsx, AnnouncementsFairway.tsx}` · `{tasks/page.tsx, TasksFairway.tsx}` · `{documents-client.tsx, DocumentsFairway.tsx, documents/page.tsx}` · `{messages/[id]/page.tsx}`. Locks the fork-collapse + kit pattern on the low-risk (A) surfaces.

**Batch B — Pressbox record-book (5 concurrent):** `roster` · `my-stats` · `analytics` · `practice-effectiveness` · `postgame`
- Owns: `{RosterClient.tsx, RosterFairway.tsx, (roster/PlayerRow.tsx, RosterToolbar.tsx)}` · `{my-stats/page.tsx, MyStatsClient.tsx, player-stats/*, season-stats/MySeasonStats.tsx}` · `{analytics/page.tsx, analytics/layout.tsx, AnalyticsClient.tsx}` · `{practice-effectiveness/page.tsx, PracticeEffectivenessClient.tsx}` · `{postgame/page.tsx, PostgameReviewClient.tsx}`. Introduces `PlayerRowPlate`/`SlashLine`/`KPIContentsStrip`/`ClimbArc`.

**Batch C — Pressbox heavy editors (5–6 concurrent):** `practice` · `import` · `performance` · `settings/staff` · `settings/program` · `travel`(gated)
- Owns: `{practice/page.tsx, practice-planner/* (8) + rm .tmp}` · `{import/page.tsx, import-center/* (6)}` · `{performance/page.tsx, PerformanceCommandCenter.tsx, PerformanceDashboardClient.tsx}` · `{settings/staff/page.tsx, StaffSettingsClient.tsx}` · `{settings/program/page.tsx, ProgramSettingsClient.tsx}` · `{travel/page.tsx, TravelClient.tsx, +TravelFairway.tsx}`. Form/wizard preservation is paramount — reskin containers only.

**Batch D — War Room I (3 concurrent; CLAY):** `scout-packets` · `discover` · `watchlist`
- Owns: `{scout-packets/page.tsx, passport/ScoutPacketRosterList.tsx, +ScoutPacketsFairway.tsx}` · `{discover/page.tsx, DiscoverClient.tsx, coach/discover/DiscoverView.tsx, FilterPanel.tsx}` · `{watchlist/page.tsx, WatchlistPageClient.tsx, WatchlistClient.tsx}`. `PacketSeal` + `RecruitCard` land here.

**Batch E — War Room II (3 concurrent; CLAY; each multi-PR):** `pipeline` · `signals` · `decision-room`
- Owns: `{+pipeline/PipelineFairway.tsx, pipeline/page.tsx, PipelineClient.tsx, −features/pipeline-card.tsx, −features/pipeline-column.tsx}` · `{signals/page.tsx, signals/* (CommandSignalStack with care)}` · `{decision-room/page.tsx, StaffDecisionRoomClient.tsx, +Fairway variant}`. `CommitSeal` ceremony (pipeline drop→committed).

**Batch F — Passport I (4 concurrent; GREEN):** `passport` · `dev-plan` · `profile` · `activate`
- Owns: `{passport/page.tsx, +PlayerPassportFairway.tsx, PassportVisibilityControls.tsx}` (NOT PlayerPassportCard) · `{dev-plan/page.tsx →PlayerDevPlanFairway}` · `{profile/page.tsx, CollegeProfileEditor.tsx, wrap features/profile-editor.tsx}` · `{activate/page.tsx, +ActivateRecruitingFairway.tsx, ActivateRecruitingClient.tsx}`. Completeness-% dies (ghost RuledStatLine); `ClimbArc`; `CommitSeal` Go-Live.

**Batch G — Passport II (3 concurrent; GREEN):** `today` · `timeline` · `college-interest`
- Owns: `{today/page.tsx, +PlayerTodayFairway.tsx, PlayerTodayClient.tsx}` (compact passport embed uses kit, not PlayerPassportCard) · `{timeline/page.tsx, PlayerTimelineClient.tsx, +PlayerTimelineFairway.tsx}` (NOT ProfileTimeline) · `{college-interest/page.tsx, CollegeInterestClient.tsx}`.

**Batch H — OWNER CLEANUP (after F+G):**
- Delete `PlayerPassportCard.tsx` once neither passport nor today imports it; grep for any remaining orphans (`knip`); collapse any lingering `isRedesignEnabled` in the migrated surfaces.
- Update shared docs (see §6): tick `ui-migration-map.md` rows, update `baseballhelm-features.md`, `CLAUDE.md` routing line.

### 4.3 Sequencing summary
`Batch 0` → (`A` → `B` → `C`) Pressbox → (`D` → `E`) War Room → (`F` → `G`) Passport → `H`. A–G may also overlap across lanes (they share no editable files) if reviewer capacity allows; the only hard edges are **0 before all**, **F before/apart-from G** (PlayerPassportCard), **travel after PR #555**, and **H after F+G**.

---

## 5. Per-surface verification checklist (run before folding each surface)

For every surface PR/change, confirm:
- [ ] `npm run typecheck` clean (no new errors).
- [ ] `npm run lint` clean (0 new warnings; no `bg-yellow`/`bg-amber`/`warning` reintroduced).
- [ ] **Data preserved:** no edit under `read-models/`, `**/actions/**`, `supabase/`, RLS, or hooks; the
      same props/read-model flow into the presentation unchanged.
- [ ] **Legacy deleted:** the replaced legacy component file is gone; no orphaned imports; `isRedesignEnabled`
      fork for this surface collapsed (grep the surface dir — zero remaining `isRedesignEnabled` for it).
- [ ] **Honest empty:** every zero/empty/error routes through `<EmptyIssue>` / `<EditorsLetter>` / ghost `<RuledStatLine>`.
- [ ] **Ink correct:** Pressbox/Passport green (`ink="team"`), War Room clay (`ink="pursuit"`); `--clay` only in `<ClayCanvas>`.
- [ ] **Numbers:** every changeable figure is `<StatReadout>`/`<RuledStatLine>` (tabular, odometer); leaders green.
- [ ] Mobile: SectionMasthead actions wrap; PlayerRowPlate stat columns don't overflow (`w-20` cols); board scrolls.
- [ ] `SectionMasthead` replaces the old header; no duplicate `<Header>`/`ViewHeader`/`PageHeader` mount remains.

## 6. Shared-doc update list (owner-coordinated — NOT edited by surface agents)

The **main/owner agent** owns these shared files; surface agents must not touch them (they cause cross-surface merge conflicts):
- `docs/baseball/ui-migration-map.md` — check off each surface row as it lands.
- `memory/context/baseballhelm-features.md` — add/update the migrated surface's entry (per-wave DoD #3).
- `CLAUDE.md` — update the routing line ("Baseball features | No deep reference yet…") once the kit is the norm.
- `src/components/baseball/living-annual/README.md` — mark surfaces implemented (kit-usage note) if adding new patterns.
- `memory/registry.yml` — **no change needed**: baseball is already covered by broad globs
  (`src/app/baseball/**`, `src/components/baseball/**`) under `baseball_core`.
- `src/lib/baseball/nav-registry.ts` — **frozen this migration** (3-lane restructure is DEFERRED/owner-gated).
  Surface agents must NOT edit it; plan within the current nav.
- `src/app/baseball/(dashboard)/BaseballFairwayShell.tsx` + `(dashboard)/layout.tsx` — **frozen** (shell owner-only).

<!-- END -->

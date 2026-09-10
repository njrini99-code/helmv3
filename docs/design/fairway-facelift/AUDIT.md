<!-- markdownlint-disable MD013 -->
# Facelift audit — competing surfaces, hydration, dead code

Owner sections: helmv3-7f writes Competing surfaces, Hydration, Dead code; helmv3-20 writes Mobile.
Evidence: `ui-intelligence/facelift/` captures (2026-09-10) and the read-only audits in this branch's session.

## Competing surfaces (from the captures)

| # | Surfaces | What overlaps | Decision |
| --- | --- | --- | --- |
| 1 | `/dashboard` (coach home), `/intelligence` (CoachHelm brief), `/development` | All three open with "Welcome back, Nick", team KPIs, "who needs attention", trend. `/development` repeats the roster health header ("Who needs your attention", "Did the coaching land?", the 4 numbers) verbatim from `/roster`. | Home = operations (today, attention board, pulse, rounds, activity). Intelligence = CoachHelm cockpit (Spine + signals workspace). Development = the players/focus-areas board only; its welcome, pulse and "bleeding strokes" sections are removed (they live in the cockpit). Roster keeps the health header. |
| 2 | `/coachhelm` for a coach | Renders a locked card ("This CoachHelm dashboard is the player view… Open Brief"). Direct-URL only: the coach rail, dock and More sheet all point at `/intelligence` (nav-registry). | Keep the in-place card. A session-conditional `redirect()` inside the RSC render is the React #310 crash class pinned by `src/test/static/golf-conditional-redirect.test.ts`; the only safe redirect is pre-render in `src/lib/supabase/middleware.ts`, which today runs no role lookup on golf routes. Follow-up: a pathname-scoped coach lookup for these two exact paths in middleware. |
| 3 | `/stats` for a coach | Locked card ("Personal stats belong to a player profile… Team Stats"). Direct-URL only: the coach Rounds & Stats hub lands on `/stats/team`. | Same as #2. |
| 4 | `/analytics/coachhelm` | Redirects to `/intelligence` already; the route folder is a shim. | Keep the redirect, delete the page body if it is only a redirect (dead-code audit confirms). |
| 5 | Round detail `/rounds/[id]` vs `/rounds/[id]/review` | Detail shows a "Final score" card + prose + "Open full review" twice (top pill and bottom card) and empty Front/Back and GIR/FW/Putts cards with dashes when no hole data exists. Review is the CoachHelm analysis. | Detail = the scorecard/story (Filmstrip when hole data exists; otherwise score + one InlineNotice "No hole data — enter holes to unlock the review"), ONE "Open full review" action. Review keeps its own layout. |
| 6 | Glass recipes | Six bespoke backdrop-filter recipes (see competing.md from the audit) plus `.fw-glass-chrome`. | One recipe: `.fw-frost` tiers. `.fw-glass-chrome` becomes an alias of `fw-frost fw-frost-subtle` and is migrated by consumers over time. |
| 7 | Buttons | `src/components/ui/button` (legacy) still used inside Fairway pages (FairwayBottomNav More column, others per audit). | Fairway `Button`/`IconButton` only in Fairway pages; the legacy import list is in competing.md. |
| 8 | Card units | `FairwayPlayerCard` (roster), qualifier cards, task cards, focus-area cards, "NEEDS MORE ROUNDS" cards | Boards and seam rows per the screen specs; the card files stay until their last consumer moves. |

## Hydration

Static audit, verified by reading each site. "Fix" names the in-repo pattern reused.

| # | File | Pattern | Risk | Fix |
| --- | --- | --- | --- | --- |
| 1 | `fairway/pages/messages/MessageThreadPane.tsx` formatDaySeparator | `new Date()` during render | High, live | server-seeded `now` / mount-gated now (FairwayAgendaView `nowRef` pattern) |
| 2 | `fairway/pages/messages/MessageConversationRail.tsx` formatTime | `new Date()` during render | High, live | same |
| 3 | `fairway/pages/coachhelm/FairwayPlayerInsight.tsx` formatRelativeDate | `new Date()` during render | High, live | same |
| 4 | `fairway/notifications/time-format.ts` + `NotificationRow.tsx` | `Date.now()` default param; `toLocaleString` without locale/timeZone | Med-high, live on home | `now` passed from a mount-gated state; pin locale + timeZone |
| 5 | `ui/reveal.tsx`, `ui/chart-shell.tsx` | raw framer `useReducedMotion()` gates a mount-time `initial` | Med-high | `useReducedMotionGuard` |
| 6 | ~40 other raw `useReducedMotion()` sites | same class where the value reaches a mount-time prop | Medium, systemic | same, case by case |
| 7 | `golf/calendar/*` (CalendarDayViewSwipeable, MonthView, WeekView, MobileEventCard, CalendarHeader) | unguarded `isToday`/`toLocaleDateString` | High but baseball-only today | fix when baseball adopts Fairway calendar |
| — | use-media-query, appearance, distance-units hooks; WhatsNew; ThemeScript; command-menu portal gates | previously fixed / correct patterns | none | — |

Also seen in the captures: the coach home desktop first paint had the trend chart and schedule still loading after network idle, and the round review shows a skeleton for 45s+ on a scorecard-only round — see the performance report.

## Dead code

knip + import-graph + per-file `rg` verification. Routes: no unreachable `page.tsx` under golf — `/hub`, `/patterns`, `/insights`, `/my-insights`, `/my-development`, `/my-game-profile`, `/my-standing`, `/alerts`, `/development` are documented redirect shims with `legacy: true, hidden: true` registry entries; `/fairway-preview` and `/vizlab` are deliberate direct-URL / dev-only surfaces; `/dev/haptics` is linked from Settings.

| Path | Why | LOC | Action |
| --- | --- | --- | --- |
| `hooks/golf/use-offline-sync.ts` | guarded by a must-not-import test | 508 | delete |
| `app/golf/actions/v3/llm.ts` | zero references | 536 | delete |
| `app/golf/actions/v3/{practice-rx,team-practice-rx,focus-area-progress,goal-progress}.ts` | zero references | 295 | delete |
| `app/golf/actions/player-effectiveness.ts`, `…/analytics/coachhelm/EffectivenessRetryButton.tsx`, `team-sg-baseline.ts` | zero references | 417 | delete |
| `…/my-development/LogProgressButton.tsx` | zero references | 268 | delete |
| `components/golf/coachhelm/player/index.ts` | unused barrel | 19 | delete |
| `components/ui/**` zero-importer files (status-pill, filter-chips, segmented-control, secondary-nav, …) | superseded by Fairway | ~2,500 | delete after per-file verification |
| admin CRM: EngagementDetailDrawer + Sparkline, useAdmin{Realtime,Alerts,Presence}, PipelineKanban, QuickActionsToolbar, ContactLogModal, TasksDueWidget, PipelineStats, admin-bi-data, admin-people-data | zero references | ~3,000 | delete |
| `app/golf/actions/stats.ts` | zero references but large | 804 | human review before delete |
| `components/golf/calendar/**` | dead for golf, live for baseball via PremiumCalendarClient | — | keep until baseball moves |
| legacy `StandingBar` (golf/coachhelm/v3), `StandingStrip`, `StandingTrack` | replaced by `charts/StandingBars` | — | delete once no consumer remains |
| `fairway/pages/dashboard/DaySchedule.tsx` component | coach home folds the schedule into Today; only the exported `dayKeyInTz`/`dayLabel` helpers are still imported | — | move the helpers, delete the component |

Legacy stragglers: ui/input and the three ui/confirm-dialog consumers inside Fairway pages are migrated (file-local ModalShell confirms; a shared overlays confirm is the follow-up), ChartTooltip and the command glass surface use tokens and the canonical GlassSurface. Still legacy: four ui/button uses in new round entry that need `haptic="none"` (Fairway Button gap), PlayersGridView, FairwayGolfClasses and FairwayExpenseList on ui/confirm-dialog, and the join/admin/onboarding loading screens, which `.claude/rules/design-system.md` keeps on the legacy skeleton on purpose.

## Performance

User-reported: a data-heavy coach account is slow and laggy, the message and calendar drawers stutter, and every tab tap reloads the page.

| # | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Every bottom-nav / sidebar tab switch refetches the page and repaints the loading skeleton, even bouncing between two tabs | `next.config.mjs` set no `experimental.staleTimes`; Next 16 defaults `dynamic` to 0, and the dashboard layout is fully dynamic (cookies), so the client router cache never kept a visited tab. Dev mode also disables `<Link prefetch>`, so the dev server shows the worst case. | `staleTimes: { dynamic: 60, static: 300 }` — a visited tab is served from the router cache for the hop back; server actions that `revalidatePath` and `router.refresh()` still purge it. Shell links keep `prefetch`. |
| 2 | Every sheet stutters on open, close and drag | `overlays/Sheet.tsx` puts the frost material (38px blur) on the very node vaul transforms, so the GPU resamples the blur every frame | done 35ddebc17: transformed wrapper without blur, static inner child carries the material |
| 3 | Every blocking modal stutters the same way | `overlays/ModalShell.tsx` animates the `motion.div` that carries `fw-glass-strong` | done 3389f1ff6: same split |
| 4 | Sticky in-drawer headers re-blur on every scroll frame on phones | `.fw-glass-chrome` on sticky headers inside scrolling sheet bodies (event drawer, message thread, calendar hero, 7+ more) has no mobile downshift | done e1c849082: mobile downshift (8px) + `.fw-frost-static`; the phone drawer and hero headers are matte (helmv3-20) |
| 5 | A data-heavy coach's calendar rebuilds on any team event write | `use-calendar-range-events.ts` realtime handler ignores the payload and does `router.refresh()` + a full range refetch, and every refetched row gets a new identity | done 0ffe14d67: patch the single changed id from the payload; class rows for non-coach viewers still refetch (server-side privacy filter), deletes always patch |
| 6 | Each incoming message tears down the reactions channel and refetches every reaction | `FairwayMessages.tsx` rebuilds the message-id array each render → `use-message-reactions.ts` re-keys, re-subscribes and refetches in 100-id chunks | stable id key; separate subscribe (conversation id) from refetch (messages-perf) |
| 7 | Event drawer content pops in three times | `getEventRSVP` is called twice per open (calendar + EventPeopleSection) plus the itinerary fetch, each resolving on its own schedule | done 64eed04cb: `attendees` flows from one getEventRSVP per open; People/Files mount after the Sheet animation |
| 8 | Thread pane does 2×N×R work per render | `summarizeReactions` runs twice per message per render, each a full scan of every reaction | one `useMemo` Map by message id (messages-perf) |
| 9 | Eight shell consumers re-render every 45s forever | `notification-badge-context.tsx` sets a fresh `[]` for unseen announcements each poll; the 2-3 poll actions are awaited sequentially | done 8d3f5f0f5: module-level empty constant + bail-out updater; `Promise.allSettled` |
| 10 | Agenda re-renders every card every minute | `FairwayAgendaView.tsx` owns the minute clock and an unmemoized bucket filter; nothing under pages/calendar is memoized | done 8221c0876: minute clock in a TodayRows child, BucketRows and FairwayEventCard memoized, buckets memoized |
| 11 | Permanent compositor layers, blur surfaces without hints | `will-change: transform` unscoped on `.surface-tile-hover`; `.animate-*` never clear it | done e1c849082: the three permanent declarations removed (will-change is not animatable, so it cannot be cleared from keyframes) |
| 12 | 200 message rows re-render on any pane state change | `MessageThreadPane.tsx` renders every message inline with no memo boundary | extract a memoized MessageRow; consider windowing (messages-perf) |
| 13 | Group participants refetch on any inbox change | `FairwayMessages.tsx` effect depends on the whole `conversations` array | depend on the selected conversation id (messages-perf) |
| 14 | Conversation rail re-splits on every keystroke | `MessageConversationRail.tsx` triage split is plain consts | `useMemo` (messages-perf) |
| 15 | Round review skeleton for 45s+ on a scorecard-only round | `rounds/[id]/review/page.tsx` awaits `getRoundReview` then `getPlayerStandingForReview` sequentially in one try block and clears `loadingStoredReview` only in `finally`, so the review sits behind the season-standing read; a round with no stored review also pays a full LLM round-trip from the auto-generate effect under the same skeleton | clear the loading flag when the review resolves and apply standing separately; show auto-generation as its own state (review-page) |

Ruled out: framer `layout`/`layoutId` in calendar and messages (none), images (avatars only), calendar range refetch on pan (correctly gated). Runtime measurement (Playwright + CDP harness at `scripts/ui-intelligence/.perf-measure.tmp.mjs`) is deferred until the machine is quiet; the ranking above is by mechanism and blast radius.

Tooling note: `cn()` (tailwind-merge) does not treat the custom `rounded-card` / `rounded-fw-*` radius tokens as one mergeable group, so a caller cannot strip a radius by passing another radius class; border, background and padding do merge.

## Mobile

Owner: helmv3-20 (mobile lane). Evidence: the read-only understand pass over `src/components/fairway/app-shell/**`, `src/components/fairway/pages/calendar/**`, `src/components/fairway/overlays/**` and the golf mobile surfaces (2026-09-10), plus the measurements in §Performance below. Golf only.

### Competing implementations (mobile)

| # | Surfaces | What overlaps | Decision |
|---|---|---|---|
| M1 | `src/components/fairway/pages/calendar/FairwayEventDetailDrawer.tsx` vs `src/components/golf/calendar/MobileEventSheet.tsx` (915 LOC, hand-rolled bottom sheet) | Two event-detail sheets for one event. The golf one is dead for golf but is still reached by baseball through `src/components/shared/calendar/PremiumCalendarClient.ts` (re-exports `@/components/golf/calendar/PremiumCalendarClient`). | Golf uses only the Fairway drawer (now a `Sheet material="frost"`). Leave `golf/calendar/**` alone in this lane: it is the baseball calendar. Moving it is a baseball task. |
| M2 | Event type presentation: `eventPresentation.ts` (TYPE_META), the drawer's own type map, `FairwayDayStrip.tsx` `TYPE_DOT_CLASS` | Three copies of the same colour/label/icon table drifted independently. | One table in `eventPresentation.ts`; the drawer and the strip import it (done in the calendar mobile pass). |
| M3 | Legacy `@/components/ui/drawer` (vaul, its own frost) inside Fairway: `pages/coachhelm/FairwayMyDevelopment.tsx`, `pages/rounds-new/FairwayCoursePicker.tsx`, and `app/golf/(dashboard)/dashboard/my-development/LogProgressButton.tsx` | A second bottom-sheet stack next to `fairway/overlays/Sheet`, with its own overlay z-index, blur and safe-area maths. | Migrate each to `Sheet` when its screen gets its mobile pass (rounds → CoursePicker; CoachHelm → MyDevelopment). Not touched by the calendar/dock PR. |
| M4 | Active-route matching: `FairwayBottomNav.tsx` had its own `matchActive` next to `app-shell/more-nav.ts` `matchActive` | Two segment-boundary matchers that could disagree on which tab lights up vs which row the More sheet marks current. | One matcher (`more-nav.ts`); the dock imports it (done). |
| M5 | Buttons in the shell: legacy `@/components/ui/button` in `FairwayBottomNav.tsx` (More) and `MoreSheetFooter.tsx` (Sign out) | The dock had four native controls and one legacy Button with a different haptic, focus ring and radius; Sign out rendered as a tinted pill. | Native `<button>` sharing the dock `control` class (More) and a quiet danger text row (Sign out). 21 legacy `@/components/ui/*` imports remain inside `src/components/fairway/**` outside `__tests__`; they move screen by screen. |
| M6 | Glass recipes on phone: `CalendarSurfaces.module.css:131` (`--cal-blur` 22px + saturate), `.lensLabel` (`:250`), `FairwayTopBar.tsx:79` (md-only), `FairwayShellSkeleton.tsx:156`, `.fw-glass-chrome` on the More sheet, `overlays/fairway-overlays.css:19` | Each sheet/bar blurred on its own terms, some while translating. | Only `.fw-frost` tiers, applied by the primitive (`Sheet material="frost"`, `GlassSurface`), and only on a settled panel. On the calendar phone screen the masthead and the sheet's in-body header are MATTE (bg-surface + hairline) — nothing that sits over a scrolling stage blurs; the More sheet drops `fw-glass-chrome` for `material="frost"`. |

### Hydration hazards (mobile surfaces)

Each renders server-side from `Date.now()` / `new Date()` / an undefined-locale `toLocale*`, so the server HTML and the first client render can disagree (a hydration warning at best, a text flash at worst).

| File:line | Pattern | Fix |
|---|---|---|
| `src/components/fairway/notifications/time-format.ts:7` (`relativeTimeFrom(iso, nowMs = Date.now())`), `:18`, `:24` (`toLocaleDateString(undefined, …)`) and its consumer `pages/notifications/NotificationRow.tsx` | Relative time and locale formatting computed during render. | Pass `now` from a `useEffect`-set state or `useSyncExternalStore` snapshot (the pattern `FairwayWhatsNew.tsx` already uses), and pin the locale. |
| `src/components/fairway/pages/rounds/FairwayUnfinishedBanner.tsx:47` | `Date.now() - new Date(ts)` in render. | Same: compute after mount. Rounds mobile pass. |
| `src/components/fairway/pages/roster/roster-helpers.ts:35` (`isUserOnline`) | `Date.now()` in a helper called from render. | Take `nowMs` as an argument supplied by the client. Roster mobile pass. |
| `src/components/fairway/pages/coachhelm/FairwayEffectiveness.tsx:340` (and `:420/:463` `new Date()` inside effects, which are fine) | Relative "refreshed N s ago" computed in render. | Derive from `lastRefreshedAt` state in an interval effect. CoachHelm pass. |
| `pages/development/FairwayGoalCard.tsx:137`, `pages/development/GoalsSection.tsx:231` | Date arithmetic in render. | Same. Development is the peer's screen; listed here because the cards render inside sheets on phone. |

### Dead code and drift (mobile)

| Item | Evidence | Decision |
|---|---|---|
| `Sheet` keyboard lift | `overlays/ModalShell.tsx:51` and the drawer use `--keyboard-height`; only `CapacitorProvider` publishes it. In a mobile browser the value is always 0px and the sheet footer sits under the software keyboard. | Keep (it is correct in the Capacitor build). For PWA/browser, the block CTA relies on `interactive-widget=resizes-content`; noted, not changed. |
| `--fw-mobile-nav-height` vs the real dock | Token said 70px + max(); the dock is 60px capsule + 10px padding + `pb-[calc(10px+safe-area)]` = 80px + safe area. Content under the dock lost 10px. | Fixed by the peer in 0d241b70b (`calc(80px + env(safe-area-inset-bottom, 0px))`, AppShell offset 80px). The calendar FAB uses the token, so it moved with it. |
| Calendar FAB `z-[19]` | `FairwayCalendar.tsx:1140`: an arbitrary z one below the dock. | `z-[var(--fw-z-sticky)]` (10): above the stage, below the dock (`--fw-z-nav` 20). |
| Availability overlay, Month on phone | `FairwayCalendar.tsx:1296` renders the compact month on phone, but the availability lens still lays out the desktop month grid inside it. | Behaviour gap, unchanged in this pass; a follow-up for the availability lens. |
| `motion.ts enterStyle` | No consumer found in `fairway/**`. | Peer's dead-code table decides; flagged. |
| Framer `layout` in the dock | `FairwayBottomNav.tsx:140–165`: `layout="position"` on five `li`/`span` pairs plus one `layoutId` pill. Five items, not a list — cheap, kept. The rule "no framer `layout` on long lists" is honoured: no `layout` prop remains anywhere in `pages/calendar/**`. | Keep. |

### Performance

Constraint (owner, relayed 2026-09-10): no `backdrop-filter` on a panel while it translates, frost only in the settled open state; no framer `layout` on long lists; no heavy trees mounted inside a sheet before it settles; `will-change` only on the moving panel; reduced motion respected.

How the calendar/dock pass meets it:

- `Sheet material="frost"` is the only blur on the More sheet and the event sheet. The `Sheet` primitive applies the frost class on the settled panel; during the vaul translate the panel is opaque matte.
- The event sheet mounts its header, response group and metadata immediately; people, files and attendance rows mount after the sheet's `onAnimationEnd` (the same gate `MoreNavSheet` uses for link prefetch).
- The More sheet's rows are `InsetGroup` seam rows (borders + background only); no per-row `transform` transition, no `layout`.
- `will-change` is not set by hand anywhere in the pass; vaul sets `transform` on the panel only.
- Reduced motion: the dock pill and sheets read `useReducedMotion`; the date rail scrolls without smooth-scroll under `prefers-reduced-motion: reduce`.

Measurements: NOT YET TAKEN. The probe exists (a Playwright page at 393×852, 4× CPU throttle, an in-page `requestAnimationFrame` recorder counting frames > 16.7 / 33 / 50 ms in the 600 ms after the tap, three runs, for (a) the More sheet from the dock and (b) the calendar event sheet, signing in the same way `scripts/ui-intelligence/capture-golf-facelift.mjs` does). This session's permission classifier refused to run it, and the machine was swapping (11 of 12 GB) under two worktrees' type-checks, which would have made the numbers meaningless anyway. Owner action: run it once on a quiet machine against a dev server serving this branch and paste the two lines here; the expected signal is zero frames > 50 ms during the open translate now that no blur applies mid-animation and People/Files mount after the sheet settles.

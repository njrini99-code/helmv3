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

Legacy stragglers being migrated: 12 `ui/button` + 6 `ui/input` imports inside Fairway pages, 3 `ui/confirm-dialog` → ModalShell, 6 `ui/skeleton` loading screens → Fairway Skeleton, `command/glass-surface.tsx` → GlassSurface, ChartTooltip hardcoded blur/rgb → tokens.

## Performance

User-reported: a data-heavy coach account is slow and laggy, the message and calendar drawers stutter, and every tab tap reloads the page.

| # | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Every bottom-nav / sidebar tab switch refetches the page and repaints the loading skeleton, even bouncing between two tabs | `next.config.mjs` set no `experimental.staleTimes`; Next 16 defaults `dynamic` to 0, and the dashboard layout is fully dynamic (cookies), so the client router cache never kept a visited tab. Dev mode also disables `<Link prefetch>`, so the dev server shows the worst case. | `staleTimes: { dynamic: 60, static: 300 }` — a visited tab is served from the router cache for the hop back; server actions that `revalidatePath` and `router.refresh()` still purge it. Shell links keep `prefetch`. |
| 2 | Every sheet stutters on open, close and drag | `overlays/Sheet.tsx` puts the frost material (38px blur) on the very node vaul transforms, so the GPU resamples the blur every frame | split: transformed wrapper without blur, static inner child carries the material (perf-shared) |
| 3 | Every blocking modal stutters the same way | `overlays/ModalShell.tsx` animates the `motion.div` that carries `fw-glass-strong` | same split (perf-shared) |
| 4 | Sticky in-drawer headers re-blur on every scroll frame on phones | `.fw-glass-chrome` on sticky headers inside scrolling sheet bodies (event drawer, message thread, calendar hero, 7+ more) has no mobile downshift | mobile downshift + a no-blur `.fw-frost-static` for scrolling sticky headers; drawer/hero headers switch to it (perf-shared + helmv3-20) |
| 5 | A data-heavy coach's calendar rebuilds on any team event write | `use-calendar-range-events.ts` realtime handler ignores the payload and does `router.refresh()` + a full range refetch, and every refetched row gets a new identity | patch the single changed id from the payload; full refetch only on reconnect-after-gap (perf-shared) |
| 6 | Each incoming message tears down the reactions channel and refetches every reaction | `FairwayMessages.tsx` rebuilds the message-id array each render → `use-message-reactions.ts` re-keys, re-subscribes and refetches in 100-id chunks | stable id key; separate subscribe (conversation id) from refetch (messages-perf) |
| 7 | Event drawer content pops in three times | `getEventRSVP` is called twice per open (calendar + EventPeopleSection) plus the itinerary fetch, each resolving on its own schedule | thread `summary.attendees` down; mount people/files after the open animation (helmv3-20) |
| 8 | Thread pane does 2×N×R work per render | `summarizeReactions` runs twice per message per render, each a full scan of every reaction | one `useMemo` Map by message id (messages-perf) |
| 9 | Eight shell consumers re-render every 45s forever | `notification-badge-context.tsx` sets a fresh `[]` for unseen announcements each poll; the 2-3 poll actions are awaited sequentially | module-level empty constant + bail-out updater; `Promise.allSettled` (perf-shared) |
| 10 | Agenda re-renders every card every minute | `FairwayAgendaView.tsx` owns the minute clock and an unmemoized bucket filter; nothing under pages/calendar is memoized | isolate the tick in a NowLineHost child; memoize buckets; memo the row (helmv3-20) |
| 11 | Permanent compositor layers, blur surfaces without hints | `will-change: transform` unscoped on `.surface-tile-hover`; `.animate-*` never clear it | scope to hover/focus; clear on animation end (perf-shared) |
| 12 | 200 message rows re-render on any pane state change | `MessageThreadPane.tsx` renders every message inline with no memo boundary | extract a memoized MessageRow; consider windowing (messages-perf) |
| 13 | Group participants refetch on any inbox change | `FairwayMessages.tsx` effect depends on the whole `conversations` array | depend on the selected conversation id (messages-perf) |
| 14 | Conversation rail re-splits on every keystroke | `MessageConversationRail.tsx` triage split is plain consts | `useMemo` (messages-perf) |
| 15 | Round review skeleton for 45s+ on a scorecard-only round | `rounds/[id]/review/page.tsx` awaits `getRoundReview` then `getPlayerStandingForReview` sequentially in one try block and clears `loadingStoredReview` only in `finally`, so the review sits behind the season-standing read; a round with no stored review also pays a full LLM round-trip from the auto-generate effect under the same skeleton | clear the loading flag when the review resolves and apply standing separately; show auto-generation as its own state (review-page) |

Ruled out: framer `layout`/`layoutId` in calendar and messages (none), images (avatars only), calendar range refetch on pan (correctly gated). Runtime measurement (Playwright + CDP harness at `scripts/ui-intelligence/.perf-measure.tmp.mjs`) is deferred until the machine is quiet; the ranking above is by mechanism and blast radius.

Tooling note: `cn()` (tailwind-merge) does not treat the custom `rounded-card` / `rounded-fw-*` radius tokens as one mergeable group, so a caller cannot strip a radius by passing another radius class; border, background and padding do merge.

## Mobile

(helmv3-20)

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

Legacy stragglers being migrated: 12 `ui/button` + 6 `ui/input` imports inside Fairway pages, 3 `ui/confirm-dialog` → ModalShell, 6 `ui/skeleton` loading screens → Fairway Skeleton, `command/glass-surface.tsx` → GlassSurface, ChartTooltip hardcoded blur/rgb → tokens.

## Performance

User-reported: a data-heavy coach account is slow and laggy, the message and calendar drawers stutter, and every tab tap reloads the page.

| # | Symptom | Cause | Fix |
| --- | --- | --- | --- |
| 1 | Every bottom-nav / sidebar tab switch refetches the page and repaints the loading skeleton, even bouncing between two tabs | `next.config.mjs` set no `experimental.staleTimes`; Next 16 defaults `dynamic` to 0, and the dashboard layout is fully dynamic (cookies), so the client router cache never kept a visited tab. Dev mode also disables `<Link prefetch>`, so the dev server shows the worst case. | `staleTimes: { dynamic: 60, static: 300 }` — a visited tab is served from the router cache for the hop back; server actions that `revalidatePath` and `router.refresh()` still purge it. Shell links keep `prefetch`. |
| 2 | Sheets and drawers (messages, calendar event sheet) stutter while opening | ranked list from the perf audit report (pending) | see report |
| 3 | Round review shows a skeleton for 45s+ on a scorecard-only round | pending | pending |

## Mobile

(helmv3-20)

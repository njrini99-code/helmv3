<!-- markdownlint-disable MD013 -->
# Facelift audit — competing surfaces, hydration, dead code

Owner sections: helmv3-7f writes Competing surfaces, Hydration, Dead code; helmv3-20 writes Mobile.
Evidence: `ui-intelligence/facelift/` captures (2026-09-10) and the read-only audits in this branch's session.

## Competing surfaces (from the captures)

| # | Surfaces | What overlaps | Decision |
|---|---|---|---|
| 1 | `/dashboard` (coach home), `/intelligence` (CoachHelm brief), `/development` | All three open with "Welcome back, Nick", team KPIs, "who needs attention", trend. `/development` repeats the roster health header ("Who needs your attention", "Did the coaching land?", the 4 numbers) verbatim from `/roster`. | Home = operations (today, attention board, pulse, rounds, activity). Intelligence = CoachHelm cockpit (Spine + signals workspace). Development = the players/focus-areas board only; its welcome, pulse and "bleeding strokes" sections are removed (they live in the cockpit). Roster keeps the health header. |
| 2 | `/coachhelm` for a coach | Renders a locked card ("This CoachHelm dashboard is the player view… Open Brief"). A dead end reachable from the dock's sparkle icon on some routes. | Coach requests to `/coachhelm` redirect to `/intelligence` server-side; no lock card. |
| 3 | `/stats` for a coach | Locked card ("Personal stats belong to a player profile… Team Stats"). | Coach requests redirect to `/stats/team`. |
| 4 | `/analytics/coachhelm` | Redirects to `/intelligence` already; the route folder is a shim. | Keep the redirect, delete the page body if it is only a redirect (dead-code audit confirms). |
| 5 | Round detail `/rounds/[id]` vs `/rounds/[id]/review` | Detail shows a "Final score" card + prose + "Open full review" twice (top pill and bottom card) and empty Front/Back and GIR/FW/Putts cards with dashes when no hole data exists. Review is the CoachHelm analysis. | Detail = the scorecard/story (Filmstrip when hole data exists; otherwise score + one InlineNotice "No hole data — enter holes to unlock the review"), ONE "Open full review" action. Review keeps its own layout. |
| 6 | Glass recipes | Six bespoke backdrop-filter recipes (see competing.md from the audit) plus `.fw-glass-chrome`. | One recipe: `.fw-frost` tiers. `.fw-glass-chrome` becomes an alias of `fw-frost fw-frost-subtle` and is migrated by consumers over time. |
| 7 | Buttons | `src/components/ui/button` (legacy) still used inside Fairway pages (FairwayBottomNav More column, others per audit). | Fairway `Button`/`IconButton` only in Fairway pages; the legacy import list is in competing.md. |
| 8 | Card units | `FairwayPlayerCard` (roster), qualifier cards, task cards, focus-area cards, "NEEDS MORE ROUNDS" cards | Boards and seam rows per the screen specs; the card files stay until their last consumer moves. |

## Hydration

Filled from the hydration audit (scratchpad/audit/hydration.md) once verified; each row = file:line · pattern · risk · fix.

## Dead code

Filled from the dead-code audit (scratchpad/audit/dead-code.md); each row = path · reason · LOC · verified-by.

## Mobile

(helmv3-20)

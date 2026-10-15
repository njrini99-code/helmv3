# INC-2026-10-15: Clubhouse Ask page passed a function to a client component

- Feature: `coachhelm_ai`
- Surface: Clubhouse `/golf/dashboard/coachhelm` (new chat Home), Sentry JAVASCRIPT-NEXTJS-158
- Status: FIXED on branch `agent/health-20261015-0054` (136a75dbc); awaiting merge and deploy.
- Risk: R1. Data shape for one page. No schema, RLS, grant or data change.
- Signal: Sentry -158 `Functions cannot be passed directly to Client Components ... {id: "brief", text: ..., title: ..., sub: function sub}`, 7 events 2026-10-01 → 2026-10-14 13:23Z, all with `flag.golf_clubhouse_ui: true` (the latest on a preview deploy of ecd16beea). Production has the Clubhouse off (#2188), so no production user saw it; it would ship with the flag.

## What was wrong

`buildAskSuggestions` (`src/clubhouse/data/coachhelm-chat-shape.ts`) returned `sub: (team) => string`. The suggestions are built on the server and handed to the client Ask Home as props, and React Server Components cannot serialize a function, so the page render threw.

## Fix

`ChAskSuggestion.sub` is a string with a `{team}` token (`ASK_TEAM_TOKEN`); `askSuggestionSub` fills it in `screens/coachhelm/chat/Home.tsx`.

Regression test: `src/clubhouse/__tests__/coachhelm-ask-shape.test.ts` ("is plain data that can cross the server/client boundary"; fails on ecd16beea). Replay: `replay/manifests/ask-suggestion-function-prop-2026-10-15.yml`.

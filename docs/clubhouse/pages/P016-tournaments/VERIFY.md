# P016 — Tournaments: verification

## Current verification status

```text
Status:    wired behind golf_tournaments_v1 (off); held migrations 1 to 3
           written, none applied; five views still placeholders
Commit/PR: branch claude/tournaments-wired (no PR, not pushed)
Date:      2026-10-25
```

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `screens/tournaments/__tests__/views.test.tsx` | CH-16201, CH-16401 | pass |
| `screens/tournaments/__tests__/use-changed-wash.test.tsx` | CH-16601 | pass |
| `preview/__tests__/fixtures-tournaments.test.ts` | Oakmont 287, 286, 285 (858, −6); e32 6 count 5 | pass |
| `ui/__tests__/delta-chip.test.tsx`, `trust-chip.test.tsx` | CH-16801 | pass |
| `__tests__/tournaments-wired.test.tsx` | CH-16302 to CH-16305, the nav and every page with the flag off | pass |
| `data/__tests__/tournaments-shape.test.ts` | rows to the fixture's numbers (Oakmont 858, −6; Dogwood 6 count 5) | pass |
| `data/__tests__/tournaments.test.ts` | missing table is not set up; a player's loader reads no lineup | pass |
| `app/golf/actions/__tests__/tournaments.test.ts` | refusal codes (off, not_coach, stale, round_order, not_set_up) | pass |
| `supabase/tests/rls/golf_tournaments_rpcs.sql` | held migration 3 | 16 of 16 on a scratch Postgres with a pgTAP shim; not run through `test:rls` |

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never
committed) and travel in the PR description; this table is the committed record
of them. One row per file; the label is the file's basename, named by
`npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`).
Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |
| `P016__enter-holes__coach__1440__bad-cell__after__d2b1386.png` | after | d2b1386 | enter-holes (coach), 1440px, bad-cell; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__enter-holes__coach__1440__empty-round__after__d2b1386.png` | after | d2b1386 | enter-holes (coach), 1440px, empty-round; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__enter-holes__coach__1440__typed-front-nine__after__d2b1386.png` | after | d2b1386 | enter-holes (coach), 1440px, typed-front-nine; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__event-desk__coach__1440__holes-tab-enter-holes__after__d2b1386.png` | after | d2b1386 | event-desk (coach), 1440px, holes-tab-enter-holes; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__event-desk__coach__1440__import-results-head__after__d2b1386.png` | after | d2b1386 | event-desk (coach), 1440px, import-results-head; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__event-desk__coach__402__live-no-scores__after__d2b1386.png` | after | d2b1386 | event-desk (coach), 402px, live-no-scores; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__event-desk__coach__402__no-scores-import__after__d2b1386.png` | after | d2b1386 | event-desk (coach), 402px, no-scores-import; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__import-results__coach__1440__check-field__after__d2b1386.png` | after | d2b1386 | import-results (coach), 1440px, check-field; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture with a Golf Genius style round 1 CSV, 61 players, 12 teams |
| `P016__import-results__coach__1440__check-players__after__d2b1386.png` | after | d2b1386 | import-results (coach), 1440px, check-players; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture with a Golf Genius style round 1 CSV, 61 players, 12 teams |
| `P016__import-results__coach__1440__choose-file__after__d2b1386.png` | after | d2b1386 | import-results (coach), 1440px, choose-file; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__import-results__coach__402__check-full-sheet__after__d2b1386.png` | after | d2b1386 | import-results (coach), 402px, check-full-sheet; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture with a Golf Genius style round 1 CSV, 61 players, 12 teams |
| `P016__import-results__coach__402__check-players__after__d2b1386.png` | after | d2b1386 | import-results (coach), 402px, check-players; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture with a Golf Genius style round 1 CSV, 61 players, 12 teams |
| `P016__import-results__coach__402__choose-file__after__d2b1386.png` | after | d2b1386 | import-results (coach), 402px, choose-file; /clubhouse-preview/tournament-desk?event=e34&state=live, synthetic preview fixture |
| `P016__event-desk__coach__1440__who-counted-exported__after__6e3fc1f.png` | after | 6e3fc1f | event-desk (coach), 1440px, who-counted-exported; preview |
| `P016__event-desk__coach__402__who-counted-export__after__6e3fc1f.png` | after | 6e3fc1f | event-desk (coach), 402px, who-counted-export; preview |

## Open verification gaps

- The only screenshots logged here are the results import and the hole grid
  (launch readiness F-01, 15 Nov 2026), taken in Chromium from the preview
  fixture (tier C, `.claude/rules/browsers.md`): the cloud container has no
  WebKit. A WebKit pass (tier W) at the iPhone 17 Pro preset, and one save of a
  real Golf Genius export against the staging tables, are still to do.
- The other views have no logged screenshots yet.
- The routes have not been opened in a browser (no browser runs in the wiring
  pass), and nothing has run against real tournament tables: the migrations are
  held.

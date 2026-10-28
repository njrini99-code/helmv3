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
| `screens/tournaments/__tests__/views.test.tsx` | CH-16201, CH-16301, CH-16401 | pass |
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
| `P016__tournament-desk__coach__390x844__light-one-back__after__2faf3cf.png` | after | 2faf3cf | tournament-desk (coach), 390x844px, light-one-back |
| `P016__tournament-desk__coach__390x844__light-r432-s0__before__a9d2b19.png` | before | a9d2b19 | tournament-desk (coach), 390x844px, light-r432-s0; /clubhouse-preview/tournament-desk; synthetic preview |
| `P016__tournament-review__coach__390x844__light-one-back__after__2faf3cf.png` | after | 2faf3cf | tournament-review (coach), 390x844px, light-one-back |
| `P016__tournament-review__coach__390x844__light-r440-s0__before__a9d2b19.png` | before | a9d2b19 | tournament-review (coach), 390x844px, light-r440-s0; /clubhouse-preview/tournament-review; synthetic preview |
| `P016__tournament-history__coach__390x844__light-across-seasons__after__2faf3cf.png` | after | 2faf3cf | tournament-history (coach), 390x844px, light-across-seasons |
| `P016__tournament-history__coach__390x844__light-r448-s0__before__a9d2b19.png` | before | a9d2b19 | tournament-history (coach), 390x844px, light-r448-s0; /clubhouse-preview/tournament-history; synthetic preview |
| `P016__tournament-history__coach__1280x900__light-trend-key__after__2faf3cf.png` | after | 2faf3cf | tournament-history (coach), 1280x900px, light-trend-key |
| `P016__tournament-history__coach__1280x900__light-r448-s0__before__a9d2b19.png` | before | a9d2b19 | tournament-history (coach), 1280x900px, light-r448-s0; /clubhouse-preview/tournament-history; synthetic preview |

## Open verification gaps

- No screenshots yet: the base renders placeholders; each lane shoots its views
  (the integrator runs the shots).
- The routes have not been opened in a browser (no browser runs in the wiring
  pass), and nothing has run against real tournament tables: the migrations are
  held.

# P016 — Tournaments: verification

## Current verification status

```text
Status:    the base only; no view is built and nothing is wired
Commit/PR: branch claude/tournaments-build (no PR)
Date:      2026-10-23
```

## Automated tests

| Test | Contract | Result |
|---|---|---|
| `screens/tournaments/__tests__/views.test.tsx` | CH-16201, CH-16301, CH-16401 | pass |
| `screens/tournaments/__tests__/use-changed-wash.test.tsx` | CH-16601 | pass |
| `preview/__tests__/fixtures-tournaments.test.ts` | Oakmont 287, 286, 285 (858, −6); e32 6 count 5 | pass |
| `ui/__tests__/delta-chip.test.tsx`, `trust-chip.test.tsx` | CH-16801 | pass |

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this table is the committed record of them. One row per file; the label is the file's basename, named by `npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |

## Open verification gaps

- No screenshots yet: the base renders placeholders; each lane shoots its views (the integrator runs the shots).

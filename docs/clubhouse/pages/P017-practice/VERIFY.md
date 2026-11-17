# P017 — Practice: verification

## Current verification status

```text
Status:    partial. Unit and component tests exist (manifest implementation.tests);
           no real-iPhone pass; no print from Safari to paper or PDF
Commit/PR: registered in the docs PR that added this page
Date:      2026-11-17 (registration); the build was captured 10 to 13 Nov 2026
```

## Automated tests

The page's tests are listed in its manifest. The ones that force the catalog
rows: `src/clubhouse/__tests__/practice-screens.test.tsx` (CH-13080 to CH-13084,
CH-13180, CH-13181, CH-13395 to CH-13397, CH-13580 to CH-13582, CH-13895,
CH-13896), `practice-part-failed.test.tsx` (CH-13286) and the screens'
`section-boundaries.test.tsx` (CH-13204). This registration changed no code and
ran none of them.

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never
committed) and travel in the PR description; this table is the committed record
of them. One row per file; the label is the file's basename, named by
`npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`).
Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |

## Open verification gaps

- The 10 to 11 Nov captures (GAP.md) were never filed with `clubhouse:shots`, so
  this log has no rows; none are invented.
- Not captured or not done: a print from Safari to paper or its own PDF; "Save
  as PDF" file never opened; a real-iPhone pass; the owner's review.

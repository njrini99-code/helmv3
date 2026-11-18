# 2026-11-17 — silent errors (data loaders)

## 2026-11-17 — CoachHelm and Practice loaders report what they swallowed

```text
Design package: none (owner: "just fix the errors", 17 Nov 2026)
PR/commit:      branch agent/ch-silent-errors-data
Contract IDs:   none
Actions:        none
Data impact:    none (reporting only)
Held items:     none
```

### Changed

- The Player file's failures (`coachhelm-file.ts`) now go through chLogServer,
  so they carry ui=clubhouse (they were logged untagged); a failed drill title
  read and a failed coach-name read are reported.
- Ask: a thrown "what CoachHelm knows" read and a weekly allowance that did not
  read (the page already said it failed) are reported.
- Deep dive (player and coach) and Standing: a feed that came back empty while
  reads the feed could draw are visible was already shown as failed; it is now
  reported too.
- Practice home, builder and plan: every read that turned into the page's
  "didn't load" is reported (team, roster, plans, practices, live plans); the
  builder's helper lines, live version, coach names and folder, and the plan
  sheet's coach names, opens and own lines report a failed read and keep their
  fallback.
- Practice library: every failed read is reported. Groups: a failed membership
  read used to come back as an empty roster (nobody to put in a group); it is
  now the Groups page's own "didn't load", as a failed groups read already was.

### Why

- A read that failed without reporting left nothing in Sentry or error_logs, so
  a broken read could only be found by a coach or player noticing. Every such
  spot in the loaders now reports through the existing pipeline, tagged
  ui=clubhouse (chLogServer surfaces coachhelm, coachhelm.file, coachhelm.ask,
  practice, practice.home, practice.builder, practice.plan, practice.library).

### Verification

- `npm run typecheck:fast`, `npx eslint` on the changed files, and the vitest
  files that import them.
- `src/clubhouse/data/__tests__/practice-library-groups-failed.test.ts`: a
  failed membership read is `failed`, reported, never an empty roster.

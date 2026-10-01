# P015 — Auth: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate checklist is
`docs/clubhouse/screens/auth.md`.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse (draft PR #2102)
Date:       2026-09-30
```

## Automated tests

| Test | Result |
| --- | --- |
| `auth.test.tsx`, `auth-logic.test.ts`, `auth-server.test.tsx`, `auth-scene.test.tsx` (sign in and the welcome) | pass |
| `auth-credentials.test.ts` (Q-98: the server's wrong-password text reads as the design's, attempts kept) | pass |
| `onboard.test.tsx` (20 cases: codes, the staff path, the account, after the account, request access, arriving) and `onboard-logic.test.ts` (15) | pass |
| `handoff.test.tsx` (the curtain over the route change) | pass |
| `src/components/auth/golf-sign-in-form.test.tsx` and `src/test/auth` (today's form unchanged) | pass |

## Looked at

- Every sign-up step at 1440 and 390 wide in `/clubhouse-preview/onboard`, against the design's screenshots.
- The course at 6.4, 12.5, 18.6 and 22 o'clock (sunrise, midday, golden hour, night with the moon and stars).
- Sign in to the welcome, and the welcome to the dashboard, recorded as video and read at 10 and 30 frames a second
  (`/clubhouse-preview/auth?go=1`). Two defects found and fixed: the welcome's course faded in again at the route
  change (a blink), and the fold landed 8px off the dashboard's canvas with a flat green where the sidebar's gradient
  would appear; and the pause between the fold and the dashboard showed an empty page, now held by the curtain and
  lifted when the dashboard is drawn.

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never committed) and travel in the PR description; this table is the committed record of them. One row per file; the label is the file's basename, named by `npm run clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
|---|---|---|---|

## Open verification gaps

- The real sign in, sign up and onboarding against a real account: not run (one database, production).
- The phone hand-off on an iPhone (the owner's device pass).
- The member card flying into the sidebar (the design's step 5) is not built: the card fades with the pane.
- Reduced motion recorded on video: not yet (the tests cover the one-millisecond paths).
- `npm run build`: runs once before the push.

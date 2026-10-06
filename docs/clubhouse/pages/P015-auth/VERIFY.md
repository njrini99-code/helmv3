# P015 — Auth: verification

<!-- clubhouse:release-audit:start -->
## Current release evidence — 2026-10-06

Sign-in course scene, welcome, onboarding and dashboard handoff.

Check shortest phone heights, credential zoom/autocomplete, reduced-motion
camera and no blank handoff frames.

Fresh WebKit 26.6: `/clubhouse-preview/auth` at
375, 430 and 1280px; zero Axe A/AA violations and no horizontal document
overflow in these three fixture renders. The 430px full-page screenshot
was inspected and recorded below. This does not exercise every popup.
Clubhouse runtime suites: 117 files / 3,092 tests pass on this branch.
External action suites listed in WIRING are outside that count.

Additional WebKit base check: 320px also fits without horizontal overflow
and reports zero Axe violations. All 12 onboarding steps also pass
at 375/430px (667px height); credentials and writes were not submitted.

Current browser/test results: [all-page
audit](../../ALL_PAGE_AUDIT.md#p015-auth). Current status remains partial.
Physical Safari/iPhone, VoiceOver and durable authenticated writes remain
separate acceptance checks. Earlier verification status and gap sections below
are historical observations; use the current audit for release scope.
<!-- clubhouse:release-audit:end -->

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate
checklist is `docs/clubhouse/screens/auth.md`.

## Historical verification status

```text
Status:     partial
Commit/PR:  codex/clubhouse-design-fidelity (repair pass)
Date:       2026-10-01
```

October 1 WebKit repair checks: Sign in fits 375x568, 390x664 and 430x900
without document overflow; the responsive sheet leaves the submit button
visible. JavaScript-disabled rendering shows the actual course and form. The
preview Sign in flow opens onto the hole, shows the landing ball during the
welcome, then reaches player Home. Reduced-motion emulation produces a resting
camera without overflow. These are preview checks, not a real-account
authentication test.

## Automated tests

| Test | Result |
| --- | --- |
| `auth.test.tsx`, `auth-logic.test.ts`, `auth-server.test.tsx`, `auth-scene.test.tsx` (sign in and the welcome) | pass |
| `auth-credentials.test.ts` (Q-98: the server's wrong-password text reads as the design's, attempts kept) | pass |
| `onboard.test.tsx` (20 cases: codes, the staff path, the account, after the account, request access, arriving) and `onboard-logic.test.ts` (15) | pass |
| `handoff.test.tsx` (the curtain over the route change) | pass |
| `src/components/auth/golf-sign-in-form.test.tsx` and `src/test/auth` (today's form unchanged) | pass |

## Looked at

- Every sign-up step at 1440 and 390 wide in `/clubhouse-preview/onboard`,
  against the design's screenshots.
- The course at 6.4, 12.5, 18.6 and 22 o'clock (sunrise, midday, golden hour,
  night with the moon and stars).
- Sign in to the welcome, and the welcome to the dashboard, recorded as video
  and read at 10 and 30 frames a second
  (`/clubhouse-preview/auth?go=1`). Two defects found and fixed: the welcome's
  course faded in again at the route
  change (a blink), and the fold landed 8px off the dashboard's canvas with a
  flat green where the sidebar's gradient
  would appear; and the pause between the fold and the dashboard showed an empty
  page, now held by the curtain and
  lifted when the dashboard is drawn.

## Screenshots

Evidence log. The images stay in `.helm/screenshots/clubhouse/` (never
committed) and travel in the PR description; this table is the committed record
of them. One row per file; the label is the file's basename, named by `npm run
clubhouse:shots -- name` (convention: `.claude/rules/clubhouse.md`). Phase is
before, after, baseline or evidence.

| Label | Phase | Commit | What it shows |
| --- | --- | --- | --- |
| `P015__signin__none__390x664__ready__before__cbc1c0d.png` | before | `cbc1c0d` | Before: fixed352px artwork leaves only312px for the sign-in form. |
| `P015__signin__none__390x664__ready__after__cbc1c0d.png` | after | `cbc1c0d` | After: responsive art, readable form and hole-centred crop. |
| `P015__welcome__player__390x664__mid-animation__after__cbc1c0d.png` | after | `cbc1c0d` | After:1.6s into welcome, the ball lands at the visible hole. |
| `P015__signin__none__390x664__javascript-disabled__evidence__cbc1c0d.png` | evidence | `cbc1c0d` | Server paint: form and actual course still with JavaScript disabled. |
| `P015__release-audit__none__430x844__ready__evidence__8ee4060.png` | evidence | 8ee4060 | release-audit (none), 430x844px, ready |
| `P015__premium-audit__none__1280__case-025-webkit-reduce__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (none), 1280px, case-025-webkit-reduce; /clubhouse-preview/auth; synthetic preview |
| `P015__premium-audit__none__1280__case-165-chromium-normal__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (none), 1280px, case-165-chromium-normal; /clubhouse-preview/auth; synthetic preview |
| `P015__premium-audit__none__390__case-025-webkit-reduce__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (none), 390px, case-025-webkit-reduce; /clubhouse-preview/auth; synthetic preview |
| `P015__premium-audit__none__390__case-165-chromium-normal__evidence__648b8d9.png` | evidence | 648b8d9 | premium-audit (none), 390px, case-165-chromium-normal; /clubhouse-preview/auth; synthetic preview |

## Historical verification gaps

- The real sign in, sign up and onboarding against a real account: not run (one
  database, production).
- The phone hand-off on an iPhone (the owner's device pass).
- The member card flying into the sidebar (the design's step 5) is not built:
  the card fades with the pane.
- Reduced motion recorded on video: not yet (the tests cover the one-millisecond
  paths).
- `npm run build`: exit 0 in this repair pass; compilation, TypeScript and
  static-page generation completed, with the route table emitted.

## 2026-10-02 — Plugin interaction and accessibility verification

Auth/credentials/scene suites: 64 tests pass. The repeated-submit regression
first reproduced two requests and now verifies one request, plus retry after
refusal. WebKit Sign in at the phone viewport reports no Axe violations for
WCAG 2/2.1/2.2 A/AA tags, no document overflow, 16px credential fields and the
existing username/current-password autocomplete. Tab traverses both fields.
Reduced-motion welcome reports the camera at rest with an identity transform.
These are local previews, not real credentials or physical Safari timing.

## October 2 readability follow-up

Fresh WebKit screenshots cover sunrise at 375, 390 and 430px, and noon, sunset
and night at 390px. The heading has no blur and the document has no horizontal
overflow. The updated veil and floating updates card were visually inspected.
The focused auth suites passed 90 tests. These are local browser checks;
physical iPhone Safari and real account authentication remain separate checks.

## Premium audit matrix — 2026-10-06

30 synthetic captures are recorded for this page family. The table above
keeps representative viewport/browser evidence; the complete state/opener
ledger and review limitations are in the
[premium audit](../../PREMIUM_AUDIT.md) and its machine evidence file.
Captured states are not all visually approved.

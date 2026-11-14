# Clubhouse audit, 13 Nov 2026

Page-by-page audit of Clubhouse, both roles, graded on a Vercel preview of `main`
with staging data. The data is in [`audit/2026-11-13/`](audit/2026-11-13/):
`scorecard.json`, `findings.jsonl` (worst first), `writes.md`, and `numbers/`
(every figure checked against staging SQL). Screenshots, traces and raw
measurements stay outside git, in `~/helm-audit-runs/2026-11-13-main-9e7c86b/`.

## Result

- **Phone B (82.7), desktop B (83.3), overall B (82.9).** Home is the low page
  (C+ on both surfaces). Every other family sits at B or B-.
- **26 findings:** 1 S1, 12 S2, 10 S3, 3 S4. 9 are marked `blocks-flip`.
- **Grades come from measurements only.** No design critic was calibrated (see
  "Critic"). Motion is graded C everywhere except where a trace says more,
  because there was no device run.

Worst three:

1. **F-0001 (S1)** Home ignores trips that have no linked calendar event. On a
   travel day both roles see "No events scheduled", and the player is told "A
   good day to play a round", while Team Hub shows the team on the road.
2. **F-0002 (S2)** Home's Team scoring "This season" pill shows each player's
   last 10 rounds, reaching back to May: 75.6 where Roster's true season average
   is 73.4. (Stats prints the same 75.6 under its "10" window, labelled as such.)
3. **F-0003 (S2)** A round's stored total (78, +6) is a stroke off its holes
   and nines (79, +7) on 15 of the team's 93 rounds with full holes. The review,
   Rounds, Home and Stats print 79. Round setup's course summary prints the stale
   78, and in code Qualifiers and two CoachHelm reads still use the stored total.
   (Corrected after the fix pass: the first version said the lists read 78.)

Nothing is S0. The S1 and the wrong-number S2s (F-0002, F-0003, F-0005) are the
ones to land before the next production deploy, since every Clubhouse flag is on
in production.

## The graded build

| | |
| --- | --- |
| Preview | https://helmv3-i966d6x7b-nick-rinis-projects.vercel.app (preview only; Vercel SSO) |
| Commit | `8c6e5f84d2` (PR #2512). Its app code equals `main` `9e7c86bfd9`: only a test file differs under `src/`. |
| Data | Staging `ybmwektreyrwjscxlogv` (PROSP DATA), team Demo University Golf, America/New_York, season from 1 Aug 2026 |
| Flags | Deployment target preview. The 31 `golf_clubhouse_*` and `coachhelm_*` flags in the yml preview column match the registry compiled into the graded commit (0 mismatches); Clubhouse renders for both roles. |
| Accounts | Demo coach (head coach) and the audit test player (0 rounds). Signed in with `scripts/clubhouse/audit/session.mjs` (added in PR #2512), no password. |

## How it was run

- **Lanes:**
  - **Phone:** Playwright WebKit, iPhone 17 Pro (402), light and dark, Reduce
    Motion off and on, plus a 375 overflow scan.
  - **Desktop:** Chromium at 1440 × 932 (light and dark), plus a WebKit pass at
    1440.
- **Measurements:** per page, role and variant, the kit's probes ran: layout
  scan, painted contrast, non-text contrast, the animations at rest, LCP, axe and
  IBM Equal Access.
- **Press pass:** every visible button was pressed up to its first write
  (Nick: view-only), recording what opened, whether focus moved in and came back,
  dead controls, errors and requests.
- **Numbers:** each page's headline figures were cross-checked against staging
  SQL using the app's own definitions.
- **Motion:**
  - Chromium traces of nine sidebar section switches at 1× and 4× CPU.
  - On the phone, the census of the bell sheet with Reduce Motion off and on.
- **Staging only, without the audit hook:** the audit ran in an ordinary session,
  so the `HELM_AUDIT` hook wasn't active. Instead, every browser context carried
  the staging guard (blocking production), and SQL went only to the staging
  project.
- **Teammate:** one teammate graded Roster, Classes, Tournaments, Settings,
  Practice and Recruiting from the saved measurements and staging SQL, with no
  browser. Its 4 findings are merged here.

## Grades

| Page | Phone | Desktop |
| --- | --- | --- |
| Shell & navigation | B (83.9) | B (84) |
| Home | C+ (77) | C+ (77) |
| CoachHelm | B (83) | B (83.7) |
| Rounds & round review | B (82.6) | B (83.5) |
| Stats (team) | B- (81.9) | B (83.7) |
| Stats (player) | B (83.5) | B (84) |
| Messages | B (83.5) | B (84) |
| Calendar | B (83.5) | B (84) |
| Team Hub | B (83.5) | B (84) |
| Qualifiers | B (83.5) | B (84) |
| Roster | B (82.5) | B (83.6) |
| Classes | B (83.5) | B (84) |
| Tournaments | B (83.5) | B (84) |
| Settings | B (83.5) | B (84) |
| Practice | B (83.5) | B (84) |
| Recruiting | B (83.5) | B (84) |
| Sign-in | B (83.5) | B (85.1) |

**Method** (the audit kit's `01-RUBRIC.md` weights and caps; the kit lives outside the repo in `~/clubhouse-audit/`):

- **Starting points:**
  - a dimension with measured evidence starts at B+;
  - speed starts at B (WebKit-lab LCP, not the 4× iPhone profile);
  - motion is C (no device run; the Chromium traces confirm the cap).
- **Findings:** the worst finding in a dimension sets it to that severity's
  anchor.
- **Screen caps:** one S1 gives C+, any S2 gives B, any S3 gives A-.
- **Overall:** phone 65 %, desktop 35 %, weighted by how much each page is used.

Pages with no finding of their own still sit at B. That's because two findings
reach nearly every page (F-0011 accessible names, F-0014 phone text size), and motion
has no device evidence.

## What is good

- **Team Hub on desktop** is the strongest screen: the trip card, the next seven
  days and the "Waiting on" table. Its amber numbers measure 5.9:1 on real
  pixels.
- **The sign-in page** reaches its largest paint in 0.3–0.6 s, with no contrast
  or axe failures.
- **The phone bell sheet** animates transform and opacity only. Under Reduce
  Motion it becomes 180 ms fades, as MO-10 asks.
- **Most numbers agree with staging:**
  - Home's queue counts, Roster's averages and handicaps, Recruiting's pipeline,
    Practice and Tournaments;
  - the last-10 scoring average (75.6) agrees between Home and Stats.
  - The ones that don't are F-0002, F-0003, F-0005 and F-0022.
- **Writes on open:** opening desktop Messages didn't mark the thread read,
  which is WRITES-ON-OPEN's promise. No paid AI call was made.

## Critic

**Not calibrated; measurements only (Nick, 13 Nov).** Two reasons:

- All twelve owner grades were already in the grader's context, so a held-out
  agreement score would be contaminated.
- The only player who can sign in has no rounds, so player screens can't match
  the graded ones.

## Not covered

- **Real Safari (tier S) on signed-in pages:** Nick chose not to put the Vercel
  bypass secret into a tool call. Signed-out sign-in was covered in WebKit.
- **Real iPhone (tier D)** and the hand test (the kit's `03-DEVICE-MATRIX` §5): no iPhone
  was connected. This is the next step.
- **WebKit census of route switches:** the WebKit renderer crashed under the
  probe's census on the second switch. Chromium traces cover the same switches.
- **Accounts that don't exist on staging:** assistant coach, dual-role and
  teamless.
- **Player data:** the five demo players with rounds have broken Auth rows on
  staging, and two more use personal addresses. So the player was graded on
  empty states.

## Writes

[`audit/2026-11-13/writes.md`](audit/2026-11-13/writes.md) lists every non-GET
request and the end-of-run SQL. Two rows were marked read (the team-channel
thread, opened on the phone) and one row recorded the player's travel-seen time.
There were no LLM calls, no round updates, no new error logs, and no table
outside WRITES-ON-OPEN (`docs/clubhouse/audit/WRITES-ON-OPEN.md`, PR #2512) changed.

## For the next run

The harness false positives found here, so the next grader doesn't re-chase
them:

- screen-reader-only text reads as "clipped", and the skip link as a small
  target;
- the search input is 20 px tall, but its `<label>` is the hit area;
- non-text contrast misreads dark chrome;
- painted contrast misreads text cut by the viewport edge, and thin bold digits
  (anti-aliasing);
- axe and IBM misread today's date circle (a pseudo-element), and elements
  caught mid-fade;
- table column dividers and the calendar's "Now" line read as accent rails;
- console noise from Vercel's toolbar and SSO.

A press pass that runs long leaves state behind, so retest any click timeout on
its own.

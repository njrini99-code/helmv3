# Mobile native-feel audit: 8 September 2026

Baseline: `90bdc44ce94986de55db23bbbf24762ac7eb8631`.

Three parallel audits covered navigation and shared motion, responsive forms,
and information hierarchy. The issue list was established before fixes began.
Twelve production routes were audited at 320px and 390px with touch input,
then replayed against the local production build. Top and bottom safe areas
were simulated at 47px and 34px. Neither pass produced document-wide
horizontal overflow or browser page errors. Element containment and control
size were checked separately from document overflow.

## Issue register

### M01 (P1)

Busy/disabled Fairway link-style buttons can still activate

Baseline evidence: `controls/button.tsx` drops disabled behavior in its
asChild path; needs interaction regression

Status: Fixed. Three interaction regressions now pass: disabled/busy links
block navigation and child actions; enabled keyboard activation returns.

### M02 (P2)

Stats loses 32px of useful width to duplicate side gutters

Baseline evidence: Live 390px screen begins at x 32, versus CoachHelm x 16;
PlayerStats and CoachHelmShell both add padding

Status: Fixed. Browser and E2E confirm one 16px gutter at 320px and 390px.

### M03 (P2)

The active Rounds tab truncates to “Rou…” on a 320px phone

Baseline evidence: `rounds-320.png`; weighted flex does not reserve the
selected label’s intrinsic width

Status: Fixed. Browser E2E confirms the full active label and all navigation
controls fit at 320px with 44px minimum targets.

### M04 (P2)

Dashboard day switcher crowds a date into three lines

Baseline evidence: `dashboard-320.png`; date, reset and two arrows compete in
one row

Status: Fixed. Date and reset action use separate lines; phone screenshots
confirm readable date and arrow controls.

### M05 (P2)

Dashboard day targets shrink to about 34px

Baseline evidence: `baseline.json`; seven flex cells inside a padded schedule
card

Status: Fixed. Day cells reserve 44px and scroll horizontally; selection
remains visible after selection and resize.

### M06 (P2)

Calendar day targets shrink to 27px and the top card consumes most of the
phone

Baseline evidence: `calendar-320.png`; fixed seven-column grid inside nested
padding, 98px-tall pills

Status: Fixed. Compact calendar hero and 44px day cells verified in phone
screenshots and selected-day E2E.

### M07 (P2)

Player roster is edge-to-edge with oversized cards and a separate action row

Baseline evidence: `roster-390.png`; route passes uncontained roster; about
175px per teammate

Status: Fixed. Roster uses 16px gutters and compact identity/action rows;
browser screenshots confirm fit at both widths.

### M08 (P2)

Stats round picker is 34px tall and has a 256px minimum width

Baseline evidence: `baseline.json`; StatsSpineStage size=sm/min-width 16rem

Status: Fixed. Round filter fills available width with a 44px minimum height;
verified in browser.

### M09 (P2)

New players see competing primary round actions

Baseline evidence: PlayerDashboard renders header New round plus first-round
hero CTA

Status: Fixed. Cold-start regression confirms exactly one primary New round
action.

### M10 (P2)

Round distribution animates the widths of adjacent flex segments

Baseline evidence: FairwayRoundDetail animates every segment width with
stagger, relaying out the bar each frame

Status: Fixed in source. Segment widths remain stable while transform scale
animates; build validated. Physical frame pacing unmeasured.

### M11 (P2)

Shared Fairway tab controls have a 36px target on touch

Baseline evidence: controls/tabs.tsx lacks minimum touch height/hit slop

Status: Fixed in source. Shared tabs use a 44px minimum height for coarse
pointers; typecheck and build validated.

### M12 (P2)

Some announcement drawers omit home-indicator clearance

Baseline evidence: NewAnnouncementsModal uses bottom padding without the
inset; legacy drawer delegates that responsibility

Status: Fixed in source. One flexible scroll body and an inset-aware footer;
typecheck and integration review passed. The automatic unseen-announcement
sheet was not exercised with a qualifying player session.

### M13 (P1)

Empty and insufficient-data guidance initially renders invisible

Baseline evidence: Both server-render regressions fail on opacity 0 in
baseline

Status: Fixed. Both previously failing server-render regressions now prove
guidance starts visible.

### M15 (P2)

What-if result animates layout height without honoring reduced motion

Baseline evidence: WhatIfPanel result inside live DeepDiveDrill

Status: Fixed in source. Result uses opacity/translation instead of height and
honors reduced motion; typecheck and build validated.

### M16 (P1)

First Finish can show no feedback while completion chunks download

Baseline evidence: New-round dynamic imports lack the continue route's loading
fallbacks

Status: Fixed. Completion chunks show a non-blocking loading status. All 14
round hardening regressions pass; lifecycle review confirms summary close
animation and submit cleanup remain intact.

### M17 (P1)

Settings photo actions escape their card

Baseline evidence: 390px screenshot; avatar-upload non-wrapping nested rows

Status: Fixed. Photo actions wrap within the settings card; E2E verifies all
actions stay contained at 320px and 390px.

### M18 (P1)

Course and tee editor footers omit home-indicator clearance

Baseline evidence: Both legacy drawer callers own bottom padding but omit the
inset

Status: Fixed. Both editor footers include the bottom safe area. Course and
tee actions verified above the simulated keyboard at 320px and 390px with 34px
bottom safe area.

### M19 (P1)

Tee editor's fixed 78vh scroll body can defeat keyboard-aware parent sizing

Baseline evidence: TeeFormDrawer nested body/footer within a shrinking outer
cap

Status: Fixed. Tee body flexes inside its keyboard-aware parent. Browser
confirmed one scroll body and reachable actions with and without a 300px
keyboard at both widths.

### M20 (P2)

Course detail photo/close controls are 32–36px targets

Baseline evidence: Raw hero buttons have no touch hit slop

Status: Fixed in source. Close/remove targets are 44px, photo actions at least
44px tall; course detail and avatar tests pass.

### M21 (P2)

Development and Standing repeat a large overview hero before the chosen
content

Baseline evidence: Live 320px drill content begins around y 516

Status: Fixed. Mobile drill views omit the duplicate overview hero;
Development E2E and Development/Standing browser screenshots verify content
priority.

### M22 (P2)

Team Hub's five-row task preview buries other team categories

Baseline evidence: Live 320px screenshot; also 20px header link target

Status: Fixed. Mobile previews three tasks with the full count and link
retained. Header and footer targets are at least 44px. Task regressions pass;
browser confirms compact preview.

### M23 (P2)

CoachHelm Log round action is 36px tall

Baseline evidence: Live 320/390px measurement

Status: Fixed. CoachHelm Log round uses a 44px minimum height; component
regression and phone browser checks pass.

### M24 (P2)

Selecting a trip leaves mobile users above its newly opened detail

Baseline evidence: Normal select only changes state; deep-link path already
scrolls to detail

Status: Fixed. Trip selection scrolls to the revealed mobile detail and honors
reduced motion; travel regression tests pass.

### M25 (P2)

Team Info spends 40px between sections on small phones

Baseline evidence: Live 320px announcements pushed below coach block and large
gap

Status: Fixed. Mobile section spacing reduced to 24px while desktop retains
40px; Team Info regression and screenshots pass.

## Excluded findings

M14 is a dormant GoalCreationModal, outside the current Development flow. The
live route uses FocusAreaModal. No unused-component redesign is included.

A motion-feature chunk failure was not established for round completion; the
app shell already supplies its features. M16 is the separate missing dynamic-
import loading fallback.

Hub subnav targets include invisible hit slop. Their 38px visible height alone
is not evidence of an undersized target.

## Verification

- Production build: compilation, TypeScript and all 179 routes completed.
- Standalone typecheck and documentation consistency checks passed.
- Focused component regressions cover controls, first paint, calendar,
  dashboard, CoachHelm hierarchy, team actions, travel and round completion.
- Five browser regressions passed: two new mobile layout cases plus three
  existing messaging, navigation and keyboard cases.
- Twelve routes at two phone widths passed containment/page-error checks.
- Course and tee footers cleared the simulated 300px keyboard and 34px
  bottom safe area at both widths; tee retained exactly one body scroller.
- Independent integration review found no concrete introduced regressions.

Physical iPhone keyboard behavior and frame pacing remain unmeasured. The
automatic player announcement notification sheet received source review only.
No production customer records are changed by this audit. No database schema
or authorization change is included.

Artifacts: `helm-mobile-audit` in the local 8 September Codex documents
folder, including baseline/after screenshots, geometry JSON and form results.

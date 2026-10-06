# Clubhouse premium UI/UX audit

Date: 2026-10-06. Source baseline: `648b8d9` with the working-tree playground
and audit changes.

**Verdict: the product has a distinct, capable visual foundation, but is not yet
certified against the owner's full premium release bar.** The biggest observed
defects concern composition and attention, not a shortage of depth effects.
No broad P0 design defect was established. P1 composition defects remain in
team/player desktop statistics, CoachHelm's secondary pulse and Recruiting's
pipeline. The focused keyboard and motion defects were repaired separately.

## Evidence and limits

- All 15 manifest families are inventoried. The development catalog indexes
  253 non-test TSX modules, 32 stylesheets and 35 contextual preview routes.
  Modules are not individual interactive states; provider/error helpers are
  explicitly distinguished from direct gallery examples.
- 383 synthetic route/state/opener/viewport renders completed: 333 Chromium
  with ordinary motion and 50 WebKit resting renders with reduced motion,
  at 390 and 1280 widths. Zero axe WCAG 2.1/2.2 AA findings and zero horizontal
  overflow in this matrix. Seven cold-render/opener attempts failed initially;
  those cases were rerun after compilation settled and passed. These delays
  do not establish production jank.
- Independent visual assessment reviewed the representative screenshot set
  referenced below. The 383 captures are **automated evidence, not 383 human
  visual approvals**. Each per-screen section distinguishes reviewed states
  from the wider captured matrix. Full manual hover/press/selected/error/zoom
  and assistive-technology acceptance remains open.
- A pinned Impeccable 4.1.0 source detector returned five warnings: two real
  layout-width transitions, two regex false positives and one approved spring
  exception. Its exit 2 indicates findings, not a failed application build.
- Current token values supersede the brief's old heavy-shadow excerpt:
  reading elevation is 1/2px contact plus 3/8px ambient depth. Do not restore
  broad decorative shadows or green rings rejected by the owner.
- Render role was adjudicated against the actual preview viewer. Some original
  screenshot names label `player` profiles by route name despite a coach
  shell, or label Classes as coach despite a player shell. The machine ledger
  contains corrected roles; filenames remain historical capture identifiers.
  `player?state=self` still has a fixture shell/content role mismatch.
- Real Mac Safari was opened and a long dialog/nested menu was exercised in
  Web Inspector. Native automation subsequently timed out while returning to
  Inspector: no exported trace or frame-time result is claimed. Recording stop
  could not be confirmed. Safari's Develop menu showed only the Mac target and
  simulators, with no physical iPhone target. Native phone, VoiceOver, haptics,
  real keyboard/safe-area changes and authenticated performance remain open.

Machine ledger:
[2026-10-06-premium-renders.json](evidence/2026-10-06-premium-renders.json).
Local screenshots and galleries: `.helm/screenshots/clubhouse/`. Independent
raw assessments and detailed geometry: `.helm/runtime/premium-audit/`.

## Ten repeated issues and their disposition

- **Priority — Pattern / evidence.** Correction: Semantic correction. Status:
  Status.
- **P1 — Equal-weight six-card team metric grid, stats.css .ch-fg__c.**
  Correction: One metric group, scoring/SG priority and quiet supporting
  figures. Status: Design proposal needed; preserve loading geometry.
- **P1 — Player profile identity block plus five desktop metric cards.**
  Correction: Compact identity/context; adapt the stronger phone metric strip.
  Status: Design proposal needed.
- **P1 — CoachHelm Program pulse precedes primary decision, coachhelm.css
  .ch-hl-pulse__slot.** Correction: Compact stable status rows/disclosure; bring
  decision into first viewport. Status: Design proposal needed.
- **P1 — Recruiting's broad pipeline precedes prospect work.** Correction:
  Compact stage/count summary with stable master/detail context. Status: Design
  proposal needed.
- **P1 — Generic Surface default/flat only, ui.css:379.** Correction: Explicit
  semantic roles and central quiet material ownership. Status: API proposal; no
  blanket restyling.
- **P1 — Keyboard alternatives clipped to 1px in Messages/Reorder.** Correction:
  Opt-in focus reveal, preserving ordinary assistive labels. Status: Repaired;
  source and focused browser evidence.
- **P2 — Reply quote and Game detail scroll ignore app Animations off.**
  Correction: Canonical useChReducedMotion for both OS/app preferences. Status:
  Repaired; live preference regression tests.
- **P2 — Local floating bars retain translucent blur outside shell fallback.**
  Correction: Role-specific opaque and reduced-transparency fallbacks. Status:
  Source-confirmed gap; rendered fallback/device verification open.
- **P2 — Repeated titles/role badges and decorative icon/avatar treatment.**
  Correction: Shared header/metadata composition; keep useful identification.
  Status: Per-screen proposals; do not erase useful grouping.
- **P2 — Preview identity/date inconsistencies and hidden state gaps.**
  Correction: Faithful role fixtures and explicit review coverage. Status:
  Recorded; not a production permissions finding.

Additional interaction finding: Messages reaction picker declares menu/menuitem
semantics without shared roving focus/arrow/Home/End behavior. Parent Escape
and outside-click dismissal exist. Reuse Menu behavior or choose plain-button
group semantics; runtime keyboard reproduction remains required.

Additional performance hypotheses: recruiting.css:691 upload progress and
rounds.css:1340 distribution bars transition width. Prefer a fixed intrinsic
bar with scaleX or immediate updates when meaning is preserved. Neither source
pattern is proof of measured Safari frame loss.

## Material inventory and governance

Run `npm run clubhouse:materials -- --output <file.json>` for every CSS/inline
material declaration, source line, media/selector context, page ownership,
nearby
comments, heuristic depth role and classification. `--summary` emits counts.
The current inventory has 5,527 rows (5,375 CSS and 152 inline), including
focus styling. The initial independent inventory had 5,518 rows.
Semantic references, token definitions, resets, circles/pills, focus marks, auth
SVG art, test fixtures and review candidates remain distinct. The initial 1,714
review candidates are not 1,714 design defects. Token expansion lists possible
override definitions, not a computed-style cascade.

Page owners should classify ordinary surface exceptions as migrate to semantic
role, retain with a documented purpose, or delete. Do not flatten circles, chart
marks, inset highlights, focus outlines or course illustration just to reduce
raw-value counts. Every visible composition still needs rendered judgment.

The new read-only `clubhouse-design-reviewer` has the owner's 15-category
rubric, role-specific ergonomics, semantic material map and evidence protocol.
The existing polish reviewer remains the primitive-specific companion. The
component catalog freshness check is wired into presentation CI. Stylelint
checks invalid hex, calc spacing and forbidden important keyframes alongside
existing rules. Existing CSS quality gates new outer blur shadows,
transition-all
and new layout transitions; radius/color inventories are review signals rather
than an unreviewed blanket ban.

## Scoring discipline

Scores below use all 15 named categories. **N/A means not sufficiently
verified**,
not a score of 3. Totals show only observed categories and cannot be compared
with the brief's 65/75 premium-release threshold. Visual contrast scores are
hierarchy judgments; automated WCAG results do not certify every translucent
background, chart alternative or focus path. Phone visual grades are emulated.

## Automated matrix coverage

| Family | Renders | Coach | Player | Auth/none | Explicit opener cases |
| --- | ---: | ---: | ---: | ---: | ---: |
| shell | 5 | 5 | 0 | 0 | 5 |
| home | 12 | 12 | 0 | 0 | 0 |
| roster | 17 | 17 | 0 | 0 | 5 |
| stats-team | 26 | 26 | 0 | 0 | 4 |
| stats-player | 28 | 28 | 0 | 0 | 12 |
| calendar | 24 | 20 | 4 | 0 | 0 |
| messages | 30 | 25 | 5 | 0 | 8 |
| settings | 18 | 16 | 2 | 0 | 0 |
| qualifiers | 63 | 49 | 14 | 0 | 5 |
| hub | 20 | 14 | 6 | 0 | 0 |
| rounds | 44 | 2 | 42 | 0 | 0 |
| classes | 14 | 0 | 14 | 0 | 0 |
| coachhelm | 24 | 14 | 10 | 0 | 0 |
| recruiting | 28 | 28 | 0 | 0 | 2 |
| auth | 30 | 0 | 0 | 30 | 0 |

## Per-screen visual audit

### P001: Shell / More sheet

Role: coach. Visually reviewed viewports: 390px.
Visually reviewed states: More sheet open.

**1. Primary user task:** Navigate to a secondary coach workflow.

**2. Visual hierarchy verdict:** Sheet title, grouped destinations and dismissal
are clear. Bottom chrome remains attached rather than detached.

**3. Material/depth map:** ["canvas","floating top/tab chrome","overlay More
sheet","reading grouped destinations"]

**4. Card/container audit:** Grouped destination surfaces are useful; repeating
icon tiles adds some ornament.

**5. Typography/data audit:** Labels readable; destination rows calmly scan.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: experiment with distinct floating tabbar geometry only after
  keyboard/safe-area evidence.
- P2: simplify repeated destination icon tiles when icon does not aid
  recognition.

**11. What must not change:** Native top-layer semantics; grouped destinations;
opaque/reduced transparency fallback; 44px close hit region including
pseudo-element.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/settings`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P001-shell/2026-10-06/P001__premium-audit__coach__390__case-001-chromium-normal__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | 4 |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 36/45; 6 categories unverified.

Limits: Shell review covers the More sheet screenshot, not a complete
desktop/navigation state matrix.

### P002: Coach Home

Role: coach. Visually reviewed viewports: 390, 1280px.
Visually reviewed states: default.

**1. Primary user task:** Identify today’s priorities and next team action.

**2. Visual hierarchy verdict:** Strong greeting, next event and agenda
hierarchy; desktop unified work region avoids separate metric tiles.

**3. Material/depth map:** ["branded canvas","event reading surface","agenda
reading group","inset scorecard","raised primary control"]

**4. Card/container audit:** Keep unified groups and open headings rather than
wrapping every agenda row.

**5. Typography/data audit:** Tabular scorecards and distinct supporting
metadata help scanning.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: remove unnecessary decorative icon treatments after comparing screenshots.

**11. What must not change:** phone-specific agenda; one next-event object;
quiet depth; readable score notation.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/home`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P002-home/2026-10-06/P002__premium-audit__coach__390__case-005-chromium-normal__evidence__648b8d9.png`
- Route: `/clubhouse-preview/home`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P002-home/2026-10-06/P002__premium-audit__coach__1280__case-001-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | 4 |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 36/45; 6 categories unverified.

### P003: Roster

Role: coach. Visually reviewed viewports: 390px.
Visually reviewed states: default, empty, failed, loading.

**1. Primary user task:** Find a player and understand their current trend.

**2. Visual hierarchy verdict:** Requests are visible, then sort control and one
grouped list. Good scan path.

**3. Material/depth map:** ["canvas","requests callout","raised sort","reading
grouped list"]

**4. Card/container audit:** One shared list is appropriate; avoid turning each
player row into its own elevated card.

**5. Typography/data audit:** Averages align; textual amber status supplements
trend color.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: repeated concentric avatar rim gives unselected rows unnecessary ornament.
- P2: combine duplicated error prose only when both reads fail; preserve partial
  errors.

**11. What must not change:** grouped rows; tabular average; trend plus textual
status; skeleton seven-row geometry.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/roster`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P003-roster/2026-10-06/P003__premium-audit__coach__390__case-010-chromium-normal__evidence__648b8d9.png`
- Route: `/clubhouse-preview/roster?state=empty`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P003-roster/2026-10-06/P003__premium-audit__coach__390__case-011-chromium-normal__evidence__648b8d9.png`
- Route: `/clubhouse-preview/roster?state=failed`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P003-roster/2026-10-06/P003__premium-audit__coach__390__case-012-chromium-normal__evidence__648b8d9.png`
- Route: `/clubhouse-preview/roster?state=loading`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P003-roster/2026-10-06/P003__premium-audit__coach__390__case-013-chromium-normal__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | 4 |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | 4 |

Observed-category subtotal: 40/50; 5 categories unverified.

### P004: Team stats

Role: coach. Visually reviewed viewports: 1280px.
Visually reviewed states: default.

**1. Primary user task:** Assess team performance and identify drivers.

**2. Visual hierarchy verdict:** Six equal elevated figures dominate before
explanations. Strongest card-soup finding.

**3. Material/depth map:** ["canvas","six reading metric cards","chart reading
surface","raised period switch"]

**4. Card/container audit:** Use one metric group with primary SG/scoring and
quieter supporting numbers. Preserve sample context and stable loading geometry.

**5. Typography/data audit:** Good numerics and direction-aware deltas; equal
metric sizing weakens priority.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P1: replace six isolated equal-weight cards with semantic metric composition.

**11. What must not change:** direction-aware deltas; provenance; chart
explanation; layout stability reserve.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/stats`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P004-stats-team/2026-10-06/P004__premium-audit__coach__1280__case-003-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 3 |
| Material/depth | 3 |
| Card discipline | 2 |
| Typography | 4 |
| Spacing/alignment | 3 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | N/A |
| Coach efficiency | 3 |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 26/40; 7 categories unverified.

### P005: Coach viewing player stats

Role: coach. Visually reviewed viewports: 390, 1280px.
Visually reviewed states: default.

**1. Primary user task:** Understand a player’s performance and act on a focus
area.

**2. Visual hierarchy verdict:** Desktop identity hero and five metric tiles
consume height before analytic content. Phone consolidates figures much more
successfully.

**3. Material/depth map:** ["canvas","identity reading surface","nested flat
metric region","reading metric cards","SG evidence surface"]

**4. Card/container audit:** Desktop can adopt phone’s grouped figures and a
smaller identity block.

**5. Typography/data audit:** Good numeric alignment; decorative striped banner
and oversized avatar draw attention unrelated to performance.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P1: reduce repeated metric-card composition in desktop player stats.
- P2: compact identity hero while preserving coach actions.

**11. What must not change:** phone consolidated metric strip; SG component
breakdown; message/schedule/focus actions.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/player`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P005-stats-player/2026-10-06/P005__premium-audit__player__390__case-004-webkit-reduce__evidence__648b8d9.png`
- Route: `/clubhouse-preview/player`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P005-stats-player/2026-10-06/P005__premium-audit__player__1280__case-004-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 3 |
| Material/depth | 3 |
| Card discipline | 3 |
| Typography | 4 |
| Spacing/alignment | 3 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | 3 |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 31/45; 6 categories unverified.

Limits: Capture filename role=player is misleading: actual rendered shell is
Maya coach with coach actions.

### P006: Calendar player day

Role: player. Visually reviewed viewports: 390px.
Visually reviewed states: default.

**1. Primary user task:** Understand today’s events and schedule conflicts.

**2. Visual hierarchy verdict:** Month/view controls and selected date lead into
clear timed objects. Class hatch stays quieter than real events.

**3. Material/depth map:** ["canvas","raised view/date controls","hatched
well/class region","event reading surfaces"]

**4. Card/container audit:** Event cards are coherent independent actionable
objects and are earned. Keep open page architecture.

**5. Typography/data audit:** Times remain readable; Now marker establishes
temporal context.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: review selected-day tactile/focus states interactively before release.

**11. What must not change:** open canvas; hatched busy distinction; Now marker;
readable times.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/calendar-player`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P006-calendar/2026-10-06/P006__premium-audit__player__390__case-006-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | N/A |
| Player simplicity | 4 |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 36/45; 6 categories unverified.

### P007: Messages player

Role: player. Visually reviewed viewports: 390px.
Visually reviewed states: thread default, Details pushed, draft typed, return to
chat.

**1. Primary user task:** Read team messages and draft a reply without losing
context.

**2. Visual hierarchy verdict:** Incoming/outgoing messages, header and composer
occupy clear separate roles.

**3. Material/depth map:** ["canvas","quiet incoming bubble surfaces","branded
outgoing bubble surfaces","raised composer","pushed Details screen"]

**4. Card/container audit:** Message bubbles are not generic dashboard cards.
Details member list stays grouped.

**5. Typography/data audit:** Body text readable; timestamps are subordinate.

**6. Interaction audit:** Typed Audit draft preserved, opened Details and
returned. AX textarea value retained; Send enabled after input. Details identity
fixture incorrectly shows coach member as current player.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: correct preview member identity before role-permission audit.

**11. What must not change:** draft retained through Details and Back; immersive
chat; bubble hierarchy; grouped members.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/messages-player`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P007-messages/2026-10-06/P007__premium-audit__player__390__case-008-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | 4 |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | N/A |
| Player simplicity | 4 |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | 3 |

Observed-category subtotal: 43/55; 4 categories unverified.

### P008: Settings

Role: coach. Visually reviewed viewports: 390, 1280px.
Visually reviewed states: default.

**1. Primary user task:** Change account/team preferences safely.

**2. Visual hierarchy verdict:** Phone identity/grouped destinations are quiet;
desktop category rail leads into independent editable groups.

**3. Material/depth map:** ["canvas","selected category control","reading form
groups","recessed fields","separate saved-action footer"]

**4. Card/container audit:** Independent profile/email/password sections justify
separate groups. Avoid a blanket remove-all-cards pass.

**5. Typography/data audit:** Labels clearly associated visually on desktop;
phone labels and metadata readable.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: audit disabled Save explanation and live validation interactively.
- P2: simplify icon tiles on phone where text alone identifies destination.

**11. What must not change:** independent save ownership; category rail; phone
disclosure pattern.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/settings`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P008-settings/2026-10-06/P008__premium-audit__coach__390__case-009-webkit-reduce__evidence__648b8d9.png`
- Route: `/clubhouse-preview/settings`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P008-settings/2026-10-06/P008__premium-audit__coach__1280__case-009-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | 4 |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 36/45; 6 categories unverified.

### P009: Qualifiers coach/player

Role: both. Visually reviewed viewports: 390, 1280px.
Visually reviewed states: default.

**1. Primary user task:** Run or follow a qualifier and understand selection
standing.

**2. Visual hierarchy verdict:** Featured live qualifier + inset leaderboard has
earned depth; other qualifier objects remain quieter.

**3. Material/depth map:** ["canvas","raised Create/filter controls","featured
reading qualifier","inset leaderboard","supporting reading qualifier"]

**4. Card/container audit:** One independent qualifier object plus evidence well
is appropriate; do not split leaderboard rows into cards.

**5. Typography/data audit:** Golf score notation and rounds-in count are clear.
Live fixture dates disagree with current simulated date.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: correct preview time/status coherence before certifying stale/live
  behavior.
- P2: audit create form default action validation and keyboard ownership.

**11. What must not change:** live leaderboard well; explicit entered/standing
information; one primary Create action.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/qualifiers`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P009-qualifiers/2026-10-06/P009__premium-audit__coach__390__case-010-webkit-reduce__evidence__648b8d9.png`
- Route: `/clubhouse-preview/qualifiers-player`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P009-qualifiers/2026-10-06/P009__premium-audit__player__1280__case-011-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | 4 |
| Player simplicity | 4 |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 40/50; 5 categories unverified.

### P010: Team Hub

Role: coach. Visually reviewed viewports: 390, 1280px.
Visually reviewed states: default.

**1. Primary user task:** Coordinate team commitments, announcements, travel and
tasks.

**2. Visual hierarchy verdict:** Desktop useful two-column structure; phone new
announcement/nav precede RSVP work and latest update.

**3. Material/depth map:** ["canvas","raised New announcement","flat tab
navigation","reading RSVP group","reading announcement","reading updates list"]

**4. Card/container audit:** Coherent objects justify grouping. Wide update/RSVP
containers should not accumulate nested cards.

**5. Typography/data audit:** RSVP bar accompanies text counts; dense desktop
metadata is small but generally subordinate.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: retain text equivalents for RSVP color segments and audit touch target
  states.
- P2: remove redundant Coach view badge if persistent shell already identifies
  role.

**11. What must not change:** RSVP textual counts; clear primary announcement;
cross-topic tabs; master summary structure.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/hub`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P010-hub/2026-10-06/P010__premium-audit__coach__390__case-015-webkit-reduce__evidence__648b8d9.png`
- Route: `/clubhouse-preview/hub`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P010-hub/2026-10-06/P010__premium-audit__coach__1280__case-015-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | 4 |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 36/45; 6 categories unverified.

### P011: Round setup and tracking

Role: player. Visually reviewed viewports: 390px.
Visually reviewed states: default.

**1. Primary user task:** Set up and record a round efficiently during play.

**2. Visual hierarchy verdict:** Tracking distance is unmistakable primary
figure; setup sequence clearly shows Course/Scorecard/Track.

**3. Material/depth map:** ["branded progression canvas","reading course/details
groups","spatial schematic content","raised result controls","floating bottom
action region"]

**4. Card/container audit:** Control groups are functional; large shadows around
small schematic/control objects deserve comparison, not wholesale material
flattening.

**5. Typography/data audit:** 381-yard numeric emphasis works; units separate
and result selection labels remain readable.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: verify bottom action reachability with actual keyboard and safe areas.
- P2: compare quiet schematic shadow and fewer nested control edges.

**11. What must not change:** distance hierarchy; explicit selected hole; step
continuity; visible disabled-action reason.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/setup`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P011-rounds/2026-10-06/P011__premium-audit__player__390__case-019-webkit-reduce__evidence__648b8d9.png`
- Route: `/clubhouse-preview/track`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P011-rounds/2026-10-06/P011__premium-audit__player__390__case-020-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 3 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | N/A |
| Player simplicity | 4 |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 35/45; 6 categories unverified.

Limits: Schematic preview is not live GPS/map/3D verification.

### P012: Classes

Role: player. Visually reviewed viewports: 390, 1280px.
Visually reviewed states: default.

**1. Primary user task:** Plan classes and recognize team schedule conflicts.

**2. Visual hierarchy verdict:** Desktop course objects have meaningful distinct
identity; phone adapts to Today/conflict list rather than compressing desktop
cards.

**3. Material/depth map:** ["canvas","branded semester context","course reading
objects","phone today rows","conflict reading group","inset overlap list"]

**4. Card/container audit:** Independent courses justify cards. Preserve
identity colors tied to course names rather than labeling all color as
arbitrary.

**5. Typography/data audit:** Course codes/names strong; desktop italic
instructor metadata is secondary.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: verify conflict duration and data correctness against actual schedule;
  screenshots alone cannot prove overlap.
- P2: quiet broad hero shadow if owner comparison favors it.

**11. What must not change:** phone Today adaptation; explicit conflict labels;
course identity; action placement.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/classes`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P012-classes/2026-10-06/P012__premium-audit__coach__390__case-021-webkit-reduce__evidence__648b8d9.png`
- Route: `/clubhouse-preview/classes`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P012-classes/2026-10-06/P012__premium-audit__coach__1280__case-021-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | N/A |
| Player simplicity | 4 |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 36/45; 6 categories unverified.

Limits: Capture filename role=coach is misleading: rendered shell is Jonah
player.

### P013: CoachHelm player

Role: player. Visually reviewed viewports: 390px.
Visually reviewed states: default.

**1. Primary user task:** Understand one useful focus and why it matters.

**2. Visual hierarchy verdict:** Settled phone chips then role/title introduce
one primary insight. Evidence is recessed and drill is a distinct branded
region.

**3. Material/depth map:** ["canvas","raised view chips","reading
focus","recessed evidence well","branded drill region"]

**4. Card/container audit:** Strong one-focus model. Redundant Player badge and
repeated title consume height before the task.

**5. Typography/data audit:** Evidence counts and confidence are explicit;
paragraph is long but supports trustworthy interpretation.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: simplify redundant role/title chrome on phone.
- P1 coach-only: compact pulse to keep decision actions visible.

**11. What must not change:** one focus; confidence/sample count; evidence
disclosure; phone chips.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/coachhelm-player`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P013-coachhelm/2026-10-06/P013__premium-audit__player__390__case-023-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 4 |
| Typography | 4 |
| Spacing/alignment | 3 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | N/A |
| Player simplicity | 4 |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 35/45; 6 categories unverified.

### P014: Recruiting

Role: coach. Visually reviewed viewports: 390, 1280px.
Visually reviewed states: default.

**1. Primary user task:** Scan prospects and maintain recruitment
status/context.

**2. Visual hierarchy verdict:** Desktop pipeline diagram dominates before
master/detail; phone adapts to compact counts and grouped prospects.

**3. Material/depth map:** ["canvas","pipeline reading surface","stage count
controls","master-list reading surface","detail reading surface","recessed
notes"]

**4. Card/container audit:** Master/detail is appropriate; pipeline can be a
compact flat group rather than tallest object.

**5. Typography/data audit:** Names/stages clear; list/detail context strong.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P1: compact desktop pipeline summary to prioritize selected prospect workflow.

**11. What must not change:** stable master/detail; selected row; visible status
label; phone grouped prospects.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/recruiting`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P014-recruiting/2026-10-06/P014__premium-audit__coach__390__case-024-webkit-reduce__evidence__648b8d9.png`
- Route: `/clubhouse-preview/recruiting`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P014-recruiting/2026-10-06/P014__premium-audit__coach__1280__case-024-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 3 |
| Material/depth | 4 |
| Card discipline | 3 |
| Typography | 4 |
| Spacing/alignment | 3 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | 3 |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 4 |
| State completeness | N/A |

Observed-category subtotal: 32/45; 6 categories unverified.

### P015: Auth sign-in

Role: both. Visually reviewed viewports: 390, 1280px.
Visually reviewed states: default.

**1. Primary user task:** Sign in to the correct role securely.

**2. Visual hierarchy verdict:** Distinctive course illustration and warm
integrated form plane strongly express GolfHelm.

**3. Material/depth map:** ["illustrated content canvas","warm form
plane/sheet","recessed input group","raised Sign in"]

**4. Card/container audit:** Avoid adding decorative cards to the form; current
integrated treatment is successful.

**5. Typography/data audit:** Phone filled email lacks persistent visible label;
password relies visually on placeholder. Desktop labels remain explicit.

**6. Interaction audit:** Resting states reviewed.
Hover/focus/press/disabled/loading/error interaction completeness not certified
from still images.

**7. Mobile/native audit:** Emulated viewport only. Physical-device keyboard,
gestures, safe-area dynamics and haptics remain unverified.

**8. Accessibility:** Visual readability review only; combine with root
automated axe results. Actual translucent contrast, VoiceOver and full keyboard
paths unverified.

**9. Performance/perceived latency:** No measured production frame/latency
finding from screenshots. Development compilation delays excluded from runtime
performance claims.

**10. Top fixes:**

- P2: consider persistent phone field labels; validate actual accessible names
  and autofill states.

**11. What must not change:** golf illustration; warm integrated sheet; clear
sign-in action; separate auth choreography.

Evidence (captured filenames, synthetic routes):

- Route: `/clubhouse-preview/auth`; width: 390px.
  Screenshot:
  `.helm/screenshots/clubhouse/P015-auth/2026-10-06/P015__premium-audit__none__390__case-025-webkit-reduce__evidence__648b8d9.png`
- Route: `/clubhouse-preview/auth`; width: 1280px.
  Screenshot:
  `.helm/screenshots/clubhouse/P015-auth/2026-10-06/P015__premium-audit__none__1280__case-025-webkit-reduce__evidence__648b8d9.png`

**12. Partial 15-category score:**

| Category | Score |
| --- | ---: |
| Hierarchy | 4 |
| Material/depth | 4 |
| Card discipline | 5 |
| Typography | 4 |
| Spacing/alignment | 4 |
| Contrast | 4 |
| Interaction states | N/A |
| Motion | N/A |
| Mobile-native feel | 4 |
| Coach efficiency | N/A |
| Player simplicity | N/A |
| Accessibility | N/A |
| Performance feel | N/A |
| Brand distinction | 5 |
| State completeness | N/A |

Observed-category subtotal: 34/40; 7 categories unverified.

## Additional coach/player variants

Player Home: reviewed at390px; branded canvas → next-event reading object →
countdown wells → raised Post a round → open week/day content. Keep the clear
primary action and quiet Message coach secondary. Calendar and qualifiers have
earned event/leaderboard objects; do not turn their open areas into card grids.

CoachHelm coach: desktop1280 review found pulse mass displacing Assign/Dismiss.
Keep the selected-player rail, primary decision surface and recessed evidence.
Settled player phone rendering is distinct from desktop SSR; the early cropped
desktop picker was not treated as a persistent phone layout defect.

Round history: its in-progress object and grouped round rows are meaningful.
The large empty in-progress region and double summary edges merit refinement,
while Continue at hole4, score notation and contextual score wells should stay.

Every additional preview route/state is listed in the machine ledger. Complete
manual visual/state approval for each variant remains a release task; no
unsupported per-route premium score is fabricated.

## Focused repair evidence

Before: Message actions and Move up/down could receive keyboard focus but their
container stayed width1px, clip rect(0,0,0,0), overflow hidden. Focus outlines
were present but clipped. Ordinary hidden labels were not the defect.

After: opt-in interactive alternatives reveal on keyboard focus. Replies and
desktop Game detail jumps respect both OS reduced motion and live Animations
off/on without reopening their view. Preserve ordinary smooth navigation when
enabled, session selection, draft content and the existing pointer UI.

Local focus geometry and screenshot records are under
`.helm/runtime/premium-audit/focus-before.json` and `focus-after.json`.
The initial Messages before screenshot contains the inbox/offscreen thread, so
it is not an identical-state visual comparison; the geometry is valid source/
focus evidence. Do not use it as a premium before/after approval.

## Release risks and prioritized next work

1. Shared semantic Surface API and approved composition prototypes: unified
   metrics, compact CoachHelm pulse, compact recruiting pipeline. Compare at
   identical data/viewport; maintain reserved geometry and role-specific
density.
2. Reaction picker keyboard parity and non-shell reduced-transparency fallback.
3. Actual iPhone keyboard, sheets, drag/scroll conflict, gesture alternatives,
   haptics, safe-area/navigation clearance and VoiceOver.
4. Authenticated local production-build profiling and repeatable Safari trace;
   the development capture matrix cannot certify real data latency or frame
pacing.
5. Complete manual meaningful-state review, enlarged text/zoom and rendered
   translucent/chart contrast. Screenshot baseline approval belongs to the
owner.

Detached bottom navigation, Vaul replacement, command palette and modern CSS
anchor/View Transition experiments remain proposals. They were not installed
or substituted for existing behavior because a trend is not a defect fix.
No production flag, database, deployment or release gate was changed.

## Research used

[Linear's March 2026
refresh](https://linear.app/now/behind-the-latest-design-refresh)
supports reducing secondary visual competition and using tools to compare
proposals. [Vercel interface guidelines](https://vercel.com/design/guidelines)
support visible focus, material/geometry precision, preserved scroll and clear
loading ownership. [Apple materials
guidance](https://developer.apple.com/design/human-interface-guidelines/materials)
is the content-versus-functional-material reference supplied in the brief;
its current documentation requires JavaScript in the research reader. None of
these sources supplies an exact production stylesheet for Clubhouse.

## Verification of this audit change

- Full presentation matrix: 139/140 passed on the first run (exit 1).
  The remaining Chromium 430x932 RecFormSheet case recorded a syntax error
  before fixture hydration. Its unchanged focused retry passed (exit 0).
  This is 140 cases exercised successfully across the two runs, not a clean
  first-pass matrix. Original failure trace and full output remain in local
  `.helm/runtime/premium-audit/quality-full-artifacts/` and logs.
- Four relevant unit suites: 158 tests passed, exit 0. They include live
  app/OS motion preference changes, proposal isolation/reset/export and
  development-only same-origin preview headers.
- TypeScript fast check, changed-file ESLint, 97 Clubhouse tooling tests,
  catalog freshness, CSS quality and knowledge checks passed, exit 0.
- Markdown ratchet passed with fewer violations; no baseline was raised.
  Screenshot naming/manifest check passed with scratch-artifact warnings.
- Native Safari reconnection also timed out on the final attempt. A stopped
  recording, exported profile, production frame timing, physical iPhone,
  VoiceOver and authenticated loading/recovery behavior remain unverified.

No production deployment, merge, feature-flag change or database mutation
was performed. The component workspace is a development-only review tool;
exported CSS proposals do not update production tokens automatically.

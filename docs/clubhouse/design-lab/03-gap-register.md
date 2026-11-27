# Gap and blind-spot register (Phase 3)

QUEUE row `dsx-01`, 27 Nov 2026, on `main` `dc904616`. Evidence tiers as in
[README.md](README.md). Details and file:line citations are in the five
inventory files; each row names its source section.

Severity: **B** blocking (wrong data, broken function, a11y failure, visible
defect), **1** system-level weakness that makes premium work impossible to
keep, **2** inconsistency that shows, **3** polish.

## Blocking (fix regardless of the redesign)

| Id | Finding | Tier | Source | Catching test |
| --- | --- | --- | --- | --- |
| GAP-B1 | Rolling-mean line on the Stats trend charts is unweighted (`stats/round-trend.ts` `meanSeries`), while the stated nines rule (`lib/stat-definitions.ts` `NINES_LINE`) counts a nine as half a round. A doubled nine plots at full size. The headline figure and the line can disagree after a nine. | V | D §7.1-7.2 | Unit test: a window with one nine gives the half-weighted mean the headline uses |
| GAP-B2 | Roster desktop table: the sorted "↑ Avg" header overlaps "Handicap" at 1280 | F | baseline shot `roster-1280-light` | Gate probe `cramped-text` on the roster header row |
| GAP-B3 | Undefined tokens with no fallback: `--ch-bubble-theirs-shadow` (`messages.css:3448`), `--ch-champagne-600` (`stats.css:4943`), `--ch-on-accent` (`messages.css:4128`, real token is `--ch-text-on-accent`) | V | A §1 | Static scan: every `var(--ch-*)` resolves or has a fallback |
| GAP-B4 | `scripts/clubhouse/check.mjs` header still says red marks under par, against the 15 Nov rule | V | E §6.17 | n/a, doc fix |
| GAP-B5 | `golf-critical-paths.spec.ts` still opens retired addresses | V | E §6.16 | n/a, retarget |

## System-level (severity 1)

| Id | Finding | Tier | Source |
| --- | --- | --- | --- |
| GAP-T1 | Type is two systems: 2,788 numeric-step `font:` uses against 834 role uses; 46 distinct sizes, 49 raw px sizes | V | A §8.1 |
| GAP-T2 | Roles carry no tracking, leading or numeric features: `tabular-nums` set by hand 502 times, `--ch-track-15` 508 times, `line-height` overridden 680 times | V | A §8.2 |
| GAP-T3 | Hierarchy is size plus semibold: 600 is the dominant weight, four sizes within 12 to 15 px, no truly quiet text tier. This is the "black text on ivory" feel | V + F | A §8.3 |
| GAP-S1 | "Three elevations" is a claim: 36 elevation tokens, 2,107 `box-shadow` declarations, 1,148 raw shadow layers | V | A §8.4 |
| GAP-S2 | Colour literal debt: 1,542 literals, 513 hex in page sheets; 106 light-only literal tokens with no dark twin | V | A §8.5 |
| GAP-S3 | Dark mode is a thinner second system: dark selected = elevated = secondary button fill; dark cards have no shadow; keyed on the Fairway-named `data-fw-theme` | V | A §8.9 |
| GAP-G1 | Spacing barely tokenised: 635 of 9,344 declarations; no 2 or 6 px token though used 1,339 and 935 times | V | A §8.6 |
| GAP-G2 | About 75 distinct breakpoint widths; the phone/desk media string pasted 349 times | V | A §8.7 |
| GAP-C1 | No single card architecture: `Surface` in 14 files against 35 `.ch-*-card` classes in 62 files; cards restyled through 513 flag-scoped selectors | V | B §9.1-9.2 |
| GAP-C2 | The green feature card is drawn five ways; `Surface variant="feature"` has no consumer; option F is per-area CSS, not a slot | V / I | B §9.3-9.4 |
| GAP-C3 | Right decisions sit in dead primitives: `Field`, `ChoiceGroup`, `Stepper`, `Truncate`, `ConfirmAction`, `DeltaChip` have 0 users; six local `Field`s | V | B §9.5 |
| GAP-C4 | Overlay logic forked: Bell, TeamSwitch, quick chat, Messages and Calendar own portal, focus and scroll lock; 12 hand-rolled menus; `Modal` (99 users) lacks the busy and dirty guards `FormSheet` has | V | B §9.7-9.8 |
| GAP-H1 | Nine page-header compositions plus about 30 local `*-head` classes; breadcrumbs resolved by label string | V | B §9.10-9.11 |
| GAP-A1 | 14 of 19 trend charts draw their own line; four path builders, seven tick generators, three scrub implementations with different thresholds | V | D §9.1, 9.12 |
| GAP-A2 | Sample size shown on 3 charts only; four charts grade or rank with no n | V | D §9.4 |
| GAP-A3 | Accessible alternative not systemic: `ChartTable` in 4 files; six charts pointer-only or label-only | V | D §9.7 |
| GAP-M1 | 552 uses of retiring motion tokens remain; 48 keyframes outside `motion.css`; 19 infinite animations | V | C §1 |
| GAP-M2 | Interruption is hand-rolled (61 sampled-spring curves, 44 `.cancel()`); `motion` ships `domMax` for 2 live `layout` props | V | C §3 |
| GAP-Q1 | No browser-level UI gate is a required check; pixel diff is advisory with baselines outside git | V | E §7.1-7.3 |
| GAP-Q2 | 42 of 60 preview keys have no gate, pixel or motion row: all Tournaments, Practice home, library, builder and print, Recruiting, Calendar, Qualifiers, Settings, Live | V | E §7.2 |
| GAP-Q3 | Phone proof is WebKit at a 390 x 844 viewport, not an iPhone profile (no touch, DPR, safe areas); signed-in write journeys run at 1280 only; only one spec uses touch emulation | V | E §7.6, C §5 |

## Inconsistencies that show (severity 2)

| Id | Finding | Tier | Source |
| --- | --- | --- | --- |
| GAP-C5 | Five toggle families still hand-built (look-07 list is mis-scoped: one is dead CSS, two are not toggles); no Tabs primitive, six hand-built tablists | V | B §9.6 |
| GAP-C6 | Six empty-state primitives and 70 skeleton classes; two opposing global rules for empty-page carding | V | B §9.15 |
| GAP-C7 | Rows: `GroupList` in 9 places against 36 local row classes; two `DataTable`s; 23 raw tables; no sticky column or mobile card alternative | V | B §9.13-9.14, D §9.20 |
| GAP-A4 | Gold carries four meanings (Tour tick, loss, below-baseline wash, qualifying line); DL defines loss as amber | V | D §9.8 |
| GAP-A5 | Gridline law (at most three, dashed) broken by the team trend's six solid lines; five reference-line styles; 11 legend class names, no tooltip component | V | D §9.9-9.11 |
| GAP-A6 | Formatter leaks: the same CoachHelm read prints 1 dp in one card and 2 dp in another | V | D §9.13 |
| GAP-A7 | Home's ScoreChart spaces by index, not date, and uses a curved line, against the one-line contract (Player Home is locked: Nick's call) | V | D §9.2 |
| GAP-K1 | Four keyboard-navigation implementations (two roving helpers, Menu's, Segmented's) | V | B §9.24 |
| GAP-F1 | 67 `outline: none` sites behind one global focus rule; nothing proves each has a ring | V | A §8.14 |
| GAP-Z1 | z-index mostly raw (121 numeric declarations, 45 on the ladder), no ratchet | V | A §8.11 |
| GAP-O1 | No opacity tokens; ten raw flavours; disabled is both a colour and an opacity | V | A §8.15 |
| GAP-R1 | Nested radius is not part of the language: a 12 px tile inside a 16 px card regardless of padding | V | A §8.16 |
| GAP-N1 | Four font faces load with `display: swap` and no verified fallback metrics; the width axis is used 132 times but undocumented | V | A §8.12 |
| GAP-N2 | Dynamic Type follows the iPhone Text Size upward only, on coarse pointers only; raw px text and px line heights never scale | V | A §8.13 |
| GAP-D1 | DESIGN_LANGUAGE prose contradicts itself and the tokens (desk title 30 vs 40, large title "never scales" vs "scales to 86%", stale line refs) | V | A §7 |
| GAP-P1 | 128 raw `env(safe-area-inset-*)` expressions, only 8 using left or right; no token | V | B §9.18, C §6 |
| GAP-P2 | Five overlapping keyboard mechanisms (Capacitor resize, `--keyboard-height`, 24 visualViewport uses, interactive-widget, per-sheet code) | V | C §8 |
| GAP-P3 | Sheets have one fixed detent, no snap points, no drag handoff from scrolled content | V | B §9.8, C §11 |
| GAP-P4 | 22 `:hover` rules not guarded by `(hover: hover)` | V | C §10 |
| GAP-P5 | Android is not locked to portrait and has no back-button handler; iOS is portrait iPhone only | V | C §7 |
| GAP-P6 | Possible contradiction: QUEUE pa-mot-08 says no blur over scrolling content, `shell.css:385` blurs the sticky top bar | V / needs device | C |

## Polish (severity 3)

| Id | Finding | Tier | Source |
| --- | --- | --- | --- |
| GAP-3a | KPI cards spend most of their height on space: the figure floats mid-card, the decorative icon top-right carries no meaning, the leader-rule caption floats outside the strip | F | roster and home shots |
| GAP-3b | Card-in-card nesting on coach Home desktop ("Waiting on you" tiles inside a card) doubles borders and radii | F | home shot |
| GAP-3c | Stats phone feature card: the two-line title wraps beside a long window label, so the header reads crowded | F | stats phone shot |
| GAP-3d | Catalog covers 22 of 74 shared files with an example and records no props, variants or states | V | B §9.20 |
| GAP-3e | 0.333 px hairline at 3 dppx, never checked on a device | V | A §8.18 |

## Blind spots: never tested anywhere in the repo

These have no check, fixture or recorded evidence. Each names the smallest
test that would cover it with tools already in the repo.

| Blind spot | Smallest test |
| --- | --- |
| Any WebKit, Safari or iPhone render of the current look (this pass included) | Mac run of `clubhouse:shots` on staging, iPhone 17 Pro preset and the device |
| Font-swap reflow (CLS) and fallback metrics | Playwright trace with cache disabled on Home; read layout-shift entries |
| Text Size XXL and below default on every page | Gate rows with `--ch-type-k` forced to 1.353 and 0.86 |
| Landscape phone (228 `max-height: 500px` rules, no test) | Gate row at 844 x 390 |
| Small phones 320 and 375, tablets, Android | `phone-audit` (exists, local only) wired into the quality config |
| Keyboard-visible states for every sheet and composer | Journeys phone project with `page.keyboard` focus on each field; WebKit visualViewport |
| Rapid repeated taps and interrupting a transition (push then Back mid-flight, open then dismiss a sheet mid-settle) | One motion spec per overlay: 5 taps in 300 ms, assert one overlay and focus home |
| Long sessions: memory and listener leaks after 50 navigations | Playwright loop with `performance.memory` and listener counts (Chromium-lab label) |
| Extreme values: 3-digit scores, +40 to par, 0 rounds, 1,000 rounds | Stress fixture exists (`preview/stress.ts`) for some screens; extend to Stats and Roster |
| Stale data and offline on each screen | `error-offline` exists only on Home; add the state to each gate row |
| Forced colours / Increase Contrast in dark | Gate row with `forcedColors: 'active'` |
| Focus restoration after every overlay and after a route change | Popup-lab covers shared popups; extend to forked overlays (Bell, TeamSwitch, quick chat) |
| Tooltip and popover collision at the viewport edge during resize | Popup-lab row at 320 wide with a resize mid-open |
| Chart receiving new data while being scrubbed | Component test: change `rounds` prop during a pointer drag |
| Per-interaction latency (INP) budgets | `quality-budgets.json` `requiredCases` is empty; fill for Home, Stats, Rounds |
| Analytics events fired by primary actions | Vitest capture-mock assertion per primary control |

## Family status (discovered to tested)

| Family | Status |
| --- | --- |
| Foundations (type, colour, surface, space) | compared |
| Card | compared |
| Header and navigation | compared |
| Overlays (sheet, modal, menu, popover, toast) | compared |
| Segmented and tabs | compared |
| Forms | discovered |
| Tables and rows | discovered |
| Charts | compared |
| Dashboards | discovered |
| Motion | compared |
| Mobile native | compared |
| Governance and tests | compared |

# UI/UX audit remediation — progress

Branch `fix/uiux-audit-0724`, based on `origin/main` @ `a27ceec0d`.
Findings source: `audit/product-audit/AUDIT-0724/` in the main checkout (86 findings).

Gates: **tsc 0**, **eslint 0 across every changed file**, **vitest green**
(re-run after any further edit — and always read `VITEST_EXIT`, not the
harness's reported exit code; see the lessons section).

> Worktree note: Turbopack rejects the symlinked `node_modules`
> (`Symlink [project]/node_modules is invalid`). Use `npx next dev --webpack -p 3007`.

---

## DONE + verified

### S1 — alpha modifiers on CSS-var tokens compiled to nothing (286 sites / 122 files)
`tailwind.config.ts` — added `tokenColor()`, which emits
`color-mix(in oklab, var(--x) calc(<alpha-value> * 100%), transparent)`. Applied to all
**47** bare-`var()` colour entries (59 keys incl. nested scales).

Proof — same probe markup compiled against both configs:
- before: 5 of 14 classes generated; every `/N` variant **absent**
- after: 14 of 14; un-modified classes resolve to `calc(var(--tw-bg-opacity,1) * 100%)` = 100%,
  i.e. byte-identical rendering to before.

### S2 — status fills used as text on their own wash
Audit found warning 2.08:1. Measuring all three found **danger 4.01:1 and success 2.83:1 fail
too** (audit missed both).

- `design-tokens.css`: added `--fw-color-danger-ink` + `--fw-color-success-ink` (light **and**
  dark), mirroring the existing `warning-ink`. Light-wash ratios: danger **7.27:1**,
  success **7.59:1**, warning **13.33:1**.
- `tailwind.config.ts`: registered `fw-danger-ink` / `fw-success-ink`.
- Codemod rewrote **67** pairings, only where text and wash share a variant prefix (so a bare
  `text-fw-danger` next to a `hover:bg-fw-danger-bg` is left alone). Decorative `dot:
  'bg-fw-danger'` correctly untouched.

### P-06 (CRITICAL) — standing chart contradicted its own verdict
`charts/StandingStrip.tsx` — rank markers by TRUE value before `clampPct`, so the stable sort
inside `layoutMarkerPositions` can no longer separate clamped ties in array order.

Verified live on `/golf/dashboard/my-standing`:
- `SG: Total` (you −4.44, team −5.02) was you 13% / team 22% → **now you 22% / team 13%**, You
  correctly to the right.
- `SG: Putting` (you genuinely behind) still draws You left — the two opposite relationships
  now render as different charts instead of pixel-identical ones.

### P-03 (CRITICAL) — two nav tabs lit on every route
`lib/golf/nav-registry.ts` — added `exact` to `hubToNavItem`, set on all four Dashboard/Home
items. Their href `/golf/dashboard` is a prefix of every other destination, so `startsWith`
lit Home everywhere. Verified: `/rounds` → `[Rounds | Rounds]`, `/team-hub` →
`[Team | Team Hub | Team Hub]` — Home no longer present. (Remaining duplicates are the desktop
rail and mobile bottom bar both correctly lit; only one is visible per breakpoint.)

### P-02 (CRITICAL) — 3px green outline around the whole page stage ≤1024px
`globals.css` — `*:focus-visible` scoped to real interactive elements; raw
`rgb(34 197 94 / 0.5)` → `var(--fw-color-border-focus)`; dropped the `border-radius: 4px`
that reshaped whatever it decorated.

### H1 — global rule broke every list-row link below 1024px
`globals.css` — dropped `li a` / `span a` from the touch-target rule (kept `.prose a`, `p a`).
Those matched card/list rows that happen to be anchors and forced `display:inline-block`.

### L-01 (CRITICAL) — hero copy clipped 20px off-screen at 320px
`minmax(320px, 1fr)` → `minmax(min(320px, 100%), 1fr)`, plus the same latent bug in
`FeatureSections` (300px), `AboutView` (300px), `LandingFooter` (180px).
Verified at 320: h1 right edge now **20px inside** the viewport (was 20px outside);
`documentElement.scrollWidth === 320`. Zero unguarded `minmax(Npx, 1fr)` left in `src`.

---

## DOES NOT REPRODUCE

### L-02 (CRITICAL as filed) — "sticky header is fully transparent"
`LandingHeader.tsx` already carries a scrim child that fades in past 40px of scroll. Measured
on the current build: scrim opacity **0 → 1** on scroll, wordmark contrast **15.3:1** both at
rest and scrolled, on `/`, `/products`, `/about`, `/pricing`.

The audit likely read `getComputedStyle(header).backgroundColor` — which is genuinely
transparent, because the paint lives on the child, not the header.

**Caveat — not fully cleared.** My band-detection kept resolving to the cream ancestor, so I
never actually measured the header parked over a *dark* band (`#coachhelm`, FinalCTA, footer)
at rest. The at-rest transparent window is only the top 40px of a page, where every marketing
route currently opens on cream. Re-check if a dark-topped route is ever added.

---

## ROUND 2 — 20 more findings closed

**C1 (CRITICAL)** `data-table.tsx` — `sm` → `lg` on both the table and mobileCard paths.
The breakpoint is a viewport measure while the constraint is the table's own box; the coach
shell's 260px rail ate the difference (508px of main at 768px, 249px of a 691px table clipped).

**P-04 (CRITICAL)** `GoalsSection.tsx` — new `focusAreaCount` prop; when areas exist the empty
state names the distinction instead of denying what is rendered directly below it. Wired from
`FairwayMyDevelopment` with `activeAreas.length` (not `total`, which folds in completed areas
and would state a number the reader cannot see).

**P-01 / P-14 / P-15 (CRITICAL + 2 HIGH)** `DayScheduleSwipe.tsx` — three changes:
lands on the next populated day instead of a blank today; a 7-day toolbar strip with
event dots gives the pager a map, fills the desktop void and carries arrow-key paging;
Calendar link 72x20 → **88x44**. Verified on mobile AND desktop: opens on "Thu, Jul 30 — 1
event", 7 chips at 56px, `hOverflow: 0`.

**H4** `SignalRow` truncate → 2-line clamp (was hiding ~2,500px of text per row).
**H5** Performance Trend empty state — window-aware copy + "Widen the window" via
`handleRangeChange` (not `setRange`; the range is also a URL re-fetch contract).
**H6** Team Pulse — pill suppressed when there is nothing to classify; count moved into the
empty-state copy where it reads as context, not a contradicting claim.
**H7** `Segmented` — scrolls the selected segment into view when the track overflows.
**H8 / P-09** `labelLines={2}` on all 7 coach and all 8 player MetricCards.
**H9** `DaySchedule` — fade derived from **measured** overflow (ResizeObserver) instead of a
strict row count that missed the exactly-5 case; scroller made keyboard-reachable.
**P-07** `PlayerSpine` chip row wraps below `lg` instead of hiding 48% of itself.
**P-10** `FocusAreaCard` — nested `<Button>` inside a `role="button"` card → non-interactive
chip (axe nested-interactive, 3 nodes).
**P-12** snapshot labels 8.8px → 11px floor, allowed to wrap.
**P-13** `InsightCard` — banned left-edge accent rail → the priority dot the system uses.
**L-03** header at 320: `min-w-0` + tighter gap + "Demo" under `sm` (the CTA was overpainting
the wordmark and capturing its clicks).
**L-05** `text-white` moved after `text-body` (twMerge was dropping it).
**L-07** footer mark → square logo (the lockup already contains the words).
**L-08** `/products` primary CTA → `accent700` (accent-600 is 4.23:1, fails AA).
**L-09** footer links → 44px hit areas via `-my-2 min-h-11 py-2`.

Lint clean on every file touched. Two justified `eslint-disable`s, both matching existing
repo precedent: `helm/no-raw-button` on the compact day cell, and
`jsx-a11y/no-noninteractive-tabindex` on the focusable scroll region (that rule directly
opposes axe's `scrollable-region-focusable`, which is the stronger requirement).

---

## ROUND 3 — P-11 + P-16

**P-11** — 13 primary list titles across the named surfaces (team-hub, my-qualifiers,
qualifiers, dashboard, documents, recruiting, announcements, roster, messages, team) moved from
single-line `truncate` to `line-clamp-2`. Scoped deliberately: only `<h3>/<h4>` titles and
`<p>` elements that are the row's identity (`font-fw-sans text-body|text-body-lg font-medium`).
**Player-name links keep `truncate`** — a name on one line is still a name, but a truncated
TITLE loses what the row IS. tsc clean after the sweep.

**P-16** — `/rounds` KPI band: `items-start` below `md`, `md:items-stretch` above. Grid items
stretch to the tallest cell by default, so the value-only tiles ("Rounds", "Best round") were
height-matched to their sparkline neighbours at ~270px holding one number — ~55% blank, under
a 300px ViewHeader. At md+ all five share one row where equal heights are correct, so stretch
is restored there.

---

## ROUND 4 — M1, M2, L-10, L-11

**M1** `FairwaySidebar.tsx` — initials took the first CHARACTER of each token, so the demo
coach "Coach (Demo)" rendered "C(" in the rail while the More sheet showed "CD" for the same
user. Now takes the first LETTER (`\p{L}`) of each word and drops punctuation-only tokens —
also fixes any name with a hyphen, middle initial or parenthetical.

**M2** `FairwayBottomNav.tsx` — badge cap was `>9 ? '9+'` while the rail used `>99 ? '99+'`,
so 10 unread read as "10" in one place and "9+" in the other. Both now cap at 99+.

**L-10** `LandingHeader.tsx` — the open mobile sheet had no Escape, no outside-click dismiss
and no scroll lock; the only way out was the hamburger. Added all three, with the toggle
excluded from the outside-click handler so it doesn't immediately undo its own toggle, and
`body.overflow` restored to its previous value rather than hard-set to `''`.

**L-11** — the sheet's "Log in" used `text-text-secondary`, reading as disabled beside the
full-strength rows above it. Now `text-text-primary`, and it closes the sheet on click like
every other row (it previously didn't).

---

## ROUND 5 — M8

**M8** `FairwayTasks.tsx:977` — the subtask progress bar carried a value but no accessible
NAME, so /tasks announced eight identical unnamed bars ("42%") with nothing tying each to its
task. Added `aria-label={`${task.title} — subtask progress`}` plus `aria-valuetext` so the
count the sighted label already shows ("3 of 7 subtasks completed") is what gets announced,
rather than a bare percentage.

Note for whoever continues: the enclosing scope is `FairwayTaskCard` and the field is
`task.title`, NOT a local `title` — I got that wrong first and only `tsc` would have caught
it. Check scope before templating an aria-label in this file.

---

## ROUND 6 — L-21, L-19

**L-21** — deleted `landing/Navigation.tsx` + `landing/MobileNav.tsx`. Verified orphaned
first: nothing imports `Navigation`, and `MobileNav` is imported ONLY by `Navigation`, so the
pair was a self-contained dead second nav system. `git rm`'d together.

**L-19** — `/golf/signup` had no back-to-home affordance while `/golf/login` did, so anyone
landing on signup from a shared link had no route back to the marketing site. Extracted the
login page's link into `src/app/golf/(auth)/AuthHomeLink.tsx` and wired it into signup.

GOTCHA: signup has **three** `return (` paths and TWO of them render the page container —
a "gate" render (~line 96) and the main render (~line 204), at different indentation. Both
now carry the link; an anchor-match on one indentation level silently covers only one.
The login page still has its own inline copy — swap it to `AuthHomeLink` when convenient
(left alone here to keep this change additive).

---

## ROUND 7 (2026-07-25) — batches A-D

**All 46 previously-open findings addressed.** 43 fixed, 3 verified as
NOT REPRODUCING (see below). See commits `08318f458` and `d34f008ac` for the
full per-finding write-up; the headlines:

**Two systemic bugs found while fixing symptoms.** `aria-label` on `<Select>`
was being spread onto `BaseSelect.Root` — a context provider with no DOM node —
so 30 call sites had written an accessible name that never reached the DOM
(L6). And `ui/Button` carried an empty `<span ref={rippleRef} />` that was both
dead code (the ripple is appended to the button itself) and a flex item under
`gap-2`, shifting every label 4px right of centre (L-12).

**Contrast is now measured, not asserted.** 186 `text-fw-{success,warning,
danger}` sites moved to their `-ink` counterparts; 11 cream-on-green surfaces
went accent-500 -> accent-700; opacity stacking on already-calibrated quiet
text was removed in four places. Zero bare status-token text uses remain.

### DOES NOT REPRODUCE (verified against current code, do not re-raise)
- **P-32** — the sheet Close button measures 36x36, but carries a
  `before:-inset-1.5` hit-slop giving a 48px tap target. The probe reads
  `getBoundingClientRect()`, which cannot see a pseudo-element. Same class of
  false positive as L-02.
- **L-13** — the landing mocks moved to `FitEmbed` (fit-to-width, no horizontal
  scroll), so the keyboard-unreachable scrollers no longer exist.
- **M9 (avatar tints)** — all 8 calendar member-rail tint pairs measure
  4.53-7.27:1. The rest of M9 went with H10 and the `calendar-surface` outside-
  day opacity fix.

## STILL OPEN — owner decisions, not defects

These are the ones that need Nick, not a class edit:

- **L-04 / L-06 / L-17** — the landing product mockups. `FitEmbed` scales a
  1280px surface into a 340px phone column, so the type lands at ~6px: the
  page's central proof is illegible on the device most first visits arrive on.
  The real fix is purpose-built phone-width mock compositions (or cropping to
  one legible card per section), which is design work, not a class tweak.
- **L-18** — `/pricing` shows no pricing. Deliberate per the file comment;
  filed as a conversion concern. Needs a product answer, not code.
- **L-20** — the auth pages' flat vector scenery vs the photographic landing.
  A direction call.
- **L1 / M6** — calendar mobile and the coach dashboard's mobile first screen
  both need recomposition rather than adjustment.
- **L3** — Fragment Mono's slashed zero in stat contexts. The audit's fix
  ("use display/sans with tabular-nums for stat numerals") would touch 536
  call sites and reverse an explicit design-system rule
  (`tailwind.config.ts`: "numbers stay on Fragment Mono"). Owner's call.

## H10 — RESOLVED (Nick approved 2026-07-24)

Primary CTA fill `accent-500` -> **`accent-700`**, hover/active -> `accent-800`, in both
`Button` and `IconButton` primary variants (`controls/button.tsx`). The two "Do NOT re-darken
this for WCAG" comments were replaced with the corrected reasoning.

Verified live on the coach dashboard: **"Add Player" now measures 5.82:1** on
`bg-accent-700` (was 3.00:1 on `bg-accent-500`).

The IconButton's own rationale was actually SOUND (a glyph is a UI component judged at 3:1 by
1.4.11, and 3.06:1 clears it) — it moved anyway so a primary IconButton beside a primary
Button isn't a different green.

The live sweep then caught the same defect at sites the audit never flagged:
- the dashboard skip link hard-coded its own `bg-accent-500` (3.00:1)
- **27 further `bg-accent-500 text-text-on-accent` pairings across 21 files** — all text on
  the light green, all 3.00:1. Swept to `accent-700`.

`accent-500` remains the brand green for decorative fills, strokes and dots.

---

## Superseded — the original H10 note

**H10 — primary CTA contrast. Deliberately NOT changed.**
`controls/button.tsx:66-74` carries an explicit instruction: *"Do NOT re-darken this to
accent-700 for WCAG — keep the brand green."* I left it alone rather than silently override a
documented brand decision.

But the stated justification is wrong on the facts, so it deserves a re-decision:
- White on `accent-500` measures **3.06:1**. WCAG needs 4.5:1 for normal text.
- The comment argues the label clears the 3:1 large-text bar. WCAG large text is ≥24px, or
  ≥18.66px **bold** — a 14–15px bold control label is **not** large text.
- 1.4.11 (3:1 non-text) covers the button's *boundary*, not the label on top of it.

Options: darken the fill to `accent-700` (white → **5.93:1**), keep `accent-500` and accept a
known AA failure on every primary CTA, or raise the label to ≥18.66px bold. `accent-600` does
**not** rescue it (4.23:1).

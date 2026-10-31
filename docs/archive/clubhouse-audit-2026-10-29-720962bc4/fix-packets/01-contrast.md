# Fix packet 01 · contrast

11 findings, 6 block the flag flip.

## F-0005 · S0 · blocks-flip · P005
**Section numbers on Stats and Round review fall under 3:1 in dark**

- Observed: span.ch-zn__n 14 px/700: phone dark p5 2.9:1 (Lc 55.7), desktop dark p5 3.05 (worst 2.94), 8 hits. Light passes. Graded on p5 per CT: under 3:1 is S0 by 06 §1.
- Expected: ≥ 4.5:1 in both themes.
- Fix: In dark use the light-on-green pairing for .ch-zn__n.
- Files: src/clubhouse/styles/*
- Evidence: ev/P004/stats__player-8091da4b-last-5-mba15-dark.png, p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0008
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-01; 06 §1 S0 'text under 3:1').

## F-0015 · S1 · blocks-flip · P005
**The count on the profile's Rounds tab reads at 4.2:1 in dark**

- Observed: span.ch-tab-t__n 12 px/600 4.17:1, Lc 50.1, coach player page and My stats.
- Expected: Lc 75 at rest and hover.
- Fix: Use the tab label ink for the count numeral in dark.
- Files: src/clubhouse/styles/controls.css
- Evidence: ev/P004/stats__player-8091da4b-tab-rounds-mba15-dark.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-07 [Nick]).

## F-0031 · S2 · after · P011
**Ghost hole numbers on the idle Rounds card and the empty setup scorecard are exposed as text at 1.9-2.8:1**

- Observed: Idle card 1-18 at p5 1.89-1.92 (72 hits); setup scorecard placeholder 1-9 (b 12 px/600) at 2.81 (18 hits). Both are decorative placeholders in the screenshots (ev/rounds/rounds-pro-light.png, ev/rounds/rounds_new-mba15-light.png), so S2 as decoration, not an AA failure.
- Expected: aria-hidden and not counted as text, or ≥ 4.5:1.
- Fix: aria-hidden on both placeholder grids (rounds.css idle card, setup scorecard empty state).
- Files: src/clubhouse/styles/rounds.css, src/clubhouse/screens/rounds/setup/*
- Evidence: ev/rounds/rounds-pro-light.png, ev/rounds/rounds_new-mba15-light.png, ev/states/rounds-idle.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-03 / AX-02 decorative text hidden).

## F-0035 · S2 · blocks-flip · P002
**The eyebrow and date ink sits just under 4.5:1 on desktop**

- Observed: Home date 4.33-4.43:1; Stats eyebrow 4.38; Rounds keys and review eyebrow 4.38-4.47; course em 4.24 dark / 4.36 light; Classes key 4.38; Tournaments keys 4.37-4.39. One token on one surface.
- Expected: ≥ 4.5:1 and Lc 60.
- Fix: Darken the eyebrow/meta ink token on the desktop paper background one step (aim ≥ 5:1).
- Files: src/clubhouse/styles/tokens.css
- Evidence: ev/P002/home-mba15-light.png, ev/P011/rounds-98daf97c-mba15-light.png, p2p3-lean/lean-coach/rows/P002.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-03 (WCAG AA 1.4.3)).

## F-0036 · S2 · after · P002
**The 'N' shortcut hint on New event reads at 3.5:1 in dark**

- Observed: kbd.ch-btn__kbd 11 px 3.49:1 dark; 3.99:1 on Calendar.
- Expected: ≥ 4.5:1.
- Fix: Raise the kbd glyph colour on primary buttons.
- Files: src/clubhouse/styles/controls.css
- Evidence: ev/P002/home-mba15-dark.png, p2p3-lean/lean-coach/rows/P006.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-03).

## F-0037 · S2 · after · P004
**Chart callouts ('Best', '−5.4') on team stats read at 2.6-3.4:1**

- Observed: 15 px/700 p5 3.43 (worst 2.6); 15 px/600 p5 4.48 (worst 2.94); same both themes.
- Expected: ≥ 4.5:1.
- Fix: Callout plate or halo in the chart surface colour, or full-strength ink.
- Files: src/clubhouse/screens/stats/*
- Evidence: ev/P004/stats-mba15-light.png, ev/P004/stats-mba15-dark.png
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-01 / CR-15).

## F-0039 · S2 · after · P006
**Inspector meta on the desktop calendar reads at 3.7-4.0:1 in dark**

- Observed: ch-in__nb 3.73:1, ch-in__at 4.03:1.
- Expected: ≥ 4.5:1.
- Fix: Dark meta token for the inspector.
- Files: src/clubhouse/styles/calendar.css
- Evidence: p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0018
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-03).

## F-0040 · S2 · blocks-flip · P009
**Counts and meta on the Qualifiers list read at 3.7-3.8:1 in dark**

- Observed: 13 px/600 at 3.71-3.78:1, qualifiers and my-qualifiers.
- Expected: ≥ 4.5:1.
- Fix: Dark meta token for filter counts and card meta.
- Files: n/a
- Evidence: ev/P009/qualifiers-pro-dark.png, p2p3-lean/lean-coach/rows/P009.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-03).

## F-0041 · S2 · blocks-flip · P001
**Body text passes WCAG but misses the Lc 75 floor in 59 dark and 27 light styles**

- Observed: Dark: b Lc 62.1 (57×), topbar search Lc 66.5, crumb Lc 67.8, b.ch-num Lc 60.5. Light: span Lc 71.1, dd.ch-num.ch-loss Lc 69.1, button Lc 67.6.
- Expected: Lc 75 body both themes.
- Fix: Lift secondary body ink in dark one step and the shell crumb/search ink in both.
- Files: src/clubhouse/styles/tokens.css
- Evidence: p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0031, p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0032
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-01 floor Lc 75).

## F-0043 · S2 · blocks-flip · P010
**Team Hub and profile tab labels miss Nick's Lc 75 gate in dark**

- Observed: Overlay-free rows: Team Hub 'Announcements' Lc 64.3 (WCAG 9.16) on mba15 dark (team-hub.jsonl line 20) and pro dark (line 4); Stats 'Overview' Lc 64.3-67.7, 'Game detail' Lc 64.3, 'Development' Lc 67.8 (stats.jsonl lines 66, 119). Light tab labels not flagged.
- Expected: Lc 75 at rest and hover in both themes; Lc 90 light for A.
- Fix: Raise the unselected tab label ink in dark to the primary text step.
- Files: src/clubhouse/styles/controls.css
- Evidence: p2p3-lean/lean-player/rows/team-hub.jsonl, p2p3-lean/lean-player/rows/stats.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-07 profile hero and desktop tabs: Lc 75, no exceptions [Nick]).

## F-0062 · S3 · after · P001
**Meta text and two big figures sit under Lc 60**

- Observed: span Lc 47.1 (48×), identity meta Lc 58.1 / 56.9, s.ch-was Lc 36.3, znbig Lc 59.7 / 54.8 dark.
- Expected: Lc 60.
- Fix: Same token pass as F-a11y-038.
- Files: src/clubhouse/styles/tokens.css
- Evidence: p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0038, p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0039
- Acceptance: rerun the instrument named in the evidence; it must pass (CT-03 / CT-02 Lc 60).

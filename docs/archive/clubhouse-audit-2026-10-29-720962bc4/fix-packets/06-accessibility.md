# Fix packet 06 · accessibility

7 findings, 2 block the flag flip.

## F-0016 · S1 · blocks-flip · P016
**Tournaments compare has an axe critical: a role with the wrong children**

- Observed: aria-required-children (critical) on .ch-tour-cmp-body.
- Expected: Zero critical.
- Fix: Drop the role on .ch-tour-cmp-body or give children the required roles.
- Files: src/clubhouse/screens/tournaments/*
- Evidence: ev/P016/tournaments-compare-mba15-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (AX-01 zero critical).

## F-0042 · S2 · after · P013
**CoachHelm evidence panels scroll but can't be reached by keyboard**

- Observed: axe scrollable-region-focusable (serious), 4 nodes (.ch-th-evidence).
- Expected: Zero serious.
- Fix: tabindex=0 and aria-label on .ch-th-evidence.
- Files: src/clubhouse/screens/coachhelm/*
- Evidence: ev/P013/coachhelm__view-ask-c-c1a1055f-pro-light.png
- Acceptance: rerun the instrument named in the evidence; it must pass (AX-01).

## F-0044 · S2 · blocks-flip · P001
**Many desktop controls show no focus ring when tabbed to**

- Observed: Coach Tab pass: sidebar links ringW 2, but Ask CoachHelm, Notifications, Settings, Previous/Next round, Open recap, Team stats, Full roster and player links ringW 0 with transparent ring colour (press/P002.jsonl line 25). lean-player's rows also contain stops with outline none and a transparent shadow (rows/calendar.jsonl line 94), so its 'every stop had a ring' does not clear these. A background-change focus style is possible; needs a focus screenshot.
- Expected: A visible ring ≥ 3:1 on every stop (Linear, Things for Mac).
- Fix: Apply the shared :focus-visible ring (the one sidebar links use) to .ch-btn--icon, top-bar actions and in-card links.
- Files: src/clubhouse/styles/controls.css, src/clubhouse/styles/shell.css
- Evidence: p2p3-lean/lean-coach/press/P002.jsonl, p2p3-lean/lean-coach/press/P004.jsonl, p2p3-lean/lean-coach/press/P006.jsonl, p2p3-lean/lean-coach/press/P007.jsonl, p2p3-lean/lean-coach/press/P011.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (AX-07 / TO-08 focus visible at 3:1).

## F-0058 · S3 · after · P006
**After cancelling or deleting an event, another event's menu or peek opens by itself**

- Observed: After Cancel the top layer was the hand-test actions menu; after Delete, its peek (W-021).
- Expected: Focus returns to the day without opening anything.
- Fix: Restore focus to the day cell when the opener is gone; never dispatch the next event's open action.
- Files: src/clubhouse/ui/Modal.tsx
- Evidence: ev/P006/write-c-ev-cancelled.png, writes.jsonl#W-021
- Acceptance: rerun the instrument named in the evidence; it must pass (AX-03).

## F-0063 · S3 · after · P005
**Stats and Team Hub skip heading levels**

- Observed: axe heading-order (moderate), 24 nodes.
- Expected: Levels increase by one.
- Fix: Insight titles as h3 under the section h2.
- Files: n/a
- Evidence: p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0041
- Acceptance: rerun the instrument named in the evidence; it must pass (AX-02).

## F-0064 · S3 · after · P005
**Two Stats sections share the same landmark name**

- Observed: axe landmark-unique (moderate), 2 nodes.
- Expected: Unique names.
- Fix: aria-labelledby each section's own heading.
- Files: n/a
- Evidence: p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0042
- Acceptance: rerun the instrument named in the evidence; it must pass (AX-02).

## F-0065 · S3 · after · P001
**'Skip to content' is still off screen right after Tab focuses it**

- Observed: a.ch-skip inView false on focus (calendar, home, messages, rounds, stats); may be its slide-in.
- Expected: Visible on focus within a frame.
- Fix: Show .ch-skip on :focus-visible without a transition.
- Files: src/clubhouse/styles/shell.css
- Evidence: p2p3-lean/lean-player/drafts.jsonl#D-lean-player-0037, p2p3-lean/lean-coach/press/P002.jsonl
- Acceptance: rerun the instrument named in the evidence; it must pass (AX-02).

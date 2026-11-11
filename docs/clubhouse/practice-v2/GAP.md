# Practice: what the build is missing against its design (10 Nov 2026)

Looked at before anything was changed. The design is `design-refresh/practice-plan/redesign/coachhelm-practice.html`
(scenes 4 and 5: the builder and the player) with `05-SCREENS.md`'s S-PRC rows for the screens that page does not draw
(home, library, run, print: "build rule", restyled to `DESIGN_LANGUAGE.md`). Captures: WebKit, 390x844 and 1440x900,
from `/clubhouse-preview/coachhelm-practice-*`. Each row was checked against the code named in it. A real control in
place of a drawn one is not a difference and is not listed.

Score: 5 a coach or player is misled or the screen is broken, 4 the design's idea is missing, 3 structure or hierarchy
is off, 2 craft, 1 nit.

## Worst first

| # | Score | Where | What differs | Checked in |
|---|---|---|---|---|
| 1 | 5 | Plan page, coach (run `?state=draft`, `edited`) | A draft shows nothing that says so: the bar is Edit and Share on an empty page, and the only word is in the sheet's footer. Published and edited-after-publish differ by one grey line beside the buttons. The three states must never be confused. | `CoachPlanBar.tsx` |
| 2 | 5 | Print | A failed drills read is turned into "this plan has no drills": `loadPlanDrills(planId).catch(() => [])`. The loader throws on purpose ("the caller decides what a print without its appendix is"); the studio then silently offers no appendix and the coach prints a plan that looks whole. | `routes/practice.tsx` PracticePrintRoute; `data/practice-plan.ts:136-153` |
| 3 | 5 | `practice.css` | Two generations of rules. `.ch-prc-chip`, `.ch-prc-card`, `.ch-prc-sec` and `.ch-prc-facts` are each defined twice with different values (lines 41, 111, 185, 983 and again 1163 to 1181). The later filter-chip rule gives every state mark a 36px pill, a pointer cursor and a hit area, so "Draft" and "Updated" look like buttons. Two raw `rgb()` values (574, 584). | `styles/practice.css` |
| 4 | 5 | Builder previews: Groups, Drills, Review | Every player reads "A player", every group on the sheet is three dashes, every slot reads "A drill that's not in the bank". The fixture calls `Object.entries()` on a Map (empty) and its drill refs do not match the plan's. Live data is not affected, but these three steps have never been seen as they are. | `preview/PreviewPracticeHome.tsx` |
| 5 | 4 | Publish (builder `?state=publish`) | The sheet's one press, "Publish to 11 people", sits in the header slot and wraps to three lines at 390. The design's confirm is a short card of facts with the full-width press under it, then an 8 second Undo. | `Builder.tsx` FormSheet `actionLabel` |
| 6 | 4 | Home, Up next | A text list of three rows. The design's idea for a practice at a glance is the day drawn to scale: a strip whose widths are minutes and whose colours are the kind of work, over the schedule. Nothing on the card says whether players have this plan. | `PracticeHome.tsx`; design `.strip`, `segColor` |
| 7 | 4 | Home, first run | One "New plan" button. The spec is one card with three starts: Blank, a starter template, Ask CoachHelm. | `PracticeHome.tsx`; 05 S-PRC.home-first-run |
| 8 | 4 | Builder, kept blocks | A kept suggestion loses its reason. The design keeps "Because ..." under each kept block (coach only), with the loss figure in amber. | `Builder.tsx` blockCards; design `gbHTML`, `.kept` |
| 9 | 4 | Player home | The Today card is drawn twice in two ways: `.ch-prc-next` here, `.ch-cpv .art` on the plan page (tile, focus, group faces, Now and Next pills). One idea, one drawing. The home card has no focus line and no group. | `PlayerPracticeHome.tsx`, `coachhelm/plan/player/PlayerPractice.tsx` |
| 10 | 3 | Builder head, phone | Three loose rows under the steps (a green date link, the ribbon card, "Saved"). The design has the ribbon alone. The mix bar uses green, champagne and the frame colour; the design's kinds are blue (skill), plum (random) and green (pressure). | `Builder.tsx` `.ch-prb-sub`; `practice.css:389-397` |
| 11 | 3 | Builder, helper row | The folded row has no CoachHelm mark. A kept run in preview has no Undo (the design shows it). | `Builder.tsx` helperFold |
| 12 | 3 | New plan sheet | The design asks in the sheet when Ask CoachHelm is picked ("What should Thursday cover?": how long, work on) and ends on "Build the plan". The build has "Create plan" in the header and asks nothing; the helper asks later, in the builder. | `NewPlanSheet.tsx`; design `bNew` |
| 13 | 3 | Plan rows (home, both roles) | "Edits not published" is plain grey text; the rule is secondary text with a dot (a state, not a loss). A past plan says "Done"; the spec says "Ended". | `PracticeHome.tsx` PlanRows; 05 build rule 7 |
| 14 | 3 | Run | Two shift buttons of unequal width, the longer one worded differently from the shorter. Group rows repeat the clock time in both columns. | `PlanRun.tsx` |
| 15 | 3 | Controls built in lane CSS where a shared one exists | Area filter chips (`.ch-prc-chip[aria-pressed]`, `.ch-prc-chipb`) duplicate `.ch-pill`; state marks duplicate `Badge`; `.ch-prc-seen`, `.ch-prc-past`, `.ch-prb-when` are hand-made text buttons. | `LibraryPages.tsx`, `Sheets.tsx`, `practice.css` |
| 16 | 2 | Motion | A kept ghost changes with no transition (design: 0.7 to 1 opacity over 260ms as the outline gives way to the card). The Past plans chevron turns with no transition. Ghosts all arrive at once on mount. | `practice.css` |
| 17 | 2 | Block card | Kind icon sits beside a wrapped two-line title, centred on neither line. Time and length stacked at the left; the design puts length at the right. | `Builder.tsx` blockCards |
| 18 | 2 | Helper card | Two facts where the design has three (the class-time line). The loader reads strokes gained and the next event only; there is no class-time read to cite. | `data/practice-home.ts` helperFacts |
| 19 | 1 | Preview | `coachhelm-practice-builder?state=new` draws the Blocks step: `BuilderPreview.newSheet` is never read. The sheet lives on home (`?state=new`). | `Builder.tsx`, preview page |

## Found in the later captures (library, print)

| # | Score | Where | What differs | Checked in |
|---|---|---|---|---|
| 20 | 5 | A drill, phone | Edit, Archive and Copy to your bank are not on the page: the header's actions are hidden on a phone and the bar carries none. | `practice.css` `.ch-prc-h__a { display: none }`, `LibraryPages.tsx` DrillPage |
| 21 | 5 | Groups preview | Every saved group reads "0 players" (the same Map fixture fault as row 4). | `preview/PreviewPracticeHome.tsx` |
| 22 | 2 | A drill | The facts card has an empty band under its last row (the two `.ch-prc-facts` rules). | `practice.css` |

## After the rebuild (10 Nov, late)

Closed: 1 to 11, 13 to 17, 20 to 22. The mix legend now counts the same clock minutes the strip draws.

Open, in order:
- 12: the New plan sheet still asks nothing when Ask CoachHelm is picked; the helper asks in the builder.
- 14 (part): Run's group rows still give the clock in both columns.
- 18: no class-time read exists for the helper's third fact; nothing is invented.
- 19: `builder?state=new` is still a dead preview state.
- Not captured: Reduce Motion, the largest Text Size, and desktop for run, library and print.
- A real paginated PDF of the printed plan was not produced; page breaks are checked by rule only (`coachhelm-plan.css:91`).

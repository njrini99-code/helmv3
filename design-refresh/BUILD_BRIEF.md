# Clubhouse phone refresh: Claude Code build brief

Paste the block below into Claude Code in the helmv3 repo. Everything after it is the brief the agent works from.

```
You are building the Clubhouse phone design refresh in this repo (helmv3, code under src/clubhouse).
Read, in order, before touching code:
1. design-refresh/BUILD_BRIEF.md (this file): the PR order, where each change lands, and how it behaves
2. design-refresh/DESIGN_LANGUAGE.md: the tokens, surfaces, type, motion and banned list every PR follows
3. The approved design pages, opened in a browser, as the visual reference for each screen:
   - Classes, Roster and coach Home (approved by Nick): https://claude.ai/artifact/QnVN3x63a79TM8geunzccU
   - Phone Stats and player Home: https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S
   - Messages (approved by Nick): https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev
   - CoachHelm Team, the golf hole (Nick: "I love this"): https://claude.ai/artifact/HAWFGcKWn4hbZgn2jU6TjK
     (package design-refresh/coachhelm-team/, its own PRs CT0a to CT7, behind coachhelm_team_board_v1, off)
   - CoachHelm read, one read in full (Nick: "Beautiful, polish it and let's get it ready for implementation"):
     https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK
     (package design-refresh/coachhelm-read/, its own PRs CR0 to CR6, behind coachhelm_read_v1, off)
   - CoachHelm Ask (chat with live steps, visuals, artifacts and a create flow for every tab):
     https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA
     (package design-refresh/ask/, its own PRs AK0 to AK12, behind coachhelm_ask_v2, off; start at ask/README.md)
   - CoachHelm practice plans (Ask builds a plan, plan format, the builder helper and the player side):
     https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5
     (package design-refresh/practice-plan/, its own PRs PP0 to PP9, behind coachhelm_practice_plans_v1, off; start at practice-plan/README.md)
   Local copies of the same pages: design-refresh/classes-roster-home/redesign/clubhouse-phone-redesign.html (v6) and
   design-refresh/stats-home/redesign/stats-and-home-phone.html (v7) and design-refresh/messages/redesign/clubhouse-messages.html,
   for side-by-side checks without a sign-in.
Copy the design-refresh folder into the repo root first if it is not there (it lives in Nick's project files).
Step 0, before PR 1: start one dev server (npm run dev -- -p 3100) and run
   the capture commands in each package's README.md, one package at a time:
   design-refresh/classes-roster-home/ (Classes, Roster, coach Home), design-refresh/stats-home/ (My stats,
   Team Stats, Home "Your game"), design-refresh/messages/ (inbox, thread and all 34 states) and
   design-refresh/coachhelm-read/ (the read, every card, all three reads, coach and player) and
   design-refresh/ask/ (every Ask screen ID and flow stage, coach and player) and
   design-refresh/practice-plan/ (every practice plan screen ID and state, coach and player). Each script
   shoots the design page and today's app state by state, light and dark, into its own screenshots/ folder.
   Commit nothing from them; they are the reference. After each PR, run that package's "app" and "compare"
   commands to put the build beside the design.

Rules, no exceptions. The first one matters most:
- DESIGN FIDELITY FIRST. Nick: "what is the point of redesigning it if it's not gonna actually look like that."
  Each screen must end up looking and behaving like its design page: same layout, sizes, spacing, colours, type,
  icons, copy, every state (empty, failed, loading, long names, Text Size XXL), every sub page and sheet, every
  feature mechanic (what a tap, swipe, long press or drag does) and every motion (curve, duration, what moves).
  Read values off the design page (its CSS and the package notes), never by eye.
- If something can't be built as drawn (data the app doesn't load, a gesture iOS reserves, a component that
  conflicts with shared code), do not improvise. Stop that piece, write it in the PR under "Can't match as
  drawn", with the reason and two options, and carry on with the rest. Nick decides.
- One PR per step below, in order, each a DRAFT PR against main. Never merge, deploy, flip a flag, run a migration
  or touch production or staging data. No step here needs a database change; if one seems to, stop and ask.
- Never change what shot tracking collects, stores or sends. Display only.
- Keep the laptop light: one dev server, one browser, at most two subagents at a time. Run typecheck once per PR,
  at the end, not in a loop (it takes 8 GB).
- Match the approved pages closely, not loosely. Where a page and DESIGN_LANGUAGE.md disagree, the language wins
  and you note it in the PR.
- Keep today's green top bar on every section exactly as it is: section switcher ("Stats ⌄") left, bell right.
  Do not replace or restyle it. Only the page under it changes.
- Organized, airy, visual-first screens (law 6): keep all the content, group it by question, one lead visual per
  card, short notes inside the card, 24pt between cards. Better organized, never fewer.
- No accent left-border cards, no text on the phone page except the large title and its context line (Stats is the
  one settled exception, kept as drawn), no gradient behind text, no count-ups, sentence case, true minus.
- Every PR is accepted only when its fidelity check passes (see "Fidelity check" below): side-by-side shots of
  every screen and sub page it touches against the design page, light and dark, at 390 (and 430 where the design
  page has the 6.9" size), and short recordings of its key animations next to the design page's. Plus the
  contrast test and the Reduce Motion check in PR 12. Put the side-by-sides and recordings in the PR.
Start with PR 1. After each PR, post its link and a three-line summary, then go on to the next.
```

---

## What's in this package

The hub page ties it together for Nick: https://claude.ai/artifact/JpSA4THXgQkM6aCo66oMpz (source in `hub/`). It shows status, the shared rules, today against each design, and this build order. The brief and its packages win over the hub on any detail.

Nick, 31 Oct: "I want screenshots, briefs, redesign plans, how to fix / replace current etc. ensure data is correct." Each workstream below has the same five parts. Each workstream's package folder holds its screenshots, brief, plan, data checks and fidelity spec. Nick, 15:30, raised the bar ("emphasis on matching designs and motion and animation details and subscreen details"), so every package also gets 05-SCREENS, 06-SCREEN-SPECS, 07-MOTION and 08-ACCEPTANCE, in the shape set by `BUILD_CONTRACT_STANDARD.md`. Those four files are the build contract and win over 04 where they differ.

| Workstream | Status | PRs | Screenshots | Data checks |
|---|---|---|---|---|
| Classes, Roster, coach Home | Approved by Nick, 31 Oct; all six calls settled 13:47 | 7 to 10 | `classes-roster-home/screenshots/` | `classes-roster-home/03-DATA-CHECKS.md` |
| Phone Stats and player Home | Build target (v7): every stat back on the summary, strokes gained bars fixed; three calls settled 31 Oct (page head as drawn) | 4a to 4c, 5, 6 | `stats-home/screenshots/` | `stats-home/03-DATA-CHECKS.md` |
| Messages | Approved by Nick, 31 Oct ("Dude this looks great. Make sure the motion is pristine"); all calls settled (14:32 and 15:26: no Camera; pin sync approved as its own held draft PR) | 11a to 11g | `messages/screenshots/` | `messages/03-DATA-CHECKS.md` |
| CoachHelm Team (the hole) | Nick, 31 Oct: "I love this. Fix the white space in the desktop version. Other than let's polish and rip it." Desktop fixed and polished, Course tab added; calls settled (Course tab and 4 reads by Nick, the rest as defaults he can flip); build contract 05 to 08 written | CT0a to CT7 | `coachhelm-team/screenshots/` (run the capture on the Mac) | `coachhelm-team/03-DATA-CHECKS.md` |
| CoachHelm read (one read in full) | Nick, 31 Oct: "Beautiful, polish it and let's get it ready for implementation." Polished (v5: every subscreen, sheet and state live and linkable), package written with a full build contract (05 to 08); three calls built as defaults he can flip | CR0 to CR6 | `coachhelm-read/screenshots/` (60 design shots; the rest on the Mac) | `coachhelm-read/03-DATA-CHECKS.md` |
| CoachHelm Lenses | Decided by Nick, 31 Oct ("All four on Lenses"); players compare against PGA Tour and team averages only (15:26) | L0 to L6 | `coachhelm-lenses/screenshots/` | `coachhelm-lenses/03-DATA-CHECKS.md` |
| CoachHelm Ask | Nick's calls settled 31 Oct, announcements post on Post with Undo (15:26); the rest settled as defaults he can flip; design page v13; build contract 05 to 08 written (start at `ask/README.md`) | AK0 to AK12 | `ask/screenshots/` (run the capture on the Mac) | `ask/03-DATA-CHECKS.md` |
| Quick chat | Nick, 31 Oct: "I like the glass"; the rest left to the lane ("Whatever you think is best"), settled as defaults he can flip; build contract 05 to 08 written (start at `coachhelm/README.md`) | QC0 to QC6 | `coachhelm/screenshots/` (run the capture on the Mac) | `coachhelm/03-DATA-CHECKS.md`, fields in `coachhelm/TASK_FIELDS.md` |
| CoachHelm practice plans (lane 6) | Ready for build review (prep only). Decided by Nick, 31 Oct; final polish 3 Nov; his four calls settled, the rest built as defaults he can flip; build contract 05 to 08 written (start at `practice-plan/README.md`) | PP0 to PP9 | `practice-plan/screenshots/design/` (84 design stills; the app side on the Mac) | `practice-plan/03-DATA-CHECKS.md` |
| Shared foundation (tokens, flat page, titles under the green bar, motion) | Ready | 1 to 3, 12 | before shots of every screen above | contrast test |

Classes, Roster and coach Home have their own full package in `classes-roster-home/` (read its `README.md` first): `01-BRIEFS.md`, `02-PLAN.md` (file by file against main 75b4956), `03-DATA-CHECKS.md`, `04-FIDELITY-SPEC.md` (exact values, every state, sub page, tap and animation), the approved design page v6 at `redesign/clubhouse-phone-redesign.html` with its CSS, and `capture/capture.mjs` for state-by-state shots and compares. Where it and this brief differ on those three screens, the package wins. Nick settled its six calls on 31 Oct ("Go with your picks"); `04-FIDELITY-SPEC.md` section 8 marks each decided:

- Practice rounds stay out of every scoring average, the leaders and the top five. They still show in Latest rounds.
- No Captain tag.
- A plain "Injured" chip with no date. Injured players count as active, so the team card reads "7 active · 1 injured", and that card is titled Injured.
- Classes shows no finals, holidays or next-week travel. The term line reads "6 weeks left · term ends Dec 15" with no finals marks, and Soon holds the term end plus this week's team events.
- shell.css around line 1306: the hero-mode bar becomes `--ch-frame`, so Home's bar and hero are one green. This changes player Home's bar too (PR 6).
- Desktop's "Needs a look" strip (`.ch-rs-attn`) is removed.

`03-DATA-CHECKS.md` also lists five preview fixture bugs to fix inside PRs 8 to 10: the Home chart has 12 points against a loader max of 10; to-par is computed against 72 while the pars sum to 71; the Home and Roster fixtures disagree on Theo and Priya; "Good morning" is hard-coded and shows at 2:40 PM; overlap is counted by meetings instead of events.

Stats, Team Stats and player Home "Your game" have their own full package in `stats-home/`, laid out the same way (read its `README.md` first): `01-BRIEFS.md`, `02-PLAN.md` (overrides first, then file by file against main 75b4956, with the PR split), `03-DATA-CHECKS.md` (every figure to its source, formula and fixture value: OK 146, RENAME 15, DERIVE 19, MISSING 21, plus 13 formula problems), `04-FIDELITY-SPEC.md`, the design page v7 at `redesign/stats-and-home-phone.html` with its CSS, `capture/capture.mjs`, and 8 before and 44 after shots. Where it and this brief differ on those screens, the package wins.

Data rules from that package that every Stats PR follows:
- "Missed short" is `approachMissShortPct` alone, on phone and desktop (today `GameDetail.tsx` and `OverviewZones.tsx` add the corner cells again and double-count).
- Tour marks only from `golf_pga_standards`. There is no Tour fairway, overall scrambling or putts per round, so those draw no Tour mark.
- One source per figure: the headline from `comparisons`, breakdowns from `GolfStats`, "vs before" from `extra.compare` with a caption saying it is round totals. A summary card never shows a different number from its detail.
- The SG total is the stored `sgPerRound`, never the sum of the legs. Strokes gained waits for round 3 (`MIN_SG_ROUNDS`).
- Leg SG ranges use `POOLED_LEG_SD`, not the total's spread. One-putt rate divides by holes with putts. Tee distances leave out par-3 tee shots.

Stats calls, all settled 31 Oct (Nick: "Keep as drawn" for the first, then "Handle any other questions they have", so the other two take their defaults):
1. Settled 31 Oct 15:26, Nick: "Keep as drawn". The Stats page head is built as drawn: section names on the page and no large title. This is an agreed exception to law 1 and to PR 3 on this screen.
2. Detail pages run longer than drawn so nothing is removed. Settled: yes.
3. Raise `LEG_TREND` from 7 to 10 so Home's "Improving" and "Slipping" can show at all. Settled: yes.

For every workstream:
1. **Screenshots.** Already in each package: Nick's own iPhone shots of today's screens and the design shots made so far. Step 0 on the Mac fills in the rest with each package's `capture/capture.mjs`: the design page and today's `/clubhouse-preview/` routes, state by state, light and dark.
2. **Brief.** What Nick saw and why it's being changed, in two or three lines, at the top of the PR section.
3. **Redesign plan.** The screen top to bottom as it should end up (the PR's "What").
4. **How to fix or replace today's code.** The files and components named in the PR's "Where", with what is kept, what is restyled and what is deleted.
5. **Data checks.** Every figure on the screen, the field it comes from in today's loaders, and the preview fixture value that proves it shows right. Nothing new is read or written; if a figure can't be traced to a loaded field, it doesn't ship.

---

## Fidelity check (the acceptance step for every PR)

One browser, headless, one page at a time, as each package's `capture/capture.mjs` does.

1. Shots. After the PR's changes, run the package's `app` command to shoot the build, then its `compare` command to put each shot beside the design page's (commands in each package README). Light and dark. A sub page, sheet or state the script doesn't reach yet: add it to the script the first time you build it, so later PRs check it too.
2. Look at every pair at full size and list each difference in the PR: matches, fixed, or "Can't match as drawn" with the reason. A PR with an unexplained difference isn't done.
3. Motion. For each key animation the PR touches (push to a detail page, sheet open and close, the segmented chip, list reorder, chart bars growing, large title on scroll, press states), record a few seconds with Playwright's `recordVideo` at 390 wide on the preview route, and the same interaction on the design page. Check curve, duration and what moves against DESIGN_LANGUAGE.md section 8 and the design page's CSS. Put both clips in the PR. Then the same with Reduce Motion on: nothing travels, crossfades only.
4. Mechanics. Walk every tap, swipe and long press the design page has on that screen and confirm it does the same thing and lands on the same place, including Back.

---

## How to verify every PR

- Unit and token tests: `npm test` (vitest unit). Add contrast assertions to `src/clubhouse/__tests__/contrast-tokens.test.ts` for every new text token, light and dark (the dark values sit under `html[data-fw-theme='dark'] [data-ui='clubhouse']` in `tokens.css`; that test's `token()` helper reads them).
- Styles: `npx stylelint --config stylelint.clubhouse.config.mjs "src/clubhouse/styles/**/*.css"`.
- Lint and types: `npm run lint`, then `npm run typecheck` once.
- Visual: `npm run dev`, open `/clubhouse-preview/<screen>` (screen list in `src/app/clubhouse-preview/[screen]/page.tsx`), device widths 390 and 430, light and dark, Text Size default and XXL. Screenshot before and after into the PR.
- Existing e2e for the touched screen only: `npx playwright test -c playwright.clubhouse.config.ts --project=chromium` (skip webkit locally unless the PR touches glass or scroll).

---

## PR 1. Tokens only (no visual change)

Where: `src/clubhouse/styles/tokens.css`.
What: add the semantic tokens from DESIGN_LANGUAGE.md sections 3, 6 and "Adopted from threads", light in the root block and dark in the `data-fw-theme='dark'` block:
- `--ch-grouped-bg`, `--ch-card-bg`, `--ch-well-bg-flat`, `--ch-separator`, `--ch-card-ring`, `--ch-card-shadow`
- `--ch-gain`, `--ch-loss`, `--ch-flag`, and the chart fills (`--ch-chart-gain-fill`, `--ch-chart-loss-fill`, `--ch-chart-flat`, `--ch-chart-track`, `--ch-chart-zero`)
- feature-card inks (`--ch-feature-ink`, `-ink-2`, `-gain`, `-loss`, `-flag`)
- class-year fills `--ch-yr-sr|jr|so|fr` and `--ch-yr-ink`
- type roles `--ch-type-row`, `--ch-type-meta`, `--ch-type-figure-hero`, `--ch-type-figure`, built on `--ch-type-k` so they follow iPhone Text Size like the rest
- Reduce Motion: in the reduced block (today it zeroes every duration), add `--ch-dur-crossfade-rm` for opacity-only crossfades, set to the same value as `CH_FADE_MS` in `lib/motion.ts` (180ms today, pinned by `reduced-motion.test.tsx`; leave that test as is).
- Push distance: set `--ch-vt-parallax` to `-24%` (from `-30%`) so route pushes match the phone stack's `CH_UNDERLAY_SHIFT` 0.24, and update the one line of `native-nav.test.tsx` that pins it. The shared values table in START_HERE is the single source of truth for these numbers.
Behaviour: nothing consumes them yet, so the app looks identical.
Tests: contrast assertions for every text token on `--ch-grouped-bg` and `--ch-card-bg`, light and dark, at ≥ 4.5; chart fills ≥ 3 on `--ch-chart-track`; white on each year fill ≥ 4.5.

## PR 2. Flat page, and Section titles into cards

Flag (completeness pass, 4 Nov): PR 2 and PR 3 sit behind the new `clubhouse_refresh_v1`, off everywhere. Its server read sets `data-ch-refresh="on"` on the Clubhouse app root, and every rule these two PRs add or change is scoped under `[data-ch-refresh='on']` (component changes branch on the same value), so with it off every screen renders as main. Lane captures run with it on.

Where:
- `src/clubhouse/styles/shell.css`, the `@media (max-width: 820px)` block that sets `.ch-app` and `.ch-canvas` to `var(--ch-light-canvas), var(--ch-light-paper), var(--ch-workspace)` (around line 2440). Phone canvas and app become `var(--ch-grouped-bg)` only. The light stays on the green frame (`--ch-light-sky`, `--ch-light-bar`) where there's no body text.
- Desktop `.ch-canvas` (around line 2320): drop `--ch-light-canvas` and `--ch-light-paper` from the canvas too, keep the 90px sidebar bleed and the framed elevation. Desktop keeps the flush Ledger headings, now on a flat canvas.
- `src/clubhouse/ui/Section.tsx`: on phone (≤ 820px) the head renders as the header of the card directly inside it. Do it in CSS where possible (`.ch-sec__head` gets card-header styling and the following card loses its top radius), else add a `phoneCard` prop defaulting on. `meta` becomes the right-aligned meta; a section caption becomes the card's note.
- `src/clubhouse/ui/Surface.tsx`: header = title 17/600 + meta 15/400 secondary with a hairline inset 16; `footerNote` renders as the note band inside the card (15/400 secondary, hairline above). Card uses `--ch-card-bg`, ring and shadow.
Behaviour: the gradient is gone from every screen at once, phone and desktop, because the page is now flat. Section titles move into cards only where a screen uses `ui/Section.tsx` (17 files: Classes, Team rounds, What's new, qualifiers, tournaments, calendar extras, three CoachHelm views). Stats, Home, Roster, Messages and the rest draw their own heads, so their PRs below move them. Nothing else moves; scroll owners, pull to refresh and safe areas unchanged.
Tests: a DOM test that `Section` on a 390-wide viewport renders its title inside an element with the card class; a stylelint or unit check that no phone rule in `shell.css` references `--ch-light-canvas` or `--ch-light-paper`.

## PR 3. Large titles and sticky controls under the green bar

Where: `src/clubhouse/shell/large-title.tsx`, `src/clubhouse/ui/LargeTitle.tsx`, the screens' own phone tops, phone rules in `shell.css`. Do not change `shell/phone-chrome.tsx`, `ui/PhoneBar.tsx`, `PhoneTop` or the section switch.
What: the green top bar stays exactly as today on every section, as specified in DESIGN_LANGUAGE.md section 5 and `CLASSES_ROSTER_HOME_IMPLEMENTATION.md` section 2: `--ch-frame` green, switcher ("Stats ⌄", "Roster ⌄") with its champagne dot on the left opening the section strip, the bell or the page's own action (+ on Classes, add-player on Roster) on the right, the flat parchment sheet tucked under it with the 16px lip, a soft 14px shade under the bar after 8px of scroll, and on pushed pages "‹ Roster" in champagne with the name centred. Under it: an optional 34pt large title with one 15pt context line, which is the page's heading and opens nothing; on scroll it shrinks about 14% and fades (fade only under Reduce Motion). Where the current phone pass hides `LargeTitle` on Classes and Roster, turn it back on. Controls (the green segmented) stick under the bar on the page colour.
Home (player and coach) keeps the green bar with the team mark and "Home ⌄", the flat deep green hero with the greeting, no glow behind text, and the ivory lip into the flat page.
Behaviour: same routes, same back behaviour, same bell, same switcher. The bar does not change.
Tests: existing phone-bar tests pass untouched (proof the bar did not change); a DOM test that the switcher and the bell or page action render on Stats, Roster and Classes with the large title in view.

## PR 4a, 4b, 4c. Player phone Stats

Design page: https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S ("My stats", v7; local copy `stats-home/redesign/stats-and-home-phone.html`) and DESIGN_LANGUAGE.md section 9, "Summary to detail". Line-level detail: `stats-home/02-PLAN.md`. Exact values, states, taps and motion: `stats-home/04-FIDELITY-SPEC.md`.
- **Flag (completeness pass, 4 Nov):** PRs 4a to 4c, 5 and 6 sit behind the new `clubhouse_stats_redesign_v1`, off in every environment. With it off, phone Stats, Team Stats and player Home's Your game render as main, the Missed short fix included. No migration. PR 6 also sets `data-ch-hero-flat` on player Home's root when its flat hero renders (stats-home 02, CP-155).
- **4a. Plumbing** (no visible change except the "Missed short" fix): the detail route and its hook, the unused detail screen and hero, the "Missed short" fix, preview fixture fixes, unit tests. Lands first.
- **4b. Summary and details**: under the unchanged green bar ("My stats ⌄", bell), the green segmented with all five windows plus the filter; Scoring as the one feature card; What changed; At a glance (greens, fairways, scrambling and the rest, each tapping to its part); one summary card per leg with its visual; rounds and goals. Each card pushes its detail with the house push (462ms, `CH_UNDERLAY_SHIFT` 0.24, `--ch-push-dim`); the pushed bar reads "‹ My stats" with no bell; Back returns to the same scroll spot. Cards press at 0.97 with the pressed wash (START_HERE shared Press value); rows and tiles wash only (fixed 4 Nov, completeness pass).
- **4c. Detail polish**: panel order per the design, reference lines, the What changed to Against anchors, the trend drag, charts that grow once.
Behaviour: same data, windows, filters and destinations; Roster's "All N" and the team grid's links still land on the right detail. Nothing that exists today is removed; `02-PLAN.md` "Where today's content goes" is the checklist.
Tests: as listed in `02-PLAN.md`, including deep links and Back.

## PR 5. Team phone Stats

Design page: the same link ("Team Stats"). Detail: `stats-home/02-PLAN.md` PR 5.
What: the same pattern: team scoring feature card, team summary cards and three detail pages, and "Who gains and loses" worded right when everyone is below zero ("loses the least"). Builds on 4a.
Behaviour: unchanged data and navigation; the team grid cell still opens the player's leg detail.

## PR 6. Player Home, "Your game"

Design page: the same link ("Home"). Detail: `stats-home/02-PLAN.md` PR 6.
What: "Your game" as one card with the contrast fixes (steady sparklines in neutral ink, visible Tour track and tick, bar labels in their bar's tone). Only Approach draws a Tour bar, because greens is the only Home figure with a Tour value. With `LEG_TREND` at 10, "Improving" and "Slipping" can show.
Behaviour: same figures and links. PR 10's shell.css change (hero-mode bar becomes `--ch-frame`) also reaches player Home's bar; the v7 page already draws bar and hero as one flat green, so re-shoot player Home after PR 10 and compare.

## PR 7. Class-year avatars and the class-year label

Flag (completeness pass, 4 Nov): PRs 7 to 10 sit behind the new `clubhouse_classes_roster_home_v1`, off everywhere, added in PR 7 by copying the `coachhelm_track_record_v1` entry. New CSS is scoped under `[data-ch-crh='on']`; the preview reads `&crh=0|1`. No migration. The `classYearLabel` repeat fix ships behind it too (classes-roster-home 02 CP-02.1).

Where: `src/clubhouse/ui/Avatar.tsx`, `src/clubhouse/data/season.ts` (`classYearLabel`, around line 238).
What: an opt-in `year` prop on `Avatar` fills the coin by class year from the player's graduation year (`--ch-yr-*`, white initials); without the prop, and for coaches and unknown years, the neutral coin stays. Fix `classYearLabel` repeating "Class of 2031 · Class of 2031" and its "Class of 2026" fallback; a missing year returns null, not a guess.
Behaviour: only the call sites that pass `year` change colour: the Roster, Classes and coach Home places listed in `classes-roster-home/02-PLAN.md`. Every other avatar stays as it is; Messages opts in in PR 11a. Nothing else changes.
Tests: unit tests for `classYearLabel` (normal, missing, the repeat case, season rollover on 1 August) and for the year to token mapping.

## PR 8. Roster (coach and player, phone and desktop)

Design page: https://claude.ai/artifact/QnVN3x63a79TM8geunzccU (Roster, coach and player views, and the profile; local copy `classes-roster-home/redesign/clubhouse-phone-redesign.html`, v6). Use the Classes thread's implementation notes in this folder for line-level detail (`CLASSES_ROSTER_HOME_IMPLEMENTATION.md`); its top bar section matches this brief.
Where: `screens/roster/RosterPhone.tsx` (head around 133–302, rows around 370–442), `TeamRosterPhone.tsx` (rows around 130–144), `RosterProfile.tsx` (63–189), `Roster.tsx` (desktop table around 790–863), `RosterPeek.tsx`, `styles/roster.css`, sort via `ui/Segmented` size sm in `controls.css`.
What: green bar with "Roster ⌄" and the bell as today; green team card under the large title (team and season, "7 active · 1 injured" with injured counted as active, waiting count, class-mix bar with legend, top five by average; counts from data already loaded). Three leader cards in a snap row. Player rows in one card: year avatar, name, class status note with its class dot, five form bars, figure, chevron. Sort (Avg / SG / Name) is the green segmented in the sticky bar, no "Sort by" label. Player view: same card, "Senior · Class of 2027" under the name, "You" chip, HCP right, not tappable (as today). Profile: year avatar and year chip. Desktop: team card and leaders across the top, year avatars and form bars in the table, year chip in the peek, and the "Needs a look" strip (`.ch-rs-attn`) removed. Practice rounds stay out of averages, leaders and the top five.
Behaviour: same sort logic (`sort.ts`), same requests flow, same peek and profile routes.

## PR 9. Classes (phone)

Design page: https://claude.ai/artifact/QnVN3x63a79TM8geunzccU (Classes, with its detail sheet), plus `CLASSES_ROSTER_HOME_IMPLEMENTATION.md`.
Where: `screens/classes/ClassesView.tsx` (PhoneTop), `screens/classes/parts.tsx` (TermBar compact, TodayClasses), `TodayStrip.tsx`, `styles/classes.css` (`.ch-cl-tb.is-compact`, `.ch-cl-tb__one`, around 1495–1720).
What: green bar with "Classes ⌄" and the bell as today; large title "Classes" with the term under it; the + holds Add and Import, so the "Your classes" heading row goes. Remove the compact one-line term bar on phone; one feature card for the term (week well, credits bar by tone, term line "6 weeks left · term ends Dec 15" with Today and no finals marks, "Soon" in two columns holding the term end and this week's team events only, overlap chip). "Today" card with the day on the right; on a day off "No classes today · Next: Monday", the day ribbon, then rows; time column fixed at 58pt; team events in green; rows de-duplicated by class and start time. Class binders in their class tones.
Behaviour: same writes (`writes.ts`, `class-status-writes.ts`), same sheets (Term, Exam, In class, Import).

## PR 10. Coach Home (phone and desktop)

Desktop Home is in this PR too: its file plan is `classes-roster-home/02-PLAN.md` CP-02.2 and its specs are 06 §11.4 (completeness pass, 4 Nov).

Design page: https://claude.ai/artifact/QnVN3x63a79TM8geunzccU (coach Home), plus `CLASSES_ROSTER_HOME_IMPLEMENTATION.md`.
Where: `screens/home/HomePhone.tsx` (hero around 74–94), `styles/home.css` (the hero rules around 3185–3211 where the green fill was removed), `DayCard.tsx` (around 63), `TeamLegs.tsx` (`TeamLegsPhone` around 204).
What: restore the flat deep green hero (bottom radius 24) and set the hero-mode bar in shell.css (around line 1306) to `--ch-frame` so bar and hero are one green (player Home's bar follows only when PR 6's flat hero is on, keyed on `data-ch-hero-flat`, classes-roster-home 02 CP-02.3; check it in PR 6's shots), "Home ⌄" opens the section strip, greeting at 34pt, brief, every ivory text at 72% opacity or more, no glow behind text. "Up next" as a glass card on the hero: type and countdown, title, time and place, avatar stack with "4 of 6 going". The team's game: one card, 2×2 cells split by hairlines matching the player's legs, diverging bars from a centre zero, names as links.
Behaviour: same queue, asks and links.

## PR 11a to 11g. Messages

Flag (completeness pass, 4 Nov): 11a to 11h sit behind the new `golf_messages_redesign_v1`, off everywhere, read with `isFlagEnabled` in `routes/messages.tsx`. New CSS is under `[data-ch-ms-v2]`; new components and listeners run only with it on. 02-PLAN's delete steps wait for a cleanup PR after the flag is on in production. 11a's design fixture also covers the 19 views the completeness pass added (messages 05), and capture.mjs gains an app-only mode for views the page doesn't draw.

Design page: https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev (local copy `messages/redesign/clubhouse-messages.html`, with a live phone and desktop prototype, a motion lab with Replay per animation, and a link for each of its 34 states). Package: `messages/` (read its `README.md` first): `01-BRIEF.md`, `02-PLAN.md` (file by file against main 75b4956), `03-DATA-CHECKS.md`, `04-FIDELITY-SPEC.md` (every number, state, gesture, spring, interrupt rule and Reduce Motion version), `redesign/` (page, CSS and `prototype.js`, the reference for every interrupt), `capture/capture.mjs` (shots, compares, motion clips and the page's own 11-case motion check). Where it and this brief differ on Messages, the package wins. Builds on PR 1's tokens and PR 7's year avatars; if those haven't landed, 11a carries exactly what Messages needs from them.

- **11a Foundations**: tokens, three new springs, a design fixture that reaches all 34 states, `gradYear` on `ChPerson`. Nothing drawn.
- **11b Inbox**: on phone, the unchanged green bar ("Messages ⌄", bell) then the context line, with no large title (the large title is on the desktop rail only) ("Messages ⌄", bell), search, segmented filter, Pinned card, Recent card, desktop rail at 320, mute glyph on rows, and typing dots on rows and pins (`use-typing-by-conversation.ts`, `02-PLAN.md` §3.8: listens on the on-screen conversations' existing typing channels, skips the open thread, caps at 30, entries expire after 5 s). The messages hook keeps `typingUserId` and clears after 5 s instead of 3, in its own commit, so group threads can name who is typing.
- **11c Thread and bubbles**: bubble shape and fills (sent is flat green with a lit top edge, no gradient), runs, names inside, faces, day and date pills, drag for times, photos, files, reply quote, typing bubble, jump key. Arrivals have full height at once; the thread above moves only by transform.
- **11d Composer and send**: glass composer, send key, growth, the + menu, file chip, the sent bubble rising, receipts.
- **11e Hold, reactions, Seen by, polls**: press and lift (450ms, 10px slop, as today), reaction bar and menu, reactions in the opposite colour of their bubble (yours with the champagne ring), double-tap Like, Seen by pill and sheet, poll card and See votes.
- **11f Details, mute, empty, new**: phone push and desktop column, mute menu, first run, New message, hello card and starters.
- **11g Motion tests**: the 11 interrupt cases and the Reduce Motion run as Playwright tests on the fixture, plus clips in the PR. Each earlier PR lands with its own cases.
- **11h Pin sync (held draft)**: pins move from the device to the account. The migration (`messages/pin-sync/20261031150000_golf_conversation_pins.sql`) is drafted and never applied until Nick runs it after first deploy. Follow `messages/pin-sync/PIN-SYNC.md` and its defaults D1 to D9: device pins copy up once on first sync, up to the cap; a new pin goes at the end; no reorder UI, with the position column kept.

Behaviour: same messages hook, writes and realtime; nothing new is collected. Data: one additive field (`gradYear`, already read by the directory loader) and two more columns on the conversations read (the viewer's own `notification_level` and `muted_until`, for the mute glyph). No migration. Video length isn't stored, so a video file reads "Video · 18 MB", not a duration.

Nick's answers, 31 Oct 14:32 ("no to announcement typing should be tracked, and yeah as long as it's smooth"):
- No Announcement row in the + menu.
- Typing is tracked: dots on inbox rows and pins, and group threads name who is typing (11b above). No migration; every composer already broadcasts typing.
- The `send`, `pop` and `lift` springs pass the 0.1 bounce cap in `lib/motion.ts` and are signed off "as long as it's smooth". 11g's motion check is the proof; record his words in the code comment and its test.

Nick's answers, 31 Oct 15:26 ("No don't add camera pins sync is a go. Research how to do it"):
- No Camera row. The + menu is Photos, File and Poll (Photos already offers the camera on iPhone).
- Pin sync across devices is approved. It needs a column and a migration, so it ships as its own held draft PR after the rest of 11a to 11g, with the migration drafted and never applied until Nick runs it after first deploy, one at a time like the other held migrations. The Messages package carries the plan (schema, security, realtime, ordering, conflicts, limits). Until that PR lands, pins stay on the device.

## PR CT0a to CT7. CoachHelm Team (the hole)

Its own package in `coachhelm-team/` (read its `README.md` first): `01-BRIEF.md`, `02-PLAN.md` (file by file against main 75b4956, PR by PR), `03-DATA-CHECKS.md` (every figure, the loader caps, what's real on staging), `04-FIDELITY-SPEC.md` (values, states, taps, motion; section 8 is the final word on decisions), the build contract `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md` and `08-ACCEPTANCE.md` (these win over 04 on values), `capture/capture.mjs` (`--id`, `--state`, `--motion`) and `redesign/coachhelm-team.html`.

Where: new `screens/coachhelm/team/`, new `data/coachhelm-team.ts`, one branch in `routes/coachhelm.tsx`, preview route `/clubhouse-preview/coachhelm-team`. Behind the new `coachhelm_team_board_v1`, off in every environment; with it off every CoachHelm address renders as today.
What: the coach's CoachHelm board becomes a golf hole showing where the team gives back strokes, a spot card with every player's bars and every open read at that spot, a fifth Course tab (course, scoring and pressure reads, the team's to-par by week and by course, the team against Tour on par 3s, 4s, 5s, penalties, doubles and the first hole, and a course sheet), the huddle, roster finger-prints, This week stories, Working on and the track record. Every open read per player shows (3 needs work and 1 working) instead of one.
Order: CT0a (only reads actually drawn count as shown), CT0 (flag and read-only loader), CT1 shell and the hole, CT2 spot card, CT3 sheets and desktop inspector, CT4 stories, CT5 huddle, CT6 roster, Working on and track record, CT7 motion.
Data rules: the app's words and one decimal win over the drawing; reads keep CoachHelm's order; the team figure is worked out from the current roster; Assign as focus stays a proposal the player accepts. No migration and nothing new collected.
Shared with Lenses: one read sheet (whichever lane lands second imports the first), and Lenses' desktop rail uses this lane's loader, so CT0 lands first.
Calls settled 31 Oct. Nick (15:12): "I like having 5th tab with course stuff like reads and perf history and the 4 open reads are good", so the Course tab is in and up to 4 reads per player show. Team opens on the hole as a default he can flip (`TEAM_BOARD_FIRST_VIEW`); the rest of the defaults he can flip are listed in the package `README.md`.

## PR CR0 to CR6. CoachHelm read

Design page: https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK (v5; local copy `coachhelm-read/redesign/coachhelm-read.html`). Its own package in `coachhelm-read/` (read its `README.md` first). The build contract: `05-SCREENS.md` (43 screen IDs, every subscreen, sheet, menu and state with its design link, app route and roles), `06-SCREEN-SPECS.md` (box, type, colour, hit area, data and contrast per screen), `07-MOTION.md` (26 motion rows with trigger, values, curve, interrupt and Reduce Motion), `08-ACCEPTANCE.md` (pass/fail checks per screen ID and per CR PR, and the side-by-side check). Background: `01-BRIEF.md`, `02-PLAN.md` (file by file against main 75b4956; its PR 0 to PR 6 are CR0 to CR6 here), `03-DATA-CHECKS.md` (94 figures to their `InsightEvidence` field), `04-FIDELITY-SPEC.md` (the first pass; 05 to 08 win) and `capture/capture.mjs` (`--id <ID> --state <state>` for a design and app pair, `--motion <M-READ-nn>` for clips). Where it and this brief differ on the read, the package wins.

Where: a new view on the CoachHelm route, `routes/coachhelm.tsx?view=read`, behind the new `coachhelm_read_v1`, off everywhere. Every link to a read goes through `readHref(player, insight, on)` in `data/coachhelm-views-shape.ts`; with the flag off it returns today's Deep dive address. New `screens/coachhelm/read/`, `styles/coachhelm-read.css` (`.ch-hr-` prefix), `data/coachhelm-read-view-shape.ts`, `data/coachhelm-read-view.ts`, `data/coachhelm-read-calls.ts`; preview `/clubhouse-preview/coachhelm-read`.
What: one read answers what is off (headline, ladder, worth), where it shows up (observed counts), why CoachHelm thinks so (counted, likely or not traced yet) and how sure, then what to do; how it has moved and the rounds behind it sit beside as evidence. Phone keeps the green bar; desktop is the sidebar, glass bar and three columns.
Order: CR0 first and on its own (on main a player can see the arms of a likely cause: `diagnosisFor` keeps them for every role and `DeepDive.tsx` draws them; strip them for players), CR1 plumbing and the flag, CR2 phone cards, CR3 desktop, CR4 `ReadSummaryCard` for the Board and the shared peek sheet, CR5 motion and states, CR6 tests and capture.
Data rules: the page says only what the read stores. A likely cause is coach only and shows its slice alone; players see "Not traced yet". Movement reads Before and Now. Worth says "estimated". No migration, no new write, nothing new collected.
Calls built as defaults Nick can flip (one `READ_CALLS` config): pictures back in the read (yes); players see Where it shows up but never a likely cause (yes); team pool on the ladder when `coachhelm_team_pool_v1` is on (yes).
Check before the first deploy: `coachhelm_team_pool_v1` reads production true and preview true in `config/feature-flags.yml`, not off.
Shared with other lanes: the Board and the player file call `readHref()` and don't get edited here; Team's read sheet and Lenses' EvidenceSheet become one peek sheet whose contract is written identically in Team 06 and Lenses 06 (it draws its own head; fixed 4 Nov, completeness pass); Reduce Motion crossfades use `CH_FADE_MS` (180ms today) here and in Lenses, per SHARED-6; `classifyNav` drops the query, so `?view=read` needs a shared fix to push instead of fade.

---

## PR L0 to L6. CoachHelm Lenses (coach and player view of one player)

Its own package in `coachhelm-lenses/` (read its `README.md` first; it calls these PR 0 to PR 6, and `02-PLAN.md` section 13 is the final word). Behind `coachhelm_player_file_v1`, off everywhere, no migration.
What: one file per player replaces the chip strip card, Deep dive and Standing pages, with an "As {first name} sees it" lens for coaches. The coach's plan stays coach only and is edited in a sheet with the existing `setIntent`.
First and on its own: L0 fixes a live leak where the coach's Deep dive can show a player's private goals.
Nick's answer, 31 Oct 15:26 ("They see against pga tour and team averages"): players compare against the PGA Tour and team averages only. No teammate dots, named or not.
Shared with Team: one read sheet. The desktop rail lists players from its own roster query; each row's top read comes from Team's CT0 loader under CT0a's drawn-only rule, so CT0 lands first (fixed 4 Nov, completeness pass). Lenses also exports `playerFileHref(playerId, at?, on)` (02 §2.2) for Ask and Read. Its PRs are L0 to L6 with L5a and L5b. Reduce Motion fade is `CH_FADE_MS` (180ms today) in both lanes.

## PR AK0 to AK12. CoachHelm Ask

Design page: https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA (v13; local copy `ask/redesign/coachhelm-ask.html`). Its own package in `ask/` (read its `README.md` first): `01-BRIEF.md`, `ASK_REDESIGN.md` (the design document; §6 and §6b hold the calls), `02-PLAN.md` (file by file against main 75b4956, PR by PR; §18 lists where the code differs from the drawing and wins), `03-DATA-CHECKS.md` (every figure to its field or query), `04-FIDELITY-SPEC.md`, the build contract `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md` and `08-ACCEPTANCE.md` (these win over 04 on values), and `capture/capture.mjs` (`--id`, `--state`, `--motion`).

Where: the CoachHelm route's Ask tab, behind the new `coachhelm_ask_v2`, off in every environment; with it off today's Ask renders unchanged. Player Ask is behind `coachhelm_player_ask_v1` on top of it. The lineup flow also needs `golf_tournaments_v1`. Preview route `/clubhouse-preview/coachhelm-ask?scene=&stage=`.
What: Ask works like Claude: live steps that fold, real visuals with read chips, artifacts in a side pane (desktop) or pushed screen (phone) saved to a Documents folder only on Save, a one-card practice brief shared with the practice-plan lane (fixed 4 Nov, completeness pass; the Ask page's four paged questions are not built), a player Ask with a weekly allowance whose amount is never shown, and one create flow for every tab (event, announcement, travel, board, poll, qualifier, lineup, task, goal, round note, drill) on the shared kit in `coachhelm/AGENT_KIT.md`.
Order: AK0 plumbing and the switch, AK1 answer card and steps, AK2 read chips and Sources, AK3 tool cards and follow-ups, AK4 confirm, commit, receipt and Undo, AK5 artifacts, AK6 and AK7 the new reads and visuals, AK8 tone and CoachHelm knows, AK9 practice brief and Save to a folder, AK10a player Ask, AK10b allowance, AK11a to AK11e the create flows, AK12 capture and fidelity.
Held migrations, written and never run (each applied one at a time on Nick's yes): HM1 `20261101090000_coachhelm_action_runs_hold` (the Undo hold; AK4, and quick chat's QC4, stay flag off until it is applied), HM2 `20261101090100_coachhelm_ask_tone_and_facts`, HM3 `20261101090200_player_ask_conversations`, HM4 `20261101090300_ask_allowance`, HM5 `20261101090400_golf_drills_team_bank` (fixed 4 Nov: superseded. There is one drill bank, N-00's `golf_team_drills` in its held `20261026010100`, in `prerequisites/`; Ask's drill flow, the builder and quick chat all write it through `createTeamDrill` or `copyLibraryDrill`).
Nick's answers, 31 Oct: announcements post when the coach presses Post, with an 8 second Undo, and players are told only once Undo closes (15:26, "Yes"); players compare against the PGA Tour and team averages only. Boards and polls stay drafts in the coach's Messages composer.
Calls settled as defaults Nick can flip ("Handle any other questions they have"): the drill flow is built but off until N-00's held `20261026010100_golf_team_drills` runs (HM5 superseded, 4 Nov); the lineup shows only with Tournaments on, and "Set the lineup" has Undo while Lock is a separate card with no Undo; no Lift flow until Lift has a table; Request more follows `HELM_CUSTOMER_EMAIL_ENABLED`; the qualifier asks no exemption and has no tie rule; the round note is always shared and appends.
Data rules: nothing is written before the coach's press; Undo inside 8s leaves no row and tells nobody; every figure has a read chip; the putt band is 3 to 5 ft and strokes gained is against the scoring baseline; nothing new collected from shot tracking.

## PR QC0 to QC6. CoachHelm quick chat

Its own package in `coachhelm/` (read `README.md` first, then `01-BRIEF.md`, `TASK_FIELDS.md` and 05 to 08). Behind `coachhelm_quick_chat_v1`, off everywhere; coaches only.
What: the Helm key takes the sparkle's 44pt slot in the green bar (`TopBar.tsx:104`) and pours out a Glass panel (phone 10pt from each side, desktop 432 wide). A task runs inside it: live steps, a question card when the coach's words leave a gap, a confirm card that draws the real object with every value it will write, then a receipt with an 8 second Undo and the players lighting up once it closes. Closing mid-task turns the key into a live pill.
Nick, 31 Oct: "I like the glass", fields "need to be accurate", motion "smooth and buttery". The rest he left to the lane; settled as defaults he can flip (01-BRIEF §5): drop-down on phone too, Undo 8s held on the server, coaches only, live pill on, plans save to a named folder in `golf_documents.folder` (default "Practice plans"; fixed 4 Nov, one folder model with Ask and the builder), the message card's Send is the coach's own press under the same hold.
Rides on Ask: AK1 steps, AK4 confirm and receipt with the Undo hold, AK9 practice brief, AK11 create flows. The hold needs Ask's held migration HM1 (`20261101090000_coachhelm_action_runs_hold.sql`, written, not run); QC4 ships with flags off until it is applied on Nick's yes. One new spring, `pour` {0.42, 0}.

## PR PP0 to PP9. CoachHelm practice plans (lane 6)

Design page: https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5 (local copy `practice-plan/redesign/coachhelm-practice.html`; the older `practice-plan/coachhelm-practice.html` is the 31 Oct copy). Its own package in `practice-plan/` (read its `README.md` first): `01-BRIEF.md`, `02-PLAN.md` (file by file against main 75b4956, PR by PR; §0 holds the PR table and landing order, §0.1 the defaults Nick can flip), `03-DATA-CHECKS.md`, `04-FIDELITY-SPEC.md` (page tokens to app tokens, every contrast pair, components to files), the build contract `05-SCREENS.md` (51 screen IDs across S-ASK, S-ASKD, S-DOC, S-FMT, S-BLD, S-BLDD and S-PLY), `06-SCREEN-SPECS.md` (measured redlines, then every element of every screen in light and dark), `07-MOTION.md` (M-ASK-01 to 31, M-FMT-01 to 05, M-BLD-01 to 04, M-PLY-01 and 02) and `08-ACCEPTANCE.md` (pass/fail per screen ID, state, motion row and PR), and `capture/capture.mjs` (`--id`, `--state`, `--motion`). `COACHHELM_PRACTICE_PLAN.md` is the 31 Oct plan, kept for its reasoning; the files above win on values. Where the package and this brief differ on practice plans, the package wins.

Where: CoachHelm Ask and the Practice tab's builder, behind the new `coachhelm_practice_plans_v1`, off in every environment; with it off every surface renders as today. PP4, PP5, PP8 and PP9 also check N-00's `golf_practice_plans`, which gates the Practice tab. New `screens/coachhelm/plan/` (the shared `PracticePlanSheet` in `plan/sheet/`), `styles/coachhelm-plan.css` (`.ch-cp-` prefix), `src/lib/coachhelm/v3/practice-plan/model.ts`; preview routes `/clubhouse-preview/coachhelm-practice-plan`, `-thread`, `-format`, `-builder` and `-player`.
What: CoachHelm builds a practice plan from Ask and inside the builder. It asks one short card of questions, reads the team's numbers with a picture for each read, and writes the plan block by block with a Why for each. The coach saves it to a folder and publishes it behind a confirm step with an 8 second Undo. One printed sheet draws the plan everywhere, with groups A, B and C. A coach can upload a sample plan as the format. Players get only their group's part and never a Why line.
PRs and what each waits on (`02-PLAN.md` §0):
- **PP0** flag, model types, fixtures, preview routes and the shared `PracticePlanSheet` (coach and player copy). Waits on nothing.
- **PP1** step labels, four new read tools and the read pictures in the steps list. Waits on PP0.
- **PP2** the Ask first card (kit ⑥, shared with quick chat); the turn pauses and resumes with the answers. Waits on PP1.
- **PP3** `draft_practice_plan`, the plan card, the why rule, refine chips and versions, the block sheet and swap, and the desktop pane. Waits on PP0 to PP2. Save and Publish stay inert.
- **PP4** Save to a folder (kit ⑦), the draft receipt and Undo. Waits on PP3, N-00 slice 3 and its held migrations 010000, 010400 and 010500.
- **PP5** `publish_practice_plan` (confirm-gated), the confirm card and the 8 second Undo; the push, bell and team chat post go out only after Undo closes. Waits on PP4, N-00 slice 3 and its held migration 010600.
- **PP6** print and PDF of the sheet. Waits on PP0.
- **PP7** plan format: upload, scan steps, "Here's your format". The upload can land now; "Use this format" waits on the held table `golf_practice_plan_formats`.
- **PP8** the builder helper: ghost blocks with Keep, Swap and Remove. Waits on PP2, PP3 and N-00 slices 1 and 2.
- **PP9** the player side: the push and the player Practice page with only their group's stops. Waits on PP5 and N-00 slices 3 and 4.
Order: PP0, PP1, PP2, PP3 and PP6 can land now behind the flag, with PP7's upload. PP4 and PP5 follow N-00 slice 3 and its held migrations, PP8 follows N-00 slices 1 and 2, and PP9 follows N-00 slices 3 and 4. The lane ships with the Practice tab. With the flag on and the Practice tab absent, Save and Publish read "Comes with the Practice tab" and do nothing.
Held migration, written and never run: PM1 `20261102090000_golf_practice_plan_formats` (PP7), applied with N-00's Practice migrations on Nick's yes.
Nick's calls, 31 Oct: it ships with the Practice tab; players never see Why lines; a draft shows in Documents as "Only coaches"; drills come only from the team bank and the GolfHelm library.
Data rules: the model never saves or publishes; every Why cites a read from the same turn or isn't written; nobody is told until Undo closes; this lane only reads shot tracking.
Shared with other lanes: the kit in `coachhelm/AGENT_KIT.md` with Ask and quick chat. The Ask lane registers `draft_practice_plan` in place of its planned `create_practice_plan`, Folders are settled (completeness pass, 4 Nov): the name in `golf_documents.folder` for Ask, the builder and quick chat; one drill bank, N-00's `golf_team_drills` (HM5 superseded); a plan needs a practice event, so the event confirm comes first. N-00 and N-10 plans are in `prerequisites/` and their screens are restyled per `practice-plan/05` (`02-PLAN.md` §C.1 to §C.9).

## PR 12. Motion and Reduce Motion pass

Where: `tokens.css` motion tokens, `shell.css` reduced-motion blocks.
What: check every screen above against DESIGN_LANGUAGE.md section 8. Press 0.97 on buttons and tappable cards, wash on rows; push and sheet on `--ch-ease-spring-smooth`; segmented chip on `--ch-ease-spring`; chart marks grow once when first in view, never on re-render. Under Reduce Motion nothing travels and crossfades are opacity only, over `CH_FADE_MS` (180ms today). Animate transform and opacity only.
Tests: Playwright with `reducedMotion: 'reduce'` on one screen per PR above, asserting no transform transition runs.
For Nick (list in the PR body, change nothing): today's `ui/Menu` rows are 34pt, under Apple's 44pt; `.ch-btn--primary` keeps its own gradient in `ui.css`, which SHARED-2 would not allow on a new surface. Show each with a screenshot and ask whether to change it in a follow-up.

---

## Later: gradient follow-up (not part of PRs 1 to 12)

Nick, 31 Oct: "Yeah just document them I guess. It's already shipped so" and "Well worry about the redesigns rn". This section is a record for later polish. Do not build any of it now, and do not start redesign work for these screens. The source is `GRADIENT_TEXT_SWEEP-2026-10-31.md` in this folder (884 spots on 43 screens, checked against `main` at 75b4956).

Nothing here fails WCAG AA. The lowest ratio anywhere is 5.0:1 in light (Team Hub's amber strip count) and 7.0:1 in dark. The problem is the look: dark type sitting on a tinted, uneven page between cards that barely stand off it.

**1. The flat page.** The only piece here that ships now, inside PR 2, because the approved redesigns sit on it. On its own it takes the gradient out from under every screen below, phone and desktop:
- Phone: `shell.css:2452` (`--ch-light-canvas`, `--ch-light-paper`, `--ch-workspace` on `.ch-canvas`) and `shell.css:2448` for `.ch-app` behind it.
- Desktop: `shell.css:2322-2327`, plus the green mist `.ch-canvas::before` at `shell.css:2330-2345`, which makes the top-left darker than the rest.
- Tokens: `tokens.css:474` (`--ch-light-canvas`) and `tokens.css:487-493` (`--ch-light-paper`). In dark the key light stays (`tokens.css:942`) and the paper tint is already off (`952`).

**2. The green fade under the top bar.** `.ch-topbar::before` at `shell.css:3106` (phone) and `shell.css:3140` (desktop) paints `--ch-scroll-edge-down` (frame green at 26% to transparent over 14px, `tokens.css:529-530`) once the page scrolls. The redesigns keep it as today (the bar is unchanged and the Classes notes keep the 14px shade). Later: decide whether it should be a neutral shade on the flat page instead of green.

**3. The 34 screens no redesign covers.** After PR 2 the page under them is flat, but their heads, notes and lists still sit straight on it. Later, each moves its text into cards with the same surfaces, grouped by area, the area with the most text on the page first (phone text runs in brackets):
- CoachHelm (300): Standing / Deep dive for a player (196), CoachHelm for the player (32), CoachHelm board (30), coach's view of a player (25), Ask (8), Track record (3), Brief (3), Monday brief (3).
- Qualifiers (263): qualifier detail for a coach (88) and a player (69), new qualifier form (46), qualifier selection (43), qualifiers list for a coach (7), my qualifiers (5), qualifiers list for a player (5).
- Calendar (232): coach (177), player (55).
- Rounds (206): my rounds (104), team rounds (68), new round setup (15), round review (13), live now (6).
- Team Hub (118): coach (103), player (15).
- What's new, Recruiting, Settings (99): What's new (42), Recruiting (32), Settings (25).
- Tournaments (56): tournament desk (18), tournaments home (10), tournament review (8), history (5), lineup (5), live (5), player view (5).

## Wiring pass notes (4 Nov 2026)

- Ask release needs `import { after } from 'next/server'` in the CoachHelm stream route; receipts read back the domain row (`updateTag` works only inside a Server Action).
- CR0 (the Why role filter in `diagnosisFor`) and Lenses PR 0 (the goals share filter in `readPlans`, `data/coachhelm-dive.ts:53`, callers 121 and `coachhelm-player.ts:194`) ship first and alone with every flag off. A test proves a private player goal never reaches a coach's shape and a player's payload never carries a likely cause's drivers.
- Every lane's 06 Wiring section and 08 W- checks are part of each PR's definition of done.

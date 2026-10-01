# P013 — CoachHelm: verification

Only what was observed. Gates are in `docs/clubhouse/PROGRESS.md`; the per-gate
checklist is `docs/clubhouse/screens/coachhelm.md`. Results marked "as reported
by the lead" are the lead's entry in `PROGRESS.md` (2026-09-30), not something
re-run when this file was written.

## Current verification status

```text
Status:     partial
Commit/PR:  agent/clubhouse, 8476314a7 (the build); these docs were written
            afterwards and not yet committed
Date:       2026-09-30
```

## Static checks

| Check | Command | Result |
| --- | --- | --- |
| Typecheck | `npm run -s typecheck:fast` | not run in this pass (docs only); no result is recorded for it in PROGRESS.md |
| Lint | `npx eslint` on the changed files | not run in this pass; no result is recorded for it in PROGRESS.md |
| Clubhouse check | `npm run -s clubhouse:check` | `npm run -s clubhouse:check` exit 1 in the docs pass (its own 34 unit tests pass, 0 fail): 86 violations, all pending the lead's merge of the sidecar and `registry.mjs sync`. 81 say CONTRACT.md or an action names a Bridge ID that is not in `bridge-contracts.json` yet (40 for P012, 41 for P013: the hand contracts and the IDs the actions use), and 5 say a generated file is stale (`CLUBHOUSE_PAGE_MAP.md`, `CLUBHOUSE_ACTION_MAP.md`, `CLUBHOUSE_STATUS.md` and the two CONTRACT.md tables, which `sync` writes). No other rule fired. |
| Registry and contract check | a read-only simulation of `checkRegistry` with the 28 hand contracts merged in memory and CONTRACT.md rendered from the registry (a throwaway script; nothing written to `bridge-contracts.json`) | 0 violations with both pages' 57 hand contracts merged in memory (29 for P012, 28 for P013) and CONTRACT.md rendered from the registry, which is what `sync` writes; sidecar hygiene problems: 0. `bridge-contracts.json` was not touched |
| Knowledge check | `npm run -s docs:check` | not run |
| Build | `npm run build` | not run: no `'use server'` file changed (the page calls existing server actions, and the loaders and screens are server-only and client modules) |

## Automated tests

| Test | Contract | Result |
| --- | --- | --- |
| `src/clubhouse/__tests__/coachhelm.test.tsx` (112 cases) | every catalog row of kinds 0 to 5 that is not preview (CH-13001 to CH-13901) named in a test title, and the hand contracts listed below | pass: `npx vitest run src/clubhouse/__tests__/coachhelm.test.tsx` exit 0, 112/112, run when this file was written. Mutation checks (about 160, all caught after a second pass; the `?view=` guard 3 of 3) as reported by the lead |

The hand contracts are all `reserved` in the registry: none of the test titles
carries a Bridge ID yet, and the registry marks a hand contract `implemented`
only when its test file names the ID. What the file covers today:

| Contract | Covered | Test (a leading phrase of its title) | What the tests do not show |
| --- | --- | --- | --- |
| 130101 coachhelm opens for the role | yes | “CH-13801 one focus: the page is labelled by its title”; “CH13-4 the header counts the players with an open signal, never the rows behind them; the pulse lists what the program needs”; “by player: each with their top signal and how many they have”; “a coach gets their board for the team the shell resolved; a player gets their own” |  |
| 130102 the focus is the top insight that is not working | yes | “the focus is the top-ranked insight that is not working”; “a picked insight is the focus and leaves the lists”; “with only strengths there is no focus and they are all listed as working”; “the lists and the pulse are capped: five to look at, five working, six pulse rows”; “CH-13701 CH-13803 choosing another insight puts it in the focus card” |  |
| 130103 players are ordered most pressing first | yes | “players: the most pressing top insight first, then the most signals, then the name; a strength last”; “a player whose top insight is a strength comes last, even when that insight’s own priority is high”; “by player: each with their top signal and how many they have”; “CH-13701 choosing a player shows their focus, with the selection haptic” |  |
| 130104 the Fairway drills' addresses land on a screen that exists | partly | “CH-1301 no CoachHelm address says "hasn’t been rebuilt yet" any more: ?view=deep-dive is the Deep dive (coachhelm-dive.test), ?view=insights is the board”; “?view=development (every stored dev-plan notification) lands on Stats Development, not a placeholder”; for each of profile, standing and deep-dive in `coachhelm-views.test.tsx`: “reads for the session’s player and nobody else, whatever the address says”, “CH-13304 CoachHelm off”, “a gate lookup that failed is the view’s own did-not-load”, “a coach is a coach here” | A coach following `?view=development` is not run (the redirect is before the session, read in the code). |
| 130105 open signals follow dismissals | yes | “CH-13703 CH-13901 Dismiss: the warning comes first, then the write”; “Undo brings it back: the write restores the state it had, and the focus card returns”; “dismissing a player’s last signal takes them out of the count of players as well as of signals” (Priya, whose top card is an open finding); “CH13-4 the subtitle counts the players the board has a current finding for, in the singular when it is one” |  |
| 130106 insights are generator output only | yes | “the downhill penalty: two make rates as bars, no gauge”; “the lede is the first sentence and the reasoning the rest”; “a lifetime value says All rounds and counts rounds; a count keeps its decimal”; “the generator’s placeholder recommended action is not shown as a drill”; “ahead of the cohort at low priority is working, and its gauge is the green one”; “a value with no comparison draws no gauge and still names its sample”; “a break gap is a finding” |  |
| 130204 the route skeleton takes the roles shape | yes | “the route’s skeleton takes the signed-in role’s shape, and the player’s until it is known”; “the loading file is the Clubhouse skeleton inside Clubhouse, and Fairway’s everywhere else” |  |
| 130411 a failed read is never drawn as empty | yes | “CH-13201 an empty feed with insights on file is the feed having failed”; “CH-13201 an empty feed whose visible read fails is an error, and so is a failed feedback read”; “an empty feed where the player dismissed every insight themselves is not a failure”; “an insight the player un-dismissed, or a row the feed could not draw”; “CH-13202 heads that come back empty while insights are on file are the read having failed”; “CH-13202 a failed visible read is an error, logged”; “CH-13202 a failed roster read is an error (never an empty team), and the pulse still loads” |  |
| 130608 a failed gate lookup is a failed read not off | partly | “CH-13201 a failed gate lookup is a failed read, not "off"”; “CH-13202 a failed gate lookup is a failed read, not "off"” | The loaders’ results are tested; what the coach’s board then draws (the empty pulse line beside the CH-13202 notice) and the logging of the gate failure are not. |
| 130702 writes refuse offline | partly | “writes refuse offline: nothing is sent and the coach is told, with Retry” | Only Assign is forced offline; Dismiss and Undo go through the same useAction and are not. |
| 130801 controls follow the role | yes | “CH-13801 one focus: the page is labelled by its title”; “a coach gets their board for the team the shell resolved; a player gets their own”; “Share with the player has no action behind it” |  |
| 130802 a coach reads only the teams active players | yes | “the team’s players only, each with their top insight and how many signals they have”; “a coach gets their board for the team the shell resolved; a player gets their own”; “CH-13308 a coach with no team gets a first-run page, not an error or a redirect”; “CH-13308 a coach session whose resolved team is not a coach team is never handed a team’s players” | That the pulse and this page resolve the same team is not tested. |
| 130803 a player reads only their own insights | yes | “a player needs no team: their insights are their own”; “a coach gets their board for the team the shell resolved; a player gets their own”; “CH-13301 CH-13302 a real first run counts the countable rounds posted” | What the delivery action itself scopes on the server is not tested here. |
| 130804 server actions are the gate | no | — | Read, not run: no test forces a server refusal. |
| 130805 the page gives clubhouse only behind the flag | yes | “the page gives a Clubhouse coach or player the new screen, and Fairway’s page is unchanged everywhere else” |  |
| 130806 assign is offered only for a finding not yet made | yes | “a top insight that is working can be assigned as a keep-doing focus, as the board draws it on Theo (Q-80), or dismissed”; “CH-13601 an insight that already has a focus made from it opens assigned, still waiting on the player”; “only focus areas that still stand count”; “a failed focus-area read leaves Assign available and is logged”; “a focus area already made from the top insight, and the drill’s description, come with it” |  |
| 130901 change landed | yes | “CH-13702 CH-13403 Assign as focus”; “CH-13703 CH-13901 Dismiss: the warning comes first, then the write”; “Undo brings it back: the write restores the state it had, and the focus card returns” | The absence of a toast is asserted for Assign only; Dismiss and Undo pass an empty done message (read in the code). |
| 130902 assign makes a proposal the player accepts | yes | “CH-13702 CH-13403 Assign as focus”; “CH-13601 an insight that already has a focus made from it opens assigned, still waiting on the player”; “the live writes are the actions the Fairway Brief uses, unchanged” |  |
| 130903 an existing active focus is the outcome wanted | yes | “a player who already has an active focus on the metric is the outcome wanted” |  |
| 131201 this visits changes stay while the page is open | partly | “CH-13702 CH-13403 Assign as focus” | Only the chip surviving a change of player is asserted; the dismissed notice surviving one, and a reload, are read in the code. |
| 131401 retry finishes the job | yes | “CH-13001 a failed assign says so and keeps the button; Retry that works finishes it, chip included”; “CH-13002 a failed dismiss says so and keeps the insight; Retry that works shows the notice”; “CH-13003 a failed undo says so and keeps the notice; Retry that works brings the insight back”; “CH-13403 Undo reads Undoing while it works” |  |
| 131402 try again rereads the page | yes | “CH-13201 the insights fail to load: said so, Try again asks the server again”; “CH-13202 the players fail to load: said so, Try again asks the server again”; “CH-13203 the pulse fails to load: said in its place” |  |
| 131403 undo restores the state the insight had | yes | “Undo brings it back: the write restores the state it had, and the focus card returns”; “Undo restores the state the insight had: a matured one comes back matured”; “the live writes are the actions the Fairway Brief uses, unchanged” |  |
| 131501 the page is as fresh as its last read | partly | “CH-13703 CH-13901 Dismiss: the warning comes first, then the write” | router.refresh not being called is asserted after a Dismiss only, not after Assign or Undo. |
| 131807 no axe violations in the axe preview states | no | — | Not a vitest test: it needs the dev server; the run is the lead’s, logged in PROGRESS.md. |
| 131901 phone layout | partly | “on the phone the page is its own layout: the same boards, with the players as a row of pills”; “CH-13701 on the phone, choosing an insight brings the focus into view” | The tests assert the phone frame class, four player buttons and the scroll into view; the shell top bar and the sideways pill row are CSS and the shell’s slot, not tested here. |
| 132101 loader reads in rounds | partly | “the team’s players only, each with their top insight and how many signals they have”; “their feed, ranked as the feed ranks it, each insight with its drill’s description”; “a failed drill read keeps the drill’s name and length, and is logged”; “a failed focus-area read leaves Assign available and is logged” | The calls and their arguments (ids, limit 1, limit 30) are asserted; that the reads run together, not one after another, is read in the code. |
| 132301 failures reported | partly | “a failed drill read keeps the drill’s name and length, and is logged”; “CH-13201 a feed that throws is an error, logged”; “CH-13202 a failed visible read is an error, logged”; “CH-13202 a failed roster read is an error (never an empty team), and the pulse still loads”; “a failed focus-area read leaves Assign available and is logged” | chReport and chTrail are mocked in this file and never asserted; the gate, dismissed, rounds, players and heads logs are not asserted either. |

Eighteen are covered, eight partly and two not at all. A phrase in quotes is the
start of a test's title in `coachhelm.test.tsx` (each was checked against the
file); the lead adds the Bridge ID to those titles when flipping a contract to
`implemented`.

What the suite forces, beyond the catalog: it loads a player's and a coach's
data through the loaders with a fake database and checks which ids every read is
given, that a coach with no resolved team reads no player, that the delivery
actions' empty answers are told apart from a first run, that the gate's off
reasons are kept or dropped, and that the page and its loading file take the
Clubhouse or Fairway branch. It presses Assign, Dismiss and Undo once and lands,
then with a refusal and Retry, and forces Assign offline.

## Visual verification

### Desktop

```text
Viewport:  1280px (preview, /clubhouse-preview/coachhelm and coachhelm-player),
           looked at by eye by the lead on 2026-09-30, as reported in
           PROGRESS.md
Reference: design/handoff/Coach - CoachHelm.html and Player - CoachHelm.html
Result:    looked at by the lead, as reported; no side-by-side pixel comparison
           and no measured spacing, type or radius pass is recorded (the
           checklist's desktop gate is unticked)
```

### Phone

```text
Viewport:     390px (preview), looked at by eye by the lead on 2026-09-30, as
              reported in PROGRESS.md
Device/shell: not on a real iPhone (npm run ios:dev, owner)
Reference:    design/handoff/Coach and Player - CoachHelm - Mobile.html
Result:       built to the approved spec and seen at 390; no iPhone pass, no
              measured touch-target pass
```

## Forced states

| State | Contract | How forced | Observed result |
| --- | --- | --- | --- |
| Skeleton | CH-13401, CH-13402, 130204 | tests (both shapes, the role's shape, inside and outside the shell), `?state=loading` | the Clubhouse skeleton in the shell, Fairway's outside it |
| Empty | CH-13301 to CH-13310, 130411 | tests, `?state=empty`, `norounds`, `noroster`, `quiet`, `off` | distinct from a failed read; a failed gate, feed, roster or visible read is an error, never "no insights" |
| Server failure | CH-13001 to CH-13003, CH-13201 to CH-13204 | tests, `?state=failed`, `pulsefailed`, `failwrites`, `failundo` | toast or notice with its code; the button, insight or notice stays |
| Retry | 131401, 131402 | tests | the same write again; the chip, the notice and the returned card follow; Try again asks the server again |
| Offline | 130702 | test, Assign only | nothing sent; the shell's toast names it |
| Permission | 130801 to 130803 | tests | no coach control for a player; only the team's active players; only a player's own insights |
| Server refusal | 130804 | read, not run | no test forces a server refusal |
| Existing focus | 130903 | test, `?state=duplicate` | assigned, said in a toast, not an error |
| Dismiss and Undo | CH-13901, 131403 | tests | the notice keeps Undo; Undo restores the state it had |
| The player's views | 130104, CH-13260, 13270, 13271, 13280 to 13283, 13304, 13360, 13361, 13370 to 13384, 13460, 13470, 13480 | tests (each view: ready, off, failed, empty or first run, early or partial, each part failed), `?view=profile\|standing\|deep-dive` and `?state=` | profile, standing and deep-dive are the player's own views; development goes to Stats' Development; insights draws the board; a failed read is its own notice, never an empty page |

The `?state=` entries name the preview state that draws each state. Only the
ones the axe run walks (listed under Accessibility) are recorded as visited in a
browser, and none was forced against a live session.

## Accessibility

```text
Axe:            `npm run clubhouse:a11y` clean at 1280px and 390px over ten
                preview states, 20 runs (as reported by the lead). Walked: the
                coach's default, assigned, empty, failed, off and loading; the
                player's default, empty, norounds and failed. Not walked: the
                coach's noroster, pulsefailed, quiet, failwrites, failundo and
                duplicate, and the player's working, off and loading.
Keyboard:       no keyboard walk of the page was done; every control is a native
                button or link (no test presses one with the keyboard).
VoiceOver:      not tried on a device.
Focus:          no dialog and no form on the page; focus was not otherwise
                checked.
Reduced motion: CH-13601's rule for Animations off is in the stylesheet; not
                exercised in a browser.
Contrast:       covered only by the axe runs above.
Text scaling:   not checked.
```

## Performance

```text
Layout shift:      not measured
Request waterfall: none on the client; the server loaders read in rounds
                   (132101)
Large list:        not measured (the visible-insights and rounds reads paginate;
                   a coach's board loads one top insight per player, a player's
                   feed at most 30)
Animation:         the shell's tokens, plus the chip's rise (base)
Notes:             first-load JS and LCP (CH-1954) are open
```

## Swap audit section 13, the code fixes (2026-10-01)

Observed by test (`coachhelm-audit.test.ts`, `coachhelm-audit.test.tsx`,
`development.team-id.test.ts`, `dev-plan-assigned-link.test.ts`): which cards
state no finding and are drawn as notes (CH13-11); a strength measured
against the comparison the card draws, and the `deriveTone` missing
comparison (CH13-12); the shared Solid, Early and Thin words (CH13-10);
the generator's sample unit and the "As of" line (CH13-9); out-of-date reads
marked from the player's completed rounds, the rounds read bounded and its
failure logged (CH13-3, CH-13903, CH-13906); the players line and the open
signal count (CH13-4); the voice of the text on each board (CH13-13); the
Assigned and Acknowledged pill (CH13-16); the Ask address and strip with
CoachHelm off or unread (CH13-20); proposals read by team or no team, and
every focus-area creator writing the team (CH13-5); the bell and email link
for a Clubhouse player (CH13-7).

Not observed: any of it in a browser or on production data. The freshness
rules were run as a read-only SELECT against production: 23 of 602 visible
reads are out of date by the refresh-day rule and 12 by the window rule.
`createFocusArea`, `createPlayerFocusArea` and `createFocusAreaFromInsight`
are in a `'use server'` file: `npm run build` was not run for them here.

## Open verification gaps

- The iPhone pass through `npm run ios:dev`, and a browser pass with a real
  coach and a real player account (owner or merge pass).
- Every write and every failure against a live session, and the loading
  skeleton in a browser with real data.
- `npm run build` was not run; no `'use server'` file changed for this
  page. (The 2026-10-01 pass did change one, `development.ts`: see above.)
- The unwalked preview states in the axe run, and a keyboard walk and
  VoiceOver at 1280 and 390.
- Found in this pass, not fixed: a coach's gate lookup failure draws
  "Nothing is flagged in the pulse right now." beside the roster notice
  (130608); `docs/clubhouse/phone/coachhelm.md` still says the Clubhouse
  branch returns before it reads `view`, and that no Clubhouse screen has
  Accept; the `?view=` guard (Q-76) and Accept and Decline in Stats
  Development (Q-77) have since been built, as PROGRESS.md records.
- Found earlier, as reported by the lead in PROGRESS.md: the generator's
  player-facing copy ("you're averaging") shows on the coach's board (fixed
  2026-10-01, CH13-13: the coach's board names the player); legacy
  `formatValue` rounds count values and `buildInsightUnit` says "over N
  days" for a lifetime window (neither used here); the insight readers
  return empty on failure (the loaders probe the table to tell a failure
  from a first run).
- Q-76 and Q-77 are open owner questions; the page is built on their
  recommendations (Q-76's, and Q-77's in Stats).

## Update 2026-09-30: Accept and Decline on the player's board (Q-77) and the Tour comparison (Q-88)

Observed after the two changes (CHANGELOG.md has what changed):

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npm run test:file -- src/clubhouse/__tests__/coachhelm.test.tsx` | exit 0, 142/142 (was 112): the proposals on screen and in the loader, and the Tour in both loaders and the mapper; CH-13004, CH-13005, CH-13205, CH-13404, CH-13704, CH-13807 and CH-13902 are each named in a test title |
| Mutations | 26 one-line breaks, run one at a time | all fail a test (17 for Accept, Decline, the proposals read and its notice and the preview's writes; 9 for the Tour); two that changed nothing showed a redundant guard, which was removed |
| Typecheck | `npm run typecheck:fast` | exit 1 on other sessions' files only (hub, recruiting-upload and travel-class-conflicts tests); none in CoachHelm's |
| Lint | `npx eslint` on the changed CoachHelm files | exit 0 |
| Clubhouse check | `npm run -s clubhouse:check` | exit 1 on the registry only for this page: the seven new catalog codes have no Bridge ID and CONTRACT.md is stale, both for `registry.mjs sync` (the lead's) |

Not observed: the new preview states in a browser and in axe (the preview route
and `a11y.mjs` are not this change's to edit:
`?state=proposed|failproposal|proposalsfailed` on
`/clubhouse-preview/coachhelm-player`), a real player with a proposed focus
area, and the Tour values against a real women's team. Hand contracts 130106,
130801 and 130902 were reworded for the changes; no new hand contract is
written.

## Update 2026-10-01: the player's Game profile, Standing and Deep dive

Observed after building the three views (CHANGELOG.md has what changed). Run
from `/Users/ricknini/worktrees/helmv3/swap-audit` at `adc9c8320` (the last code
commit; the docs commit after it changes no code).

| Check | Command | Result |
| --- | --- | --- |
| Tests | `npm run test:file -- src/clubhouse/__tests__/coachhelm*.test.tsx src/clubhouse/__tests__/coachhelm*.test.ts` | exit 0: 13 files, 552 tests passed. `coachhelm-dive.test.tsx` alone: 65 |
| Typecheck | `npm run typecheck:fast` | exit 0 |
| Lint | `npx eslint` on the changed `src/clubhouse` and `src/app/clubhouse-preview` files | exit 0 |
| Clubhouse check | `npm run clubhouse:check` | exit 0: 35 unit tests, 417 files, 15 pages, 1351 Bridge IDs |
| Docs | `npm run docs:check`; `node scripts/markdown-lint-ratchet.mjs` | both exit 0; the ratchet counts 31316 violations against a baseline of 31397 for the whole branch (it first failed at +139 on MD013, from catalog and generated table rows; the P013 docs were rewrapped to 80 columns to pay for them) |
| Axe and tap targets | a one-off scan (`@axe-core/playwright`, WCAG 2.0 to 2.2 AA with contrast, plus a 44px hit-area probe like `native.mjs`) of `/clubhouse-preview/coachhelm-views` at 1280px and 390px: `view=deep-dive` (default, `q=in-pen`, `q=in-brk`, `partsfailed`, `young`, `empty`, `norounds`, `failed`, `off`, `loading`), `view=profile` (default, `partial`, `edge`, `empty`) and `view=standing` (default, `early`, `empty`, `womens`, `nobaseline`), and the Deep dive's open read on the phone | no axe violation and no page that scrolls sideways (run again at `adc9c8320`). One finding left, not ours: the shell's Home tab reads 76 x 46 under the Next.js dev indicator that sits over it in the preview. Fixed on the way: amber text at 4.47:1 on the phone's darker ivory, and the chip row clipping its tap area to 42px |
| Visual | the preview in a browser at 1440, 1280, 1024 and 390px (Deep dive: the list and the read, a read with no rounds, no trend and no plan, parts failed, the phone list and the pushed read) | read against the design intent; no screenshot is kept |

Mutation checks were not run for these views. The loader tests use the table
fake (`supabase-fake.ts`), so the filters each read sent are asserted, but no
read ran against a real database.

Not observed: any of the three views with a real player's data, a device pass,
VoiceOver, a keyboard walk (every control is a native button or link; the open
read's focus moves to its title, as `PhoneScreen` does), and `npm run
clubhouse:a11y` itself (its page list does not include these previews and is not
this change's to edit). `npm run build` was not run: no `'use server'` file
changed.

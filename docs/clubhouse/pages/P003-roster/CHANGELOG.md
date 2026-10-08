# P003 — Roster: changelog

## 2026-10-08 — The phone list shows the figure it is sorted by

From the native-feel audit (P1-3). Not yet reviewed by the owner.

- **Sorted by SG**, each phone row's trailing column shows strokes gained per round (`+0.8`, `−1.2`, `—` when there is none) over "SG / rd", with gains in green and losses in amber. The row's VoiceOver label reads the same figure. Sorted by Avg or Name, the column keeps the average and handicap; under Name, the name already leads the row (`RosterPhoneRow`'s `sort` prop).

## 2026-10-08 — Premium pass: ranks, one material, the lit ledger, the peek

Approved by the owner on 2026-10-08 (P003-A1, A3, C1; findings #1 to #17).

- **Ranks from the active roster (#2, #3).** A card's place ("4th of 7") and the
  team strip rank the active players with an average and at least three rounds
  (`rosterStandings`), never the rows a search or filter left: searching "Jo"
  keeps Jonah's place, and All doesn't rank inactive players. Under three rounds
  the card says "Needs 1 more" instead of a place.
- **One material (#1).** The player's Roster and the no-team page take the
  coach's canopy (`data-canopy`, `data-canopy-head`); the no-team page has a
  hidden h1.
- **Less chrome (A3).** The seven-coin initials stack above the title is gone on
  desktop, and the phone loses the double rule above the kicker, which is no
  longer tracked (#9). The status dot shows only under All, where it tells
  players apart (owner); under Active or Inactive every dot was the same.
- **The ledger in the light (A1).** The faces' hairlines carry a 1px rim of the
  shell's light on their sun-facing side, and the open player's ring catches a
  gilt crescent on the lit side. The peek's leading hairline takes the rim too.
  Nothing on a figure is lit, and dark, Increase Contrast and noon draw no rim.
- **The player peek (C1).** A hold on a phone row, or a rest on a desktop
  Needs-a-look chip, shows the shell's `PlayerPeek` from what the roster holds
  (`rosterPeek`: the newest round, the average, the form, the warning).
- **Findings.** The desktop panel sticks under the top bar and scrolls inside
  itself (#4); the phone requests sheet has one primary, Approve all (#5);
  without season stats the sort falls back to Name and offers no Avg or SG (#7);
  a failed team read says "your team" mid-sentence (#8); a chip only opens its
  player (#11); "a round" hides when SG is missing (#12); cards and names are
  `aria-expanded` with a short label (#13); the phone profile has one secondary
  style (#15).

## 2026-10-08 — Copy: typographic apostrophes

Roster writes its apostrophes as ’ on desktop and the phone, as Home, Stats and
Calendar do: the no-team page (CH-3306 for a coach, CH-3308 for a player), the
failed reads (CH-3201 to CH-3203, CH-3207, CH-3210), and the failures of a
removal, an approval or decline, a note, the export and a copy (CH-3001 to
CH-3007), so an offline refusal reads "Couldn’t approve Grace Liu: you’re
offline" (CH-1903) with one kind of mark. The catalog quotes them as shown, and
copy-apostrophes.test now covers the page.

## 2026-10-08 — States: one notice when two reads fail; titles without a full stop

From the states audit (2026-10-08, findings c15 and b8), desktop and phone:

- **Two failed reads, one notice (CH-1209):** when the roster and join
  requests (or the season stats) both fail, the page says so once under its
  head, "Some of this page didn't load", with one Try again that asks the
  server again (`PageRefreshNotice`). Each failed part keeps its title alone
  in its place, marking the gap, with no second alert or button. One failed
  read keeps its own notice, as before.
- **Titles:** the desktop head reads "Your players", and the state titles
  ("The roster didn't load", "Join requests didn't load", "Season stats didn't
  load", the join code's) have no trailing full stop in the source either.
- **Phone eyebrow:** the team and count are 12px, the phone text floor (F09)
  and the kit's PageIntro eyebrow; the skeleton holds the new line (WebKit 390
  and 430: no movement). The title was already the 600 sans at 31px.

## 2026-10-08 — Phone: the Mobile clubhouse pass

The phone Roster follows the Coach Home board (round 3, "fewer containers, one
feature card"), carried to every phone screen (owner: "phone too cardy"):

- **Head:** the page opens on the engraved double rule, the team and count as
  the tracked eyebrow and Roster in the bold condensed sans (no serif).
- **Join requests** are the screen's one green feature card: a gilt coin, the
  count and the names in ivory. A press darkens it under a shade for the press
  beat; it never scales (CH-3602).
- **Players:** no white card. The list hangs from a hairline under the sort,
  one row per seam, and a press tints the row 12px past its text (CH-3602).
  Inactive opens under the double rule with its heading. Avatars sit on the
  parchment with a champagne ring.
- **Profile (pushed):** the player at the top, the three figures between two
  hairlines (the Ledger's figure row), then Scoring trend, Recent rounds,
  About and the coach's note, each flush under the double rule. About's facts
  are rows on seams, not a box. The All link keeps its 44px reach over the
  first round.
- **Sheets:** each join request is a row on a seam inside the sheet, not a card
  inside a card. The ⋯ sheet's actions are rows on seams that tint under the
  finger. The team code keeps its well.
- **States:** the empty and no-team pages stay centred on the parchment; the
  failed reads are notices flush under the head. Loading draws the phone page
  on its own classes (the double rule, the eyebrow, the title, the sort and
  the rows), so nothing moves when it lands (WebKit 390 and 430). Join
  requests are the exception: the skeleton can't know of them, so when some
  are waiting their card arrives above the list and moves it down by the
  card's height (99px); most days there are none.
- The player's phone roster takes the same head and rows.

Desktop is unchanged: every new rule sits in the phone block, and the
skeleton's phone parts are hidden there (1440 captures before and after
match).

## 2026-10-07 — Team view and List view settle in

Toggling Team view and List view now settles the new layout in with a 6px rise
(base) while the old one fades out (quick), hidden from assistive tech (CH-3603,
the shared `Swap`). It runs only on the coach's own toggle: the kept layout
coming back as the page opens draws in place. A face or a list row's name
presses with the row press tint (`--ch-ledger-row-press`) over the press beat,
never a scale (CH-3602). New test: roster.test › CH-3603.

## 2026-10-07 — Roster on the Ledger

On desktop, Roster now sits on the canvas instead of in cards (owner: "flush,
not so card heavy"):

- **Join requests:** the request count is the section heading, set over an
  engraved rule, with each request as a row below it and hairlines between rows.
- **Players:** the toolbar heads the players with an engraved rule. The faces
  hang from that rule on a ruled page: hairlines between cells, and no card,
  lift or shadow. A hover or press now tints the cell instead of lifting a card
  (CH-3602). The open player's cell takes a green tint and its coin a green
  ring. The figures sit in the cell, not in a well.
- **Table:** the header well is now a quiet label row. Rows have seams and sit
  on the canvas.
- **Player panel:** a column beside the players behind a hairline, or under them
  behind a rule once they stack. Its sections sit under rules, without the
  tinted band or the facts box.
- **Head:** the old champagne border that doubled the page head's rule is gone.
  With nobody active, the empty avatar row no longer indents the team line.

The loading screen draws the same ruled faces and holds the head at 186px
(WebKit, 1440 and 1100), so the head doesn't move when the page lands. Avatars,
chips, controls and the note field keep their material. The phone and the
player's roster are unchanged.

With a player open beside the list view's table, the table drops its form
column (the panel draws that player's form), so Rounds and the row menu fit
without a sideways scroll. The column returns once the panel stacks under the
table.

## 2026-10-07 — The header's team row restored

The card team strip from earlier tonight reused the class `.ch-rs-team`, which
already names the header's avatar row ("Varsity · Fall 2026"). The strip's 10px
height and tint landed on the header: the avatars overlapped the team name over
a grey bar, for coach and player. The strip is now `.ch-rs-strip`, and the
header is back to its own row. No other class added tonight exists on `main`;
`ch-rd-season` is reused on purpose within its own component.

## 2026-10-07 — Phone title in the serif

The phone Roster title was a 28px semibold sans. It now uses the display serif
at 34px, matching every other phone page title.

## 2026-10-07 — Drawn card figures, serif title

The coach's player cards no longer end in a pill of three bare numbers (owner:
no bare numbers). The figures are drawn:

- **Scoring:** the season average with the player's place (for example "1st of
  7") and a strip showing every teammate's average, with this player's dot lit
  in the field green.
- **Strokes gained:** the figure per round with a bar running from a zero tick,
  green for gained and amber for lost.
- **Handicap:** reads as a labelled line.

The card is a solid reading sheet, and "Your players." is set in the display
serif. The player's own roster keeps handicap only, as before.

## 2026-10-06 — Display type relaxed

The owner found the display type too compact. Display headings on this page
widen (width axis 88 → 96) and the tightest tracking eases to -0.026em, as on
every Clubhouse page. Layout and content are unchanged.

<!-- clubhouse:release-audit:start -->
## 2026-10-06 — Smoothness repair

RosterPeek uses zero-duration transitions when motion is disabled.

See [repair evidence](../../SMOOTHNESS_AUDIT.md).
Normal styling and approved handoffs remain unchanged. Physical-device
verification and durable writes are still pending.

## 2026-10-06 — Whole-app release audit

Reconciled page purpose, design acceptance, contract status, wiring and
verification against the current flagged implementation. Indexed 14 mapped
actions and 8 overlay/control call sites in the [all-page
audit](../../ALL_PAGE_AUDIT.md#p003-roster). Approved handoffs and contract
IDs are preserved; runtime gaps stay explicit.
<!-- clubhouse:release-audit:end -->

## 2026-10-06 — Motion import path moves to `motion/react`

```text
PR/commit:      #2153 (agent/deps-ui-upgrade)
Design package: none; no visual or behavior change
Contract IDs:   none
Data impact:    none
Held items:     none
```

Dependency upgrade only. `framer-motion` 13 is replaced by the `motion` 14
package, so this page's animation imports change from `framer-motion` to
`motion/react`. The animation API, durations, curves and reduced-motion gating
are unchanged; Motion 14 only removed internal compatibility APIs this tree
never used.

## 2026-10-02 — Keep the player when opening desktop Messages

```text
Design package: existing P003/P007 player-to-message flow
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Contract IDs:   none added
Actions:        existing Message link in the desktop player panel and row menu
Data impact:    none; existing Messages ?player= resolution
Held items:     real-account thread resolution, delivery and physical Safari
```

Desktop Message links now include the selected player's encoded ID instead of
opening the general inbox. This aligns the player panel and list-row menu with
the phone profile and P007's existing deep-link contract. Different selected
players and keyboard activation are covered by two focused regressions;
the complete scoped Roster suite passed 68/68. See VERIFY.md for the local
WebKit observation and its limits.

## 2026-10-02 — Intuitive improvement: consistent profile context

```text
Design package: owner's mobile boards; Intuitive Software Design IMPROVE mode
PR/commit:      codex/clubhouse-design-fidelity (working tree after cca081c)
Contract IDs:   none changed
Actions:        existing event reply, acknowledgment and task state; none added
Data impact:    no endpoint or schema changes; local fixtures and mocked writes for verification
Held items:     intended-user validation, physical Safari and real-account read-back
```

Profile gutters, section gaps and figure lighting now match the parent roster at
phone widths. The existing player name, Roster back action, scoring evidence and
Message/Plan 1:1 actions remain intact. WebKit exercised the fixture
row-to-profile path; delivery, meeting creation and private-note persistence
were not exercised.

Evidence and practical limits: `VERIFY.md` and the scoped intuitive
secondary-screen report.

## 2026-10-02 — Roster: room for complete player status

```text
Design package: design/handoff/ (owner's mobile boards and depth.css)
PR/commit:      codex/clubhouse-design-fidelity (working tree)
Contract IDs:   none changed
Actions:        none changed
Data impact:    none
Held items:     physical iPhone Safari and signed-in production data verification
```

The phone roster now uses the shared sheet gradient and layered lighting. Rows
have a 72px minimum with room for wrapping status text; long attention notes
remain visible instead of ending in an ellipsis. Content and skeleton gutters
use the same 16px rhythm.

Verification: WebKit iPhone 13 populated layouts at 375, 390 and 430, plus
empty/failed states at 390. Before/after screenshots and practical limits are
recorded in VERIFY.md.

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification
log and decisions).

## 2026-10-01 — The saved-view effect lists its setter (CI lint ratchet)

```text
PR/commit:      agent/swap-audit (PR #2111 CI fix)
Design package: none
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

- **Issue.** CI's lint ratchet failed by one `react-hooks/exhaustive-deps`
  warning: the effect in `Roster.tsx` that restores the faces/list view from
  local storage called `setView` but had an empty dependency list.
- **Fix.** `[setView]`. `setView` is the `useState` setter that
  `useChSessionState` returns, and React keeps a setter's identity stable, so
  the effect still runs once on mount. Nothing a coach sees changes, so there's
  no screenshot.
- **Checked.** eslint on the file is clean; the warning total is back to the
  baseline of 59.

## 2026-10-01 — The player's Roster, read-only (owner, Q-130)

```text
PR/commit:      agent/swap-audit: 0672d5738
Design package: design/handoff/ (v2): Coach - Roster.html and Coach - Roster - Mobile.html, as the owner asked
                ("the same thing as coach except they can't click"); no player board exists
Contract IDs:   30804, 30805, 30806, 30617, 30618, 30407, 30408, 31807 (catalog CH-3210, CH-3211, CH-3307, CH-3308,
                CH-3807); 30801's meaning updated
Actions:        ACT-P003-PLAYER-VIEW, ACT-P003-PLAYER-TRY-AGAIN
Data impact:    none (two RLS-scoped reads, golf_teams and the team's active golf_team_members with golf_players, on
                tables a player already reads; no schema change)
Held items:     none
```

- **Issue.** With Clubhouse on, a player on `/roster` got the not-rebuilt
  notice.
- **Fix.** A player gets the coach's layout as plain text (`TeamRoster`,
  `TeamRosterPhone`): name, class year and handicap of the active members, no
  scores, notes, requests, invite, export or player panel, and no card or row is
  a link
  or a button (CH-3807). A separate loader (`data/roster-player.ts`) reads only
  the team's name and season and the active members. `/roster/[id]` goes to the
  list
  for a player. Roster is a sidebar entry under Team for a player and a row in
  the
  phone More sheet. Catalog CH-3210, CH-3211, CH-3307, CH-3308, CH-3807;
  contracts
  30804 to 30806; 30801's meaning now says the coach's roster is a coach's.
- **Checked.** roster-player.test 19/19, with the loader's selects, tables and
  filters asserted and 2 of 2 mutations caught (an extra column, a button around
  a
  name); five existing assertions that a player gets NotRebuilt on `/roster`, or
  that the player sidebar has no Team section, were changed on purpose; the
  Clubhouse suite 2515/2515; `clubhouse:check` clean; a browser pass at 1280 and
  390 (cards, list, phone rows). Not exercised: a signed-in player against the
  database (the loader is tested over a fake client).

## 2026-09-30 — Schedule 1:1 on desktop (Clickables gap 4); View insights in the row menu (Clickables gap 16)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Schedule 1:1 on desktop (Clickables gap 4)

- **Issue.** The desktop Roster panel had no way to plan a 1:1, which the phone had.
- **Fix.** Schedule 1:1 opens Calendar's editor with only that player invited (`calendar?new=1&with=<id>`, D-52).
- **Checked.** roster + stats-player 124/124, 2 of 2 mutations caught.

### View insights in the row menu (Clickables gap 16)

- **Issue.** The List view's row menu had no way to CoachHelm's read of a player.
- **Fix.** The menu starts with View insights, which opens CoachHelm on that player (an id not on the board opens the most pressing player).
- **Checked.** roster + coachhelm 178/178, 2 of 2 mutations caught.

## 2026-09-30 — V2 page docs (copied from Messages); eight fixes found while writing them

```text
Contract IDs:   30406 (new: CH-3306, no team) and 22 behaviour contracts without a code (30101 to 32401), all with a test
Actions:        12 (ACT-P003-*)
Data impact:    none
Held items:     roster-availability (data)
```

### Changed

- The six page docs, the manifest's actions, and the 22 behaviour contracts (core view, deep link, refresh, safe
  export, offline, the coach-only gate, private notes, refused changes, success, note kept, layout kept, note reads
  back, optimistic decisions, Approve all retry, Try again, toast Retry, Remove's warning, note on leaving the field,
  the loader, failures reported, the tests).
- A route adapter, `src/clubhouse/routes/roster.tsx`, so the role check, the team and the no-team state have a seam a
  test can reach. The page calls it for a coach with the flag on.
- The catalog gains CH-3306, and `docs/clubhouse/screens/roster.md` now says the loader reads in two parallel rounds.

### Fixed

- The toast's Retry did not finish the change on screen. It re-ran only the server call, so a retried removal left
  the player listed and the dialog open, a retried approval put the request back in the list (and Approve then failed
  as already processed), and a retried note save left the note marked unsaved. What a change does on screen now
  happens inside its action.
- Try again after a failed read still showed "No players yet": the screen kept the players and requests from its first
  render and ignored the page the server sent back. By the same code an approved player would not appear until a
  reload. The list now follows the server's page, with only the changes made since laid on top.
- A saved note read back as the old text when the player was opened again. Saving now updates the roster the screen
  holds.
- Remove player fired no warning haptic (D-70 and the phone spec both ask for one). It does now.
- A coach with no team saw Home's empty state, whose text is about Home. Roster has its own (CH-3306).
- On desktop, pressing Approve on a second request while the first was still being decided did nothing and said
  nothing. Every Approve and Decline now waits until the decision in flight has answered, as on the phone.
- The CSV export wrote a player's name as typed. A name that starts with `=`, `+`, `-` or `@` (or a tab or a return)
  could be read by a spreadsheet as a formula; it is now written as text.
- Esc inside the Remove or Invite dialog also closed the player panel behind it. It now closes only the dialog.

### Why

- D-62 and D-69: every page gets the Messages contract, and writing the contract against the code found these five
  places where the code did not keep it.

### Verification

- `npx vitest run src/clubhouse` 536/536; each new test fails with the code it guards broken (VERIFY.md).
- `npx eslint` and `npm run -s typecheck:fast` exit 0.

## 2026-09-29 — Phone build, v2 motion, haptics and page empty state

- The phone list, pushed profile, join requests sheet and ⋯ sheet on the approved design (D-50 to D-59), Approve all
  (D-55), the Calendar 1:1 seed (D-52) and the Stats `tab` parameter (D-53).
- v2 motion (D-64), v2 haptics (D-70) and the page empty state for "No players yet" (D-71); Roster moved under More on
  the phone (D-66).

## 2026-09-29 — Desktop build

- Desktop Roster on the Clubhouse loader, with the join requests, Needs a look, cards and list, the player panel, the
  coach's note, Export and Invite, and the full state catalog (CH-30xx to CH-38xx).

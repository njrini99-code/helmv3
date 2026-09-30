# P005 — Stats (player): changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-30 — Strokes gained on the player profile: legs and total on the phone, legs in the Rounds table, comparison rows, change chips, and a banner that counts rounds with shots

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new (catalog CH-5308, CH-5309, CH-5310)
Data impact:    none (reads only; no migration)
```

### The baseline is the Tour, and every figure says so

- **Issue.** The phone's SG / round figure said "vs D1" and the desktop hero only "Per round"; there is no D1 strokes gained (Q-88).
- **Fix.** The hero reads "Per round vs Tour", the phone "vs Tour", the leg card and the comparison table "strokes gained vs Tour" (the women's Tour baseline for a women's team), all from `sgBaseline`. The profile loader returns `tour`.
- **Checked.** strokes-gained.test; mutations caught for both labels.

### Phone: strokes gained by leg and in total, and on every round (CH-5309)

- **Issue.** The phone profile showed only one SG number; the four legs were desktop-only and its rounds list had no strokes gained.
- **Fix.** A Strokes gained panel after the figures: the four legs and the total, the window's mean, bars on the data's own scale, a note on which legs lose strokes. Each round in the list carries its strokes gained (a dash when it has none). Nothing yet reads "No strokes gained in this window." (CH-5309).
- **Checked.** strokes-gained.test; mutations caught: the total dropped, the round's SG dropped.

### Desktop Rounds tab: each round's four legs next to its total

- **Issue.** The table had the total only.
- **Fix.** SG total plus SG off the tee, approach, around green and putting, each signed and green or amber (`ChProfileRound.sgLegs`).
- **Checked.** strokes-gained.test; mutation caught (legs removed).

### The comparison table has strokes gained (coach: against the team)

- **Issue.** The table had scoring, fairways, greens, putts and scrambling only.
- **Fix.** SG total and the four legs lead it. For a coach the team column is the pooled mean per round of the active team over the same window (three rounds with shots needed). A player's own table shows their figure against the Tour with no team and no D1 (there is none): the profile's rule is that a player is never compared with teammates (P005 PAGE.md), so the team reference asked for on a player's own view is not built (proposed Q-91).
- **Checked.** strokes-gained.test; a mutation that lets a player's view pool teammates' rounds is caught.

### Change against the previous 10 (CH-5310)

- **Issue.** Nothing said whether strokes gained was rising or falling.
- **Fix.** A chip under the hero's SG / round (and the phone figure): green up, amber down, grey flat, with "vs. previous 10". With nothing to compare it says "No earlier rounds", or "Too few earlier rounds with shots" for one or two; Season and Qualifiers claim nothing.
- **Checked.** strokes-gained.test (loader: a delta, none, too few, season); mutations caught (chip removed, previous window ignored).

### The early-read banner counts rounds with shots (CH-5308)

- **Issue.** The banner keyed on the 18-hole round count, so a player with three rounds but fewer than three with shots saw a silent dash.
- **Fix.** Fewer than three rounds keeps CH-5305; three or more rounds with fewer than three with shots shows CH-5308: "Strokes gained needs three rounds posted with shots. Jonah has 1 of 5 rounds with shots in this window…", on desktop and the phone.
- **Checked.** strokes-gained.test; mutations caught on both views.

### Make rate by distance reaches 25+ feet

- **Issue.** The curve stopped at 20 feet because the shot stats have rates past 20 feet but no counts.
- **Fix.** The curve draws the window's putts in the bands Team stats grades (0 to 3, 3 to 5, 5 to 10, 10 to 15, 15 to 25, 25+), counted exactly from `golf_shots` (`loadPutts`, shared with Team stats) with each band's D1 mark from the same distances. Its note says the counts are putts logged with a distance (the Putting section's own total counts every putt). If that read fails, or there are no putts, it falls back to the old five bands.
- **Checked.** strokes-gained.test (loader bands and the failed read; the curve's label); mutation caught.

### Bars scaled to the data

- **Issue.** The leg route clamped at ±1.4.
- **Fix.** It scales to the largest leg, rounded up to a whole stroke, at least 1 (`sgScale`).
- **Checked.** strokes-gained.test (a −2.6 leg is 2.6 of 3 of the half height); mutations caught.

## 2026-09-30 — Schedule 1:1 in the hero (Clickables gap 4)

```text
PR/commit:      agent/clubhouse
Data impact:    none
```

### Schedule 1:1 in the hero (Clickables gap 4)

- **Issue.** A coach on a player's Stats profile had no way to plan a 1:1.
- **Fix.** Schedule 1:1 opens Calendar's editor with only that player invited (D-52).
- **Checked.** roster + stats-player 124/124, 2 of 2 mutations caught.

## 2026-09-30 — Tabs from the keyboard; a one-round trend; the profile skeleton

```text
PR/commit:      agent/clubhouse
Contract IDs:   none new
Data impact:    none
```

### Fixed (with a test that fails without the fix)

- **The profile tabs had no arrow keys.** They are now one Tab stop, and the arrows (wrapping), Home and End
  move between them and select, as in the Segmented control (52001, reworded).
- **One round, no trend.** The phone's Scoring trend vanished under two rounds. With one it now says so:
  "One round so far: 74 on Oct 3. The trend draws from the second." With none it stays out.
- **A profile loaded behind the team board.** The route drew the team page's skeleton for a player's own stats
  and for a coach's `?player=`. It now draws the profile's shape (CH-5403): the shell's role reaches route
  files through `ClubhouseMarker`.

## 2026-09-30 — Page docs, permission proven, six bugs fixed

```text
Contract IDs:   19 new behaviour contracts: 50101, 50102, 50103, 50104, 50611, 50803, 50804, 50805, 50806,
                50901, 51201, 51202, 51401, 51501, 51901, 52001, 52101, 52301, 52401 (each named by a test
                title); two new catalog rows, CH-5901 and CH-5902 (Bridge IDs 50701 and 50702, category 07)
Actions:        6 (ACT-P005-*)
Data impact:    none
```

### Changed

- The six page docs, the manifest's actions, and CONTRACT.md answering all 25 categories, with Permission
  (08) written from the route, the loader and the actions rather than assumed: a player opens only their own
  stats, a coach the team and any player on it.
- Fixed, each with a test that fails without the fix:
  - A failed player or membership read showed "That player isn't on your team" (CH-5306). The loader now
    throws, so the route error view offers Try again (50611).
  - A pending or removed team member opened as Active. The membership read now takes active and inactive
    rows only, as Roster does (50804).
  - A coach's Message opened the bare inbox. It opens the direct thread with that player, on desktop and on the
    phone (50104), as the phone spec and Messages' deep link (70102) say.
  - Changing the window while offline was not refused, so the request was attempted and the page could stay
    dimmed and busy, and a slow change never said so. It now behaves as on Team stats: refused with nothing
    requested (CH-5901), one notice after 5 seconds (CH-5902).
  - A `?player=` that was not shaped like an id reached the database, which rejects it, and the failed read
    was shown as "not on your team". The route now answers it as not on your team without a read (50804).
  - If the team's own row failed to load, the profile graded a women's team against the men's D1 averages.
    Its tour is now unknown and no benchmark is claimed (CH-5208), as Team stats does (CH-4210).
- Tests: 25 added (the route's permission and address, the loader on a fake Supabase client, the focus area
  landing, the keyboard, the offline and slow window changes, the busy state) and eight retitled to carry the
  IDs they prove; the meta test 52401 keeps the file honest. Each new test was mutation-checked.
- The catalog gains the 59xx rows, states the true empty and permission answers (CH-5306, CH-5307, CH-5208),
  and CH-5208 and CH-5402 now name tests (they said existing and preview).
- The checklist's Offline or slow network box is ticked, with its evidence.

### Found and not fixed

- `createFocusArea` (shared action, `actions/development.ts`): stores the `coach_id` the browser sends instead
  of the caller's own, and skips its roster check when the coach has no organisation or no active team
  (row-level security remains the lock). Fix it in the action.
- The profile has no profile-shaped loading state: `stats/loading.tsx` cannot read the address, so it draws
  Team stats' shape, and a profile's taller hero moves it.
- Profile tabs are not arrow-key navigable (each is one Tab stop).
- The phone profile's scoring trend draws nothing with fewer than two rounds, and says nothing.
- A coach's Back to Team and the Previous and Next links do not check for offline the way the window switch
  now does.
- v2 draws Stats with no rounds ever as a whole-page empty, "No stats yet" (D-71); not built, owner decision.

### Verification

- `npx vitest run src/clubhouse/__tests__/stats-player.test.tsx` 53/53; `npm run -s typecheck:fast` exit 0;
  eslint exit 0 on the changed files. Not run in this pass: clubhouse:check, docs:check, build, a11y.

## 2026-09-30 — v2 phone built

- `StatsPlayerPhone`, inside `StatsPlayer` so the loader, the window change, the Add focus area sheet and the
  catalog are the desktop's: a coach's Player stats with Team and Share, or a player's My stats with More;
  three figures; Game detail's five sections as chips, one at a time; the scoring line; Rounds (five, then
  All N) and Development. New catalog rows CH-5002 and CH-5807; the gaps against the board are Q-68. Nine
  tests, each mutation-checked.

## 2026-09-29 — Fidelity pass and `?tab=`

- Strokes gained by leg is the design system's StrokesGainedRoute, the Rounds count its tab pill, and a coach
  reads "Stats › name" in the top bar. `?tab=overview|game|rounds|dev` opens that tab, and Roster's "All N"
  opens `window=season&tab=rounds` (D-53).

## 2026-09-29 — Desktop build

- The profile on the RLS-scoped client in one server pass, the same page for a coach and, with the
  permissions a player already has, for a player; the focus-area sheet on `createFocusArea`; and the state
  catalog CH-50xx to CH-58xx.

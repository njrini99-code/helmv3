# Data checks: Classes, Roster and coach Home redesign

Checked against helmv3 `main` 75b4956 and the staging project on 31 Oct 2026 (read-only SELECTs). Written against design page version 3; version 5 already applies the season label (2026–27), drops "Varsity", draws the early-season state and shows "—" for missing SG. The rows that still need Nick's call are in `04-FIDELITY-SPEC.md` section 8.

Read-only. Repo `helmv3` at `main` 75b4956. Staging Supabase `ybmwektreyrwjscxlogv`, SELECT only. Today in the team's zone is Sat Oct 31 2026 (America/New_York), so the 2026–27 season started Aug 1 2026.

Paths are under `src/clubhouse/` unless they start with `src/` or `supabase/`.

## The short version

- **Most mock numbers are made up.** Staging has 5 active players and no inactive ones: Owen Carter, Jackson Hale, Tyler Hayes, Ethan Park and Mason Rivers. Cole Bennett, Ethan Pierce, Dylan Brooks, Mason Reed, Liam Ortiz and Noah Patel don't exist there. Staging has no join requests, one coach (Coach (Demo)), join code `PRH4UJF5` (not "DUG-4K7"), and no classes at all.
- **The Home "team's game" figures are close to real.** Real Last 10 values: tee +0.79, approach −3.46, around −0.16, putting −2.95, greens 62.9%, putts 32.5. The mock shows +0.6, −3.3, −0.2, −2.9, 62% and 32.6. The mock's names, deltas and the 75.8 / −0.6 are not real. Real is 75.7, +0.3 (worse).
- **This season, each player has only 2 rounds.** They are the qualifier rounds of Sep 25–26, posted as totals only. So on staging today:
  - every Roster player is an "Early read · 2 rounds"
  - SG per round is "—" for everyone
  - there are no form bars (fewer than 3 rounds)
  - nobody has a "Needs a look" note
  - all three Leader cards and the top five have nobody who qualifies once the 3-round floor applies
- **No source exists for:** the Captain tag, "Varsity", the injury return date ("back Nov 16"), "finals start", Thanksgiving break, and next week's travel on the Classes term card. The player-view top-five average breaks the rule that players never see teammates' scores.
- **"Class of 2026" is not a missing grad year.** It is a *past* grad year: Jackson Hale has `graduation_year = 2026`. "Class of X · Class of X" comes from joining `classYear`, which already fell back to "Class of X", with `Class of ${gradYear}`.
- **Duplicate classes:** staging has no `golf_player_classes` rows, so the screenshot came from another database, probably production. The client and the loader don't double rows; the table does. Likely causes and a query to confirm are under item 6.

---

## Formula findings

### 1. Scoring averages

**Rounds that count**
- Loader: `data/season.ts` `loadSeasonRounds`.
  - `golf_rounds` where `is_test=false`, `status='completed'`, `total_score is not null`, `round_date >= since`.
  - Then `isCountableRound` (`src/lib/golf/round-countable.ts`): 9 or 18 holes, every declared hole scored (front and back nine present), above the stroke floor, SG total ≤ +15.
  - Or `isTotalOnlyCountable` (`src/lib/golf/round-score-countable.ts`): an 18-hole round posted as a total only also counts in score figures.
- The total is canonical: front + back nine when both are present (`src/lib/golf/round-total.ts` `withCanonicalRoundTotal`).
- **`round_type` is never filtered.** Practice, qualifier and tournament rounds all count together.
- Averages use **18-hole rounds only** (`isFull18`). Nine-hole rounds are dropped from averages, but still count toward "last played".

**Season window**
- `seasonStartDate(now, tz)` is 1 Aug in the team's zone (`golf_team_settings.timezone`).
- Roster passes `since: seasonStartDate`.
- Home reads 12 months back (`lastTenFloor`), then:
  - the leaderboard and Latest rounds use `seasonOnly`
  - Team scoring and the team's game use **each player's newest ten 18-hole rounds across seasons** (Q-122).

**Player average** (`ChRosterPlayer.avg`)
- `summarizePlayer(...).avg`: the plain mean of the player's season 18-hole scores.
- No minimum number of rounds for the figure itself. Ranking uses `ROSTER_EARLY_FLOOR = 3` (`screens/roster/format.ts`).

**Team average on Roster** (`ChRoster.teamAvg`, `data/roster.ts` `loadRoster`)
- Pooled per round: the mean of every active player's season 18-hole scores.
- This is what the form-bar colour rule should compare against.

**Team scoring on Home** (`ChTeamForm.avg`, `data/home.ts` `teamForm`)
- `weightedMean` per 18 holes over the pooled set of each player's last 10.
- Delta: the newest ten of players who have a previous ten (at least 3 rounds) minus their previous ten. It is painted only when it clears its standard error.

**Verdict: mismatch.**
- The mock uses three different team averages that don't agree: TAVG 76.4 for the bars, "team avg 77.3" on desktop, and 75.8 on Home.
- Real on staging: Roster `teamAvg` = **73.7** (10 season rounds); Home Team scoring = **75.7**, previous 10 = 75.4, delta **+0.3**.
- Labels must name the basis: "season" on Roster, "last 10 per player" on Home.
- Open product question: should practice rounds count? Today they do.

### 2. Strokes gained

**Where it is stored and how it is computed**
- Per round in `golf_rounds.strokes_gained_total / _tee / _approach / _around_green / _putting`, mirrored in `golf_round_stats_cache`.
- The single writer is `recalculate_round_strokes_gained(round_id)`, computed from `golf_shots` by expected strokes:
  - `supabase/migrations/20260606150000_recalc_sg_sync_golf_rounds.sql`
  - `supabase/migrations/20260607200000_per_team_sg_baseline.sql`

**Baseline**
- `sg_scale_for_player()`: the team's `golf_team_settings.sg_baseline` if set, else by gender: `pga_tour` (1.0) for men's teams, `womens` (1.083) for women's.
- Demo team: `sg_baseline = null`, gender `mens`, so the baseline is the **PGA Tour**.
- Sign convention: positive means strokes gained against the baseline (better).

**Roster** (`summarizePlayer`)
- `sgPerRound` = mean of per-round `strokes_gained_total` over this season's 18-hole rounds **with holes**. Total-only rounds are excluded (`hasHoleScores`).
- Null when there are fewer than 3 (`MIN_SG_ROUNDS`).
- `sgLegs` works the same way per category.

**Home** (`teamLegs`)
- Per-leg `weightedMean` per 18 holes over the Last 10 hole rounds, at least 3 rounds' worth.
- Delta against the previous 10, with its standard error.
- Who gains and loses most comes from `teamRankRows(teamGrid(...))`.

**Label**
- `lib/sg.ts` `sgBaseline(tourForGender(gender))` gives "vs Tour" or "vs the women's Tour baseline".
- **It ignores `sg_baseline`**, so a team set to `ncaa_d1` would still read "vs Tour". This is a latent bug.

**Verdict**
- The mock's profile caption "vs D1" is wrong: it should be "vs Tour" for this team.
- The figures are averages per round; the mock uses them correctly as "SG / rd".
- On staging, every player's Roster SG is null (season rounds are total-only).

### 3. "Last five rounds" form bars

**Today**
- `ChRosterPlayer.trend` (`summarizePlayer`): this season's 18-hole countable scores, newest seven (`TREND_LENGTH=7`), reversed to oldest to newest.
- Every round type counts, total-only included.
- Each value is the **raw total score**: not to par, not SG.
- The phone row draws the grey `FormLine` spark only at 3 or more (`earlyBelow=3`), on one shared range (`FormRange`, B5).
- The desktop column is labelled "Last 7 rounds" (`Roster.tsx`).

**Redesign** (`form5()`)
- `trend.slice(-5)`, left to right oldest to newest.
- Height uses a **per-row** range, which contradicts the notes' shared `FormRange`.
- Colour: green if the score < TAVG, amber if > TAVG + 2.

**Verdict: OK to build from `trend` on the client.**
- Use `data.teamAvg`, not a constant, and keep the shared range.
- Keep the floor of 3 rounds. Staging has 2 per player, so every row shows the empty state.
- Caveat: raw scores ignore course par. If mixed courses matter, `recent[].toPar` exists, but only for the newest 3.

### 4. Class year

**Source:** `golf_players.graduation_year` (integer). There is no class-year column.

**How the label is computed** (`data/season.ts` `classYearLabel`)
- `academicEnd` = the season-start year + 1, so 2027 now.
- grad 2027 is Senior, 2028 Junior, 2029 Sophomore, 2030 Freshman.
- A missing year gives null.
- **Any other year gives "Class of YYYY"**: a past year (2026) or five or more out (2031).

**The double label:** the profile (`RosterProfile.tsx`), peek (`RosterPeek.tsx`), requests sheet (`RosterPhone.tsx`) and request `meta` (`data/roster.ts`) join `[classYear, 'Class of '+gradYear]`. That gives "Class of 2031 · Class of 2031".

**Staging values**
- Carter 2028: Junior
- Park 2028: Junior
- Hayes 2027: Senior
- Rivers 2027: Senior
- **Hale 2026: "Class of 2026"** (seed data: an active player whose grad year has passed)

**Mock values:** 1 Senior, 4 Juniors, 1 Sophomore, 1 Freshman. Not real.

**Fix**
- Add `classYearKey(gradYear, now, tz)` returning `'sr'|'jr'|'so'|'fr'|null`.
- Make `classYearLabel` return null outside the four years.
- Drop the duplicate join.
- The year colour falls back to the B19 tone on null.

**Home has no year for players without season rounds.** Only `ChLeaderRow.classYear` carries it, and only for players with season rounds. `loadCoachHome` already selects `graduation_year` in `rosterRead`, so the builder can expose an id → gradYear map without a new query. Up next coins are names only (`invitees: string[]`), but `inviteeIds` exist for coaches.

### 5. Captain

**Not stored anywhere.** Searched:
- `golf_team_members` (no `role` column)
- `golf_players`
- `golf_team_coach_staff`
- every migration (only a comment about "captains' meetings")

**Missing source.** Either hide the tag, or add a column (for example `golf_team_members.is_captain`), which needs a migration and a coach write. The scope says no new tables or writes, so hide it.

### 6. Classes

**Loader:** `data/classes.ts` `loadClasses`.
- `golf_player_classes` for the player: `class_name` ("CODE - Name"), `instructor`, `days`, `start_time`, `end_time`, `building`, `room`, `credits`, `semester`, `created_at`.
- No term filter in SQL. `inTerm` filters on the client, and a null semester reads as the current term.
- `golf_events` for the team (not classes): Monday−3 days to Sunday+2 days of **this week only**.

**Term:** `termOn(todayIso)` in `data/classes-shape.ts`.
- Fixed windows in `src/lib/golf/semester.ts` `TERM_WINDOWS`: Fall is Aug 20 – Dec 15.
- `weeks = ceil((span+1)/7)` = **17**.
- `week = floor(daysSinceStart/7)+1` = **11** on Oct 31 (72 days in).
- `progress` = 72/117 = 61.5%. The mock fills 61%.
- The team's own term dates (`golf_team_terms`, P-10: `classes_start`, `classes_end`, `exams_end`) **are not read** by `loadClasses`, and staging has none.

**Credits:** `termFigures` (`screens/classes/parts.tsx`) sums `credits` (null counts as 0) over in-term classes. The mock's "6 classes / 15 credits" is internally consistent but sample data.

**Overlaps:** `conflictsOf` / `groupConflicts` over `week.dates` (Mon–Sun of this week).
- On Sat Oct 31, "Travel on Fri, Nov 6" is **next week**, so it would never appear as "1 this week".
- The mock contradicts the loader here.
- "Bus leaves 8:30 AM" is the event's start time.

**"Week 11 of 17": OK.** "6 weeks left" is new: `weeks − week` = 6, OK.

**"Finals start Dec 9": missing source.**
- Would need `golf_team_terms.classes_end + 1` or an exams start.
- Not loaded; no rows on staging.

**"Soon" list**
- Dec 15 term end: OK (`term.end`).
- Nov 6 travel: not loaded; events are this week only.
- Nov 25 Thanksgiving: missing source. It would be a `golf_class_exceptions` team break (`player_id` null), which isn't loaded and doesn't exist on staging.
- Dec 9: see above.

**Duplicate classes: no repro on staging.** `select count(*) from golf_player_classes` = 0 for the whole database, and the preview fixtures have 5 unique rows.

What the code shows:
- `ClassesView` deduplicates added rows by id.
- `TodayClasses` keys by `c.id`.
- So doubled rows must be **distinct DB rows**.

Likely causes, in order:
1. **Legacy (Fairway) importer's duplicate check.** `src/app/golf/(dashboard)/dashboard/classes/LegacyClassesPage.tsx` checks against key `class_name|||semester ?? ''`. A row saved with `semester` NULL (before `20260621150000_player_classes_semester`) doesn't match a re-import tagged "Fall 2026". It inserts a second copy, and both show because a null semester counts as the current term.
2. **Read-then-insert race.** Two tabs or a double tap on the legacy or fallback import path, before `golf_import_player_classes` (applied Oct 22) took a lock per player. Rows imported before Oct 22 can be doubled.
3. **The RPC itself.** It keys on `class_name` exactly, so a re-import whose parsed name differs slightly ("KINE 1164 - Weight Training" vs "KINE 1164 - Weight Training ") isn't skipped.

Confirm on the database the screenshot came from, read-only:

```sql
select player_id, class_name, coalesce(semester,'∅') term, count(*), array_agg(created_at order by created_at)
from golf_player_classes group by 1,2,3 having count(*)>1;
```

Equal timestamps a few milliseconds apart point to a race. A NULL term next to "Fall 2026" points to cause 1.

**Fix**
- A one-off cleanup that keeps the oldest id per (player, class_name, term-coalesced), along with its calendar events.
- Make the legacy key coalesce a null semester to the current term, as the RPC does.

**The mock and the notes disagree.** The notes say "14 rows for 7"; the mock shows 6 classes.

### 7. Coach Home

Loader: `data/home.ts` `loadCoachHome`. Details are in the Home table below.

**Brief: mismatch.** The real one is `homeSubline` (`screens/home/model.ts`): flagged players (slipping, or quiet for 7 days or more), the next competition this week, then "the rest is on track".
- On staging today it gives roughly "5 players need a look: Owen, Jackson, Tyler, Ethan, Mason." All are quiet: last round Sep 26, 35 days ago.
- The mock's "Scoring is down 0.6 … Approach is costing the most" has no source. It could be derived on the client from `phone.form.delta` / `deltaSe` and `legs.rows`.
- **Rule conflict:** Home flags a player as quiet at 7 days (`QUIET_DAYS=7`, model.ts). Roster flags at 9 days and only while the team is posting (`QUIET_DAYS=9`, `teamPosting`, `data/roster.ts`). So Home flags all 5 and Roster flags none.

**Practice counts:** no such tile exists. "Rounds this week" is `form.roundsThisWeek`: countable rounds of any length and type in the team's Mon–Sun week. **0** on staging, which matches the mock.

---

## Per-screen tables

Verdicts:
- **OK**: the data exists and is computed as the redesign uses it.
- **mismatch**: the data exists but differs.
- **missing**: no source.
- **sample**: the mock's value is invented but the data exists.

### Classes (player): phone and desktop

| UI element | Mock shows | Real source | Formula today | Verdict | Preview fixture |
|---|---|---|---|---|---|
| Large title / context | "Classes", "Fall 2026 · Aug 20 – Dec 15" | `termOn` → `term.label/start/end` (`data/classes-shape.ts`); `ClassesView.tsx` already renders it | Fixed `TERM_WINDOWS` | OK | "Fall 2026 · Aug 20 – Dec 15" (PREVIEW_CLASSES) |
| + action | Add / Import | `ClassesView` `startAdd`, `ImportSchedule` | n/a | OK | none: an action, not a figure |
| Week well | 11 of 17 | `term.week`, `term.weeks` | See item 6 | OK (11/17 verified) | 8 of 17 (PREVIEW_CLASSES, today Oct 14) |
| "6 weeks left" | 6 | new: `weeks − week` | n/a | OK (client) | none: not drawn today; weeks − week = 9 (PREVIEW_CLASSES) |
| "finals start Dec 9" | Dec 9 | none (`golf_team_terms` not loaded; 0 rows) | n/a | missing | none: fixture has no finals date; add e.g. `term.finalsStart` |
| Overlap chip | "1 overlap" | `conflicts.length` / `groups` (`conflictsOf`) | This week only | OK, but the mock's example is next week | 2 overlaps: 2 class meetings, 1 event (Thu Oct 15 trip) (PREVIEW_CLASSES) |
| Credits bar and label | 6 classes / 15 credits, split by tone | `termFigures`, `c.credits`, `c.tone` (`orderClasses`, by `created_at`) | Sum of credits, null = 0 | OK (values are sample) | "13 credits · 5 classes"; tones mist, clay, sand, stone, sage (PREVIEW_CLASSES) |
| Term line, Today marker, ticks | 61% fill, finals and end ticks | `term.progress`; end = `term.end` | n/a | OK; finals tick missing | 47% fill (day 55 of 117), 18 ticks, Aug 20 / Dec 15; no finals (PREVIEW_CLASSES) |
| "Soon" list | Nov 6 travel, Nov 25 Thanksgiving, Dec 9 finals, Dec 15 end | Only Dec 15 (`term.end`); events this week only; breaks are in `golf_class_exceptions` (not loaded) | n/a | 3 of 4 missing | none: no Soon list today; fixture holds only term end Dec 15 |
| Today title / weekday | "Today · Saturday" | `todayIso` | n/a | OK | "Today" (Wed Oct 14; no weekday drawn) (PREVIEW_CLASSES) |
| No-class state | "No classes today · Next: Monday, Nov 2" | `TodayClasses` `next` scan (7 days) | n/a | OK | none: Wed Oct 14 has ECON 310 and ENGL 105 in every fixture with classes |
| Day ribbon 7 AM–5 PM | Classes and practice | `classes` (days, start, end) + `week.events` (window reaches Sunday+2) | n/a | OK (new drawing) | none: not drawn today; 2 classes + Practice 3:30–5:30 PM (PREVIEW_CLASSES) |
| Rows: time, dot, name, room | 7:00 AM KINE… | `c.start`, `c.tone`, `c.name`, `c.location` | `timeLabel` / `clockLabel` | OK; deduplicate by id plus start (DB duplicates) | ECON 310 10:10–11:25 AM, Gardner Hall 008; ENGL 105 1:25–2:15 PM (PREVIEW_CLASSES) |
| Team event row | "Team practice 2:30 PM" | `week.events` (`toTeamEvent`) | n/a | OK | none: Today list omits events; fixture has Practice 3:30–5:30 PM (PREVIEW_CLASSES) |
| Overlaps card | "Travel on Fri, Nov 6 overlaps 2 classes · bus 8:30 AM", the class rows | `groupConflicts` → `event.title`, `startMin`, `classes[]` | n/a | OK in shape; the example date is outside the loaded week | Pinehurst qualifier Thu, Oct 15, 6:15 AM–8:00 PM: STAT 201, BUSI 401 (PREVIEW_CLASSES) |
| Caption | "Your coach sees this overlap too." | static copy | n/a | OK | none: static copy ("This week. Your coach can see your classes.") |
| Binder | Code, credits, name, prof, week strip with times, today ring, room, "Travel Fri" | `tabParts(code)`, `credits`, `name`, `instructor`, `days` + `clockLabel(start)`, `dayToken(todayIso)`, `location`, `conflictFlag` | n/a | OK (the flag reads "Overlaps {title} Fri") | STAT 201, 3 cr, T/Th 9:00, "Overlaps Pinehurst qualifier Thu" (PREVIEW_CLASSES) |
| Share status switch | On | `golf_player_class_settings.share_status` (P-10, `ClassStatusPanel`) | n/a | OK (behind `class_awareness_v1`) | none: preview passes no `statusWrites`, so no Class status panel |
| Detail sheet | Meets, time, room, credits, this week's meetings, travel chip | `daysLabel`, `timeRange`, `location`, `credits`, `week.dates` × `days`, conflicts | n/a | OK | STAT 201: Tue, Thu 9:00–10:15 AM, Hanes Hall 120, 3 credits (PREVIEW_CLASSES) |
| Desktop | Same figures; "Your classes 6" | `classes.length` | n/a | OK | none: "Your classes" has no count; `classes.length` = 5 (PREVIEW_CLASSES) |

### Roster: coach phone, player phone, profile and desktop

| UI element | Mock shows | Real source (file / function) | Formula today | Verdict | Preview fixture |
|---|---|---|---|---|---|
| Large title context | "Demo University Golf" | `golf_teams.name` → `ChRoster.teamName` | n/a | OK | "Varsity" (PREVIEW_ROSTER) |
| Team card title | "Varsity · Fall 2026" | none for "Varsity"; season is `currentSeasonLabel` = "2026–27" | 1 Aug in the team's zone | missing / mismatch (use team plus "2026–27") | "Varsity · 2026–27" (PREVIEW_ROSTER) |
| Counts | "6 active · 1 injured · 2 waiting" | active = `status='active'`; injured = active and `availability='injured'`; waiting = `requests.length` (pending) | n/a | OK; real is "5 active · 0 injured · 0 waiting". The mock counts inactive Mason Reed as injured: injured and inactive are different things | 7 active · 0 injured · 2 waiting (PREVIEW_ROSTER; 1 injured in ?state=availability) |
| Total players | 7 | `players.length` (active + inactive) | n/a | OK; real is 5 | 8: 7 active + Mia Thornton inactive (PREVIEW_ROSTER) |
| Class-mix bar and legend | 1 Sr / 4 Jr / 1 So / 1 Fr | `classYear` from `graduation_year` | `classYearLabel` | OK; real is 2 Sr / 2 Jr / 0 / 0 plus 1 unknown (Hale) | none: not drawn today; active 2 Sr / 2 Jr / 1 So / 2 Fr (PREVIEW_ROSTER) |
| Top five and mean | 5 coins, "76.2 avg" | `avg` (season, active) | new: mean of the 5 lowest | OK on the client; apply the 3-round floor (staging: nobody qualifies; without the floor, 73.7) | none: not drawn today; 72.8 (Theo, Sofia, Ava, Jonah, Eli) (PREVIEW_ROSTER) |
| Leader: Low average | Cole Bennett 74.6 | min `avg`, active, at least 3 rounds | `rosterStandings` | OK; real: none qualifies (Rivers 72.0 on 2 rounds) | none: not drawn today; Theo Marchetti 70.9, 24 rounds (PREVIEW_ROSTER) |
| Leader: On a heater | Jackson Hale 73.7, last 3 | new: `mean(trend.slice(-3))`, `trend.length ≥ 3` | n/a | OK on the client; real: none | none: not drawn today; Theo Marchetti 70.3, last 3 (PREVIEW_ROSTER) |
| Leader: Needs a look | Ethan Pierce −1.4 SG/rd | `attention.tone in (warning, loss)` + `sgPerRound` | `attentionFor` | OK; real: none. The mock's text "putting down 1.2" has no source (closest is `legsCaption`) | none: not drawn today; Jonah Okafor −0.9, Eli Brandt −0.4 (PREVIEW_ROSTER) |
| Join requests row and sheet | Liam Ortiz, Noah Patel; "joined with team code"; code DUG-4K7 | `getTeamJoinRequests` → `ChJoinRequest` (name, classYear, gradYear, requested); `golf_teams.join_code` | n/a | OK; real: 0 requests, code PRH4UJF5. "joined with team code" is not in the shape | Grace Liu, Owen Park; code FINLEY-26 (PREVIEW_ROSTER) |
| Sort | Avg / SG / Name | `screens/roster/sort.ts` `COMPARE` | Avg ascending, SG descending, last name; nulls last | OK | Avg: Theo 70.9 first, Luca 76.3 last; SG: Theo +1.8, Luca — last (PREVIEW_ROSTER) |
| Row coin colour | Year | `gradYear` → new `classYearKey` | n/a | OK after the fix | none: no `classYearKey` yet; `gradYear` 2027–2030 set (PREVIEW_ROSTER) |
| Captain tag | "Captain" | none | n/a | missing | none: fixture has no captain field; add e.g. `isCaptain` |
| Note line | "In class until 11:50 AM", "Steady", "Best 3 rounds…", "Needs a look · putting down 1.2", "Early read · 2 rounds" | `classNoteFor` (P-10) → else `rowNote` (`screens/roster/format.ts`): availability word, `attention.text`, `FORM_WORD`, "Early read · n rounds" | n/a | OK in shape. Real texts are "Scoring up X", "No rounds in N days", "4 rounds under average". "Best 3 rounds of the season" doesn't exist. Staging: everyone "Early read · 2 rounds" | Improving, Scoring up 2.1, No rounds in 9 days, Early read · 2 rounds (PREVIEW_ROSTER) |
| Form bars | 5 bars, TAVG 76.4 | `trend` + `data.teamAvg` | See item 3 | OK on the client; real: none (2 rounds each) | none: 5 bars not drawn (7-round spark); teamAvg 73.0, Luca 2 rounds (PREVIEW_ROSTER) |
| Figure | avg with "x.x HCP", or SG / rd | `avg`, `displayHandicap` (`handicap_index ?? handicap`), `sgPerRound` | n/a | OK; real SG is "—" | Theo 70.9, +0.8 HCP; SG / rd +1.8; Luca SG "—" (PREVIEW_ROSTER) |
| Card caption | "Bars are the last five rounds. Green beats the team average." | n/a | n/a | OK (say "this season") | none: static copy |
| Inactive card | Mason Reed, "Injured · back Nov 16" | `status='inactive'`; injury is `availability` (any status); reason is the coach-only `golf_player_availability_coach_notes.note` (table exists on staging) | n/a | Return date missing. Don't merge "inactive" with "injured" | Mia Thornton, inactive, available; no return-date field (PREVIEW_ROSTER) |
| Player view rows | "Senior · Class of 2027", You, HCP | `data/roster-player.ts` `ChTeammate` (`classYear`, `gradYear`, `isYou`, `handicap`) | n/a | OK | Theo Marchetti "You · Senior", +0.8 HCP (PREVIEW_PLAYER_ROSTER) |
| Player view sort | Name / Class / HCP | `gradYear`, `handicap` available | n/a | OK (new sort on the client) | Name / Class / HCP; Class puts Sofia, Theo (2027) first (PREVIEW_PLAYER_ROSTER) |
| Player view coaches | 3 coaches | `golf_team_coach_staff` → `coachesOf` | n/a | OK; real: 1 (Coach (Demo), Head coach) | 2: Maya Reyes (Head coach), Dan Whitfield (Assistant coach) (PREVIEW_PLAYER_ROSTER) |
| Player view team card | Same card | Active count and class mix OK; **injured not loaded** (availability isn't selected); **top-five average must not show to players** ("never against teammates", `data/roster-player.ts` header) | n/a | Injured: missing. Top five: policy conflict, drop it | none: no team card; head reads "7 players" (PREVIEW_PLAYER_ROSTER) |
| Profile head | Hometown, Captain, "Junior · Class of 2028" chip | `hometown` + `state`; captain none; `classYear` + `gradYear` | n/a | OK except captain; mock hometown is sample | Theo: "Senior · Class of 2027", "Asheville, NC · Asheville School" (PREVIEW_ROSTER) |
| Profile "This season" | Avg, "−0.8 vs prev", HCP Index, SG/rd "vs D1"; header "Last 10 rounds" | `avg` (season), `handicap`, `sgPerRound` | n/a | Mismatch: the basis is the season, not last 10. "vs prev" has no source (only `formChange`, the trend halves). Use "vs Tour" | Theo 70.9, HCP +0.8, SG / round +1.8; no "vs prev", no baseline (PREVIEW_ROSTER) |
| Scoring trend | 10 points, "Last 10" | `trend` (up to 7, season) | n/a | Mismatch: label it "last 7" or "season" | Theo "Last 7 rounds", 72 to 70 (PREVIEW_ROSTER) |
| Recent rounds | 3, "All 14" | `recent` (3: course, date, score, toPar), `rounds` | n/a | OK; real All = 2 | Theo: Oakmont CC Oct 12 70 (−1), +2 more; "All 24" (PREVIEW_ROSTER) |
| About | Hometown, high school, "Joined Aug 2023", rounds | `hometown`, `highSchool`, `joined` (`joined_at`), `rounds` | n/a | OK; real joined is Feb 2026 | Theo: Asheville, NC; Asheville School; 2027; #4; Since Aug 2023 (PREVIEW_ROSTER) |
| Desktop head | "team avg 77.3" | `teamAvg` | n/a | OK; real 73.7 (the mock disagrees with its own 76.4) | "Team average 73.0 over the season." (72.98) (PREVIEW_ROSTER) |
| Desktop table | Last 5, Avg, HCP, SG/rd, Rds; pills Active · 6 / Inactive · 1 | `Roster.tsx` (column today is "Last 7 rounds") | n/a | OK | "Last 7 rounds" column; pills Active · 7 / Inactive · 1 (PREVIEW_ROSTER) |
| Desktop peek | Year chip, Avg, HCP, SG, Rounds, chart | `RosterPeek.tsx` | n/a | OK; fix the "Class of" repeat | Theo: Senior · Class of 2027; 70.9, +0.8, +1.8, 24 rounds (PREVIEW_ROSTER) |

### Coach Home: phone and desktop

| UI element | Mock shows | Real source | Formula today | Verdict | Preview fixture |
|---|---|---|---|---|---|
| Date | "Saturday, October 31" | `todayLabel` (`homeClock`) | n/a | OK | "Wednesday 14 October" (PREVIEW_HOME) |
| Greeting | "Good morning, Nick." | `greeting` + coach first name | n/a | OK | "Good morning, Maya" (PREVIEW_HOME; static, though the clock is 2:40 PM) |
| Brief | "Scoring is down 0.6 … Approach is costing the most." | `subline` = `homeSubline` | See item 7 | Mismatch (staging: "5 players need a look…") | "Eli hasn’t posted a round in 9 days. Qualifier · Pinehurst No. 2…" (PREVIEW_HOME) |
| Waiting on you | "2 join requests · 1 hasn't replied · 3 haven't read a post" | `queue` (`data/home-queue.ts`): `joinRequests`, `replies.missing`, `overdueTasks`, `unackedPosts`; labels in `CoachQueue.tsx` | n/a | Labels mismatch: "replies missing", "tasks overdue" (absent from the mock), "posts awaiting acknowledgement" (not "read"). Staging: 0 joins, 2 replies (Nov 7 tournament), up to 4 tasks, up to 2 posts | 1 join request · 3 replies missing · 2 tasks overdue · 1 post awaiting… (PREVIEW_QUEUE) |
| Up next | Practice "Short-game block", "In 2 h 15 min", 11:30–1:30 · Practice green, 4 coins, "4 of 6 going · Dylan hasn't replied" | `phone.next` (`ChHomeEvent`): `type`, `whenLabel`, `title`, `rangeLabel`, `location`, `invitees`, `going` (only when `requires_rsvp`), `awaiting[]` | Next event inside the week window (`weekWindow`: Mon … Sun+2) | OK in shape. Staging Oct 31: **null** (the next event, Spring Preview Tournament Nov 7, 3 of 5 going, is past Nov 3) | Short-game block, In 50 min, 3:30 – 5:00 PM, 5 of 6 going, Eli awaiting (PREVIEW_HOME) |
| Today list | 11:30 practice "Next", 2:00 lift, 6:30 dinner "Clash" | `phone.today` (`isNext` via `nextId`, `conflict`) | n/a | OK; staging today: none. Tones by event type are new | 3:30 Short-game (Next), 4:45 1:1 (clash), 5:30, 6:00 (clash) (PREVIEW_HOME) |
| Team scoring average | 75.8 "Average · last 10 rounds" | `phone.form.avg` | `teamForm` (each player's last 10, pooled, per 18) | OK; real **75.7** | 73.4 (PREVIEW_HOME) |
| Delta | −0.6 green "vs previous 10" | `form.delta`, `deltaSe` → `deltaTone` | Paired last 10 − previous 10 | OK; real **+0.3** (75.68 vs 75.38) | −0.9, SE 1.0: no tone, "No clear change vs previous 10" (PREVIEW_HOME) |
| Line chart | 10 points | `form.line` | Team mean per round day, last 10 days | OK; real: 75.0, 75.43, 77.0, 77.0, 78.6, 77.0, 77.0, 70.0, 74.4, 73.0 | 12 points, 74.6 to 73.4 (PREVIEW_HOME); the loader gives at most 10 |
| Rounds | 0 this week | `form.roundsThisWeek` | n/a | OK (0) | 11 this week (PREVIEW_HOME) |
| Greens | 62%, −2 pts | `form.gir.pct`, `delta` | Pooled holes | OK; real **62.9%, −5.1 pts** | 61%, +3 pts, no tone (SE 3.9) (PREVIEW_HOME) |
| Putts | 32.6, −0.6 | `form.putts.avg`, `delta` | Per 18, recorded putts only | OK; real **32.5, −0.9** | 30.4, +0.3, no tone (SE 0.6) (PREVIEW_HOME) |
| Team's game: SG per leg | +0.6 / −3.3 / −0.2 / −2.9 | `legs.rows[].sg` | `teamLegs` | OK; real **+0.79 / −3.46 / −0.16 / −2.95** (40 hole rounds) | +0.4 / −0.9 / −0.2 / −0.5 (PREVIEW_LEGS) |
| Trend per leg | Up / down / flat words | `delta`, `se` | n/a | OK; real deltas +0.65 / −2.10 / −0.04 / +0.44 | tee +0.5 better, around −0.6 worse, approach and putting no change (PREVIEW_LEGS) |
| Stat per leg | Fairways 60%, Greens 62% · Tour 66%, Up and down 32%, Putts 32.6 | `stat` (`legRows` + Tour bench) | n/a | OK (sample values) | Fairways 61%, Greens 61% · Tour 67%, Up and down 52%, Putts 30.4 (PREVIEW_LEGS) |
| Gains / loses most | Cole B./Dylan B.; Tyler H./Ethan P.; Jackson H./Owen C.; Cole B./Ethan P. | `gains` / `loses` (`legPeople` via `teamRankRows`) | n/a | OK in shape; names are sample. Real, from per-player last-10 means (approximate, the ranking may add floors): tee Tyler H. / Ethan P.; approach Jackson H. / Owen C.; around Tyler H. / Mason R.; putting Ethan P. / Jackson H. | Theo M./Eli B.; Sofia A./Jonah O.; Ava L., Sofia A./Jonah O.; Theo M./3 (PREVIEW_LEGS) |
| Caption | "Approach and putting cost the most." | new: the two most negative `sg` | n/a | OK on the client (true on staging) | none: not drawn today; approach −0.9 and putting −0.5 (PREVIEW_LEGS) |
| SG unit and label | "SG per round" | `sgBaseline(tour)` → "vs Tour" | n/a | OK | "vs Tour" (tour pga) (PREVIEW_LEGS) |
| This week tiles | Dots M2 T1 W2 T1 F0 S1 S1; note "Fri, Nov 6 Fall Invitational" | `week.days[].eventCount`, `phone.weekNote` | Mon–Sun team week | OK in shape; real: Fri 30 has 1, the rest 0; no note (the next competition is Nov 7) | M2 T2 W4 T2 F1 S1 S0; note "Friday Qualifier · Pinehurst No. 2" (PREVIEW_HOME) |
| Latest rounds | 5 rows (phone), 4 (desktop); spark; "Wed, Oct 21" | `latestRounds.rounds` (`latestWithHoles`: **3** newest season 18-hole rounds), spark = `leaderboard.rows[].trend`, meta date format "Sat 26 Sep" (en-GB) | n/a | Count mismatch (3, not 5); date format differs. Real: Carter 71 (−1), Rivers 72 (E), Hale 72 (E), Home course, Sep 26; no spark (2 rounds) | 3: Theo 70 (−2), Sofia 70 (−2), Jonah 78 (+6); "Mon 12 Oct" (PREVIEW_HOME) |
| Round sheet | Score, GIR 10, Putts 31, SG +0.9, 9-hole card | `ChLatestRound` (`holes` 18 or null, `gir`, `putts`, `sg`) | n/a | Sample. Real staging rounds are total-only: no card, GIR, putts or SG | Theo 70, GIR 14/18, putts 28, SG +2.4, 18-hole card; Jonah no card (PREVIEW_HOME) |
| Desktop Leaderboard | Top 5 with ranks | `leaderboard.rows` (all with season rounds; early reads sorted last, rank "—") | n/a | OK; real: all 5 early, ranks "—" | 6 rows: Theo 1 to Eli 5, Priya "—" (early, 2 rounds) (PREVIEW_HOME) |
| Desktop agenda | Includes "Qualifying round 1 · Mon Nov 2" | `week.agenda` (today plus competitions this week) | n/a | Sample; next-week rows don't load | 4 today + "Qualifier · Pinehurst No. 2" Fri, 5 of 6 going (PREVIEW_HOME) |

---

## Staging spot checks (SELECTs run)

All queries were run on `ybmwektreyrwjscxlogv`.

**Team and settings**

```sql
select t.id, t.name, t.gender, t.season, t.join_code, s.timezone, s.sg_baseline
from golf_teams t left join golf_team_settings s on s.team_id=t.id
where t.name ilike '%demo%';
```

Result: `6ecdd1a6-…`, mens, stored season "2025-26" (ignored by the code), join code PRH4UJF5, America/New_York, `sg_baseline` null.

**Columns, to look for captain and class year**

```sql
select table_name, column_name, data_type from information_schema.columns
where table_schema='public'
  and (table_name in ('golf_team_members','golf_players')
       or column_name ilike '%captain%' or column_name ilike '%class_year%'
       or column_name ilike '%grad%year%' or column_name ilike '%year_in_school%')
order by table_name, ordinal_position;
```

Result: only `golf_players.graduation_year`. No captain column anywhere.

**Members, class year as the code computes it**

```sql
with s as (select (extract(year from (now() at time zone 'America/New_York'))
  - case when extract(month from (now() at time zone 'America/New_York'))>=8 then 0 else 1 end + 1)::int as academic_end)
select p.first_name||' '||p.last_name who, m.status, m.availability, p.graduation_year, s.academic_end,
  case p.graduation_year - s.academic_end when 0 then 'Senior' when 1 then 'Junior'
       when 2 then 'Sophomore' when 3 then 'Freshman'
       else case when p.graduation_year is null then null else 'Class of '||p.graduation_year end end
from golf_team_members m join golf_players p on p.id=m.player_id cross join s
where m.team_id='6ecdd1a6-63fe-4beb-b094-00118f334163' order by p.last_name;
```

Result:

| Player | Grad year | Label |
|---|---|---|
| Carter | 2028 | Junior |
| Hale | 2026 | **Class of 2026** |
| Hayes | 2027 | Senior |
| Park | 2028 | Junior |
| Rivers | 2027 | Senior |

All active and available. Handicaps: Carter 5.5, Hale 3.2, Hayes 2.9, Park 4.1, Rivers 1.8.

**Join requests, staff, all rounds**

```sql
select r.id, r.status, r.created_at::date, p.first_name, p.last_name, p.graduation_year, p.handicap
from golf_team_join_requests r left join golf_players p on p.id=r.player_id
where r.team_id='6ecdd1a6-63fe-4beb-b094-00118f334163' order by r.created_at;
```

```sql
select s.role, s.is_primary, c.full_name, c.title
from golf_team_coach_staff s join golf_coaches c on c.id=s.coach_id
where s.team_id='6ecdd1a6-63fe-4beb-b094-00118f334163';
```

```sql
select p.first_name||' '||p.last_name, r.round_date, r.round_type, r.status, r.is_test, r.holes_played,
  r.total_score, r.front_nine, r.back_nine, r.score_to_par, r.course_name, r.qualifier_id is not null,
  r.strokes_gained_total, r.strokes_gained_tee, r.strokes_gained_approach,
  r.strokes_gained_around_green, r.strokes_gained_putting,
  r.total_putts, r.total_gir, r.total_gir_possible
from golf_rounds r join golf_players p on p.id=r.player_id
where r.player_id in (select player_id from golf_team_members
                      where team_id='6ecdd1a6-63fe-4beb-b094-00118f334163')
order by p.last_name, r.round_date desc;
```

Results:
- Join requests: none.
- Staff: Coach (Demo), head coach.
- Rounds: summer rounds (May–Jul, last season, with SG) plus two total-only qualifiers per player on Sep 25–26. Also one test round for Hayes on Aug 31 (excluded) and an in-progress round for Rivers on Oct 28 (excluded).

**Season averages, Last 10 and previous 10, greens, putts, SG legs**

```sql
with team as (select player_id from golf_team_members
              where team_id='6ecdd1a6-63fe-4beb-b094-00118f334163' and status='active'),
r as (select r.id, r.player_id, r.round_date, r.round_type,
        case when r.front_nine is not null and r.back_nine is not null
             then r.front_nine+r.back_nine else r.total_score end as score,
        (r.front_nine is null and r.back_nine is null) as total_only,
        r.strokes_gained_total sg, r.strokes_gained_tee t, r.strokes_gained_approach a,
        r.strokes_gained_around_green ag, r.strokes_gained_putting p,
        r.total_gir, r.total_gir_possible, r.total_putts
      from golf_rounds r join team using (player_id)
      where r.status='completed' and r.is_test=false and r.total_score is not null
        and coalesce(r.holes_played,18)=18
        and ((r.front_nine is not null and r.back_nine is not null)
             or (r.front_nine is null and r.back_nine is null))
        and r.round_date >= '2025-10-31'),
ranked as (select *, row_number() over (partition by player_id order by round_date desc, id asc) rn from r)
select 'season_pooled_team_avg', round(avg(score)::numeric,2), count(*) from ranked where round_date>='2026-08-01'
union all select 'last10_pooled_avg', round(avg(score)::numeric,2), count(*) from ranked where rn<=10
union all select 'prev10_pooled_avg', round(avg(score)::numeric,2), count(*) from ranked where rn between 11 and 20
-- plus greens, putts and the per-leg SG over rn<=10 and not total_only
;
```

The per-player and per-leg versions used the same CTE grouped by player.

Results:
- Season team average **73.70** (n=10).
- Last 10 **75.68** (n=50); previous 10 **75.38** (n=21). All 5 players are paired, so the delta is **+0.30**.
- Greens **62.9%** against 68.0% before.
- Putts **32.53** against 33.43 before.
- SG legs over the last 10: tee **+0.79**, approach **−3.46**, around **−0.16**, putting **−2.95**, total −5.78 (40 hole rounds).
- Day line: 75.0, 75.43, 77.0, 77.0, 78.6, 77.0, 77.0, 70.0, 74.4, 73.0.

Per player:

| Player | Season (newest first) | Season avg | Last 7, newest first |
|---|---|---|---|
| Carter | 71, 74 | 72.5 | 71, 74, 74, 73, 82, 79, 77 |
| Hale | 72, 75 | 73.5 | 72, 75, 84, 86, 75, 77, 68 |
| Hayes | 77, 78 | 77.5 | 77, 78, 70, 70, 80, 78, 75 |
| Park | 73, 73 | 73.0 | 73, 73, 71, 77, 82, 75, 72 |
| Rivers | 72, 72 | 72.0 | 72, 72, 79, 79, 74, 80, 78 |

The Roster `trend` is the season only, so it holds 2 scores per player: no bars, no form word.

**Latest rounds**

```sql
select r.id, p.first_name||' '||p.last_name, r.round_date, r.course_name, r.total_score,
  r.score_to_par, r.front_nine, r.back_nine, r.strokes_gained_total
from golf_rounds r join golf_players p on p.id=r.player_id
where r.player_id in (select player_id from golf_team_members
                      where team_id='6ecdd1a6-63fe-4beb-b094-00118f334163' and status='active')
  and r.status='completed' and r.is_test=false and r.total_score is not null
  and coalesce(r.holes_played,18)=18 and r.round_date>='2026-08-01'
order by r.round_date desc, r.id asc limit 3;
```

Result: Carter 71 (−1), Rivers 72 (E), Hale 72 (E). Home course, Sep 26. Total-only: no SG.

**Events and replies**

```sql
select e.title, e.event_type, e.status, e.start_time at time zone 'America/New_York',
  e.end_time at time zone 'America/New_York', e.location, e.requires_rsvp
from golf_events e
where e.team_id='6ecdd1a6-63fe-4beb-b094-00118f334163' and e.start_time >= '2026-10-20'
order by e.start_time;
```

```sql
select e.title, a.status, count(*)
from golf_event_attendance a join golf_events e on e.id=a.event_id
where e.team_id='6ecdd1a6-63fe-4beb-b094-00118f334163' and e.start_time>='2026-10-29'
group by 1,2;
```

Results:
- Practice Oct 30, 2–5 PM.
- Spring Preview Tournament Nov 7, 8 AM, Magnolia Ridge GC, RSVP: 3 accepted, 2 pending.
- Qualifier Nov 14; Film session Nov 22; Tri-State Invitational Dec 5; Banquet Dec 22.

**Tasks, announcements, class tables**

```sql
select 'tasks', count(*) filter (where due_date < '2026-10-31'), count(*)
from golf_tasks where team_id='6ecdd1a6-…'
union all select 'ann_need_ack', count(*) filter (where requires_acknowledgement), count(*)
from golf_announcements where team_id='6ecdd1a6-…';
```

```sql
select count(*) from golf_team_terms where team_id='6ecdd1a6-…';
select count(*) from golf_class_exceptions where team_id='6ecdd1a6-…';
select count(*) from golf_player_class_settings;
select count(*) from golf_player_classes;
select to_regclass('public.golf_player_availability_coach_notes');
```

Results:
- Tasks: 4 due before today out of 8. The overdue count also depends on assignments.
- Announcements: 2 asking for acknowledgement out of 4.
- Terms 0, exceptions 0, class settings 0, **player classes 0 (whole database)**.
- The coach-notes table exists.

---

## Data bugs and gaps for the builder

1. **`classYearLabel` fallback** (`data/season.ts`): return null outside Senior to Freshman, and add a `classYearKey` helper for the Avatar `year` prop. Remove the `[classYear, 'Class of '+gradYear]` repeat in:
   - `data/roster.ts` `loadRoster` (request `meta`)
   - `screens/roster/RosterProfile.tsx`
   - `screens/roster/RosterPeek.tsx`
   - `screens/roster/RosterPhone.tsx` (requests sheet)
2. **Demo seed:** Jackson Hale `graduation_year = 2026` on an active roster. Set 2027–2030 in the seed; this is a data fix, not a code fix.
3. **Duplicate classes:** distinct DB rows, not the client. Run the GROUP BY under item 6 on the source database. Clean up keeping the oldest id per (player, class_name, coalesced term) and its calendar events. In `LegacyClassesPage.tsx`, make the duplicate check coalesce a null semester to the current term, as the RPC does.
4. **Captain:** no source. Hide it, or a migration is needed, which is out of scope.
5. **Classes term card:** "finals start", Thanksgiving and next-week travel have no source in `loadClasses`.
   - Show only what `term` and this week's events give.
   - Or, if allowed, read `golf_team_terms` and team-wide `golf_class_exceptions` (P-10 tables, which exist) plus a wider event window. That is a loader change.
   - The overlap chip only counts this week.
6. **"Injured · back Nov 16"**: there is no return date. The injury is `availability` on an active player, not "Inactive". Keep the two states apart in the team card counts and the Inactive card.
7. **Player-view team card:** drop the top-five average (players never see teammates' scores). "n injured" needs `availability`, which `data/roster-player.ts` doesn't select.
8. **Three team averages:** the bars must use `data.teamAvg` (season, pooled), not a constant. Roster (73.7 season) and Home (75.7, last 10 per player) are different bases, so label each.
9. **Floors:** Leaders, the top five and the form bars must respect 3 rounds (`ROSTER_EARLY_FLOOR`, `earlyBelow=3`). They need empty or hidden states, because staging has every player under the floor.
10. **SG label:** `lib/sg.ts` `sgBaseline(tourForGender(gender))` ignores `golf_team_settings.sg_baseline`. This is a latent mislabel if a coach picks a D1 or other baseline. The mock's "vs D1" is wrong for the demo team.
11. **Profile labels:** "This season" figures are season-based, not "Last 10". The trend holds up to 7 rounds, not 10. "vs prev" has no source; only `formChange` (trend halves) exists.
12. **Home brief:** the real `homeSubline` differs from the mock's sentence. A scoring and approach sentence could be derived on the client from `form.delta` / `deltaSe` and `legs`.
13. **Quiet rule:** Home flags at 7 days (`screens/home/model.ts` `QUIET_DAYS=7`). Roster flags at 9 days and only while the team is posting (`data/roster.ts`). So "Needs a look" disagrees between the screens: on staging Home flags all 5 and Roster flags none.
14. **Waiting on you labels:** the real parts are replies missing, tasks overdue and posts awaiting acknowledgement. The mock's "haven't read a post" is the wrong meaning, and the mock drops tasks.
15. **Home Latest rounds:** the loader returns 3, while the mock shows 5 (phone) and 4 (desktop). The date format differs ("Sat 26 Sep" vs "Wed, Oct 21").
16. **Home year coins:** a class year only reaches Home for players with season rounds (`ChLeaderRow.classYear`). Expose the roster's `graduation_year`, already selected in `loadCoachHome` `rosterRead`, as an id map. Up next coins need `inviteeIds` mapped to a year.
17. **Up next window:** Home only loads events through Sunday+2. On staging today `phone.next` is null; the Nov 7 tournament is outside the window. Design the no-event state.
18. **Season label:** use `currentSeasonLabel` ("2026–27"), never "Fall 2026", on Roster. "Fall 2026" is the class term. `golf_teams.season` is stale ("2025-26") and correctly unused.
19. **Practice rounds count everywhere:** `round_type` is unfiltered in the Roster and Home averages. Flag it to Nick if that isn't intended.

## Preview fixture bugs found while filling the fixture column

Fix these in the fixtures inside the PR that touches the screen (fixtures only, no loader change), or the side-by-side check compares against wrong numbers:
1. **Home line chart:** `PREVIEW_HOME.phone.form.line` has 12 points; the loader (`data/home.ts`, `.slice(-10)`) gives at most 10. Trim to 10.
2. **To-par in Home Latest rounds:** `fixtures.ts` computes total − 72, but the hole pars add to 71, so Theo's 70 at Oakmont shows −2 on Home and −1 on the card and in `PREVIEW_ROSTER`. Compute against the course's par.
3. **Home and Roster disagree on the same players:** Theo has 11 season rounds on Home, 24 on Roster; Priya is an early read on Home (2 rounds) and has 16 on Roster. Make one source of truth for the shared players.
4. **Greeting:** `PREVIEW_HOME.greeting` is hard-coded "Good morning" while the preview clock is 2:40 PM Eastern. Derive it from the clock.
5. **Overlap wording:** the term bar counts class meetings ("2 overlaps") while the Overlaps card counts events ("A team event overlaps your classes"). The design counts events in both places.

## Settled 31 Oct (Nick: "Go with your picks")

Practice rounds stay out of every scoring average, the leaders and the top five (they still list in Latest rounds). No Captain tag. "Injured" chip with no date; injured players count as active. Classes shows no finals, holidays or next week's travel.

# Clubhouse changelog

## 2026-10-07 — Digits in serif headings, phone text floor

Display-serif headings that come from data set their digits in the sans (`SerifText`, `.ch-serif-num`): the serif's
1 has no flag, so 11 read as ll. This covers CoachHelm's insight and deep-dive titles, Team Hub's announcement and
trip names, and the live qualifier's name. The Standing and Deep dive counts inside serif headlines use the same sans
figures. New captions under 12px (the Rounds range ends and date day, the Roster figure labels) are raised to 12px,
the phone text floor.

## 2026-10-06 — More contrast

The owner said there wasn't a lot of contrast. The desktop's secondary and tertiary inks move one step darker, to the
phone's values (`--ch-ink-600` #46433d, `--ch-ink-500` #5f5c55). Reading sheets are brighter (#fdfbf7) and their
edge ring firmer, at 0.085 at rest and 0.1 on hover.

## 2026-10-06 — No banding: solid sheets, no canvas wash

The owner saw the ivory as grainy in its gradients. Large, gentle ivory gradients band on 8-bit displays, so reading
sheets (`--ch-sheet-bg`) are now solid ivory; their lit top edge remains the elevation's inset highlight. The canvas
wash is removed. Small keys and wells keep their gradients, because they are too short to band.

## 2026-10-06 — Classic direction: ivory shell, canopy, serif titles

Owner direction, live in review: aim for a Masters, old-money look; an ivory sidebar with green only on the
selected row ("way too much green"); and one green throughout ("it's not even the same green"). The owner noted the
overall direction may be revisited later.
- **Shell:** the sidebar and the frame around the canvas are ivory (`--ch-shell`). The selected row is a green key in
  `--ch-field-green`, and the brand uses the green golf mark with a serif wordmark. The next-event card is a light
  sheet.
- **Canopy (`main[data-canopy]`, desktop):**
  - The page's title block paints an edge-to-edge field in the one Clubhouse green, closed by a fine gilt rule.
    There's no box: the fill is a spread box-shadow clipped at the title block's lower edge, so it ends where the
    title does on every page.
  - The title is ivory with an engraved shadow.
  - On scroll the title folds away and the top bar settles from clear-on-green to the ivory glass (scroll-driven;
    off with reduced motion or Animations off).
  - Researched against Apple Sports, Health and Journal navigation fields.
- **Serif titles:** Instrument Serif (`--ch-font-serif`, `--ch-type-serif-*`) sets page and section titles only.
  Data, controls and body text stay sans.
- **Scoreboard:** shares the one green.

## 2026-10-06 — Tone, type and scoreboard (owner direction)

Owner direction, given live while reviewing in Safari. The page is a slightly deeper ivory, about midway between the
earlier ivory and the darker trial, with a faint green-and-champagne light across its top. Cards return to a light
ivory that stands off it ("too much white", then "make the cards lighter", then "somewhere in between").
- **Display type:** relaxed everywhere. The width axis goes from 88 to 96 and the tightest tracking eases to -0.026em,
  after the owner called the display type "too compact".
- **Wells:** a step darker with a crisper edge. Muted text inside any well steps up one ink, so dates and scores
  never sit ivory on ivory.
- **New scoreboard material (`.ch-scoreboard`):** scorecards are set on a deep green board with ivory numerals. Board
  finishes for the marks: a red disc under par, a ringed disc for eagle, an ivory outline over par, and a solid ivory
  tile for double or worse.
- **Type on green:** the hero band and scoreboard set type in a warm ivory (`--ch-on-green-ink`) with a soft engraved
  shadow, never white (owner: "more ivory and text depth").
- **Shadows and radii:** this pass's component shadows are now tokens, and the shared nine table radius is on the
  scale.

## 2026-10-06 — Premium materials, seams, radius scale and smooth scroll

Owner-directed pass on shared materials, verified in Safari 27 (desktop 1440 and
iPhone emulation). Reading surfaces regain a layered light: a lit top edge, a
contact shadow and a soft ambient shadow. Dark and branded surfaces use a
shadow-only cast. New on-dark materials (raised, well, control) serve the
green hero. Joins inside one surface use an engraved seam, an ink line beside a
lit line (`--ch-seam-x`, `--ch-seam-y`), in place of faint hairlines. Score marks
(birdie, eagle, bogey, double) share one raised construction with an edge and
depth. The secondary button ring is softer with a firmer lift. The phone tab bar
floats as a glass capsule above the safe area.

Radii snap to the scale (owner choice): wells and segmented tracks 14px, sheets
20px, raised chips 10px; inner pieces are concentric (track radius less its
padding). Sidebar brand, nav item and next-event radii follow.

Desktop canvas scrolling eases mouse-wheel steps (Lenis, `CH_SCROLL_DUR`); touch
pointers, phone layouts, reduced motion and Animations off keep native scroll.
Route changes and Back restoration jump instantly; in-page jumps ease.
Safari audit on player Home: no console errors, no failed requests, viewport and
safe areas correct, no off-scale radii left on the page.

## 2026-10-06 — Shared component playground

Added a development-only workspace for original/candidate shared components,
real phone/desktop frame sizes, long-content stress, local visual tuning and
CSS proposal export. Modal/menu keyboard behavior and reduced-motion samples
remain shared. No production tokens or page designs are changed. The gallery
can be framed only by the same origin in development. Open Props, GUI Challenges
and Radix Themes are documented as the three reference priorities. Stylelint
adds invalid-color, calc-operator and keyframe-priority checks.

## 2026-10-06 — Quality tooling and scoped agent guidance

Clubhouse agents now follow its own tokens and exemplars. The premium profile
covers all 15 page families; an optional reviewer checks implementation details.
Dedicated Chromium/WebKit checks exercise normal and reduced motion, keyboard
contracts, popup bounds and accessibility. Reviewed external visual baselines,
a CSS regression guard and a raw-capture performance budget reader support
repeatable audits. Next DevTools MCP and React DevTools are pinned; setup and
evidence limits are documented in [QUALITY_TOOLING](QUALITY_TOOLING.md).
This entry changes tooling, not page appearance or release acceptance.

## 2026-10-06 — Owner rejects excessive card depth

The owner described the large stacked shadows as looking poor and artificially
styled. The shared depth ladder now uses quiet contact shadows for reading
cards, shallow controls, a small floating lift and stronger separation only for
menus/sheets. Settings form groups have no drop shadow. Home and Recruiting
card overrides use the same reading token, including Home’s hero and nested
next-event card. Broad 44/52px reading-card shadows
and stacked bubble shadows are removed. Existing layout, colors, typography,
focus indication and data behavior remain intact. This updates the October 2
depth direction; earlier audit entries below record that prior review.

Before/after normal-content captures are in page VERIFY logs. Physical-device
and owner visual acceptance remain open in [POPUP_AUDIT](POPUP_AUDIT.md).

## 2026-10-06 — Popup layout and native-layer repairs

Reading-destination headings no longer wear the global control outline; shared buttons use their existing rounded focus treatment. Settings form/list sheets initially focus their heading. Calendar custom popovers and the desktop team listbox are height-bounded. These changes preserve keyboard access.

Menus inside native dialogs now receive pointer input in the same top layer.
Tall menus are bounded and scroll above keyboard space. Modal descriptions are
announced, long headings/descriptions wrap and scroll without hiding footers,
and Settings/Recruiting phone bars reserve space for their actions. Tall action
sheets remain reachable on short screens. Full source inventory and browser
evidence are in [POPUP_AUDIT](POPUP_AUDIT.md).

Every Clubhouse change with the issue it fixed, newest first. Each page's own
changelog (`docs/clubhouse/pages/<page>/CHANGELOG.md`) has the detail; decisions
and the full verification log are in `docs/clubhouse/PROGRESS.md`. Nothing here
is in production: Clubhouse is behind a flag that is off.

## 2026-10-06 — Motion and streaming repairs

Settings replaces the sequential exit/entrance with immediate outgoing removal
and one 260ms incoming transition. OS reduced motion and Animations off use
zero-duration shared JavaScript transitions, including Home rounds, Roster
peek, Stats/segmented indicators, menus, team switch, offline notices, toasts
and Settings feedback. Approved normal-motion tokens and layouts are preserved.

CoachHelm schedules streaming follow-scroll once per browser frame, cancels
superseded work and respects the reader's position. It scrolls instantly while
streaming and when motion is disabled; sending otherwise retains smooth scroll.

Desktop WebKit fixture switches settled in 274–315ms normally (previously
550–562ms) and 45–48ms with OS reduced motion (previously 497–531ms), three
trials each. These include development overhead, not device FPS or production
INP. Before/after captures are logged on the affected page VERIFY records.

A paired Chromium 4x-CPU scroll probe covered Home, Stats, round Track, round
Setup and onboarding Account: 20 trials, 60 frames each, with filters enabled
and diagnostically disabled. Both had 16.7ms medians, 16.7–16.8ms p95 and zero
frames over 33ms. A pure buildTurns benchmark (200 messages, 100 trials) had
0.175ms median and 0.781ms p95. Neither supports a speculative glass removal
or parser cache. Physical Safari/iPhone traces, VoiceOver, keyboard and durable
writes remain release checks; the Mac is locked.

## 2026-10-06 — Smoothness source audit and stable appearance subscriptions

The audit targets the current Clubhouse source on main, selected by the
Clubhouse flags in preview/development. The older agent/clubhouse checkout
still contains navigation and dismissal behavior repaired in the October 1–2
passes. SMOOTHNESS_AUDIT.md separates these versions and inventories all
15 page families using their existing contracts, catalogs and runtime owners.

The shared appearance store now hydrates once and compares stored values before
notifying. Mounting another consumer no longer rerenders unchanged subscribers;
same-tab updates and cross-tab changes still propagate, and a storage clear
restores defaults. This changes no appearance, motion timing or server data.
Focused regression evidence and remaining runtime checks are in the audit.

## 2026-10-02 — Floating cards and stationary overlay backgrounds

The owner rejected striped, outlined cards and unstable pull-up screens. Shared
surfaces now use stronger soft elevation, with decorative rails and frame rings
removed across Messages, Hub, Stats, Roster, Classes, Qualifiers and CoachHelm.
Focus outlines and meaningful selected/chart states remain.

Nested and exiting overlays hold one reference-counted scroll lock, preserving
the underlying page position and returning focus without scrolling. Modal close
animation runs before the native dialog releases its lock. Drag events follow
one primary pointer and cancel cleanly; nested dialogs have unique title IDs.
The welcome also protects its text from background trees and removes blur.

## 2026-10-02 — Installed plugins find concrete flow and data gaps

The owner requested Apple Messages display and behavior with the existing
green/ivory palette. Phone threads now group their bubbles, use direct-chat
width, insert a newline with Return, and preserve selected-message context.
Quoted replies carry the existing parent relationship through send, optimistic
state and Retry; the server validates conversation access. The Supabase plugin
guides this existing-schema integration; no migration is added.

Frontend Design Premium and Shiro preserve the supplied visual direction while
checking shared ownership, phone geometry and feedback. Intuitive Software
Design reviews Roster, Stats and Hub tasks; Codebase Design reviews Home's read
seam. Root DESIGN.md and UI_OWNERSHIP.md point to existing handoffs and runtime
owners. They do not replace the page contracts or generate a second CSS system.
The plugin auditor's scope is declared in premium-ui.json.

Corrections: repeated Sign in sends one request, failed attempts can retry,
round controls reach 44px, qualifier names wrap, stats filters reach 44px and
roster profile spacing/material follows its list. Hub exposes per-object saves,
allows independent writes, retains a post until acknowledgment confirms, and
rolls back to the last confirmed state. Home uses the team clock and avoids
invented par, sand-save and incomplete attendance figures. Shared scrollbars
retain native scrolling and restore defaults under forced colors.

The scoped static plugin auditor cannot resolve custom React Button/Form
semantics or inherited CSS. Its remaining detections are reviewed against the
canonical owners and browser evidence; strict automated compliance is not
claimed. Local fixture behavior, layout and regression tests provide bounded
evidence. Physical iPhone frame rate, human usability and live-account
persistence remain unverified. No merge, production deploy or flag change.

## 2026-10-01 — Safari design fidelity and restored surface depth

Branch: `codex/clubhouse-design-fidelity`. Owner reference: Coach home dashboard
redesign (5)/(6), existing auth handoff, and the supplied Safari photo. The
current feedback supersedes the darker flat phone treatment and clubhouse-only
phone camera. Shared sheets, content wells and Messages bubbles regain graded
ivory/green faces, upper highlights, contact shadows and restrained ambient
depth. The mobile canvas remains warm ivory with the existing readable type
floors. The Home header uses the compact GolfHelm mark on a 32px medallion.
Named page snapshots use a simultaneous 180ms crossfade without the old arrival
delay, including browsers without transition-class selectors. Browser edges read
current tokens and create a missing theme-color tag, replacing a stale darker
beige.

Home, Auth and eight secondary page passes are logged in their page changelogs.
Shared CSS and several secondary page styles remain outside the semantic
knowledge map; page manifests and their design/verification documents cover
them. Home and Auth behavior paths are now mapped to their existing features.
Physical iPhone frame rate and the owner's deployed preview are unverified;
local WebKit evidence is filed under `.helm/screenshots/clubhouse/`.

Verification: targeted component/data suites, scoped ESLint, TypeScript,
Clubhouse contracts, knowledge checks, screenshot validation and Markdown
ratchet pass. The full production build exits 0: compiled successfully,
TypeScript completed, all 181 static pages generated and route table emitted.

## 2026-10-01 (aesthetic audit)

| Page | Issue | Fix |
| --- | --- | --- |
| All phone pages | **Secondary and tertiary text read as one gray (aesthetic audit M-L1).** Tertiary was raised to hold 4.5:1 on the darker page and sat 1.1 contrast points under secondary. | `tokens.css` phone block: `--ch-ink-600` is `#46433d` (9.3 against 6.3). Q-147. |
| All pages | **Search, input and textarea placeholders measured 2.8:1 on the phone page (M-L3).** | `controls.css`: they use `--ch-text-tertiary`. Q-147. |
| All phone pages | **A 30px coin drew its initials at 10.2px (M-T1).** | `ui.css`: the phone's 12px floor, with a 42% rule for a coin too small for it. Q-147. |
| Messages | **Unread rows barely differed from read ones (M-L2).** | Unread name 700, unread preview `--ch-ink-700`. |
| Home | **Stacked coins hid their initials (H-1); the latest round's stats floated 171px to 234px below its scorecard (H-2).** | Overlap 4px; the footer follows the scorecard. |
| Rounds | **The shot screen kept desktop gutters on a phone (S-1): a container query on its own container never ran.** | `.ch-rt-q` is the container; the phone's 12px padding applies and the strip bleeds. |
| Calendar | **Events sharing a column showed "Sh..." (C-1); audience coins hid their initials (C-2).** | Shared blocks wrap their title and keep the start time; overlap 5px. |
| CoachHelm | **A two-line metric label ran at line-height 1.0 (CH-1).** | 1.3. |
| Segmented controls, Home, Calendar, Rounds | **Contrast sweep (X-1 to X-4): unselected segmented labels 4.1:1, Home weekday labels 4.1:1, class and busy event times 3.6:1 and 4.0:1, the shot strip's par labels 3.8:1 and its option notes 3.2:1.** | Secondary ink on the segmented label and the weekday label; the event time keeps its color; the strip labels 0.66 and the option notes tertiary. Past-event fade: Q-152. |
| Qualifiers | Audited, no defect found. | None. |

Findings, evidence and the owner questions (Q-148 to Q-152) are in `AESTHETIC_AUDIT.md`.

## 2026-10-01 (shared pieces, backfilled from the history)

The changelog gate now holds a shared piece (a file under `src/clubhouse/ui`, `lib` or `styles` that no page owns) to this log. These changed on the branch with no entry or sha here; each row is read from its commit.

| Shared piece | Issue | Fix |
| --- | --- | --- |
| `styles/*` (page phone blocks), Home links | **Phone text under 12px, wide chart axis text, and Home's links under 44px (audit F09, Q-141).** `0595983ff` | A 12px floor in each stylesheet's phone block; chart axis text readable; the links hit at 44px. |
| `lib/format.ts`, `styles/home.css` | **A change that rounds to zero read as a gain or loss on Home.** `21d75dfdf` | It is plain on both Homes. |
| `lib/session-state.ts` | **Kept screen state drew over a streamed part while it hydrated (Qualifiers review S1).** `c331f404a` | It draws the default until the part hydrates. |
| `lib/use-action.ts`, `lib/motion.ts`, `lib/press.ts`, `lib/reduced-motion.ts`, `lib/track.ts`, `ui/States.tsx`, `ui/Toast.tsx` | **Contract codes (P001, P007) named at their implementation.** `9cd0c284d`, `a5701f290` | Comments and tags only; no behavior. |

## 2026-10-01 (CI on PR #2111)

| Page | Issue | Fix |
| --- | --- | --- |
| Roster | **Lint ratchet up by one (`react-hooks/exhaustive-deps`, 59 to 60).** The effect that restores the saved view called `setView` with an empty dependency list. | `setView` is listed. It is `useChSessionState`'s `useState` setter, so its identity never changes and the effect still runs once: no behaviour change, the warning count is back to baseline. |
| Dashboard layout (Fairway and Clubhouse) | **Two layout tests failed: `dashboard-layout-onboarding-retry.test.ts`.** `0dfa3ee47` moved the coach's team lookup to `dashboard-request-cache.ts`, which calls the three-way `resolveCoachActiveTeam`; the test's `resolve-team` mock only had `resolveCoachActiveTeamId`, so the layout threw. The test read the throw as "still waiting", which is why it looked like a timing failure. | The mock adds `resolveCoachActiveTeam` returning `{ status: 'ok', teamId: 'team-1' }`, the same team the old mock pinned. Assertions unchanged; 5 of 5 pass. Found by catching the rejected render, not by loosening the wait. |
| E2E seed | **Review Gate ast-grep `helmv3-no-service-role-key`.** `e2e/helpers/clubhouse-local-seed.ts` read `SUPABASE_SERVICE_ROLE_KEY` from the environment directly. | It reads through `tryGetSecretKey()` (`src/lib/supabase/keys.mjs`), the repo's one sanctioned reader. The helper still refuses any URL that isn't localhost, so the key can only ever reach a local stack. |
| Perf harness | **CodeQL `js/file-system-race` (two) and `js/http-to-file-access` (one)** in local-only scripts. | `perf-measure.mjs`: the seed file is created exclusively (`flag: 'wx'`), so two runs can't both write it; the production-reference scan reads size and contents from one open file descriptor, so the file checked is the file read. `perf-fetch-trace.cjs` writing request timings to a file is the script's purpose (local stack only, opt-in by `HELM_PERF_TRACE_FILE`); that alert is dismissed as won't-fix, the same as `scripts/schema.mjs`. |
| Page docs (all 15) | **Markdown lint up by 32 (MD060, table column style).** The new `## Screenshots` table in every VERIFY.md and the template used a `\|---\|---\|` divider row, which the "compact" table style rejects (two violations a table). | The divider is `\| --- \| --- \|`, as in every other Clubhouse table; MD060 is back to the baseline. The rule wasn't relaxed and the baseline wasn't raised. |
| Perf harness | **CodeQL still flagged `js/file-system-race` twice after the first fix.** An `existsSync` before the exclusive create still read as a check-then-act, and the scan still `stat`ed a path before opening it. | The seed file is claimed first with an exclusive open (a second run fails before seeding anything; a failed seed removes the claim), and the scan takes each entry's type from the directory listing, so no path is stat'ed and then opened. |
| Docs tooling | **CodeQL on the new docs scripts (four alerts).** `shots.mjs` escaped `\|` in table cells without escaping `\\` first (the same bug as F-26) and checked a screenshot exists before stat-ing it; `changelog-gate.mjs` and `docs-index.mjs` used alternations whose anchors bound to one branch only. | Cells escape backslashes first; the screenshot is stat-ed once and that result is reused; "is a test file" and "is an audit or plan doc" are plain checks (`includes`, `endsWith`) with no ambiguous anchors. Same answers; the 58 script tests pass. |
| Home (test) | **`player-home-phone.test.tsx` failed on CI shard 3.** It pinned the player-only `opacity: 1` override for past rows, which Q-152 (`b359c0414`, owner kept) made unnecessary: no past row is dimmed on either Home now. | The test asserts the same contract in its new form: no `.is-past` row rule sets an opacity, and the time steps back through the shared rule. 19 of 19 pass. |
| Docs tooling | **CodeQL `js/file-system-race` at `shots.mjs` `log`.** VERIFY.md and each manifest were checked for existence, then read and written. | One `readIfPresent` read (null on ENOENT) replaces each check-then-read. |

## 2026-09-30

| Page | Issue | Fix |
| --- | --- | --- |
| Stats | **Last 10 ended at 1 Aug (Q-122).** | Reads across seasons. |
| Stats, Home | **Total-only rounds counted nowhere (Q-123).** | Scores only. |
| Team Hub | **Large teams' RSVP and task counts were cut at 1000 rows (swap audit F-21).** The attendance and task-assignment reads asked PostgREST for 2000 and 5000 rows; it returns at most 1000, silently. | Both reads page through every row (`fetchAllRowsResult`, ordered by id). Test `hub-paged-reads.test.ts`. |
| Held migrations | **Lint and migration safety (F-22).** The availability constraint was added without `NOT VALID`; the document policy migration opened its own transaction inside the migration tool's; four files raised SQL lint by 182. | `NOT VALID` on the new column's constraint, no nested `begin`/`commit`, layout reformatted (squawk 0 issues, SQL lint back to baseline). Still held. |
| Rounds | **Queued rounds waited for a round screen (swap audit F-14).** Only the Fairway shell started the offline sync engine, so with Clubhouse on a round, hole or shot saved offline synced only while a round screen was open. | `shell/OfflineSync.tsx` starts the engine for the whole session (interval, reconnect, service-worker requests) and feeds the offline store; no UI. Test `offline-sync.test.tsx`. |
| Shell | **The full test suite failed in 8 files that draft CI never ran (F-15 to F-20).** The reduced-motion guard didn't know `useChReducedMotion`; `formatToPar` was declared twice; the mute actions weren't observed; the selection route had no error or loading state; three Fairway page tests drew Clubhouse (the flag is on in tests); four migrations lacked VERIFY/ROLLBACK lines. | Delegate registered; one `formatToPar` in `lib/golf` (Fairway output unchanged); mute actions wrapped and registered; boundaries added; tests pin the gate off; header comments added. `test:all` failures fixed and rerun green. |
| Docs | **The flag text said coach-only (F-13).** | `golf_clubhouse_ui` names both roles, and its cleanup plan requires every route in `SWAP_AUDIT.md` to have a destination and an observation window before Fairway is retired. |
| Stats (team) | **A team with only 9-hole rounds this season saw "No stats yet" (D-71).** The first-run page is for no round, but 9-hole rounds are left out at the default of 18 holes, so it told a team with rounds that none had been posted. | The first-run page is for no round of either length: a team with a 9-hole round in the window gets "No 18-hole rounds in this window yet" with the hint to choose 9 holes or Both in Filter. |
| Stats | **Stats could only be read through its three fixed windows, and left out every 9-hole round (owner: "make it 9 or 18").** A coach or player could not look at tournaments alone, a stretch of dates, a course or chosen rounds; 36 nine-hole rounds (5%) were never shown. | One round filter on the team and player pages, desktop and phone, kept in the address: round type, holes (18 by default, 9, or Both), time (the windows or a date range, which may reach before the season), course, and Only these / Exclude these, with removable chips, Clear and a count line. Every figure follows it: per-round figures per 18 holes (a nine-hole round counts as half), rates pooling the holes, early-read floors in whole rounds, bests listed by length. Nothing in the shared stats code was edited. |
| Recruiting | **Recruiting had no Clubhouse screen.** With Clubhouse on, a coach opening Recruiting got the existing page, styled for the old app, and the owner's approved boards (Q-87) were not built. | New page P014 at `/golf/dashboard/recruiting` (coach only), built from the boards on the existing server actions with no schema change: the header, the four-stage pipeline that filters the list, search over name, hometown, state, email and notes, three sorts, and each prospect's panel with Email and Call, notes and private documents (upload, open, remove). A stage is saved the moment it is picked and goes back with a Retry if it does not land (CH-14003); delete asks first (CH-14501). The phone is the boards' phone build: a pushed prospect, and the edit form, the stage picker and delete as sheets. In the coach's Team section after Roster. 53 catalog states (CH-14001 to CH-14914), each named by a test (motion is preview-checked); with the flag off the existing page is unchanged. |
| Stats (player) | **The player page showed a fraction of what the production page shows (owner: "scrambling, GIR, putting, all of it").** Four figures and two or three visuals an area; Game detail's shot-level figures counted a different set of rounds than the headline (a date preset, 9-hole rounds included). | `PARITY.md` lists every production figure and where Clubhouse shows it (or why not). Each Game detail section says which rounds it counts (the window's own 18-hole rounds, now what every figure reads) and gains a More detail disclosure; the Rounds tab gains score by round, personal bests and this window against the one before; the Overview table is the standing board (Tour values, a coach's team figures, floor notes). Approach proximity is now graded on the Tour's basis (every approach, 10 shots a range) and putt bands are cut as the calculator cuts them. 13 new catalog states (CH-5209 to CH-5212, CH-5311 to CH-5319). |
| Stats | **D1 benchmarks (Q-88).** Team and player Stats, and player Home, graded against D1 averages (GIR, putting bands, scrambling, proximity, par tiles, notes) and filled a women's team's gaps with the men's values. | The Tour is the only benchmark: every mark, column, note and figure reads the Tour's average (`golf_pga_standards.pga_tour_value`, the team's own tour, never the men's for a women's team), and a metric the tour has no value for shows nothing. A test renders every stats screen and fails on "D1", a division or college. |
| Stats (team) | **Strokes gained had no headline, read the last week, and its bars were clamped.** The figure row had no strokes gained; each leg card's headline and the trend's player list were the latest week's value (sorted by it too); the notes read a change as a level; the phone's leg bars clamped at 1.4 and the grid's tint at 1.2. | A sixth card leads the row, Team SG per round (the window's mean, a change chip against the previous 10, "vs Tour"; CH-4311, CH-4312). The leg cards, the list and its sort use the window's mean; the note reads "up about 1.0 a round since Aug 30". Bars scale to the data (the largest value rounded up, at least 1), and the phone adds a team total. |
| Stats (player) | **Strokes gained was thin and mislabelled.** The phone said "vs D1" (there is no D1 strokes gained), showed one SG number and none on its rounds; the desktop Rounds tab had the total only; the comparison table and the make-rate curve stopped short; the early-read banner counted rounds, not rounds with shots. | Every figure says "vs Tour". Phone: a Strokes gained panel (four legs and total) and each round's SG. Desktop: the four legs per round, SG rows in the comparison table (a coach sees the team's mean; a player no teammates), a change chip against the previous 10, bars on the data's scale, a banner for rounds without shots (CH-5308, CH-5309, CH-5310), and a make-rate curve out to 25+ feet with exact counts. |
| Home | **The player's strokes gained said "vs D1".** | "Season, per round vs Tour"; the legs' header says the strokes gained are the season's and D1 marks the stats. |
| Rounds | **A round's review had no strokes gained.** | A card under the figures, on desktop and the phone: the total and four legs on the round's own scale, "vs Tour"; a round without shots says so in one line (CH-11313). |
| Team Hub | **Phone tap targets.** On the phone the section tabs (40px tall, about 36px wide), the event rows (35px), Going / Maybe / Can't (30px), the icon buttons (32px) and the task tick (24px) were under Apple's 44pt minimum. | The tabs are 44 tall and at least 44 wide (the strip scrolls sideways, which would clip an invisible hit area); the event rows are at least 44 tall; the reply buttons, icon buttons and tick get an invisible 44 x 44 hit area (`hub.css`). |
| Rounds | **Round entry is routed.** A Clubhouse player opening /rounds/new or /rounds/continue/[id] got the not-rebuilt notice, and no New round, Start a round, Continue or Post a round control was drawn, so a player with the flag on could not start or continue a round. | Both addresses render Clubhouse's round entry over the round engine when the flag is on for the player (Fairway's client with it off), with a state for every engine outcome: recovery, a round already in progress, a start refused, a reload, a closed qualifier (Save as practice), failed saves and discards with Retry, offline, a slow submit. A Retry runs the round as it is now, never twice. Not seen in a browser or on a phone yet (P011 VERIFY). |
| Rounds | **Phone tap targets.** The review's previous and next hole (30px), the unfinished round's discard (38px), the shot screen's pills (36px) and setup's Back (34px) were under 44pt on the phone. | Each gets an invisible 44 x 44 hit area without changing how it is drawn (`rounds.css`, `rounds-track.css`, `rounds-setup.css`). Left as they are: the nine-across hole strip and the scorecard's hole cells (nine 44pt columns do not fit in 390pt, and the whole column picks the hole). |
| CoachHelm | **Phone tap targets.** The player rows in the phone list were 38px tall. | They are at least 44 tall (`coachhelm.css`). |
| Settings | **Phone screens (coach and player).** Settings on the phone was the desktop layout squeezed down. | The approved grouped-list design: sections push full screen, switch rows, bottom-sheet pickers, edit sheets with Cancel and Save (a discard question when closed with changes, CH-8509), the typed "delete" sheet (CH-8510), iOS action sheets, and the priority reorder by hold and drag. Desktop behaviour is unchanged (shared `hooks.ts`). Quiet mode's note corrected to what the code does. 56 phone tests. |
| Shell | **Phone sheets and the keyboard.** On the phone the keyboard covered the lower fields and the Save button of every bottom sheet with a text field (New event, Plan a trip, New announcement, notes, Add a course). The app never resizes for the keyboard, and only Messages and the Settings sheets lifted themselves. | Every sheet (`.ch-modal`) now sits on top of the keyboard while it is open, shrinks to the space above it and scrolls its body, so the focused field and the footer stay visible (`controls.css`, `--keyboard-height`). |
| Shell | **Phone tap targets reach 44 x 44.** The native-feel scan found controls under Apple's 44pt minimum on the phone: segmented controls drawn at 26px, small buttons at 30px, pills at 36px, 40px icon buttons and short text links (Team stats, Add, Message). | On the phone each of these controls gets an invisible hit area that reaches 44 x 44 around it, without changing how it is drawn (`controls.css`, zero specificity so a page's own hit area wins). |
| Shell | **Quick second taps.** A fast second tap on a control (a score stepper, a toggle) could be read by iOS as a double-tap zoom. | Buttons, links, tabs, switches, labels and selects use `touch-action: manipulation` and no long-press link preview; pinch zoom still works everywhere (`base.css`). |
| Shell | **Native-feel and phone-width scans.** The accessibility scan ran only at 1280 and 390px, never checked sideways scrolling, and stopped the whole run when one tap failed. | New `scripts/clubhouse/native.mjs` (tap targets under 44, text fields under 16px that iOS zooms into, sideways scroll, at 390 and 430px); `a11y.mjs` takes `CH_WIDTHS`, fails a phone page that scrolls sideways, and reports a failed tap instead of crashing. |
| Shell | **Old addresses open the rebuilt screens.** With Clubhouse on, notifications and bookmarks to /tasks, /announcements, /documents, /travel, /roster/[id] and /rounds/[id]/review opened Fairway pages inside Clubhouse. | Each route's layout sends the viewer to the rebuilt screen (Team Hub tabs, the player's Stats profile, /rounds/[id]) through `routes/alias.ts`, only when that screen is rebuilt for their role; flag off, nothing changes. |
| Shell | **The bell on phone tab roots (Clickables gap 1).** Tab roots that draw their own title (CoachHelm, the player's Rounds and Team Hub) hid the bell, so a player had no bell on three of four tabs. | `PhoneTop start` with no action puts the top bar in a `start` mode: the page title and the bell. |
| Shell | **Team Hub count for players (Clickables gap 3).** A player's Team Hub item had no count. | The sidebar and phone tab carry the current app's Team Hub count (unread announcements, tasks and trips), nothing when there are none. |
| Shell | **The gear opens the page's own settings (Clickables gap 20).** The coach's top-bar gear on CoachHelm and Team Hub opened the Settings home. | There it reads CoachHelm settings or Team Hub settings and opens that section (?section=coachhelm, ?section=team); elsewhere and for players it stays Settings. |
| Home | **Latest round opens its review (Clickables).** Home's latest round linked to Stats, though the round review now exists. | Open recap (desktop), Round recap (coach phone) and the player's phone card open the round's review, falling back to Stats when the review is not rebuilt for the viewer. |
| Home | **Latest rounds links to Team stats (Clickables gap 6).** The coach phone Home's Latest rounds header had no way on (the board's "All"). | It links to Team stats, only when rounds are listed (a coach has no rounds library, Q-79). |
| Roster | **Schedule 1:1 on desktop (Clickables gap 4).** The desktop Roster panel had no way to plan a 1:1, which the phone had. | Schedule 1:1 opens Calendar's editor with only that player invited (`calendar?new=1&with=<id>`, D-52). |
| Roster | **View insights in the row menu (Clickables gap 16).** The List view's row menu had no way to CoachHelm's read of a player. | The menu starts with View insights, which opens CoachHelm on that player (an id not on the board opens the most pressing player). |
| Stats (player) | **Schedule 1:1 in the hero (Clickables gap 4).** A coach on a player's Stats profile had no way to plan a 1:1. | Schedule 1:1 opens Calendar's editor with only that player invited (D-52). |
| Calendar | **Duplicate, Print and the jump panel's Close (Clickables gaps 9, 15, 21).** The board draws Duplicate, Print and a Close on the jump panel; none existed. | Event actions › Duplicate (coach) opens New event seeded from the event and publishes a new one; More › Print week (day, month or agenda by view) prints the view with the shell dropped; the jump panel has its own Close. |
| Calendar | **Compare schedules on a class (Clickables gap 17).** A coach looking at a player's class had no way to set it against the team's schedule. | A class's detail ends with Compare schedules: New event on the class's day with only its player invited, so Find a time compares the two. |
| Messages | **Right click opens reactions (Clickables gap 23).** On desktop a right click on a message did nothing. | It opens the message's reaction bar, as the React button does; the phone keeps its long press. |
| Team Hub | **Plan a trip in four steps, and a travelers audience (Clickables gaps 8 and 22).** Plan a trip was one form, with no link to the calendar event or who travels; New announcement could not reach a trip's travelers. | Four steps (Event, Travelers, Logistics, Itinerary) with Back and Next; the event fills name, place and day, its invitees are the travelers (written with explicit adds and removes); Publish saves the trip once, so a Retry writes only the travelers. New announcement offers "<trip> travelers · N". New states CH-10210, CH-10211, CH-10312, CH-10313. The class-clash line is not built (Q-84). |
| Team Hub | **Untick a done task (Clickables gap 18).** A player who ticked a task by accident could not undo it. | A tick on a done task opens it again through the new `uncompleteTask` (their own assignment back to pending, as the live RLS policy allows). Optimistic; a refusal leaves it done with CH-10011 and Retry. |
| Rounds | **Round entry states (Q-81).** The live round flow has four states the /rounds boards do not draw: a saved round to recover, a round already in progress on the same course and day, a reload, and a qualifier that closed during the round. | RecoveryDialog, InProgressConflictDialog, ReloadBanner and RoundErrorBanner, SaveAsPracticeSheet and the Save for later / Discard failure toasts, as Clubhouse components; Discard now asks first everywhere. Engine wiring waits on #2104 (stacked, Q-81). Preview /clubhouse-preview/entry. |
| Rounds | **A tap on a score picks the hole (Clickables gap 7).** In the round review's card only the hole number picked a hole. | A tap on a score picks that hole too, with the select haptic (pointer only; the hole number stays the keyboard control; Tot picks nothing). |
| Rounds | **Cancel on Add a course (Clickables gap 24).** Closing Add a course dropped the coach out of the course picker. | Cancel goes back to the picker it was opened from, as on the board (preview only until #2104). |
| CoachHelm | **Assign as focus on a strength (Clickables gap 12).** Assign was hidden on a strength, though the board draws it on Theo's card; contract 130806 had been written from the code, not the board. | CoachHelm offers Assign as focus on a strength (a keep-doing focus); 130806 is reworded (Q-80, kept by the owner). |

Earlier changes (2026-09-28 to 2026-09-30: the page builds, the contract passes and their fixes) are listed in each page's changelog.

## 2026-10-06 — Complete page documentation and fixture audit

Updated all 15 page families and their catalogs, phone specs and checklists
with source ownership, current evidence and explicit device/release gaps.
ALL_PAGE_AUDIT.md records the 305 state cases, 60 WebKit base renders,
24 onboarding renders and measured Settings reduced-motion mismatch.
The screenshot log now ignores generated galleries; its regression first
failed and then passed. Production settings and approved handoffs are intact.

## 2026-10-06 — Premium audit, complete catalog and focus repair

Added the complete component/style catalog, a repeatable material declaration
inventory and the read-only clubhouse-design-reviewer. Recorded all 15 page
families and 383 local synthetic renders in
[PREMIUM_AUDIT.md](PREMIUM_AUDIT.md).
Shared opt-in keyboard alternatives now reveal in document flow; ordinary
screen-reader labels remain hidden. Message quotes and desktop Game detail
observe live Animations off as well as OS reduced motion. No production flag,
database or deployment changed.

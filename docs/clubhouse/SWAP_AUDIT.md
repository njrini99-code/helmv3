# Clubhouse complete-swap audit

The finding register for the owner's swap audit
(`GolfHelm_Clubhouse_Complete_Swap_Audit.md`, 2026-09-30). The owner chose "fix
as I go": each finding fixed on the branch carries its commit and regression
test. Owner decisions are logged in `PROGRESS.md` as Q-n. The CHANGELOG
(`CHANGELOG.md`) lists each fix.

Evidence labels: **Source-confirmed**, **Reproduced** (with test and SHA),
**Documented, not reverified**, **Risk to test**, **Owner decision**,
**Passed**, **Blocked / not exercised**.

## 1. Baselines

| Baseline | SHA | How it was established |
| --- | --- | --- |
| Production (served) | `ef6e017a2` | `npm run release:status`, 2026-10-01 |
| main | `c706fc80e` | `origin/main` |
| Clubhouse candidate (#2102) | `c221d1ca2` | `agent/clubhouse` |
| Release train | PR #2110, `agent/release-train` at `c0f1b17fe` (#2102, #2104 round engine, #2108 security, #2109 stats engine, plus the audit fixes) | local `next build` exit 0 at `24a4bbca2` (later commits: docs, lint layout, the Hub read fix, one test timeout); CI rerunning at `c0f1b17fe` |

**Production flag state:** `golf_clubhouse_ui` and `golf_clubhouse_front_door`
are off in production and on in preview and development
(`config/feature-flags.yml`). Per Q-4, production stays off until the owner has
done a live preview pass. A train deploy therefore ships the flag-off (Fairway)
experience plus the shared fixes. Every finding below that says "flag on"
affects no customer until the flag is flipped.

## 2. Scorecard (audit §20)

| Gate | Status | Evidence |
| --- | --- | --- |
| Baseline | **Passed** | §1 |
| Complete shell swap | **Open**: route gaps in §3; the owner decides build, alias or retire (after this audit) | route table §3 |
| Round preservation | **Source-confirmed fixes, runtime not exercised**: database contracts Passed (CI pgTAP at `c0f1b17fe`). Night audit: R-1..R-12 fixed in both engines with 35 new tests (`72c920ce3`); the shared-device re-create the security review found is fixed (`6acd57346`). **Open**: F-02 (recovery unreachable with the flag on), Q-119 (cross-device discard), Q-120 (held submit version check); device fault-injection on a real phone not run | F-02, R-1..R-12, Q-119, Q-120 |
| Calendar | **Source-confirmed fixes, runtime not exercised**: 9 bugs fixed (`ac64ba366`, `696b49570`); write journeys on the Demo team pending (they notify the whole roster: check Demo members' email and push first). Open: CAL-05 (series across the clock change), Q-108 (fan-out to the whole roster), create idempotency (in progress) | §4 Calendar |
| Stats and visuals | **Reconciled on production data (Demo team)**: the SQL oracle matches every player's Last 10 and the team row after F-51 (Q-122, Q-123). Visuals to the board (F-54), one smooth window switch (F-55). Earlier fixes F-34, C-14..C-16, C-24 (`98f7bb52e`). SG and Qualifiers reconciled (§4); stale stored SG on 7 rounds waits on the recompute. Open: Q-112 (comparison cohort) | §4 §10 Stats gate |
| Qualifiers | **Source-confirmed fixes**: one comparator for board, workspace and confirm; no-round players never rank; selection guards (`3c2fce175`). Open: Q-104/Q-114 tie at the cut (name order now decides it everywhere), Q-115..Q-117; coach_reasoning readable by players until held `20260929200000` is applied | §4 Qualifiers |
| Messages | **Passed**: two-session journey on the local stack, 7/7; deep link verified. Night audit fixed failed-reaction silence, lost text on a failed send and the coach phone inbox shift (CLS 0.292, not re-measured) | §4 |
| CoachHelm | **Audited**, no P0; owner: Q-124..Q-126, Q-76 | §4 §13 |
| Migrations | **Passed**: no train code reads a held column; every RPC the app calls exists in production or has a verified fallback; CI applied the whole migration set, held included, and all 86 pgTAP suites passed at `c0f1b17fe`; squawk and SQL lint clean | §5 |
| Phone/accessibility | **Partly exercised**: 46-page sweep, both roles at 390 and 1440 px (dev for visuals, the preview for timing). Fixed: F-29, F-30, F-35..F-39, F-41..F-50. Not run: real iPhone, VoiceOver, keyboard pass | §4 Full sweep |
| Build/regression | Local gates on `c7e24b4f9`: typecheck, lint ratchet, Supabase-error and fail-open audits, `clubhouse:check`, `docs:check` all 0; unit suite 2067 files, 22182 tests, all pass; local production build used for the F-56 timings. CI on PR #2111 at `9d65dd3ff`: see §4 | §4 |
| Cutover/rollback | **Open**: Q-131, Q-132; rollback target (§18) | §18 |
| Legacy retirement | **Not ready**: no retirement until every row in §3 has a destination (F-13) | F-13 |

## 3. Role × route table (F-01)

`isRebuilt(path, role)` in `src/clubhouse/shell/nav.ts` decides whether the
Clubhouse shell draws a route. Anything else renders the NotRebuilt placeholder
when the flag is on. An alias is `redirectToClubhouse` in a route layout
(`src/clubhouse/routes/alias.ts`).

### Rebuilt (flag on)

- **Coach:** `/golf/dashboard`, `coachhelm` (plus `?view=ask`), `calendar`,
  `messages`, `roster`, `recruiting`, `stats`, `stats/team`, `qualifiers` (plus
  `new`, `[id]`, `[id]/edit`, `[id]/selection`), `team-hub`, `settings` (plus
  `notifications`, `coaching-intelligence`), `rounds/[uuid]`.
- **Player:** `/golf/dashboard`, `coachhelm`, `calendar`, `team-hub`,
  `messages`, `rounds`, `rounds/new`, `rounds/[uuid]`, `rounds/continue/[uuid]`,
  `classes`, `stats`, `qualifiers`, `my-qualifiers`, `settings` (plus both
  sub-pages).
- **Aliased:** `tasks`, `announcements`, `documents` and `travel` go to Team Hub
  tabs; `roster/[id]` goes to `stats?player=`; `rounds/[id]/review` goes to
  `rounds/[id]`; `coachhelm/chat` goes to `coachhelm?view=ask` (coach).
- **Not a route, the team switcher (built 2026-10-01, Q-130):** a head coach on
  two or more teams (`canSwitchTeams`, the gate `setActiveTeam` enforces)
  switches from the sidebar's team line (desktop) or the More sheet's Team list
  (phone). It calls `setActiveTeam`, then `router.refresh()`, and the page
  remounts for the new team. A coach on one team, an assistant on several, and a
  player see the team as a plain label. Catalog CH-1003, CH-1305, CH-1813,
  CH-1814; `team-switch.test.tsx`.

### Not rebuilt with the flag on (owner decides after this audit)

| Route | Role | Today (flag on) | Suggested destination |
| --- | --- | --- | --- |
| `/rounds/recover` | player | NotRebuilt | **Build** (P0, F-02): a Clubhouse recover screen over `lib/offline/indexed-db` + `shot-storage` + `round-missing-recovery` |
| `/intelligence` (and `/alerts`, `/insights`, `/patterns`, `/analytics/coachhelm`, `/development`, which redirect to it) | coach | NotRebuilt | Alias to `coachhelm` (`?player=` kept) |
| `coachhelm?view=development\|profile\|standing\|deep-dive`; `/my-development`, `/my-game-profile`, `/my-standing` | player | NotRebuilt (F-04) | Alias: development and deep dive go to `coachhelm`; profile and standing go to `stats`. Or build |
| `/players/[id]`, `/players/[id]/game`, `/game/print`, `/genome`; `/coachhelm/genome/[id]` | coach | NotRebuilt | Alias to `stats?player=<id>` |
| `/coachhelm/genome/compare` | coach | NotRebuilt | Owner: retire or build |
| `/team` | both | NotRebuilt | Coach: `settings?section=team`; player: `settings?section=golf` |
| `/rounds` | coach | NotRebuilt (v2 has no coach library, Q-79) | Alias to `stats/team` |
| `/coachhelm/chat` | player | NotRebuilt | Alias to `coachhelm` |
| `/courses` | coach | NotRebuilt | Owner: build or retire (course management) |
| `/whats-new` | both | NotRebuilt | Retire, or alias to Home |
| `/hub`, `/my-insights` | both | redirect to rebuilt routes | none needed |
| `/dev/haptics`, `[...missing]` | — | dev and catch-all | none needed |

### Live notification destinations (production, read-only, last 180 days)

| Destination | Rows | Flag-on status |
| --- | --- | --- |
| `calendar?event=<id>` | 2,566 | **Passed (source)**: `calendar/page.tsx` passes `event` to `ClubhouseCalendarRoute` |
| `messages?conversation=<id>` | 2,250 | **Passed (source + test)**: `Messages.tsx` opens the thread; `messages.test.tsx` covers it |
| `calendar` | 443 | rebuilt |
| `announcements` | 136 | aliased to Team Hub (announcements tab) |
| `coachhelm` | 94 | rebuilt |
| `roster` | 65 | rebuilt. `roster?tab=requests` (code source) is **ignored** by Clubhouse Roster; requests show in the Roster header instead (P2) |
| `team` | 3 | **NotRebuilt** (see table) |

Code-only link sources not seen in recent rows: `tasks?task=<id>` (the alias
drops `task`; P2. Source-confirmed against Next.js 16.2.9: a layout never
receives `searchParams`, so no layout alias can carry a query string; it needs a
page or Proxy redirect, and Clubhouse Team Hub has no single-task view to land
on), `intelligence*`, `my-development`, `coachhelm?view=development`.

## 4. Findings

| ID | Sev | Label | Finding | Disposition |
| --- | --- | --- | --- | --- |
| F-01 | Blocker (flag on) | Source-confirmed | NotRebuilt for supported routes (§3). | Owner picks build, alias or retire per row, after the audit |
| F-02 | P0 (flag on) | Source-confirmed | With the flag on, a player cannot reach round recovery. `NewRound`/`ContinueRound` send the engine's `recover` destination to `/rounds` (`ENGINE_ROUTES`). `RoundsLibrary` reads server rounds only (in-progress `limit(20)`) and never reads `getPendingRounds`, `getFailedRounds` or `getRoundRecoverySnapshots`. A round saved only on the device can be neither seen nor restored in Clubhouse. | Open: build the recover screen (the §3 row). Stop condition for a player flag flip |
| F-03 | P1 | Source-confirmed | Leaderboard `buildBoard` (`screens/qualifiers/model.ts`) shares positions on equal to-par and total, orders ties by rounds played then name, and sets the automatic slots by that order. Selection `rankCandidates` (`lib/coachhelm/v3/qualifying/loader.ts`) assigns unique ranks in input order after to-par and total, and `classifySlots` uses them. A tie across the last automatic slot can put a different player in by each view. | Owner decision (Q-104). Oracle test to be written with the chosen rule |
| F-04 | P1 | Source-confirmed | `routes/coachhelm.tsx` `VIEWS_NOT_REBUILT`: development, profile, standing, deep-dive. | Owner decision (§3) |
| F-05 | P0 gate | Documented, not reverified | Authenticated writes on the candidate, fault injection and the iPhone pass have not run. | Preview pass by the owner (§6); local-Supabase journeys still to do |
| F-06 | P0 gate | Source-confirmed | `e2e/golf-round.spec.ts` drives Fairway controls against the configured DB. | Not certifying Clubhouse; a Clubhouse e2e is still needed |
| F-07 | P1 | Source-confirmed | Held numeric migrations (countable cache, test-round exclusion, putting, SG) change derived figures. | Stay held. The train does not depend on them (§5) |
| F-08 | P1 | Risk to test | The coach CoachHelm loader shows one top insight a player; counts can exceed the reachable items. | Not reverified tonight |
| F-09 | P2 | Documented | P013 WIRING described bugs already fixed in code. | Code is the evidence; WIRING to be reconciled |
| F-10 | P1 | Source-confirmed | The train changes shared code (round engine #2104, stats engine #2109, security #2108, `formatToPar`). | The flag-off slice runs in `test:all` (green after F-15..F-20) |
| F-11 | P1 | Documented | Attachment hardening SQL is not written (`held/data/message-attachments-hardening.md`: HELD). | Stays open. Qualifier hardening is held with a working fallback (§5) |
| F-12 | P2 | Risk to test | Messages drafts live in a component `Map`: kept across conversation switches, lost across reloads. | Not exercised |
| F-13 | P1 | Source-confirmed | The flag's `cleanup_plan` and `purpose` say "coach"; `isClubhouseFor` covers coach and player. | Fixed in docs: the flag text now names both roles and ties retirement to §3 (this commit) |
| F-14 | **P0 (flag on)** | Source-confirmed, fixed | Only Fairway's `OfflineProvider` started the sync engine. In Clubhouse, a queued round, hole or shot synced only while a round screen was open (no interval, no initial sync after a reload). | **Fixed** `940f86f8c`: `shell/OfflineSync.tsx`, mounted in `ClubhouseShell`. Test `offline-sync.test.tsx` |
| F-15 | P1 (CI) | Reproduced | The reduced-motion guard failed on 15 Clubhouse files. All of them gate on `useChReducedMotion`, which the guard didn't know. | **Fixed** `5dc014faa`: registered as a verified delegate |
| F-16 | P2 | Reproduced | `formatToPar` declared twice (Clubhouse copy). | **Fixed**: one implementation in `lib/golf/format-to-par.ts`. Fairway's integer inputs print unchanged |
| F-17 | P2 | Reproduced | `message-mute` actions were not wrapped with `withAdminObserved`. | **Fixed** and registered under messaging |
| F-18 | P2 | Reproduced | `qualifiers/[id]/selection` had no error or loading boundary. | **Fixed** |
| F-19 | P2 (tests) | Reproduced | Three Fairway page tests hit the Clubhouse branch, because the flag is on in tests. | **Fixed**: they pin the gate off. Clubhouse's own empty-vs-error behaviour on those screens is **Risk to test** (not reverified) |
| F-20 | P2 (guard) | Reproduced | Migration-header guard: four files had no `VERIFY:` or `ROLLBACK:` line (two pre-existing on main, so main's guard was already red). | **Fixed** (comment-only edits) |
| F-21 | P1 | Reproduced (CI ast-grep + static check on #2110) | Team Hub's attendance and task-assignment reads asked for `.limit(2000)` / `.limit(5000)`; PostgREST returns at most 1000, so a large team's RSVP and task counts were cut short. | **Fixed** `43cd77f83`: `fetchAllRowsResult` ordered by id. Test `hub-paged-reads.test.ts` |
| F-22 | P2 (CI) | Reproduced (#2110) | Held migrations failed squawk (a constraint added without `NOT VALID`; `begin`/`commit` inside the tool's transaction) and raised sqlfluff by 182 (LT02/LT05/CP02). | **Fixed** `9b39e3ce2`, `89cc93f49`: layout only; squawk 0 issues |
| F-23 | P2 (CI) | Reproduced (#2110) | Semgrep's definer rule mis-anchors on a header comment in held `20260930150000` (the function does set `search_path`). | Owner chose an inline `nosemgrep` (Q-107) |
| F-24 | P2 (CI) | Reproduced (#2110) | Markdown lint up about 13.6k across Clubhouse docs, 11.6k of it long table lines. | Blank-line rules auto-fixed; the owner approved a one-time `markdown:ratchet --update` (Q-107) |
| F-25 | P3 (CI) | Reproduced (#2110) | Calendar test 10703 loops every write scenario and passed the 5s default on CI. | 20s timeout on that test, assertions unchanged |
| F-26 | P3 (CI) | Reproduced (CodeQL on #2110) | `scripts/clubhouse/registry.mjs` escaped `\|` in table cells without escaping `\\` first (`js/incomplete-sanitization`, two sites). | **Fixed** `1db53f553`; no generated doc changed; registry tests 15/15 |

### Later findings and runtime journeys (2026-09-30, evening)

- **F-27 (P2, Reproduced on CI #2110, fixed `4116e3a58`).** A toast's dismiss
  timer outlived its provider and called setState after unmount (CI: "window is
  not defined" after `roster.test.tsx`). The provider now clears its timers on
  unmount. Test: `toast-timers.test.tsx`.
- **Messages, two signed-in sessions (Passed, local stack, train `42330584c`).**
  Local Supabase with every migration replayed (held included); a synthetic
  coach and two players; dev server pointed at `127.0.0.1:54321`, with email,
  push, Sentry, Stripe and the AI key blanked. 7 of 7 checks passed:
  - the coach starts a direct thread and sees the sent message;
  - the message is stored and readable by the recipient under RLS;
  - the other teammate cannot read it (RLS, 0 rows);
  - the recipient sees it in Clubhouse Messages and replies;
  - the coach receives the reply live, without a reload (Realtime);
  - the reply persists across a reload;
  - the other teammate does not see the thread in the UI.
- **Calendar, two sessions: Blocked / not exercised yet.** The laptop guard
  stopped the run when swap reached 12 GB and free disk fell to 14 GB (dev
  server, Chromium and Docker together). The stack was stopped; the seeded data
  is kept for a rerun.

### Full sweep (2026-09-30, night): both roles, phone and desktop

Dev server (flag on, production data, Demo University Golf) for visuals; the
flag-on preview `helmv3-3hkylvpkq` (a production build) for timing. 46 pages
were swept (13 coach and 10 player routes, each at 390 px phone and 1440 px
desktop). The dev server's load times are webpack compile times and are not
cited. Preview timing ran beside other work, so it is provisional until a
quiet rerun.

- **F-28 (P1, Reproduced on the preview, fixed `4b91fdd75`).** On the phone,
  the "Forgot password?" link's 44 px hit area sized itself to the sign-in
  sheet and took taps meant for Sign in. Test:
  `auth-forgot-hit-area.test.ts`.
- **F-29 (P1, Reproduced on the preview, fixed `ce7832dc7`).** After a
  successful sign-in, `router.refresh()` re-rendered `/golf/login` with the
  new session, and the proxy redirected it to `/golf/dashboard`. Frames
  recorded on the preview: login → Fairway dashboard skeleton → blank Home →
  welcome. On dev after the fix, sign-in lands on `/golf/welcome` directly.
  `auth.test.tsx` now asserts that no refresh happens.
- **F-30 (P1, Source-confirmed and Reproduced, fixed `b7b7d2e4d`).**
  `/golf/loading.tsx` and `(dashboard)/loading.tsx` render Fairway's shell
  and dashboard skeleton even with the flag on, so every cold entry painted
  Fairway chrome before Clubhouse (§7.1: Clubhouse layered on Fairway). With
  the flag on they now render `ClubhouseShellSkeleton` and `HomeSkeleton`.
  Test: `route-loading-shell.test.tsx`.
- **F-31 (P0, Reproduced on the preview and on dev).** Team Hub renders the
  error boundary for both roles at both widths. The server calls
  `parseHubTab()`, which is exported from a `'use client'` module. Fixed
  `3c2fce175`: the parser moved to `lib/hub-tabs.ts`, and a new
  `client-boundary.test.ts` fails on any server import of a non-component
  value from a client module.
- **F-32 (P2, Risk to test).** Qualifiers logged a hydration mismatch on the
  dev server only; the production build did not. A new SSR-then-hydrate test
  of every qualifiers screen at both widths (18 cases) finds none.
- **F-33 (P2, Reproduced on the preview).** Coach Messages on the phone has a
  CLS of 0.292 (desktop 0.019, player phone 0). Cause: announcements loaded
  after the conversations and pushed them down. Fixed `ac64ba366`: the inbox
  keeps its skeleton until both arrive. Not re-measured yet.
- **F-34 (P2, Reproduced on dev).** The coach Home figure strip reads "Rounds
  0 this week · GIR 100% · Putts 38.0". The figures are arithmetically true
  (three Aug 2 practice rounds) but unlabelled, and "this week" used another
  basis. Fixed `98f7bb52e`: the form uses the Stats Last-10 selection and
  always shows its basis ("3 rounds · Aug 2").
- **F-35 (owner request, done).** On the phone the ivory ramp moves one step
  darker: page `#e7e3d8`, cards `#f5f2ea`, and the top bar, tab bar and
  sheets follow. Tertiary text darkens to `#5f5c55` to hold 4.5:1. The
  sign-in fields lose the black keyboard outline and get a green hairline.
- **Round preservation (§9), source audit:** R-1 to R-5 are P1 (false "Round
  saved"; Restore not rehydrating the current hole; a failed Discard
  suppressing saves; a non-idempotent Discard that a round can be resurrected
  from; a vanished-parent submit dead-ending). Fixed `72c920ce3` with R-6 to
  R-12 from the code audit (35 new tests, each failing on the old code). Left:
  cross-device discard (Q-119) and the submit version check (held draft,
  Q-120).
- **F-36 (P1, Source-confirmed, fixed `22eda4649`, `4aaff91e1`).** The server
  always rendered desktop (`useChPhone`'s server snapshot), so a cold phone
  load hid the page until hydration. A `ch_phone` cookie now gives the server
  the device's last layout.
- **F-37 (P2, Reproduced, fixed `22eda4649`).** Tab switches on the phone went
  blank, then skeleton, then page (a 150 ms skeleton delay), and Home's
  skeleton was the light desktop shape before the green hero. Skeletons now
  show at once, and Home's phone skeleton is the hero.
- **F-38 (P3, fixed `fcb14f3b0`).** Player Home phone captions under the
  figures were drawn at figure size.
- **F-39 (P3, fixed `49540d392`).** An unbuilt page's phone top bar said
  "Home".
- **F-40 (P1 privacy, Source-confirmed, fixed `85abff0dc`).** The shell's
  next-event read had no class exclusion, so a player's class could show as
  the team's next event to the coach and teammates.
- **F-41..F-45 (P2, owner screenshots, fixed `002bc93a9`).** Player Stats on
  the phone did not match the board: the figures were three cards, not one
  strip; the trend drew one point per round on a single day ("Aug 2" three
  times); the skeleton was the desktop shape; "hits" did not agree with its
  count; the phone ivory was too white. The phone tokens are now the darker
  ivory.
- **F-46 (P2, owner screenshot, fixed `34ac231d7`).** A black focus box
  around More after a tap; focus is green, and a tap restores focus without
  a ring.
- **F-47 (P2, owner screenshot, fixed `fdc2c9d60`).** The Classes term line
  overlapped the week bar on the phone.
- **F-48 (P2, fixed `2f459d9f2`).** Sheets, insets and popovers kept the
  light desktop surface on the phone ivory.
- **F-49 (P1 visual, owner screenshots, fixed `16618ded6`).** The phone's
  edges did not lead in: a pale strip under the status bar above the green
  hero (the board runs green under it), a seam between the bar and the hero,
  and the page hard-cut at a near-opaque tab bar. The shell now sets the
  theme colour and html background (green on Home, ivory elsewhere), the
  hero's top fades from the bar's flat green, and the tab bar is glass.
- **F-50 (P1 motion, owner recording, fixed `972824ab5`).** Phone sign-in:
  the sheet left a flat green slab for about a second, the welcome redrew
  the course at a different framing (a jump), the camera pushed and slid
  (rejected as a zoom), and the name was ink on the night sky. The course is
  now drawn full screen behind a window that opens, the phone camera holds
  still, and the name is ivory at night. Verified on dev video; the welcome
  hand-off on a real phone is unverified (no preview deploys, owner).
- **F-51 (P1 data, Reproduced on production data).** Player Stats showed 3
  rounds for a player with 22 completed 18-hole rounds: Last 10 stopped at
  the season start (the legacy app used the ten newest rounds), and rounds
  entered as totals only were dropped everywhere. Owner decisions Q-122 and
  Q-123; fix in progress.
- **F-52 (P1 data, Reproduced, fixed `681a70582`).** Team Hub Documents
  showed "Documents didn't load" for the coach. getDocuments embedded
  `uploader:uploaded_by(...)`, but golf_documents.uploaded_by references
  auth.users, which PostgREST cannot embed (PGRST200), so every list read
  failed, for every team, in both UIs. The single read and version compare
  had the same embed. Uploaders are now resolved from golf_coaches after the
  read; four tests fail on the old code.
- **F-53 (P3, fixed `440b25d0a`).** Team Hub RSVPs: an all-day event read
  "12:00 AM", and an event no one was invited to drew an empty grey bar.
- **F-51 fixed (`da0c90b6e`, Q-122/Q-123).** Last 10 is each player's ten
  newest countable rounds in any season; totals-only rounds count in scores
  and in no hole figure, and a card that reads fewer rounds says so.
- **§10 Stats gate (run 2026-10-01 against production, Demo team).** SQL
  oracle per player (Last 10 by date across seasons, totals-only in scores,
  hole-level pooling) against what coach Team Stats (desktop and phone) and
  the player's own Stats show on dev. Every player's Last 10 average matches
  exactly (Cole 74.6, Tyler 74.7, Jackson 75.5, Mason 75.7, Owen 76.0, Dylan
  76.3, Ethan 76.5); the team row matches (75.6 vs 75.61, +1.1 vs the previous
  10 from 74.47, 56 of 70 rounds with holes, GIR 65% vs 64.7%, putts 33.1 vs
  33.07, birdies 2.5 vs 2.52). Scrambling reads 31% against an oracle of
  31.5% computed as "par or better after a missed green"; the app counts the
  logged up-and-down, a definition difference, not a defect. Not yet
  reconciled: SG figures (they need the Tour baseline model), Qualifiers
  window, CoachHelm evidence (§13 audit running).
- **F-54 (P1 visual, owner screenshots, fixed `6a3d8fe18` and follow-ups).**
  Phone Stats was "plain black numbers, no spacing": Game detail drew captions
  at figure size (a phone rule caught every `dd`), grey bars, uncoloured par
  tiles, an unreadable desktop make-rate curve, four "0%" cup misses with
  nothing logged, lag bands out of order, raw floats and metric ids in
  Development, and a zero change coloured amber. Now to the board: one figure
  strip, green notes, green and amber bars, make-rate rows, readable
  development, neutral zero changes, and one coverage line on desktop.
- **F-55 (P1 motion, owner report, fixed `0798bcec5`).** Last 10 to Season
  flashed twice and jumped: the skeleton fade-in hit live pages that were
  aria-busy during a transition (blink to transparent), and the first-paint
  reveal replayed when aria-busy cleared (second flash and a 10px rise). Now
  one dim while loading; the switch moves on the tap.
- **F-56 (P2 perf, fixed `9194fe2ed`).** Two serial round trips removed from
  the player profile read. Measured on a local production build at 4x CPU:
  cold first paint 0.7-1.1 s and largest paint 1.3-2.3 s; tab switches
  0.9-1.4 s; window switches 1.25-1.9 s (Season's server render 1.0 s).
- **F-57 (P3, fixed `6e2fe5144`).** The Rounds season ribbon printed the
  same day under every round played that day ("2 Aug 2 Aug 2 Aug"); a day is
  labelled once.
- **§13 CoachHelm (run 2026-10-01, read-only, Demo team).** No P0. Stored
  putt, approach and tee bands, and sand saves, match a non-test recompute
  except where the cache counts test rounds (one 15-25 ft band reads 19.2%
  stored vs 5.8%; a driver vs layback comparison flips): the fix is the held
  cache migrations (Q-124) and a regeneration (Q-125), both owner decisions.
  Fixed in code: stale warm-up cards are hidden (CH13-3), the open-signal
  count matches what is drawn (CH13-4), focus areas carry their team (CH13-5),
  development notifications open Stats (CH13-7), evidence nouns and freshness
  (CH13-9), confidence words follow the shared labels (CH13-10), no-finding
  cards are not assignable (CH13-11), card voice per role (CH13-13),
  acknowledged cards are not "Priority" (CH13-16), and Ask and its stream
  endpoint respect the CoachHelm gate (CH13-20).
- **F-58 (P2 data, fixed `c7e24b4f9`).** CoachHelm's program pulse used the
  hole-by-hole rule, so a team posting qualifiers as totals read "no rounds
  in 60 days". It now uses the Q-123 score rule (shared in
  `src/lib/golf/round-score-countable.ts`).
- **§14 Adjacent capabilities (run 2026-10-01, source and read-only SQL).**
  Connected: roster, Team Hub reads and posts, Classes, Settings, round
  setup's courses, sign-in and onboarding, Recruiting, exports; Practice,
  lineups and scouting have no golf production data. No Baseball or Lift Lab
  regression in the branch diff. Defects: D1 (P1) coaching staff invites
  and approvals had no Clubhouse screen (fixed `322ca7cfd`); D2 (P1) a Team
  Hub trip could not be edited or deleted (fixed `12f07da99`); D3 (P2) a
  calendar link could not be replaced or removed (fixed `40419c193`); D4 (P2) 30 unread dev-plan
  notifications opened a placeholder (fixed `5c4a9c33a`); D5 (P2, live in
  production, both UIs) push taps never deep-linked: the payload URL is
  absolute and the guard rejects "//" (fixed `a99fa9638`); D6, D8 aliases for
  `/intelligence` and the old qualifying workspace (fixed `5c4a9c33a`); D7
  (P3) distance unit not settable (fixed `4e3b87d44`); D9 (P3, dev only) the
  strict-mode double effect can clear the sync player. Owner: Q-130.
- **§16 Held migrations (run 2026-10-01, read-only).** None of the 15 held
  files is applied; every app path that needs one has a fallback. Fixed:
  `20260928150000` missed the `r2` calls in the trend subqueries and would
  have reported success with test rounds still in last 5/10 (`ec65c44f6`).
  Owner: Q-128 (OD-01 drops the 14 totals-only rounds Stats counts) and
  Q-129 (`20260928160000` is superseded but unguarded). Apply order notes:
  SG recompute before the cache and standing refreshes; local replay runs
  the held schema, so local stats results are not production's.
- **§18 Rollback and observability (run 2026-10-01).** The flag is compiled
  in: a flip and its undo are deploys. The documented rollback target was
  stale (now the train deployment; RELEASE doc corrected). Fixed
  (`8a1dd47f8`): a queued round that fails to sync now reports to Sentry,
  high when retries end, and server events carry `ui` and `surface` tags.
  Open, owner: Q-131 (no canary), Q-132 (the nightly lost-round detector has
  read 14 since 28 Sep, so a new loss looks the same). Production delivery of
  Clubhouse events is unverified while the flag is off (preview: 20 events).
- **§10/§11 reconciliation, Qualifiers and SG (2026-10-01, production,
  Demo team).** Qualifiers: the one scored qualifier matches the SQL oracle
  for all 7 entrants (rounds, total, to-par, position, automatic slots); no
  ties exist, so F-03 is not exercised. Defect found and fixed (`802bcfbad`):
  the selection workspace and confirm ranked from the entry's stored
  aggregate, which is stale on a live qualifier on another team (3 rounds
  played, 2 stored); they now rank from the rounds, as the board does. Across
  production 28 of 132 entries disagree with their rounds (mostly legacy
  0/null and seed data; Q-134). Latent, no data hits them: a round with a
  total but no to-par would count as even, and two rounds in one round slot
  are not deduplicated. SG: every Clubhouse figure is the mean of the stored
  per-round columns over the window's hole-scored rounds and matches the
  oracle for all 7 players and the team row (-5.6 vs Tour, 56 rounds). Seven
  Demo rounds hold stale stored SG (five predate penalty charging), which
  moves Dylan, Jackson and the team total at one decimal; they change on the
  owner's recompute (Q-89), not in code. Caption "vs Tour" is correct.
- **CI on PR #2111 (fixed `55bb26a51`).** The layout test lacked the F-36
  cookie mock, the held migration's HELD.md row lacked its date and its
  registry owner, and four test reads were unchecked.
- **Calendar §8 (fixed `ac64ba366`, `696b49570`).** Editing a multi-day
  all-day event shrank it to one day; overnight events could not be edited;
  a series edit could flip All day; week/day grids hid events outside 6 AM to
  9 PM; cancelled events counted as busy; failed replies read "No players
  invited"; `calendar?event=` links beyond about six weeks opened on today; a
  failed roster read looked like an empty team; "Mark all present"
  overwrote saved marks and Retry resent saved ones. Server-side, not
  changed: series across the 1 Nov clock change shift an hour (CAL-05), the
  create fan-out notifies the whole roster (Q-108), and event create has no
  idempotency key.
- **Messages §12 (fixed `ac64ba366`).** A failed reaction showed no error; a
  failed send dropped text and files typed while it was pending.
- **Qualifiers §11 (fixed `3c2fce175`).** One comparator for the board, the
  workspace and confirm; players with no scored round never rank; confirm
  keeps coach picks, is compare-and-set (no double notify), and no longer
  deadlocks on a small field; picks must be entrants. Owner questions Q-114
  to Q-117.
- **Stats §10 (fixed `98f7bb52e`).** A degraded detail read showed zeros as
  figures; season rounds used the stored total instead of the canonical one;
  "Where drives finish" summed to 160%; totals-only cache rows averaged as 0.
  Owner questions Q-111 (total-only rounds never count) and Q-112.
- **Security review of R-5 (`6acd57346`).** High, fixed: the device-wide v1
  queue survives sign-out, so player A's queued scorecard drained under
  player B's session (A's round gone) would come back `round_missing` and be
  re-created as B's round. The drain now submits only the signed-in player's
  records. Low, open: the submit tells `round_missing` from the refusal for an
  id the caller already holds (a one-bit existence check on unguessable ids).
  Info, open: the discard tombstone list is one device-wide list capped at 50
  with no expiry.
- **Preview timing (provisional).** Most pages are ready in 2–3 s on the
  phone. The first Home after sign-in took 7.1 s. CLS is 0 everywhere except
  F-33.

## 5. Schema compatibility (flag-off deploy with no migration applied)

- No source file outside tests reads a column added only by a held migration
  (`availability*`, `rank_factors`, attribution interval).
- Every `.rpc()` the app calls exists in production except five pre-existing,
  non-golf names and `golf_qualifier_selection_reasons` (held D-35).
  `readQualifierSelectionReasons` falls back to the column when the function is
  missing (PGRST202), and fails loudly after the apply.
- Held migrations stay held. For an owner-run apply, the order and conditions
  are in `supabase/migrations/HELD.md` and `docs/operations/APPLY_PATH.md`.

## 6. Release package (tonight)

See `docs/clubhouse/RELEASE_2026-09-30.md`.

## Links

Parity: `pages/P005-stats-player/PARITY.md` · Clickables: `CLICKABLES.md` ·
Catalogs: `catalog/` · Contracts: `pages/*/CONTRACT.md` · Decisions:
`PROGRESS.md`.

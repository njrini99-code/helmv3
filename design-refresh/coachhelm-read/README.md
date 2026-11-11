# Start here: CoachHelm read build package (BUILD_BRIEF CR0 to CR6)

> **7 Nov 2026: the design page was rebuilt.** `redesign/coachhelm-read.html` is now the owner's 7 Nov page (v6, same link, artifact SUL5hLtah5MmBd2dkU8mTK), drawn on the app's own components and CSS. Where it differs from `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md` or `08-ACCEPTANCE.md` (and from 04), the 7 Nov page wins: its studio, component map, motion table with the "Never" list, and data tables are the contract. The 05 to 08 files are kept as written for their reasoning. Build notes: `docs/clubhouse/coachhelm-read-v2/`.

Nick approved the CoachHelm read design on 31 Oct ("Beautiful, polish it and let's get it ready for implementation"). This folder is everything a Claude Code agent needs to build it to match. Prep only: no deploy, no migration, no flag flip.

Design page: https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK (version 5, 3 Nov: every subscreen, sheet, menu and state is live and linkable). Local copy: `redesign/coachhelm-read.html`.

Read in this order:

1. `05-SCREENS.md`, `06-SCREEN-SPECS.md`, `07-MOTION.md`, `08-ACCEPTANCE.md`: the build contract. 05 lists every screen, subscreen, sheet, menu and state with its design link, app route and roles. 06 gives each one's box, type, colour, hit area and data, with contrast. 07 is every motion row (trigger, values, curve, interrupt, Reduce Motion). 08 is the pass/fail checks per screen and per PR, and the side-by-side check. Where these and 04 differ, these win.
2. `redesign/coachhelm-read.html`: the approved design. Open it in Chrome. Phone and desktop, coach and player, all three reads, every state, light and dark, Text Size and Reduce Motion switches, the "where it lives" table and the three calls.
3. `01-BRIEF.md`: what the read is, where it lives in today's app, the rules it keeps, the lanes around it, the three calls and what "done" means.
4. `04-FIDELITY-SPEC.md` (the first pass, kept for its reasoning): tokens, computed contrast, type, layout, every card's copy rules, every state, every tap, every animation with its curve and Reduce Motion version, what can't be built as drawn, and the side-by-side check a PR must pass.
5. `02-PLAN.md`: file by file against helmv3 `main` 75b4956. PR 0 (player leak fix) and PRs 1 to 6, what each touches, files that must not change, flags, risks and tests. Section 14 reconciles the plan with the data map.
6. `03-DATA-CHECKS.md`: every figure on every card, the `InsightEvidence` field it reads, and the fix for each one that isn't stored or plumbed yet (94 rows: 49 OK, 27 to plumb, 3 to carry, 15 missing with a fallback).
7. `capture/capture.mjs`: screenshots of the design and the app by screen ID and state (`--id`, `--state`), motion clips by row (`--motion`), plus the older modes. `capture/contrast.py` recomputes the contrast table from the tokens.

Also in the parent folder: `DESIGN_LANGUAGE.md` (the shared language) and `BUILD_BRIEF.md` (the read is CR0 to CR6 there, the same as PR 0 to PR 6 in `02-PLAN.md`).

## Where it lives

A new view on the CoachHelm route, `src/clubhouse/routes/coachhelm.tsx?view=read`, behind `coachhelm_read_v1` (off). Every link to a read goes through `readHref(player, insight, on)` in `data/coachhelm-views-shape.ts`; with the flag off it returns today's Deep dive address, so nothing changes. New files only for the page: `screens/coachhelm/read/`, `styles/coachhelm-read.css` (`.ch-hr-` prefix), `data/coachhelm-read-view-shape.ts`, `data/coachhelm-read-view.ts`, `data/coachhelm-read-calls.ts`. The preview is `/clubhouse-preview/coachhelm-read?q=approach|penalties|putts&viewer=coach|player&screen=read|board&state=…`.

## State links

```
coachhelm-read.html#<screen>-<read>-<viewer>-<phone|desk>-<light|dark>[-reduce][-xxl][-w430][-<state>][-shot]
```

Screens: `board`, `read`, `where`, `why`, `sure`, `moved`, `rounds`, `do`, `assigned`. States (one at a time): `loading`, `assigning`, `proposed`, `declined`, `noassign`, `stale`, `dismissed`, `more`, `notthis`, `answered`, `answerfail`, `allrounds`, `notrend`, `partfail`, `failed`, `gone`, `nopool`, `long`; 05 maps each to its screen ID. Reads: `approach` (Priya, likely cause), `penalties` (Eli, counted path), `putts` (Jonah, counting down). Viewers: `coach`, `player`. `shot` frames the device alone at the app's size (390×844, 430×932 or 1440×900).

Examples: `#read-approach-coach-phone-light`, `#why-putts-player-phone-dark`, `#board-penalties-coach-desk-dark-shot`, `#read-approach-coach-phone-light-more-shot`.

## Screenshots

`screenshots/after/` has the 60 lean design shots (light, 390 phone and desktop, every screen, read and viewer). `screenshots/after-extra/` has dark, 430, XXL and Reduce Motion samples. `screenshots/before/` has today's CoachHelm for reference. The full set and the real "before" are made on the Mac. From the repo root, with the package at `design-refresh/coachhelm-read/`:

```
npm run dev -- -p 3100
```

```
node design-refresh/coachhelm-read/capture/capture.mjs design --out design-refresh/coachhelm-read/screenshots/after
node design-refresh/coachhelm-read/capture/capture.mjs app --out design-refresh/coachhelm-read/screenshots/before
```

After each PR, shoot the pairs for the screen IDs and motion rows it touches (08 Part 2 lists them):

```
node design-refresh/coachhelm-read/capture/capture.mjs --id S-READ.why --state penalties
node design-refresh/coachhelm-read/capture/capture.mjs --id S-READ.more
node design-refresh/coachhelm-read/capture/capture.mjs --motion M-READ-11
```

They write to `screenshots/` as `<ID>__<state>__<design|app>__<light|dark>.png` and `screenshots/clips/`. `--id all` and `--motion all` run everything; `--side design|app` and `--theme light` cut it down; `--motion … --dry` checks the steps without video.

The older whole-set modes still work:

```
node design-refresh/coachhelm-read/capture/capture.mjs app --out design-refresh/coachhelm-read/screenshots/built
node design-refresh/coachhelm-read/capture/capture.mjs compare --a design-refresh/coachhelm-read/screenshots/built --b design-refresh/coachhelm-read/screenshots/after --out design-refresh/coachhelm-read/screenshots/compare
node design-refresh/coachhelm-read/capture/capture.mjs clips --out design-refresh/coachhelm-read/clips
```

`--only <screen>`, `--read <read>` and `--lean` cut the run down. One headless Chromium, one page at a time, so it stays light on the laptop's memory. Until PR 1 adds the preview, `app` shoots today's Deep dive, which is the honest "before". Clips need ffmpeg, which Playwright brings on the Mac.

## Calls built as defaults (Nick can flip each)

All three live in one config, `READ_CALLS` in `data/coachhelm-read-calls.ts`.

- Pictures back in the read: yes. Ladder, funnel, dots, path bars and the slope chart, each with its number written beside it. To flip: hide the SVGs; the words already stand alone.
- Players see Where it shows up (observed counts) and never a likely cause, which stays "Not traced yet" for them. To flip: don't render the funnel for the player viewer.
- Team pool on the ladder: yes, when `coachhelm_team_pool_v1` is on. To flip: leave that flag off.

## Rules this build keeps

The evidence rule stays strict: no claim without its counts, a likely cause says Likely and is coach only, a gap says what it is waiting for. Nothing changes what shot tracking collects; every card reads fields already written. No migration, no new table, no new write. No accent left-border cards. Sizes follow iPhone Text Size; page edge 16, 20 on large phones. Green phone top bar and the desktop sidebar with its glass bar stay as today.

## Found while preparing (needs a decision or another lane)

- Player leak on main today: `diagnosisFor` (`data/coachhelm-dive-shape.ts` 328 to 350) keeps the likely-cause drivers for every role, and `views/DeepDive.tsx` 244 to 283 draws them, so a player can see both arms of a likely cause. PR 0 fixes it on its own.
- `coachhelm_team_pool_v1` in `config/feature-flags.yml` has default false but production true and preview true. The plan had treated it as off in prod. Worth confirming before the first deploy, since the ladder draws the team pool when it's on.
- Reduce Motion fade: settled 3 Nov. Every crossfade uses `CH_FADE_MS` from `lib/motion.ts`, 180ms today (package rule, SHARED-6), as Lenses does. The design page draws 120; build `CH_FADE_MS`.
- `classifyNav` strips the query, so `?view=read` animates as a fade, not a push. Needs a small shared change agreed with the Lenses lane.
- The push underlay shift: the page draws −30%, the shared `CH_UNDERLAY_SHIFT` is 24%. Build with the shared constant.
- Lane 1's ReadSheet and the Lenses lane's EvidenceSheet should be one peek sheet; this lane exports `ReadSummaryCard` for it.
- The Ask lane has no entry that takes a read yet (`askAboutReadHref`).
- Error code blocks CH-13861 to 13869 are free for this lane (fixed 4 Nov wiring: CH-13860 is taken by the catalog; CH-13760 to 13779 go to Lenses).
- Marking a read seen in the coach feed belongs to the engine owners; this lane doesn't change it.

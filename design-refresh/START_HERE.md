# START HERE: building the Clubhouse redesign

You are a Claude Code agent in Nick's helmv3 repo. This folder holds nine approved redesigns, plus everything you need to build them so they look and move exactly like their design pages. Follow this file from top to bottom. Nick: "what is the point of redesigning it if it's not gonna actually look like that."

## 0. Rules (read twice)

These are the rules that matter most. The complete list is in `ACCEPTANCE-SHARED.md`.
1. **Draft PRs only.**
   - Never merge, deploy, flip a flag, run a migration, or touch production or staging data.
   - Every new screen sits behind its lane's flag, off everywhere. With the flag off, the app renders exactly as main.
   - A migration that a lane needs is written into its PR as a held file and listed as held. It is never applied.
2. **Never change what shot tracking collects, stores or sends.**
3. **Keep the laptop light.**
   - Run one dev server and one browser, one page at a time. Headless by default; the Messages motion clips run headed, because headless drops frames (still one browser).
   - Use at most two subagents.
   - Run typecheck once per PR, at the end (it takes 8 GB).
4. **Fidelity first.**
   - Read values off the lane's 05 to 07 files and the design page's CSS, never by eye.
   - If something can't be built as drawn, don't improvise. Write it in the PR under "Can't match as drawn", give the reason and two options, and build the rest.
5. **Players never see a teammate's figures.** Coach-only things are absent from the player's DOM and responses, not hidden.
6. **Keep today's green top bar exactly as it is on every screen.** No accent left-border cards anywhere.

When files disagree, the first one in this list wins:
1. The shared values table below
2. A lane's 05 to 08
3. Its 04
4. Its 02
5. `BUILD_BRIEF.md`
6. The hub page

When a design page and `DESIGN_LANGUAGE.md` disagree, the language wins, and you say so in the PR. `DECISIONS.md` records every call Nick made. Don't reopen them.

## Shared values (these beat every lane file)

One table, one source of truth. Where any lane file, design page or plan gives a different number for one of these, this table wins. Build the value here, and don't list the difference as "Can't match as drawn". When the side-by-side clip check (SHARED-12) compares durations or distances for one of these, compare against this table, not the design page.

| Value | Build this | Lane files may say | Where it lives |
|---|---|---|---|
| Reduce Motion crossfade | `CH_FADE_MS`, 180ms today, opacity only, linear | 120ms, 60ms, "≤120ms" | `lib/motion.ts`; pinned by `reduced-motion.test.tsx` (leave that test as is). The CSS token `--ch-dur-crossfade-rm`, where a lane uses it, is added in PR 1 set to the same value |
| Push: how far the page behind moves | 24% left (`CH_UNDERLAY_SHIFT` 0.24), dims to `brightness(0.9)` | −30%, −28%, "today's push" | `shell/phone-chrome.tsx` for the phone stack. PR 1 also sets `--ch-vt-parallax` in `tokens.css` to `-24%` and updates the one line of `native-nav.test.tsx` that pins `-30%`, so route pushes and stack pushes match |
| Push duration and curve | 462ms, `--ch-ease-spring-smooth` | 420ms | `lib/nav-motion.ts` |
| Press | Scale 0.97, 110ms down and 280ms release on `--ch-ease`; rows wash instead of scaling | other scales | PR 1 adds `data-ch-press-scale` |
| Text contrast | 4.9:1 target, 4.5:1 floor, light and dark | "4.5:1" alone | SHARED-4 |
| Non-text marks | 3:1 (icons, chart marks, rings, switch tracks) | | SHARED-4 |
| Phone page edge | 16px, 20px at 414pt wide and up | | `--ch-page-x-phone` in `tokens.css` |
| Green bar | `--ch-frame` #0a331f light, #08150e dark, about 98pt with the status bar | | unchanged (SHARED-1) |
| Seasons | Turn over on 1 August | | SHARED-11 |
| XXL Text Size | `--ch-type-scale` 1.36 | 1.35, 1.353 | SHARED-5 |
| Feature card | Flat `--ch-feature-bg`, no radial light | "one soft radial light" | SHARED-2 |
| Practice rounds in averages | Left out: one helper `countsForScoring(r)`, true when `round_type` is null or `roundTypeFromDb(round_type) !== 'practice'`. Roster, Home and Stats loaders call it under their lane flags. Latest rounds lists every round; Stats' pressure gap and by-type row keep the uncut window | "counted" (today's loaders) | `src/clubhouse/data/season.ts` (new) |

## 1. Set up (once)

1. On a clean main, make a working branch.
2. Copy this whole `design-refresh/` folder to the repo root. Commit it on its own as the first PR ("Add design refresh package"), so every later PR can link to it.
3. The plans were written against main `75b4956`. Where today's main has moved, run `git log 75b4956..main -- <file>` on each file a PR touches. Adjust the line references, and note any real conflict in the PR.
4. Install Playwright's Chromium once if it isn't there. Don't install anything else unless a lane's README names it.

## 2. Read, in this order

1. `README.md`: the lane list, status and design links.
2. `DESIGN_LANGUAGE.md`: tokens, surfaces, type, motion, and the banned list.
3. `ACCEPTANCE-SHARED.md`: SHARED-1 to SHARED-12, which every PR must pass.
4. `BUILD_CONTRACT_STANDARD.md`: what 05 to 08 contain and how to read them.
5. `BUILD_BRIEF.md`: every PR in order. Its first block is the original paste prompt. This file replaces that block as your entry point.
6. `coachhelm/AGENT_KIT.md`: the shared steps, confirm, receipt and Undo pieces that Ask, Quick chat and the Practice Builder all use.
7. `COMPLETENESS.md`: the 4 Nov completeness pass. It lists, per lane, every screen and state that was added, the lane flags, the cross-lane handoffs and the cross-lane rules. Each lane file it touched ends with a section titled "Completeness pass, 4 Nov 2026"; read that section as part of the file, and where it fixes a row above it, the fix wins. The same goes for the "Wiring, 4 Nov 2026" section at the end of each lane's 06 and 08. Before anything else, run `python3 design-refresh/tools/verify_manifest.py`; it must print OK.

Then, for each lane, when you reach it, read these in order:
1. `README.md`
2. `01-BRIEF`
3. `05-SCREENS`
4. `06-SCREEN-SPECS`
5. `07-MOTION`
6. `08-ACCEPTANCE`
7. `02-PLAN`
8. `03-DATA-CHECKS`

Open `redesign/*.html` in the browser. It runs: tap through it, open every sheet, and flip theme, Text Size and Reduce Motion.

## 3. Capture the reference (Step 0, once per lane)

Start one dev server, `npm run dev -- -p 3100`. For each lane, run the capture commands from that lane's README, one lane at a time, then stop the browser before the next. The script shoots the design page and today's app, state by state, light and dark, into the lane's `screenshots/` folder. Commit none of it; it is the reference.

## 4. Build order

Leak fixes go first, each in its own PR, because they fix live problems:

| # | PR | Lane folder | What | Flag (off everywhere) |
|---|---|---|---|---|
| 1 | CR0 | `coachhelm-read/` | A player can see the arms of a likely cause. Strip them for players | none, a live fix |
| 2 | L0 | `coachhelm-lenses/` (its PR 0) | The coach's Deep dive can show a player's private goals. Fix it | none, a live fix |
| 3 | PR 1 to 3 | `BUILD_BRIEF.md` | Shared foundation: tokens only, flat page, large titles under the green bar | PR 1 none (tokens only, no visual change); PR 2 and 3 `clubhouse_refresh_v1`, new: the flat page and large-title rules are scoped under `[data-ch-refresh='on']` on the app root, so flag off renders as main |
| 4 | PR 7 to 10 | `classes-roster-home/` | Class-year avatars, Roster, Classes, coach Home (phone and desktop) | `clubhouse_classes_roster_home_v1` |
| 5 | PR 4a to 4c, 5, 6 | `stats-home/` | Player Stats, Team Stats, player Home "Your game" | `clubhouse_stats_redesign_v1` |
| 6 | PR 11a to 11g, then 11h | `messages/` | Messages. 11h is pin sync, with a held migration (`messages/pin-sync/PIN-SYNC.md`) | `golf_messages_redesign_v1` |
| 7 | CT0a to CT7 | `coachhelm-team/` | Team Board, the golf hole. CT0 must land before Lenses | `coachhelm_team_board_v1` |
| 8 | CR1 to CR6 | `coachhelm-read/` | One read in full | `coachhelm_read_v1` |
| 9 | L1 to L6, with L5a and L5b | `coachhelm-lenses/` | One file per player, with the player lens | `coachhelm_player_file_v1` |
| 10 | AK0 to AK12 | `ask/` | Ask, in the order its 02-PLAN gives (with AK10a/b and AK11a to e) | `coachhelm_ask_v2`; player Ask also `coachhelm_player_ask_v1` |
| 11 | QC0 to QC6 | `coachhelm/` | Quick chat (shares the kit with Ask) | `coachhelm_quick_chat_v1` |
| 11b | N-00 slices 0 to 5, then N-10 | `prerequisites/` | The minimum the Practice plan and Quick chat lanes need to work: the Practice tab's plan, drill bank and event data, and the Documents rows plans file into. Not a redesign of those areas; build only the parts the Practice plan, Ask and Quick chat lanes call. Held SQL for N-00 and N-10 is inside their plan files (the 8.x blocks); slice 0 copies it to files word for word. The practice-plan lane's two held files are in `practice-plan/held-migrations/`. PP4, PP5, PP8, PP9, Ask's Save and Publish and quick chat's plan save wait on them. Build N-00's and N-10's behaviour and data, restyled to `DESIGN_LANGUAGE.md`; where the practice-plan lane redraws a screen, its drawing wins (`practice-plan/05`, Completeness section, which also gives the order and held migrations) | `golf_practice_plans`; Documents `golf_documents_library` |
| 12 | PP0 to PP9 | `practice-plan/` | Practice Builder. PP0 to PP3, PP6 and PP7's upload can land before row 11b; PP4, PP5, PP8 and PP9 after the N-00 slices named in its 02-PLAN §0 | `coachhelm_practice_plans_v1` for CoachHelm writing plans, plus `golf_practice_plans` for the tab |
| 13 | PR 12 | `BUILD_BRIEF.md` | Motion and Reduce Motion pass over everything | none |

Cross-lane dependencies:
- Team's CT0 loader comes before Lenses' desktop rail.
- Team and Lenses share one read sheet. Whichever lane lands second imports it.
- Ask, Quick chat and the Practice Builder share `AGENT_KIT.md`. Build the kit pieces once, in the first of them.
- One drill bank (N-00's held `golf_team_drills`, `20261026010100`; Ask's HM5 is superseded) and one folder model (the name in `golf_documents.folder`) for Ask, Quick chat and the builder. A plan needs a practice event, so the event confirm comes before Save everywhere.
- Ask hands drafts to Messages through `ChPrefill` (`conversationId`, `poll`, `attachment`, `returnTo`); Messages' 05 says how the composer reads each field. Polls and boards are prefill only: nothing is written before the coach's Send.
- Links into another lane go through that lane's href helper, so a flag that is off falls back to today's page: `readHref()` (Read), `playerFileHref()` (Lenses), `askAboutHref()` (Ask), `/golf/dashboard/roster?player=<id>` (Roster). A link to a lane whose flag is off lands on today's page at the same address, never a blank or an error.
- Capture IDs are scoped to their lane folder (the practice-plan lane also uses `S-ASK.*` names for its own captures).
- Every lane's captures and acceptance run with `clubhouse_refresh_v1` and the lane's own flag both on. A lane flag on with `clubhouse_refresh_v1` off still renders the lane's screens, on today's page styling; that mix is never shipped and needs no check beyond "does not crash".
- While only one of `clubhouse_classes_roster_home_v1` and `clubhouse_stats_redesign_v1` is on, the same player's average can differ between Roster or Home and My stats (practice rounds). Turn both on together, or accept the gap during rollout.
- Each lane's 06 ends with a `Wiring, 4 Nov 2026` section (data source, write, RLS, validation, failure, sync, notification and flag for every element and action) and its 08 with `W-<LANE>-n` checks. Build and check those too.
- CoachHelm cross-lane links take `on` from the server: `readHref(player, insight, on = false)` and `playerFileHref(playerId, at?, on = false)`, both in `data/coachhelm-views-shape.ts` after line 130; `on` false returns today's address byte for byte. No client module reads a flag; flags reach the client as props or shell data.
- CoachHelm's "Add to practice" (the Team pattern, the shared read sheet and the Read Do card) opens the Practice drill bank sheet filtered to the suggestion through one href the practice-plan lane exports from its own module: `practicePlanHref({ source, insightId?, step?, playerIds?, drillId? })`. Until it exists the button is absent.
- `src/clubhouse/data/season.ts` is owned by the Stats lane: it adds `countsForScoring(r)` and `course_id` to `ROUND_COLUMNS` (Team's Course tab groups by it). Whichever of Stats, Roster or Team lands first adds them.
- `PlayerBoard.tsx` gets one flag branch from Read (S-READ-BOARD) and one from Lenses PR 6. With both flags on, the Lenses feature card wins; the second PR rebases.
- Held migrations stay files. None is applied by the agent; Nick applies each after the first deploy, one at a time. The full list is in `COMPLETENESS.md`.

Before you push to a PR, check other open PRs for edits to the same file.

## 5. The loop for every PR

1. Read the PR's section in the lane's 02-PLAN and the screen IDs it builds in 05.
2. Build it, taking every number from 06 and every motion from 07. Add the preview fixtures and states that 05 marks "add".
3. Run the lane's capture `app` and `compare` (or `--id`/`--state`) for every screen ID you touched. Look at each pair at full size.
4. Record the motion clips for every 07 row you touched, with and without Reduce Motion.
5. Run the checks: `npm test`, the clubhouse stylelint, `npm run lint`, the lane's Playwright tests, then `npm run typecheck` once.
6. Walk the 08 criteria the PR must pass, plus SHARED-1 to 12. Mark each pass, fixed, or "Can't match as drawn".
7. Open a **draft** PR. Use the repo's PR template if there is one; otherwise use "Before / After / How". Attach:
   - the side-by-side shots and the clips
   - the 08 checklist
   - any held migration, named as held
   - a line confirming the flag is off and shot tracking is untouched
8. Stop at the draft. Don't merge. Move to the next PR.

## 6. When you're stuck

- Data the app doesn't load: don't fetch new data or write a migration to get it. Put it under "Can't match as drawn".
- A design state that isn't drawn: build the rule written for it in 05.
- Two files disagree: follow the order in section 0 and note it in the PR.
- Anything that needs Nick, such as a new call, a permission or a sign-in: write it at the top of the PR and keep building the rest.

# Clubhouse redesign package

Every plan and redesign for the Clubhouse refresh, in one place, ready for a Claude Code build on the Mac. Built 04 Nov 2026 00:46 UTC; completeness pass added 04 Nov 2026 (see `COMPLETENESS.md`). All nine lanes are complete.

Prep only. Draft PRs only. No deploys, no flag flips, no migrations applied, and nothing changes what shot tracking collects. Keep the laptop light: one dev server, one browser, at most two subagents.

## Start here

A Claude Code agent starts at `START_HERE.md`. It is the end-to-end runbook. The paste-ready prompt for Code is in `CODE_PROMPT.md`.

`COMPLETENESS.md` lists what the 4 Nov completeness pass checked and added in every lane (states, sizes, motion, entry points, handoffs, flags and held migrations). `prerequisites/` holds the Practice tab (N-00) and Documents (N-10) plans that the Practice Builder, Ask and Quick chat build on. `completeness/` holds each lane's full matrix and wiring report. The package covers only the nine pages Nick asked for.

For a person reading this folder:

1. Open the hub page: https://claude.ai/artifact/JpSA4THXgQkM6aCo66oMpz (a copy is in `hub/index.html`). It shows the status of every lane, the shared rules, today against each design, and the build order.
2. Read `DESIGN_LANGUAGE.md`. It holds the house rules every screen follows.
3. Read `BUILD_BRIEF.md`. It is the paste-ready Claude Code brief, with every PR in build order.
4. Read the shared values table in `START_HERE.md`, then `BUILD_CONTRACT_STANDARD.md` and `ACCEPTANCE-SHARED.md`. They explain what "matches the design" means and how each PR is checked.
5. Then work through the lane folders in order, reading each lane's own `README.md` first.

## Lanes

| # | Folder | Lane | Status | Design page | Missing files | From the design lead |
|---|---|---|---|---|---|---|
| 1 | `classes-roster-home/` | Classes, Roster, coach Home | Ready | [https://claude.ai/artifact/QnVN3x63a79TM8geunzccU](https://claude.ai/artifact/QnVN3x63a79TM8geunzccU) | none | 05, 06, 07, 08 |
| 2 | `stats-home/` | Phone Stats and player Home | Ready | [https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S](https://claude.ai/artifact/2Xz3LTyYgtM11mdB51Ac7S) | none | none |
| 3 | `messages/` | Messages | Ready | [https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev](https://claude.ai/artifact/BXhxxNzJDAJLMoNXPjMpev) | none | none |
| 4 | `coachhelm-team/` | CoachHelm Team Board (the hole) | Ready | [https://claude.ai/artifact/HAWFGcKWn4hbZgn2jU6TjK](https://claude.ai/artifact/HAWFGcKWn4hbZgn2jU6TjK) | none | none |
| 5 | `coachhelm-read/` | CoachHelm Read (root cause and insights) | Ready | [https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK](https://claude.ai/artifact/SUL5hLtah5MmBd2dkU8mTK) | none | none |
| 6 | `coachhelm-lenses/` | CoachHelm Lenses (coach vs player view) | Ready | [https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe](https://claude.ai/artifact/2wbDt4ckf9Nudnsv22MUXe) | none | none |
| 7 | `ask/` | CoachHelm Ask | Ready | [https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA](https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA) | none | none |
| 8 | `coachhelm/` | CoachHelm Quick chat (plus the shared AGENT_KIT) | Ready | [https://claude.ai/artifact/9coRP9KHUfDw9sPE3g1FEq](https://claude.ai/artifact/9coRP9KHUfDw9sPE3g1FEq) | none | none |
| 9 | `practice-plan/` | CoachHelm Practice Builder | Ready | [https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5](https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5) | none | none |

The rows are in build order. "Missing files" lists any of the standard files (README, 01 to 08, design page, capture script) the lane doesn't have yet. "From the design lead" lists the files that were drafted by the design lead rather than by the lane's own thread. Both are built to the same standard. Where a lane file and the shared values table in `START_HERE.md` disagree (the Reduce Motion fade, the push distance, contrast), the table wins.

## What each lane folder holds

| File | What it is |
|---|---|
| `README.md` | The lane's own start page and capture commands |
| `01-BRIEF(S).md` | What Nick saw, what changes, where it lives, and what done means |
| `02-PLAN.md` | A file-by-file and PR-by-PR plan against main 75b4956 |
| `03-DATA-CHECKS.md` | Where every figure comes from, and what is real on staging |
| `04-FIDELITY-SPEC.md` | Tokens, states, taps and motion (05 to 08 win where they differ) |
| `05-SCREENS.md` | Every screen, subscreen, sheet, menu, modal and state, each with its design link and anchor |
| `06-SCREEN-SPECS.md` | Specs for each element on each screen: box, type, tokens with light and dark hex, measured contrast, hit area, data field |
| `07-MOTION.md` | One row per interaction: trigger, property, from and to, duration, curve or spring, delay or stagger, interruptibility, Reduce Motion version, and the clip that checks it |
| `08-ACCEPTANCE.md` | Pass or fail criteria per screen and per PR, plus the side-by-side check against the design |
| `redesign/` | The design page, standalone. Open it in a browser; it runs |
| `capture/capture.mjs` | Playwright script for design shots, app shots, side-by-side pairs and motion clips |
| `screenshots/` | Design shots made so far. The Mac fills in the app shots and the pairs |
| `## Completeness pass, 4 Nov 2026` | The last section of each changed lane file: the states, sizes, motion, entry points and handoffs added on 4 Nov. Build them; they win over the design page |

The Ask, Quick chat and Practice Builder lanes started as single design documents (`ASK_REDESIGN.md`, `QUICK_CHAT.md`, `COACHHELM_PRACTICE_PLAN.md`). All three share `coachhelm/AGENT_KIT.md` for the steps, confirm, commit, receipt and Undo pieces.

## How to check a build matches the design

For each screen ID in a lane's 05:

```
node capture/capture.mjs --id <ID> --state <state>
```

This shoots the design page and the app preview at the same width, theme and Text Size. Put the pair side by side in the PR and check the redline numbers from 06 on both. For each motion row in 07, record both with `--motion <M-ID>`, then again with Reduce Motion on, and put the clips in the PR. A PR is done when its 08 criteria and SHARED-1 to SHARED-12 all pass.

## Decisions

Nick's answers from today, and the calls the design lane made, are in `DECISIONS.md`. In short:
- Stats is kept as drawn.
- Messages has no Camera and no Announcement; typing is tracked; pin sync is approved as a held draft PR.
- Ask posts announcements on Post, with Undo.
- Players compare against the PGA Tour and team averages only.

## How this package is organised

These are the design lane's own calls, made because Nick said to handle any other questions:
- The package is one `design-refresh/` folder at the root of helmv3, on the branch `claude/design-refresh-package` (it was a zip until 4 Nov). It has the same layout the plans already refer to, so every path in them works. `MANIFEST.md` lists every file with its SHA-256; `python3 design-refresh/tools/verify_manifest.py` proves a checkout is complete.
- Lane folders are copied exactly as their threads wrote them, minus old versions and duplicates.
- Acceptance is written as numbered pass or fail facts per screen and per PR, with real numbers. The rules every lane shares are written once, as SHARED-n.
- Files win in this order: the shared values table in START_HERE, then 05 to 08, then 04, then 02, then BUILD_BRIEF, then the hub.

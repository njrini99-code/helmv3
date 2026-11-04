# Start here: CoachHelm Ask build package (lane 4)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 6 rows).

Ask becomes a chat that works like Claude or ChatGPT. It shows its steps live, answers with real golf visuals, writes plans as artifacts, and creates things in every tab through one confirm, receipt and Undo flow. This folder is everything a Claude Code agent needs to build it so it looks and moves exactly like the design. Prep only: draft PRs, no deploy, no migration run, no flag flip.

Design page: https://claude.ai/artifact/Bh4Vim8M1dXW7wnVrd3NAA (version 13). The same page is in `redesign/coachhelm-ask.html` and runs offline.

## Read in this order

1. `redesign/coachhelm-ask.html`: open it in a browser. The control bar switches phone and desktop, light and dark, coach and player, Text Size and Reduce Motion. Every scene has a Play button, and the gallery under "Make anything" plays each create flow.
2. `01-BRIEF.md`: what Nick asked for, what changes, where it lives, the calls and what done means.
3. `ASK_REDESIGN.md`: the design document. Every surface, every flow, and the decisions in §6 and §6b. It stands in for a 04 where 04 is silent.
4. `04-FIDELITY-SPEC.md`: tokens, type, spacing, states and taps, with each value mapped to an app file.
5. `05-SCREENS.md`: every screen, subscreen, sheet, menu and state, each with its screen ID and design link, plus the retired IDs. `capture.mjs --list` prints each ID's wait selector.
6. `06-SCREEN-SPECS.md`: each element on each screen: box, type, tokens with light and dark hex, measured contrast, hit area and data field.
7. `07-MOTION.md`: one row per move: trigger, property, from and to, duration, spring, stagger, whether it can be interrupted, the Reduce Motion version and the clip that checks it.
8. `08-ACCEPTANCE.md`: pass or fail criteria per screen ID and per PR, plus the side-by-side check. It cites SHARED-1 to SHARED-12 from `ACCEPTANCE-SHARED.md`.
9. `02-PLAN.md`: file by file against helmv3 `main` 75b4956, PRs AK0 to AK12, the held migrations, tests, and the §18 corrections where the code differs from the drawing.
10. `03-DATA-CHECKS.md`: every figure on every screen, its source field or query, and whether it is real today (OK, PLUMB, DERIVE or MISSING).

Files win in this order: 05 to 08, then 04, then `ASK_REDESIGN.md`, then `02-PLAN.md`, then `BUILD_BRIEF.md`. Where any of them still differs from the design page, the §18 corrections in `02-PLAN.md` win, and the PR lists the screen as "can't match as drawn" with the reason.

Shared parts live next door: `../coachhelm/AGENT_KIT.md` (steps, confirm, commit, receipt, Undo, used by quick chat and the practice builder too), `../coachhelm/TASK_FIELDS.md` (the fields each create flow writes) and `../practice-plan/COACHHELM_PRACTICE_PLAN.md` §12 and §13 (the printed plan page the artifact pane reuses).

## PRs

AK0 plumbing and the switch, AK1 answer card and steps, AK2 read chips and Sources, AK3 tool cards and follow-ups, AK4 confirm and Undo (needs HM1), AK5 artifacts, AK6 and AK7 the new reads and visuals, AK8 tone and CoachHelm knows (HM2), AK9 practice brief and Save to a folder, AK10a player Ask (HM3), AK10b allowance (HM4), AK11a to AK11e the create flows (AK11e drill needs HM5), AK12 capture and fidelity. Every PR is a draft. Behind `coachhelm_ask_v2` (off everywhere); player Ask also behind `coachhelm_player_ask_v1`; the lineup flow also needs `golf_tournaments_v1`.

Held migrations, written in `02-PLAN.md` and never run: HM1 `20261101090000_coachhelm_action_runs_hold`, HM2 `20261101090100_coachhelm_ask_tone_and_facts`, HM3 `20261101090200_player_ask_conversations`, HM4 `20261101090300_ask_allowance`, HM5 `20261101090400_golf_drills_team_bank` (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration).

## Decided

By Nick, 31 Oct:
- Players get their own Ask: stats and visuals only, their own data, no writes, and comparisons against the PGA Tour and team averages only, never a teammate.
- Artifacts save to Documents only when the coach taps Save, into a folder they pick or a new one.
- Steps stay open while Ask works, then fold to one line.
- Announcements post when the coach presses Post, with the 8 second Undo. Players are told once Undo closes.

By the Ask lane, as defaults Nick can flip (he said "Handle any other questions they have"):
- The drill flow is built but stays off until HM5 gives `golf_drills` a team and a policy. (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration). It writes the one team drill bank, `golf_team_drills`, that the practice-plan lane reads.
- The lineup flow shows only with Tournaments on. "Set the lineup" has Undo; Lock is a separate card after that, with no Undo.
- No Lift flow until Lift has a team table.
- Request more follows the customer email switch. With it off, the request is logged and no email goes.
- The qualifier asks no exemption question and has no tie rule. The round note is always shared and is added under the earlier notes.

## How to check a build matches the design

Run on the Mac from the helmv3 repo root. One dev server, one headless Chromium, one page at a time, so it stays light on memory.

```
npm run dev -- -p 3100
```

Shoot a screen ID on both sides, light and dark:

```
node design-refresh/ask/capture/capture.mjs --id S-ASK.flow.f_annc.confirm --state default
```

Put built and design side by side:

```
node design-refresh/ask/capture/capture.mjs compare
```

Record a motion row on both sides, with and without Reduce Motion:

```
node design-refresh/ask/capture/capture.mjs --motion M-ASK-45
```

See what would be shot without opening a browser:

```
node design-refresh/ask/capture/capture.mjs --dry --id all --state all
```

The design page opens at any flow and stage from a link and holds there, for example `redesign/coachhelm-ask.html#stage?play=f_lineup&stage=lock&device=phone&theme=dark`. The page holds at start, steps, worked, brief, draft, confirm, adding, receipt and done; told, undone, cancelled, lock and locked are passed on the way (`stage=lock` stops on the Lock card by itself). Add `rm=1` for Reduce Motion and `ts=xxl` for the largest Text Size.

A PR is done when its rows in `08-ACCEPTANCE.md` and SHARED-1 to SHARED-12 pass, its shot pairs and clip pairs are in the PR, and every figure on its screens traces to a row in `03-DATA-CHECKS.md`.

## Rules every PR keeps

- Nothing is written before the coach presses the confirm button. Undo inside 8 seconds leaves no row and tells nobody.
- The coach sends messages, not the app. Boards and polls land in the coach's Messages composer as drafts.
- Never change what shot tracking collects, stores or sends.
- Text contrast 4.9:1 or better, no opacity on text. No accent left-border cards anywhere. Keep today's green top bar.
- Every figure has a read chip naming its source; nothing inferred is saved to CoachHelm knows.


## Completeness pass, 4 Nov 2026

| File | Adds |
|---|---|
| `05-SCREENS.md` | 32 IDs (304 in all) and rules CP-A to CP-L: every flow at every stage, failure copy, held migrations, allowance, the plan flow across two lanes, conversation behaviour, coach versus player, deep links, keyboard, hand-offs, the drill bank |
| `06-SCREEN-SPECS.md` | 12 pieces and 32 ID specs |
| `07-MOTION.md` | M-ASK-90 to M-ASK-112 |
| `08-ACCEPTANCE.md` | CP-1 to CP-71 and per-PR additions |
| `03-DATA-CHECKS.md` | CP-D1 to CP-D14 |
| `02-PLAN.md` | where each new piece lands, by PR |

HM5 is superseded by N-00 `20261026010100_golf_team_drills`; Ask's own held migrations are HM1 to HM4; the drill flow also waits on that N-00 file.

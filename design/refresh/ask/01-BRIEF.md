# CoachHelm Ask: brief (BUILD_BRIEF AK0 and on)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 3 rows).

## What Nick asked for

Nick, 31 Oct, in his words:
- Ask should work like Claude or ChatGPT: artifacts, visuals in the conversation, golf smarts, full sight of the team's data, and visuals while it works.
- "A lot more attention on how it looks completing tasks."
- "It should ask you what you want in the practice plan and then create it."
- "Documents created should be able to save to folder or create folder."
- The Messages page's look: "airy and modern and premium… Like crazy detail."
- "Create event, create announcement, create travel, create a visual board to share with player in messages, what else am I missing? They all need it. And the logic of what it asks and the visuals need to be beautiful."
- "The animation and motion needs to be spot on. Detailed and well thought out."

## What changes

Today Ask is a plain chat: text answers, a few charts, and a confirm card (`ActionCard`) for its four writes. After this work it is a chat that:
- shows its steps live while it reads, then folds them to one line ("4 steps · 3s");
- answers with real visuals (miss pattern, putt profile, season compare, hole strip) and names every figure's source with a read chip;
- writes plans and reports as artifacts in a side pane (desktop) or a pushed screen (phone), saved to a Documents folder only when the coach taps Save;
- asks before it builds a practice plan (four questions, each with a default from the data);
- creates things in every tab through one flow: Worked out pills, a few short questions, a live draft that builds itself, a confirm that names exactly who is told, then the draft flies into its real home with a receipt, an 8 second Undo and a Told row;
- looks and moves like Messages: the same surfaces and the same six springs, each with a `CH_FADE_MS` (180ms today) crossfade under Reduce Motion.

## Where it lives

The CoachHelm route's Ask tab, behind a new `coachhelm_ask_v2` switch, off in every environment. With it off, today's Ask renders unchanged. Player Ask has its own switch. The lineup flow also needs `golf_tournaments_v1`. File by file in `02-PLAN.md`.

## Decided by Nick (31 Oct)

1. Players get their own Ask, behind its own switch: stats and visuals only, their own data only, no writes, never a named teammate. Comparisons are against PGA Tour and team averages only (Nick, 31 Oct 15:26, for the player view: "They see against pga tour and team averages"). A weekly allowance whose amount is never shown; when it runs out Ask explains why and shows Request more, which emails Helm Sports Labs after a confirm.
2. Artifacts save to Documents only when the coach taps Save, into a folder they pick or a new one. A published plan also files a copy in Practice plans.
3. Steps stay open while Ask works, then fold.
4. Announcements post when the coach presses Post, with the 8 second Undo. Players are told only once Undo closes. Not a draft.

## Defaults Nick can flip (he said "Handle any other questions they have")

1. The drill flow is built but stays off until `golf_drills` gets a `team_id` and a policy. That migration is written and held, not run. (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration).
2. The lineup flow shows only where Tournaments is on (`golf_tournaments_v1`). "Set the lineup" has the 8 second Undo; Lock is a separate card after Told, with no Undo, because locking can't be undone.
3. No Lift flow until Lift has a table. The gallery lists it as waiting.
4. Request more follows `HELM_CUSTOMER_EMAIL_ENABLED`. With it off, the request is logged and no email goes.
5. The qualifier asks no exemption question and has no tie rule, since neither has a field. The round note asks nothing: it is always shared and is added under the earlier notes, and Undo puts the earlier notes back.

## Rules every PR keeps

- Prep only. Draft PRs, never merged, deployed or flipped by the agent. No migration is run; any that the plan needs is written and held.
- Nothing is written before the coach presses the confirm button. Undo inside 8 seconds leaves no row and tells nobody.
- The coach sends messages, not the app. Boards and polls land in the coach's Messages composer as drafts; Ask never sends them.
- Never change what shot tracking collects, stores or sends.
- CoachHelm's evidence rule stays strict: every figure has a read chip naming its source; nothing inferred is saved to CoachHelm knows.
- DESIGN_LANGUAGE.md: flat page, titles inside cards, amber for losses and failed reads, red only for under par, text contrast 4.9:1 or better, phone page edge 16px (20px on large phones), text follows iPhone Text Size, shared springs with Reduce Motion versions. Keep today's green top bar. No accent left-border cards anywhere.
- Shared kit: steps, confirm, commit, receipt and Undo come from `coachhelm/AGENT_KIT.md`, the same parts quick chat and the practice builder use. A practice plan in the pane reuses the practice builder's printed page (`practice-plan/COACHHELM_PRACTICE_PLAN.md` sections 12 and 13).

## What done means

Each PR passes its criteria in `08-ACCEPTANCE.md` (with the numbers in `05-SCREENS.md`, `06-SCREEN-SPECS.md` and `07-MOTION.md`) and the side-by-side check against the design page (light and dark, 390 and 1440, Reduce Motion, Text Size XXL), with motion clips beside the design page's. Every figure traces to a field in `03-DATA-CHECKS.md`; a figure that can't be traced doesn't ship.


## Completeness pass, 4 Nov 2026

| What changed | Why |
|---|---|
| Default 1 (drill flow) now waits on N-00 `20261026010100_golf_team_drills`, the one team drill bank the Practice tab uses; HM5 is superseded | one drill bank (coordinator, 4 Nov) |
| Save to a folder uses folder names and writes at once; Publish matches the practice-plan lane | practice-plan lane defaults 1, 3 and 9 |
| 32 new screen IDs (failures, quiet flows, stop and drop, history paging, chat gone, mid desktop) and 71 checks (CP-1 to CP-71) | so every flow has every stage defined; see 05 and 08 under this heading |

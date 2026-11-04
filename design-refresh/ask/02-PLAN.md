# CoachHelm Ask redesign (lane 4): file-by-file build plan

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 13 rows).

The values (sizes, colours, words, motion, states) come from the design page `coachhelm-ask.html` (in this folder), `ASK_REDESIGN.md`, the shared kit `../coachhelm/AGENT_KIT.md` and `../DESIGN_LANGUAGE.md`. This file says where they go and in which PR. Exact values live in the sibling files: `04-FIDELITY-SPEC.md` (named states and side-by-side checks), `05-SCREENS.md` (screen IDs S-ASK-…), `06-SCREEN-SPECS.md` (per-screen element specs), `07-MOTION.md` (rows M-ASK-nn: every timing, curve and Reduce Motion version) and `08-ACCEPTANCE.md` (per-screen and per-PR acceptance, which cites the Done when lists below). Shared criteria are cited as SHARED-1 to SHARED-12 from `../../redesign-package-src/ACCEPTANCE-SHARED.md` and not restated. This plan points at those files and does not repeat their numbers. Design states are named by the page's state links, `#h-live?play=<key>&stage=<stage>` for scenes and `#h-make?play=f_<flow>&stage=<stage>` for create flows (stages: steps, reads, worked, brief, brief-done, draft, confirm, adding, receipt, told, undone, cancelled, done). Where this file and `03-DATA-CHECKS.md` disagree on a figure's source, the data checks win. Field rules for every write come from `../coachhelm/TASK_FIELDS.md`; this plan follows it and lists the few places it needs a correction (section 18).

Repo `njrini99-code/helmv3`, read at `main` 75b4956 (Oct 31). Shallow clone, read only. Paths are under `src/clubhouse/` unless they start with `src/`, `config/`, `supabase/`, `scripts/` or `docs/`. Line numbers are at 75b4956; find code by name first, because lines drift.

Prep only: draft PRs. No push, merge, deploy, migration run or flag flip. Every database change below is written as a migration file and registered as HOLD in `supabase/migrations/HELD.md`; none is applied. Nothing here changes what shot tracking collects, stores or sends.

Hard rules every PR keeps:
- release flag `coachhelm_ask_v2`, off in production, preview and development; with it off, Ask renders and behaves exactly as at 75b4956
- player Ask behind its own flag `coachhelm_player_ask_v1`, off everywhere, and only on top of `coachhelm_ask_v2`
- the lineup flow also needs `golf_tournaments_v1`; the drill flow stays off until the held drill bank migration is applied (N-00 `20261026010100_golf_team_drills`; HM5 (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration)); no Lift flow
- nothing is written before the coach presses the named confirm button; Undo inside 8 seconds leaves no row and tells nobody; players are told only after Undo closes
- announcements post on the coach's press of Post (with Undo); boards and polls are drafts in the Messages composer and Ask never sends a message
- the player toolset has no write tool and never names a teammate; comparisons are PGA Tour and team averages only
- the engine also serves Fairway's chat (`agent-tools.ts:577-580` comment) (fixed 4 Nov wiring: the comment is at `agent-tools.ts:582-584` on 03d9087): every new tool, part and block is registered only when `coachhelm_ask_v2` is on and Clubhouse is on for the team, so Fairway's chat is unchanged
- green phone bar, desktop sidebar and glass top bar unchanged; amber for losses and failed reads, red only under par; no accent left borders; shared springs only, each with its Reduce Motion version (SHARED-1 to SHARED-11)
- every PR also meets SHARED-11 (player privacy), SHARED-10 (shot tracking zero diff), SHARED-8 (draft PRs behind the flag) and SHARED-9 (no migration applied), plus the lane rule that every figure traces to 03

---

## 0. PR order

| PR | Contents (ASK_REDESIGN §5 step) | Depends on | Held migration |
|---|---|---|---|
| AK0 Plumbing | flags, route prop, `parts/` folder, CSS file, preview route, fixtures, error codes | BUILD_BRIEF PR 1 tokens; Messages 11a springs and bubble tokens | none |
| AK1 Answer card and steps | answer card, live steps with past-tense label and detail, fold to "4 steps · 3s", Stop (step 1) | AK0 | none |
| AK2 Read chips and Sources | inline chips from `evidence_ref`, popover, "N reads" well (step 2) | AK1 | none |
| AK3 Tool cards and Follow-ups | skeleton per visual, crossfade, marks grow once, three chips (step 3) | AK1 | none |
| AK4 Confirm, commit, receipt, Undo | kit ② to ⑤ on the four existing writes, server Undo hold, announcement Post (step 4) | AK1 | HM1 |
| AK5 Artifacts | card, desktop pane, phone push screen, versions, practice_plan kind (step 5) | AK1; N-00 plan model for Save and Publish | none (N-00 owns its own) |
| AK6 Shot reads | `get_shot_pattern`, `get_proximity_by_band`, `get_round_detail`, `miss_pattern`, `putt_profile` (step 6) | AK3 | none |
| AK7 Engine reads | `get_root_causes`, `get_team_patterns`, `get_calendar`, `get_course`, `compare_seasons`, `season_compare`, `hole_strip` (step 7) | AK3, AK6 | none |
| AK8 Tone and CoachHelm knows | per-chat tone, standing facts list (step 8) | AK1 | HM2 |
| AK9 Practice brief and Save to folder | `ask_practice_brief`, brief card, folder save card (step 9) | AK4, AK5; N-00 plans (folders by name, see §12) | none (N-00 owns its own; N-10 only if Nick flips folders) |
| AK10a Player Ask | player route, player context, read-only toolset (step 10) | AK1 to AK3, AK6 | HM3 |
| AK10b Allowance | usage ledger, meter, out card, Request more (step 10) | AK10a, AK4 | HM4 |
| AK11a Create engine | `CreateFlow`, Worked out pills, home mocks; event, task, round note (step 11) | AK4, AK7 | none |
| AK11b More creates | announcement flow, travel, qualifier, goal; quiet flows (block time, break, term, availability note, recruit) | AK11a | none |
| AK11c Board and poll | `draft_board`, `draft_poll` through Messages prefill | AK11a; Messages prefill work | none (poll delete needs held `20261028140800`) |
| AK11d Lineup | `set_lineup`, behind `golf_tournaments_v1` | AK11a | none |
| AK11e Drill | `create_drill`, built off | AK11a; N-00 §8.3 | none of its own: N-00 `20261026010100` (HM5 (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration)) |
| AK12 Capture and fidelity | Playwright, capture states, motion clips, flag-off parity | all | none |

AK2 and AK3 can go in either order after AK1. AK6 and AK8 don't depend on each other. AK10a can start once AK3 lands. AK11b to AK11e can go in any order after AK11a. Seventeen PRs; each is one reviewable diff.

Every PR must:
- run `npm run clubhouse:catalog` (CI checks `--check`; regenerate after every rebase, never edit `preview/component-catalog.json` by hand)
- run `npm run clubhouse:css` (`scripts/clubhouse/css-quality.mjs`: no new transition of layout properties, no `transition: all`, outer shadows use a `--ch-*` token)
- run `npm run flags:check` (AK0 also runs `npm run flags:generate`)
- keep `playwright.clubhouse.config.ts` green (chromium and webkit; motion no-preference and reduce)
- pass `npm test`, `npm run lint`, then `npm run typecheck` once at the end
- add a changelog fragment in `docs/clubhouse/pages/P013-coachhelm/changes/` (and one in `docs/clubhouse/changes/` for any shared `ui/`, `lib/`, `shell/` or `styles/` file)
- attach the fidelity check from `04-FIDELITY-SPEC.md`: side-by-side shots against the named design states (state links above) at 390, 430 and 1440, light and dark, Text Size XXL (SHARED-5, SHARED-7); clips beside the design page's for every M-ASK row it touches (`07-MOTION.md`, SHARED-6, SHARED-12); each difference listed as matches, fixed, or can't match as drawn with the reason

---

## 1. Files that must NOT change (all PRs)

| File | Why |
|---|---|
| `shell/TopBar.tsx`, `shell/ClubhouseFrame.tsx`, `shell/phone-chrome.tsx`, `shell/PhoneScreen.tsx`, `ui/PhoneBar.tsx` | Green phone bar, pushed bar and desktop chrome stay. The artifact push screen uses `PhoneTop back title` like other pushed views. |
| `shell/AskSheet.tsx`, `shell/AskSheetBody.tsx`, `shell/PushAsk.tsx`, `shell/push-ask.ts` | Lane 5 (quick chat) owns them. Lane 5 imports Ask's `parts/` once they land. |
| `src/components/golf/coachhelm/chat/*` (Fairway chat, `useCoachHelmChat.ts`, `CompositionVisual.tsx`, `ChatThread.tsx`) | Fairway's chat. The hook is imported as is; one additive option in AK10a (section 11.1) is the only exception, behind a default that keeps today's call. |
| `src/lib/coachhelm/v3/chat/action-planners.ts` existing exports | Today's four planners keep their behaviour for the flag-off path. New planners go in new files. |
| `src/app/golf/actions/*` (announcements, tasks, development, calendar-events, travel, qualifier-actions, v3/goals, round-coach-note, message-polls, documents) | Server actions are called, not edited, except the narrow splits named in AK4 and AK11 (each a new export beside the old one, old export unchanged). |
| `src/hooks/golf/use-shot-tracking.ts`, `src/components/fairway/pages/rounds-tracking/*`, `screens/rounds/*` capture, `submit_round_atomic` and the partial save RPC | Shot tracking. Ask only reads `golf_shots`. |
| `styles/tokens.css` | BUILD_BRIEF PR 1 and Messages 11a add the tokens this lane uses. This lane adds none. |
| `lib/motion.ts` | Messages 11a adds `send`, `pop`, `lift` to `CH_SPRINGS` (today only `smooth`, `settle`, `reveal`, lines 59-63). This lane imports them. |
| `styles/coachhelm-ask.css` (1396 lines), `styles/coachhelm-thread.css` (1973 lines) | Flag-off look. Every new rule goes in `styles/coachhelm-ask-v2.css`. Old rules are deleted only in the cleanup PR after the flag is on for a while (not in this plan). |
| `src/lib/coachhelm/v3/chat/visuals/composition.ts` v1 schema | Persisted v1 compositions must keep parsing (section 9.2). |
| `screens/messages/*` except `prefill.ts` and the composer's prefill read | Messages lane owns them; AK11c is additive. |
| `supabase/migrations/*` existing files | New held files only. |

---

## 2. Decisions applied, and what the code forces

1. Announcements post on Post with an 8 second Undo, players told after Undo closes (Nick, 31 Oct). Today `createEnrichedAnnouncement` (`src/app/golf/actions/announcements.ts:741`, impl from 254) inserts and then fans out bell, email and push inside the same call (619-678). So Undo can't be honest unless the call itself waits. AK4 holds the whole write on the server for 8 seconds (TASK_FIELDS §3). Undo cancels the held run, so there is no row and nobody was told.
2. The hold needs two columns the ledger doesn't have. `golf_coachhelm_action_runs` (`20260725170000_coachhelm_action_runs_and_ui_parts.sql:41`) has no `run_at` and its status CHECK (line 62) allows only `proposed, approved, denied, completed, failed`. TASK_FIELDS §7 says no migration is needed; one is. HM1, held.
3. Boards and polls never send. `messagesPrefillHref` (`screens/messages/prefill.ts:49-62`) carries `players`, `draft`, `title` only. AK11c adds `conversationId`, `poll` and `attachment` to `ChPrefill`, all in sessionStorage as today. The coach presses Send or Post in Messages.
4. Player Ask is reads plus `show_visual`, own data only. Today `resolveCoachChatContext` (`src/lib/coachhelm/v3/chat/context.ts:78-128`) (fixed 4 Nov wiring: the resolver is `context.ts:78-111` on 03d9087; the throw is at :89) throws "This surface is for coaches" for anyone else, and `golf_coachhelm_chat_conversations.coach_id` is NOT NULL. AK10a adds a player context and HM3 lets a conversation belong to a player.
5. Lineup behind `golf_tournaments_v1`, like `get_tournaments` today (`agent-tools.ts:602`) (fixed 4 Nov wiring: `agent-tools.ts:603-607` on 03d9087). The lock is its own RPC, `golf_tournament_lock_lineup(p_id)`, and can't be undone, so the flow lands "Lineup set" and offers Lock as a second card (TASK_FIELDS §6).
6. Drill flow built off. `golf_drills` has no `team_id` and only a SELECT policy (`drills_read_all_authenticated`, baseline 18633), so a coach can't insert at all today. HM5 adds `team_id`, `created_by`, `is_global`, `player_visible` (the flow's "Who can see it?") and coach write policies, held. If N-00 §8.3 lands its own team drill bank migration first, AK11e uses that and HM5 is dropped. (fixed 4 Nov: one drill bank. The drill flow writes N-00's `golf_team_drills` (held `20261026010100`, coach-only, archive not delete, `copied_from_drill_id` for a GolfHelm library drill), the same bank the practice-plan lane reads. HM5 is superseded; Ask's drill flow waits on that held migration). The bank has no visibility column: only coaches see it, and players see a drill only inside a published plan, so the flow's "Who can see it?" question is dropped like the qualifier's exemption question.
7. No Lift flow. Lift Lab tables exist (`helm_lifting_*`, 2026-06-25 migrations) but are organisation-scoped and not linked to golf teams. The gallery lists Lift as waiting.
8. Tone and CoachHelm knows need storage (HM2). Practice plans and folders are other lanes' tables (N-00 `20261026010000` to `010800`, N-10 `20261026090200_golf_document_folders`), all held; AK5 and AK9 build against them behind their flags and stay inert until both are applied. (fixed 4 Nov: folders follow the practice-plan lane default 1: a folder is a name in today's free-text `golf_documents.folder`, 1 to 60 characters, trimmed; New folder is a new name on save; no folders table and no `create_folder`. If Nick flips to N-10's held `20261026090200_golf_document_folders`, the list becomes N-10's union of that table and the text values, and the card is unchanged); so AK9 needs N-00 only.

---

## 3. AK0: Plumbing

Touches:
- `config/feature-flags.yml`: add `coachhelm_ask_v2` (release, owner golf/coachhelm, default false, all environments false; purpose "the redesigned Ask: answer card, live steps, read chips, artifacts, create flows and the Undo hold; flag off renders today's Ask") and `coachhelm_player_ask_v1` (same shape; purpose "a player's own read-only Ask with a hidden weekly allowance"). Copy `coachhelm_track_record_v1`'s entry shape. Cleanup plan: remove after the old ActionCard and thread rules are deleted.
- `src/lib/flags/registry.generated.ts` via `npm run flags:generate`.
- New `src/lib/coachhelm/v3/chat/ask-flag.ts`: `ASK_V2_FLAG`, `PLAYER_ASK_FLAG`, `isAskV2Enabled()`, `isPlayerAskEnabled()` (sync, `isFlagEnabled`; player needs both).
- `routes/coachhelm.tsx` (235 lines): `CoachHelmView` (60-69) passes `v2={isAskV2Enabled()}` into `<Ask>`. No other route change in AK0. Flags are server only (`is-enabled.ts` imports `server-only`), so the client never reads them.
- `screens/coachhelm/chat/Ask.tsx` (355 lines): `Ask` and `AskChat` take `v2?: boolean` (default false) and pass it to `AskThread`, `AskComposer`, `AskHome`. Flag off, nothing else changes.
- `src/app/api/coachhelm/v3/chat/stream/route.ts`: read `isAskV2Enabled()` once beside `claimsBlockEnabled` (550) and pass `askV2` into `buildCoachTools` (call at 558-562) (fixed 4 Nov wiring: the call is at route 554-562; `teamTools: isClubhouseForTeam(ctx.team_id)` at 561). `BuildToolsArgs` (`agent-tools.ts:169-187`) (fixed 4 Nov wiring: `agent-tools.ts:169-183` on 03d9087) gains `askV2?: boolean` (default false).

New:
- `screens/coachhelm/chat/parts/` (empty index, filled from AK1)
- `styles/coachhelm-ask-v2.css`, prefix `.ch-ak-`, imported in `routes/coachhelm.tsx` beside today's Ask CSS; every rule scoped under `.ch-ask[data-v2]` so flag off matches nothing
- preview `coachhelm-ask-v2` in `preview/` (beside `PreviewAsk.tsx`), with `fixtures-ask-v2.ts` holding the design page's fixture model: roster of 7 (Josie, Jonah, Theo, Eli, Maya, Ana, Sam), `SRC` reads, the 64-shot miss set, the plan, the 11 flows; values listed in `03-DATA-CHECKS.md`
- error codes: a new CH-139xx block for Ask v2 states (registered in the P013 code list); no reuse of today's codes for new states

Kept: everything. Deleted: nothing.

Risks: the tokens (`--ch-card-bg`, `--ch-well-bg-flat`, `--ch-loss`, `--ch-shadow-float`) and springs (`send`, `pop`, `lift`, `--ch-ease-spring-*`) are not in `tokens.css` or `lib/motion.ts` at 75b4956. AK0 waits for BUILD_BRIEF PR 1 and Messages 11a, or carries exactly their token block (same rule as the Read lane).

Tests: flag registry test; `ask-flag.test.ts` (player needs both); route renders today's `Ask` unchanged with the flag off (snapshot of the root's `data-ch-code="CH-13820"` and class list); preview route renders.

Done when:
- with both flags off, the Ask route, the stream route and `buildCoachTools` produce byte-identical output to 75b4956 for the existing test fixtures (the tool set's keys equal today's 17 reads, `show_visual` and four writes)
- `npm run flags:check` passes and both flags read false in all three environments
- the preview route loads the design page's fixtures and renders today's Ask with `v2` false and an empty `.ch-ak-` shell with `v2` true

---

## 4. AK1: Answer card and steps (kit ①)

Today:
- `agent-tools.ts` writes `data-progress` with `{label, tool}` (`progress`, 238-246) before each read; labels in `PROGRESS_LABEL` (144-167) are present tense only.
- `data/coachhelm-chat-thread.ts` (1109 lines) turns parts into turns: `AskStep` (86), `stepLabel` (157, falls back to "Working"), `workReceipt` (262, "Worked for 6s · 3 steps"), `describeWork` (268).
- `screens/coachhelm/chat/Thread.tsx` (374 lines): `Work` (281-340) draws `.ch-th-steps` with a dot and checks, a live elapsed time (`useElapsed`, 68) and Stop; the answer is `article.ch-th-ans` (194) with `.ch-th-card` (200).

Server change (behind `askV2`):
- `progress()` returns its part id. After the read resolves, the `read()` wrapper (258-271) writes the same id again with `{label, tool, state: 'done' | 'failed', done, detail}`. The AI SDK replaces a data part with the same id, so the row updates in place. `state: 'failed'` when `guarded` returned `unavailableEnvelope` (209).
- New `PROGRESS_DONE` map beside `PROGRESS_LABEL`: past tense in the same words ("Read the roster"). New `detailFor(tool, envelope)`: one short fact from the envelope's own counts (sample size and unit, roster count, window), never a number not in the envelope. Detail strings go through `collect` like any other envelope text, so the claim audit sees them.
- `CoachChatDataParts['progress']` gains optional `state`, `done`, `detail`. Old persisted parts lack them and draw as today.

Client, new in `parts/`:
- `AnswerCard.tsx`: one card per assistant turn (Messages receive surface; values in `04-FIDELITY-SPEC.md`). Holds steps, prose, visuals, sources, and follow-ups sit under it.
- `Steps.tsx`: rows per announced step only; active dot breathing and label shimmer; check draws when done; amber ring for failed; detail line on done rows; fold to "{n} steps · {s}s" with chevron when the turn ends; "Waiting for you" row with an accent ring when the turn stops at Confirm; Stop square in the composer marks the active row with a dash and prints "Stopped. Nothing was saved."
- `data/coachhelm-chat-thread.ts`: `AskStep` gains `state`, `done`, `detail` (optional). New pure `stepsReceipt(steps, seconds)` returns "4 steps · 3s"; `workReceipt` stays for flag off.

Restyled: `Thread.tsx` chooses `AnswerCard` + `Steps` when `v2`, else today's markup. The elapsed timer is not shown in v2 (kit: no timer).
Kept: `Work`, `.ch-th-steps` rules, `workReceipt`.

Must not change: `stepLabel`'s tool-name guard (a raw tool name never reaches the screen).

Risks: the replaced progress part must keep its id stable across the approval continuation (`isApprovalContinuation`, route 372); a test covers a two-request turn. A failed read today still says "Could not complete that read" in the model's context; the amber row must not add a second message.

Tests: `agent-tools.progress-labels.test.ts` extended (every tool in the set has a done label; no done label contains a digit unless it comes from the envelope); `coachhelm-thread.test.ts` (part replacement, failed state, fold receipt); `coachhelm-thread-ui.test.tsx` (Stop, aria-live only on the live list, fold chevron toggles).

Done when:
- the putts, jonah and trend scenes in the preview match `04-FIDELITY-SPEC.md` states "steps running", "steps done" and "steps folded" side by side at 390 and 1440, light and dark
- the step clip (row in, dot breath, shimmer, check draw, fold) matches the design page clip and `07-MOTION.md`; Reduce Motion shows no breath, shimmer or draw and folds with the `CH_FADE_MS` (180ms) crossfade
- DOM: no step row exists before its `data-progress` part arrives; no percentage and no timer render in v2
- a read that throws renders an amber row, never red, and the turn continues

---

## 5. AK2: Read chips and Sources

Today: each read writes `data-evidence {tool, envelope, ref}` (`agent-tools.ts:249-256`), and the model sees `evidence_ref` on the result (270). The prose doesn't cite refs; the instructions only use refs for `show_visual` (`instructions.ts:118`). `EvidencePanel.tsx` and `Evidence.tsx` draw evidence as separate blocks.

Change:
- `instructions.ts`: under `askV2` only, one added paragraph: after a sentence that states a figure, write the read's ref in square brackets, `[e2]`. The flag-off prompt is unchanged (snapshot test).
- Stream route: strip `[eN]` markers before `auditNumericClaims` and the claim packet (the "2" in `e2` must not count as a claim), and before persistence of `content` (the parts keep them). Unknown refs are dropped, never drawn.
- New `parts/ReadChip.tsx`: a pill named by the read and window ("Putts · 30 days"), built from the envelope's `measurements[].window_start/end`, `sample_size`, `sample_unit`, `as_of` (`sourceLine`, `coachhelm-chat-thread.ts:76`). Tap opens a popover: read name, window, sample, computed time, "Open in Stats" (existing `coachhelm-chat-links.ts` hrefs).
- New `parts/Sources.tsx`: "{n} reads" under the answer, opens a well listing every read of the turn.
- `parts/Prose.tsx` (new, wraps today's `Prose.tsx` renderer) swaps `[eN]` for a `ReadChip`.

Kept: `Evidence.tsx` tables for "View as table" (`TableToggle`, 99). EvidencePanel stays for flag off.

Risks: a model that forgets the marker gives an answer with figures and no chip. The Sources row still lists every read; AK12 measures marker coverage on the eval set and the instructions get one worked example.

Tests: marker parser (adjacent markers, marker at end, unknown ref); audit ignores markers (`route.grounding-persistence.test.ts` gains a case); popover keyboard and focus return.

Done when:
- putts scene: three chips in the order the design draws them ("Putts · 30 days", "Putts · season", "By player") and "3 reads" match `04-FIDELITY-SPEC.md` "chips" and "sources open"
- every chip's popover rows come from the envelope (DOM test against fixture envelopes: no string in the popover that isn't in the envelope or the fixed labels)
- a turn whose text cites `[e9]` with only two reads draws no chip for it and the claim audit result is unchanged

---

## 6. AK3: Tool cards and Follow-ups

Today: `show_visual` writes `data-visual-composition` or `data-visual-artifact` only when the call completes (`agent-tools.ts:548-583`); `visual/CoachComposition.tsx` and `visual/CoachVisualArtifact.tsx` draw them. Follow-ups are `followUpsFor` (`coachhelm-chat-thread.ts:282`) drawn as `.ch-th-follow` pills (Thread 240-255).

Change:
- New `parts/ToolCard.tsx`: while the `tool-show_visual` part is `input-streaming` or `input-available`, draw a skeleton shaped by the block types in the partial input (headline, kpis, trend, bars, split, compare, note, and AK6/AK7 blocks); on `data-visual-composition`, crossfade to the composed card; marks grow once on first view (IntersectionObserver), never on re-render. Refused visuals fade the skeleton out.
- Every bar and dot is a button: tap fills the composer with "Ask about this: {label}" (no send). Hit areas per `05-SCREENS.md`.
- New `parts/FollowUps.tsx`: the three chips from `followUpsFor`, together, under the card.
- `visual/CoachComposition.tsx` gains an `onAsk` prop (optional; absent keeps today's static marks).

Kept: compile path and the evidence rule (figures filled by trusted code; a digit in model text refused). Deleted: nothing.

Tests: skeleton shape per block type; crossfade only once per artifact id; tap fills composer and does not send; follow-ups max three.

Done when:
- the putts, jonah and trend visuals match `04-FIDELITY-SPEC.md` "skeleton" and "drawn" states, light and dark; the clip matches the design page (skeleton, crossfade, marks grow once)
- scrolling a drawn visual off and back does not replay the grow (Playwright)
- Reduce Motion: skeleton swaps with the `CH_FADE_MS` (180ms) crossfade and marks appear drawn

---

## 7. AK4: Confirm, commit, receipt and Undo on today's four writes (kit ② to ⑤)

Today:
- Gate: `CONFIRM_REQUIRED_TOOLS` (`agent-tools.ts:102-107`); the route sets `toolApproval: isConfirmRequired(...) ? 'user-approval'` (route 655). `proposeGated` (317-370) records the proposal and writes `data-action-proposal`; `executeGated` (372-437) builds, claims (`claimForExecution`, `action-runs.ts`), runs and writes `data-action-receipt`. `create_recurring_practice` has its own copy (721-876).
- Client: `ActionCard.tsx` `AskActionCard` (22) and `AskReceiptCard` (157); approvals via `chat.addToolApprovalResponse` in `useCoachHelmChat.ts` (239-258).
- Every write tells players inside the call (TASK_FIELDS §3 table).

Server change (behind `askV2`):
- HM1 (held): `golf_coachhelm_action_runs` gains `run_at timestamptz null` and the status CHECK adds `held` and `cancelled`. `action-runs.ts` `ActionRunStatus` (27) adds both.
- New `src/lib/coachhelm/v3/chat/undo-hold.ts`:
  - `holdForExecution(sb, {coach_id, idempotency_key, run_at})`: sets the claimed row to `held` with `run_at = now + 8s` and returns at once.
  - `releaseHeld(...)`: called from `after()` in the stream route; waits until `run_at`, re-reads the row, runs only if still `held` (atomic `update ... where status = 'held' returning`), then records the outcome as today. (fixed 4 Nov wiring: the route imports only `NextRequest` and `NextResponse` from `next/server` (route.ts:27-28); add `after` as `calendar-events.ts:3` does. The release moves `held` to `approved` in that one update, so `claimForExecution`'s in-flight and TTL rules (`action-runs.ts:148-206`) then apply unchanged. The receipt is built from a read-back of the domain row, never from the action's `ActionResult` alone: `createEnrichedAnnouncement`, `createTask`, `createGolfQualifier` and `createGolfEvent` call `updateTag` after their insert (for example `announcements.ts:697`), which Next 16 allows only inside a Server Action (`src/app/admin/actions/triage.ts:38-39`); if it throws in a route's `after()`, the action returns failure after the row and the fan-out exist. AK4's `undo-hold.test.ts` runs the release in a route-handler context; a failure with a row found by read-back is recorded `completed`, never offered Try again.)
  - `cancelHeld(sb, {coach_id, idempotency_key})`: `held` to `cancelled` only while `run_at > now()`.
  - `sweepHeld(sb, coach_id)`: on the next chat request, runs any overdue `held` row once (idempotency key keeps it single).
- `executeGated` under `askV2` calls `holdForExecution` instead of `action.run`, writes a `data-action-receipt` with `status: 'held'`, `held_until`, and the "On confirm" audience; the real receipt is written to the ledger by `releaseHeld` and fetched by the client when the ring ends.
- New route `src/app/api/coachhelm/v3/chat/actions/[key]/route.ts`: `DELETE` cancels (Undo), `POST ?now=1` commits early (Open), `GET` returns the ledger receipt (Told row). Coach-scoped by session, 404 for another coach's key.
- Announcement: `planAnnouncement` keeps its limits (title 120, body 2000, TASK_FIELDS §8); the confirm label is "Post to {n} players"; the "On confirm" line names bell, push and email (email only while `HELM_CUSTOMER_EMAIL_ENABLED` is true, `src/lib/email/outbound-gate.ts`). Urgency never sends `high` or `low` (TASK_FIELDS 5.3).
- `create_recurring_practice` moves onto `executeGated` under `askV2` only (its own copy stays for flag off).

Client, new in `parts/`:
- `ConfirmCard.tsx` (draft as the real object, field fill with write head, "Not set" for optional gaps, "On confirm:" line, Cancel and verb + object primary; both lock after the first tap)
- `CommitCapsule.tsx` (button to "Adding…" capsule with sweep)
- `Receipt.tsx` (check ring, line, Open, Undo with the draining ring; edge flash; Draft chip spring; Told row with coins in arrival order and seen dots; Undone, Cancelled, Failed, Partial states with today's copy)
- `HomeMock.tsx` stubs for the four destinations (mini week for events, player card for focus areas, task row, Announcements list)

Restyled: the proposal and receipt parts render through these when `v2`; `AskActionCard` and `AskReceiptCard` stay for flag off.
Must not change: `CONFIRM_REQUIRED_TOOLS` membership semantics, `recordProposal`, the claim keys, `collectActionNumbers`.

Risks:
- `after()` on Vercel can be cut by the function timeout (`maxDuration = 120`, route 114); 8 seconds is well inside, and the sweeper catches a lost run. A coach who closes the app does not cancel (the hold lives on the server).
- Until HM1 is applied, `coachhelm_ask_v2` must stay off: without `run_at` the hold can't be stored. AK4 checks for the column at boot (`42703` means not applied) and falls back to today's immediate write with today's ActionCard, never a fake Undo.
- The Told row reads delivery from existing tables (`notifications`, `golf_event_attendance.notified_at`, `golf_announcement_acknowledgements`); "Seen by" exists only where the table records it (`03-DATA-CHECKS.md`).

Tests:
- unit, `undo-hold.test.ts`: confirm writes no domain row before `run_at`; cancel inside 8s leaves `cancelled` and the action mock is never called; cancel after `run_at` is refused; release runs once under a race with the sweeper; Open runs at once
- `agent-tools.confirm-gate.test.ts` extended: no new tool runs `execute` without approval; under `askV2` the receipt is `held` first
- notifications: a spy on `sendBulkPushNotification`, `notifyTeamAnnouncement` and the bell insert sees zero calls during the window and one batch after it
- UI: buttons lock after one tap; Undo ring stops at 8s; reload during the window shows the held receipt with the remaining ring; reload after shows the durable receipt without Undo

Done when:
- the plan scene's calendar confirm and the focus moment match `04-FIDELITY-SPEC.md` states "draft filling", "confirm", "adding", "receipt", "told", "undone", "cancelled", "failed" at 390 and 1440, light and dark
- the commit clip (capsule, flight to the slot, edge flash, check ring, Draft chip, Told coins 90ms apart) matches the design page and `07-MOTION.md`; Reduce Motion: no flight, `CH_FADE_MS` (180ms) crossfades, all coins at once
- DOM and DB assertions: nothing in `golf_events`, `golf_tasks`, `golf_player_focus_areas` or `golf_announcements` before the press; Undo inside 8s leaves no row and no notification; Told appears only after the window
- announcement: the confirm button reads "Post to 7 players"; the card shows the message word for word; players are told only after Undo closes

---

## 8. AK5: Artifacts

Today: no artifact surface. Lane 6 (`practice-plan/COACHHELM_PRACTICE_PLAN.md` §12, §13) owns the printed plan page; N-00 owns the plan model and tables (held).

New in `parts/`:
- `ArtifactCard.tsx`: card in the stream (tile, title, kind, Open); the tile scans while the artifact writes.
- `ArtifactPane.tsx`: desktop right pane, header (title, meta, "1 of 3" version arrows, close), footer (Edit in builder, Save draft…, Publish…). The chat stays usable beside it.
- `ArtifactScreen.tsx`: phone push screen under the green bar with "‹ Ask" and a glass dock (Save draft…, Publish…). Uses `PhoneTop back title`, not a sheet.
- `artifacts.ts` (pure): `AskArtifact {id, kind: 'practice_plan' | 'player_report' | 'lineup' | 'round_recap', title, versions[]}`; a new data part `data-artifact` carries a version; old messages open their old version.
- `practice_plan` renders lane 6's printed page component (imported, not copied; stays light in dark mode).

Server: new `create_practice_plan` tool (under `askV2` and the practice builder flag) returns the plan draft as a `data-artifact`; it writes nothing. Save and Publish come in AK9 and need N-00 and N-10. (fixed 4 Nov: the draft tool is the practice-plan lane's `draft_practice_plan`, registered once and shared, because the confirm-gate test treats `create_` as a mutation prefix (practice-plan 02 §0.1 default 8); Ask registers no `create_practice_plan`. The pane renders `PracticePlanSheet`. Save and Publish need N-00 only; N-10 only if Nick flips folders.)

Flag note: BUILD_BRIEF names the builder flag `coachhelm_practice_plans_v1`; N-00 §0.5 names it `golf_practice_plans`. Resolve to one name before AK5 merges (section 18). (fixed 4 Nov: settled in DECISIONS: two flags. `coachhelm_practice_plans_v1` gates CoachHelm writing plans (the brief, the draft tool, the artifact); `golf_practice_plans` gates the Practice tab, Save and Publish. What Ask shows with either off is in 05 "Completeness pass, 4 Nov 2026" §CP-F.)

Risks: two lanes drawing one plan. AK5 imports lane 6's renderer; if it hasn't landed, the pane shows the design page's earlier layout behind a TODO and AK5 is not marked done.

Tests: version arrows; deep state restore on reload; phone push and back keeps the thread scroll.

Done when:
- the plan scene's artifact matches `04-FIDELITY-SPEC.md` "artifact writing", "pane open (desktop)", "push screen (phone)", light and dark, against lane 6's printed page for the plan body
- the pane clip (452px widen on the smooth spring) and the phone push match `07-MOTION.md`
- Save draft… and Publish… are visible but inert until AK9 (DOM: no network call on press with AK9 absent)

---

## 9. AK6: Shot reads and two blocks

### 9.1 Reads (new file `src/lib/coachhelm/v3/chat/shot-reads.ts`)
- `get_shot_pattern({player_id?, club_or_band, since_days})`: from `golf_shots` (columns verified in `src/lib/types/database.ts`: `miss_direction`, `distance_to_hole_before/after`, `distance_unit*`, `lie_before/after`, `club_type`, `is_penalty`) joined to the team's rounds in the window. Returns counts by the 8 allowed directions (the set enforced in `submit_round_atomic`, `20260821043500:360`), the distance-left distribution, inside 15 and 25 ft counts, lie split, and the count with no miss logged. Distances convert by unit.
- `get_proximity_by_band({player_id?, bands})`: average distance left by approach band (from `distance_to_hole_before`).
- `get_round_detail({round_id})`: hole by hole score, putts, penalties, GIR, shots.
- A putting mode of `get_shot_pattern` (`putt_distance_feet`, `putt_made`) by `PUTT_DISTANCE_BUCKETS` (`src/lib/golf/putt-distance-buckets.ts:27`: 0-3, 3-5, 5-10, 10-15, 15-25, 25+), team or player, any window. Today's `get_putting_distance_profile` reads the per-player stats cache (`golf_player_stats_cache`, `read-tools.ts:208`) with no window, so it can't draw "last 30 days" or the team.
- All team-scoped through `CoachChatContext` and `requireRosterPlayer`; all return window, sample and `as_of` like today's envelopes.

### 9.2 Blocks (`visuals/composition.ts`)
- `COMPOSITION_SCHEMA_VERSION` becomes 2; `ValidatedComposition` accepts `1 | 2`; v1 rows parse as today.
- New spec blocks `miss_pattern {ref}` and `putt_profile {ref, seasonRef?}`; resolved blocks carry only figures from the referenced envelope.
- `compile-composition.ts` resolves them; refuses when the ref isn't a shot read.
- Fairway's `CompositionVisual.tsx` must skip unknown block types; the new blocks are only offered when `askV2` is on and Clubhouse is on, so Fairway never receives them. A test proves Fairway's renderer ignores a v2 block.
- Client: `visual/blocks/MissPattern.tsx` (8 wedges plus dots by distance left; no map position, since shots store a direction and a distance only), `visual/blocks/PuttProfile.tsx` (make rate by bucket with the season tick).

Must not change: anything that writes `golf_shots`.

Tests: direction counting (null direction counted separately), unit conversion, band edges left-inclusive, empty window envelope; block compile refusal; renderer snapshots.

Done when:
- jonah and player scenes: the miss pattern matches `04-FIDELITY-SPEC.md` "miss pattern" (wedges, dots, legend) for the 64-shot fixture; putts scene: the putt profile matches "putt profile" with the bucket labels corrected to the Stats buckets (section 18)
- every figure on both blocks traces to a `03-DATA-CHECKS.md` row marked DERIVE with the query named
- a grep of the diff shows no write to `golf_shots`, `golf_rounds` or the round RPCs (SHARED-10)

---

## 10. AK7: Engine reads, calendar, course, seasons, and two blocks

New reads (new file `src/lib/coachhelm/v3/chat/engine-reads.ts`):
- `get_root_causes({player_id})`: the open causes the Board shows, from stored `golf_coach_insights.evidence.cause` (shape in `src/lib/coachhelm/v3/engine/root-cause.ts`, `diagnosis.ts`). Read with the same select as `get_player_insights` (`read-tools.ts:892`), not through `getInsightsForCoach`, which records `coach_feed` exposures (`insight-delivery.ts:1069`); a chat read must not count as the coach seeing the Board.
- `get_team_patterns()`: `src/lib/coachhelm/v3/team-pattern/pattern.ts`; registered only when `coachhelm_team_pattern_v1` is on (`team-pattern/flag.ts`, off).
- `get_calendar({from, to})`: events (`golf_events`), class conflicts (`golf_team_class_day` / `golf_class_exceptions` through `src/lib/calendar/conflicts.ts` and `availability.ts`), attendance (`golf_event_attendance`). Uses the team zone from `resolveTeamTimeZone` (`availability.ts:670-699`), per TASK_FIELDS rule 1.
- `get_course({course_id})`: `golf_course_tee_holes` (par, yardage, handicap_index) plus team scoring to par by hole (derived from rounds).
- `compare_seasons({metric_ids, player_id?})`: this season against last, with last season's usual range (mean plus or minus one standard deviation of round values; the method goes in the envelope's note).

Blocks: `season_compare {ref, lastRef}` and `hole_strip {ref}` (red only under par), same v2 rules as 9.2.

Risks: the CoachHelm canary (`runWithCoachHelmTeams`, `agent-tools.ts:264`) must wrap the engine reads like other reads.

Tests: no exposure row written by `get_root_causes` (spy on the exposure insert); calendar free-slot logic across DST; season band method.

Done when:
- trend scene matches `04-FIDELITY-SPEC.md` "season compare" and recap scene matches "hole strip" (red only on under-par holes, amber never used for over par on this block per the design)
- `get_root_causes` produces the jonah scene's "Approach is his open root cause" detail from the fixture insight, and records no exposure
- `get_team_patterns` is absent from the tool set with `coachhelm_team_pattern_v1` off

---

## 11. AK8: Tone and CoachHelm knows

- HM2 (held): `golf_coachhelm_chat_conversations` gains `tone text null check (tone in ('straight','detailed','team_talk'))`; new `golf_coachhelm_coach_facts (id, coach_id, team_id, text, created_at, updated_at)` with coach-only RLS, 280 characters, coach-written only.
- `instructions.ts`: tone adds one paragraph per tone under `askV2`; numbers and chips are identical across tones (test compares tool calls and figures for the same fixture turn).
- Facts load into the system prompt as "Standing facts the coach gave"; nothing the model infers is ever written (no write tool for facts; the list is edited in UI only via a server action `saveCoachFact`).
- UI: `History.tsx` gains the tone segmented control and the "CoachHelm knows" list on desktop (design: "Practice runs 2h 30m on weekdays", "Team goal: under +2 a round by spring", "Edit what it knows"); phone uses a settings sheet.

Until HM2 is applied: the tone and facts UI is hidden (column check), and tone defaults to Straight.

Done when: the history panel matches `04-FIDELITY-SPEC.md` "history with tone and knows"; a DB assertion shows no fact row is created by any chat turn; the same question in three tones returns identical tool calls and figures.

---

## 12. AK9: Practice brief and Save to a folder

- `ask_practice_brief` tool (no write): returns up to four questions with defaults from the turn's reads (free window from `get_calendar`, focus areas, slipped metrics), each option tagged with its source. Answers come back as the user turn. Never asks what a read answered (TASK_FIELDS rule 3).
- `parts/BriefCard.tsx`: one question at a time, dots, Back, Next, "Skip, just build", folds to answer pills with "Change answers". Lane 6 uses the same card.
- `parts/SaveCard.tsx`: docked above the artifact footer; "Save to [folder ⌄]" row, list in place, New folder with Create; the primary names the target.
- Server: `save_document(artifact_id, folder_id)` and `create_folder(parent_id, name)` are not model tools; they are server actions called by the Save card only. They call N-10's folder model (`20261026090200_golf_document_folders`, held) and N-00's plan save (`golf_documents.practice_plan_id`, `file_url` nullable, `20261026010400`, held). Undo removes the plan and a folder made here if left empty (same 8s hold as AK4). (fixed 4 Nov: to agree with the practice-plan lane, the Save card calls that lane's `savePracticePlanDraft({folder: name})` and `undoPracticePlanDraft`; there is no `save_document`, no `create_folder` and no second save path. (fixed 4 Nov: folders follow the practice-plan lane default 1: a folder is a name in today's free-text `golf_documents.folder`, 1 to 60 characters, trimmed; New folder is a new name on save; no folders table and no `create_folder`. If Nick flips to N-10's held `20261026090200_golf_document_folders`, the list becomes N-10's union of that table and the text values, and the card is unchanged). Save draft writes at once and Undo deletes the row and the plan (practice-plan default 9: a draft reaches nobody, so a delete is an honest Undo); it is not on the HM1 hold. Publish is the held step: it files at once and defers the push, bell and chat post until Undo closes (practice-plan default 3); Undo takes it back to a draft with `is_public` false and nobody told ("Taken back. Nobody was told."). If AK4 is in, its `DELETE` route calls `undoPublish` for `publish_practice_plan` runs.)
- Publish: confirm "Publish to 7 players"; files a copy in Practice plans; players told after Undo closes.

Until N-00 and N-10 are applied and their flags on: Save draft… and Publish… show "Comes with the practice builder" and do nothing. (fixed 4 Nov: until N-00 is applied and `golf_practice_plans` is on, they show the practice-plan lane's wording, "Comes with the Practice tab", and make no network call.)

Done when: the plan scene matches `04-FIDELITY-SPEC.md` "brief question 1 to 4", "brief folded", "save card list open", "new folder", "saved receipt", "publish told"; the folder clip (arc into the icon, squash, count tick) matches `07-MOTION.md`; DB: nothing in `golf_documents` before the Save press and nothing after Undo.

---

## 13. AK10a and AK10b: Player Ask and the weekly allowance

### 13.1 AK10a Player Ask (`coachhelm_player_ask_v1` on top of `coachhelm_ask_v2`)
- Route: `routes/coachhelm.tsx` player branch (224-233) gains `view === 'ask' && isPlayerAskEnabled()` before `playerHelmDrill`, rendering `<Ask role="player">` with the player's own loader (new `loadAskPlayer({playerId})` in `data/coachhelm-chat.ts`). Flag off, a player's `?view=ask` falls through to their board as today.
- Context: new `resolvePlayerChatContext(sb)` in `context.ts` (additive): signed-in player only; `player_id` from the session; `team_id` from the player's active team; roster reduced to the player.
- Stream route: when the session is a player, build `buildPlayerTools` (new `player-tools.ts`): `get_player_metrics`, `get_player_trend`, `get_recent_rounds`, `get_focus_areas` (own), `get_upcoming_events` (own invites), `get_shot_pattern` (own), `get_round_detail` (own rounds), `compare_seasons` (own), a player projection of insights (`src/lib/coachhelm/delivery/player-projection.ts`, never a guessed cause), and `show_visual`. Every tool overwrites `player_id` with the session's. No ranking, compare, team read, team pattern, write, brief or prefill tool. Team average comes back only as a benchmark figure with no names.
- Policy: player instructions say "you", tone Encouraging, and "never name another player".
- `useCoachHelmChat.ts`: one additive option `endpoint` (default today's `/api/coachhelm/v3/chat/stream`, line 33); the player stream is the same route with `role` from the session, so the option exists only to point previews at a fixture server.
- Persistence: HM3 (held) makes `golf_coachhelm_chat_conversations.coach_id` nullable, adds `player_id`, a CHECK that exactly one is set, and player RLS. Until applied, player Ask runs without saved history (new chat each visit) and the history panel is hidden.
- Cost: player turns are logged to `golf_coachhelm_llm_calls` with `player_id` set and `coach_id` null (both nullable today), task `coach_chat` (no CHECK change).

### 13.2 AK10b Allowance
- HM4 (held): `ask_usage_weekly (player_id, team_id, week_start date, cost_micros bigint, primary key (player_id, week_start))` and `ask_credit_requests (id, player_id, team_id, week_start, note, created_at, sent_at, unique (player_id, week_start))`, service-role write only, player may read their own bucket through a view that returns only `plenty | low | out`. (fixed 4 Nov wiring: written at `held-migrations/20261101090300_coachhelm_ask_allowance.sql` with no view: the cap is server config, which a view can't read, so the server returns only the bucket word and no client role reads either table; `cap_micros` holds a staff raise; `release_at` and `released_at` hold Request more's Undo.)
- `src/lib/coachhelm/v3/chat/player-allowance.ts`: `PLAYER_ASK_WEEKLY_CAP_USD = 5` in server config only; `bucketFor(used)`; `recordPlayerSpend` in the route's `onFinish` using the same `estimateCachedCostUsd` as `recordTurnCost` (route 1211-1262); week starts Monday in the team zone.
- Before a player turn: if out, skip the model and write one `data-allowance {state: 'out', resets}`.
- UI: `parts/AllowanceMeter.tsx` ("Ask this week · Plenty left · resets Monday", amber when low), `parts/OutCard.tsx`, composer paused with "Ask is paused until Monday", then "Need more before Monday?" and Request more.
- Request more: a confirm card on the kit (the one player write), `request_ask_credits` as a server action, held 8s like AK4 (fixed 4 Nov wiring: not on `golf_coachhelm_action_runs`, which is coach-only (`coach_id` NOT NULL, `coachhelm_action_runs_coach_only`); the hold is the HM4 row's own `release_at`, Undo deletes the row before it, release sets `released_at`), then sent once per week through Resend to a company address in server config (`ASK_CREDITS_TO`). Use the ops transport pattern (`src/lib/admin/digest/transport.ts`), not `notifications/email.ts`, because the recipient is the company, not a customer; confirm with Nick that this mail is outside `HELM_CUSTOMER_EMAIL_ENABLED`. (fixed 4 Nov: settled in DECISIONS: Request more follows `HELM_CUSTOMER_EMAIL_ENABLED` like every other app email. With it off, the `ask_credit_requests` row is written after Undo closes, `sent_at` stays null and no email goes; nothing to confirm with Nick.)

Done when (AK10a: first three items; AK10b: last three):
- player and limit scenes match `04-FIDELITY-SPEC.md` "player answer", "player home meter", "out card", "request more confirm", "request sent", light and dark, 390
- tool-set assertion: the player tool set has no key matching `^(create|set|add|draft|save|publish|request)_` and no `compare_players`, `get_team_metric_ranking`, `get_team_overview`, `get_team_rounds`
- DOM assertion on every player fixture answer: no roster name other than the player's own appears in text, chips, popovers or visuals, and no other player's id or figure appears in network responses (SHARED-11)
- AK10b: the meter shows only Plenty left, Low or out, with no amount
- no dollar sign, token count or percentage of allowance appears anywhere in the client bundle's Ask strings or responses (grep test on the payload)
- Undo inside 8s on Request more sends no email (spy) and leaves no `ask_credit_requests` row

---

## 14. AK11: Create flows

### 14.1 AK11a engine with event, task and round note
- New `parts/CreateFlow.tsx`: reads as steps, Worked out pills (each names its source), questions on `BriefCard` (one to three, never asking what a read answers), a live draft visual per flow, the kit confirm with an "On confirm:" line, a `HomeMock` landing, receipt with Undo, Told row.
- New `src/lib/coachhelm/v3/chat/create-tools.ts`: one tool per flow, each on `proposeGated` / `executeGated` and joined to `CONFIRM_REQUIRED_TOOLS` only under `askV2`. Planners live in `create-planners.ts`, field by field from TASK_FIELDS §5.
- `create_event` calls `createGolfEvent` (`calendar-events.ts:537`), always sending `allDay` and the offset (TASK_FIELDS §7.3). Free slot from `get_calendar`. No per-event reminder field (team setting only).
- `create_task` stays the existing tool with the TASK_FIELDS §7.5 fixes behind `askV2` (priority `low | normal | high`, category, assignees in the key). Reminder via `golf_task_reminders`.
- `add_round_note` calls `saveRoundCoachNote` (`round-coach-note.ts:101`). That action replaces `coach_notes` (update at line 66 of the file). The planner reads the existing note and the draft shows it, appending "Hole 13: …" below it; Undo restores the old text. The player always sees it; the "share now or keep private" question is dropped.

### 14.2 AK11b announcement, travel, qualifier, goal, quiet flows
- Announcement flow uses AK4's announcement tool with the Create shape; questions are Got it and urgency (Normal or Urgent); "later" and "linked trip" are dropped (no write path for `publish_at`, no trip column).
- `create_trip` calls `createGolfTravelItinerary` (`travel.ts:295`): `transportation_type`, `departure_*`, hotel fields, `room_assignments` (json), `gear_list` (array), `uniform_requirements` (text). Leave time from the tournament read only when `golf_tournaments_v1` is on; otherwise ask.
- `create_qualifier` calls `createGolfQualifier` (`qualifier-actions.ts:349`); asks rounds, squad size and coach's picks (`selection_slots_total`, `selection_slots_coach_pick`); exemptions and tie rule are dropped (no fields).
- `create_goal` calls `createGoal` (`v3/goals.ts:312`); eight stats only; "Assign it, or suggest it?" maps to `coach_assignment_mode`.
- Quiet flows on the same engine, no new visual: `addCoachBlockedTime`, `addTeamBreak`, `saveTeamTerm`, `setPlayerAvailabilityCoachNote`, `createRecruit` (paths in TASK_FIELDS §4).

### 14.3 AK11c board and poll (drafts only)
- `prefill.ts`: `ChPrefill` gains `conversationId?`, `poll? {question, options[], closes?}`, `attachment? {kind: 'board', pngKey}`; still sessionStorage only, key hash covers the new fields; `takePrefill` validates them. The Messages composer reads them through its existing `takePrefill` call.
- `draft_board` renders the board client-side to a PNG, stores it in sessionStorage-backed blob storage for this tab only, and opens the player's thread with it attached in the composer. `draft_poll` opens the team chat composer with the poll draft; the coach presses Post, which calls `sendGolfPoll` (`message-polls.ts:175`).
- Neither tool is in `CONFIRM_REQUIRED_TOOLS` and neither has an `execute` that writes; their result is a prefill href.
- Poll delete is broken in production until held `20261028140800_golf_messages_deleted_poll_payload_check.sql` is applied; the poll flow stays off until then.

### 14.4 AK11d lineup
- `set_lineup` registered only with `golf_tournaments_v1`; calls `golf_tournament_set_entries(p_id, p_entries, p_version)` (fixed 4 Nov wiring: through the existing server actions `setTournamentEntries(id, entries, version)` (`src/app/golf/actions/tournaments.ts:357`, impl 188, zod max 20 entries, slot 1 to 9) and `lockTournamentLineup(id)` (:361, impl 195), never the raw RPC, so `asCoach` and `revalidatePath` run as on the Tournaments screen); lands "Lineup set". Lock is a second confirm card calling `golf_tournament_lock_lineup(p_id)` with no Undo (the card says so). The tie for the last spot is the only question.

### 14.5 AK11e drill
- `create_drill` built, registered only when a drill-bank check passes (HM5 applied: `golf_drills.team_id` exists). Otherwise the gallery shows "Drill bank comes with the practice builder". (fixed 4 Nov: one drill bank. The drill flow writes N-00's `golf_team_drills` (held `20261026010100`, coach-only, archive not delete, `copied_from_drill_id` for a GolfHelm library drill), the same bank the practice-plan lane reads. HM5 is superseded; Ask's drill flow waits on that held migration). The check is `to_regclass('public.golf_team_drills')` not null (the same check the practice-plan lane runs, its 03 check F); the write fills `name`, `area`, `kind`, `minutes`, `setup`, `goal` and `copied_from_drill_id` when it starts from a library drill; a name already used in the team's live bank (unique index on `lower(btrim(name))`) is a failed write with "You already have a drill called {name}. Rename this one." Until the table exists the gallery shows "Drill bank comes with the Practice tab".

Risks: every create tool must re-check `team_id` at execute time (the coach may switch teams between card and press; TASK_FIELDS 5.3). Name resolution only by roster id (TASK_FIELDS rule 2).

Tests: per flow, planner field tests from TASK_FIELDS §5; gate tests (no write before press, Undo cancels, Told after window); board and poll tests assert no call to `sendGolfPoll`, `sendMessage` or any insert into `golf_messages` from Ask code paths (spy and grep).

Done when (each flow):
- its design scene (f_event, f_annc, f_travel, f_board, f_poll, f_qual, f_lineup, f_task, f_goal, f_note, f_drill) matches its state links `#h-make?play=f_<flow>&stage=` reads, worked, brief, brief-done, draft, confirm, adding, receipt, told, undone and cancelled, as named in `04-FIDELITY-SPEC.md`, with the copy changes in section 18 of this file applied
- its motion clip matches `07-MOTION.md` for that flow; Reduce Motion column matches
- DB: no row before the press; Undo inside 8s leaves no row and no notification; Told only after the window
- board and poll: the receipt says "Nothing is sent until you tap Send"; no `golf_messages` row exists after the flow; the composer holds the draft
- lineup absent with `golf_tournaments_v1` off; drill absent until HM5 (fixed 4 Nov: until N-00 `20261026010100` is applied)
- per PR: AK11a when f_event, f_task and f_note pass; AK11b when f_annc, f_travel, f_qual, f_goal and the five quiet flows pass; AK11c when f_board and f_poll pass; AK11d when f_lineup passes with the flag on and is absent with it off; AK11e when f_drill passes in the preview and the tool is absent in every environment without HM5

---

## 15. AK12: Capture and fidelity

- Playwright block `ask-v2` in the Clubhouse quality spec: every named state in `04-FIDELITY-SPEC.md` at 390, 430, 1440; light and dark; Reduce Motion; Text Size XXL; flag-off parity screenshots of today's Ask.
- `capture/` script entries for each scene and flow; clips for each motion in `07-MOTION.md`.
- Eval: 30 fixture questions; measure read-chip marker coverage (target: every sentence with a figure carries a marker) and claim audit pass rate unchanged from flag off.
- a11y: axe on every state; focus order through brief, confirm, Undo; live regions announce step changes once.

Done when: every state in `04-FIDELITY-SPEC.md` has a shot pair and a verdict; every component in `05-SCREENS.md` is covered by at least one state; every motion in `07-MOTION.md` has a clip pair; flag-off parity shows zero pixel diff on today's Ask states.

---

## 16. Held migrations (written, registered HOLD in `HELD.md`, never run)

| # | File (proposed name) | What | PR | Without it |
|---|---|---|---|---|
| HM1 | `20261101090000_coachhelm_action_runs_hold.sql` | `run_at`, statuses `held` and `cancelled` on `golf_coachhelm_action_runs` | AK4 | `coachhelm_ask_v2` stays off; writes behave as today (fixed 4 Nov wiring: until now only described; written at `ask/held-migrations/20261101090000_coachhelm_action_runs_hold.sql`, plus a held-needs-run_at CHECK and a sweep index; RLS unchanged) |
| HM2 | `20261101090100_coachhelm_ask_tone_and_facts.sql` | `tone` on conversations; `golf_coachhelm_coach_facts` | AK8 | tone and knows hidden (fixed 4 Nov wiring: written at `ask/held-migrations/`; four coach-only policies `golf_coachhelm_coach_facts_{select,insert,update,delete}`) |
| HM3 | `20261101090200_coachhelm_player_ask_conversations.sql` | nullable `coach_id`, `player_id`, one-owner CHECK, player RLS | AK10a | player Ask without saved history (fixed 4 Nov wiring: written at `ask/held-migrations/`; player policies `golf_coachhelm_chat_conversations_player_*` and `golf_coachhelm_chat_messages_player_*`, one per command) |
| HM4 | `20261101090300_coachhelm_ask_allowance.sql` | `ask_usage_weekly`, `ask_credit_requests`, bucket view | AK10b | player Ask stays off (no cap, no ship) (fixed 4 Nov wiring: written at `ask/held-migrations/`; no bucket view, service role only, restrictive deny per command) |
| HM5 | `20261101090400_golf_drills_team_bank.sql` | `team_id`, `created_by`, `is_global`, `player_visible`, coach write policies on `golf_drills` | AK11e | drill flow off (dropped if N-00 §8.3 ships its own) (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration). Not written in AK11e; do not register it in `HELD.md` |

Dependencies held by other lanes, not written here: N-00 `20261026010000` to `010800` (practice plans, `golf_documents.practice_plan_id`, nullable `file_url`), N-10 `20261026090200_golf_document_folders`, and `20261028140800_golf_messages_deleted_poll_payload_check.sql` (polls). Each file gets a `-- STATUS: WRITTEN, NOT APPLIED (HOLD)` header, rollback line, `-- VERIFY:` query and a pgTAP file under `supabase/tests/rls/`, not run.

---

## 17. Risks (cross-PR)

1. Fairway shares the engine. A tool or block added without the `askV2` and Clubhouse gate reaches Fairway's chat. Each PR has a test that builds the tool set with `askV2` false and compares keys to 75b4956.
2. The Undo hold changes when a write happens, not what it writes. Any caller other than Ask (Fairway, quick chat) keeps immediate writes until it opts in.
3. Read-chip markers are model behaviour; coverage is measured, not assumed (AK12).
4. Player privacy: one leak path is a team read returning names. The player tool set is an allowlist, and the DOM test scans every fixture answer for roster names.
5. Two lanes share parts (quick chat, practice builder). `parts/` exports are the contract; changes after AK4 need the other lanes' sign-off in the PR.
6. Composition v2 must not break stored v1 messages (restore test with a v1 fixture).

---

## 18. Spec corrections

Places where `ASK_REDESIGN.md` (and in two cases `TASK_FIELDS.md`) doesn't match the code at 75b4956. Each is applied in the PR named.

1. Lift: "Lift has no table yet" is not right. Lift Lab tables exist (`helm_lifting_*`), but they are organisation-scoped with no link to golf teams. The flow waits on that link, not a table. Same outcome: no Lift flow. (AK11)
2. Lineup RPCs are `golf_tournament_set_entries(p_entries, p_id, p_version)` and `golf_tournament_lock_lineup(p_id)`, not `lock_lineup`. The lock can't be undone, so it is a second confirm without Undo, and the flow lands "Lineup set". (AK11d)
3. Folders: there is no folders table. `golf_documents.folder` is free text and `file_url` is NOT NULL. `create_document_folder` and `save_practice_plan(folderId)` don't exist; they come from N-10 and N-00, both held. (AK9)
4. Drills: besides no `team_id`, `golf_drills` has only a SELECT policy, so coaches can't insert drills at all today. HM5 adds write policies too. (AK11e) (fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration)
5. `intel/causes/*` is UI (`src/components/golf/coachhelm/intel/causes/`). The engine is `src/lib/coachhelm/v3/engine/root-cause.ts`. The Board's loader records exposures, so `get_root_causes` reads stored evidence directly. Team patterns sit behind `coachhelm_team_pattern_v1` (off). (AK7)
6. Putting bands: no "3 to 6 ft" band exists. Stats uses 0-3, 3-5, 5-10 ft (`putt-distance-buckets.ts`). The design's copy changes to "3 to 5 ft", so the figures match the Stats page. (AK6)
7. Strokes gained baseline: the SG metrics are "against the expected-strokes baseline" (`metrics-catalog.ts`, method `sg_per_round_vs_broadie_baseline`), not "team average". The design's "0 = team average" and "Baseline: Team average" change to "0 = scoring baseline". A team-average comparison is a separate figure. (AK6, AK10a)
8. Announcements: every announcement pushes and emails (email only while the customer email switch is on), whatever its urgency. "Normal: in Messages only" and "No push" are wrong. Urgency is Normal or Urgent; "Important" isn't a value. There's no scheduled send and no trip link. Recipients are players only, so "7 players and 2 coaches" becomes "7 players". (AK4, AK11b)
9. Undo hold: TASK_FIELDS §3 and §7 say no migration is needed, but the ledger has no `run_at` and its status CHECK has no `held` or `cancelled`. HM1. (AK4)
10. Round note: `saveRoundCoachNote` replaces `coach_notes`, so a new note would wipe the old one. The flow appends and Undo restores. Notes have no hole field and no visibility field. (AK11a)
11. Qualifier: no exemption or tie-rule fields on `golf_qualifiers` (the tie rule the design reads is the target tournament's `golf_tournaments.tiebreak`, which the flow may show as a Worked out pill but can't write to the qualifier). Goal: acceptance is `coach_assignment_mode` (mandatory or suggested). Event: no per-event reminder. (AK11a, AK11b; same as TASK_FIELDS §6)
12. Messages prefill carries players, draft and title only. Board and poll need `conversationId`, `poll` and `attachment` added. Poll delete needs held `20261028140800`. (AK11c)
13. Surfaces and motion: `--shadow-recv` and the `send`, `pop`, `lift` springs aren't in the repo. `lib/motion.ts` has only `smooth`, `settle`, `reveal`. Messages 11a adds `--ch-bubble-theirs-shadow` and `--ch-ease-spring-send/pop/lift`, and Ask uses those names. (AK0)
14. Player Ask storage: conversations are coach-owned (`coach_id` NOT NULL) and the daily budget is coach-keyed, so player history needs HM3. The allowance table is new, as the spec says. (AK10)
15. Mail: helmv3 sends with Resend. Customer mail is gated by `HELM_CUSTOMER_EMAIL_ENABLED`. Request more goes through the ops transport to a company address, and Nick confirms which side of the gate it sits on. (AK10b) (fixed 4 Nov: settled, it follows the gate; off means logged, no email.)
16. Practice: no practice reviews table exists. `golf_practice_sessions` holds player shot logs, and plans are N-00's (held). The builder flag is named two ways (`coachhelm_practice_plans_v1` in BUILD_BRIEF, `golf_practice_plans` in N-00). Pick one. (AK5) (fixed 4 Nov: settled, two flags with two jobs, DECISIONS "Practice Builder".)
17. Compositions are versioned (`COMPOSITION_SCHEMA_VERSION = 1`), and Fairway draws them too. New blocks need v2 with v1 still parsing. (AK6)


## Completeness pass, 4 Nov 2026

What the pass changed in this plan, and where each new piece lands. In-place corrections above carry `(fixed 4 Nov: ...)`. The new IDs, rules and checks live in 05, 06, 07 and 08 under the same heading.

| Change | Where in this plan | PR |
|---|---|---|
| One drill bank: Ask writes N-00 `golf_team_drills` (20261026010100). HM5 is superseded, not written and not registered in HELD.md | hard rules, §0, §2.6, §14.5, §16, Done when | AK11e |
| Folders are names (`golf_documents.folder`), practice-plan default 1; Save writes at once through `savePracticePlanDraft`, Undo through `undoPracticePlanDraft`; Publish files at once and tells after Undo, Undo is `undoPublish` | §2.8, §12 | AK9 |
| `draft_practice_plan` replaces `create_practice_plan`; the pane renders `PracticePlanSheet` | §8 | AK5, AK9 |
| Two flags settled: `coachhelm_practice_plans_v1` and `golf_practice_plans` | §8 flag note | AK5, AK9 |
| `askAboutHref` and `askAboutReadHref` exported from `chat/ask-links.ts` for the Read, Team and Lenses lanes | new | AK2 |
| Stop mid-words, dropped stream, jump key, composer text per chat, mid desktop layout 821 to 1279 | new | AK1 |
| Release failed, undo late, two-device receipts | new (extends §7) | AK4 |
| Execute-time re-check returns the changed field and the draft redraws | extends §14 | AK11a |
| Per-flow failed and partial copy | new | AK11a to AK11e |
| Quiet flows q_block, q_break, q_term, q_avail, q_recruit get IDs and all kit stages | extends §14 | AK11b |
| History paging (30) and the chat-gone state | extends §10 | AK8 |
| Keyboard, focus ring, Esc layers, VoiceOver labels | new | AK12 (built in each PR, checked in AK12) |
| Request more already sent this week | extends §13 | AK10b |

Gate recap: f_drill waits on N-00 20261026010100 only; Save, Publish and Edit in builder wait on N-00 010000 to 010600 and `golf_practice_plans`; nothing in Ask waits on N-10.

### Added by the lead (cross-lane with Messages, 4 Nov)
- **AK11c prefill origin.** `ChPrefill` gains `returnTo?: 'ask'`. Messages honours it once: its back key returns to the Ask conversation that wrote the prefill, then the field is cleared, so a second Back goes to the inbox. Without it, Messages' back key goes to the inbox (messages 05 S-MSG.prefill). Browser back returns to Ask either way.
- **Fresh prefill per tap.** Messages reads a prefill key once. Every tap on a receipt's "Open" (board, poll, message) writes a new `ch.messages.prefill.<key>` from the stored draft, so a second tap works.
- **Acknowledgement wording.** The coach's announcement count uses Messages' (today's) wording, "n of N acknowledged", never "Got it n of N".
- **AK9 event first (with practice-plan 02 §C.6, 4 Nov).** A plan needs a practice event (`golf_practice_plans.event_id` NOT NULL). When the plan's day has no practice event, the order is reversed from the drawing: the thread shows the event confirm (S-ASK.flow.plan.confirm, TASK_FIELDS §5.1) first, and Save turns on once the event commits (Open or Save commits its hold early). Undo on the event inside its 8s removes the plan draft too: "No practice, so no plan was made." When the day already has a practice event, Save works as drawn and "Want it on the calendar?" is not offered. An all-day or cancelled practice can't take a plan (CH-17110, CH-17117).

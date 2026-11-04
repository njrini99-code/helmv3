# CoachHelm practice plans (lane 6): file-by-file build plan

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 29 rows).

The design page `coachhelm-practice.html` (in this folder; artifact N8XKShSAhyL1foRtUfiqz5) and `COACHHELM_PRACTICE_PLAN.md` give the values: sizes, colours, words, motion and states. This file says where they go and in which PR. `COACHHELM_PRACTICE_PLAN.md` §9 ("Where it lands") is replaced by this file: on a file, a line or a tool name, this file wins. Where this file and `03-DATA-CHECKS.md` disagree on a figure's source, the data checks win. Shared pieces follow `../coachhelm/AGENT_KIT.md` (kit ① to ⑦) and `../DESIGN_LANGUAGE.md`.

Repo `njrini99-code/helmv3` at `main` 75b4956 (Oct 31). The clone is shallow, one commit, read only. Paths are under `src/clubhouse/` unless they start with `src/`, `config/`, `supabase/`, `scripts/`, `docs/` or `e2e/`. Line numbers are at 75b4956. Lines drift, so find code by name first.

Sources:
- the design page and `COACHHELM_PRACTICE_PLAN.md` (this folder)
- Nick's asks of Oct 31 and his 14:29 note: printed plan, groups, plan format, learning, no why lines for players, keep it simple
- the settled calls in `COACHHELM_PRACTICE_PLAN.md` §11:
  1. ships with the Practice tab
  2. players never see why lines
  3. a draft shows in Documents as "Only coaches"
  4. drills come only from the bank and the library
- `../coachhelm/AGENT_KIT.md` (lane 6 notes, lines 115-120), `../ask/ASK_REDESIGN.md`, `../ask/02-PLAN.md` (Ask lane, PRs AK0 to AK12)
- `build-plans-2/N-00-practice-plan-builder.md` (v2, Oct 25: "Plan. Nothing built. Nine held migrations, none applied.")
- the acceptance draft `redesign-package-src/acceptance/practice-builder.md`. Its PB1 to PB8 groups are replaced by PP0 to PP9 (§16).
- the code map of Oct 31, rechecked for this file

Screen ids follow the coordinator's `05-SCREENS.md` families: S-ASK (Ask on the phone), S-ASKD (Ask on the Mac), S-FMT (plan format), S-BLD and S-BLDD (builder on the phone and Mac), S-PLY (player), S-DOC (Documents and the printed page). The coordinator has confirmed these families. 05-SCREENS.md is the reference for each screen's exact id.

Hard rules this plan keeps:
- one release flag, `coachhelm_practice_plans_v1`, off in production, preview and development. With it off, every surface renders and behaves exactly as at 75b4956.
- **no migration is applied.** This lane's one new table, `golf_practice_plan_formats`, is written as a held file (§14). Everything that needs N-00's held migrations stays inert until they are applied.
- draft PRs only: no push to main, deploy or flag flip
- nothing is written before the coach presses a named button:
  - the model can draft, but it never saves or publishes
  - Save draft is a coach press (no model tool)
  - Publish is a confirm-gated tool
- nobody is told anything until Undo has closed. Undo never has to take a notification back.
- players never see a Why line, an Aim, a source chip or a teammate's figure. That holds in the DOM, in the payload the player's browser receives and in any file a player can download.
- drills come only from `golf_drills` (the GolfHelm library) and, once N-00's held migration is applied, `golf_team_drills`. A drill is never invented. When nothing fits, the card says so and offers New drill.
- every number in a Because comes from a read in the same turn (claim audit). A block that fails shows "Lean read". Routine blocks say "Routine. No claim."
- shot tracking is untouched: this lane only reads `golf_rounds`, `golf_holes` and `golf_shots`
- green phone bar, desktop sidebar and glass top bar unchanged
- amber for losses and gaps, never red in the agent UI
- no accent left borders, no gradient text
- shared springs only, each with its Reduce Motion version
- transform and opacity only, except FLIP heights

---

## 0. PR order

**Read this first: most of this lane cannot ship on its own.** Saving, publishing, the builder helper and the player page need N-00's Practice tab slices 1 to 5 and its held migrations `20261026010000` to `20261026010800`. At 75b4956 none of that exists: no `screens/practice/`, no `golf_practice_plan*` table or RPC, no `golf_practice_plans` flag (grep over the whole tree finds nothing). Settled call 1 says the lane ships *with* the Practice tab, right after slices 1 to 5. The PRs below are cut so the parts that don't need N-00 land first, behind the flag, and the rest wait.

| PR | Contents | Screens (rough) | Depends on | Can land before N-00? |
|---|---|---|---|---|
| PP0 | flag; lane model types; fixtures (Demo University Golf, Thu Nov 5, groups A/B/C, 9 players, 2 coaches); preview routes; the shared printed component `PracticePlanSheet` (coach and player copy) | S-DOC.sheet-coach, S-DOC.sheet-player, S-ASK.full-plan (static), S-ASKD.pane (static) | none | **yes** |
| PP1 | step labels; four new read tools (class times, drill bank, team strokes gained, team putting by band); mini pictures in Thread's Work list | S-ASK.thread, S-ASK.steps, S-ASK.read-pictures, S-ASK.stopped, S-ASKD.thread, S-ASKD.steps | PP0 | **yes** (tools behind the flag) |
| PP2 | Ask first card (kit ⑥), shared with the quick chat; the turn pauses and resumes with the answers | S-ASK.intake, S-ASK.intake-folded, S-ASKD.intake | PP1 | **yes** |
| PP3 | `draft_practice_plan` (first 'draft' class tool); `practice-plan-block` parts; plan card writes itself; why rule; refine chips and versions; block sheet and swap; desktop pane at 452px | S-ASK.plan-card, .why, .evidence, .refine, .block-sheet, .swap, .full-plan, S-ASKD.pane, .pane-v2 | PP0, PP1, PP2; Ask AK5 if landed | **yes** for the draft. Drill ids are checked against `golf_drills` only until `golf_team_drills` exists. Save and Publish stay inert. |
| PP4 | Save to a folder (kit ⑦), draft receipt, Undo | S-ASK.save-to, .saved, .failed, .undone, S-DOC.list-draft | PP3; N-00 010000, 010400, 010500 applied and slice 3 | no |
| PP5 | `publish_practice_plan` (confirm-gated); confirm card; 8s Undo; push and bell after Undo closes; team chat text post; Told and Seen | S-ASK.publish-confirm, .published, .cancelled, S-ASKD.publish, S-DOC.list-shared | PP4; N-00 010600 applied and slice 3 | no |
| PP6 | Print and PDF of `PracticePlanSheet` (`@media print`, Share PDF on the phone) | S-DOC.print-coach, S-DOC.print-player, S-ASK.share-pdf | PP0 (PP3 for a live draft) | **yes** (prints the in-memory draft) |
| PP7 | Plan format: upload, scan steps, "Here's your format", set receipt; held migration `golf_practice_plan_formats` | S-FMT.empty, .upload-sheet, .reading, .found, .see, .set, .undone | PP1, PP3; this lane's held migration; N-00 slice 1 for the Practice › Plan format entry | upload yes (`uploadTeamDocument` exists); setting the format no |
| PP8 | Builder helper: helper card per step, ghost blocks (Keep / Swap / Remove, Keep all), New plan sheet's Ask CoachHelm | S-BLD.new-sheet, .helper, .ghosts, .kept, S-BLDD.board, .inspector | PP2, PP3; N-00 slices 1 and 2 | **no, blocked** |
| PP9 | Player side: notification copy, player Practice page with only their group's stops; player copy of the sheet | S-PLY.notify, S-PLY.practice, S-PLY.plan, S-PLY.docs | PP5, PP0; N-00 slice 3 (PlanPage, player Practice home) and slice 4 (Now/Next) | no |

That is ten PRs. Order of landing:
- PP0, PP1, PP2, PP3 and PP6 can land now, behind the flag.
- PP7 can land its upload and reading steps now. "Use this format" waits for its held table.
- PP4 and PP5 land after N-00 slice 3 and its migrations.
- PP8 lands after N-00 slices 1 and 2.
- PP9 lands after N-00 slices 3 and 4.
- With the flag on and N-00 absent, the Save and Publish buttons show "Comes with the Practice tab" and do nothing. That is the same inert state the Ask lane uses in AK9, and a DOM test checks that pressing them makes no network call.

### 0.1 Defaults (each one Nick can flip)

1. **Folders.** Default (Nick can flip): folders use today's free-text `golf_documents.folder` column. No folders table and no `create_document_folder`; a new folder is a new name on save. So when Undo deletes the plan, no empty folder can be left behind. The flip is N-10's held `20261026090200_golf_document_folders`. The Ask lane's AK9 builds against that one, so the two lanes must agree before PP4 (§13).
2. **PDF.** Default (Nick can flip): PDF is a browser print of `PracticePlanSheet` with `@media print`, the pattern Calendar, RoundCard and the qualifiers already use. No server PDF and no new library. `jspdf` and `html2canvas` stay unused here. On the phone, "Share PDF" opens the print sheet, which offers Save to Files and Share on iOS.
3. **Publish Undo.** Default (Nick can flip): the 8s Undo lives on the receipt as an `onExpire` timer, following `screens/coachhelm/Proposals.tsx:75-100`.
   - The plan is filed when the coach confirms ("it files in Documents now").
   - The server sends the push, the bell and the chat post only after the window, as a deferred send keyed to the action run, so Undo never has to un-notify.
   - The state lives in `golf_coachhelm_action_runs.result` (jsonb), so it needs no migration (§7.3).
4. **Team chat post.** Default (Nick can flip): the post is a plain text message with the plan's title, time and a link, because Clubhouse Messages draws only text and polls today. The rich plan card (`golf_messages.kind = 'practice'`, N-00's `PlanCard.tsx`) waits for the Messages lane.
5. **Notification copy.** Default (Nick can flip): one push and one bell row per player, Events category, worded like this:
   - title: "Practice plan for Thursday"
   - body: "2:00 PM · You start on the putting green with Group B"
6. **Plan format storage.** Default (Nick can flip): the uploaded sample is a Documents row in the private `documents` bucket. The parsed sections live in `golf_practice_plan_formats`, which is a held migration.
7. **What players see.** Default (Nick can flip): players see the focus, their group and their stops. They don't see the Aim or the Why. This closes the acceptance draft's open PB-PLY-05.

Defaults this plan adds because the code forces a choice:

8. **Tool names.** Default (Nick can flip):
   - one draft tool, `draft_practice_plan`, which the Ask lane registers too, in place of its planned `create_practice_plan`. The confirm-gate test treats `create_` as a mutation prefix and requires every mutation to be gated (§5.1), so a write-free `create_practice_plan` would fail CI.
   - one question tool, `ask_practice_brief`. That is the Ask lane's AK9 name, used here with this lane's one-card shape.
9. **Draft save.** Default (Nick can flip): Save draft writes at once and Undo deletes it. A draft reaches nobody, so a delete is an honest Undo. Publish is the step held for 8 seconds.
10. **The player marked "can't".** Default (Nick can flip): a player whose RSVP is declined for that practice is put in no group and is not told. The plan is still in Documents for them. That makes "Tells 9 players and 2 coaches" and the page's "9 going, 1 can't" add up (03 §3).
11. **Where the sheet lives.** Default (Nick can flip): `PracticePlanSheet` lives under P013 (`screens/coachhelm/plan/sheet/`) until N-00 creates page 17. N-00's `PlanPage.tsx` then renders this sheet instead of a second plan body, and a later pure-move PR may move it to `screens/practice/`.
12. **Flags.** Default (Nick can flip): two flags with two jobs. `golf_practice_plans` (N-00) gates the Practice tab. `coachhelm_practice_plans_v1` gates CoachHelm writing plans. PP4, PP5, PP8 and PP9 check both. This answers the Ask lane's correction 16 ("pick one").

### 0.2 Every PR must

- run `npm run clubhouse:catalog`. CI runs `npm run clubhouse:catalog -- --check` in `.github/workflows/clubhouse-quality.yml:79`, which writes `preview/component-catalog.json`. Regenerate it after every rebase, and never edit it by hand.
- run `npm run clubhouse:css`. It checks that no new transition touches layout properties, there is no `transition: all`, and outer shadows use a `--ch-*` token (CI `clubhouse-quality.yml:81`).
- run `npm run flags:check` (PP0 also runs `npm run flags:generate`; CI `ci.yml:362`)
- run `npm run clubhouse:check` (`package.json:71`): fresh-tree rules, the `CH-####` code catalogue, the changelog gate, VERIFY screenshots and links. New codes go in `docs/clubhouse/catalog/coachhelm.md` in a new `CH-1395x` block, or the 17xxx block once N-00 registers page 17.
- keep `playwright.clubhouse.config.ts` green: testMatch `clubhouse-quality.spec.ts` and `clubhouse-playground.spec.ts`, on chromium and webkit, with motion no-preference and reduce
- pass `npm test`, then `npm run lint`, then `npm run typecheck` once at the end
- add a changelog fragment, which `scripts/clubhouse/changelog-gate.mjs` checks:
  - `docs/clubhouse/pages/P013-coachhelm/changes/<date>-<slug>.md`
  - plus one in `docs/clubhouse/changes/` for any shared `ui/`, `lib/`, `shell/` or `styles/` file outside the P013 stems
- keep the confirm-gate and progress-label tests green with the flag mocked **on** as well as off (§5.1). A new tool that is missing a label or a class fails CI.
- with the flag off, `buildCoachTools` must return the same tool keys as at 75b4956: 17 reads, `show_visual` and the four writes. One test asserts this for each PR. The engine also serves Fairway's chat, so every new tool is registered only when the flag is on and Clubhouse is on for the team.
- add or update the preview state for every screen the PR touches, and attach side-by-side shots against the page's `data-run` states at 390 and 1440, light and dark, Text Size XXL. Attach clips for each motion row from `COACHHELM_PRACTICE_PLAN.md` §7 that the PR touches, with and without Reduce Motion.
- add no migration file except PP7's held one, which is registered HOLD in `supabase/migrations/HELD.md`

---

## 1. Files that must NOT change (all PRs)

| File | Why |
|---|---|
| `shell/TopBar.tsx`, `shell/ClubhouseFrame.tsx`, `shell/phone-chrome.tsx`, `shell/PhoneScreen.tsx`, `ui/PhoneBar.tsx` | The green phone bar, the pushed bar and the desktop chrome stay as they are. The phone full plan uses `PhoneTop back title` like other pushed views. |
| `shell/AskSheet.tsx`, `shell/AskSheetBody.tsx`, `shell/PushAsk.tsx`, `shell/push-ask.ts` | Lane 5 (quick chat) owns them. The quick chat gets the Ask first card by importing it from `parts/`. This lane doesn't edit lane 5's files. |
| `src/components/golf/coachhelm/chat/*` (Fairway chat, `useCoachHelmChat.ts`) | Fairway's chat. The hook is imported as is. PP2 needs no hook change, because the answers go back as a normal user message (§4.2). |
| `src/lib/coachhelm/v3/chat/action-planners.ts` existing exports | Today's four planners keep their behaviour. The publish planner goes in a new file. |
| `src/app/golf/actions/announcements.ts` | The push and bell pattern is copied into a practice fan-out module, not changed. `createEnrichedAnnouncement` inserts and fans out in one call (619-678), so it can't be deferred without changing it. |
| `src/app/golf/actions/documents.ts` existing exports | Called, not edited. The one exception is PP4's fallback (§6.4): an additive optional `folder` on `saveTextDocument`'s options, where old calls behave the same. |
| `src/lib/notifications/push.ts`, `in-app.ts`, `class-hold.ts` | Called only. Class holds still apply to practice pushes (§15). (fixed 4 Nov wiring: one additive exception, made in N-00 slice 3, not here: `practice_plan` joins the `NotificationType` union in `types.ts:5`, `pushDeliveryKeyFor` (`push.ts:43`) gains `case 'practice_plan': return 'push_events'`, and `generatePushPayload` (`push.ts:100`) gains a `practice_plan` case that uses the caller's `title`, `body` and a `/golf/...` `url`. Without them the push ignores the Events switch (the `default` returns null, "always sends") and opens the app root.) |
| `data/class-day.ts`, `data/class-day-shape.ts`, `data/classes.ts` | Class awareness lane (P-10). The chat tool has its own read in `src/lib`, because `src/lib` code may not import `src/clubhouse` (`agent-tools.ts:177-181`). |
| `src/hooks/golf/use-shot-tracking.ts`, `src/components/fairway/pages/rounds-tracking/*`, `screens/rounds/*` capture, `submit_round_atomic` | Shot tracking. This lane only reads `golf_rounds`, `golf_holes` and `golf_shots`. |
| `styles/tokens.css` | The tokens come from BUILD_BRIEF PR 1 and Messages 11a. The group tokens `--gA`, `--gB` and `--gC` are scoped inside this lane's sheet CSS, not added to the global tokens (§2.6). |
| `lib/motion.ts` | Import `CH_SPRINGS` (`smooth`, `settle`, `reveal`, lines 59-63) and `chSpring` (77) only. Any new spring comes from Messages 11a. |
| `ui/Toast.tsx` | The 8s Undo ring lives on the receipt, not on a toast (§7.4), so `DISMISS_MS` (80) keeps 4000 and 8000. |
| `styles/coachhelm-ask.css`, `styles/coachhelm-thread.css`, and the Ask lane's `styles/coachhelm-ask-v2.css` | Every rule this lane adds goes in its own `styles/coachhelm-plan.css`. |
| `screens/messages/*` | Messages lane. The chat post goes through the existing send path (§7.6). |
| `supabase/migrations/*` existing files, and N-00's held files once they exist | This lane writes only one new held file. Any change N-00 needs (§13.2) goes to N-00's plan and is not made here. |
| `vercel.json` | No new cron. The deferred send runs from `after()`, with a sweep on the next request (§7.3). |

---

## 2. PP0: flag, model types, fixtures, preview, PracticePlanSheet

### 2.1 The flag

- `config/feature-flags.yml`: add `coachhelm_practice_plans_v1`. Copy the shape of `coachhelm_track_record_v1` (line 1198):
  - type release, owner golf/coachhelm
  - `default: false`, and production, preview and development all false
  - `kill_switch_behavior: null`
  - purpose: "CoachHelm drafts, saves and publishes practice plans from Ask and the practice builder. Off: Ask has no plan tools and the builder has no helper."
  - cleanup plan: "Remove after the flag has been on in production for a season and the Practice tab flag is gone."
- `src/lib/flags/registry.generated.ts` via `npm run flags:generate`.
- New `src/lib/coachhelm/v3/practice-plan/flag.ts`, modelled on `src/lib/coachhelm/v3/track-record/flag.ts`:
  - `PRACTICE_PLANS_FLAG`
  - `isPracticePlansEnabled()` (sync, uses `isFlagEnabled`, server only)
  - `isPracticeTabEnabled()`, which reads `golf_practice_plans` once N-00 adds it and returns false while that flag is not in the registry
- `src/app/api/coachhelm/v3/chat/stream/route.ts`: read `isPracticePlansEnabled()` once, beside `claimsBlockEnabled` (line 550), and pass `practicePlans` into `buildCoachTools` (call at 554-561). `BuildToolsArgs` (`agent-tools.ts:169`) gains `practicePlans?: boolean`, default false. The tools register only when `practicePlans && teamTools`.
- `routes/coachhelm.tsx` passes `practicePlans={isPracticePlansEnabled()}` into `<Ask>`, in the same way the Ask lane's AK0 passes `v2`. Flags are server only, so the client never reads them.

### 2.2 Lane model types: `src/lib/coachhelm/v3/practice-plan/model.ts` (new, pure)

N-00 slice 0 plans `screens/practice/model.ts` (PlanBodyV2, parsePlanBody, validatePlan, autoGrid, pathFor, diffVersions, mixMinutes, bringList, splitEvenly, ribbon). It needs no migration, but it is not built. The chat tool sits in `src/lib` and may not import `src/clubhouse`, so this lane owns the server-side plan type:
- `PlanBodyV2`, a copy of N-00 §8.1:
  - block kinds `team`, `stations`, `course`, `own`, `break`
  - `DrillRef {src: 'team' | 'lib', id}`
  - groups, stations, turns and holes
- `PlanWhy = { aim: string; because: string | null; sources: SourceRef[]; lean: boolean; routine: boolean }`, keyed by block id. This is **beside** the body (`PlanDraft = { body: PlanBodyV2; why: Record<string, PlanWhy>; version: number }`), never inside it, so the player copy can drop it without walking the body (§2.3).
- `validatePlan(draft, drillIds)` with N-00's rules, plus three more:
  - every `DrillRef` exists in the supplied set
  - a routine block has `routine: true` and no `because`
  - the minutes sum to the length the coach asked for
- `mixMinutes(body)` gives the mix bar (Skill, Random, Pressure; routine blocks are left out). `toPlayerPlan(body, playerId)` gives `{ focus, group, stops[] }` with no Why, no Aim and no other group's assignments.
- Merge point: when N-00 slice 0 lands, `screens/practice/model.ts` re-exports these types, or this file re-exports N-00's. Pick one in that PR, and have a test that checks the two `PlanBodyV2` shapes are the same type (`expectTypeOf`).

### 2.3 PracticePlanSheet: `screens/coachhelm/plan/sheet/` (new)

- `PracticePlanSheet.tsx`: `<PracticePlanSheet plan={PlanSheetModel} copy="coach" | "player" density="pane" | "phone" | "print" />`. This one component serves:
  - the desktop pane (452px)
  - the phone full plan
  - the builder's Review and N-00's PlanPage (by import)
  - Documents preview
  - the PDF (§8)
- `plan-sheet-model.ts` (pure): `toSheetModel(draft, team, copy)` builds what the sheet draws: the header, Time · Place · Coaches, group columns, the schedule rows (rotation grid, course chips, "Everyone"), Bring, Notes and the footer. **For `copy: 'player'` the model has no `why` field at all**, so it can't reach the DOM.
  - The player's browser gets only the player model, built on the server. It never gets the coach model with a hide flag.
  - A test serialises the player model and asserts it holds no Why text, no Aim and no key named `why`.
- The design (`COACHHELM_PRACTICE_PLAN.md` §12):
  - Header: team mark, "Demo University Golf / Practice plan · Coach copy" (or "Player copy"), the date block THU 5 NOV, and a 2px ink rule.
  - Title, focus line, then Time · Place · Coaches in three columns.
  - Groups: a tinted column per group with a letter disc and names. Rotation grid: stations down, turns across, each cell the group's letter on its tint.
  - Course chips "A Hole 1 · B Hole 3 · C Hole 5". Other blocks say "Everyone".
  - Coach copy: one Why line per block, with the label in accent and the text in secondary ink. The sheet never shows Aim, Because or source chips; those stay in Ask.
  - Bring is a checklist and Notes are ruled lines. The footer reads `state · In your format · <format name> · Page 1 of 1`. The format part is left out until PP7.
- **It stays light in dark mode.** The sheet root sets its own light tokens and ignores `[data-theme=dark]`. Around it, the pane and the phone screen follow the theme. That is what prints.
- Container query: under 340px of content width, the group columns and rotation cells tighten.

### 2.4 Fixtures: `preview/fixtures-practice-plan.ts` (new)

The design page's model, as data (values listed in `03-DATA-CHECKS.md`):
- team "Demo University Golf", zone America/New_York; Thursday Nov 5 2026, 2:00 to 5:00 PM, Lakeside Golf Club
- coaches: Coach Lin and Coach Rivera
- players: Sofia, Maya, Lena (A); Eli, Jonah, Owen (B); Nora, Ava, Jade (C)
- a tenth rostered player with a declined RSVP, so the hint can say "9 going, 1 can't" (03 §3)
- `PLAN1` (3 h, six blocks: warm-up, putting rotation with ROT [[A,B,C],[C,A,B],[B,C,A]], move, holes 1 to 6 with starts A1, B3, C5, pressure finish, wrap) and `PLAN2` (the 2 h refine, version 2, changed blocks marked)
- `STEPS` read envelopes:
  - calendar
  - strokes gained by area
  - putting by distance, with the band labels already fixed to the app's bands (03 §2)
  - class times
  - drill bank
- `INTAKE` groups with the guesses ticked, `FOLDERS` with counts, publish audience and Told/Seen, the format sample "Fall practice sheet.pdf"
- states: loading, lean read (3 rounds), empty bank, failed read, stopped, cancelled, undone, failed save, long text, 25 players. The last two are not drawn on the page, so they are build-rule fixtures.

### 2.5 Preview routes

- `src/app/clubhouse-preview/[screen]/page.tsx`: add `coachhelm-practice-plan` next to `'coachhelm-ask'` (569) and its doc entry (198). The route renders `preview/PreviewPracticePlan.tsx`, which takes `?state=` (one per fixture state) and `?copy=coach|player`, `?density=pane|phone|print`.
- `coachhelm-practice-thread` renders the Ask thread from fixture parts (steps, intake, plan card, receipt) through the real `AskThread` with `practicePlans` on, using the same harness as `PreviewAsk.tsx:85`.
  - `?state=` is one of: thread, steps, intake, reads, writing, card, evidence, swap, swapped, edit, full, folders, newfolder, saving, saved, confirm, publishing, published, told, failed, stopped, cancelled, undone, lean, empty-bank, long, many.
  - `&density=desk` draws the Mac layout (S-ASKD): thread plus the 452px pane. `state=card` gives the pane at version 1 (S-ASKD.pane) and `state=swapped` the refine at version 2 (S-ASKD.pane-v2).
- Three more routes give `capture.mjs` a target for every screen. Each is a `preview/Preview*.tsx` fed from `fixtures-practice-plan.ts`:
  - `coachhelm-practice-format?state=empty|upload-sheet|reading|found|set|see|undone` (S-FMT, PP7)
  - `coachhelm-practice-builder?state=empty|new-sheet|ghosts|kept&density=phone|desk` (S-BLD and S-BLDD, PP8). Until N-00's builder exists, this route draws a stand-in builder frame around the real helper parts and is marked "stand-in" in the catalog.
  - `coachhelm-practice-player?state=notify|practice|plan|docs` (S-PLY, PP9)
- In PP0 each route exists and renders its fixture states as static frames. The PR that builds a screen replaces its frame with the real component.

### 2.6 CSS: `styles/coachhelm-plan.css` (new), prefix `.ch-cp-`

- The sheet rules are scoped under `.ch-cp-sheet`, which defines `--gA #1F6B45 / tint #E4EEE7`, `--gB #2F5B7E / #E3EAF2`, `--gC #654A7E / #ECE7F1` (plum; it was ochre, which read as the loss amber in dark), with the disc letter white. Dark: `--gA #4FA877`, `--gB #6E9BC0`, `--gC #B49ACB` with the letter in `#0E120F`. Each pair is checked at 4.9:1 in a unit test that reads the CSS custom properties.
- The design's dark disc ("near-black letter in dark") applies only to the in-Ask chips, which follow the theme. The sheet itself is always light.
- It is imported in `routes/coachhelm.tsx` beside today's Ask CSS, and added to `config/clubhouse/pages/P013-coachhelm.json` styles.
- The `.ch-plan-` prefix is N-00's (page 17). It is not used here, so the two can't collide.

### 2.7 PP0 tests

- `practice-plan/flag.test.ts`: off in every environment
- `plan-sheet-model.test.ts`:
  - the coach model has six Why lines for PLAN1; the player model has none, and no `why` key
  - routine blocks carry "Routine. No claim." only in the Ask card, not on paper
  - rotation cells match ROT
  - course chips read "A Hole 1 · B Hole 3 · C Hole 5"
- `PracticePlanSheet.test.tsx` (unit-dom):
  - the player render has zero `[data-why]` nodes and no Why text
  - it stays light under `data-theme="dark"`
  - the container query class applies at 320
- `model.test.ts`: `validatePlan` rejects a missing drill id, a routine block with a because, and minutes that don't add up; `toPlayerPlan` returns only the given player's group
- the flag-off tool-key test (§0.2)

Done when:
- the sheet matches the page's printed plan, coach and player copy, side by side at the pane width (452) and the phone width (390, 320), light and dark (the sheet stays light in both)
- the player copy's DOM and its serialised model hold no Why text
- `npm run flags:check` passes and the flag reads false everywhere

---

## 3. PP1: steps and read pictures

### 3.1 Today

- `agent-tools.ts`:
  - `progress()` (239-246) writes `{type:'data-progress', id:'progress-N', data:{label, tool}}` before each read
  - `read()` (259-272) wraps progress, the guard, the evidence ref `eN` and `collect`
  - `PROGRESS_LABEL` (144) maps tool names to present-tense coach copy; an unknown tool falls back to "Working"
- `data/coachhelm-chat-thread.ts`: `AskStep` (86), `stepLabel` (157), `buildAssistantTurn` filters `data-progress` (310-313)
- `screens/coachhelm/chat/Thread.tsx`: `Work` (281) draws `<ol className="ch-th-steps">` (294) with dots and checks
- There is no class-times read, no drill read, no team strokes-gained read and no team putting read:
  - `get_putting_distance_profile` (agent-tools 504, read-tools 537) is one player from `golf_player_stats_cache`
  - `get_player_metrics` is one player

### 3.2 New reads: `src/lib/coachhelm/v3/chat/practice-reads.ts` (new)

The coordinator named two reads. The page draws four pictures from reads that don't exist, so this PR adds four (03 §1 to §5):

| Tool | Reads | Envelope (summary, measurements, detail) | Unavailable when |
|---|---|---|---|
| `get_class_times` `{date}` | RPC `golf_team_class_day(p_team_id, p_on)` with the coach's session client (the route passes `createClient()`, route 329, so the RPC's coach check passes). A minimal parse is copied from `class-day-shape.ts`, and a test checks it against `toClassDay` on the same fixture. | per tracked player: first and last block that overlaps the practice window, as local times; `detail.inClassUntil[]` | the RPC is missing (`PGRST202`, `42883`), `class_awareness_v1` is off, or there is no term: an "unavailable" envelope; the step is left out, not failed |
| `get_drill_bank` `{category?}` | `golf_drills` (baseline 9472: id, slug, title, category, tags, duration_min, difficulty, impacts_metric_id); later also `golf_team_drills` (N-00 010100, held), with `isUnavailable` fallback | counts by category; up to 20 drills with id, title, category and duration; `detail.ids` for validatePlan | the table is empty: "No drills in the bank yet" |
| `get_team_strokes_gained` `{rounds: 10}` | `golf_rounds` (`strokes_gained_tee/approach/around_green/putting`, set by trigger from `calculate_round_strokes_gained`) for roster players, completed, `is_test = false`, `round_type` in `TEAM_ROUND_TYPES` (read-tools 1211), over the last N distinct round dates | mean per area per player-round, `sample_size` = player-rounds with SG, `window_start/end` | fewer than 5 player-rounds with SG: a lean envelope (`coverage: 'thin'`) |
| `get_team_putting_profile` `{rounds: 10}` | `golf_shots` (`shot_type = 'putting'`, `putt_distance_feet`, `putt_made`) joined to the same rounds; Tour line from `cohortAnchor` (`src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts`, `putts_made_3_5ft_pct` and up); three-putts from `golf_holes.putts >= 3` | make rate and attempts per app band (3-5, 5-10, 10-15, 15-25 ft); Tour value per band; three-putts per round | a band under 10 attempts is charted but marked thin (the same rule as read-tools 575); 0 attempts: not charted |

- The tools are registered in `buildCoachTools` inside `...(practicePlans && teamTools ? {...} : {})`, the same pattern as the `golf_tournaments_v1` block (about line 600). Each goes through `read()`, so it gets a progress step, an evidence ref and `collect` for the claim audit.
- `PROGRESS_LABEL` gains:
  - `get_class_times`: "Checking class times"
  - `get_drill_bank`: "Reading your drill bank"
  - `get_team_strokes_gained`: "Reading the last 10 team rounds"
  - `get_team_putting_profile`: "Checking putting by distance"
  - `ask_practice_brief`: "Getting your answers"
  - `draft_practice_plan`: "Writing the plan"
  - `publish_practice_plan`: "Publishing the plan"
- If the Ask lane's AK1 has landed, done labels go in its `PROGRESS_DONE`. Otherwise this PR adds a local `PRACTICE_DONE` map, and AK1 absorbs it.
- Overlap: Ask AK6 plans `putt_profile` and the shot reads in `shot-reads.ts`, and AK7 plans `get_calendar`. If either lands first, these tools call its readers instead of their own queries, and the tool names stay as listed here (§13.1).

### 3.3 Read pictures

New `screens/coachhelm/chat/plan/ReadPicture.tsx` holds one mini chart per read, keyed by tool name:
- `cal` (week strip)
- `sg` (four bars on a centre line)
- `pd` (band bars with the Tour tick, amber where the gap is over 8 points)
- `cls` (timeline 2:00 to 3:00)
- `dr` (three drills fanning out of a stack, "+N more")

How they behave:
- Figures come from the envelope's measurements, never from model text. This is the same rule `show_visual` follows (agent-tools 548).
- While a read runs, the picture is a 74pt skeleton pulsing at 1.9s. It crossfades in over 260ms; marks grow over 360ms; drills fan out on the 462ms smooth spring. With Reduce Motion it appears whole with a `CH_FADE_MS` (180ms) fade.
- `data/coachhelm-chat-thread.ts`: `AskStep` gains an optional `picture?: {kind, evidenceRef}`. It is set only when the part's `tool` is one of the five. Old persisted parts don't have it and draw as today.
- `Thread.tsx` `Work` (281): with `practicePlans` on, a done row whose step has a picture renders `<ReadPicture>` under its label. When the Ask lane's `parts/Steps.tsx` exists, the picture goes into that row instead (merge point).
- The fold to "6 steps · 9s" uses the Ask lane's `stepsReceipt` if it is there, and otherwise `workReceipt` (262).

### 3.4 PP1 tests

- `agent-tools.progress-labels.test.ts`: build with `practicePlans: true, teamTools: true`. Every new `get_*` has a label that isn't "Working", and no label holds a digit.
- `agent-tools.confirm-gate.test.ts`: with the flag mocked on, the four `get_*` tools are classed read-only (prefix `get_`), are not in `CONFIRM_REQUIRED_TOOLS`, and their execute makes no insert, update or delete. The test uses a Supabase spy that throws on any non-select.
- `practice-reads.test.ts`:
  - the class parse agrees with `toClassDay`; a missing RPC gives "unavailable"
  - an empty bank gives the empty envelope
  - strokes gained averages only player-rounds with SG (total-only rounds are left out and counted in the coverage note)
  - the putting bands are the app's bands; the Tour value comes from `cohortAnchor` for the team's gender
- `coachhelm-thread.test.ts`: a step with a picture, a step without one, and an old part with no picture
- `ReadPicture.test.tsx`: amber only where the gap is over 8; chart marks hold 3:1 on their track in light and dark

Done when:
- `askSteps` (steps running, done, folded) and the five read pictures match the page side by side at 390 and 1440, light and dark
- the step clip and the picture clips match §7 of the spec. Reduce Motion shows no breath, shimmer, draw or grow.
- with the flag off, the tool keys equal 75b4956

---

## 4. PP2: Ask first (kit ⑥)

### 4.1 Today

There is no question card. `useCoachHelmChat` (`src/components/golf/coachhelm/chat/useCoachHelmChat.ts:90`) sends user messages and approval responses: `addToolApprovalResponse` (250-258), and `sendAutomaticallyWhen: lastAssistantMessageIsCompleteWithApprovalResponses` (169). `stopWhen: stepCountIs(8)` is at route 656.

### 4.2 How the turn pauses and resumes

Default (Nick can flip): **the answers come back as the coach's own message**. They don't come back as a client tool result. This matches the design (the card folds into the coach's bubble) and the Ask lane (AK9: "Answers come back as the user turn"). It needs no change to the Fairway hook.

1. Tool `ask_practice_brief`. It is a new class, 'ask': no write and no gate. Its input is `{practice_event_id?, date, groups: Array<'length' | 'work' | 'who'>}`.
   - Its execute builds the question groups on the server, from this turn's envelopes only:
     - length options and a guess from the calendar block
     - work options from the strokes-gained and putting envelopes, plus an "On course" option when a tournament is within 7 days
     - who options from attendance and saved groups
   - Each group carries a `source` line, and the line goes through `collect` so the claim audit sees its numbers.
   - It returns the envelope and writes a `data-plan-intake` part `{id, groups, guesses, formatName|null}`.
   - It never asks about something the request already said, such as the day.
2. The route stops the turn there: `stopWhen: [stepCountIs(8), hasToolCall('ask_practice_brief')]`. The AI SDK in 5 and later exports `hasToolCall`. This repo uses `ai` ^7.0.128 and node_modules is not installed, so the name is unverified (§17). If it isn't there, use a custom `StopCondition` that checks the last step's tool calls.
   - `instructions.ts` (`buildInstructions`, 193) gains a practice section, only when the flag is on. It tells the model to read the calendar first, then call `ask_practice_brief`, and to write no prose after it.
3. The trail shows "Waiting for your answers" while the last assistant message ends in a `data-plan-intake` part and no user message follows it. `data/coachhelm-chat-thread.ts` gains `pendingIntake(turns)` beside `pendingApproval` (191).
4. When the coach presses "Build the plan", the client calls `sendMessage({ text: foldedText, metadata: { planIntake: { intakeId, answers } } })`. The folded text is "3 h · short putts, lag, up and down, holes 1 to 6 · everyone", built by a pure `foldAnswers()`.
   - The route reads `message.metadata.planIntake` and checks that `intakeId` belongs to this conversation (the part is stored with the message).
   - It passes the answers into the turn's context as a structured system note ("The coach answered: …"). The model calls `draft_practice_plan` with them as input, and `draft_practice_plan` rejects answers whose `intakeId` doesn't match.
   - The row then reads "Got your answers", and the run carries on.
5. If the coach types something else instead, the intake stays unanswered and folds to "Skipped". Nothing pending is left, because no approval was opened, so `denyAbandonedApprovals` (`abandoned-approvals.ts:35`, route 645) has nothing to cancel.

Not chosen: a client tool with no `execute`, answered with the SDK's tool-output call. It needs a new `sendAutomaticallyWhen` predicate in the Fairway-shared hook, and the method name in `@ai-sdk/react` ^4 can't be checked here.

### 4.3 Client

- `screens/coachhelm/chat/parts/AskFirst.tsx` (kit ⑥, generic):
  - props: one card; up to three groups; single or multi chips (36pt pills, accent fill, ivory label); an optional `source` per group; a footer line; a primary button that stays dim until every group has an answer
  - press: scale .97 (110ms down, 280ms up); fill crossfades over 180ms
  - fold: the card fades over 160ms and collapses over 260ms on the smooth spring; the bubble arrives over 260ms. With Reduce Motion, `CH_FADE_MS` (180ms) fades.
  - Ownership: if the Ask lane's `parts/` folder (AK0) and its `BriefCard` (AK11a) have landed, AskFirst is BriefCard's one-card mode. Otherwise this PR creates `parts/AskFirst.tsx` and BriefCard imports it later. The kit note says "If lane 6 prefers one card with every question, Ask will match it": this lane prefers one card.
- `screens/coachhelm/chat/plan/PlanIntake.tsx`: AskFirst filled from the `data-plan-intake` part. Its footer reads "In your format · Fall practice sheet" and links to Practice › Plan format; it shows only once PP7 has set a format.
- Quick chat: lane 5's `AskSheetBody.tsx` renders Ask's thread parts. That lane picks this card up through `parts/` and this PR doesn't touch it (§1). The builder's New plan sheet uses the same `PlanIntake` in PP8.

### 4.4 PP2 tests

- `practice-intake.test.ts`:
  - at most three groups
  - no group for something the request already said (fixture: "Build Thursday's practice around putting" gives no day group, and the work guess includes putting)
  - guesses come only from this turn's envelopes; with no strokes-gained envelope there is no work guess and no source line
  - the source line's numbers pass `auditNumericClaims` (`provenance.ts:989`)
- route test (`stream/route.test.ts`): the turn ends after `ask_practice_brief`; a follow-up message with `planIntake` metadata resumes; a mismatched `intakeId` is refused
- `confirm-gate` test: `ask_` is a new no-write class, never gated, with no write in execute
- `AskFirst.test.tsx`:
  - dim and inert until answered; ready at once with the guesses ticked
  - several picks allowed in Work on
  - keyboard: Tab through the chips, Space toggles, Enter on the primary
- `foldAnswers.test.ts`: the fold text, and "On course, holes 1 to 6" becoming a course block request

Done when:
- the intake and the folded bubble match the page (S-ASK.intake, S-ASK.intake-folded) at 390 and 1440, light and dark, XXL unclipped
- the chip and fold clips match, with and without Reduce Motion
- a unit test shows the answers driving the plan: picking holes 1 to 6 puts a course block in the draft

---

## 5. PP3: `draft_practice_plan`, the plan card, the why rule, refine and the pane

### 5.1 The tool, and the confirm-gate test

`agent-tools.confirm-gate.test.ts` pins three prefix lists:
- `READ_ONLY_PREFIXES = ['find_','get_','compare_']`
- `MUTATION_PREFIXES = ['create_','update_','delete_','remove_','send_']`
- `DISPLAY_ONLY_PREFIXES = ['show_']`

It requires every tool to be classified and `gatedCount === mutatingCount`. This PR:
- adds `DRAFT_PREFIXES = ['draft_']` and `ASK_PREFIXES = ['ask_']` (the latter if PP2 hasn't already). Neither is gated, and both must make no write: the Supabase spy throws on insert, update, delete or rpc.
- builds the tool set with the flag mocked on as well as off
- `action-types.ts:31` already declares `ActionClass = 'read' | 'draft' | 'confirm' | 'destructive'`, which nothing uses yet. `draft_practice_plan` is its first user. Add a `TOOL_CLASS` map beside `CONFIRM_REQUIRED_TOOLS` (102) so the class is data, not only a prefix.

`draft_practice_plan`, new in `src/lib/coachhelm/v3/chat/practice-draft.ts`:
- Input: `{intakeId, answers, refine?: {fromVersion, ask}, blockScope?: {blockId}, body?: PlanBodyV2}`. `body` and `blockScope` are for PP8 and block edits.
- It **writes nothing**: no insert, no RPC, no storage.
- The model proposes the structure in the tool input (blocks, minutes, drill ids, groups, Aim and Because text). The server then:
  - validates the drill ids against this turn's `get_drill_bank` envelope; an unknown id fails the block, never the turn
  - lays out the rotation and course starts (`autoGrid`, `splitEvenly` from the model module)
  - sums the minutes
  - runs the why rule (§5.2)
- It streams one `data-practice-plan-block` part per block, `{planId, version, index, of, block, why}`, then a `data-practice-plan` part `{planId, version, draft, changedBlockIds}`. `CoachChatDataParts` (121) gains both. `ui-parts.ts` `publishableParts` (65) gains both, so they survive reload.
- It returns an envelope whose `summary` is in words only ("A 3 hour plan in six blocks"). Card numbers come from the draft, so they go into `collectActionNumbers` (296) and count as evidence for the prose that follows.
- Refine chips ("Make it 2 hours", "More pressure", "Lighter before Monday", "Use Tuesday's groups") send a user message with `metadata.planRefine = {planId, fromVersion, chip}`. The model calls `draft_practice_plan` with `refine`, and the result is version 2 with `changedBlockIds`.
- Persisted parts are the version history; nothing is saved elsewhere. Old messages open their own version.

### 5.2 The why rule

For each block:
- **Routine block** (warm-up, move, wrap, or kind `break`): `why = {routine: true, because: null}`. The card shows "Routine. No claim." The one exception is when a read shaped the block, for example the warm-up running to 2:30 because of class times. Then it gets a Because, and that Because is checked like any other.
- **Any other block**: the Because text goes through `auditNumericClaims(text, envelopes)` (`provenance.ts:989`) against **this turn's** envelopes, and through `extractAndValidateChatClaims` (`claims-packet.ts:200`, typed gate behind `coachhelm_chat_claim_gate`) when that flag is on.
  - A block that fails keeps its Aim, loses its Because, and gets `lean: true`. The card shows "Lean read".
  - Integers of 12 and under are exempt in the audit, so "3 groups" passes. A test pins that this exemption can't carry a strokes figure: −0.9 is checked.
- **Thin data**: when the strokes-gained or putting envelope has `coverage: 'thin'` (under 5 player-rounds, or a band under 10 attempts), the Because uses the envelope's own coverage words: "Only 3 rounds since Oct 1, so this is a lean read". With no data there is no Because.
- `sources` on each block are evidence refs (`eN`). A source chip opens the evidence sheet, using the existing evidence part (`CoachChatDataParts.evidence`).
- The status line under the card reads "Writing block 3 of 6", then "Checking every why against the data" while the audit runs.
- The turn verdict (`computeTurnVerdict`, `verdict.ts:80`, route 917) still runs on the prose. The card's own audit is per block and doesn't change the verdict.

### 5.3 The card, the block sheet, swap

New in `screens/coachhelm/chat/plan/`:
- `PlanCard.tsx`, the plan writing itself (kit ②):
  - It opens with an outline: one skeleton row per block, using `of` from the first part (11pt bars, 8pt apart).
  - The write head (an inset 2pt accent ring at 35%, radius 12) moves to each block as its part arrives. Time comes first, then the title types in with a caret (about 300ms), then place, drills and Why rise over 260ms.
  - The day strip (8pt tall, 2pt gaps, radius 4) grows one segment per block, scaleX over 360ms from the left.
  - When the `data-practice-plan` part arrives, the card settles from 0.98 to 1 on a 260ms spring.
  - Then the foot appears: the mix bar (`mixMinutes`), the Save-to row (inert until PP4), Save draft… and Publish… (inert until PP4 and PP5, labelled "Comes with the Practice tab").
  - With Reduce Motion each block appears filled and the write head doesn't travel.
- `PlanBlockRow.tsx`: columns 54 / 1fr, gap 12, padding 12 16. Time is 15/1.2 weight 600 tabular, with the length in 13 ink-3. The title is 16/1.3 weight 500; the meta is 15/1.35 ink-2. Rotation stations start with the group that begins there; course blocks show the hole chips.
- `WhyPanel.tsx`: a well with radius 10 and padding 8 10, text 15/1.35 ink-2. It shows the Aim, the Because (or "Lean read" or "Routine. No claim.") and up to two source chips (radius 7, padding 3 8, 13/1.3 weight 600 accent). **Coach only**: this file is never imported by a player surface. A lint rule or test greps player paths for the import.
- `BlockSheet.tsx`: a `FormSheet` (`ui/FormSheet.tsx:85`) with:
  - a length stepper (5 to 360, steps of 5)
  - place and coach
  - the drill with Swap
  - its Why
  - "Ask about this block", which sends a message with `planBlock` metadata, so the next `draft_practice_plan` call has `blockScope`
  - Edits are local to the draft and make a new version client-side. It goes up on the 462ms smooth spring and down in 280ms ease.
- `SwapList.tsx`: three drills from the bank that fit the same gap (same `impacts_metric_id` or category and a fitting `duration_min`), each with its own Because, checked by the audit. When none fits, "Nothing in your bank fits this" and New drill. New drill is inert until a team bank exists, because `golf_drills` has only a SELECT policy (Ask lane §2.6).

Desktop, phone and the Ask lane's artifact parts:
- If the Ask lane's `parts/ArtifactCard.tsx` and `parts/ArtifactPane.tsx` (AK5) have landed:
  - The plan card is an `ArtifactCard` of kind `practice_plan`.
  - The pane (452px, opens over 462ms smooth) renders `PracticePlanSheet density="pane"`, with "1 of 2" arrows and a footer: Edit in builder (inert until N-00 slice 1), Save draft…, Publish…
  - The phone full plan is the Ask lane's `ArtifactScreen` (push "‹ Ask" with a glass dock).
- If they haven't landed, this PR builds:
  - `plan/PlanPane.tsx`: the same header and footer, mounted in the Ask desktop layout beside the thread at 452px
  - `plan/PlanScreen.tsx`: a pushed screen with `PhoneTop back title` and the dock: blur(24px) saturate(170%), a 1pt top separator, padding 10 16 28, two equal buttons
- **Merge point**: when AK5 lands, PlanPane and PlanScreen are deleted, and the `practice_plan` kind renders `PracticePlanSheet` (AK5 already says "imported, not copied"). The data part stays `data-practice-plan`. If AK5 has added `data-artifact`, the plan part is mapped to it in `artifacts.ts`, and old messages keep their parts.

### 5.4 PP3 tests

- `practice-draft.test.ts`:
  - the draft tool makes no write (spy)
  - one block part per block, then the body part
  - an unknown drill id fails that block only
  - a Because with an unsourced number becomes "Lean read"
  - routine blocks say "Routine. No claim."
  - the thin-data wording
  - `validatePlan` passes before the body part is written ("Ready")
  - a refine gives version 2 with `changedBlockIds`
  - the answers change the plan (holes 1 to 6)
- `agent-tools.confirm-gate.test.ts`: the `draft_` class; `publish_` is not yet present
- `coachhelm-chat-thread.test.ts`: the parts become a plan view; old messages open their version; a reload restores the card
- `PlanCard.test.tsx`: the skeleton count equals `of`; the foot appears only after the body part; Save and Publish make no network call while inert
- `WhyPanel` import guard: no file under player screens imports it

Done when:
- `askOpen` (writing, settled), `askEdit`, `askSwap`, the refine (v2 with Changed marks) and the Mac `dskBuild` and `dskChange` states match the page at 390 and 1440, light and dark
- the write clip (skeleton, write head, typing, strip, settle) matches, and with Reduce Motion each block appears filled
- every Because on the fixture plan passes the audit, and a planted wrong number shows "Lean read"

---

## 6. PP4: Save to a folder (kit ⑦)

### 6.1 Today

- `src/app/golf/actions/documents.ts`:
  - `saveTextDocument` (521, impl 427): coach only; uploads a markdown Blob to `golf-documents/{team}/{uuid}.md`; default `category: 'practice_plan'` (479); writes `golf_document_versions` with `change_notes: 'Saved from CoachHelm'`; **`is_public: options.playerVisible ?? true`** (480), so the default is player-visible; **no `folder` option**
  - `updateDocument` (605) accepts `folder`
- Folders are the free-text `golf_documents.folder`. The Hub groups by it (`data/hub.ts` `folders()` 897; no folder means "Team").
- `golf_documents.file_url` is NOT NULL (baseline 9442).
- N-00 plans (not applied):
  - `golf_practice_plan_save` + `check_body` (010500)
  - `golf_documents.practice_plan_id` and a nullable `file_url` (010400)
  - drafts are **not** filed in Documents: N-00 files only on publish, with folder 'Practice plans', category 'practice_plan', `is_public` true, `file_url` null

### 6.2 Server

New `src/app/golf/actions/coachhelm-practice-plans.ts` (`'use server'`):
- `savePracticePlanDraft({conversationId, planId, version, draft, folder})`. Coach only; the flag and the Practice tab flag are both required. In one server call it:
  1. calls N-00's `golf_practice_plan_save(p_event_id, p_plan_id, p_expected_version, p_title, p_step, p_body)` (010500) to create (by event, `p_plan_id` null) or update (by id, `p_event_id` null) the plan as a draft, sending `draft.body` only, never `draft.why` (fixed 4 Nov wiring: the signature was written as `(p_team_id, p_plan_id, p_body, …)`)
  2. upserts the Documents row with `practice_plan_id`, `title`, `category 'practice_plan'`, `folder` (1 to 60 characters, trimmed, default "Practice plans"), `is_public false`, `file_url null`, and stores `draft.why`, through `golf_practice_plan_file_draft(p_plan_id, p_version, p_folder, p_why)` (fixed 4 Nov wiring: a coach cannot insert a plan row under N-00 010400's insert policy, so this lane's held `held-migrations/20261104090000_golf_practice_plan_coach_why_and_draft_row.sql` adds the definer function and the coach-only `golf_practice_plans.coach_why` column)
  3. returns `{planId, documentId, folder, folderCount}`
- `undoPracticePlanDraft({planId, documentId, savedAt})`. It is allowed only within 10s of `savedAt`, which allows for clock skew. It deletes the Documents row and the plan, **and only if the plan was created by this save**; a re-save of an existing plan restores the previous version instead.
  - Because folders are names (default 1), a folder made here and now empty is gone by construction. Nothing to delete.
- `listPlanFolders(teamId)`: `golf_documents` for the team, grouped by `folder` with counts, coach scope (drafts included). The last folder used comes first: the most recent `updated_at` among the coach's `category = 'practice_plan'` rows.
- Draft in Documents (settled call 3) conflicts with N-00 (drafts not filed). This PR needs N-00's save RPC to take `p_folder` and file the draft row, or a second statement in the same server action. See §13.2.

### 6.3 Client

- `plan/SaveToRow.tsx`: the row "Save to [Practice plans ⌄]" above Save draft and Publish.
  - Tapping it opens the list in place inside the card: no popover and no sheet.
  - Each row is a folder icon (30×24 accent), the name, the count, and a check on the chosen one. New folder is last, in accent weight 600.
  - New folder turns into a name field (at least 120 wide, an inset 1.5pt accent ring, a blinking 2pt caret) with Create. Enter creates and Escape closes.
  - The new folder is held client-side at the top, already chosen, with count 0, and the row names it ("Save to Hargrove week"). The folder only exists once the save writes it.
- Save draft (a coach press) runs this sequence:
  1. the button becomes a "Saving…" capsule (280ms smooth; the sweep loops at 900ms)
  2. a Documents strip appears; the page drops into the folder on a 462ms arc; the folder squashes 1.08 × 0.94 and settles; the count ticks
  3. the card edge flashes once (an inset 2pt accent ring at 60%, fading over 900ms)
  4. the receipt appears (kit ⑤, `plan/PlanReceipt.tsx`):
     - the check draws over 300ms with one ring 1 → 1.9 fading over 620ms
     - "Plan saved · Documents · Hargrove week"
     - "Only coaches can see it. Players are told when you publish."
     - Open
     - Undo with an 8s linear draining ring
  5. the card meta becomes "Draft · Hargrove week · Thu, Nov 5"
  - With Reduce Motion: no flight, the folder fades, `CH_FADE_MS` (180ms) crossfades.
- Receipt timer: a local `useUndoWindow(ms = 8000, onExpire)` in `plan/`, modelled on `Proposals.tsx:75-100`. The draft is already written, so `onExpire` only drops Undo. Undo calls `undoPracticePlanDraft` and animates the page back out over 280ms ("Removed. Nothing was saved.").
- Failed save: an amber glyph (`--ch-loss`, kit ⑤) (fixed 4 Nov: was "a glyph in secondary ink (amber is for losses only)"; 05 S-ASK.failed, 08 PB-FAIL-01 and kit ⑤ say amber, and they win over 02), the reason, "Nothing was saved.", Try again; the draft stays. Cancelled: "Cancelled. Nothing was created."
- Documents: Team Hub's Documents tab (`screens/hub/parts.tsx` `Documents` 665) shows the draft row with an "Only coaches" chip when `is_public` is false. That is one additive line in the row renderer (P010, with its own changelog fragment). If the Documents round two lane (N-10) owns that row by then, it goes in N-10's PR.

### 6.4 Fallback (Nick can choose)

If Nick wants Save before N-00:
- `saveTextDocument` with the **coach copy** as markdown, `playerVisible: false`, and an additive optional `folder` on its options. The old calls behave the same.
- The cost: the plan can't be reopened in the builder, because a markdown blob is not a plan body.
- Not the default.

### 6.5 PP4 tests

- `coachhelm-practice-plans.test.ts`:
  - nothing is written before the press (the tool set has no save tool; the action needs a coach session)
  - `is_public` is false on a draft
  - folder name length 1 to 60
  - Undo within the window deletes the row and the plan, and the folder name is gone from `listPlanFolders`
  - Undo after the window is refused
  - a re-save then Undo restores the previous version
  - no row in `notifications`, no push spy call and no `golf_messages` insert from a save
- `SaveToRow.test.tsx`: the list opens in place; Enter creates; Escape closes; the new folder sits on top, chosen; inert with N-00 absent
- DB check on the preview stack: before the press there is nothing in `golf_documents`; after Undo there is nothing

Done when:
- `askSave` (list open, new folder, saving, saved) matches the page, and the landing clip (arc, squash, count, edge flash, check ring, Undo ring) matches, with and without Reduce Motion
- the draft is listed in Documents marked "Only coaches"

---

## 7. PP5: Publish

### 7.1 Today

- The gate:
  - `CONFIRM_REQUIRED_TOOLS` (102), `isConfirmRequired` (111)
  - route `toolApproval: ({toolCall}) => isConfirmRequired(toolCall.toolName) ? 'user-approval' : 'not-applicable'` (655)
  - `proposeGated` (317) records the proposal (`recordProposal`, `action-runs.ts:96`) and writes `data-action-proposal`
  - `executeGated` (372) claims the run (`claimForExecution` 148), runs it, records the outcome (`recordOutcome` 221) and writes `data-action-receipt`
- `golf_coachhelm_action_runs` (`20260725170000_…:41`):
  - status CHECK allows `proposed, approved, denied, completed, failed`
  - `result jsonb`
  - UNIQUE `(coach_id, idempotency_key)`
- Push and bell: `createEnrichedAnnouncement` (`announcements.ts:741`, impl 254) inserts the bell rows into `notifications` with the service role (about 609-637) and calls `sendBulkPushNotification` (`push.ts:641`), both inside the same call. `in-app.ts` `recordInAppNotification` (33) allows only `'event_reminder' | 'dev_plan_assigned'`.
- N-00 plans:
  - `publishPracticePlan` in `practice-publish.ts` (010600 RPCs: publish, take down, record open, cards, set chat message)
  - a fan-out in `src/lib/golf/practice-fanout.ts`, from `after()`, **immediately**
  - a bell row with `type 'event_reminder'`, `data.kind = 'practice_plan'`, deep link `/golf/dashboard/practice/plan/<planId>`
  - take down notifies the players who had the plan

### 7.2 The tool

- `publish_practice_plan` `{planId, version, folder, teamChat: boolean}` goes into `CONFIRM_REQUIRED_TOOLS`, inside the flag block.
- `agent-tools.confirm-gate.test.ts` adds `'publish_'` to `MUTATION_PREFIXES`, so `gatedCount === mutatingCount` still holds with the flag on.
- `GatedAction` (231) planner in a new `src/lib/coachhelm/v3/chat/practice-publish-planner.ts`:
  - plan (before the gate): it loads the saved plan (it must be saved: publishing an unsaved draft saves it first in the same run) and resolves the audience, which is the players in groups plus the team's coaches (default 10). It builds the confirm facts:
    - When, Where
    - Tells: faces plus "9 players and 2 coaches, push and bell"
    - Files to: the folder, with Change
    - "What Jonah gets": the exact notification text, using the first player in group order
    - the team chat switch (today's `ui/Switch.tsx`)
    - "On confirm: it files in Documents now. The 11 people hear once Undo closes, 8 seconds later."
  - The audience count and the faces come from this run's reads, so they are card numbers (`collectActionNumbers`).
  - run (after the press): calls N-00's publish with `notify: 'defer'` (§13.2), so the plan is published and the Documents row is `is_public` true. Then it writes the run's `result.notify = {state: 'pending', release_at: now() + 8s, audience: [...], teamChat}` and returns.
- Confirm card: when Ask AK4's `parts/ConfirmCard.tsx` is present, it renders the facts. Otherwise this PR uses `plan/PublishConfirm.tsx`.
  - Cancel is ghost; the primary reads "Publish to 11 people". Both lock after the first tap, following the `deciding` lock in `ActionCard.tsx:22`.
  - Closes the acceptance draft's open PB-PUB-06: the label is "Publish to 11 people", the plan's wording.

### 7.3 The deferred send (default 3)

New `src/lib/coachhelm/v3/practice-plan/deferred-notify.ts`:
- `releaseNotify(sb, runId)`:
  - atomically moves `result->notify->state` from `pending` to `sending`, only when `release_at <= now()`. It uses `update … where id = $1 and result->'notify'->>'state' = 'pending' returning`.
  - If a row comes back, it:
    - runs the fan-out: one bell row and one push per audience member through N-00's `practice-fanout.ts`, or a lane copy of the announcement pattern if N-00's module isn't there
    - posts the chat text (§7.6)
    - writes `state: 'sent'` with `told: [{userId, at}]`
  - It never runs twice: the idempotency key and the state compare both prevent it.
- `undoPublish(sb, runId)`:
  - atomically moves `pending` to `undone`, only while `release_at > now()`
  - then calls N-00's take down with `notify: false, revertToDraft: true`, so the plan goes back to draft and the Documents row back to `is_public` false
  - After the window it is refused, and the receipt no longer shows Undo.
- Who calls `releaseNotify`, in order:
  1. the stream route's `after()` (fixed 4 Nov wiring: the route does not import `after` today; add `import { after } from 'next/server'` as `calendar-events.ts:3` does). It waits until `release_at`, then releases. `maxDuration = 120` (route 114) leaves plenty of room for 8 seconds.
  2. the receipt's `onExpire` on the client calls the server action `releasePracticePlanNotify(runKey)`. That covers a cut `after()`, and it's a no-op if `after()` has already released.
  3. a sweep at the start of the coach's next chat request, the same as the Ask lane's `sweepHeld`. It releases any `pending` run past `release_at`.
  - No new cron (`vercel.json` unchanged, §1). Default (Nick can flip). If both `after()` and the client fail and the coach never comes back, the players hear late. The pgmq consumer (`/api/jobs/consume`, `enqueueJob` at `src/lib/jobs/enqueue.ts:69`) could carry it, but it is off (`HELM_QUEUE_ENABLED`), so it isn't used.
- No migration: everything is in `result` jsonb, and the status stays `completed`. If the Ask lane's HM1 (`run_at`, statuses `held` and `cancelled`) is applied first, this can move onto it. Merge point §13.1.
- Undo endpoint: if the Ask lane's `src/app/api/coachhelm/v3/chat/actions/[key]/route.ts` (AK4) exists, its `DELETE` calls `undoPublish` for `publish_practice_plan` runs. Otherwise this PR adds the server action `undoPracticePlanPublish(runKey)`.

### 7.4 Receipt, Told and Seen

- `plan/PlanReceipt.tsx` (PP4's file) gains the published state:
  - "Published · Thu, Nov 5, 2:00 PM · Documents › Practice plans · shared with players", Open, and Undo with the draining ring
  - The ring is a timer, the same with Reduce Motion. It is drawn by `useUndoWindow`, not `ui/Toast.tsx`, because Toast pauses while held (`ToastClock.held`, Toast 189) and the server doesn't. The ring counts down to the server's `release_at` sent on the receipt, not to "8s from when the card drew", so a reload mid-window shows the time actually left.
- When the ring empties, the receipt polls the run (a server action, every 1s, up to 10s) for `told`. Then "Told 11 · push and bell" appears, with each face popping on a 300ms spring, 90ms apart in arrival order (with Reduce Motion, all at once).
- "Seen by 4 of 9 · Jonah, Eli, Sofia, Nora" comes from N-00's opens table (010000, record-open RPC in 010600), read on each poll and on reload. The names show on tap. With no opens table it is hidden (03 §9).
- Cancelled: "Cancelled. Nothing was created." Undone: "Taken back. Nobody was told."

### 7.5 Notifications (default 5)

- Bell: one `notifications` row per audience member, `type 'event_reminder'`, `data = {kind: 'practice_plan', plan_id, v: 1}`, `action_url` set to N-00's deep link.
- Push (fixed 4 Nov wiring: `sendBulkPushNotification(type, userIds, data)` (`push.ts:641`) sends one `data` to every id, and `recordInAppNotification` one title and body, so the fan-out groups the audience by its copy and makes one call of each per distinct body, at most 8): `sendBulkPushNotification('practice_plan', …)` with title "Practice plan for Thursday" and body "2:00 PM · You start on the putting green with Group B", in the Events category, so `shouldSendPush` (`push.ts:88`) applies the player's own switch and Quiet mode.
- Body rule, `practiceNotificationCopy(plan, playerId, zone)` (pure, in `model.ts`): `{practice start, team zone, the user's clock} · You start {at the place of the player's first stop} with Group {X}`.
  - A coach gets "2:00 PM · Lakeside Golf Club".
  - A player with no group gets the same as a coach.
  - "First stop" is the player's group's first block that is not an "Everyone" block. In PLAN1 that is the 2:30 rotation, because the 2:00 warm-up is the whole team on the range. Group B starts at "Green, back", which the notification calls "the putting green". So each station needs an `area` (putting green, chipping green, range, course) beside its display name, and the notification uses the area. N-00's body has no `area` today (03 §11). Without one, the body falls back to the station's name ("You start at Green, back with Group B"). The function has a test for each case.
- Class holds: if a player is in class when the window closes, `holdOrPass` (`class-hold.ts:76`) holds the push until class ends (`class_awareness_v1`). That's intended. The receipt counts a held push as told, and the Told face shows a small clock (03 §9).

### 7.6 Team chat post (default 4)

- When `teamChat` is on, `releaseNotify` posts one `golf_messages` row with `kind 'text'` in the team's conversation, sent as the publishing coach. The text is "Practice plan for Thursday, Nov 5 · 2:00 PM · Lakeside Golf Club" with a link to the plan.
- It goes through the existing send path, so `notifyGolfMessageRecipients` (`golf-message-fanout.ts:34`) does its normal fan-out. To avoid a second push for the same thing, the post carries `notify_anyway: false` and the plan fan-out's push is the one push. The chat message's own push must be suppressed for the players who got the plan push. That is one check in the post call, using the existing skip-list option if there is one; if there isn't, the chat post is sent with notification fan-out skipped. (fixed 4 Nov wiring, verified on 03d9087: there is no skip list; `notifyGolfMessageRecipients` takes only `titleFor`, `pushBody`, `notifyAnyway`, `messageId`. The post calls `sendMessage({conversationId, content, sport: 'golf', createNotifications: false})` (`src/app/actions/messages.ts:334`), which inserts without any fan-out, because the golf fan-out is a separate call in `sendGolfMessageImpl` (`messages.ts:786`). The conversation is the team's `golf_conversations` row with `is_team_channel = true`; with none, or the coach not a participant, the switch is off with "You're not in team chat".)
- The rich card (`kind 'practice'`) waits for the Messages lane.

### 7.7 PP5 tests

- `agent-tools.confirm-gate.test.ts`: `publish_practice_plan` is gated, `publish_` is a mutation prefix, and there is no write before approval
- `deferred-notify.test.ts` with fake timers:
  - at 7.9s there are zero calls to the push spy, the bell insert and the `golf_messages` insert
  - at 8.1s there is exactly one batch
  - Undo at 7.9s gives `undone`, the plan is back to draft, the Documents row has `is_public` false, and no send ever happens
  - Undo at 8.1s is refused
  - `after()`, `onExpire` and the sweep racing produce one send
  - a reload mid-window gets `release_at` back
- `practiceNotificationCopy.test.ts`: Group B's player; a player with no group; a coach; 24-hour clock users
- The DB check: Documents shows the plan "Shared with players" right after confirm. `notifications` has no row for the plan until the window closes.
- Only Publish, a republish that changes a player's day (N-00 slice 4), or Take down sends anything (a spy across save, refine and undo).

Done when:
- `askPublish` (confirm), the publishing capsule, the receipt, Told and Seen match the page, and the told clip (faces 90ms apart; all at once with Reduce Motion) matches
- the 7.9s / 8.1s test passes, and Undo inside the window leaves nobody told

---

## 8. PP6: Print and PDF (default 2)

### 8.1 Today

`window.print()` with `@media print`:
- `screens/calendar/Calendar.tsx:940`
- `screens/rounds/card/RoundCard.tsx:374`
- the qualifiers' `PrintHead.tsx` with `styles/qualifiers.css:4100`
- print blocks in `calendar.css`, `roster.css`, `rounds.css`, `shell.css` and `stats.css`

There is no server PDF.

### 8.2 Change

- `styles/coachhelm-plan.css` gains `@media print`:
  - only `.ch-cp-print-root` is visible; the shell, top bar, dock and pane chrome are hidden
  - `@page { size: letter portrait; margin: 12mm }`; the A4 flip is in §0.1, default 2
  - the group tints print, via `-webkit-print-color-adjust: exact; print-color-adjust: exact`
  - the 2px rule and the ruled notes lines stay crisp, and there are no shadows
  - `break-inside: avoid` on schedule rows and the rotation grid
- New `plan/PrintPlan.tsx`: `printPlan(model)` mounts `<PracticePlanSheet density="print" copy=…>` into a portal root, waits two frames and for `document.fonts.ready`, calls `window.print()`, and unmounts on `afterprint`.
  - Coach copy prints from Ask and the builder. Player copy prints from the player's plan page (PP9) and from Documents for players.
- Phone: the full plan's dock has "Share PDF", which calls `printPlan`, and the iOS print sheet offers Save to Files and Share. On the Mac pane, "Print" is in the overflow.
- From Documents: a plan row with `practice_plan_id` opens the plan page, not a file (N-00 `file_url` null). Print from there.

### 8.3 PP6 tests

- unit-dom: in print mode, only the sheet root is visible; the player print has zero Why nodes
- a Playwright print-emulation snapshot (`page.emulateMedia({ media: 'print' })`) of the coach and player copies of PLAN1, light theme and dark theme (they must be identical)
- the coach and player PDFs differ only by the Why lines: a text diff of `page.pdf()` output in Playwright chromium

Done when:
- the print of PLAN1 matches the page's printed plan, the coach and player copies differ only by the Why lines, and dark mode prints the same as light

---

## 9. PP7: Plan format

### 9.1 Today

`screens/hub/upload.ts` `uploadTeamDocument` (18) takes a folder and uploads to the private `documents` bucket (25 MB, PDF among the allowed types, `20260728173939_documents_storage_bucket_rls.sql`). Nothing parses a document. No PDF text library is in `package.json`; check before adding one (§17).

### 9.2 Change

- Where it lives:
  - Practice › Plan format is in N-00's tab (slice 1), so the entry waits for it.
  - Until then, the screen is reachable only from the Ask first card's footer link and the preview route.
  - The screen is `screens/coachhelm/plan/format/PlanFormat.tsx` (P013 for now, the same rule as the sheet).
- The flow (S-FMT):
  1. Empty: "Use the plan you already use" with Upload a plan. A sheet (`ActionSheet`, `ui/FormSheet.tsx:201`) offers Choose file, Photo library and Take a photo, and accepts PDF, image, Word and Excel.
  2. Upload: `uploadTeamDocument` with folder "Practice plans" and `is_public` false, so the sample is a coach-only Documents row (default 6).
  3. Reading: the page sits in a well with a scan line (kit ②) while three steps run:
     - "Reading the file (1 page · 5 sections)"
     - "Matching your sections"
     - "Checking your past plans (6 plans · you split into 3 groups most weeks)"
     - The found sections are outlined on the page all at once, each with a small tag. No stagger.
  4. "Here's your format": Header, Groups, Schedule, Bring and Notes in plain words, with Try another and Use this format.
  5. Use: a Saving capsule, then the receipt "Your format is set · Plans from Ask and the builder now use it", See Thursday in it, and an 8s Undo.
- Server, new `src/app/golf/actions/coachhelm-plan-format.ts`:
  - `readPlanFormat(documentId)` gets a signed URL (`getPreviewUrl`, `documents.ts:1249`) and sends the file to the model as a document or image input (Anthropic PDF and image support through `@ai-sdk/anthropic`). It asks for **layout only**: section names, order and schedule columns. The answer is validated with a zod schema, and any content field is dropped.
    - Word and Excel are converted to text on the server first. If no converter is available, the sheet shows only PDF and photo (§12).
  - Learning: `pastPlanStats(teamId)` reads published plans from N-00's table (count, the most common group count, kept and swapped drills, block lengths). It feeds `ask_practice_brief`'s guesses and the step "6 plans · you split into 3 groups most weeks". There is no table for learning and no settings. Until N-00 exists, it returns none and the step reads "No past plans yet".
  - `setPlanFormat(documentId, sections)` upserts `golf_practice_plan_formats`, which is held (§14). `undoPlanFormat` restores the previous row within the window.
- The format is used by `PracticePlanSheet`. `format.sections` orders the sheet's sections and names the footer "In your format · Fall practice sheet". It copies layout only: a new plan's drills, times and groups never come from the sample.
- There is no template editor, no field mapping and no toggle anywhere.

### 9.3 PP7 tests

- `coachhelm-plan-format.test.ts`:
  - the parse keeps sections, order and columns, and drops content; a sample with drill names doesn't put them in the next draft
  - with the table missing (`42P01`), Use reads "Comes with the Practice tab", and the sample upload still works
  - Undo restores the previous format
- unit-dom: the screen has no editor, mapping or toggle controls
- `HELD.md` lists the file as HOLD; `db:apply` refuses it without the override

Done when:
- `fmtUpload` and `fmtSee` match the page, the scan clip matches, the migration is written and held, and nothing is applied

---

## 10. PP8: Builder helper (blocked until N-00 slices 1 and 2)

N-00's builder (`screens/practice/builder/*`, Blocks / Groups / Drills / Review) doesn't exist at 75b4956. This PR adds:
- `screens/practice/builder/HelperPanel.tsx` (the phone card on each step: "Fill the draft") and `HelperSheet.tsx` (the Mac inspector's CoachHelm tab)
- Each step's offers, all from the same `draft_practice_plan` endpoint with `{body, blockScope | stepScope}`:
  - one block selected: "Suggest a drill for this station", "Fit this to 20 minutes"
  - Groups: "Group by need" and "Keep late arrivals together", each with its reason
  - Drills: the three best fits, each with its Because
  - Review: "Check balance" ("45 of 135 minutes on putting, the team's biggest loss")
- The endpoint: a server action `suggestForBuilder(...)` runs the same `practice-draft.ts` core outside the chat route. It writes nothing. It returns blocks with Why, and runs the same audit against the reads it makes in that call.
- Ghost blocks: a well fill, a green outline, the word "Suggested", Keep / Swap / Remove, and Keep all.
  - Keep turns the block solid with the card shadow.
  - Nothing joins the plan until kept, and a suggestion never overwrites a block the coach made.
  - Suggestions live in client state only.
  - Afterwards the helper folds to "CoachHelm · 6 suggestions kept".
- New plan sheet: "Start from" gains "Ask CoachHelm" with the PP2 `PlanIntake` (the same card and the same `ask_practice_brief` core, called as a server action).
- These files are inside N-00's page 17, so the PR follows N-00's manifest, CSS prefix (`ch-pr`) and code block. The helper's own rules go under `.ch-pr-helper` in N-00's CSS file, with N-00's sign-off, or in `coachhelm-plan.css` if N-00 prefers.

Tests: nothing applies until kept; Keep all keeps every ghost; Remove discards; a coach block is never replaced; the helper calls write nothing (spy). Done when `bNew`, `bFill`, `bKeep`, `dbFill` and `dbKeep` match.

---

## 11. PP9: Player side (default 7)

- The notification is §7.5.
- Player Practice page: N-00 slice 3 builds the player Practice home and PlanPage, and slice 4 adds Now/Next. This PR adds:
  - a server loader `loadPlayerPlan(planId)` that returns **only** `toPlayerPlan(body, playerId)` (focus, their group letter and members' names, their stops with time, place and coach) and the sheet's player model
  - no Why, no Aim, no sources, no other group's assignments, and no figures from any read
  - the player's page (S-PLY.practice) showing their group's stops as Now and Next, and the plan page rendering `PracticePlanSheet copy="player"`
- Documents for players: the published Documents row (`is_public` true, `practice_plan_id`, `file_url` null) opens the player plan page. **No coach-copy file is ever stored for a published plan**, because a player can download any `is_public` file (`documents.ts` 216, 266). That rules out PP4's fallback (§6.4) once a plan is published.
- A player never sees a draft. The draft row is `is_public` false, and N-00's RLS on plans gates by status.
- Tests:
  - the loader's JSON for a player has no `why`, `aim` or `because` key and no other group's stops
  - DOM: zero Why nodes
  - a player's request for a draft plan id gets nothing
  - no teammate's figure: the payload has no number from a read envelope, checked by grepping the fixture's read figures (−0.9, 71, 412, 0.8)
- Done when `pNotify` and `pOpen` match the page.

---

## 12. Can't build as drawn (each with its fix)

1. **"3 to 6 ft", "6 to 10 ft", "10 to 20 ft" don't exist.** The app's bands are 0-3, 3-5, 5-10, 10-15, 15-25 and 25+ ft (`metrics-catalog.ts:232-243`). 0-3 ft has no attempts column and is never charted. Fix: the picture and the Because use 3 to 5, 5 to 10, 10 to 15 and 15 to 25 ft, so the figures match the Stats page. The Ask lane made the same change (its correction 6).
2. **"Tour line 84%" for 3 to 6 ft is not the Tour figure.** It is 90.5% (men) or 86.0% (women) for 3 to 5 ft (`cohort-baselines.ts`). Fix: show the real Tour value for the team's cohort.
3. **"Against the Tour line" for strokes gained.** The SG method is the expected-strokes baseline (`sg_per_round_vs_broadie_baseline`). Fix: use the Ask lane's words, "against the scoring baseline", so the two lanes agree.
4. **No team strokes-gained or team putting read exists.** PP1 adds them (§3.2).
5. **"9 going, 1 can't" with a 9-player plan.** It needs a tenth rostered player with a declined RSVP (default 10). `getUpcomingEvents` (read-tools 1028) counts only `accepted` and `declined`, while the status CHECK also allows `attending`, `not_attending`, `tentative`, `maybe`, `excused` and `unexcused`. Fix in the new read: going = accepted or attending; can't = declined, not_attending or excused (03 §3).
6. **Folders with ids, `create_document_folder`, `save_practice_plan(folderId)`.** None exist. Fix: default 1, folders by name.
7. **Drafts in Documents.** N-00 files only on publish. Fix: §6.2 and §13.2.
8. **Immediate fan-out in N-00.** Fix: a defer option (§13.2).
9. **New drill from the swap list.** `golf_drills` has only a SELECT policy, so a coach can't add a drill. It stays inert until N-00 010100 (team bank) ~~or the Ask lane's HM5~~ (fixed 4 Nov: HM5 is superseded; the one bank is N-00's `golf_team_drills`, written through `createTeamDrill` or `copyLibraryDrill`, §C.1).
10. **"Seen by 4 of 9" and "6 plans published".** They need N-00's opens and plans tables, so they are hidden until then (03 §8, §9).
11. **Word and Excel samples.** The repo has no converter. PDF and photo go to the model directly. Word and Excel show only if a converter is added in PP7, which needs its own package decision.
12. **The page's "A Hole 1 · B Hole 3 · C Hole 5" course block.** There is no course hole model in the plan body beyond N-00's `course` kind with hole numbers. That is enough as long as no tee times are needed.
13. **"Ava and Jade, in class until 2:15".** This is only true if those players share class status (`golf_player_shares_class_status`). A player who turned sharing off reads as having no schedule, so the Why doesn't name them. That is correct, and the fixture shows it.

---

## 13. Overlaps with other lanes

### 13.1 Ask lane (lane 4, `ask/02-PLAN.md`)

| Ask lane piece | This lane's use | Rule |
|---|---|---|
| AK0 `parts/` folder, `coachhelm_ask_v2` | PP2's `AskFirst` goes in `parts/` | if AK0 hasn't landed, PP2 creates `parts/` with its one file. AK0 then adds its index, with no move. This lane's flag doesn't need `coachhelm_ask_v2`. |
| AK1 `Steps.tsx`, `PROGRESS_DONE`, `detailFor` | read pictures sit in the step row | PP1 adds `picture` to `AskStep`. If AK1 is in, the picture renders in `Steps.tsx`; if not, in `Work`. |
| AK4 `ConfirmCard`, `Receipt`, `undo-hold.ts`, HM1, `chat/actions/[key]` | publish confirm, receipt, Undo | this lane's deferred send needs no HM1, because it holds only the notify step, not the write. If HM1 and AK4 are in, the `DELETE` route also handles `publish_practice_plan`. Both lanes keep the rule that nobody is told before Undo closes. |
| AK5 `ArtifactCard`, `ArtifactPane`, `ArtifactScreen`, `create_practice_plan` | the plan card and the pane | **one draft tool, `draft_practice_plan`** (default 8). AK5 drops `create_practice_plan`, which would also fail the confirm-gate test. AK5's pane renders `PracticePlanSheet`. If PP3 lands first, PlanPane and PlanScreen are deleted when AK5 merges. |
| AK6 `putt_profile`, `shot-reads.ts`; AK7 `get_calendar` | team putting and the calendar read | whichever lands first owns the query, and the other calls it. Tool names stay as in §3.2. |
| AK9 `ask_practice_brief`, `SaveCard`, `save_document(artifact_id, folder_id)`, `create_folder` | Ask first and Save to | one `ask_practice_brief` in **one-card** form. One Save row (this lane's `SaveToRow`, or AK9's `SaveCard` if it lands first, but not both). Folder by name (default 1) unless Nick flips to N-10. AK9 should then call `savePracticePlanDraft` rather than a second save path. |
| Correction 16 (flag name) | | two flags, two jobs (default 12) |

### 13.2 N-00 (Practice tab, `build-plans-2/N-00-practice-plan-builder.md`)

Changes this lane needs from N-00 before its migrations are applied. They are written here for N-00 to take; none is made by this lane.
1. `golf_practice_plan_save` (010500) takes `p_folder text default 'Practice plans'` and upserts a Documents row for drafts with `is_public` false and `practice_plan_id`, for settled call 3. Or N-00 agrees that the lane's server action writes that row. (fixed 4 Nov wiring: settled as the second way. 010500 stays as written; the lane's held `20261104090000` adds `golf_practice_plan_file_draft`, which N-00's own builder save also calls once per new plan, so every plan row is filed from its first save.)
2. `publishPracticePlan` takes `{notify: 'now' | 'defer'}`. With `defer` it publishes and files, and the caller runs `practice-fanout.ts` later. (fixed 4 Nov wiring: no SQL change is needed. `golf_practice_plan_publish` (010600) notifies nobody; it returns `recipients`, and the TS action sends. `defer` only skips the action's own `after()` send.) `practice-fanout.ts` exports the push and bell batch as one function the deferred send can call.
3. Take down takes `{notify: false, revertToDraft: true}` for an Undo inside the window. Today's plan notifies the players who had the plan. (fixed 4 Nov wiring: no SQL change is needed. `golf_practice_plan_take_down` (010600) already sets `status 'draft'`, clears `is_live` and sets the Documents row `is_public false`; it returns `recipients` and sends nothing. `notify: false` only skips the TS send. The frozen version stays, not live, so the next publish is version 2.)
4. `PlanPage.tsx` renders `PracticePlanSheet` (default 11). It is one component, not two, and `plan.css` keeps only the page chrome.
5. §1.4 cut "CoachHelm writing plans". Nick's Oct 31 asks reverse that, so N-00's plan should be updated to say so.
6. `model.ts` and `PlanBodyV2` are shared with `src/lib/coachhelm/v3/practice-plan/model.ts` (§2.2).
7. The chat card: N-00's `PlanCard.tsx` (`kind 'practice'`) can replace default 4's text post once the Messages lane draws it.

### 13.3 Others

- **N-10 (Documents round two)** owns the Documents row and the folders model. Default 1 avoids its held folders table, and the "Only coaches" chip goes in whichever PR owns `screens/hub/parts.tsx` then.
- **Lane 5 (quick chat)** owns `shell/AskSheet*`. It renders the Ask first card through `parts/`, and this lane doesn't edit its files.
- **Messages lane** owns `screens/messages/*` and the rich chat cards. Default 4 sends text only, through the existing path.
- **Class awareness (P-10)** owns `data/class-day*`. PP1's read is separate, and its test checks it against `toClassDay`.
- **Lenses lane (lane 2)** shares only the "every PR must" checks and `P013` changelog. There is no shared file.
- **Shared files every lane touches:**
  - `config/feature-flags.yml` and `registry.generated.ts`: rebase and regenerate
  - `preview/component-catalog.json`: regenerate, never hand-merge
  - `src/app/clubhouse-preview/[screen]/page.tsx`: one entry each
  - `agent-tools.ts`: the Ask lane and this lane both add to `PROGRESS_LABEL`, `CoachChatDataParts` and `BuildToolsArgs`. Add entries; never reorder.
  - `route.ts`
  - `config/clubhouse/pages/P013-coachhelm.json`
  - `docs/clubhouse/catalog/coachhelm.md`: take a fresh code block per PR

---

## 14. Held migration (PP7) and dependencies held elsewhere

| # | File (proposed) | What | Without it |
|---|---|---|---|
| PM1 | `20261102090000_golf_practice_plan_formats.sql` | `golf_practice_plan_formats (id uuid pk, team_id uuid not null references golf_teams on delete cascade, source_document_id uuid references golf_documents on delete set null, name text not null check (char_length(name) between 1 and 80), sections jsonb not null, created_by uuid not null, created_at timestamptz default now(), updated_at timestamptz default now(), unique (team_id))`. RLS: the team's coaches read and write; players have no access. | "Use this format" reads "Comes with the Practice tab"; the sheet uses its default section order |

- (fixed 4 Nov wiring: PM1 is now written as `held-migrations/20261102090000_golf_practice_plan_formats.sql` in this folder, and a second held file, `held-migrations/20261104090000_golf_practice_plan_coach_why_and_draft_row.sql`, adds the coach-only `golf_practice_plans.coach_why` and `golf_practice_plan_file_draft` for §6.2. Copy both into `supabase/migrations/` with their HOLD rows.)
- It gets a `-- STATUS: WRITTEN, NOT APPLIED (HOLD)` header, a rollback file under `supabase/rollbacks/`, a `-- VERIFY:` query and a pgTAP file `supabase/tests/rls/golf_practice_plan_formats.sql`, none of them run. It is registered HOLD in `HELD.md` with "pending owner". It is applied together with N-00's Practice migrations, because nothing reads it before the Practice tab ships.
- Held elsewhere, needed here:
  - N-00 `20261026010000` (plans, versions, lines, opens)
  - `010100` (golf_team_drills)
  - `010200` (groups)
  - `010400` (`golf_documents.practice_plan_id`, nullable `file_url`, source CHECK)
  - `010500` (save)
  - `010600` (publish, take down, record open, set chat message)
  - `010700` (realtime, for Seen)
  - Optional: N-10 `20261026090200_golf_document_folders` (only if default 1 flips) and the Ask lane's HM1 (only to move onto its hold)

---

## 15. Risks

1. **Coach copy reaching a player.** The worst failure here. Three paths are closed by construction:
   - the player model has no `why` field
   - `WhyPanel` is never imported by player code
   - a published plan has no coach-copy file
   - The checks are tests in PP0, PP3 and PP9. A reviewer greps player paths for `why`, `aim` and `because` in every PR.
2. **Two plan renderers.** If N-00's PlanPage draws its own body, the PDF, the pane and the player page drift. Default 11 makes this one component. Agree it with N-00 before slice 3.
3. **Two draft tools.** AK5's `create_practice_plan` and `draft_practice_plan` would give the model two ways to make a plan. Default 8.
4. **A lost deferred send.** `after()` cut, the tab closed and the coach never returning means the players hear late. This is mitigated by three release paths and a visible "Told" only after a real send. Accept it, or Nick turns the job queue on.
5. **A double push.** The plan push plus the chat message's own push. §7.6 suppresses one, but whether the send path can skip is unverified.
6. **Class holds** may delay a player's push until class ends. That is intended. The Told row counts a held push, so the coach isn't misled, and the face shows the hold.
7. **The claim audit's small-integer exemption** (12 and under) could let "3 groups" pass when the read says 2. The block structure is code-built from the answers, not model text, so group counts come from data. The test pins it.
8. **The confirm-gate test** is the guard against an ungated write. Extending the prefix lists must not loosen it: `publish_` goes into MUTATION, and the no-write classes are asserted with a throwing spy, not only by name.
9. **Fairway shares the engine.** Every tool is registered only with `practicePlans && teamTools`. A flag-off key test runs in each PR.
10. **The time zone.** `golf_events.start_time` is a timestamptz and the tools see UTC. Every time on the card, the notification and the sheet is formatted in `golf_teams.timezone`, with the user's 12- or 24-hour clock. A test uses America/New_York on the DST edge (Nov 1 2026 is the change).
11. **N-00 slips.** PP4, PP5, PP8 and PP9 wait. With the flag on, the lane shows drafts with inert Save and Publish. Keep the flag off in production until N-00 ships (settled call 1).

---

## 16. Acceptance per PR

The acceptance draft's criteria ids (PB-STP-01 …) stay. Its PR groups move like this:

| Draft group | Now | Must pass (draft screen ids → rough new ids) | Done when (adds to the per-PR lists above) |
|---|---|---|---|
| (none) | PP0 | S-PP-PLAN PB-PG-01 to 09 → S-DOC.sheet-coach, S-DOC.sheet-player | the sheet pair matches; the player copy has no Why nodes in the DOM or the model; flag-off parity |
| PB1 | PP1 | S-PP-ASK.steps, .read-pictures → S-ASK.thread, S-ASK.steps, S-ASK.read-pictures, S-ASK.stopped, S-ASKD.thread, S-ASKD.steps | `askSteps` pair and clip match with and without Reduce Motion; the new reads have labels; Stop leaves no write |
| PB2 | PP2 | .intake, .intake-folded → S-ASK.intake, S-ASK.intake-folded, S-ASKD.intake | intake pair and fold clip match; answers drive the plan (unit); no group for what the request said |
| PB3 | PP3 | .plan-card, .why, .refine, .block-sheet, .swap; S-PP-PLAN PB-PG-10, 11 → S-ASK.plan-card, S-ASK.why, S-ASK.evidence … S-ASKD.pane, S-ASKD.pane-v2 | `askOpen`, `askEdit`, `askSwap`, `dskBuild`, `dskChange` match; an unsourced number becomes "Lean read"; drill ids exist; the draft tool writes nothing |
| PB5 | PP4 | .save-to, .saved, .failed → S-ASK.save-to, S-ASK.saved, S-DOC.list-draft | `askSave` pair and landing clip match; `is_public` false; Undo leaves no row; nothing reaches players |
| PB6 (part) | PP5 | .publish-confirm, .published, .cancelled, .undone → S-ASK.publish-confirm, S-ASK.published, S-ASKD.publish, S-DOC.list-shared | `askPublish` and told clip match; zero sends at 7.9s, one batch at 8.1s; Documents shows Shared with players |
| PB4 | PP6 | S-PP-PLAN print → S-DOC.print-coach, S-DOC.print-player, S-ASK.share-pdf | coach and player PDFs of one plan differ only by the Why lines; dark prints as light |
| PB8 | PP7 | S-PP-FORMAT → S-FMT.* (including S-FMT.see) | `fmtUpload`, `fmtSee` match; layout copied, content not; migration held |
| PB7 | PP8 | S-PP-BUILDER → S-BLD.*, S-BLDD.* | `bNew`, `bFill`, `bKeep`, `dbFill`, `dbKeep` match; nothing applies until kept |
| PB6 (part) | PP9 | S-PP-PLAYER → S-PLY.* | `pNotify`, `pOpen` match; the player payload has no Why, Aim or teammate figure |

Open items closed here:
- PB-INT-11: the component is `parts/AskFirst.tsx`, wrapped by `chat/plan/PlanIntake.tsx`.
- PB-SAV-06: folder by name (default 1).
- PB-PUB-06: "Publish to 11 people".
- PB-PLY-05: no Aim for players (default 7).

Every PR also meets SHARED-8, SHARED-9 and SHARED-10, and SHARED-11 (players never see teammates' figures).

---

## 17. Not verified here

- The AI SDK names in `ai` ^7.0.128 and `@ai-sdk/react` ^4.0.131: `hasToolCall`, message `metadata` on `sendMessage`, and the client tool-output method. node_modules is not installed, so they could not be checked. §4.2 is built to need only `metadata`.
- Whether the golf message send path can skip its own push for some recipients (§7.6).
- Staging data (no query was run). See `03-DATA-CHECKS.md` for the SELECTs.
- `05-SCREENS.md` itself was not read here. The families are confirmed, but each screen's exact id is that file's.
- `coachhelm/TASK_FIELDS.md` §5.15 (fields) was not reread for this file. Ask first asks only for length, focus and who, plus the folder on save. Check it against §5.15.
- The Tour three-putt value (`TOUR_THREE_PUTT_METRIC = 'three_putts_per_18'`, `load-angle-data.ts:47`) was located but its number not read.
- Whether `clubhouse:check` needs a manifest change for `screens/coachhelm/plan/` (it is under the P013 root, so it should not).

## Completeness pass, 4 Nov 2026

What this pass settles across the lane, N-00 (`../prerequisites/N-00-practice-plan-builder.md`), N-10 (`../prerequisites/N-10-documents.md`), the Ask lane and the quick chat. The rules below win over 02's body where they differ; each place they change an earlier line is fixed in place and logged in the last table. Screens for the N-00-only parts are S-PRC.* in `05-SCREENS.md`'s section of this name; the criteria are CP-PP-1 onward in 08.

### C.1 One drill bank

- Every new drill, from the builder (N-00 4.7 drill sheet), the Ask tab (AK11e `create_drill`) or the quick chat, lands in N-00's `golf_team_drills` (held `20261026010100`) through `createTeamDrill`. A GolfHelm library drill is copied in with `copyLibraryDrill`. Edit, archive and restore are `updateTeamDrill`, `archiveTeamDrill`, `restoreTeamDrill` (`practice-library.ts`, N-00 §8.15). Nothing writes `golf_drills`.
- The Ask lane's HM5 `20261101090400_golf_drills_team_bank` (team_id and write policies on `golf_drills`) is **superseded**: not written, not listed as held. AK11e's `create_drill` registers only when `golf_team_drills` exists.
- Reads: PP1's drill bank read and PP3's drill ids read `golf_team_drills` (team scope, archived hidden) first, then `golf_drills` for library picks, once 010100 is applied. Before it, they read `golf_drills` only, the step reads "Reading the drill library", and New drill anywhere is inert with "Drill bank comes with the Practice tab".
- A plan block points at a drill by `{source: 'team' | 'library', id}`; publishing freezes the card into the version (N-00 010600), so archiving or a library removal never changes a published plan.

### C.2 One folder model

- A folder is the name in `golf_documents.folder` (1 to 60 characters, trimmed, default "Practice plans"). No folder ids, no nesting, no `create_folder` and no `parent_id`. Ask AK9 (`save_document(artifact_id, folder_id)`, `create_folder(parent_id)`) changes to `folder` by name; that is a change in the Ask lane, listed in this lane's report.
- Ask, the builder and the quick chat all save through `savePracticePlanDraft({..., folder})` (§6.2). A plan row may sit in any coach folder. Publishing keeps the row's folder. A new plan made in the builder (N-00 4.3 "Create plan") files its row in "Practice plans".
- N-10's `golf_document_folders` (090200) is optional later. When applied, its rows are names; the name stays the link; a save that names a new folder inserts the folder row, and Undo removes that folder row only if this save created it and it is empty.
- N-10's `20261026090300_golf_documents_plan_folder_check` forces plan rows into "Practice plans" only. It must be narrowed to "no uploaded file sits in Practice plans" (plan rows can live in any coach folder), and N-10's plan menu gains Move. Nick's 31 Oct ask ("saving into folders") is later than N-10's 25 Oct design. This is a shared call for Nick (lane report, section 5); until it is made, 090300 stays held. (fixed 4 Nov wiring: Nick confirmed it, DECISIONS "Folders" row, "Keep all three", 4 Nov 01:49 UTC; 090300 is narrowed in N-10 8.5 this pass.)
- Copy that names "Practice plans" for a published plan names the row's own folder ("Published · Documents › Hargrove week"), and the plan page's `?from=docs` back link returns to that folder, not always to `folder=practice-plans`.

### C.3 One plan object, one renderer

- One `golf_practice_plans` row per practice event (N-00 010000 unique index), one `PlanBodyV2`, one Documents row with `practice_plan_id` (010400). Ask's artifact, the quick chat card and the builder all edit that body.
- `PracticePlanSheet` (default 11) is the one plan body on screen and on paper. N-00's `PlanPage.tsx` renders it; N-00 4.10's type-only document layout is replaced by it (group discs and tints, block rows, the time bar), restyled per DESIGN_LANGUAGE. N-00's print studio extras stay N-00's: the landscape range board, pocket cards, the drills appendix and the QR, each drawn in the sheet's type and tokens.

### C.4 Drafts in Documents

- The lane wins over N-00 (which files only published plans): a draft is filed at once as a coach-only row (`is_public` false, chip "Draft · Only coaches"). Opening it from Documents shows the plan page in its coach draft view, with Edit to the builder. Players never see a draft row (RLS and the reader filter).

### C.5 Publish, republish, take down and who hears

| Action | Surfaces | Path | Who is told, and when |
|---|---|---|---|
| Publish | Ask publish card (PP5), plan page Publish sheet (N-00 4.11), builder Review | N-00 `publishPracticePlan({notify: 'defer'})` (13.2 item 2), then `releaseNotify` (§7.3) | Every player in the plan's audience plus coaches: one push (Events category) and one bell row after the 8s Undo window; the chat text post after the window (default 4) |
| Undo inside 8s | the receipt (Ask) or the toast (plan page) | `undoPublish` | No one; the plan goes back to draft and the row to `is_public` false |
| Edit after publish | builder | autosave to the draft body; the plan page shows "Edits not published" | No one until Republish |
| Republish | plan page | N-00 Republish sheet with What changed (`diffVersions`); default "Only affected players" | Only players whose group, stops or times changed; a wording-only change tells no one ("Republished. No one was told.") |
| Take down | plan page menu | CH-17502 confirm | Every player who had it, once |
| Delete | plan page menu | CH-17501 confirm | No push; the chat card reads "This plan was deleted" |

The quick chat never publishes. Players are re-notified only by Republish with affected players or by Take down.

### C.6 A plan needs a practice event

`golf_practice_plans.event_id` is NOT NULL for kind 'event'. Every surface that makes a plan for a day with no practice event runs the event confirm (TASK_FIELDS §5.1) first; Save turns on once the event commits (Open or Save commits its hold early). This reverses the Ask lane's order (Save, then "Want it on the calendar?"); the Ask lane's change is in this lane's report. An all-day or cancelled practice can't take a plan (CH-17110, CH-17117).

### C.7 Builder rules this lane sets over N-00

- Block delete runs at once with an 8s Undo toast ("Deleted Short game rotation · Undo") in the draft; N-00's CH-17507 confirm is dropped. Plan delete keeps CH-17501. Template and group delete keep CH-17506 and CH-17511.
- Groups D to F (N-00 allows 6): D is slate `--gD` #435466 with a white letter (7.78:1), dark #9FB0C2 with a #0E120F letter (8.51:1), tints #E8ECF0 / #1F252B; E and F use the neutral coin #5F5C55 (white 6.67:1) / #ADA697 (#0E120F 7.8:1), tints #EFEDE7 / #24261F. N-00's ochre C and plum D are replaced (C plum, settled). Groups are always told apart by their letter, never by colour alone.
- Players' print and share: players get the player copy of `PracticePlanSheet` with Share PDF (S-PLY.plan), no link and no image. N-00's coach share (copy link for the team only, CH-17018; share image 1080 × 1350; no public link) stays coach-only.

### C.8 Flags and entry points with either flag off

| Entry | `golf_practice_plans` off | `coachhelm_practice_plans_v1` off | both on |
|---|---|---|---|
| Practice tab, nav, G P, Cmd 4 | absent; routes redirect to Calendar (N-00 0.2) | tab present, no CoachHelm helper | as drawn |
| Ask "Make a practice plan" | the plan card drafts (PP3); Save and Publish inert "Comes with the Practice tab" | no plan tool; Ask answers it can't make plans yet | as drawn |
| Quick chat plan tile | card drafts, Save inert | no tile | as drawn |
| Builder helper (PP8) | no builder | builder without the helper card | as drawn |
| Push or bell deep link `/practice/plan/<id>` | redirect to Calendar | plan page as N-00 | plan page |
| Documents plan row | hidden by the reader filter (no file) | shown | shown |
| Calendar Plan row | absent | present | present |

### C.9 Prerequisites, in order

| Step | What | Held migrations it needs applied | Unblocks |
|---|---|---|---|
| 1 | N-00 slice 0: migrations written, flag, catalog page 17, `model.ts`, `starters.ts` | writes all nine: 20261026010000 to 010800 (none applied yet) | nothing visible |
| 2 | N-00 slice 1: tab, home, New plan sheet, builder frame, Blocks, templates and starters, autosave | 010000, 010300, 010500 | S-PRC home, new plan, Blocks rows |
| 3 | N-00 slice 2: Groups, Drills, drill bank, drill page, block templates | 010100, 010200 | PP8 (with slice 1); the one drill bank |
| 4 | N-00 slice 3: Review, publish, Documents shim, push and bell, chat card, Calendar Plan row, Home lines, delete (needs PR 2362) | 010400, 010600 (apply all nine after this PR is on main) | PP4 and PP5 |
| 5 | N-00 slice 4: republish, Now and Next, Run view, rain; `use-plan-live.ts` | 010700 | PP9 |
| 6 | N-00 slice 5: print studio and share | none new | alongside PP6 |
| 7 | N-10 slices 0 and 1: library shell on today's data | none | any time |
| 8 | N-10 slice 2: pins and opens | 090000, 090100 | optional |
| 9 | N-10 slice 3: folder table | 090200 | optional (names already work) |
| 10 | N-10 slice 4: practice plans in Documents (needs N-00 slice 3, 010400, 010600) | 090300, narrowed as C.2 | S-DOC.list-* in N-10's library |
| later | N-00 slices 6 to 9 (week templates, make-ups 010800, recap, Stats) | 010800 for slice 7 | none in this lane |

This lane's own held migration stays PM1 `20261102090000_golf_practice_plan_formats` (PP7). N-00 and N-10 set `preview: true, development: true` on their flags; the package rule SHARED-8 (off everywhere) wins.

### C.10 Fixed in place this pass (log)

| File | Where | Was | Now |
|---|---|---|---|
| 02 | §6.3 Failed save | a glyph in secondary ink (amber is for losses only) | amber glyph, kit ⑤ (05 and 08 win) |
| COACHHELM_PRACTICE_PLAN.md | §5 Server (kit) line | folders table, `folderId` | folder by name |
| COACHHELM_PRACTICE_PLAN.md | "Where it lands" Save draft row | `save_practice_plan` with `folderId` | `savePracticePlanDraft` with `folder` |
| COACHHELM_PRACTICE_PLAN.md | Groups line | C ochre | C plum |
| 05 | rows reading "Not a state of this element; the parent screen owns it." | no parent named | not edited row by row; 05's section names each parent (the S-PRC.* map) and gives its states |

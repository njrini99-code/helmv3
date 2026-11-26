# CoachHelm agent kit: steps, task visuals, confirm, receipt, undo (draft 2, 31 Oct)

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 18 rows).

> Wiring, 4 Nov 2026: see the section of that name at the end of this file (K-16 to K-27).

Shared by three CoachHelm lanes so they read as one product: the full Ask tab, the top-bar quick chat (lane 5, this file's owner), and the practice plan wizard. Everything here sits on `../DESIGN_LANGUAGE.md` (flat page, one card style, amber for losses, 4.5:1 floor with 4.9:1 target, shared springs, Reduce Motion, no accent left borders, text follows iPhone Text Size).

If your lane needs something different, add it under "Lane notes" at the bottom with your reason, and keep the parts below unchanged so the three surfaces match.

Grounded in today's code (helmv3 main): `src/lib/coachhelm/v3/chat/agent-tools.ts` (CONFIRM_REQUIRED_TOOLS, PROGRESS_LABEL, data parts `progress`, `action-proposal`, `action-receipt`), `src/clubhouse/screens/coachhelm/chat/Thread.tsx` (the `.ch-th-steps` list), `ActionCard.tsx` (`AskActionCard`, `AskReceiptCard`), `shell/AskSheet.tsx` (the CH-1840 top-bar key).

## 1. The five pieces, in the order a task runs

```
You type   →  ① Steps   →  ② Task visual (the draft assembling)  →  ③ Confirm  →  ④ Commit  →  ⑤ Receipt (+ Undo)
```

### ① Steps (the run)
- One list per turn. A row per step the server has actually announced (a `data-progress` part). Never invent future steps, never a percentage (today's rule in Thread.tsx, kept).
- Row: 20pt glyph + label, 15/20 meta type. Height 32pt. No card of its own: it sits inside the turn, above the task visual.
- Glyph states: active = 8pt green dot (`--ch-accent`) breathing 1.0→0.6 scale every 1.2s; done = 14pt check that draws its stroke in 240ms (`--ch-ease`); failed = amber ring with a bar (`--ch-loss`), never red (red is under par only).
- Label: present tense while active, in the coach's words, naming the real object ("Checking Thursday on the team calendar", "Finding Jonah on your roster"). When done it changes in place to past tense plus the one fact it found, in secondary ink ("Checked Thursday · lift ends at 2:45"; Linear's Searching → Searched). No tool names, no "Thinking".
- Stop: while steps run, the composer's send button is a Stop square (ink fill). Stop ends the run, marks the active step with a dash, and says "Stopped. Nothing was saved." Steps only read until Confirm, so a stop never leaves half a write.
- Active label carries a slow shimmer (the existing `--ch-dur-shimmer` 1.9s) that is the only "working" signal. No ticking timer beside it.
- When the turn ends the list collapses to one receipt line: "4 steps · 3s", a chevron reopens it. Collapse = height spring 260ms then fade.
- Reduce Motion: no breathing, no shimmer, no stroke draw. Check appears; collapse is a `CH_FADE_MS` crossfade (180ms today).

### ② Task visual (the thing being made)
- The draft is drawn as the real object it will become in the app, at small scale, inside one card: a calendar event chip on a day strip, a message bubble in a thread, a qualifier card with its round dots, a practice plan with its block bars. Not a form, not a table of fields.
- It assembles as the fields arrive. A field that is not known yet is a quiet skeleton bar (well colour, `--ch-well-bg-flat`), and becomes its value with a 6px rise + fade (260ms, `--ch-ease`). Order follows the data, never a fake stagger.
- One "write head" marks the field being filled: a 2pt green caret after the text for typed fields, a soft green ring for a slot (a time block, a player coin).
- When every field is in, the card settles (scale 0.98→1, `settle` spring 260ms, bounce 0.1) and the Confirm row appears under it.
- Missing but optional fields stay visible as "Not set" in secondary ink, so the coach sees the gap before confirming.
- Reduce Motion: the card appears filled; skeletons swap to values with a `CH_FADE_MS` crossfade (180ms today).

### ③ Confirm (nothing writes before it)
- Every write shows Confirm first (CONFIRM_REQUIRED_TOOLS today: recurring practice, focus area, task, team update; new tools join the list).
- Anatomy, inside the task visual's card, under a hairline:
  - One line "On confirm: …" saying exactly who hears about it ("9 players get an invite", "Nothing is sent").
  - Buttons: Cancel (ghost) on the left, primary on the right named verb + object: "Add to calendar", "Send to 9 players", "Set qualifier", "Save plan". Never a bare "Confirm".
  - A message is sent by the coach's own press of "Send", not by the app. The draft never sends itself.
- Both buttons lock after the first tap (today's ActionCard rule).
- Edit: tapping any field in the visual opens it inline (the same picker the app uses: time wheel, roster picker). The draft updates in place; it does not re-ask the model.

### ④ Commit (the task happening)
- The primary button morphs into a progress capsule: label crossfades to "Adding…", a thin green sweep runs under it (`--ch-dur-sweep` 900ms loop) until the server answers.
- On success the object travels to where it lives: the event chip lifts (scale 1.04, shadow up), flies along a short arc into its day cell on a mini week strip (462ms smooth spring), and the cell takes it with a soft bump. Message bubble: slides up into the thread and gets its "Delivered" line. Qualifier: the card stamps into the qualifiers list. Plan: the plan card files into Documents.
- Reduce Motion: no flight. The capsule shows a check and the destination appears with a `CH_FADE_MS` crossfade (180ms today).

### ⑤ Receipt, undo, failure
Nick, 31 Oct: "a lot more attention on how it looks completing tasks". Finishing has four beats, each under half a second: Working (capsule + sweep), Lands (object flies home; the card's edge flashes green once, an inset 2pt accent ring at 60% fading out over 900ms, opacity only; the Draft chip springs to Added / Sent / Set / Saved), Receipt (below), Told (below).
- Receipt row replaces the confirm row: 22pt green check disc whose check draws itself (300ms) while the disc sends out one soft ring (scale 1→1.9, fading, 620ms), one line "Added to calendar · Thu 30 Oct, 3:00 PM", an "Open" link (goes to the real screen), and "Undo" for 8 seconds.
- Undo shows a thin ring around its icon draining over the 8 seconds (stroke-dashoffset, linear). It is the only countdown.
- Notifications wait for the undo window: players hear nothing until the 8 seconds pass, so Undo never has to un-notify anyone.
- Told: when the window closes, Undo fades and a well row slides in under the receipt: player coins (year colours) light up one by one, 90ms apart, in the order delivery events arrive, with a small green dot on anyone who has seen it, then "9 players got it on their calendar" / "Delivered to 6. Seen by 2." A private write (a plan draft) says "Only coaches can see it. Players are told when you publish." (fixed 4 Nov: was "Only you can see it."; a draft is visible to the team's coaches, K-5)" Reduce Motion: all coins at once.
- After Undo: "Undone. The event was removed." secondary ink, the object animates back out of its cell (reverse of the flight, 280ms).
- Failed: amber glyph, "Couldn't add the event. Nothing was saved." plus "Try again" (secondary button). Partial: amber, lists what failed, "Check what was created before you try again." (today's receipt copy, kept).
- Cancelled: "Cancelled. Nothing was created." secondary ink, the draft dims to 60% and stays readable.
- The receipt is durable (persisted `action-receipt`), so reloading shows the same row without the Undo once the window has passed.

### ⑥ Ask first (question card)
- Used when a write needs choices the request did not give. First user: practice plans (Nick, 31 Oct: "it should ask you what you want in the practice plan and then create it"). The practice plan wizard opens with the same card.
- One card in the turn, after the first read step: a question title ("What should Tuesday cover?"), a one-line hint, then 2 to 3 chip groups (How long: 60 min / 90 min / 2 hours; Work on, several allowed: Putting / Wedges / Driving / On course; Who: Everyone / Travel squad / Pick players). Chips are 36pt pills, selected = accent fill with ivory label. Anything the request already said comes ticked.
- Primary "Build the plan" stays dim until each group has an answer. On press the card folds into the coach's own bubble ("90 min · putting, wedges, on course · everyone") and the run carries on.
- Never asks what the request already answered; never more than three groups.

### ⑦ Save to a folder
- Any write that makes a document (plan, later reports) shows a "Save to [folder ⌄]" row above the confirm, defaulting to the last folder used.
- It opens a list in place inside the card (not a popover): folders with counts, a check on the chosen one, then "New folder". New folder becomes a name field with Create (Enter creates, Escape closes); the new folder appears at the top, already chosen, and the "On confirm" line names it.
- Landing: the page drops into the folder icon on a short arc (462ms), the folder squashes 1.08 × 0.94 and settles, the count ticks up. Receipt: "Plan saved · Documents · Fall season".
- ~~Server: a folders table and `create_document_folder`; `save_practice_plan` takes `folderId`. A folder made here and left empty by Undo is removed with the plan.~~ (fixed 4 Nov: neither exists. A folder is the name in `golf_documents.folder`, 1 to 60 characters; `savePracticePlanDraft` takes `folder` by name. A new folder exists only once the save writes it, so Undo leaves no empty folder. See "Completeness pass, 4 Nov 2026" K-2.)

## 2. Motion table (all from `tokens.css` / `lib/motion.ts`)

| Moment | Duration | Curve | Reduce Motion |
|---|---|---|---|
| Step row in | 260ms | spring `settle` (bounce .1), height then fade + 6px rise | `CH_FADE_MS` fade |
| Active dot breath | 1.2s loop | ease-in-out | static dot |
| Check draw | 240ms | `--ch-ease` | instant |
| Field resolves | 260ms | `--ch-ease`, 6px rise | `CH_FADE_MS` crossfade |
| Draft settles | 260ms | `settle` | none |
| Button → capsule | 280ms | `smooth` spring (width) | `CH_FADE_MS` crossfade |
| Object flies home | 462ms | `--ch-ease-spring-smooth` arc | `CH_FADE_MS` crossfade |
| Card edge flash | 900ms once | `--ch-ease`, opacity | none |
| Check draw + ring | 300ms + 620ms | `--ch-ease` | check shown, no ring |
| Plan into folder | 462ms + settle bump | `--ch-ease`, `settle` | `CH_FADE_MS` crossfade |
| Players told | 90ms apart | `settle` each | all at once |
| Undo ring | 8s | linear | linear (it is a timer, not motion) |
| Steps collapse | 260ms | `smooth` | `CH_FADE_MS` crossfade |

Animate transform and opacity only, except the step list's height, which uses a FLIP transform.

## 3. Copy rules
- Sentence case. No "AI", no "agent", no "tool". CoachHelm speaks as itself.
- Step labels: present participle + real object. Done: same words.
- Buttons: verb + object. Receipts: past tense + where + when.
- Amber for failure and losses; red never appears in the agent UI.

## 4. Colours (light / dark), all on the card
- Active dot, check, primary button: `--ch-accent` #155A39 / #7CC79B (8.2:1 / 8.5:1 on card)
- Failed: `--ch-loss` #9A5700 / #E7AE57 (5.6:1 / 8.5:1)
- Skeleton bar: `--ch-well-bg-flat` #F6F4EE / #141815 (marks only, no text)
- Write head ring: `--ch-accent` at 35%
- Step text active: `--ch-text-primary`; done: `--ch-text-secondary` (9.8:1 / 10.3:1)

## Lane notes
- Lane 5 (quick chat, top bar): uses all seven pieces inside the Glass drop-down from the top-bar Helm key (Nick's pick, 31 Oct). Package: `README.md` in this folder (05 to 08, PRs QC0 to QC6); live page: `redesign/quick-chat.html`. The glass is only the frame; the kit pieces inside sit on solid surfaces.
  - Messages: the quick chat draws the draft in the real thread on its task card, and the card's "Send to N players" is the coach's own press, sent through `sendGolfMessage` under the same 8 second server hold as the other writes (TASK_FIELDS §3, §5.4). Ask hands the draft to the Messages composer. Both keep the coach as the sender.
- Lane 4 (Ask tab, full chat): uses all five pieces as written. Page: `../ask/coachhelm-ask.html`, spec: `../ask/ASK_REDESIGN.md`. Ask-only additions, none of which change the shared parts:
  - A done step keeps one short line of what it read ("38 rounds so far", "7 active players"). Reason: Ask answers cite their data, so the trail doubles as the evidence.
  - Read chips in the answer text ("Putting · last 30 days") open a popover with the window, sample and computed time, plus a Sources row under the answer. Reason: the evidence rule.
  - Artifact shell: a card in the stream; desktop opens a right pane (452px, 462ms smooth) with footer actions Edit in builder, Save draft…, Publish…; phone pushes it as its own screen with "< Ask" and a dock (Save draft…, Publish…), matching lane 6. Version arrows "1 of 3", its own footer actions. Lane 6 is free to adopt it for the practice plan.
  - Composer: glass pill with a scope line, @ for players and / for actions. Tone switch: Straight, Detailed, Team talk (coach); players default to an encouraging voice.
  - A "Waiting for you" step row (accent ring) when a turn stops at Confirm.
  - Uses lane 6's Ask first and Save to a folder. ~~Ask's version pages the questions one at a time (dots, Back, Next, "Skip, just build") and folds to answer pills with "Change answers"; Save now follows ⑦ draft 2 exactly (inline row, list in place, New folder with Create). If lane 6 prefers one card with every question, Ask will match it.~~ (fixed 4 Nov: Ask adopted lane 6's one-card brief, `ask_practice_brief` with every question on one card, folding to the coach's bubble. Save is ⑦ with the folder by free-text name through `savePracticePlanDraft`; Undo calls `undoPracticePlanDraft`; publish Undo is `undoPublish`, which returns the plan to draft. See K-1 to K-6.)
  - Receipts follow ⑤ draft 2 as written: card edge flash, check ring, Draft chip to Added / Saved / Set / Published / Sent, and the Told row (coins in arrival order, seen dots; private saves say only you can see it (fixed 4 Nov: a plan draft says "Only coaches can see it.", K-5)).
  - Player Ask has no writes (Nick's call), so it never shows Confirm; the one exception is Request more when the weekly allowance runs out, which uses ② to ⑤ as written.
- Lane 6 (practice plans in Ask and the builder): uses all seven pieces as written, and the Ask lane's artifact card and desktop pane. Page: https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5, spec: `../practice-plan/COACHHELM_PRACTICE_PLAN.md`. Lane-6-only additions, none of which change the shared parts:
  - ⑥ Ask first: each group has a one-line source under it ("Your stats point at the first two", "Your calendar has 2:00 to 5:00"). Reason: the CoachHelm evidence rule; guesses come only from this turn's reads.
  - Each finished read step shows a small chart of what it found (week strip, strokes gained by area, make rate by distance, class timeline, drills fanned from the bank). Reason: Nick's "a lot more attention on how it looks completing tasks".
  - The plan card writes itself: an outline of every block, the write head moving down it, titles typing in (② applied to a long object).
  - Told: now matches the kit, 90ms apart in arrival order (Reduce Motion: all at once).
  - Phone: the full plan opens as a push screen ("‹ Ask") with a dock, not a sheet, because it is a long document the coach reads and publishes from. Lane 4 has offered to match.

## Completeness pass, 4 Nov 2026

Additive only: nothing in sections 1 to 4 was removed. Two lines were fixed in place (⑦ Server and ⑤ Told, each marked "fixed 4 Nov"); the original text stays struck through. The Ask lane reads this file and does not edit it this pass; lane 6 follows it. Every row below holds for all three surfaces.

### Settled for every lane

| # | Piece | Settled | Why |
|---|---|---|---|
| K-1 | ⑦ Save to | the list shows the team's folder names from `golf_documents.folder` with counts (drafts counted, coach scope), last used first | one folder model (practice-plan default 1) |
| K-2 | ⑦ New folder | 1 to 60 characters trimmed; a duplicate (ignoring case) shows an amber line and points to the existing one; "Team" can't be made (N-10 CH-10162); the name exists only once the save writes it | N-10 §4.8, `savePracticePlanDraft` |
| K-3 | ⑦ server | `savePracticePlanDraft({..., folder})` for every surface; one `golf_practice_plans` row and one Documents row with `practice_plan_id` | same plan object from Ask, the builder and the quick chat |
| K-4 | ⑤ plan draft Undo | the draft saves at once and Undo deletes it (or restores the previous version on a re-save); the ring still runs 8s; the server allows 10s for skew | practice-plan default 9 |
| K-5 | ⑤ plan draft copy | "Only coaches can see it. Players are told when you publish." | drafts are `is_public` false |
| K-6 | ⑤ publish | every surface publishes through N-00 `publishPracticePlan` with `notify: 'defer'`; the 8s Undo is on the receipt or toast; push, bell and the chat text go out after the window | practice-plan default 3; DECISIONS on deferred sends |
| K-7 | ⑤ republish | tells only affected players; wording only tells no one ("Republished. No one was told."); take down tells once | N-00 §4.11 |
| K-8 | ⑤ failure | amber (`--ch-loss`), never red, and never secondary ink for the failed glyph; this replaces the practice-plan 02 §6.3 line that said secondary ink | §4 Colours |
| K-9 | ⑤ failure haptic | `haptic('warning')` on a failed write; `haptic('success')` on a landed write; `haptic('press')` on the primary | coachhelm 07 Haptics |
| K-10 | ③ inert | while a write can't run (flag or held migration), the primary is the same size and reads what it waits for ("Comes with the Practice tab"); no network call; no press dip | coachhelm CP-QC-11 |
| K-11 | ③ offline | the primary is disabled with "You're offline. Nothing was saved."; nothing sends by itself when the device is back | coachhelm CP-QC-22 |
| K-12 | ① Steps, drills | the drill read says "Reading the drill bank" over `golf_team_drills` once 010100 is applied, and "Reading the drill library" over `golf_drills` before | one drill bank |
| K-13 | ④ Commit, plan needs an event | a plan for a day with no practice event runs the event confirm (TASK_FIELDS §5.1) first; Save commits the event's hold early | N-00 010000 |
| K-14 | ⑤ Open, plan | Open goes to the plan page `/golf/dashboard/practice/plan/<id>` with `?from=` naming the surface | N-10 §4.10 |
| K-15 | ②, ⑤ VoiceOver | steps and receipts are polite live regions read once; Undo's name carries the seconds left, updated every 2 seconds | coachhelm CP-QC-31 |

### Log of kit edits this pass

| Date | Edit | By |
|---|---|---|
| 4 Nov | ⑦ Server line fixed in place (folder ids and `create_document_folder` struck through; folder by name) | lane 5, completeness pass |
| 4 Nov | ⑤ Told plan-draft copy fixed in place ("Only coaches can see it.") | lane 5, completeness pass |
| 4 Nov | This section added (K-1 to K-15) | lane 5, completeness pass |
| 4 Nov | Lane 4 note fixed in place: Ask uses the one-card brief and the free-text folder save; plan-draft copy | lane 5, completeness pass, on the lead's note that Ask adopted both |
| 4 Nov | "Wiring, 4 Nov 2026" section added (K-16 to K-27, the server contract behind each piece), checked on helmv3 03d9087 | lane 5, wiring pass |

## Wiring, 4 Nov 2026

The server contract behind each piece, the same for the Ask tab, the quick chat and the practice plan wizard. Checked against helmv3 main 03d9087 by reading code only. Row detail lives in `ask/06-SCREEN-SPECS.md` and `coachhelm/06-SCREEN-SPECS.md`, both under "Wiring, 4 Nov 2026".

| # | Piece | Contract | Source |
|---|---|---|---|
| K-16 | ① Steps | a step is a `data-progress` part the server wrote (`agent-tools.ts:239-245`); the label table is `PROGRESS_LABEL` (:144); a failed read is `unavailableEnvelope` (:220) and draws amber. The client never adds a step | Ask AK1 |
| K-17 | ② Task visual | the draft comes from the proposal part (`proposeGated`, `agent-tools.ts:317`, ledger `recordProposal`, `action-runs.ts:96`, status `proposed`); field edits in the card change the proposal input, they do not re-ask the model | Ask AK4 |
| K-18 | ③ Confirm | a write is in `CONFIRM_REQUIRED_TOOLS` (`agent-tools.ts:102-107`: recurring practice, focus area, task, team update today); new write tools join it only under `coachhelm_ask_v2`. Both buttons lock on the first press; the server claim is UNIQUE `(coach_id, idempotency_key)` | `20260725170000:78` |
| K-19 | ④ Commit | the press moves the ledger row to `held` with `run_at = now() + 8s` (HM1, `ask/held-migrations/20261101090000_coachhelm_action_runs_hold.sql`, written, not applied) and returns the held receipt; nothing is written to the domain table and nobody is told yet | Ask AK4 `holdForExecution` |
| K-20 | ⑤ Undo | `DELETE /api/coachhelm/v3/chat/actions/[key]` sets `cancelled` only while `run_at > now()`; 0 rows means "Too late to undo. It's done. Open it to change it." | Ask AK4 `cancelHeld` |
| K-21 | ⑤ Release | `after()` in the stream route (the route must import `after`; it imports only `NextRequest` and `NextResponse` today), then `sweepHeld` on the next chat request, then the client's ring end; the state compare `held` to `approved` makes it run once | Ask AK4 `releaseHeld` |
| K-22 | ⑤ Receipt truth | success is a read-back of the domain row, never `ActionResult` alone: `updateTag` works only inside a Server Action (`app/admin/actions/triage.ts:38-39`) and the actions call it after their insert, so a cache error from a route can follow a committed write | every executor |
| K-23 | ⑤ Told | counts come from `GET …/actions/[key]`, which reads delivery with the admin client (players' `notifications` rows are own-only): bell rows by object id, `golf_event_attendance` for events, `golf_announcement_acknowledgements` for "n of N acknowledged", `golf_conversation_read_marks` for "seen". A read that fails drops the coins, never invents them | Ask AK4 |
| K-24 | ⑤ Told, events | an event with RSVP off notifies nobody (`lib/calendar/rsvp.ts:268`, fan-out to invitees only when `requiresRsvp`, `calendar-events.ts:513`), so its Told line is "N players see it on their calendar" from attendance rows, with no coins for bell or push | owner, 8 Oct, in the code comment at `calendar-events.ts:505-506` |
| K-25 | ⑤ Not held | plan drafts (`savePracticePlanDraft`, writes at once, Undo deletes) and Messages drafts, polls and boards (prefill only, the coach sends in Messages) are not on the hold; publish is held by N-00 `notify: 'defer'`, not by HM1 | lane 6, Messages |
| K-26 | Without HM1 | only today's four writes show, at once, through today's card, with no Undo; no create flow that tells players is offered (Ask S-ASK.kit.no-hold, coachhelm 05 HM1 row) | Ask 05 CP-D |
| K-27 | Player Ask | players get no write tool; Request more holds on its own row (`ask_credit_requests.release_at`, HM4 `20261101090300`), because the action ledger is coach-only (`coach_id` NOT NULL, `coachhelm_action_runs_coach_only`) | Ask AK10b |

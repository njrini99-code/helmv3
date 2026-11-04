# CoachHelm quick chat: build plan (PR QC0 to QC6), against main 75b4956

> Completeness pass, 4 Nov 2026: see the section of that name at the end of this file (adds 8 rows).

Prep only. Draft PRs only. No push to main, merge, deploy, migration run or flag flip. Every PR sits behind `coachhelm_quick_chat_v1` (off in every environment) and, for anything that writes, behind the Ask lane's `coachhelm_ask_v2`. Flag off renders exactly as main. Nothing here changes what shot tracking collects, stores or sends.

Read first: `01-BRIEF.md`, then `05-SCREENS.md` to `08-ACCEPTANCE.md` (the build contract; they win over this plan on any value), `TASK_FIELDS.md`, `AGENT_KIT.md`, and the Ask lane's `ask/02-PLAN.md` (this lane rides on its AK PRs).

## 0. PR order

| PR | What | Depends on | Migration |
|---|---|---|---|
| QC0 Plumbing | flag, `pour` spring and token, preview `?qc=` and `&play=`, fixtures matching the design page, `QuickChatProvider` replacing `AskSheetProvider` behind the flag | AK0 | none |
| QC1 Helm key | Helm mark key in the bar's actions slot (phone and desktop), open/working/flag states, ⌘J, coach only | QC0 | none |
| QC2 Glass panel | `QuickChatPanel` (drop-down from the key on phone and desktop), scrim, header, hello, composer, open/close/retarget motion, close paths, keyboard rule | QC1 | none |
| QC3 Run in the panel | steps and fold, Stop, question cards (plan brief and the generic ask card used by the qualifier and any flow), reply line | QC2, AK1, AK9, AK11a | none |
| QC4 Task cards and finish | the four visuals (event, message, qualifier, plan) at panel width, confirm row, busy capsule, land moves, receipt with the 8s ring, told, undone, failed, cancelled, Open | QC3, AK4 (hold + HM1 held), AK11a/b | none of its own (HM1 is Ask's, held) |
| QC5 Live pill | key grows into the pill when the panel closes mid-task; work, wait, done, failed; shrinks back | QC4 | none |
| QC6 Capture and fidelity | `capture.mjs` states and clips wired to the preview, the six motion tests ported to Playwright, flag-off parity | all | none |

QC3 and QC5 can't start before their parents; QC6 grows with each PR (each PR adds its own states to the preview and runs its own rows of 08). Seven PRs; each is one reviewable diff.

Every PR also runs: `npm test`, `npx stylelint --config stylelint.clubhouse.config.mjs "src/clubhouse/styles/**/*.css"`, `npm run lint`, `npm run typecheck` once, `npm run flags:check`, and the capture rows its 08 section lists.

## 1. Files that must not change

| Path | Why |
|---|---|
| `src/clubhouse/shell/TopBar.tsx` outside the one line at :104 | SHARED-1: the bar stays pixel-identical except the key slot |
| `src/components/golf/coachhelm/chat/useCoachHelmChat.ts` | the chat hook is used as is (Ask lane owns any change) |
| `src/app/golf/actions/*` | server actions are called through the Ask lane's tools, not edited here |
| `src/clubhouse/screens/messages/*` | Messages lane; the quick chat only calls `sendGolfMessage` through the held run |
| shot tracking capture and save code | SHARED-10 |
| `src/clubhouse/shell/command/CommandLayer.tsx` | ⌘K stays the command layer's |

## 2. QC0: Plumbing

- `config/feature-flags.yml`: add `coachhelm_quick_chat_v1` (release, owner golf/coachhelm, default false, every environment false; purpose "the top-bar Helm key and Glass quick chat; flag off renders today's sparkle Ask sheet"). Copy `coachhelm_ask_v2`'s entry shape from AK0. Run `npm run flags:generate`, then `flags:check`.
- `src/clubhouse/lib/motion.ts`: add `pour: { visualDuration: 0.42, bounce: 0 }` to `CH_SPRINGS`, and add the quick chat's two listed staggers (content rise on open, told coins) to the header comment's exceptions, citing 07.
- `src/clubhouse/styles/tokens.css`: add `--ch-ease-spring-pour` as a `linear()` string generated the same way as `--ch-ease-spring-smooth` (07 gives the string) and `--ch-dur-pour` for its settle time; the Reduce Motion block zeroes it like the others.
- `src/clubhouse/data/shell.ts:140-175`: add `quickChat: boolean` = `askAvailable && flag('coachhelm_quick_chat_v1') && role === 'coach'`. No new read. (fixed 4 Nov wiring: on 03d9087 shell.ts has no `role`; `askOn` is already coach-only, computed only when `coachId` is set (:174). Set `quickChat: askOn && isFlagEnabled('coachhelm_quick_chat_v1')` in the return beside `askAvailable` (:265) and `classAwareness` (:266, same server-side flag read), and add `quickChat?: boolean` to `ChShellData` beside `askAvailable` (:49). The role check stays in the provider, as `AskSheetProvider` does it (`useClubhouseRole()`, `AskSheet.tsx:65-68`).)
- `src/clubhouse/shell/ClubhouseFrame.tsx:174`: when `shell.quickChat`, render `<QuickChatProvider>` (new) in place of `<AskSheetProvider>`; otherwise unchanged.
- New `src/clubhouse/shell/quick-chat/QuickChatProvider.tsx`: holds `open`, `run` (the current task id, step label, state work/wait/done/failed), `toggle()`, ⌘J / Ctrl+J listener (ignores when focus is in a text field other than the panel's composer), Escape when open. Re-exports `lookingAt()` from `AskSheet.tsx` (no copy). (fixed 4 Nov wiring: `lookingAt(pathname, search, trail)` takes three arguments, the third from `useCrumbTrail()` (`AskSheet.tsx:36-47`, called at :69-70). The provider, not the lazy panel, also holds the chat session: `AskSheetProvider` remounts `AskSheetBody` keyed by path (`AskSheet.tsx:97`) and closes on every path change (:89), and the stream route aborts generation when its request goes (`abortSignal: req.signal`, `app/api/coachhelm/v3/chat/stream/route.ts:571`). So `useCoachHelmChat` lives in a lazily loaded `QuickChatSession` that mounts once on `warm` and is never keyed by path or unmounted on the CoachHelm tab; otherwise a run dies on navigation and the live pill has nothing to follow.)
- Preview: `src/clubhouse/preview/PreviewQuickChat.tsx` and `fixtures-quick-chat.ts`. `?qc=<state>` on any coach preview screen opens the panel at that state with the design page's fixture values (03 lists them); `&play=<key>` runs the same scripted demo the page's Play button runs, with the same timings. The panel sets `document.body.dataset.qc` to the state it reached, as the page does, so `capture.mjs` can wait on it.
- Tests: flag off renders `AskSheetButton` and no Helm key (snapshot of the bar's DOM); `pour` exists in `CH_SPRINGS` and tokens.

## 3. QC1: Helm key

- New `src/clubhouse/shell/quick-chat/HelmKey.tsx`: a 44×44 `button` (`aria-label="CoachHelm"`, `aria-haspopup="dialog"`, `aria-expanded`), the Helm mark as an inline SVG at 24pt with stroke 1.7 (path data from the page's `helm()`), a disc span and a flag span. Keeps today's `warm` prefetch on pointer enter, focus and pointer down. `haptic('select')` on press.
- `TopBar.tsx:104`: `{quickChat ? <HelmKey /> : <AskSheetButton />}`. Nothing else in the file changes.
- Hidden on the CoachHelm tab (as today's key).
- Styles: new `src/clubhouse/styles/quick-chat.css` (imported by the provider). Values from 06 §S-KEY. States as classes `is-open`, `is-working`, `has-flag`.
- Desktop: the same component sits in the same slot; the tooltip "CoachHelm ⌘J" uses today's `title` pattern.
- Tests: coach sees the key, player has no node; `aria-expanded` follows open; ⌘J toggles; the bar's 98pt band pixel diff is zero outside the 44pt key slot (08 QC-KEY).

## 4. QC2: Glass panel

- New `src/clubhouse/shell/quick-chat/QuickChatPanel.tsx`, lazy-loaded like `AskSheetBody` (dynamic import on `warm`). Uses `useDialogLifetime` for focus trap, inert background and Escape; does not use `useSheetDrag`'s detents (fixed height), but keeps a swipe-up-to-close on the header and grab bar.
- Frame: a fixed `section role="dialog"`, positioned from the key's rect: phone 10pt from each side, top 104, height `min(700px, keyboardTop − 104 − 8)` (from `visualViewport`); desktop 432 wide, right 14, top 62, height 640. Glass fill, blur and shadow tokens from 06. The scrim is a sibling under it.
- Inside, all on solid surfaces: header (mark tile, "CoachHelm", context line from `lookingAt()`, expand and ×; both pad their hit area to 44), body scroller, composer. Hello: greeting, supporting line, four start tiles chosen by screen (`quickStarts(pathname)` new, 4 per screen; Calendar's are the drawn four), "Earlier today" from the latest receipt in today's thread (reserved height so it fills in without a jump).
- Composer: today's `AskComposer` restyled to the pill in 06, Stop while running, desktop hint row. Offline line from today's `subscribeOnline`. (fixed 4 Nov wiring: it is private at `shell/AskSheetBody.tsx:22`, with copies at `screens/coachhelm/chat/Ask.tsx:35` and `screens/classes/InClassSheet.tsx:34`. Export it from `AskSheetBody.tsx` and import it; no fourth copy.)
- Motion (07 M-OPEN, M-CLOSE, M-RETARGET, M-SCRIM, M-CONTENT): `transform-origin` at the key's centre in panel coordinates; open scales from 0.5 on `pour` with opacity reaching 1 early; parts rise 8pt, 30ms apart; close is the reverse in 220ms on `cubic-bezier(0.32, 0.72, 0, 1)` with content fading first. Retarget reads the current computed transform and opacity, cancels, and animates from there (the page's `hold()`), never from the start. Use WAAPI or `motion/react` with `CH_SPRINGS.pour`; no height, top or clip-path animation.
- Expand: "Open full chat" routes to today's CoachHelm Ask with the same conversation id. (fixed 4 Nov wiring: the link is `conversationHref(id)`, `?view=ask&c=<id>`, `screens/coachhelm/chat/History.tsx:34-36`; there is no `chat=` or `threadId` parameter.)
- Tests: every close path; closing doesn't cancel a run; panel height constant through a whole task (08 QC-PNL); no text node with a translucent background behind it.

## 5. QC3: Run in the panel

- Reuse the Ask lane's AK1 step list and fold (`Steps` part) with the panel's compact sizes (06 §S-RUN.steps). Step labels come from the server's announced steps only.
- Question cards: the Ask lane's AK9 practice brief card for plans (always asks length, focus, who), and a generic `AskFieldsCard` for the rest (AK11a create engine's "missing field" output): groups of pills, primary dim until each group is answered, folds into the coach's bubble. The qualifier uses it for coach's picks and tees (TASK_FIELDS §5.8); names and time zones use it too (TASK_FIELDS §2 rules 1 to 3).
- Stop: the send button becomes Stop while running; Stop cancels the stream, marks the running step stopped and writes nothing.
- Tests: zero or 2+ matches asks, never picks; Stop writes nothing; ask card answers fold to one bubble with the answers in order.

## 6. QC4: Task cards and finish

- Task card shell: the Ask lane's AK4 `ConfirmCard` (header, chip, fields, "On confirm:" line, Cancel and named primary) at panel width.
- Visuals, one component each under `src/clubhouse/shell/quick-chat/visuals/` (they may move to a shared `parts/` folder if Ask adopts them): `EventVisual` (week strip with the day lit, day rail with what's there, the new block), `MessageVisual` (thread head, draft bubble, tone chips Plain / Warmer / Shorter that redraft in place), `QualifierVisual` (round tiles, seats with "4 by score · 1 your pick", field coins), `PlanVisual` (time bar split into blocks, block list, "Save to [folder ⌄]" with the in-card folder list and New folder field). Values from 06; motion from 07 M-VISUAL-*.
- Commit, land and receipt: AK4's held run (`holdForExecution`, `releaseHeld`, `cancelHeld`; needs HM1, held). The receipt shows at once with the draining ring; the told row appears when the ring ends, built from the read-back receipt (`data-action-receipt`). Delivery order for coins comes from the notification rows' `created_at` (and `seen` where the table has it); never invented.
- Land moves (07 M-LAND-*) are transform and opacity on a cloned node (the page's `flyer`), removed when done.
- Message send (01-BRIEF call 7): "Send to N players" registers a held run whose executor calls `sendGolfMessage` with the coach as sender and `conversationId` (TASK_FIELDS §7 item 9). Undo inside 8s cancels it and returns the bubble to a draft. (fixed 4 Nov wiring: the signature is `sendGolfMessage(conversationId, content, clientMessageId?, replyToId?, opts?)`, `app/actions/messages.ts:808`. The executor passes `clientMessageId` = a uuid derived from the run's idempotency key, so a second release (ring end plus sweep) hits the 23505 path and returns the first message, never two. `opts.notifyAnyway` stays unset. The card's cap is 2000 although the action allows 5000 (`MessageSchemas.send`, `lib/validation/action-schemas.ts:75`).)
- Open: calls the hold's commit-now (`run_at = now`), waits for the receipt, closes the panel, routes (Calendar day with the event selected, Messages thread, Qualifiers, the plan page for a plan (fixed 4 Nov: was "Documents folder", see 05 S-OPEN)).
- Failed, partial, cancelled, undone as 05 and 06; amber, never red.
- Plan folders: ~~until N-10 folders land, "Save to Practice plans" with no menu (01-BRIEF call 6); the menu ships behind the same check Documents uses for folders.~~ (fixed 4 Nov: folders are names in `golf_documents.folder`, read with practice-plan's `listPlanFolders`; the menu ships with the plan save and does not wait for N-10. While the save can't run, the card is S-TASK.plan.inert.) The plan is the one kind that is not held: `savePracticePlanDraft` writes at once and Undo calls `undoPracticePlanDraft` (practice-plan default 9).
- Tests (fake timers): no push, bell, email or message at 7.9s; one at 8.1s; Undo at 7.9s leaves no row; Open commits early; receipts state only read-back values; the four visuals render every field the TASK_FIELDS matrix lists for that flow.

## 7. QC5: Live pill

- `HelmKey` gains a sibling `LivePill` in the same slot (the key hides while the pill shows). States work (spinner, step label), wait ("Needs your OK", champagne dot; the key keeps a flag after the pill shrinks), done (check, Added/Sent/Set/Saved, shrinks after 1.8s), failed (amber, "Didn't go through", stays). Tap opens the panel at the running task.
- Width: label max 172pt phone, 260pt desktop, one line, ellipsis. Grows from the key's centre with scale on `smooth`; never animates width. Never covers the bar title.
- Tests: pill follows the run's state; never present with the panel open; title not overlapped at 390 and XXL.

## 8. QC6: Capture and fidelity

- `capture/capture.mjs` (this package) is copied into the repo under `scripts/quick-chat/` unchanged; its `SHOTS` and `MOTION` tables are the list of states and moves. Each PR runs its rows.
- Port the design page's six in-page motion tests to a Playwright spec (`e2e/clubhouse/quick-chat-motion.spec.ts`) against the preview: close mid-open starts where the panel is; open mid-close; open holds frame rate (≤1 frame over 25ms); panel height fixed through a whole task; only transform and opacity animate (plus the Undo ring and check stroke); Reduce Motion is opacity-only at `CH_FADE_MS` (180ms today) or less.
- Flag-off parity: with `coachhelm_quick_chat_v1` off, today's Ask sheet shots match main pixel for pixel.

## 9. What waits on other lanes

- The hold (HM1, held) and the create flows: Ask lane AK4, AK11a/b. Quick chat writes stay off until both are in and HM1 is applied by Nick's say-so.
- Practice plans and folders: N-00 (held 010000, 010400, 010500 and slice 3) through practice-plan PP4. ~~Until then plans save as text documents with `is_public` false into "Practice plans" by name (TASK_FIELDS §5.15).~~ (fixed 4 Nov: until then the plan card is S-TASK.plan.inert and nothing is saved; the text-document save is practice-plan 02 §6.4's fallback, not the default.) N-10 is not needed for folders.
- `ChPrefill.conversationId` and the Messages send path: TASK_FIELDS §7 item 9 (Messages lane's 11a to 11g touch the composer; quick chat only uses the server action).

## Completeness pass, 4 Nov 2026

Build work for the rows 05's Completeness section adds, by PR. Nothing here adds a migration; the held ones stay held (SHARED-9).

| PR | Adds | Files | Waits on |
|---|---|---|---|
| QC2 | S-PANEL.full: same thread id, attach to a running stream, back label from the source route | `shell/quick-chat/QuickChatPanel.tsx` (router push with `threadId`), Ask screen's existing thread loader | Ask lane's thread route (exists today) (fixed 4 Nov wiring: push `conversationHref(id)` (`c=`). No stream resume exists: `useCoachHelmChat` has none and the route aborts on disconnect (route.ts:571). "Attach" means the Ask screen, when its `c` equals the provider's running conversation, renders from the provider's `QuickChatSession` through a new `useQuickChatRun()` context instead of starting its own hook, and switches to its own loader once the run ends) |
| QC3 | S-RUN.earlier fold at 30 turns; scroll and typed text kept per app session (module state, not storage); live regions for steps | `shell/quick-chat/Thread.tsx`, `useQuickChatSession.ts` (new, client) | none |
| QC4 | S-TASK.plan by flag (tile out, one-line reply, inert card); boot check for N-00's RPC; `savePracticePlanDraft` / `undoPracticePlanDraft` wiring; folder list from `listPlanFolders`; duplicate and reserved names | `visuals/PlanVisual.tsx`, `tasks/plan.ts` | practice-plan PP4 (its server actions), N-00 slice 3 and 010000, 010400, 010500 |
| QC4 | S-TASK.plan.needs-event: event confirm first, Save commits its hold (`commitNow(runKey)`) | `tasks/plan.ts`, AK4 hold API | HM1, Ask AK4 |
| QC4 | S-TASK.offline (`navigator.onLine` plus the stream's error), roster re-read at commit, idempotent Try again, ring from server `held_until` | AK4 `ConfirmCard`, executor | Ask AK4 |
| QC4 | S-OPEN plan route `?from=coachhelm&ret=`; S-OPEN.gone | `tasks/open.ts` | N-00 slice 1 (plan page route) |
| QC4 | drill request to `createTeamDrill`, or the pre-010100 line | `tasks/drill.ts` (registered only when `golf_team_drills` exists) | N-00 010100 and slice 2 |
| QC6 | `?qc=` fixtures: `confirm-plan&practice=off`, `plan-needs-event`, `confirm-cal&net=off`, `long-thread`, `dup-folder`, `reserved-folder`, `deleted`; `SHOTS` rows for each | `capture/capture.mjs`, `preview/fixtures-quick-chat.ts` | none |

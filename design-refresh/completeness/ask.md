# Lane report: Ask (CoachHelm Ask, coach and player)

Completeness pass, 4 Nov 2026. Folder: `pkg/design-refresh/ask/`. The shared files and other lanes' folders were not edited. AGENT_KIT.md was read and not edited.

Every changed lane file now has one `## Completeness pass, 4 Nov 2026` section at the end and a pointer under its H1. Those files are 01, 02, 03, 05, 06, 07, 08, README and ASK_REDESIGN. 04 is unchanged. Fixes made in place carry `(fixed 4 Nov: ...)`.

What was added:

| File | Added |
|---|---|
| 05 | 32 IDs (304 in all) and rule sets CP-A to CP-L |
| 06 | 12 pieces and 32 ID specs |
| 07 | M-ASK-90 to M-ASK-112 |
| 08 | CP-1 to CP-71, plus additions to Part 2 and Part 3 |
| 03 | CP-D1 to CP-D14 |
| 02 | where each new piece lands, by PR |

Log of the coordinator's request:
- **One drill bank.** HM5 `20261101090400_golf_drills_team_bank` is superseded by N-00 `20261026010100_golf_team_drills`. It is marked "(fixed 4 Nov: superseded by N-00 20261026010100; Ask's drill flow waits on that held migration)" in 02 and README. 01, 03, 06, 08 and ASK_REDESIGN say the same.
  - f_drill now writes `golf_team_drills` through N-00's `createTeamDrill`, or `copyLibraryDrill` for a library drill. That is the same path as the builder and quick chat (TASK_FIELDS §5.14).
  - The "Who can see it?" question is dropped, because the bank has no visibility column. A fixed line takes its place: "Only coaches see the drill bank. Players see a drill when a published plan uses it."
- **AK9 folders.** Ask now matches practice-plan default 1:
  - A folder is a name in the free-text `golf_documents.folder`. N-10's `golf_document_folders` later only adds empty folders, and the name stays the key. Nothing in Ask waits on N-10.
  - Save writes at once through `savePracticePlanDraft`, and Undo calls `undoPracticePlanDraft`.
  - Publish files at once and tells players after Undo closes. Undo (`undoPublish`) puts the plan back to draft with "Taken back. Nobody was told."
  - `draft_practice_plan` replaces `create_practice_plan`.

## 1. Matrix

| Item | Kind | States before | Gaps | What was added |
|---|---|---|---|---|
| f_event | create flow | reads to cancelled | failed, partial | IDs; CP-C copy; CP-22 |
| f_annc | create flow | reads to cancelled | failed, partial (push or email) | IDs; email clause follows the switch; CP-23 |
| f_travel, f_qual, f_goal | create flows | reads to cancelled | failed | IDs; CP-24 |
| f_board, f_poll | create flows (drafts) | reads to cancelled | failed; poll's held fix migration not shown | IDs; gallery tile; CP-25, CP-37 |
| f_lineup | create flow | reads to lock | set failed; lock failed; version clash | IDs; re-read before Try again; CP-26 |
| f_task | create flow | reads to cancelled | failed, partial (reminder) | IDs; CP-27 |
| f_note | create flow | reads to cancelled | failed; notes changed since the draft | ID; redraw rule; CP-28 |
| f_drill | create flow | reads to cancelled, written on golf_drills plus HM5 | wrong bank; question has no column; failed; name in use | rewritten on golf_team_drills; CP-40 to CP-42 |
| q_block, q_break, q_term, q_avail, q_recruit | quiet flows | in TASK_FIELDS only, no IDs | every stage | 5 IDs at every kit stage; CP-29, CP-30 |
| Kit (confirm to told) | shared | receipt, undone, told, cancelled, failed, partial, reloaded | release fails after receipt; Undo too late; changed before the press; no-HM1 state; two devices | 4 IDs; CP-13, CP-15 to CP-20 |
| Answer turn | inline | answer, steps, stopped during steps | stop mid-words; dropped stream; regenerate; auto-scroll | stopped, dropped, jump; no Regenerate; CP-1 to CP-8 |
| Long answers | rule | one card grows | follow or jump | CP-7 |
| History | screen | rail, sheet, empty | paging; season groups; refresh | history.more; CP-9 |
| Deep link to a deleted chat | state | none | undefined | chat.gone, 404 with no title; CP-10, CP-11 |
| Composer | control | typing, busy, paused, menus | text kept per chat; radius 24 vs 26; paused rows described the meter | rules; fixed in place; CP-6 |
| Player paused composer | state | paused | wrong matrix rows | fixed in place; CP-44, CP-45 |
| Allowance | player | plenty, low, out, request | mid-turn, requested this week, rollover, usage read fails, request failed | 2 IDs; CP-43 to CP-48 |
| Held migrations and flags | gates | listed in 02 | what shows for each | 05 CP-D table; CP-32 to CP-39 |
| Practice plan flow | cross-lane | Ask and lane 6 both specified it | duplicate IDs; paged vs one card; sheet vs inline | 05 CP-F mapping; CP-49 to CP-54 |
| Coach vs player | every piece | scattered | one list | 05 CP-H; CP-55 to CP-58 |
| Entry points | routes | `?view=ask` | `chat=`, `seed=`, where Open goes, no push | 05 CP-I; CP-59 to CP-63 |
| Keyboard and VoiceOver | access | axe only | focus ring, tab order, Esc layers, labels | 05 CP-J, 06 CP-E-FOCUS; CP-64 to CP-68 |
| Desktop 821 to 1279 | layout | only 1280 and 1440 | undefined | desk-mid; CP-71 |
| Motion | 07 | 89 rows | sheets and menus opening and closing; new states | 23 rows |
| Player matrix, Motion heading, 07 fade bullet | fixes | wrong or stale | team pulse row; "07 not written"; 120ms | fixed in place |

## 2. Gap count

There were 52 gaps:

| Group | Gaps |
|---|---|
| Per-flow failed states | 11 |
| Partial states | 3 |
| Lineup lock failure | 1 |
| Quiet flows with no IDs | 5 |
| Kit edge states | 5 |
| Conversation (stop, drop, jump, regenerate, history paging, deleted chat, composer text) | 7 |
| Desktop 821 to 1279 | 1 |
| Keyboard | 1 |
| Deep links and `askAboutHref` | 1 |
| Where Open goes | 1 |
| Allowance (requested this week, request failed, the rules) | 3 |
| What shows per held migration | 1 |
| What shows with the practice flags off | 1 |
| Poll held fix | 1 |
| Plan flow duplication | 1 |
| Drill bank | 1 |
| Folder model | 1 |
| Publish model | 1 |
| Wrong rows (player matrix, paused composer) | 2 |
| Composer radius | 1 |
| Stale 07 heading | 1 |
| 120ms fade | 1 |
| Missing motion rows | 1 |
| Dates and season turnover | 1 |

All 52 are closed in the lane files.

## 3. Hand-offs and contradictions

| Hand-off | Status |
|---|---|
| Ask to Messages (announcements) | OK. Posts after Undo closes and folds under Announcements. Messages must read the ChPrefill fields `conversationId`, `poll` and `attachment` (CP-70) |
| Ask to Practice plan (brief, artifact, save, publish, calendar) | Aligned in 05 CP-F. Lane 6 owns what is inside the plan; Ask owns the shell around it. The calendar card shows only when the brief found no `practice_event_id` |
| Read, Team Board, Lenses ("ask about") | `askAboutHref` and its alias `askAboutReadHref` are defined in `chat/ask-links.ts` (AK2). Both return null when v2 is off |
| Coach Home and Stats to Ask | No entry is drawn in either lane, so none was added |
| Quick chat | Same kit. "Open full chat" opens the same chat with the held ring kept |
| Practice flags off | 05 CP-D: "Comes with the Practice tab", inert, makes no network call |

Contradictions:
1. Lane 6 also names capture IDs `S-ASK.steps`, `.failed`, `.undone`, `.cancelled` and `.toast`, which look like Ask's. Each lane's IDs are scoped to its own folder.
2. The paged brief and the 90% publish sheet (Ask's design) conflict with lane 6's one card and inline confirm. Ask now follows lane 6.
3. Two practice-plan files still say "or the Ask lane's HM5": `practice-plan/02-PLAN.md` line 785 and `practice-plan/03-DATA-CHECKS.md` line 287. Lane 6 should drop the clause.
4. TASK_FIELDS §5.14's reply before 010100 says "comes with the practice builder". Ask and lane 6 say "Practice tab". Pick one (coachhelm lane).
5. Lenses has not yet exported `playerFileHref`. Ask uses `coachPlayerHref` until it does.

## 4. Needs a shared-file change

- **BUILD_BRIEF line 288.** Replace "a four-question practice plan flow" with "the practice plan flow on the practice-plan lane's one-card brief".
- **BUILD_BRIEF line 290.** Replace ", HM5 `20261101090400_golf_drills_team_bank`." with ". HM5 `20261101090400_golf_drills_team_bank` is superseded by N-00 `20261026010100_golf_team_drills` and not written; AK11e waits on that N-00 file."
- **BUILD_BRIEF line 292.** Replace "the drill flow is built but off until HM5" with "the drill flow is built but off until N-00 `20261026010100_golf_team_drills` runs (one drill bank; HM5 superseded)".
- **DECISIONS line 26.** Replace "drills built but off until a held `golf_drills.team_id` migration runs" with "drills built but off until N-00's held `20261026010100_golf_team_drills` runs (one team drill bank; Ask's HM5 superseded)".
- **AGENT_KIT line 114.** Replace the sentence that starts "Ask's version pages the questions one at a time" and ends "Ask will match it." with: "Ask uses lane 6's one Ask first card (How long, Work on, Who, Anything else) and folds it to the coach's bubble with Change answers; Save follows lane 6: folder names in `golf_documents.folder`, Save writes at once, Undo deletes (fixed 4 Nov, ask/05 CP-F)."
- **START_HERE, build order row 10.** Add: "Ask and the practice-plan lane both name capture IDs starting S-ASK; each lane's IDs are scoped to its own folder (ask/05 CP-F)."

## 5. Calls only Nick can make

1. Practice brief: one card (lane 6, applied as the default) or Ask's paged questions. Recommend one card.
2. Publish confirm: inline (lane 6, applied) or a 90% sheet. Recommend inline.
3. Regenerate is not built. It isn't drawn and isn't in today's Ask; Try again covers failed, dropped and stopped answers. Recommend leaving it out.

## 6. START_HERE and BUILD_BRIEF check

- Every PR in the BUILD_BRIEF order is covered: AK0 to AK12, including AK10a, AK10b and AK11a to AK11e.
- All 304 IDs in 05 have a PR. AK12 owns no ID because it captures every ID.
- No screen is without a PR. The quiet flows had no IDs and now sit under AK11b.
- The held list in BUILD_BRIEF still names HM5 (section 4).

## Memory

Nothing new to save.

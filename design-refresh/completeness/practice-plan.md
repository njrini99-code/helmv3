# Lane report: practice-plan (CoachHelm practice plans and the Practice Builder, PP0 to PP9)

Completeness pass, 4 Nov 2026.

**Files changed**, all in `pkg/design-refresh/practice-plan/`:
- 02, 03, 05, 06, 07, 08 and COACHHELM_PRACTICE_PLAN.md.
- Each has a pointer under its H1 and one section titled "Completeness pass, 4 Nov 2026".
- In-place fixes carry "(fixed 4 Nov: ...)" and are logged in 02 §C.10.

**Where the decisions are:**
- Settled decisions are in 02 §C.1 to §C.9.
- The N-00 and N-10 screen map and the S-PRC.* states are in 05.

N-00 and N-10 were read from `design-refresh/prerequisites/`, read only.

## 1. Matrix

"ok" means it was already covered. "added" means this pass added it.

| Area | IDs | States | Sizes, modes, keyboard, VoiceOver | Motion | Data, flags | 08 by ID |
|---|---|---|---|---|---|---|
| Ask phone and Mac | S-ASK.*, S-ASKD.* | ok | ok | 9 IDs had no row; M-CP-01 to 09 added | ok | ok |
| Documents sheet, print and rows | S-DOC.* | ok | ok | M-CP-11 to 16 added | folder model added | ok |
| Plan format | S-FMT.* | "parent" rows mapped; too big, unreadable and before-PM1 added | ok | M-CP-17, 18 added | PM1 inert added | CP-PP-05 to 10 added |
| Builder helper | S-BLD.*, S-BLDD.* | stop, navigate away, kept undo and no selection added | ok | M-CP-10 added | flags added | CP-PP-01 to 04 added |
| Player | S-PLY.* | parents mapped | ok | M-CP-19, 20 added | ok | CP-PP-11 to 13 added |
| Practice tab (N-00 only) | 52 new S-PRC.* IDs | all added: empty, first run, none/one/many templates, add, duplicate, delete with Undo, reorder plus keyboard, rotation, length, overrun, autosave, offline, stale, groups, split, drill search with no results, new drill before 010100, review errors, publish, republish, take down, plan page views, seen, share, link gate, print, run, rain, drills, groups, templates, player home, chat, calendar, Home line, deep-link dead ends | common rows added (loading, error, offline, role, long, many, one, XXL, dark, RM, keyboard, VoiceOver, 390/430/1280, flag off, pull to refresh, scroll restore, haptics) | M-PRC-01 to 31 added | 03 §C.3 added | CP-PP-28 to 79 added |
| Documents (N-10) | S-PRC.docs-* | added | ok | M-PRC-05, 07 | folder model | CP-PP-76 to 79 |

## 2. Gaps

**Closed by added rows:**
- 52 N-00 screens had no state matrix anywhere. 46 earlier rows pointed to "the parent screen owns it" with no parent named.
- 20 IDs had no 07 row.
- 13 IDs were not named in 08.
- 11 cross-lane decisions were open: drill bank, folders, renderer, drafts, publish path, event requirement, block delete, groups D to F, players' share, the `?from=docs` folder and flag defaults.

**Fixed in place:**
- 02 §6.3: the failed glyph is amber, not secondary ink.
- COACHHELM_PRACTICE_PLAN.md: the two `folderId` lines, and Group C, which was ochre.
- 02 and 03: the "or the Ask lane's HM5" references.
- The drill line now reads "Drill bank comes with the Practice tab".
- 05 has a scope line: S-ASK capture IDs belong to this folder.

## 3. Handoffs and contradictions

| Handoff | Rule |
|---|---|
| Ask plan flow (brief, artifact, save, publish, calendar) | Same plan object and Documents row through `savePracticePlanDraft`. Publish is `publishPracticePlan({notify:'defer'})`. Ask adopted the one-card brief and free-text folders. |
| Quick chat | Saves the same plan. Opens the plan page with `?from=coachhelm`. Never publishes. |
| Read or Team Board drill suggestion | Opens the bank sheet filtered to the drill, or "Add to bank" via `createTeamDrill`. Never auto-placed. |
| Messages, bell, push | After the 8s window: one push (`practice_plan`, Events category) and one bell row (`event_reminder`, kind practice_plan) to the plan page. The chat post is plain text, with no second push. The rich card waits for Messages. |
| Calendar | The Plan row opens `?new=1&event=`. A plan needs an event. |

**Contradictions:**
- Ask saves, then asks about the calendar. The event must come first.
- N-00 differs on several points: §1.4 cut CoachHelm, its renderer, publish-only filing, immediate notify, the CH-17507 confirm, C and D colours, no player share, and `preview: true` flags.
- N-10 differs on two points: 090300 forces plans into "Practice plans" with no Move, and `?from=docs` always returns to practice-plans.
- For all of these the lane wins, except the drill bank, where N-00 wins (05 table).

## 4. Needs a shared-file change

1. **START_HERE.md**, PR table. Insert above row 12:
   `| 11b | N-00 slices 0 to 5, then N-10 slice 4 | prerequisites/ | Practice tab and plans in Documents. PP4, PP5, PP8, PP9 and quick chat's plan save wait on them. Build N-00's behaviour restyled to DESIGN_LANGUAGE (practice-plan/05, Completeness section) |`
2. **BUILD_BRIEF.md**, PR PP0 to PP9. Replace `and the two lanes agree on folders before PP4 (\`02-PLAN.md\` §13).` with:
   `Folders are settled: the name in golf_documents.folder for Ask, the builder and the quick chat; one drill bank, N-00's golf_team_drills (HM5 superseded); N-00 and N-10 plans are in prerequisites/ and their screens are restyled per practice-plan/05 (02-PLAN.md §C.1 to §C.9).`
3. **DECISIONS.md**. Add:
   `4 Nov: Practice: one folder model; one drill bank (golf_team_drills); a plan needs a practice event; block delete is instant with an 8s Undo; groups D slate, E and F neutral, always lettered; players get Share PDF of their own copy only.`
4. **DESIGN_LANGUAGE.md**, Adopted log. Add:
   `--gD #435466 / #9FB0C2 (letter white / #0E120F), tint #E8ECF0 / #1F252B; --gE, --gF #5F5C55 / #ADA697, tint #EFEDE7 / #24261F.`
5. **ACCEPTANCE-SHARED.md**, SHARED-8. Add:
   `This overrides any plan that sets preview: true or development: true on a flag (N-00 golf_practice_plans, N-10 golf_documents_library).`

## 5. Calls only Nick can make

1. Narrow N-10's 090300 so plans can sit in any folder, and add Move to plan rows. Default: yes.
2. Add the practice first when a day has none. Default: yes.
3. Block delete with Undo instead of a confirm. Default: yes.
4. Players get Share PDF of their own copy. Default: yes.
5. Group D to F colours.
6. Fallback §6.4: save as a text document before N-00. Default: no.
7. Apply the held migrations, each on his yes:
   - N-00's nine, in one window after slice 3;
   - N-10's 090000 to 090300;
   - PM1.

## 6. START_HERE / BUILD_BRIEF coverage

- START_HERE row 12 and the two flags are correct, but N-00 and N-10 have no row. That is fix 1 in section 4.
- BUILD_BRIEF has the PP order, N-00 slices and PM1 right, and HM5 is marked superseded.
- BUILD_BRIEF still says the folders are "to agree" (fix 2). It doesn't mention `prerequisites/` or the restyle rule.

## Prerequisites

1. **Screens.** 05's Completeness section lists every N-00 and N-10 screen.
   - Redrawn here:
     - New plan step 2 (S-BLD.new-sheet);
     - the desktop builder (S-BLDD.board, S-BLDD.inspector);
     - the empty Blocks step (S-BLD.helper);
     - the player Today card (S-PLY.practice);
     - the plan page body (S-DOC.sheet-*, S-PLY.plan);
     - the Documents plan rows (S-DOC.list-*, S-PLY.docs).
   - Everything else exists only in N-00's older preview and is now S-PRC.*: coach home, week, past, new plan step 1, copy and template pickers, Blocks, add menu, block sheet and menu, reorder, rotation, length, ribbon, save status, stale, time move, Groups, split, move player, Drills, bank sheet, new drill, Review, publish, republish, toast, take down, plan page chrome, seen, share, link gate, print studio, Run and rain, the Drills, Groups and Templates tabs, drill page, group sheet, template menu, player home, chat, calendar row, Home line, deep-link states, and the Documents folder, card, menu and Move.
2. **Build rule** (05): keep N-00's behaviour, data, routes and copy, and restyle each screen:
   - flat page and card surfaces;
   - large title under the green bar;
   - no accent left borders;
   - motion tokens only;
   - 4.9:1 contrast target and 44pt targets;
   - groups always lettered;
   - amber only for failures.
3. **Disagreements**: see section 3. The lane wins on all of them except the drill bank, where N-00 wins.
4. **Order:**

   | Step | Work | Held migrations | Unblocks |
   |---|---|---|---|
   | 1 | N-00 slice 0 | writes 20261026010000 to 010800 | nothing yet |
   | 2 | N-00 slice 1 | uses 010000, 010300, 010500 | the S-PRC screens it builds |
   | 3 | N-00 slice 2 | uses 010100, 010200 | PP8 |
   | 4 | N-00 slice 3 (needs PR 2362) | 010400, 010600; apply all nine after it | PP4, PP5 |
   | 5 | N-00 slice 4 | 010700 | PP9 |
   | 6 | N-00 slice 5 | none | alongside PP6 |
   | 7 | N-10 slices 0 to 1 | none | any time |
   | 8 | N-10 slice 2 | 090000, 090100 | optional |
   | 9 | N-10 slice 3 | 090200 | optional |
   | 10 | N-10 slice 4 | 090300, narrowed | the Documents library |
   | later | N-00 slices 6 to 9 | 010800 for slice 7 | none here |

   This lane's PM1 `20261102090000_golf_practice_plan_formats` goes with PP7.

# CoachHelm practice plans: brief

Lane 6. Design page: https://claude.ai/artifact/N8XKShSAhyL1foRtUfiqz5 (source `redesign/coachhelm-practice.html`). Prep only: no deploys, migrations or flag flips. Shot tracking is unchanged; this lane only reads.

## The problem (Nick, 31 Oct)

Coaches build every practice by hand. Nick asked for CoachHelm to make the plan: from Ask, and inside the practice plan builder. It should show its steps and the work as it happens. It should ask what the coach wants before it builds, then build it. The plan saves to a folder, or a new one. His second note the same day: the printed plan has to look a lot better, practices have groups so show them, a coach can upload a sample plan and CoachHelm uses it as the format, it learns from past plans, players don't see the why lines, and it stays simple because coaches aren't technical.

## What changes

1. **Ask builds a plan.** The coach asks ("Build Thursday's practice around putting"). CoachHelm checks the calendar, asks one short card of questions (how long, what to work on, who) with its best guesses already picked, reads the team's numbers with a small picture for each read, then writes the plan block by block. Every block has a Why line tied to a source the coach can open.
2. **The coach edits in place.** Tap a block to change its length, place, coach or drill. Swap a drill for one of three that fit the same gap. Refine chips ("Make it 2 hours") make version 2 and mark what changed.
3. **Save and publish are the coach's presses.** Save draft files it in a folder (new folder in place) with an Undo. Publish shows a confirm card with who gets told and what they'll see. The coach presses Publish to 11 people, gets 8 seconds to Undo, and only then do the push, the bell and the team chat post go out.
4. **A printed plan worth handing out.** One sheet component draws the full plan on the phone, in the Mac pane, in Documents and as the PDF: date, focus, groups A, B and C, the schedule, the rotation and the stations. The coach copy has the Why lines. The player copy doesn't.
5. **Plan format.** A coach uploads a sample plan. CoachHelm reads its sections and uses that layout for new plans.
6. **The builder helps.** In the Practice tab's builder, CoachHelm fills a draft as ghost blocks the coach keeps, swaps or removes.
7. **Players get their part.** A push ("Practice plan for Thursday · 2:00 PM · You start on the putting green with Group B") opens their Practice page with only their group's stops, Now and Next.

## Screens

51 screen IDs in `05-SCREENS.md`: the Ask thread on the phone (S-ASK), Ask on the Mac (S-ASKD), the printed sheet and Documents rows (S-DOC), Plan format (S-FMT), the builder on phone and Mac (S-BLD, S-BLDD) and the player side (S-PLY). Every subscreen, sheet, toast and inline state has its own ID and states.

## What must not change

- The green bar, the flat page, one card style, no accent left borders, no gradient text except the green segmented chip (SHARED-1 to 3).
- Amber means a loss or a gap, nothing else. Groups and drill kinds use green, blue and plum.
- Contrast 4.9:1 for text in light and dark (4.5:1 floor), 3:1 for marks. Phone edge 16 (20 on large phones). Text follows iPhone Text Size. 44pt touch areas.
- Shared springs, with Reduce Motion as `CH_FADE_MS` crossfades. No count-ups, no entrance staggers.
- The model never saves or publishes. Publish always has the confirm step. The strict evidence rule: every Why line cites a read from this turn, or it isn't written.
- Players never see a Why line, the Aim, or a teammate's figures.
- Drills come only from the team's bank and the GolfHelm library.
- What shot tracking collects, stores or sends.

## How it lands

Ten PRs, PP0 to PP9 (`02-PLAN.md` §0). PP0, PP1, PP2, PP3 and PP6 can land now behind `coachhelm_practice_plans_v1`, off everywhere. PP4, PP5, PP8 and PP9 need the Practice tab's slices and its held migrations first, so they wait. With the flag on and the Practice tab absent, Save and Publish read "Comes with the Practice tab" and do nothing.

## Done when

Every criterion in `08-ACCEPTANCE.md` passes for the PRs that have landed. Every screen ID matches its design shot side by side in light and dark, at 390 and 430 wide and at XXL Text Size. Every motion row in 07 matches its design clip, with and without Reduce Motion. SHARED-1 to 12 hold.

# Practice catalog (17xxx)

Practice (P017) on `/golf/dashboard/practice` and its eight other routes · code
`src/clubhouse/screens/practice/`, server actions
`src/app/golf/actions/practice-*.ts`, shared rules
`src/lib/golf/practice-errors.ts`, `src/lib/golf/practice-fanout.ts` and
`src/lib/coachhelm/v3/practice-plan/model.ts`.

These are the practice design's own codes
(`design-refresh/prerequisites/N-00-practice-plan-builder.md`), which the server
actions and the plan model already write as error and log codes
(`code: 'CH-17001'`, `errorCode: 'CH-17205'`). They are registered here as they
stand, so each has a Bridge ID in namespace 17 (plan D12, 2026-11-24: Practice
gets its own block; nothing in code is renumbered).

Practice's screen rows stay in [`coachhelm.md`](coachhelm.md) as `CH-13080` and
up, under P013, because codes and Bridge IDs are permanent. Where a row below has
the same words as one of those, the How column names it.
[`pages/P017-practice/PAGE.md`](../pages/P017-practice/PAGE.md) keeps the full
mapping between the two numberings.

`CH-17001` is also the family code the server gives a refused plan save
(`practice-errors.ts`), so one ID covers every failed save.

Every row is marked `existing`: the code is written by server code outside
`src/clubhouse`, which `clubhouse:check` holds through the registry's code index
(every code written anywhere in `src` must be a row here or in another catalog).
Tests that name a code are listed in How; the other 22 codes have none yet.

| # | When | They see | How | Test |
| --- | --- | --- | --- | --- |
| CH-17001 | A plan save fails | "Couldn't save · Try again" beside the title after three failed autosaves (CH-13080); a refused save carries the server's reason, such as "A plan needs a practice on the calendar." | `practice-plans.ts`, `practice-errors.ts`, `model.ts` (a drill not in the bank) | existing |
| CH-17002 | Publishing a plan fails | "Couldn't publish the plan. Nothing was sent." and the confirm reopens with the reason (CH-13081) | `practice-publish.ts#publishPracticePlan` | existing |
| CH-17003 | Republishing a plan fails | "Couldn't republish." and the confirm reopens with the reason | `practice-publish.ts`, `practice-errors.ts` | existing |
| CH-17004 | Taking a plan down fails | "Couldn't take the plan down. Players can still see it." | `practice-publish.ts`, `practice-errors.ts` | existing |
| CH-17006 | Saving or copying a drill fails | "Couldn't save the drill. It wasn't added to the plan." or "Couldn't copy the drill." | `practice-library.ts` | existing |
| CH-17008 | Deleting a plan fails | "Couldn't delete the plan" (CH-13082) | `practice-plans.ts` | existing |
| CH-17009 | Creating a make-up fails | "Couldn't create the make-up." | `practice-errors.ts` | existing |
| CH-17014 | The plan card does not post to team chat after a publish | "Published. The plan card didn't post to team chat." | `practice-errors.ts` | existing |
| CH-17101 | A group is at two stations in one turn | "Blue is at two stations at 3:40 PM." on the block, and publish is held | `model.ts#validatePlan` | existing |
| CH-17102 | A coach is in two places at once | "Coach Ruiz is at two places at 3:40 PM." on the block, and publish is held | `model.ts#validatePlan` | existing |
| CH-17103 | A block has more groups than stations | "3 groups but 2 stations. Add a station or take a group out of this block." | `model.ts#validatePlan` | existing |
| CH-17104 | A block uses a group with no players | "Blue has no players." on the block; the server refuses a block naming a group not in the plan | `model.ts#validatePlan`, `practice-errors.ts` (tests: autosave-failure.test, leave-guard.test) | existing |
| CH-17105 | A player is in no group | A warning, "Jonah isn't in a group."; publishing still goes | `model.ts#validatePlan` (tests: model.test) | existing |
| CH-17106 | The plan runs past the end of practice | A warning, "12 min past the end of practice (5:30 PM)."; publishing still goes | `model.ts#validatePlan` | existing |
| CH-17109 | A plan is over its limits | "A plan can have up to 40 blocks and 6 hours.", "A plan can have up to 6 groups." or "That plan is too long to save." | `practice-plans.ts`, `practice-errors.ts`, `model.ts` | existing |
| CH-17110 | An all-day practice gets a plan | "Give this practice a start and end time to plan it." (CH-13181) | `practice-errors.ts` | existing |
| CH-17112 | A drill's fields are not valid | The field's own message, such as "Name it, up to 60 characters." | `practice-library.ts` | existing |
| CH-17113 | A saved group's name or size is not valid | "Name the group, up to 40 characters.", "A group holds up to 30 players." or "You already have a group with that name." | `practice-library.ts` | existing |
| CH-17114 | A Course block has no holes | "Pick the holes for Course." | `model.ts#validatePlan`, `practice-errors.ts` | existing |
| CH-17115 | Publishing is held by problems in the plan | The one problem's own words, or "Fix 3 problems to publish." | `practice-publish.ts` | existing |
| CH-17116 | An empty plan is published | "Add a block to publish." | `model.ts#validatePlan`, `practice-errors.ts`, `practice-publish.ts` (tests: model.test) | existing |
| CH-17117 | A cancelled practice's plan is published | "This practice was cancelled, so its plan can't be published." | `practice-errors.ts` | existing |
| CH-17201 | A plan cannot be read | "This plan was saved in a newer form."; missing Practice tables read as not set up | `practice-publish.ts` | existing |
| CH-17205 | Home's plan line or the players' notification fan-out fails | Nothing on screen; a warning in the server log (`practice.fanout`) | `practice-fanout.ts` | existing |
| CH-17505 | Another coach saved the plan first | "This plan changed somewhere else. Load the latest." with Load latest (CH-13580) | `practice-errors.ts` | existing |

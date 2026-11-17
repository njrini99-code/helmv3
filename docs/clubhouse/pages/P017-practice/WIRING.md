# P017 — Practice: wiring map

## Entry point

```text
Route:                    /golf/dashboard/practice and eight children (PAGE.md, Addresses)
Page:                     src/app/golf/(dashboard)/dashboard/practice/**/page.tsx, each calling
                          redirectUnlessClubhousePractice() first
Clubhouse route adapter:  src/clubhouse/routes/practice.tsx (PracticeHomeRoute, PracticeDrillsRoute,
                          PracticeDrillRoute, PracticeGroupsRoute, PracticeTemplatesRoute,
                          PracticePrintRoute, PracticeBuilderRoute, PracticePlanRoute, PlanFormatRoute)
Screen:                   src/clubhouse/screens/practice/**
Loaders:                  data/practice-home.ts (loadCoachPracticeHome, loadPlayerPracticeHome,
                          loadPlanForBuilder), data/practice-plan.ts (loadCoachPlan, loadPlayerPlan,
                          loadPlayerPractice, loadPlanDrills), data/practice-library.ts (loadDrills,
                          loadDrill, loadGroups, loadTemplates)
```

## Actions

The ids are in `config/clubhouse/pages/P017-practice.json`. Each reaches the
server through a `'use server'` file; no action lists a Bridge ID because the
contracts that cover them are P013's (CONTRACT.md).

| Action | Control | Component | Server action |
| --- | --- | --- | --- |
| ACT-P017-SAVE-PLAN | autosave, Create plan, Run shift | `builder/useAutosave.ts`, `NewPlanSheet`, `PlanRun` | `savePracticePlan` |
| ACT-P017-PUBLISH | Publish, Republish, shift | `builder/Builder.tsx`, `PlanRun` | `publishPracticePlan` |
| ACT-P017-TAKE-DOWN | Take down | `CoachPlanBar` | `takeDownPracticePlan` |
| ACT-P017-DELETE-PLAN | Delete draft | `builder/Builder.tsx` (also Team Hub) | `deletePracticePlan` |
| ACT-P017-COPY-PLAN | Copy a past practice | `NewPlanSheet` | `copyPlanBody` |
| ACT-P017-OPEN-PLAN | a player opens a plan | `coachhelm/plan/player/PlayerPractice.tsx` | `recordPracticePlanOpen` |
| ACT-P017-NEW-DRILL | New drill | `builder/Sheets.tsx` | `createTeamDrill` |
| ACT-P017-EDIT-DRILL | Edit, Copy to your bank, Archive | `LibraryPages` | `updateTeamDrill`, `copyLibraryDrill`, `archiveTeamDrill` |
| ACT-P017-SAVE-GROUP | Save or delete a group | `LibraryPages` | `savePracticeGroup`, `deletePracticeGroup` |
| ACT-P017-SAVE-TEMPLATE | Save, rename, delete a template | `LibraryPages` | `savePracticeTemplate`, `renamePracticeTemplate`, `deletePracticeTemplate` |
| ACT-P017-NEW-PRACTICE | A new practice | `NewPlanSheet` | `createGolfEvent` (calendar-events.ts) |

Server actions live in `src/app/golf/actions/practice-{plans,publish,library}.ts`;
their error codes are the design's CH-17xxx (PAGE.md). The plan's body model and
limits are `src/lib/coachhelm/v3/practice-plan/model.ts`; the helper is
`builder/HelperSession.tsx` through `useCoachHelmChat({ surface: 'practice_helper' })`.

## Data

Tables: `golf_practice_plans`, `golf_practice_plan_versions`,
`golf_practice_plan_lines`, `golf_practice_plan_opens`,
`golf_practice_plan_formats`, `golf_practice_groups`,
`golf_practice_templates`, `golf_team_drills`; Documents rows for published plans
(`golf_documents.practice_plan_id`). A player reads only the published version.

## Impact notes

Team Hub deletes a draft through `deletePracticePlan`; the plan sheet and player plan page are P013's; Calendar
creates the practice for New plan. A change to `model.ts` limits changes the
server's validation codes.

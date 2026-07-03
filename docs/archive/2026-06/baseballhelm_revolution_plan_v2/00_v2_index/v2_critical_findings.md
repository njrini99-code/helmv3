# V2 Critical Findings

## What was strong in the original plan

- Correctly identified an import-first, AI-assisted college baseball OS wedge.
- Already broad enough to consider operations, stats, development, lifting, academics, travel, communication, and recruiting.
- Included many useful CSV template categories and a generic import flow.
- Recognized coach and player accounts as separate UX surfaces.
- Recognized CoachHelm AI needs guardrails and source grounding.
- Started a useful database table inventory and phased roadmap.

## What was weak

- Too much breadth; not enough ruthless cutline.
- Too tab-centric: coach nav proposed 19 top-level tabs and player nav proposed 13.
- Implementation tasks remain too vague for a one-shot coding agent in several places.
- Not repo-aligned enough: risks creating parallel routes/tables instead of extending current baseball_* patterns.
- Import center lacks enough detail on duplicate imports, row-level rollback, source-of-truth, and player matching confidence.
- AI architecture is good directionally but could drift into chatbot-first novelty instead of embedded product intelligence.
- Development, lifting, academics, recruiting, and travel modules risk becoming bloated before proof from pilots.
- Database model is useful but not enough table-by-table RLS/index/constraint detail for build execution.
- UI direction is premium in language but not yet specific enough about page hierarchy, mobile behavior, empty/error states, and sales demo screens.
- Market research is broad but not always connected to build/import/ignore decisions.

## What was missing

- A hard role-based final navigation that reduces cognitive load.
- A canonical player identity model that connects auth users, roster players, external IDs, imports, and historical seasons.
- A true Player Timeline as the development story layer.
- An import rollback and row-level audit architecture.
- A source-cited AI insight model with disposition state.
- Staff Decision Room and Player Development Brief Mode as retention/demo loops.
- Practical academic privacy boundaries.
- A small-college vs power-program go-to-market distinction.
- A V2 phase cutline that prevents building a giant average app.

## What was unrealistic

- Treating every vendor dataset as if coaches will have clean standardized exports.
- Treating AI recommendations as credible without source citations and confidence language.
- Expecting coaches to live in 18+ top-level tabs.
- Building recruiting, lifting, academics, and travel as deep standalone products before proving daily command value.
- Assuming direct integrations are necessary early. They are not.

## What was not differentiated enough

V1 could still be interpreted as “Teamworks + stats + AI.” That is not enough. V2 differentiates around:

- Program Command Graph
- Player Timeline
- Import-to-Insight Engine
- Practice Intelligence Loop
- Staff Decision Room
- Player Development Brief Mode
- Embedded source-cited AI action cards

## What should be removed

- AI as a standalone chat-first tab.
- Full lift builder in Phase 1.
- Recruiting marketplace / external recruiting network.
- Compliance engine language.
- Redundant top-level tabs for features that belong inside Team Ops, Performance, or Player Profile.

## What should be expanded

- Import mechanics.
- Canonical identity and external IDs.
- RLS/permission boundaries.
- Empty/loading/error states.
- Player mobile UX.
- Demo seed data.
- Staff meeting/player meeting workflows.
- Acceptance criteria and QA.

## What should be rebuilt

- Navigation.
- Phase plan.
- CoachHelm AI architecture.
- Import system architecture.
- Data model and migration sequence.
- Feature priority matrix.

## Priority conclusion

Do not build the biggest version. Build the smallest version that creates a daily operating graph coaches cannot ignore.

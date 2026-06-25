# Biggest Gaps in the Original Plan

## 1. It mistook feature coverage for product strategy

V1 listed many useful features, but it did not decide aggressively enough which features matter now, which should be imported, which should be attached, and which should be ignored.

## 2. It did not sufficiently protect the app from tab bloat

A college coach will not use an 18-tab product daily. The product needs fewer top-level choices and more contextual drill-down inside player profiles, event pages, practice pages, and reports.

## 3. It under-specified the import system

Import-first is the core strategy, but the original import design was not strong enough to carry the product. V2 requires:

- import_runs
- import_files
- import_rows
- field mappings
- player match candidates
- validation severities
- row-level commit status
- duplicate detection
- rollback plans
- audit logs
- AI mapping suggestions with human approval

## 4. It underbuilt the player story

The player profile cannot be a static bio page. It must be a timeline that shows what happened, what changed, what the coach noticed, what the data says, and what the player is working on next.

## 5. It overestimated what should be native

BaseballHelm should not rebuild TeamBuildr, TrackMan, Rapsodo, Blast, OnForm, SportsRecruits, Teamworks Academics, or ARMS. It should connect the most important outputs from those worlds to baseball decisions.

## 6. It did not make AI operational enough

AI must create action inside actual coach workflows. It cannot just summarize data in a separate chat window.

## 7. It needed more repo-specific implementation guidance

The repo already has auth, baseball routes, dashboard shells, and `baseball_*` data patterns. The plan must extend that reality instead of creating a second product next to it.

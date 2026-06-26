# Architecture Tangles

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Circular Dependencies

| Cycle | Files | Risk | Proposed Fix |
|---|---|---|---|
| 1 | `app/golf/(dashboard)/dashboard/stats/team/page.tsx > app/golf/(dashboard)/dashboard/stats/team/team-stats-table.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 2 | `app/golf/actions/admin-data.ts > app/golf/actions/admin/rollup-c.shared.ts` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 3 | `app/golf/actions/admin-data.ts > app/golf/actions/admin/rollup-c.ts` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 4 | `app/golf/admin/crm/components/CoachFilters.tsx > app/golf/admin/crm/components/segments/SaveSegmentDialog.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 5 | `components/baseball/stat-visuals/StatVisualsSection.tsx > components/baseball/stat-visuals/index.ts` | DEFERRED_BASEBALLHELM | Split barrels/shared helpers only after approval. |
| 6 | `components/baseball/stat-visuals/StatVisualsSection.tsx > components/baseball/stat-visuals/index.ts > components/baseball/stat-visuals/use-stat-visual-views.ts` | DEFERRED_BASEBALLHELM | Split barrels/shared helpers only after approval. |
| 7 | `components/fairway/pages/coachhelm/index.ts > components/fairway/pages/coachhelm/FairwayBrief.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 8 | `components/fairway/pages/rounds/FairwayRoundCard.tsx > components/fairway/pages/rounds/FairwayRoundsLibrary.tsx > components/fairway/pages/rounds/FairwayRoundRow.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 9 | `components/fairway/pages/rounds/FairwayRoundsLibrary.tsx > components/fairway/pages/rounds/FairwayRoundRow.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 10 | `components/fairway/pages/rounds/FairwayRoundsLibrary.tsx > components/fairway/pages/rounds/FairwayUnfinishedBanner.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 11 | `components/fairway/pages/tasks/FairwayCreateFromTemplateModal.tsx > components/fairway/pages/tasks/FairwayTasks.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 12 | `components/fairway/pages/tasks/FairwayTasks.tsx > components/fairway/pages/tasks/FairwayCreateTaskModal.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 13 | `components/golf/calendar/CalendarFeedManager.tsx > components/golf/calendar/CreateFeedSection.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 14 | `components/golf/coachhelm/insights/DiagnosisPanel.tsx > components/golf/coachhelm/insights/EvidencePanel.tsx` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |
| 15 | `lib/golf/sg-benchmarks.ts > lib/golf/strokes-gained.ts` | ARCHITECTURE_REVIEW | Split barrels/shared helpers only after approval. |

## Layering Violations

| File | Violation | Risk |
|---|---|---|
| `src/components/fairway/pages/coachhelm/index.ts` -> `FairwayBrief.tsx` | Barrel/component circular import | ARCHITECTURE_REVIEW |
| `src/app/golf/actions/admin-data.ts` -> admin rollups | Server action and rollup circularity | DATABASE_REVIEW |
| `src/components/fairway/pages/tasks/*` | Modal/page mutual imports | MANUAL_REVIEW |

## Server/Client Boundary Concerns

| File | Concern | Risk |
|---|---|---|
| `src/app/golf/actions/*.ts` | Very large server-action files mix queries, business logic, and formatting. | ARCHITECTURE_REVIEW |
| `src/components/fairway/pages/coachhelm/*` | Large UI components with domain logic. | MANUAL_REVIEW |

## Product Boundary Violations

| File | Issue | Risk |
|---|---|---|
| Shared UI/hooks | Potential BaseballHelm consumers must be proven before edits. | HIGH_RISK_DO_NOT_TOUCH |

## Deferred BaseballHelm Architecture Findings

| Finding | Reason Deferred |
|---|---|
| Madge cycles #5 and #6 in `components/baseball/stat-visuals` | DEFERRED_BASEBALLHELM. |

# Wellness and Availability Review

## 1. Original plan summary

V1 recognized `Wellness and Availability` as an important product area, but it was not always specific enough about role behavior, data ownership, edge cases, UI states, and implementation cutline.

## 2. What is strong

- The feature belongs in the BaseballHelm universe.
- It can connect to roster/player identity.
- It can create daily or weekly staff value if built with discipline.
- It can feed the Player Timeline and CoachHelm AI layer.

## 3. What is weak

- V1 allowed the feature to become too broad.
- It did not always distinguish Phase 1 native behavior from imported/attached/deferred behavior.
- It did not always specify acceptance criteria or RLS boundaries.

## 4. What is missing

- Source-of-truth decision.
- Role-specific visibility.
- Empty/loading/error states.
- Integration into Command Center, Player Today, Timeline, Reports, and AI.
- Clear test plan.

## 5. What is unrealistic

Trying to match mature category leaders immediately is unrealistic. BaseballHelm should win by connecting this feature to the baseball operating graph, not by cloning every competitor surface.

## 6. What competitors do better

Competitors researched: Smartabase, TeamBuildr AMS, ArmCare readiness concepts.

They often have more mature single-category depth, more institutional adoption, or more device-specific data capture.

## 7. What BaseballHelm can do better

BaseballHelm can connect this feature to today’s plan, player timeline, staff meeting, practice planning, availability, imports, and source-cited AI.

## 8. What should be built now

Phase recommendation: **Must build now as transparent inputs**.

Build the smallest version that creates a durable object, visible action, and reporting/AI value.

## 9. What should be built later

- Deep analytics.
- Advanced templates.
- External integrations.
- Automation that depends on clean pilot data.

## 10. What should be removed

- Generic SaaS bloat.
- Unused dashboards.
- Tabs that do not create a daily action.
- AI outputs without source records.

## 11. Improved feature spec

The feature must be object-driven. It should create or update durable records that can appear in Command Center, Player Today, Player Timeline, Reports, and AI.

## 12. Improved workflow

1. Staff/player triggers event.
2. System records source object.
3. Relevant role sees it in correct surface.
4. Coach confirms action.
5. Player receives only what is safe/relevant.
6. Timeline/report/AI layer updates.

## 13. Improved data model

- Link to `baseball_players` / canonical player identity.
- Link to `baseball_teams`.
- Include source, status, created_by, updated_by, and audit references.
- Include visibility level where sensitive.

## 14. Improved UI/UX

- Primary CTA visible above fold.
- Tables are dense but filterable.
- Cards show status, trend, source, and action.
- Mobile player states are simplified.
- Empty states explain how to get value quickly.

## 15. Improved AI behavior

AI can summarize, flag, or recommend review only using source records. It must show confidence and source refs and avoid unsupported claims.

## 16. Import requirements

If this feature can be fed by CSV, it must support import run, row validation, player matching, duplicate detection, preview, commit, rollback, and audit.

## 17. Integration with other tabs

- Command Center: summary and actions.
- Player Today: player-safe actions.
- Player Profile: timeline entries.
- Reports: weekly reports/player development briefs.
- AI: source-cited brief/flag.

## 18. Edge cases

- Duplicate players.
- Transfers and inactive players.
- Mid-season roster changes.
- Missing imported values.
- Player without user account.
- Staff with limited permissions.
- Same file imported twice.

## 19. Implementation details

- Inspect existing baseball route before adding a new one.
- Reuse dashboard shell/card/table components where possible.
- Add loading/error/empty states.
- Add server action/API read model.
- Add RLS and capability checks.
- Add seed data.

## 20. Acceptance criteria

- Feature works for demo team.
- Feature respects coach/player role boundaries.
- Feature creates timeline/report/AI-ready source objects.
- Feature survives empty data state.
- Feature has at least one route-level test or component-level test.

## 21. Priority score

9/10 coach value.

## 22. Complexity score

Estimated complexity: 3/10. Complexity rises when imports, permissions, or AI are involved.

## 23. Revenue/demo value score

8/10.

## 24. Daily usage value score

9/10.

## Final decision

**Must build now as transparent inputs.** Build only to the depth needed to support the V2 operating graph.

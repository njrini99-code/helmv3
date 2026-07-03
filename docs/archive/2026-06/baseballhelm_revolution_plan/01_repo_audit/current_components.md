# Current Components

## Component surfaces to reuse

- App shell: sidebar, header, team switcher, mobile layout primitives.
- UI primitives: card, badge, avatar, input, select, button, empty state, loading state.
- Table primitives if existing TanStack patterns are already used.
- Auth hooks: `useAuth`, `useRouteProtection`.
- Team state hooks/stores: `useTeams`, `usePlayerTeams`, `useTeamStore`.

## Component surfaces to refactor

- Sidebar navigation should become data-driven by role, team type, enabled modules, and account type.
- Dashboard cards should become reusable command-center cards with typed read models.
- Player cards should be reused only if they support the expanded player identity model.
- Dev plan and video components should be integrated into player timeline and development modules.

## Component surfaces to replace

- Recruiting-first cards as the default baseball dashboard.
- Pages that duplicate player details without a central profile layout.
- Static/mock academic cards that imply schema fields which do not exist.

## Future component package

Create `src/components/baseball-os/` with:

- `CommandCard`
- `RosterTable`
- `PlayerProfileHeader`
- `PlayerTimeline`
- `AvailabilityPill`
- `PracticeBlockBuilder`
- `LiftComplianceCard`
- `ImportDropzone`
- `ImportMappingTable`
- `ImportErrorTable`
- `AIInsightCard`
- `SourceEvidenceList`
- `PlayerTodayCard`

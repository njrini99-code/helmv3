# One-Shot Build Instructions For Next Agent

## Mission

Refactor and expand BaseballHelm into a premium college baseball operating system without introducing required direct third-party integrations.

## Build rules

1. Do not delete current working pages until replacements are live behind routes or flags.
2. Build around organizations, teams, memberships, players, staff roles, and permissions first.
3. Make roster/player profile the identity layer for all imports, stats, lifts, wellness, academics, travel, and AI.
4. Create a generic import framework before creating vendor-specific parsing.
5. Create a Coach Command Center that reads from real tables, not hard-coded marketing cards.
6. Keep player and coach accounts separate in navigation, permissions, and data visibility.
7. AI must cite in-app data IDs, timestamps, and source rows; never invent unavailable facts.
8. Phase 1 must work with manual entry and CSV imports only.

## Suggested implementation order

1. Create branch `baseballhelm-revolution-phase-1`.
2. Add migrations for core tables from `08_data_architecture/recommended_tables.md`.
3. Add typed data access layer under `src/lib/baseball/`.
4. Replace scattered sidebar logic with role-driven nav config.
5. Build command center read models.
6. Build roster and player profile foundation.
7. Build calendar and practice planner minimum version.
8. Build stats center with official stat definitions and CSV import.
9. Build lifting tracker minimum version.
10. Build import center with preview, validation, row errors, and rollback.
11. Build CoachHelm AI brief storage and deterministic summary generation.
12. Seed demo team data.
13. Add tests, RLS checks, and route protection checks.

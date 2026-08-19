# Golf team operations design

**Date:** 2026-08-18
**Status:** Approved

## Purpose

Make the Golf team experience usable as an operational workspace for players and coaches, while repairing the course-detail, qualifier, search, and stats issues discovered in production. This design is limited to GolfHelm; Baseball is deliberately out of scope.

## Information architecture

### Player Team navigation

The shared Team rail destination and player sub-navigation will be ordered:

1. Team Hub
2. My Qualifiers
3. Roster
4. Team Info

The first item remains the Team rail target, so selecting **Team** lands a player in Team Hub. The shared sub-navigation component remains common across roles; role-specific page content stays role-specific.

### Team Hub

Team Hub becomes the player's operations overview, not a task list with tabs. Its default **Overview** shows only existing, real team data:

- outstanding tasks and a direct route to tasks;
- the newest announcement and a direct route to announcements;
- the next travel item and a direct route to travel;
- current class-schedule context and a direct route to classes.

The detailed tabs are **Tasks**, **Announcements**, **Travel**, and **Classes**. The redundant inner **Teammates** tab is removed because the top-level Roster destination is the canonical player roster. No new synthetic data, mutations, or team-management permissions are introduced.

## Team stats signals

Signals must explain the data that produced them rather than imply that every displayed number is live.

- Trend eligibility remains based on the existing minimum number of completed rounds in the board model, and the UI will state the required threshold when a player has not reached it.
- The stats page will expose concise freshness context: completed-round data is refreshed on the existing five-minute route cache, while standing and insight snapshots present their respective computed/as-of time when available.
- The status badge will describe the oldest applicable source rather than a misleading blanket “live” label.
- The route-specific **Ask CoachHelm** access point will be a normal, visible page action. The global floating launcher is hidden on the team-stats route so it cannot cover the rightmost signal chips; access remains available without a collision.

## Search and command palette

Desktop header search is centered in the application content region, not centered in the entire browser window including the left rail. The header uses a three-region layout so breadcrumbs and actions do not shift the search field.

The active legacy Golf command palette is also centered in the content region and vertically centered. It retains Escape and backdrop dismissal and gains an explicit, keyboard-accessible Close button. The rail width is supplied by the dashboard shell as a CSS custom property, so the command palette remains correct in expanded and collapsed rail states.

## Course detail and qualifier repairs

The already-prepared Golf fixes are part of this delivery:

- course reads reject a primary course-row failure, retain non-fatal supplementary tee/hole failures, and render a retryable snapshot/error state rather than a blank permanent loading panel;
- coach qualifier creation uses a real document-navigation anchor to bypass the observed unresolved soft transition, with regression coverage.

## Incident report treatment

Each incident is handled according to evidence:

- Improve server error serialization only if a focused failing test proves the malformed off-production error report.
- Treat the production hook-order incidents on Genome/Game as a root-cause investigation. Reproduce or symbolicate first; do not make a speculative hook-order edit.
- Treat calendar hydration, isolated login-load, and Node `localStorage` reports as monitor-and-attribute items unless a reproducible source defect is established.
- The Inngest signing-key incidents require production secret alignment; code can diagnose and surface the mismatch but cannot repair an external deployed secret without deployment authority.
- The CoachHelm budget and citation items are intentional/safe fallbacks. Keep their current behavior; improve configuration or observability only where it reduces noise without weakening safeguards.

## Documentation and verification

The feature registry will map the current team-hub route and the relevant current-state document will describe the player navigation and hub behavior. All implementation work is test-first and includes focused unit/component tests, affected end-to-end coverage, typecheck, lint, production build, and a final browser check at desktop width for the search centering and non-overlapping signals.

## Non-goals

- No Baseball changes.
- No redesign of coach recruiting or player permissions.
- No fabricated stats, stale timestamps presented as current, or new data schemas.
- No production secret rotation or deployment configuration change without separate authority.

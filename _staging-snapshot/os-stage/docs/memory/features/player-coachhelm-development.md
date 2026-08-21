# Feature: Player CoachHelm And Development

- feature_id: player_coachhelm_development
- status: active
- criticality: high
- last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
- last_verified_at: 2026-08-21
- history_backfill: not_started (memory/ledgers/{changes,tests,operations}/player_coachhelm_development.md do not exist yet)

## Purpose

The player-facing intelligence/growth surface: performance insights, shot
analytics, predictions, round reviews, focus areas, goals, intent, standing,
genome, and development-plan progress, interpreted for the player rather
than the coach.

## User Contract

A player opens one canonical AI home and gets what changed, why it matters,
and what to do next — not a dump of raw metrics. Development, standing, and
game-profile views are drills inside that home, not separate destinations
a player has to remember to visit.

## Current Behavior — one Spine & Stage home, not five routes

`/golf/dashboard/coachhelm` is the single canonical player CoachHelm home
(spec §5.3 "Spine & Stage", per code comments in the redirect shims below).
`surface-registry.ts` registers it as `rail-coachhelm-ai-player` (role:
player, group: rail). Four routes the prior-generation doc named as live
pages are now **permanent redirects into query-param views on that one
route**, confirmed by reading each file directly:

| Old route | Redirects to | Registry status |
|---|---|---|
| `/golf/dashboard/my-insights` | `/golf/dashboard/coachhelm` | `my-insights`, legacy+hidden |
| `/golf/dashboard/my-development` | `/golf/dashboard/coachhelm?view=development` | `my-development-tab`, legacy+hidden |
| `/golf/dashboard/my-standing` | `/golf/dashboard/coachhelm?view=standing` | `my-standing-tab`, legacy+hidden |
| `/golf/dashboard/development` | `/golf/dashboard/intelligence?view=players` | **not this feature — see Known Debt** |

The fourth row is the important one: `/golf/dashboard/development` no
longer serves a player-facing page at all. Its own file header says
Development Plans is now "the `players` drill of the coach Intelligence
home" — a **coach** surface. `memory/registry.yml`'s
`player_coachhelm_development.code.routes` still lists
`src/app/golf/(dashboard)/dashboard/development/**`, which is misattributed
to this feature.

All four redirect shims exist only as a fallback: `next.config.mjs`
`redirects()` intercepts each path at the framework layer first (added
2026-07-22 to dodge a React #310 "rendered more hooks" crash on
client-navigation into a bare `redirect()`). Several action files
(`development.ts`, `v3/goals.ts`, `player-feedback.ts`, `golf.ts`,
`round-reviews.ts`) still call `revalidatePath()` against the old paths, so
the shim files stay on disk deliberately.

Round review (`/golf/dashboard/rounds/[id]/review`) is unaffected — it is
still its own live route, now rendered inside the Fairway design system
(`.fairway-ds` scope, confirmed by inline comments in `page.tsx`).

## Invariants

- Auto-generation must not fabricate insights when source data is
  insufficient (stated as a business rule in the prior doc; not
  independently re-verified against generator code this pass).
- Round review acknowledgement must persist and must not silently fail —
  it feeds both learning state and UI state.
- V3 narrative/counterfactual content must preserve CoachHelm AI's
  citation/trust rules (owned by the `coachhelm_ai` feature; this feature
  consumes, not generates, that trust contract).

## Primary Journeys

```txt
Player opens /golf/dashboard/coachhelm
  -> load profile, rounds, shots, predictions, patterns, settings
  -> generate insights if missing/stale and generation is allowed
  -> render the Spine & Stage home; ?view= selects a drill
     (development, standing, profile) within the same page

Player opens a round review (/golf/dashboard/rounds/[id]/review)
  -> read generated review + evidence
  -> acknowledge / rate feedback -> revalidate CoachHelm + development views
```

## Architecture / Data Flow

Focus areas remain live and are read from `golf_player_focus_areas` by
`development.ts`, `round-reviews.ts`, `insights.ts`, `pattern-management.ts`,
`src/lib/coachhelm/v3/chat/read-tools.ts`,
`src/lib/coachhelm/v3/chat/program-pulse.ts`, and
`src/lib/coachhelm/focus-areas/target-metric.ts` — this table is not stale,
unlike several component paths below.

The V3 tables the prior doc described only vaguely ("player genome, goals,
intent, qualifying, chat, and narrative/budget support") are, by name,
confirmed present in `src/lib/types/database.ts`: `golf_player_genome`,
`golf_goals`, `golf_goal_suggestions`, `golf_coach_player_intent`,
`golf_coachhelm_chat_conversations`, `golf_coachhelm_chat_messages`,
`golf_coachhelm_llm_budget`.

## Permissions / Tenancy

Players see only their own CoachHelm/development data. Coaches create
development/focus-area assignments; player views are primarily read/
progress surfaces, not authoring surfaces — not independently re-verified
against RLS policy text this pass.

## Dependencies

Shot Tracking (raw evidence), Stats & Analytics, CoachHelm AI (generation +
trust/citation rules), Qualifiers (V3 qualifying board shares this
feature's `coachhelm/v3` surfaces area).

## Failure Modes

- Player acknowledgement/dismissal callbacks have historically been easy to
  wire up visually without wiring the underlying action (prior-doc known
  risk; not independently reproduced this pass).
- Revalidation can miss one of the many redirect-target paths now that four
  routes collapse into query-param views on one page — a change to
  `development.ts`/`v3/goals.ts` that forgets to revalidate
  `/golf/dashboard/coachhelm` (rather than the old `/my-development` path)
  would be invisible until a player hard-refreshes.

## Observability Contract

Not independently mapped this pass beyond the `logServerError` pattern used
repo-wide; no dedicated Sentry tag search was run for this feature.

## Test Contract

Confirmed present: `src/test/coachhelm/v3/**`,
`src/test/coachhelm/v2/post-round-trigger.test.ts`. **Not present**, despite
being named as a required check in `memory/registry.yml`:
`src/test/app/golf/dashboard/coachhelm/**` (directory does not exist —
confirmed by direct filesystem check). Fairway-side test coverage for the
goal card exists: `src/components/fairway/pages/coachhelm/
FairwayGoalCard.test.tsx`, not named anywhere in the registry's test list.

## Known Debt / Unknowns

- **Component paths in `memory/registry.yml` and the prior-generation doc
  are stale.** `src/components/golf/coachhelm/v3/GoalCard`, `IntentPill`,
  `IntentDrawer`, `CounterfactualLine.tsx`, and `HeroNarrativeCard.tsx` were
  all checked directly and **do not exist**. The live equivalent found this
  pass: `src/components/fairway/pages/coachhelm/FairwayGoalCard.tsx`
  (imported by `dashboard/coachhelm/page.tsx` as `FairwayGoalCardData`).
  Equivalents for IntentPill/IntentDrawer/CounterfactualLine/
  HeroNarrativeCard were not located by name this pass — likely renamed
  under `src/components/fairway/pages/coachhelm/**` but not confirmed; flag
  as open rather than guess a path.
- **`memory/registry.yml`'s route list mixes in a route that now belongs to
  a different feature** (`development/**` → coach Intelligence, see Current
  Behavior table). This should be corrected in the registry, not just noted
  here.
- **`src/lib/coachhelm/v3/foundation/flags.ts`, named by the sibling
  `settings_preferences` registry entry, does not exist** —
  `src/lib/coachhelm/v3/foundation/` contains only `email.ts`, `push.ts`,
  `generator-toggles.ts`. Flagged here since this feature and
  `settings_preferences` share the `foundation` directory; whichever agent
  owns that entry should correct it.
- Whether `src/hooks/golf/use-auto-save-round.ts` (named by the sibling
  `shot_tracking` doc) still exists was checked and it does not — cross-
  referenced here because round auto-save state feeds round review, which
  this feature consumes.

## Incident History

`docs/operations/2026-05-17-p0-runbook.md` is the one incident doc the
registry links; predates the July redesign and route consolidation
described above, so treat its route-level detail as likely superseded.

## ADR Links

None recorded for the Spine & Stage consolidation (a real architecture
decision — collapsing 4 routes into query-param views on 1 — with no
`memory/decisions/ADR-*.md` entry).

## Verification Evidence

Files read directly: `my-insights/page.tsx`, `my-development/page.tsx`,
`development/page.tsx`, `my-standing/page.tsx` (all four, full content),
`dashboard/coachhelm/page.tsx` (grep for Fairway imports),
`surface-registry.ts` (grep for coachhelm/development/standing/insight
entries). Tables confirmed in `src/lib/types/database.ts`: `golf_player_genome`,
`golf_goals`, `golf_goal_suggestions`, `golf_coach_player_intent`,
`golf_coachhelm_chat_conversations`, `golf_coachhelm_chat_messages`,
`golf_coachhelm_llm_budget`, `golf_player_focus_areas` (usage cross-checked
via grep across 7 call sites). Component absence confirmed by direct
filesystem check, not by prose.

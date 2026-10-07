---
paths:
  - "src/app/golf/**"
  - "src/lib/golf/**"
  - "src/components/golf/**"
  - "src/app/api/golf/**"
---

# GolfHelm

Ownership map, review checklist and file layout for golf code (merged from the
former golf-feature-ownership, golf-review and file-structure rules). Golf
reliability contract: `memory/system/golfhelm-engineering-os.md`. Record an
incident (`memory/incidents/<feature_id>/INC-*.md`) or a decision
(`memory/decisions/ADR-*.md`) when a change is incident- or
architecture-driven.

## Feature ownership: coach vs player vs team

### Coach-Only Features

> **The coach intelligence surfaces are consolidated.**
> Alerts, Patterns, Insights, Development Plans and CoachHelm Analytics are no
> longer routes of their own — they are **views inside `/dashboard/intelligence`**,
> reached by query string. The old paths survive only as `permanentRedirect`
> shims (registered `legacy: true, hidden: true` in
> `src/lib/golf/surface-registry.ts`, with belt-and-braces rules in
> `next.config.mjs`). **Editing a shim does not change what any user sees** —
> change the view inside `/dashboard/intelligence` instead.
>
> Their **action files are still live** and still the right place for data work;
> the consolidated pages call them. Only the routes are retired.

| Feature | Where it lives now | Primary Table | Action File |
|---------|--------------------|---------------|-------------|
| Intelligence Hub | `/dashboard/intelligence` — the real page | (multiple CoachHelm) | intelligence-dashboard.ts |
| Alerts | `…/intelligence?view=signals&filter=alerts` | golf_coach_insights | alerts.ts |
| Patterns | `…/intelligence?view=signals&filter=patterns` | golf_patterns_v2 | pattern-management.ts |
| Insights | `…/intelligence?view=signals&filter=insights` | golf_coach_insights | insight-management.ts |
| Development Plans | `…/intelligence?view=players` | golf_player_focus_areas | development.ts |
| CoachHelm Analytics | `…/intelligence?view=effectiveness` | golf_insight_effectiveness | coachhelm-analytics.ts |
| Coaching Settings | `/dashboard/settings/coaching-intelligence` | golf_coach_philosophy | (in settings page) |
| Create Qualifier | `/dashboard/qualifiers/new` | golf_qualifiers | golf.ts |
| Team Stats | `/dashboard/stats/team` | golf_player_stats_cache | stats.ts, stats-data.ts, stats-leak-maps.ts, stats-intelligence.ts |
| Player deep-dive | `/dashboard/players/[playerId]/game` (bare `[playerId]` redirects here) | golf_coach_insights | (see features doc) |

### Player-Only Features

> Same consolidation on the player side: the `my-*` surfaces are now **views
> inside `/dashboard/coachhelm`**, and `/dashboard/hub` folded into
> `/dashboard`. The old paths are redirect shims — see the note above.

| Feature | Where it lives now | Primary Table | Action File |
|---------|--------------------|---------------|-------------|
| Player CoachHelm | `/dashboard/coachhelm` — the real page | golf_predictions | shot-analytics.ts |
| Player home | `/dashboard` (was `/dashboard/hub`) | (travel, tasks, events) | dashboard-data.ts |
| My Development | `…/coachhelm?view=development` | golf_player_focus_areas | development.ts |
| My Standing | `…/coachhelm?view=standing` | golf_player_stats_cache | stats-data.ts |
| My Game Profile | `…/coachhelm?view=profile` | golf_predictions | shot-analytics.ts |
| My Insights | `…/coachhelm` (no separate view) | golf_coach_insights | — |
| My Qualifiers | `/dashboard/my-qualifiers` | golf_qualifier_entries | golf.ts |
| Round Entry | `/dashboard/rounds/new` | golf_rounds | golf.ts |
| Continue Round | `/dashboard/rounds/continue/[id]` | golf_shots | golf.ts |
| Round Review | `/dashboard/rounds/[id]/review` | golf_round_reviews | round-reviews.ts, round-review-system.ts |
| Classes | `/dashboard/classes` | golf_player_classes | (inline) |

### Team Features (Both Coach + Player)
| Feature | Route | Primary Table | Action File |
|---------|-------|---------------|-------------|
| Calendar & Events | `/dashboard/calendar` | golf_events | event-lifecycle.ts, attendance.ts |
| Roster | `/dashboard/roster` | golf_team_members | roster.ts |
| Messaging | `/dashboard/messages` | golf_messages | messages.ts |
| Announcements | `/dashboard/announcements` | golf_announcements | announcements.ts |
| Tasks | `/dashboard/tasks` | golf_tasks | tasks.ts |
| Documents | `/dashboard/documents` | golf_documents | documents.ts |
| Travel | `/dashboard/travel` | golf_travel_itineraries | travel.ts |
| Qualifiers (view) | `/dashboard/qualifiers` | golf_qualifiers | golf.ts |
| Stats (personal) | `/dashboard/stats` | golf_player_stats_cache | stats.ts, stats-data.ts, stats-leak-maps.ts, stats-intelligence.ts |
| Team Info | `/dashboard/team` | golf_teams | teams.ts |
| Settings | `/dashboard/settings` | users, golf_coaches/players | (inline) |

### Platform (Admin)
| Feature | Route | Action File |
|---------|-------|-------------|
| Admin Dashboard | `/golf/admin` | admin-data.ts |
| Join Team | `/golf/join/[code]` | roster.ts |

## Review checklist

What to *verify* on a golf change. Where features live is the ownership map above.

GolfHelm is a college **golf team-management** product with the **CoachHelm** AI
layer. Buyer = the program/coach; players are student-athletes (often minors).
Business context: `docs/business/08-golfhelm-business-context.md`,
`docs/business/03-product-invariants.md`. Feature/data map:
the mapped `memory/features/*.md`, `memory/context/golfhelm-database.md`.

### Always check

- **Coach vs. player feature ownership** — players must never see coach-only
  *controls* (Coach Intent, roster management, qualifier selection); coaches must
  keep full visibility into player development. Note the distinction from the
  ownership map above: `/dashboard/roster` and `/dashboard/qualifiers` are shared
  *routes*; it is the management controls inside them that are coach-only.
- **Strokes-Gained & stat cache** — SG is served from `golf_player_stats_cache`,
  not recomputed on read; recompute happens at write (round save). Two read
  paths must not drift. SG math must match the Broadie formula in
  `docs/v3-research-golf-domain.md`.
- **Round/qualifier data integrity** — round save and qualifier-selection saves
  are the highest-risk surfaces for the no-destructive-write rule and for silent
  duplication. Coach↔team is via `golf_team_coach_staff`, players via
  `golf_team_members` (`status='active'`).
- **CoachHelm insight traceability** — every causal claim traces to
  `docs/v3-research-golf-domain.md`; see `coachhelm-review.md`.
- **Calendar/time-sensitive surfaces** — timestamps UTC, display in team/user
  timezone, tz-aware day boundaries, DST-tested recurrence, required-vs-optional
  legible to players. Apply the same care to any time-, money-, or
  count-sensitive golf surface.
- **Mobile & states** — player-facing surfaces are mobile-first; skeletons over
  spinners; honest empty/error states (no fabricated zeros).

### Block if

- a player can see or trigger a coach-only control, or a coach loses visibility
  into a player development workflow;
- SG/round/qualifier data can duplicate or silently corrupt (DELETE-then-INSERT
  in a save path; recompute-on-read that can disagree with the cache);
- a golf insight/narrative ships advice without citation / verification /
  template fallback, or is generated client-side.

### Suggest (non-blocking)

- The PR builds most of a coach workflow but leaves the "so the coach can act on
  it" step missing (see `docs/business/04-workflow-maps.md` failure states).
- A small add that removes coach friction on a high-frequency task (qualifier
  travel selection, roster edits, reviewing who's improving and why).
- A cheap move toward a stated differentiator (conversational round review,
  coach-approved Goals, the qualifier/travel-selection workspace) or a
  competitor-parity gap vs. Clippd/DECADE.
- A missing RLS/business-contract/E2E test on a stats, roster, or qualifier
  surface the PR touches.

## File structure (key paths)

```
src/app/golf/
├── actions/              # Server action files (see memory/projects/golfhelm.md)
├── (dashboard)/dashboard/  # All dashboard routes
├── (auth)/               # Login, signup, forgot/reset password
├── (onboarding)/         # Coach (3-step) + Player (4-step)
├── join/[code]/          # Team join flow
└── admin/                # Admin panel

src/components/fairway/   # THE SHIPPED GOLF DASHBOARD UI — pages/ organized
│                         # by surface (rounds-tracking, rounds-new, team-hub,
│                         # settings, qualifiers, …) plus the shared kit
│                         # (surfaces/, controls/, overlays/, charts/, …).
│                         # New golf dashboard UI goes here.

src/components/golf/      # Older component tree: coachhelm/ (CoachHelm AI),
├── coachhelm/            # calendar/, player-hub/, and a mix of live and
├── calendar/             # retired surfaces. Check whether a fairway/
├── player-hub/           # equivalent exists before adding here.
└── ...

src/lib/
├── supabase/             # server.ts, client.ts
├── types/                # ALL types (index.ts re-exports)
│   ├── golf.ts           # Entity types
│   └── golf-course.ts    # Course types
├── coachhelm/            # AI engine (see memory/context/coachhelm-ai.md)
│   ├── v2/               # V2: orchestrator, mining, prediction, learning, NLG
│   └── v3/               # V3 engine generation — both are live; check the
│                         # CoachHelm feature doc for which layer new work uses
└── utils.ts              # cn(), formatters

src/hooks/golf/           # Realtime, data, offline hooks (see memory/projects/golfhelm.md)
src/stores/               # Zustand (auth-store.ts — shared across golf + baseball, not golf-specific)
```

Deliverables (screenshots, exports, scratch reports) never enter the repo; a test's own baseline file lives next to that test, not in a shared top-level folder.

---

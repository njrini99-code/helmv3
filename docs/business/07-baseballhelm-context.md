# BaseballHelm — Business Context

> Purpose: give a reviewer or new engineer the "why" behind BaseballHelm — buyer
> promise, personas, the recruiting/roster invariants that must not regress, and
> the high-level workflows — so a change can be judged against how a college
> baseball program actually uses the product, not just whether the code compiles.
> Code-level detail (routes, tables, data flows) lives in
> `memory/context/baseballhelm-{database,features,workflows}.md`. NOTE:
> BaseballHelm is under active rework — trust the DB enums/RLS as ground truth
> and treat route/behavior detail as current-state, not a frozen contract.

BaseballHelm is one of Helm Sports Labs' products (see `00-business-context.md`).
It is a **college baseball recruiting + team-management** operating system:
give a program a clean, premium place to run recruiting, rosters, player
information, stats, and team ops without spreadsheet chaos.

## 1. Buyer promise

Give a baseball program one trustworthy system to (a) find and track recruits,
(b) manage the roster and staff, (c) keep player information and stats honest and
in one place, and (d) run day-to-day team operations — fast enough that a coach
reaches the recruiting/roster info they need in seconds, on mobile, between
innings. The buyer is the **program/coach**; players and recruits are end users.

## 2. Personas (see `01-personas.md`)

- **Head coach** — full program authority; the primary buyer/operator.
- **Assistant / recruiting coordinator** — scoped by capability flags on
  `baseball_team_coach_staff` (e.g. `can_manage_roster`, `can_manage_stats`,
  `can_invite_staff`, `can_export_reports`).
- **Strength & conditioning coach** — Lift Lab (`helm_lifting_*`) via
  `can_manage_lifting` / `can_view_readiness`.
- **Player / recruit** — often a **minor**; owns their profile and recruiting
  opt-in; mobile-first surfaces.
- **Coach types (market type, NOT job title)**: College, JUCO, High School,
  Showcase. Only **College and JUCO** recruit; High School and Showcase never do.

## 3. Invariants that must never break

These are stable rules the active rework must respect (enforced in
`03-product-invariants.md` and `.claude/rules/baseball-review.md` — the latter
moved there 2026-08-09 from `src/app/baseball/.greptile/rules.md`, which was
orphaned when Greptile was dropped):

- **Recruiting is opt-in.** A player must explicitly activate recruiting
  (`recruiting_activated`). **College players can never activate.** Only the
  player's own activation sets that flag.
- **Recruitability gate.** A recruit-off, private, college, or own-roster player
  must never surface as recruitable (`assertCoachCanRecruitPlayer`, 8 conditions).
- **Pipeline stages are exactly 5**: `watchlist`, `high_priority`,
  `offer_extended`, `committed`, `uninterested` (the `baseball_pipeline_stage`
  enum). Any other value is a bug.
- **Team data isolation.** Tenancy resolves server-side; staff-only reads return
  zero rows for non-members. No cross-team reads/writes. Never trust a
  client-supplied team/coach/player id.
- **Duplicate detection.** Roster/watchlist/interest writes are idempotent on
  their unique keys; there is no fuzzy name-based prospect dedup — don't assume
  one.
- **Stat honesty.** Respect the three-layer stat model; box-score saves are
  atomic; starved metrics render as "no data," never a fabricated `.000`.
- **Idempotent imports.** Re-import updates/merges, never duplicates; preserve
  source, timestamp, confidence.
- **Additive DB safety.** BaseballHelm shares the live GolfHelm Supabase project;
  all migrations are additive, `baseball_*` / `helm_lifting_*` only, RLS on every
  new table, REVOKE anon after.

## 4. Critical workflows (high level; details in `memory/context/baseballhelm-workflows.md`)

- Coach reviews prospects → moves a player through the recruiting pipeline.
- Player creates/activates a recruiting profile (opt-in; anonymized vs. identified interest).
- Coach manages roster / staff / team data (non-destructive membership ops).
- Coach reviews stats (canonical box-score → season rollup).
- Onboarding: new coach (coach-type selection) and new player (recruiting default OFF).

## 5. Positioning

Baseball competitors are named for stats/import interoperability (GameChanger,
StatCrew, PrestoSports, SIDEARM/NCAA XML), not as head-to-head coaching products
(`06-competitor-positioning.md`). The differentiation is the same as the suite's:
a clean, premium operating system that removes spreadsheet/manual work and keeps
data trustworthy.

## For the reviewer

- Flag any change that lets a non-recruitable player appear/act recruitable, or
  breaks recruiting opt-in / role-based visibility.
- Flag any cross-team read/write, or tenancy resolved from a client-supplied id.
- Flag pipeline-stage values outside the 5-value enum, or silent duplicate
  creation of recruits/players/events/import rows.
- Flag stats computed without tests or via non-atomic box-score writes.
- Suggest (non-blocking) enhancements that shorten a coach's path to a recruiting
  decision, consolidate the divergent recruitability checks, or finish a
  workflow's "coach can act on it" step.

# GolfHelm review rules (cascades onto the root `.greptile/rules.md`)

GolfHelm is a college **golf team-management** product with the **CoachHelm** AI
layer. Buyer = the program/coach; players are student-athletes (often minors).
Business context: `docs/business/08-golfhelm-business-context.md`,
`docs/business/03-product-invariants.md`. Feature/data map:
`memory/context/golfhelm-features.md`, `memory/context/golfhelm-database.md`.

## Always check on a golf PR
- **Coach vs. player feature ownership** — players must never see coach-only
  controls (Coach Intent, roster mgmt, qualifier selection); coaches must keep
  full visibility into player development.
- **Strokes-Gained & stat cache** — SG is served from `golf_player_stats_cache`,
  not recomputed on read; recompute happens at write (round save). Two read
  paths must not drift. SG math must match the Broadie formula in
  `docs/v3-research-golf-domain.md`.
- **Round/qualifier data integrity** — round save and qualifier-selection saves
  are the highest-risk surfaces for the no-destructive-write rule and for silent
  duplication. Coach↔team is via `golf_team_coach_staff`, players via
  `golf_team_members` (`status='active'`).
- **CoachHelm insight traceability** — every causal claim traces to
  `docs/v3-research-golf-domain.md`; see `src/lib/coachhelm/.greptile/rules.md`.
- **Calendar/time-sensitive surfaces** — timestamps UTC, display in team/user
  timezone, tz-aware day boundaries, DST-tested recurrence, required-vs-optional
  legible to players. (This is one example of a broader rule: apply the same
  care to any time-, money-, or count-sensitive golf surface.)
- **Mobile & states** — player-facing surfaces are mobile-first; skeletons over
  spinners; honest empty/error states (no fabricated zeros).

## Block if
- a player can see or trigger a coach-only control, or a coach loses visibility
  into a player development workflow;
- SG/round/qualifier data can duplicate or silently corrupt (DELETE-then-INSERT
  in a save path; recompute-on-read that can disagree with the cache);
- a golf insight/narrative ships advice without citation / verification /
  template fallback, or is generated client-side.

## Suggest (non-blocking) enhancements
- The PR builds most of a coach workflow but leaves the "so the coach can act on
  it" step missing (see `docs/business/04-workflow-maps.md` failure states).
- A small add that removes coach friction on a high-frequency task (qualifier
  travel selection, roster edits, reviewing who's improving and why).
- A cheap move toward a stated differentiator (conversational round review,
  coach-approved Goals, the qualifier/travel-selection workspace) or a
  competitor-parity gap vs. Clippd/DECADE.
- A missing RLS/business-contract/E2E test on a stats, roster, or qualifier
  surface the PR touches.

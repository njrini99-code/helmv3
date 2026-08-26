# Feature: CoachHelm AI

<!-- schema-drift-banner -->
> **⚠️ 1 identifier named below does not exist in the database.**
> Verified 2026-08-19 against production. `golf_insight_evidence`
>
> It is described here as if live. Do not query, type, or build on it —
> check `src/lib/types/database.ts` (or `memory/glossary.md`'s AUTOGEN blocks)
> before trusting any table name in this file. Tracked in
> `.doc-schema-baseline.json`; `npm run docs:schema-drift` fails on new ones.
> Removing this is a ratchet-down — re-run
> `node scripts/check-doc-schema-drift.mjs --update` after.


## Status

- active

## Current State

CoachHelm is the golf intelligence layer. It turns round, shot, standing, player, and team context into coach-facing and player-facing insights, recommendations, narratives, and follow-up surfaces.

The feature currently spans two generations:

- **V2**: established insight mining, prediction, learning, NLG, post-round triggers, and coach/player feedback loops.
- **V3**: newer generator framework for composite insights, counterfactuals, player genome, provider ingest, goals, intent, LLM narratives, practice recommendations, qualifying, and chat.

## Primary Entry Points

### Routes

- `src/app/golf/(dashboard)/dashboard/coachhelm/**`
- `src/app/golf/(dashboard)/dashboard/analytics/coachhelm/**`

### Components

- `src/components/golf/coachhelm/**`

### Actions And APIs

- `src/app/golf/actions/coachhelm-data.ts`
- `src/app/golf/actions/coachhelm-analytics.ts`
- `src/app/golf/actions/insight-delivery.ts`
- `src/app/golf/actions/insight-management.ts`
- `src/app/golf/actions/intelligence-dashboard.ts`
- `src/app/golf/actions/player-feedback.ts`
- `src/app/golf/actions/v3/**`
- `src/app/api/cron/coachhelm*.ts`
- `src/app/api/cron/v3/**`

### Engine Code

- `src/lib/coachhelm/v2/**`
- `src/lib/coachhelm/v3/**`

## Core Data

- `golf_coach_insights`
- `golf_insight_evidence`
- `golf_insight_player_feedback`
- `golf_insight_generation_log`
- `golf_insight_effectiveness`
- `golf_patterns_v2`
- `golf_predictions`
- `golf_player_focus_areas`
- `golf_player_stats_cache`
- V3 tables such as CoachHelm settings, player genome, ingest, qualifying, budget, chat, and outcome attribution tables.

Use `memory/context/golfhelm-database.md` for exact columns and `memory/glossary.md` for table lookup.

## Business Rules

- LLM work must never run client-side.
- Coach-facing insight reads must scope through assigned teams, not broad player access.
- Player-facing feedback must be tied to the authenticated player and revalidate the affected dashboard surfaces.
- Coach-to-team ownership is via `golf_team_coach_staff`; do not infer it from `golf_coaches.team_id`.
- V2/V3 scoring and generator logic should stay pure where designed as pure engine code; Supabase access belongs in loaders, actions, or orchestration boundaries.
- Citations, evidence, and baseline comparisons are part of the trust contract. Do not emit fabricated comparisons or uncited claims.
- Budget-sensitive LLM behavior should use team settings and persisted usage, not hardcoded token math.

## UI Contract

- Coach views need fast triage: new, acknowledged, dismissed, resolved, and priority states must be visible.
- Player views need clear actionability: what changed, why it matters, and what to do next.
- Loading states should use skeletons that match final layout.
- Empty states should stay compact and explain whether there is no data, no permission, or no insight yet. The Ask page's `ProgramOpening` renders a compact honest empty state when the program pulse has no items (2026-08-26) — it must never return nothing and leave the column blank.
- Mobile views must use the shared app shell, Standard or Action headers, and bottom-nav clearance from `AGENTS.md`.
- The Ask composer autofocuses only on fine-pointer (desktop) clients (2026-08-26). On touch, no CoachHelm surface may focus a text input on open — iOS answers that focus with a keyboard over an unread page.

## Known Risk Areas

- Generated insight evidence can drift from real data if adapters or fallback paths skip citation validation.
- Safety-net fallback behavior can mask generator failures if logs are ignored.
- Course-management "worst holes" insights require at least five samples,
  matching the persisted insight writer's validation contract. Smaller samples
  are intentionally skipped rather than surfacing a validation warning after a
  player submits a round.
- A completed round's CoachHelm terminal state is written only through the
  service-only `record_round_coachhelm_terminal_state` RPC. It may update
  processing metadata but cannot modify score, shots, identity, or status.
- Round-review feedback and player acknowledgement paths can become stale if revalidation misses player or coach routes.
- V3 feature surface is expanding quickly; registry/docs must be updated when new generators, tables, or cron routes land.

## Tests To Prefer

- Unit tests under `src/test/coachhelm/**`.
- Cron/API tests under `src/test/api/cron/coachhelm*.test.ts`.
- Component tests under `src/test/app/golf/dashboard/coachhelm/**`.
- Browser validation for changed coach/player surfaces when UI or route behavior changes.

## Related Docs

- `memory/context/coachhelm-ai.md`
- `memory/context/golfhelm-features.md`
- `docs/architecture/coachhelm-evidence-contract.md`
- `docs/v3-research-golf-domain.md`
- `docs/v3-testing-standards.md`

# CoachHelm agentic visuals and actions

Owner brief, 2026-10-25 ("CoachHelm — Agentic Golf Intelligence and Generative Visual Workspace"): turn the chat into an
investigator that explains with interactive visuals and, with approval, acts across Clubhouse. This file is the
repo-side record: the decision, the audit of what exists, and the phase gates. The full brief lives with the owner.

## Decision (recorded in `docs/v3-decisions.md` and `docs/v3-master-plan.md`)

Coach chat is Q&A with grounded interactive visuals, and creates goals, focus areas, tasks, announcements and recurring
practices from chat, each only after the coach confirms. Every new visual and write ships behind a flag.

## What exists (read from the code, 2026-10-25)

| Piece | Where | Note |
| --- | --- | --- |
| Stream route | `src/app/api/coachhelm/v3/chat/stream/route.ts` | Tool loop, approvals, persistence, numeric audit (`verdict.ts`). |
| Tools | `chat/agent-tools.ts` | Read tools wrap `guarded()` + `collect()`; four gated writes (`CONFIRM_REQUIRED_TOOLS`). |
| Evidence | `chat/provenance.ts` | `Measurement`, `MeasurementSeries`, `ToolEnvelope`; numbers outside them fail the audit. |
| Typed parts | `data-progress`, `data-evidence`, `data-action-*` | Persisted as `ui_parts`; `chat/restore.ts` `REPLAYABLE` is the replay allow-list. |
| Thread | `src/clubhouse/screens/coachhelm/chat/*` | `buildTurns` in `src/clubhouse/data/coachhelm-chat-thread.ts` turns parts into blocks. |
| Charts | `src/clubhouse/ui/charts/Line.tsx`, `src/components/fairway/charts/*` | Fairway charts are not imported into Clubhouse (`.claude/rules/clubhouse.md`). |
| Motion | `src/clubhouse/lib/motion.ts` | Pinned durations; no first-paint draw-ins or count-ups. |

## Phase gates

- **Phase 0**: this audit and the decision. Done.
- **Phase 1**: `VisualSpec`, server validation, `data-visual-artifact`, one scene (`sg_anatomy`), restore, selection
  without a model call, table fallback. Flag `coachhelm_visual_artifacts_v1`.
- **Phase 2**: more reads (round, distance band, context split, shot clusters) and scenes.
- **Phase 3**: more gated actions (calendar, goal, task, message) through the existing proposal ledger.
- **Phase 4 and 5**: shot replay, scenario engine, durable investigations, evaluation.

## Rules that do not move

- The model names a scene and evidence; it never supplies data, geometry, colours, code or a team id.
- A visual's numbers come from a `ToolEnvelope` this turn, or the artifact is refused and the generic evidence draws.
- A written change is approved first, claimed once, and leaves a receipt (`action-runs.ts`).

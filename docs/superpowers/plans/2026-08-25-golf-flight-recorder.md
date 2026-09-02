# Golf Flight Recorder Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make each Golf round mutation auditable across client, Server Action, Supabase/Postgres, verification, and background work without making tracing a dependency of the player workflow.

**Architecture:** A shared workflow definition declares required, conditional, best-effort, and asynchronous steps. Server-side recording writes to a private `helm_debug` schema through service-role-only RPCs outside business transactions; transaction-local settings and `HELM_TRACE` PostgreSQL log checkpoints retain the atomic path through a rollback. The existing Bridge Golf Tracer receives a trace list/detail surface instead of a parallel admin application.

**Tech Stack:** Next.js 16, Sentry Next.js, Supabase JS 2.112.3, OpenTelemetry API, PostgreSQL/pgTAP, Docker Supabase, Vitest.

**Spec:** User request “Build Helm’s End-to-End Database Flight Recorder & Visual Trace Explorer.”

## Global Constraints

- Trace writes are fail-open and never alter player data or authorization.
- `helm_debug` is not exposed through PostgREST; service-role-only public RPC facades use a safe search path.
- No raw round payload, credentials, request headers, cookies, or session data may enter traces.
- Production receives workflow-level sampling only; row-level PostgreSQL logging remains local/explicit-debug only.
- Existing Supabase fetch timeout behavior remains unchanged.
- No production deploy or schema mutation occurs in this task without owner approval.

---

### Task 1: Canonical workflow contract

**Files:**
- Create: `src/lib/observability/golf-round-flight-workflow.ts`
- Test: `src/lib/observability/__tests__/golf-round-flight-workflow.test.ts`

- [x] Define all ten requested Golf workflows and expected step classifications.
- [x] Add missing-required-step computation so an absent verification is visible rather than silently omitted.
- [x] Add unit proof for failed submit and non-qualifier conditional behavior.

### Task 2: Private trace persistence and server recorder

**Files:**
- Create: Supabase migration generated through the repo-pinned CLI
- Create: `src/lib/observability/helm-flight-recorder.ts`
- Test: `src/lib/observability/__tests__/helm-flight-recorder.test.ts`

- [ ] Create private trace tables plus least-privilege service-role RPC facades.
- [ ] Write fail-open run/step/finalization calls with Sentry business spans.
- [ ] Persist missing required steps at finalization.

### Task 3: Postgres rollback recorder

**Files:**
- Modify: generated migration from Task 2
- Create: `supabase/tests/rls/golf_flight_recorder.sql`
- Create: `scripts/trace-db.ts`

- [ ] Add transaction-local trace context and `HELM_TRACE` structured log helper.
- [ ] Instrument only the active atomic save/submit functions and relevant round/shot triggers at workflow level.
- [ ] Preserve SQLSTATE and append logical checkpoint history on unexpected failures.
- [ ] Add an optional Docker log collector that writes checkpoints in its own transaction.

### Task 4: Server Action and client tracing

**Files:**
- Modify: `src/app/golf/actions/golf.ts`
- Modify: `src/lib/supabase/{client,server,admin}.ts`
- Modify: `src/instrumentation.ts`, `src/instrumentation-client.ts`
- Test: Golf action regression and trace-recorder tests

- [ ] Enable current supported Supabase W3C propagation and Sentry integration without collecting operation bodies.
- [ ] Attach a generated/validated Helm trace ID to autosave and submit payload metadata.
- [ ] Trace validation/auth/player/RPC/invariants/post-work and preserve background work as pending or terminal.

### Task 5: Trace Explorer and proof

**Files:**
- Modify: `src/app/admin/golf/tracer/**`
- Create: `docs/audits/SHOT_TRACKING_TRACE_FINDINGS_2026-08-25.md`

- [ ] Add trace list and tree detail to the existing super-admin Golf Tracer.
- [ ] Execute normal autosave, submit, qualifier submit, and controlled rollback/background failure paths against Docker.
- [ ] Record evidence, performance, actual findings, and remaining production-sampling constraints.

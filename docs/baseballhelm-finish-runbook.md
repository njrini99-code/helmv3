# BaseballHelm Finish — Subagent Orchestration Runbook

> Execution plan for Phases A–D. Author: orchestrator (team-lead). Date: 2026-06-24.
> **Throttle:** Balanced (≤8 concurrent / workflow). **Deploy:** "you stage, I deploy" — ≤2 prod deploys, deploy ONCE at the very end. **DB is golf-shared prod** — every migration is golf-safety reviewed + applied only with owner sign-off.

## Efficiency rules (apply to every phase)
- **Model tiering:** Sonnet for fix/build/seed/cast-cleanup; **Opus only** for golf-safety migration review + the final adversarial security verify. Never Opus for mechanical work.
- **Reuse, don't re-audit:** feed the verifiers' *enumerated* findings straight into fixers (the cleanup-wave pattern). No surface gets re-scanned from scratch.
- **Conditional loops:** only re-touch surfaces that actually miss the bar. A passing surface is never re-opened.
- **Batch cross-cutting work:** one agent for a repo-wide concern (cast cleanup, lint), not one-per-surface.
- **File-disjoint ownership** on every parallel wave → no collisions, full parallelism. One consolidation `typecheck` at the end of a wave, never per-agent.
- **Resumable:** workflows cache by (prompt, opts). A partial failure resumes from cache, never re-runs completed agents.
- **Checkpoints (hard pauses for owner):** before Phase B (big spend), before EACH migration apply, before the deploy. Telemetry streams to the Agent Floor throughout.

---

## PHASE A — Land the cleanup + restore type-safety  (mostly me + MCP; cheap)
**A1. Consolidate cleanup** — *me.* Full-repo `npm run typecheck`; if red, dispatch 1 Sonnet fixer per error cluster (file-disjoint). Produce the before→after scorecard.
**A2. Straggler loop** — *conditional workflow.* Only the surfaces whose re-verify came back <90. Same `bbh-cleanup-to-90` script, resumed with a filtered index list (fix→verify). Loop until 0 stragglers or 2 dry rounds. **Skip entirely if all 18 ≥ 90.**
**A3. Apply the baseball migration** — `20260624000010_baseball_stat_uploads_reconcile.sql`. *db-migration-reviewer (Opus)* → golf-safety verdict → **CHECKPOINT (owner sign-off)** → I apply via Supabase MCP `apply_migration`.
**A4. Kill the `(supabase as any)` casts** — *me + 1 Sonnet agent.* After A3, regen `src/lib/types/database.ts` via MCP `generate_typescript_types`; then ONE cast-cleanup agent removes the casts the verifiers flagged (now that the types exist). Re-typecheck.
**Exit A:** baseball surfaces ≥90, types clean, build+typecheck green.

---

## PHASE B — Build the Lifting Lab  (the big chunk; gated by a checkpoint)
> Blueprint: `docs/lifting-lab/HELM_LIFTING_LAB_BLUEPRINT.md`. Wave 1 blocking → Wave 2 fan-out. **CHECKPOINT before starting B (token spend).**

**B1. Foundation (Wave 1) — 1 blocking Sonnet agent.** Writes migrations 1–4 (identity, data-library-programs, data-sessions-readiness, accept-invite-RPC) + hand-written types (`helm-lifting.ts`, `helm-lifting-data.ts`) + `src/lib/lifting/{access,with-lifting-action,resolve-baseball-context}.ts` + `adapters/baseball-view-adapter.ts` + `untyped.ts` allowlist + barrel. **Writes only — applies nothing.**
**B2. Migration review + apply** — *db-migration-reviewer (Opus)* on migrations 1–4 → golf-safety verdict (additive, REVOKE anon, RLS, pinned search_path, no shared-object/enum change) → **CHECKPOINT (owner sign-off)** → I apply 1–4 via MCP → regen `database.ts`.
**B3. Wave 2 — workflow, 6 file-disjoint Sonnet agents (≤8 concurrent), each streaming telemetry:**
  - W2-A invites & accept · W2-B portal shell & auth · W2-C Lab program/session/readiness UIs · W2-D athletes & roster · W2-E onboarding branch (both sports) · **W2-G backfill migration (file) + baseball dashboard rewire**.
  - Ownership exactly per blueprint §8; W2-G is the ONLY task allowed to touch `src/app/baseball/**` + `src/components/baseball/performance/**`.
**B4. Apply backfill (migration 5)** — *db-migration-reviewer (Opus)* on the W2-G backfill → **CHECKPOINT** → I apply (copy-only, idempotent on `legacy_baseball_id`) → optional row-count parity check.
**B5. Verify B** — *workflow:* adversarial verify per Wave-2 area + a dedicated **golf-safety verify** (RLS on every new table, `pg_class.relacl` anon check, golf untouched, backfill copied correctly, baseball dashboard still renders via `helm_lifting_*`). Consolidate `typecheck` + `build`.
**Exit B:** Lab live behind its portal, baseball lifting unified + rendering, golf provably untouched, green.

---

## PHASE C — QA + polish  (breadth to subagents, live flows to me)
**C1. Demo data** — *1 Sonnet agent.* Extend `scripts/seed-baseball-demo.ts` with lifting data + a **lifting-coach demo login** (org-scoped, covering the demo org's teams); reseed. All three logins (coach/player/lifting-coach) populated.
**C2. Role-permission matrix** — *workflow, ~3 Sonnet agents* reading the zip acceptance specs, each asserting one role's allowed/denied surfaces (coach / player / lifting-coach) against the actual routes + RLS. Structured pass/fail.
**C3. Browser click-through** — *me, Playwright MCP.* Drive the real demo flows (coach command center, player today, invite→accept a lifting coach, the Lab) headless; screenshot the key screens; catch render/wiring breaks agents can't self-certify.
**C4. Final UX/motion sweep** — *1–2 Sonnet agents* on anything C2/C3 flag as below the GolfHelm bar (palette, skeletons, motion, empty/error states).
**Exit C:** flows verified by click-through, demo populated, screen-acceptance met.

---

## PHASE C-FINAL — Holistic architectural + UI cohesion  (owner-chosen: ONE final premium pass at the very end; distinct from Phase C's task C2)
> Per-surface work is structurally blind across surfaces (file-disjoint agents). This is the ONLY pass that judges the WHOLE product as one thing. Runs after the Lab + all surfaces are final, immediately before deploy. Targets the scorecard's cross-cutting weak spots: **UX-arch 52, Coach↔Player Parity 38, Premium 68, Motion 68, Screen 72.**
**C2.1 Architectural consistency** — *workflow, ~4 Sonnet agents, each a dimension reading ACROSS all surfaces (baseball + Lab):* (a) pattern/duplication (divergent solutions, reinvented primitives), (b) data-flow/read-model coherence + server/client boundaries, (c) route/IA + navigation consistency, (d) **coach↔player parity** — does each coach surface mirror its player counterpart. → dedup findings → file-disjoint fix agents.
**C2.2 UI/UX cohesion** — *me (Playwright) + ui-polish-reviewer:* screenshot every surface across all three roles (coach / player / lifting-coach) → review the whole product against the GolfHelm bar + the high-end-visual-design rules (one visual language, type + spacing rhythm, motion language, hierarchy, "feels like one $150k product") → findings → fix agents.
**C2.3 Re-score** the holistic dimensions vs the 60/100 baseline; confirm they clear the 90 bar.
**Exit C2:** one cohesive premium product; the cross-surface dimensions lifted, not just the per-surface ones.

---

## PHASE D — Stage + deploy  (me; owner runs the deploy)
**D1. Green gate** — *me.* `typecheck` + `build` + `lint` all pass.
**D2. Final scorecard** — *workflow* (the verification harness) re-run → confirm 90+ across baseball **and** the Lab; produce the deliverable scorecard.
**D3. Runbook** — *me.* Write the deploy runbook: migration apply-order (already applied to shared DB, listed for the record), required env vars, the exact commit to ship, rollback path. Stage everything green (Fairway/golf changes ride along per owner).
**D4. Deploy** — **owner runs the prod deploy (Vercel main).** I run the post-deploy smoke check (homepage/login/baseball/lifting 200s + a demo login).
**Exit D:** shipped, smoke-verified.

---

## Dependency DAG (what blocks what)
```
A1→A2 (cond) ─┐
A3→A4 ────────┤→ [CHECKPOINT B] → B1 → B2(apply 1–4)+regen → B3(Wave2) → B4(apply backfill) → B5(verify)
              │                                                                                      │
              └──────────────────────────────────────────────────────────────────────────→ C1,C2,C3,C4 → D1→D2→D3→[CHECKPOINT D]→D4
```
- C1 (demo+lifting login) needs B done (lifting tables exist). C2/C3 need C1.
- Everything in A can run before/parallel to the B checkpoint.

## Token guardrails
- Phase A ≈ cheap (MCP + ≤few Sonnet fixers). Phase B = the big one — checkpoint first; Wave 2 is ~6 Sonnet agents + verify. Phase C ≈ moderate. Phase D ≈ cheap.
- If budget tightens: ship after Exit B (baseball + Lab, green) and defer C4 polish + D2 rescore to a follow-up. Security + correctness never deferred.

# GolfHelm Unified Remediation Plan (2026-06-21)

Supersedes the premium-only plan. Covers **two audits in one pass**:

- **A — Premium scrub** (UI/feature completeness): `FINDINGS_CALIBRATED.csv`. Post-calibration must-fix (crit+high+med) = **301** (16 crit / 86 high / 199 med). Calibration finding: 0 refuted, 97 mis-severed (mostly down-graded) → the issues are real but severities were inflated; true criticals are ~16, the bulk is medium polish.
- **B — CoachHelm engine audit**: `COACHHELM_MASTER_ENGINE_FEATURE_REMEDIATION_AUDIT_2026-06-21.md`. ~22 must-fix (6 P0 / 6 P1 / 10 P2; P3 deferred) — engine correctness (attribution direction, prediction validation, LLM grounding, goal measurement, notification delivery wiring, etc.). Has its own Batch 0–4.

Scope this pass: **all critical + high + medium** from both. Low/P3 deferred.

## Constraints (this is now a hard requirement)

- **Token frugality** — the monthly spend limit was hit mid-calibration (37 agents failed). No more big exploratory/verification fleets. Reuse existing data. Fat agents, gate once per wave.
- **Organized + parallel** — tracked batches, file-disjoint parallelism, resumable waves.

## Frugal execution model

1. **Fat agent per file, not per finding.** Findings concentrate: 31 hot files hold 150 findings → one agent fixes ALL of a file's crit+high+med in a single read/edit/verify. ~6× cheaper than per-finding.
2. **Theme-sweep agents for the long tail.** 151 findings sit across 126 files but are the SAME systemic themes (a11y focus-ring, mobile, microcopy, skeleton shape-match, EmptyState adoption, optimistic/undo). One agent per theme handles all its sites with a uniform edit pattern.
3. **Gate once per wave, not per agent.** Agents edit only; I run `tsc`+lint+`test`+`build` on the integrated branch per wave (saves N full typechecks).
4. **No re-scan / minimal re-verify.** Trust the calibrated data. The 8 uncalibrated criticals get reality-checked *by the fixing agent* (free — it opens the file anyway), which also dedupes scrub near-duplicates (e.g. P435/436 ≈ P406/407) and demotes any remaining shape-match "criticals" (e.g. P386).
5. **Two parallel tracks** — Track A (premium, mostly `src/components/fairway/pages/**` + actions) and Track B (CoachHelm engine, mostly `src/lib/coachhelm/**`) are largely file-disjoint → run concurrently.

## Phasing (value-first, stop/resume-clean)

### PHASE 1 — Trust & breakage (do first; smallest, highest value)
- **A:** 16 premium criticals / 12 files — error-masked-as-empty (`dashboard/page.tsx`, `rounds/page.tsx`, `team-category-insights.ts`), dead controls (CommandPalette deep-links, TeamHub task-complete, Settings inputs), upload paths (`documents.ts`, `ExpenseForm`), contrast/focus tokens (`button.tsx`, `forms/styles.ts`, `FairwayEventEditor`).
- **B:** CoachHelm **Batch 0 "Protect trust"** — P0-01 attribution direction (lower-is-better), P0-02 prediction validation, P0-03 LLM unsupported-claim display, P0-04 round-success-after-generator-failure, P0-05 root-cause structured output, P0-06 composite over-confidence.
- Done directly / small batches with judgment (criticals need care). 1–2 PRs.

### PHASE 2 — Completeness & a11y blockers (86 high + CoachHelm P1 ×6)
- **A:** per-feature fat-agent batches for the hot files (FairwayCoachHelmSignals bulk-actions+keyboard cards, PlayersGridView, FairwayPlayerHub, Settings, Documents, Tasks, …) + theme-sweep for a11y-focus/keyboard.
- **B:** CoachHelm Batch 1 (diagnosis contract) + Batch 2 (goals/feedback/notifications: P1-07..P1-12).
- Parallel fat-agent waves, file-disjoint, gated per wave. ~6–8 PRs.

### PHASE 3 — Polish (199 medium + CoachHelm P2 ×10)
- **A:** theme-sweeps — skeleton shape-match, EmptyState adoption, microcopy, mobile parity, optimistic/undo, pagination disclosure, design-token coherence.
- **B:** CoachHelm Batch 3 (predictions/analytics) + Batch 4 (remove duplicate/divergent workflows: P2-13..P2-22).
- Parallel theme/feature waves, gated. ~6–10 PRs.

### PHASE 4 — Verify
- Integration-merge each wave, combined `next build` + full suite. Final targeted re-scrub of ONLY changed features (not the full 37-agent run) → confirm Layer-3 / premium-ready.

## Gating (every batch)
`tsc --noEmit` rc=0 · eslint 0-err + lint-ratchet held · `npm run test:run` full · `next build`. Per wave: integration-merge + combined build. No auto-merge to prod (gated PRs).

## Sequencing
Phase 1 → 2 → 3 → 4. Tracks A and B run concurrently within each phase. Hot-file owners serialized (one agent owns `FairwayCoachHelmSignals.tsx`). Legacy sunset is deferred (not in this pass) per the decision to lead with remediation.

## Status ledger
`FINDINGS_CALIBRATED.csv` is the spine (severity = calibrated where available, else orig; `cal_verdict`/`calibrated` columns). Batches mark findings done as PRs land.

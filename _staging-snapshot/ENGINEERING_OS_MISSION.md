# GolfHelm Engineering OS — Campaign Plan (2026-08-21 16:09 ET)

Owner's full spec saved verbatim by the commander session at:
/tmp/claude/night/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md
(to be installed at docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md in Phase 1)

## Phases (serialized on the shared tree; read-only work parallelizes)
- P0 (parallel, read-only, NOW): hooks/session-attribution audit; registry reconciliation audit
- P1: master spec + compact OS (memory/system/golfhelm-engineering-os.md, 100-250 lines) + CLAUDE.md/AGENTS.md pointers + .claude/rules/golfhelm-engineering-os.md + config/release-policy.yml — one PR
- P2: session attribution + hooks (session-state, record-context-load.mjs, guard-feature-context.mjs, record-session-touch.mjs, stop-gate rebuild, settings.json wiring) + control-plane tests — one PR (largest)
- P3: release machinery (scripts/release/{check-release-budget,build-release-candidate,check-release-candidate,status}.mjs, memory/operations/release-queue.yml, memory/ledgers/deployments.md, .github/workflows/production-release.yml w/ production environment gate) — one PR
- P4: daily reliability (scripts/operations/daily-health collector, .claude/skills/golfhelm-daily-reliability, golfhelm-release-manager, .claude/agents/golfhelm-{observer,healer,verifier}.md) — one PR
- P5: registry cross-check (knowledge:registry-check), repo:doctor extension (12 new checks), CI backstop wiring — one PR
- P6: proof tests 1-9 (section 44) + final report (section 45)
- DEFERRED w/ markers: feature-doc migration from golfhelm-features.md (section 6), history backfill (36)

## Hard invariants from the spec (verify at every phase)
- ≤2 routine prod deploys/calendar week (America/New_York), ceiling not target
- daily reliability may NEVER deploy/promote/rollback/mutate prod
- owner approval required for release (GitHub production environment or owner-run CLI)
- no issue-per-event: dedupe by feature_id+fingerprint+root cause
- one PR per verified root cause (or feature-scoped batch, same risk tier)
- main moves; production pins to release SHA
- no fake green; no baseline raises; self-healing must not hide errors
- session attribution via hook session_id at tool-use time, NOT git inference
- one feature vocabulary (memory/registry.yml canonical; runtime registry cross-checked)
- pointers not duplicates: CLAUDE.md/AGENTS.md point at compact OS; compact OS points at spec

## Existing context the workers should trust (from the last 24h of this session)
- vercel.json deploymentEnabled {"*":false} — CONFIRMED live; promote = CLI from clean worktree; .vercel link must be copied into fresh worktrees
- guard hooks (.claude/hooks/guard-bash.sh, guard-sql.sh) are load-bearing; PreToolUse guards not suspended by permissions
- auto-PRs via GITHUB_TOKEN cannot trigger CI (REGEN_PR_PAT fallback wired in #1556; secret not yet created — owner item #1564)
- feature-registry.ts drives get_feature_health RPC + withAdminObserved coverage contracts (pinned counts 447/439)
- release-relevant history: deployments today helmv3-bnlc2wvx5 (13:17Z) + helmv3-4ildzo7g3 (18:10Z) = 2 deploys this calendar week already... NOTE: budget counting starts on adoption; ledger backfill should record today's promotes
- 6 required checks on main; merge queue unavailable (user-owned repo)
- Supabase Preview check is advisory noise; Edge functions job now carries --minimum-dependency-age=120

## DeepWiki (owner-offered hint source)
- https://deepwiki.com/njrini99-code/helmv3 — 42 pages: GolfHelm features (2.1-2.6), CoachHelm engine (3.1-3.7 incl. LLM/citation, genome, delivery, cron), DB+RLS (5.1-5.3 incl. offline sync), admin/Tracer/CRM (6.1-6.3), CI/observability (7.1-7.3), testing (8.1-8.2), design system (9.x), glossary (10)
- DOCTRINE: hint-tier ONLY (same as memory prose) — machine-generated from the repo at an unknown index date; every claim must be verified against code/generated truth before import. Best use: structure + narrative seed for the feature-doc backfill (spec §36) and the compact OS; per-page URLs are stable markdown paths.

## P0 hooks audit: DONE (os-audit-hooks.md). Commander decisions on its 3 open calls:
1. Governed-path scope for the context gate = exactly the paths memory/registry.yml can map + supabase/migrations/** (gate where the registry has meaning; baseball only if registry covers it — confirm vs registry audit). Unmapped-but-governed file → spec §10 explicit-gap flow, not silent allow.
2. /tmp/cc-socks peer-detection: PRESERVE as-is (serves cross-session coordination beyond attribution); P2 does not extend it.
3. no_memory_change_reason: recorded as a session-state JSONL event via a tiny helper (`node .claude/hooks/lib/record-event.mjs no-memory-change --reason <enum>`) so it arrives through a real tool event; Stop gate validates the enum (spec §12 list), rejects bare "not needed".
ADOPTED from audit: JSONL append-only session-state (PostToolUse concurrency); absolute-path stripping in every registry-mapping hook (BLOCKER class); reuse scripts/knowledge/lib/registry.mjs (~5-10ms, no cache needed); prod-deploy deny = settings.json rules AND guard-bash.sh belt-and-braces; test pattern = src/test/hooks/guard-bash-worktree.test.ts (auto-discovered, no vitest.config change).
CORRECTION for P2 brief: "#1560" = GitHub issue (ratchet disable-comments stripped by post-edit eslint --fix), not an in-repo doc — behavior to preserve is post-edit.sh verbatim; do not chase the number in-repo.

## ARC 3 (owner spec #3, 17:03): Helm Autonomy Control Plane
- Master doc: /tmp/claude/night/HELM_AUTONOMY_CONTROL_PLANE.md → installs at docs/ai-system/HELM_AUTONOMY_CONTROL_PLANE.md
- Sequencing: after Arc 1 (base, in flight) + Arc 2 (advanced reliability). Priority: World Model + Twin → Flight Recorder → Retrieval Bench → Verification Ensemble → Earned Autonomy; then contract compiler, mutation/metamorphic/proof islands, trace-guided, shadow, chaos lab, janitor, OS self-benchmark, decision inbox.
- Doc install + compact-OS pointer: ride the P2 PR (P1 apply already in flight — do not disturb).
- Release policy invariant across ALL arcs: ≤2/week, daily never deploys, owner controls production/R3.
- Note synergies already real: flight-recorder ≈ session-state JSONL (P2 builds the substrate); capability charters ≈ P2's guard-feature-context + governed paths; chaos-lab "incomplete ≠ zero" ≈ P4 collector's ok/unconfigured/error contract; world-model seed ≈ P0 registry audit + arc-2 dependency graph.

## OWNER STANDARD (2026-08-21 ~21:00 ET): EXPLICIT DATES ON EVERYTHING
"Make sure dates are labeled in everything including issues and fixes."
- Every incident record: first_seen, resolved_at (or "unresolved as of YYYY-MM-DD"), dated Timeline entries.
- Every Repair/fix reference: PR/commit AND its merge/commit DATE (from gh/git, never guessed).
- Every verification claim: dated. Every INDEX/ledger row: dated. Unknown → "date unknown", never omitted.
- APPLY-STEP GATE: the docs apply PR and incidents apply PR must AUDIT staged files for date coverage and backfill any missing dates before landing. Reject undated entries.
- P2: Stop-gate/ledger formats require a YYYY-MM-DD on each ledger entry. Compact OS gets a one-line note under "After meaningful behavioral mutation".
- Broadcast sent 2026-08-21 to: w-incidents, w-incidents-hist, w-inc-rounds, w-inc-calendar, w-inc-coachhelm, w-inc-bridge, w-os-p2, w-os-p5.

## OWNER-ITEM (added 2026-08-21, from incident mining): class-semester cleanup step 4
6 known-bogus golf class rows + 17 orphans remain in prod awaiting an explicit owner decision on the
DELETE (calendar_events/INC-2026-08-13-02). Surface in the §45 final report's owner-decision list.

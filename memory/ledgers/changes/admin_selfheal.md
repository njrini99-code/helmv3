<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Admin Self-Heal change ledger

## 2026-09-02 — Carved out of admin_platform

- SHA: recorded on merge of `agent/bridge-worldmodel`.
- New registry entry `admin_selfheal`, split out of the single `admin_platform`
  entry (ADR-2026-09-03-control-plane-owner-decisions, memory/decisions/ — on the parallel Bridge control-plane session's branch, not yet on this branch,
  closing `ADMIN_PLATFORM_REGISTRY_GRANULARITY`). Owns the Diagnose/Repair/
  Close stages of the self-healing loop: `selfheal-*.ts`, `rca*.ts`,
  `triage-*.ts`, `auto-resolve.ts`, the `selfheal-triage` and `log-retention`
  crons, `/admin/self-heal`, the Repair launchd runner and config, and
  `docs/ai-system/selfheal/**`.
- No code changed in this commit — this ledger records the registry/doc split
  itself, which the ADR frames as "a real behavior change to the knowledge
  system": every session's `knowledge:map` routing for these paths now
  resolves here instead of to the undifferentiated `admin_platform` node, and
  Phase E's world-model blast-radius graph (same change) needs that
  granularity to attribute edges meaningfully.
- Current-state doc: `memory/features/admin-selfheal.md`, split from
  `memory/features/admin-platform.md`. See that file's own ledger entry
  (`memory/ledgers/changes/admin_platform.md`, same date) for the full split
  rationale, shared across all three carved entries.
- Full test history for this code predates the split and lives in
  `memory/ledgers/changes/admin_platform.md` / `memory/ledgers/tests/
  admin_platform.md`'s earlier entries; this ledger starts fresh at the split.

## 2026-09-03 — Phase J remainder: verification ensemble, causal engine, incident similarity, earned autonomy

- SHA: recorded on merge of `agent/controlplane-fj`.
- Agent Flight Recorder and Decision Inbox are OUT OF SCOPE for this
  change — both already shipped on the parallel `agent/bridge-premium-p5`
  branch (PR #1790) per this task's own routing; this entry covers only the
  four deliverables the plan calls the "J remainder".
- `src/lib/admin/ensemble/verification-ensemble.ts`: REPRODUCER (the
  caller's existing `RcaSourceContext`) → HEALER (the caller's existing
  `RcaAnalysis`, i.e. `runRcaAnalysis` — never called a second time here) →
  {ADVERSARY, conditional SECURITY, PRODUCT} → JUDGE, as `generateObject`
  role calls over the SAME Anthropic path `rca.ts` already uses (no second
  provider, no new account — ADR `VERIFICATION_ENSEMBLE_MODEL_COST` = "No
  cost"). Default OFF via a new `verification_ensemble` flag
  (`config/feature-flags.yml`, `type: operations_kill_switch`, `default:
  false` in every environment) — `runVerificationEnsemble` checks
  `isFlagEnabled` FIRST and returns `status: 'disabled'` before resolving a
  model provider or calling `generateObject` at all when off. The
  §J.5 golden case (a `suggestedFix` that does not match
  `RCA_CANONICAL_PREFIX`) is caught by a CODE-ENFORCED structural check
  (`checkSuggestedFixContract`, built on the existing `deriveRcaCategory`)
  that overrides even a JUDGE model call returning ACCEPT — not merely a
  prompt instruction the model could ignore.
- `src/lib/admin/causal/causal-score.ts`: evidence-weighted causal
  confidence, four independent components (temporal — wraps
  `release-context.ts`'s existing `classifyReleaseRelationship` rather than
  re-deriving release-timing logic; stack overlap; changed-feature overlap;
  historical-mechanism match), averaged over the TOTAL component count (not
  just the evidenced ones) so missing evidence can never inflate confidence,
  capped at 0.95, `'unknown'` (never a fabricated low number) when no
  component has any evidence at all.
- `src/lib/admin/causal/incident-similarity.ts`: `findSimilarIncidents`
  reuses `src/lib/admin/incidents/aliases.ts`'s `classifyMergeConfidence`
  pairwise against a corpus, ranked highest-tier first. Deliberately does
  NOT mine `memory/incidents/**/INC-*.md` — that corpus (11 files, inspected
  directly) is hand-written prose with no parseable trace id / fingerprint /
  RPC / error-code fields, and forcing it into `MergeCandidateFacts` would
  either fabricate fields or trivially classify everything `'none'`. The
  intended corpus is `correlate.ts`'s own runtime `UnifiedIncident` output,
  which already carries real structural fields.
- `src/lib/admin/autonomy/policy.ts`: `computeFeatureAutonomy` extends
  `selfheal-capability.ts`'s existing `CapabilityState` (imported, not
  duplicated) with `feature_id × repair_class` granularity. A hardcoded TS
  constant `AUTONOMY_CEILING` (never a config file, never computed) is the
  only way this module's output can ever be raised — every result is
  `min(evidenceTier, ceiling)`. A recorded recurrence or verification
  failure force-demotes to the floor (`observe_only`) unconditionally, and
  unread evidence never earns above the floor either.
- Verified: `npx tsc --noEmit` and `npx eslint` clean on every new/changed
  file; `npx vitest run src/lib/admin/ensemble src/lib/admin/causal
  src/lib/admin/autonomy` — 44/44 passing, including the inertness-when-
  disabled assertion (zero `generateObject` calls) and the golden
  structural-override case.

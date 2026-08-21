# Feature: Feature Awareness System

```
feature_id: feature_awareness_system
status: active
criticality: high
last_verified_sha: c567bcd44f8b8e8529640eb2717817174699120f
last_verified_at: 2026-08-21
history_backfill: not_started
```

> **New canonical doc.** No `memory/features/feature-awareness-system.md`
> existed before this pass. `memory/registry.yml`'s own `feature` doc
> pointer for this entry is `docs/ai-system/helmv3-ai-codebase-intelligence.md`
> — a 91-line mechanics doc, not a memory/features-shaped current-state doc,
> and it says of itself: "Superseded routing, kept for mechanics. ... The
> governing document for the feature-awareness + engineering-OS system is
> now `docs/ai-system/GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md`, with the
> compact runtime contract at `memory/system/golfhelm-engineering-os.md`."
> This doc treats that compact contract as the primary current-behavior
> source and the mechanics doc as secondary.

## Purpose

The meta-system that makes every Claude/Codex session in this repo
automatically feature-aware: map a changed or touched file to a canonical
`feature_id` via `memory/registry.yml`, load the matching `memory/
features/<feature-id>.md` before meaningful mutation, and — as of today's
`HEAD` commit — is being extended into a fuller "GolfHelm Engineering OS"
covering daily reliability monitoring and a controlled, owner-approved
production release train.

## User Contract

There is no end user; the "user" is the agent session and the repo owner
reviewing its output. The contract is: a session working on a governed path
should be pointed at the right feature doc without the owner having to
explain the codebase from scratch every time.

## Current Behavior

**Live today** (independently confirmed this pass):

- `npm run knowledge:map` (`scripts/knowledge/map-changed-files.mjs`),
  `knowledge:context` (`generate-context-pack.mjs`), `knowledge:check`
  (`check.mjs`), `knowledge:report` (`workflow-report.mjs`). `scripts/
  knowledge/` also holds `check-doc-coverage.mjs`, `stale-doc-check.mjs`,
  and a `lib/` directory.
- `.github/workflows/feature-awareness.yml` runs on every PR
  (opened/synchronize/reopened) plus `workflow_dispatch`, maps changed
  files through the registry, and uploads `feature-map.json`/`summary.md`/
  `context-pack.md` as artifacts. **Explicitly advisory** — its own header
  comment says to promote it to a required gate "only after normal PR
  traffic shows low noise and registry coverage is strong."
- `CLAUDE.md` and `AGENTS.md` both point at `memory/system/
  golfhelm-engineering-os.md` (the compact runtime contract), installed
  **today** as `HEAD` (`c567bcd44f`, PR #1587, "install the GolfHelm
  Engineering OS — specs, compact contract, release policy, memory tree
  (P1)"). That contract supersedes this doc's own routing table for
  day-to-day use.
- `.claude/rules/golfhelm-engineering-os.md` is a path-scoped pointer rule
  (governs `src/app/golf/**`, `src/lib/golf/**`, `src/lib/coachhelm/**`,
  `src/app/api/coachhelm/**`, `supabase/migrations/**`, `memory/
  features/**`, `memory/registry.yml`) that loads the compact contract
  automatically on those paths.
- `config/release-policy.yml` exists and is live: `routine_max_deploys_
  per_calendar_week: 2` (America/New_York, ISO week), daily-reliability
  permissions explicitly exclude `may_deploy_production`, and
  `automatic_production_deploy: false`.
- `scripts/repo-doctor/` currently defines exactly 7 check categories
  (`ai`, `ci`, `identity`, `config`, `registry`, `scratch`, `workspace`) —
  **none** of the master spec's ~12 planned OS-wiring checks
  (`ENGINEERING_OS_PRESENT`, `FEATURE_REGISTRY_CONSISTENT`, etc.) exist yet
  (confirmed by grepping for those literal check-id strings — 0 matches).

**Not live yet** (named in the compact OS contract's own "Build status"
banner, dated the same day as this doc's `last_verified_sha`, and
independently confirmed absent from `package.json`): `knowledge:registry-
check`, `reliability:collect`/`report`, `release:status`/`budget`/
`prepare`/`check`; the `guard-feature-context` PreToolUse hook; `.claude/
session-state/` recording; the rebuilt Stop gate; the `golfhelm-daily-
reliability`/`golfhelm-release-manager` skills; the 12 new `repo:doctor`
OS-wiring checks.

**In progress, uncommitted, as of this doc's verification timestamp**:
`.claude/hooks/guard-feature-context.mjs`, `init-session-state.mjs`,
`record-context-load.mjs`, `record-session-touch.mjs`, and a `hooks/lib/`
directory exist on disk as untracked files — exactly the hook wiring the
compact OS's "Session mechanics" section describes as arriving in a later
phase. A concurrent session appears to be building this right now; it was
not committed as of this pass.

## Invariants

- `memory/registry.yml` is canonical for agent routing. `src/lib/admin/
  feature-registry.ts` is a **separate runtime registry** (health tiers,
  heartbeats, action manifests) at finer granularity for some products —
  the compact OS contract itself flags that for 4 shared-spelling ids
  (`qualifiers`, `stats_analytics`, `calendar_events`, `player_hub`) the two
  registries' file/action ownership **already disagrees**, verified the
  same day as this doc. Until `knowledge:registry-check` exists,
  `memory/registry.yml`'s `code.actions` lists are the ones to trust.
- A doc naming a table or path is not evidence it exists — this is the
  source-of-truth hierarchy the system itself defines: live production
  state → generated artifacts (`database.ts`, AUTOGEN blocks, `surface-
  registry.ts`) → current code → canonical feature memory
  (`memory/features/*`) → semantic history (`memory/ledgers/*`,
  `memory/incidents/*`, `memory/decisions/*`) → everything else in
  `memory/`/`docs/` (hints only).
- A governed file mapping to no feature is a system gap: map it in
  `memory/registry.yml` in the same change, or record the gap explicitly —
  never silently ignore it.

## Primary Journeys

1. A PR opens → `feature-awareness.yml` maps changed files → uploads a
   context-pack artifact → advisory only, does not block merge today.
2. A Claude session starts editing a file under a golf/coachhelm path →
   `.claude/rules/golfhelm-engineering-os.md` loads automatically → the
   session is told to map files via `knowledge:map` and read the mapped
   `memory/features/<id>.md` before mutating — enforced by convention
   today, not by a hook.
3. *(Planned, not live)* SessionStart initializes `.claude/session-
   state/<session_id>.jsonl`; PostToolUse records which feature contexts
   were actually loaded and which files were touched; PreToolUse denies
   governed edits without loaded context and denies production-deploy
   shapes outright; Stop verifies mapping/context/memory/verification
   evidence before the session may finish.

## Architecture/Data Flow

```txt
Changed files
  -> scripts/knowledge/map-changed-files.mjs
  -> memory/registry.yml impacted features
  -> scripts/knowledge/generate-context-pack.mjs -> /tmp/helmv3-context-pack.md
  -> Codex/Claude product-aware review
  -> CI validation (typecheck, lint, tests, build, RLS)
  -> docs or follow-up if knowledge is stale
```

## Permissions/Tenancy

Not user-data-scoped — this is repo tooling. The planned hooks apply an
access-control-like concept to *agent sessions* rather than end users:
governed source paths become write-gated on whether the session has
recorded loading the matching feature context.

## Dependencies

github_actions (`feature-awareness.yml`), the `knowledge:*` npm scripts,
`memory/registry.yml`, `memory/features/*`, `docs/ai-system/
GOLFHELM_SELF_HEALING_ENGINEERING_SYSTEM.md` and `GOLFHELM_ADVANCED_
RELIABILITY_EXTENSION.md` (long-form specs), `config/release-policy.yml`.

## Failure Modes

- Advisory-only CI means a session can ignore the feature-map artifact
  entirely today — nothing currently blocks an edit made without reading
  the mapped feature doc; the enforcement hook is unbuilt.
- The long-form "Advanced Reliability Layer" section of the compact OS
  contract names artifacts that explicitly do not exist yet (e.g.
  `memory/graph/feature-dependencies.yml`) — the contract is self-aware
  about this and marks the whole section "planned, not present," but an
  agent skimming only the section header rather than its status banner
  could act on a false premise.
- `memory/registry.yml` vs. `src/lib/admin/feature-registry.ts` divergence
  (see Invariants) risks two different systems disagreeing about what a
  shared feature id even means.

## Observability Contract

This feature is itself the routing/observability substrate for every other
feature doc; it has no production telemetry of its own beyond the
(advisory) CI artifact upload. No Sentry/Bridge signal in tonight's
`/tmp/claude/night/ledger.md` triage maps to `feature_awareness_system`
specifically.

## Test Contract

- `npm run knowledge:check` (`scripts/knowledge/check.mjs`) and
  `node --check scripts/knowledge/workflow-report.mjs`, per this feature's
  own `memory/registry.yml` entry.
- No dedicated `*.test.ts` files for `scripts/knowledge/**` were found in a
  targeted search this pass — not exhaustively confirmed absent; flagged
  unverified rather than asserted.

## Known Debt/Unknowns

- The single biggest open question for this feature: how much of the
  700-line master spec is wired versus aspirational. The compact contract's
  own "Build status" banner is the authoritative answer as of this doc's
  `last_verified_sha` — if this doc and that banner ever disagree, trust
  the banner (it is closer to the source of truth per the system's own
  hierarchy).
- Four untracked hook files (see Current Behavior) exist mid-build as of
  this pass. Re-run `git status` and check `.claude/settings.json`'s hook
  wiring before trusting the "not built yet" claims above without
  re-verification — `.claude/settings.json` itself was not read this pass.
- `memory/registry.yml` vs. `feature-registry.ts` drift (4 shared-spelling
  ids, confirmed same-day) has no owner or tracking ticket that this pass
  could find.
- `docs/ai-system/helmv3-ai-codebase-intelligence.md` (the registry's own
  `feature` doc pointer) is a mechanics doc, not a current-state doc in
  this format — it is retained as a secondary source, but a future pass
  should decide whether to fold its remaining unique content (tool-role
  table, PR workflow artifact list) into this doc and mark it superseded
  outright, the way `memory/context/golfhelm-features.md` is being
  superseded by per-feature docs under `memory/features/`.

## Incident History

No `memory/incidents/feature_awareness_system/` directory exists yet, and
no item in tonight's ledger maps to this feature specifically. The
OS-install commit itself (`c567bcd44f`, PR #1587) is the most recent
structural change; its own commit message documents several explicit
decisions worth preserving even absent a formal ADR — notably a
COMMANDER OVERRIDE decision to fix two real markdown-lint violations rather
than raise the ratchet baseline, and a documented resolution of the
`docs:path-drift` checker's two legitimate bypass mechanisms (an
`existsSync`-resolved path, and a same-line "does not exist" disclaimer)
used deliberately rather than to hide real drift.

## ADR Links

None yet — the OS-install commit message (`c567bcd44f`) is a strong
candidate to formalize as `memory/decisions/ADR-0001-golfhelm-engineering-
os.md` or similar, since it already reads as a decision record in
everything but location and format.

## Verification Evidence

- Read in full: `docs/ai-system/helmv3-ai-codebase-intelligence.md` (91
  lines), `memory/system/golfhelm-engineering-os.md` (214 lines),
  `config/release-policy.yml` (in full), `.github/workflows/
  feature-awareness.yml` (in full), and `git show --stat HEAD` (the full
  `c567bcd44f` commit message).
- Confirmed file/directory existence: `scripts/knowledge/{map-changed-
  files,generate-context-pack,check,workflow-report,check-doc-coverage,
  stale-doc-check}.mjs` + `lib/`, `.devin/wiki.json`, `.github/workflows/
  feature-awareness.yml`, `memory/system/golfhelm-engineering-os.md`,
  `src/lib/admin/feature-registry.ts`.
- Confirmed `package.json`'s script list (lines 29–36, 72–75): `knowledge:
  map/context/check/report`, `docs:*`, `repo:doctor`, `preflight` are
  present; `knowledge:registry-check`, `reliability:*`, `release:*` are
  **not** present.
- Confirmed `scripts/repo-doctor/checks/*.mjs` defines exactly 7 check ids
  (`ai`, `ci`, `identity`, `config`, `registry`, `scratch`, `workspace`);
  grepped for the OS-wiring check-id strings named in the master spec — 0
  matches.
- Confirmed via `git status --short` that `.claude/hooks/{guard-
  feature-context,init-session-state,record-context-load,record-session-
  touch}.mjs` and `hooks/lib/` are untracked as of verification time.
- Grepped `src/lib/admin/feature-registry.ts` for its `FeatureApp` type and
  `baseball_*` sub-ids to confirm the registry-divergence claim
  structurally (not a full value-by-value diff against `memory/
  registry.yml`).
- Did not read `.claude/settings.json`'s hook configuration this pass —
  flagged as unverified above rather than asserted either way.

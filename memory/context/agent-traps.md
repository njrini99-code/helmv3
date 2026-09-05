# Agent traps — beliefs that were true once and are not now

This file exists for exactly one failure mode: a belief that was correct
when someone wrote it down, got contradicted by a later change, and is
still sitting somewhere an agent could plausibly read it and re-form the old
belief. Each entry states the old belief, the current fact, and where the
current fact is authoritatively documented. This is not a place for general
lessons — see `memory/context/engineering-methodology.md` and
`memory/context/agent-operations.md` for those. Created 2026-09-05 while
folding the machine-local auto-memory corpus into this repo's Git-backed
memory (`memory/decisions/ADR-2026-09-05-control-plane-reset.md`).

- **Old belief:** reading `.env.local` is denied by the permission layer, so
  authenticated browser verification needs owner approval before it can
  happen at all.
  **Current fact:** `.env.local` reads succeed from Bash in this
  environment — the filesystem sandbox does not block reads of it. Do not
  plan around the old denial; if a read is refused in a given session, that
  is a session-specific configuration state, not a standing rule.
  (Source of the old belief: auto-memory note
  `golfhelm-default-test-accounts.md` dated 2026-08-16, itself already
  flagged stale in that corpus's own index.)

- **Old belief:** `main`'s branch protection requires six real status
  checks (`Smoke checks`, `CI aggregate`, `Review Gate aggregate`,
  `Analyze (actions)`, `Analyze (javascript-typescript)`,
  `Analyze (python)`).
  **Current fact:** `main` requires five checks — `Smoke checks` was
  removed 2026-09-02 as a duplicate `next build` job, alongside its
  required-check context. See `.claude/rules/quality-gates.md`, "5 required
  checks on `main`," for the current, maintained list.
  (Source of the old belief: auto-memory note
  `required-check-all-is-ambiguous.md` dated 2026-08-19/20.)

- **Old belief:** CircleCI's `lighthouse-preview` job enforces accessibility
  and CLS as hard errors on every push, per `.claude/rules/integrations.md`.
  **Current fact:** as of the source note, `lighthouse-preview` was a
  ~90-second no-op — its early-exit path fires because `VERCEL_TOKEN`/
  `VERCEL_PROJECT_ID` are not set as CircleCI project environment variables,
  so it never reaches a real Lighthouse audit and provides zero real
  coverage regardless of what it reports. `.claude/rules/integrations.md`
  still describes it as enforcing hard errors and has not been reconciled
  against this finding — treat that file's claim as unverified rather than
  current until someone re-runs the check described in the source note
  (`gh api .../commits/<sha>/statuses`, looking at `ci/circleci:
  lighthouse-preview`'s timing and description) and either fixes the
  CircleCI project variables or corrects the rule.
  (Source: auto-memory note `ci-lighthouse-preview-chronic-failure.md`
  dated 2026-08-19.)

- **Old belief:** `coach_chat` can bypass the Vercel AI Gateway through a
  direct-Anthropic-provider escape hatch, so its success proves nothing
  about whether the gateway itself is healthy, and every other v3 AI task
  (`round_review`, `hero_narrative`, …) is on a structurally different,
  gateway-only path with no such escape hatch.
  **Current fact, verified 2026-09-05:** `src/app/api/coachhelm/v3/chat/
  stream/route.ts` now imports and calls `resolveModelProvider` for
  `coach_chat` (line 300, importing from `@/lib/ai/model-provider` at line
  40) — the same resolution path the other v3 tasks use. The two-path
  asymmetry the old belief describes may no longer exist; re-read
  `src/lib/ai/model-provider.ts` and `src/lib/coachhelm/v3/llm/compose.ts`
  before assuming any AI surface has a hidden fallback that makes its
  success uninformative about the others.
  (Source: auto-memory note
  `coach-chat-success-does-not-prove-gateway-health.md` dated 2026-08-13,
  already flagged stale as of 2026-08-16 in that corpus's own index — the
  linked note itself was never updated to say so.)

- **Old belief:** the CRM wiring audit from 2026-07-20 (21 confirmed gaps
  across send compliance, dead sequences, an inert inbox, and orphaned
  calendar surfaces) describes the current state of `memory/features/
  crm_outreach.md`'s codebase.
  **Current fact:** that list is a frozen point-in-time snapshot, and it
  was already known to rot fast even at the time it was written — several
  items were independently fixed within nine days of the audit (Gmail
  List-Unsubscribe/RFC 8058 headers, a `mergeCoaches` cascade gap, the
  previously-unreachable `CalendarView` surface, `updateCrmTask` gaining
  callers), and others in the original list turned out to be deliberate
  product decisions rather than defects (`process-sequences` being absent
  from `vercel.json` on purpose). Verify each item against current code
  before acting on it; do not treat the 2026-07-20 numbering or status as
  current.
  (Source: auto-memory note `crm-wiring-gaps.md` dated 2026-07-29, itself
  self-flagged as rotting fast.)

- **Old belief:** the count of local migrations with no matching
  `schema_migrations` row in production is 32 (or that a specific
  classification of those 32 from 2026-08-19 is still the state to act on),
  and that this is why the Supabase GitHub "Deploy to production" toggle
  must stay off.
  **Current fact:** the underlying migration count has moved substantially
  since that classification (measured well past 300 migration files as of
  the source audit that flagged this), so neither the raw "32 unaccounted"
  figure nor its detailed classification (26 stamp / 3 forward-fix / 1
  obsolete / 2 deliberate holds) should be reused. Re-run the drift check
  (`db:drift:check` / a fresh comparison against
  `supabase_migrations.schema_migrations`) and re-classify against the
  current catalog and `supabase/migrations/HELD.md` (present in this repo)
  before deciding whether the toggle can safely be enabled. The
  methodology — stamp a migration's filename version into
  `schema_migrations` after any Supabase MCP `apply_migration` call, since
  the MCP stamps its own execution-time version otherwise — remains valid
  and is recorded in `memory/context/engineering-methodology.md`'s
  migration-authoring section.
  (Source: auto-memory notes `migration-history-drift-and-repair.md` and
  `the-32-unaccounted-migrations-are-fully-mapped.md`, both dated
  2026-08-19/20.)

- **Old belief:** Supabase security advisor 0029
  (`authenticated_security_definer_function_executable`) flags a specific
  count of functions (variously recorded as 111, 117, 128, or 136 across
  different sweeps) and a fixed five-function carve-out is the complete list
  of exceptions worth re-checking.
  **Current fact:** the count moves with every schema change (new
  migrations regularly add or remove `SECURITY DEFINER` functions with
  `authenticated` execute grants) and should never be cited as a specific
  number without re-running `get_advisors` first. The durable part is the
  method, not the count: audit each newly-flagged function individually
  rather than accepting a class-level "by design" verdict, since exactly
  this shortcut previously let a genuine cross-tenant leak
  (`get_baseball_conversations_with_details`, since fixed) sit
  pattern-matched-but-unread for weeks.
  (Source: auto-memory note
  `supabase-advisor-0029-definer-fn-executable.md` dated 2026-08-19.)

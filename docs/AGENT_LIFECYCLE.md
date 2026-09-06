# The agent lifecycle in this repo, and what auditing it found

Written 2026-08-27 by tracing the live system — reading
`.claude/settings.json`'s hook wiring, the guards' actual block lists,
`ci.yml`'s aggregate `needs`, `vitest.config.ts`'s projects, and the git
object model as configured here.

Where this contradicts another doc, this one was checked and that one
probably was not. Check both; fix whichever is wrong.

Anchor SHA `3d7d1b1ef`. Staleness check:

```bash
git rev-list --count 3d7d1b1ef..HEAD -- \
  '.claude/**' '.github/workflows/**' 'vitest.config.ts' 'package.json'
```

**Unverified as of `1e5d10a34` (2026-09-06 docs consolidation pass):** the
staleness check above returns 61, not 0 — 61 commits have touched the paths
this document traces since its anchor. Re-run the trace before trusting any
specific claim below; nothing in this pass re-verified the content itself.

Parts 1 to 12 are how the machine works. Parts 13 to 18 are what auditing
it turned up, including four things this document's author got wrong.

---

## Part 1 — Every place bytes get written

An agent writes to six places. Only one of them is your repo.

**1. Session scratchpad**
`/private/tmp/claude-501/<project>/<session-id>/scratchpad/`

Scratch scripts, captured gate output, backups taken before risky edits.
Outside the repo, invisible to git. **Not a backup** — `/private/tmp` lost
two worktrees on this machine overnight.

**2. Session state** — `.claude/session-state/<session-id>.jsonl`

Append-only JSONL of what this session loaded and touched. Gitignored.
Written by `init-session-state.mjs`, `record-context-load.mjs` and
`record-session-touch.mjs`; read by `guard-feature-context.mjs` and
`stop-verify.sh`. This is why enforcement is **event-time** — git is never
asked to guess whose change is whose.

**3. Transcripts** — `~/.claude/projects/<project-slug>/*.jsonl`

Full conversation history. 1,052 files for this repo. Deleted after
`cleanupPeriodDays` (45 here).

**4. Auto memory** — `~/.claude/projects/<project-slug>/memory/`

`MEMORY.md` index plus topic files. Machine-local, keyed on the **git
repo**, so all worktrees share one directory. Exempt from the retention
sweep. Never in the repo, never in a clone. First 200 lines of
`MEMORY.md` load every session.

**5. The working tree** of whichever worktree the agent occupies.

**6. `.git/objects`** — committed content, forever, shared by every
worktree. The only one that is actually the repo.

### Directories that matter in the repo itself

| Path | What it is |
| --- | --- |
| `.claude/hooks/` | 10 hooks + 4 shared libs — the enforcement layer |
| `.claude/rules/` | 15 path-scoped or always-on instruction files |
| `.claude/agents/` | 6 custom subagent definitions |
| `.claude/skills/` | on-demand skill packs |
| `.claude/session-state/` | per-session JSONL, gitignored |
| `memory/registry.yml` | the semantic router — **executable** |
| `memory/features/` | canonical feature docs — **executable** |
| `memory/ledgers/` | dated change history the Stop gate checks |
| `memory/system/` | the engineering OS contract |
| `.github/workflows/` | 13 workflows, 43 jobs |
| `supabase/tests/rls/` | pgTAP suites — the real RLS coverage |
| `scripts/` | gates, ratchets, generators |

---

## Part 2 — The stack, and where everything comes from

### Runtime, pinned three ways

| Pin | Value |
| --- | --- |
| `.node-version` | 22 |
| `.nvmrc` | 22 |
| `package.json` engines | `>=22.0.0` |
| actually running | v22.23.2 |
| npm | 10.9.8 |
| Deno | 2.9.5 — Supabase edge functions only |

`package.json` sets `"type": "module"`, so every `.js` in this repo is ESM.
A CommonJS file needs the `.cjs` extension. There is **no**
`packageManager` field, so nothing pins npm itself — CI uses whatever the
runner ships.

`.node-version` is in `.worktreeinclude` on purpose: without it a fresh
worktree lands on the machine default while all CI workflows pin 22.

### Core stack

| Package | Version |
| --- | --- |
| next | ^16.2.12 |
| react / react-dom | ^19.2.8 |
| typescript | ^5.9.3 |
| tailwindcss | ^3.4.19 |
| @supabase/supabase-js | 2.112.3 (exact) |
| @supabase/ssr | ^0.12.3 |
| vitest | ^4.1.11 |
| eslint | ^9.39.5 (flat config, 187 lines) |
| @playwright/test | ^1.62.1 |
| @capacitor/core | ^8.4.2 |
| inngest | ^4.13.0 |
| @sentry/nextjs | ^10.68.0 |
| stripe | ^22.3.2 |
| zod | ^4.2.1 |

84 dependencies, 35 devDependencies.

`@supabase/supabase-js` is pinned **exactly**, not caret-ranged. Everything
else floats within a major.

### TypeScript is strict, and then some

`strict: true` plus **`noUncheckedIndexedAccess: true`**. That second one
is why `arr[0]` types as `T | undefined` and why the repo convention is
guard-then-assert with `!` and a one-line comment naming the invariant —
never a silent `?? fallback`. Target `es2018`, module `esnext`.

`tsconfig.json` deliberately does **not** include `.next/types/**`. Those
globs match zero files in CI but break `npm run typecheck` locally
(measured: exit 2 with, exit 0 without). `npm run build` re-injects them,
so `scripts/strip-next-tsconfig-injection.mjs` runs as `postbuild` and
removes them again — but only after proving the diff is exactly the known
build artifact, so a deliberate tsconfig edit survives.

### Where data and services come from

- **Supabase** — one project, ref `qmnssrrolpinvwjjnufo`, committed in
  `supabase/.temp/project-ref`. **Production is a single shared database**
  serving golf, baseball and lifting. There is no staging copy.
- **MCP** — `.mcp.json` declares exactly one server: `supabase`. It must
  stay project-scoped and read-only; `apply_migration` and `execute_sql`
  hit production directly with `service_role`, which is why a guard
  matches those tool names.
- **Env** — five files: `.env`, `.env.local`, `.env.example` (412 lines,
  the documentation of what exists), and two `.local` overlays.
  `.worktreeinclude` deliberately **excludes** all of them, so a live
  production secret is not copied into every parallel worktree.
- **Sentry, Vercel, Stripe, Inngest** — all via env, none checked in.

### Claude Code plugins

Five enabled at project scope: `claude-security`, `security-guidance`,
`sentry`, `superpowers`, `vercel`. Fifteen more at user scope. Plugins
installed at project scope also load in worktrees of the same repo.

### Build and deploy

`vercel.json`:

| Key | Value |
| --- | --- |
| `buildCommand` | `npm run build` |
| `installCommand` | `npm ci` |
| `ignoreCommand` | `bash scripts/vercel-ignore-build.sh` |
| `framework` | nextjs |
| `regions` | `iad1` |
| `git.deploymentEnabled` | `{"*": false}` |

**Production cron jobs are declared in `vercel.json`**, not in code — e.g.
`/api/cron/coachhelm-validation` hourly at :15. They run against
production on Vercel's schedule, independent of anything in CI.

`next.config.mjs` sets `reactStrictMode`, a turbopack block, and a
**Content-Security-Policy**. Its `connect-src` allows only
`https://*.supabase.co`, which is why a plain local
`http://127.0.0.1:54321` stack cannot be reached from the browser and the
Cursor Cloud setup fronts it with a TLS proxy.

### npm lifecycle hooks — callers no grep will find

npm fires these **by naming convention**. Nothing references them:

- `prebuild` -> `check-required-env.mjs && stamp-sw.mjs`
- `postbuild` -> `strip-next-tsconfig-injection.mjs`

Because `vercel.json`'s `buildCommand` is `npm run build`, `prebuild` runs
on every Vercel production build — which is the only place
`check-required-env` does anything, since it early-returns unless
`VERCEL_ENV` is set. Searching for a script's *name* will not find these
callers. See Part 14.2.

### iOS / Capacitor

`appId: com.helmsportslabs.golfhelm`, `appName: Helm Sports Labs`,
`webDir: public`. The iOS compile runs on CircleCI's M-series runners, not
GitHub Actions.

### `tools/` — 71M on disk, 4.1M tracked

A Python-based agent toolkit (`overnight.py`, `deep_prompts.py`,
`core/`, `baseballhelm-command-center/`) plus an untracked
`HELM_INTELLIGENCE .zip`. Note the space in that filename. Most of the 71M
is untracked; it is not repo weight.

---

## Part 3 — Session start

Context is assembled in a fixed order and injected as a **user message**,
not the system prompt. It is guidance the model reads, not a rule the
runtime enforces. Enforcement is Part 4.

1. `~/.claude/CLAUDE.md` — absent on this machine.
2. `./CLAUDE.md`, with `@AGENTS.md` and
   `@memory/system/golfhelm-engineering-os.md` **expanded inline**.
3. `.claude/rules/*.md` — every file **without** `paths:` frontmatter.
   Files with `paths:` load later, when a matching file is read.
4. `SessionStart` hooks fire: `session-context.sh` prints the banner and
   repo state; `init-session-state.mjs` creates the session `.jsonl`.

### The import trap

`@AGENTS.md` does **not** save context. Imports expand at launch, so the
cost is the sum of every file. This repo loaded **1,108 lines** before an
agent did anything, while `CLAUDE.md` itself was 353. Official guidance
targets under 200 lines per file.

### When a rule may be path-scoped

> Could this rule prevent a mistake made on a turn that opens no files?

If yes it must stay always-on, whatever its length.

- `autonomy.md` **passes** — ask-vs-act is decided before the first file.
- "Never grant `anon` EXECUTE" **fails** — needs a `.sql` in play.
- The Supabase MCP warning **passes** — `execute_sql` opens no file, so
  path-scoping it would load the warning after the damage.

---

## Part 4 — The hooks, all eleven

| Event | Matcher | Hook |
| --- | --- | --- |
| SessionStart | all | `session-context.sh` |
| SessionStart | all | `init-session-state.mjs` |
| PreToolUse | `Bash` | `guard-bash.sh` |
| PreToolUse | `Write\|Edit\|MultiEdit` | `guard-sql.sh` |
| PreToolUse | `Write\|Edit\|MultiEdit` | `guard-feature-context.mjs` |
| PreToolUse | `Write\|Edit\|MultiEdit` | `guard-concurrent-edit.mjs` |
| PreToolUse | `mcp__.*(apply_migration\|execute_sql)` | `guard-sql.sh` |
| PostToolUse | `Read\|Bash` | `record-context-load.mjs` |
| PostToolUse | `Write\|Edit\|MultiEdit` | `record-session-touch.mjs` |
| PostToolUse | `Write\|Edit\|MultiEdit` | `post-edit.sh` |
| Stop | all | `stop-verify.sh` |

Sizes: `guard-bash.sh` 341, `stop-verify.sh` 250, `guard-concurrent-edit`
151, `record-context-load` 121, `guard-sql.sh` 101, `guard-feature-context`
92, `record-session-touch` 66, `init-session-state` 57, `session-context`
50, `post-edit` 44. Shared libs: `stop-check.mjs` 176, `feature-map.mjs`
144, `session-state.mjs` 130, `record-event.mjs` 96.

**One file edit fires three PreToolUse hooks in sequence. Any one exits 2
and the write never happens.**

### The six custom subagents

`.claude/agents/` defines six, each with its own tool allowlist and model:

| Agent | Tools | Model |
| --- | --- | --- |
| `code-reviewer` | Read, Grep, Glob, Bash | sonnet |
| `db-migration-reviewer` | Read, Grep, Glob, Bash | **opus** |
| `security-reviewer` | Read, Grep, Glob, Bash | sonnet |
| `ui-polish-reviewer` | Read, Grep, Glob, Bash | sonnet |
| `debugger` | inherit | sonnet |
| `verifier` | inherit | sonnet |

The four reviewers are **read-only by construction** — no Write, no Edit.
`db-migration-reviewer` is the only one on opus, and the engineering OS
makes its review **mandatory** for any schema change.

`debugger` and `verifier` inherit the full tool set, so they can run
things. `verifier` exists to check a completion claim by running commands
and reading the diff rather than trusting a summary.

### Why the hooks are the entire safety story

`~/.claude/settings.json` sets `permissions.defaultMode:
bypassPermissions`. The approval prompt is **off**. The 43 user and 64
project allow-rules grant nothing extra, because everything is already
permitted.

Hooks are **not** suspended by allow rules or by bypass mode. They are the
only enforcement left — fast by default, with a small set of deterministic
blocks that cannot be argued with.

### `guard-bash.sh` — 17 blocked shapes

Force push, any spelling including combined shorts like `-vf`. `git
stash`, because `refs/stash` is repo-global across every worktree. `git
clean -f`. Recursive `rm` outside the project, or with `..` or a `cd` in
the same command. `rm -rf .next`. Piped gate commands. `supabase config
push`, `db reset`, `db push`. Destructive SQL through `psql`. `git
worktree add` resolving inside the repo. `vercel --prod`, `promote`,
`rollback`, `alias set`.

The piped-gate block is the subtle one. `npm test | tail` exits with
**tail's** status, so a failing suite reads as success.

### `guard-sql.sh` — both routes

Runs on file edits **and** on MCP payloads. Blocks `DROP TABLE`,
`TRUNCATE`, unscoped `DELETE`, `GRANT` to `anon` or `PUBLIC`. Its
normalizer is quote-aware on purpose: a naive comment-stripper turns
`SELECT '--' as marker; DELETE FROM golf_players;` into `SELECT '`, and
the unscoped DELETE disappears before the check runs.

### `guard-feature-context.mjs` — the one that looks like a bug

Governed paths: `src/app/golf/`, `src/lib/golf/`, `src/components/golf/`,
`src/app/api/golf/`, the three baseball equivalents,
`supabase/migrations/`, any `.sql`, `src/lib/supabase/`, `scripts/db/`.
`memory/**` is excluded.

Editing a governed file is **blocked** until this session has loaded the
mapped feature doc — reading it, or running `npm run knowledge:context`.
Writing a flag does not count; the hook reads this session's `.jsonl`.

A governed file mapping to **no** feature also blocks, with an escape
hatch: `npm run knowledge:map -- --files <path>` records the gap.

This is why `memory/registry.yml` and `memory/features/**` are
**executable, not prose**. Delete them and every golf, baseball and
migration edit fails closed — looking like a permissions bug rather than a
deletion.

### `stop-verify.sh` — the turn itself can be rejected

Before a turn ends: were governed files touched, was context loaded, was
memory evidence written? A behavioural change needs a **dated** entry in
`memory/ledgers/changes/<feature-id>.md`. A non-behavioural one needs a
structured reason via `record-event.mjs no-memory-change`; "not needed" is
rejected.

---

## Part 5 — Git, mechanically

### A branch is a 41-byte file

`.git/refs/heads/main` holds one commit SHA. That is the whole branch.
Creating one writes a file. Deleting one deletes a pointer — **the commits
are untouched**, just unreferenced, until `git gc`.

### A commit is a snapshot, not a diff

Each commit points to a **tree**, a complete listing of every tracked file
at that instant, plus its parents. Git *computes* diffs between trees; it
never stores them. This is why two `refs/codex/turn-diffs/…` refs here
point at **trees with 88 entries and no commit**.

### Four places a file exists

```text
working tree  ->  index  ->  object store  ->  refs
  on disk       .git/index   .git/objects     .git/refs
```

`git add` copies tree to index. `git commit` freezes the index into a tree
object, wraps it in a commit, moves the branch pointer.

They are independent, which is why `git status` can say modified while
`git diff` shows nothing — stat-dirty, mtime changed, bytes identical.
`git update-index --refresh` clears it. `tsconfig.json` does this after
every build.

### Worktrees: shared versus private

Shared by every worktree:

- `.git/objects` — every commit, tree and blob
- `.git/refs` — **every branch, globally**
- `refs/stash` — one global stack

Private, in `.git/worktrees/<name>/`:

- `HEAD` — which branch
- `index` — the staging area
- the files on disk

What follows:

- A commit made in `/private/tmp/helmv3-msgfix` is **instantly visible**
  from the main checkout. No push. Commits survive the directory being
  deleted, because objects live in `Downloads/helmv3/.git`.
- Branch names are global. Another session can check out yours.
- `refs/stash` is global — one stack, four worktrees. Hence the guard.
- Two worktrees cannot check out the same branch.
- `git add -A` cannot cross worktrees, but in **one shared checkout with
  two sessions** it sweeps the other's half-written files. That happened
  here on 2026-08-16.

### Squash merge — the biggest source of confusion

This repo: `squash=true`, `delete_branch_on_merge=true`.

A squash merge builds **one new commit**, new SHA, new tree, parented on
main's old tip. Your branch's commits are **never ancestors of main**:

```bash
git branch --merged main       # NEVER lists a merged branch here
git merge-base --is-ancestor   # false for work that shipped
```

Both are correct and both are useless. `codex/golf-team-operations`
reported "10 commits not in main" long after it shipped, and cleanup keyed
on `--merged` never fires. Use PR state:

```bash
gh pr list --state merged --limit 20 \
  --json headRefName,number,mergeCommit
```

---

## Part 6 — Edit to merged

1. **Edit** — three PreToolUse hooks vote; PostToolUse records the touch.
2. **Verify** — `npm run preflight`, ten gates, all also run by CI.
3. **`git add <explicit paths>`** — never `-A` in a shared checkout.
4. **`git commit`** — new tree and commit; branch pointer moves.
5. **`git show --stat`** — a commit that "succeeded" is not one that
   contains what you meant. A pathspec error aborts the whole add line and
   the commit still succeeds, holding less than intended.
6. **`git push -u origin <branch>`** — explicit upstream. Branches here
   default to tracking `origin/main`, so a **bare push targets main**.
7. **`gh pr create`**
8. **CI** — 43 jobs across 13 workflows.
9. **Squash merge** — one new commit on main; remote branch auto-deleted.
10. **`git fetch`** — local main catches up.

A push to `main` deploys nothing. `vercel.json` carries
`"git": {"deploymentEnabled": {"*": false}}`. Production is an on-demand
CLI promote a human runs. Merging is not shipping.

---

## Part 7 — CI: all 43 jobs, and which of them gate

Two aggregates gate a merge, and each gates **only through its own
`needs:` list**. A job in a workflow but not in `needs` runs, posts a
check line, and blocks nothing.

### `ci.yml` — 18 jobs, 15 gate

Gating: `detect-changes`, `database-types`, `schema-invariants`,
`feature-knowledge`, `bridge-env`, `typecheck`, `edge-functions`, `lint`,
`lint-ratchet`, `unit-tests`, `business-contracts`, `next-build`,
`supabase` (lint + RLS), `route-hygiene`, `import-cycles`.

Aggregate: `all`, named **CI aggregate**.

**Not gating, by owner decision:** `unit-tests-timezone` and
`baseball-auth-smoke`. Both run on push to `main` only, so a failure
blocks the next **promote** rather than every merge. Not drift — do not
re-add them while tidying.

### `review-gate.yml` — 12 jobs, 11 gate

`ast-grep`, `semgrep`, `gitleaks`, `actionlint`, `yamllint`,
`shellcheck`, `markdownlint`, `python` (ruff + pylint), `sqlfluff`,
`hadolint`, `env-secrets`. Aggregate `all`, named **Review Gate
aggregate**.

The blocking hard rules live in the custom packs under
`.coderabbit/ast-grep/` and `.coderabbit/semgrep/`. That directory name is
historical — the review bots were dropped 2026-07-20 and CI now consumes
the packs directly. Twenty-one rules, enumerated below because "the custom
packs" is not a thing anyone can act on.

#### ast-grep — 10 rules

Errors (block):

- `helmv3-no-service-role-key` — `SUPABASE_SERVICE_ROLE_KEY` outside an
  admin path. It bypasses RLS.
- `helmv3-no-bare-table-names` — Supabase queries must use `golf_*` /
  `baseball_*` prefixes.
- `helmv3-no-deep-types-import` — entity types come from `@/lib/types`
  only; `@/types/database` and `@/types/supabase` do not exist.
- `helmv3-no-limit-above-postgrest-cap` — `.limit()` above 1000 is
  **silently truncated** by PostgREST. You get 1000 rows and no error.
- `helmv3-no-process-env-in-edge` — edge functions run on Deno; use
  `Deno.env.get()`.
- `helmv3-no-silent-catch-fallback` — a `catch` whose entire body is a
  bare `return []` / `null` / `{}`.

Warnings (do not block): `no-console-log-in-src`, `no-explicit-any`,
`no-untracked-fixme` (tag debt with an issue link), `prefer-getByRole`.

#### semgrep — 11 rules

Errors (block):

- `helmv3-service-role-outside-admin` — the same key, caught by path.
- `helmv3-no-log-supabase-token` — access/refresh tokens give full user
  impersonation until they expire.
- `helmv3-server-action-missing-auth-check` — a server action hitting
  Supabase without `supabase.auth.getUser()` first.
- `helmv3-destructive-write-pattern` — DELETE then INSERT on one table in
  a save/sync/submit path. A transient failure between them loses data.
- `helmv3-server-supabase-in-client` — `@/lib/supabase/server` uses
  `next/headers`; importing it into a `'use client'` file breaks.
- `helmv3-security-definer-without-search-path` — definer functions must
  pin `SET search_path` or they are search-path injectable.
- `helmv3-create-table-without-rls` — a new table without
  `ENABLE ROW LEVEL SECURITY` in the same migration.
- `helmv3-hardcoded-supabase-credentials-py` — the Python helpers under
  `tools/` count too.

Warnings: `no-pii-in-spans` (no raw email/phone/name in Datadog or OTel
attributes), `action-missing-revalidate` (a mutating action that never
calls `revalidatePath`), `capacitor-plugin-needs-usage-desc`.

#### Two mechanics that decide whether a rule ever fires

**Both packs scan CHANGED FILES ONLY**, via
`bash .github/scripts/changed-files.sh` — not the whole repo. A
pre-existing violation in a file your PR does not touch will not block
you, and will not be reported. These are not ratchets; they are
diff-scoped gates.

**The `__test__/` fixtures are excluded on purpose.**
`.coderabbit/semgrep/__test__/` holds intentionally-broken code that
exists to prove the rules fire. Without the exclusion, every PR touching
the rule packs would block on its own fixtures.

`ast-grep` is downloaded at job time from a pinned GitHub release
(0.44.0), not from `node_modules`.

#### A rule that exists for the class but not the shape

`helmv3-no-silent-catch-fallback` selects on `catch_clause`. The
messaging bug in Part 16 was not a catch clause — it was
`if (error) { logError(...) }` with **no return at all**, so execution
fell through and the UI silently rendered partial data. Same failure
class, different syntax, and the rule never saw it. That instance has
since been fixed by hand; the blind spot has not.

That is worth knowing before assuming a rule pack covers a category. It
covers the shapes someone thought to write down.

### The other eleven workflows

| Workflow | Trigger | Purpose |
| --- | --- | --- |
| `playwright.yml` | PR + push | `smoke` on PRs, full `e2e` on main |
| `pr-smoke.yml` | PR | a11y smoke, path-filtered |
| `codeql.yml` | PR + schedule | three `Analyze (…)` matrix jobs |
| `feature-awareness.yml` | PR | builds the context pack |
| `migration-lockdown.yml` | PR | blocks edits to historical migrations |
| `docs-regen.yml` | push | opens an auto-PR when inventory drifts |
| `types-regen.yml` | schedule | regenerates `database.ts` |
| `db-drift.yml` | schedule | production schema invariants |
| `baseball-readiness-matrix.yml` | PR + push | advisory only |
| `visual-audit.yml` | manual | screenshot sweep |
| `claude-code.yml` | issue comment | guarded PR agent |

### The skipped-need trap

The aggregate fails on failure, cancelled, **or skipped** when
`detect-changes.outputs.code == 'true'`. So a job added to `needs` must
actually run on every code PR. Give it a narrow path filter and a code PR
missing that path fails for no reason — the fastest way to get a gate
deleted. The house pattern is
`if: needs.detect-changes.outputs.code == 'true'`, which skips only on
docs-only PRs, where the aggregate tolerates it.

### Required checks are matched by NAME

Six required contexts on `main`: `Smoke checks`, `CI aggregate`,
`Review Gate aggregate`, `Analyze (actions)`,
`Analyze (javascript-typescript)`, `Analyze (python)`.

Both aggregate job **ids** are `all`; only the `name:` field becomes the
check-run string. A required list naming `Review Gate / all` waits forever
on a check nothing posts, **with no error anywhere**. Two of three
required contexts were phantoms until 2026-08-19. The three `Analyze (…)`
names are rendered from the CodeQL matrix, so editing the matrix silently
renames a required check.

Canonical account: `.github/branch-protection.md`. Do not restate it.

---

## Part 8 — Tests: three systems, not one

### vitest — five projects

| Project | Include |
| --- | --- |
| `unit` | `src/**/*.test.ts` + 32 named `scripts/**` files |
| `unit-dom` | `src/**/*.test.tsx`, `src/**/*.spec.tsx` |
| `integration` | `src/**/*.integration.test.{ts,tsx}` |
| `rls` | `src/**/*.rls.test.{ts,tsx}` — matches **zero** files |
| `business` | `*.contract.test.*`, `*-contract.test.*` |

- `npm test` runs **unit + unit-dom only** — the fast loop, not coverage.
  `npm run test:all` runs every project.
- `scripts/__tests__/` has **no glob**. A new file there runs only if you
  add it by name to `vitest.config.ts`.

### pgTAP — the real RLS coverage

The vitest `rls` project selecting zero files is true and says **nothing**
about `npm run test:rls`, which is `bash scripts/test-pgtap.sh` and runs
the real suites under `supabase/tests/rls/` against a local Postgres.
Docker down means a connection refusal, **not** that RLS is untested. CI
runs the same suites in the `supabase` job, which gates.

Counts are deliberately absent here. Derive:
`ls supabase/tests/rls/*.sql | wc -l`.

### Playwright

`smoke` on PRs; the full `e2e` job on push to `main` or manual dispatch
only. `npm run test:e2e` is not what CI runs on a PR.

---

## Part 9 — Ratchets

Nine baselines, each locking a per-rule count that may only go **down**.
`--update` is legitimate only after the net decreases.

**Per-rule, not net.** A change can drop the total by 1,457 and still fail
because one rule went 26 to 27. That is correct — net hides regressions.

### The reproducibility rule

> A gate must read `git ls-files`, never the filesystem.

A `readdirSync` walk is not gitignore-aware, so it counts whatever is on
the machine. See 11.2 for the incident. All four filesystem-walking gates
now filter through `scripts/lib/tracked-files.mjs`. Prove a scope filter
**both ways**: an untracked probe must not move the count, and the same
file staged must.

### Two things that are not gates

- `check:ledger` needs `psql` output on stdin; `knowledge:report` needs
  `changed-files.txt`. Both are pipeline components that `package.json`
  advertises as gates.
- `preflight` is a **subset** of CI. All ten of its gates also run in CI,
  but CI additionally runs build, tests, RLS and the Review Gate
  analysers.

### The documentation tax

The markdown ratchet grandfathers roughly 30,000 existing violations while
holding new files to zero. Adding any substantial doc to `docs/` means
writing it violation-free: 80 columns hard, padded table separators, blank
lines around every list and heading.

---

## Part 10 — Worktrees in practice

Claude Code has **built-in** worktree support. `claude --worktree <name>`
creates one under `.claude/worktrees/<name>/`, branched from the default
branch, and **enforces isolation**: it blocks edits targeting the main
checkout, blocks commands whose cwd resolves there, and blocks git
redirects back into it. `.claude/worktrees/` is already gitignored, and
`.worktreeinclude` copies gitignored files such as `.node-version` into
each new one — deliberately **excluding** `.env*`, so production secrets
are not multiplied across parallel worktrees.

But `guard-bash.sh` blocks any `git worktree add` resolving inside the
repo. The manual path is blocked while the built-in path is not. Both
rules exist for the same 2026-08-18 incident and neither knows about the
other. Resolve that before relying on either.

Manual, outside the repo:

```bash
git worktree add ~/worktrees/helmv3-task -b my-branch
lsof +D ~/worktrees/helmv3-task | awk '$4=="cwd"'
git worktree remove ~/worktrees/helmv3-task
```

---

## Part 11 — Supabase and Vercel: the tool rules

These two get their own part because they are the only tools here that can
touch production directly, and both are defended in **three** independent
layers. Understanding which layer stops you matters, because they fail
differently.

### The three layers

1. **`permissions.deny` in `.claude/settings.json`** — matches a literal
   command **prefix**. Cheap, but prefix-matching is easy to dodge:
   `vercel --cwd . deploy --prod` is a different prefix from
   `vercel deploy --prod`.
2. **`guard-bash.sh` / `guard-sql.sh`** — regex over the whole command, or
   over the MCP payload. Catches reordered flags and alternate spellings.
   **Not suspended by allow rules or by `bypassPermissions`.**
3. **The Review Gate** — `ast-grep` and `semgrep` packs that block at
   merge, after the fact.

`settings.json` is version-controlled and therefore **branch-scoped**: a
`git checkout` of an older branch silently removes those deny rules. The
hooks do not move with the branch, which is why the important blocks are
duplicated into `guard-bash.sh` rather than trusted to permissions alone.

### Supabase — production is not a place you experiment

**One project, ref `qmnssrrolpinvwjjnufo`, and it is a single SHARED
database serving golf, baseball and lifting. There is no staging copy.**

`guard-sql.sh` runs on **both** routes — file edits *and* MCP payloads —
and blocks four shapes:

- **`GRANT` to `anon` / `PUBLIC`** — `anon` is the UNAUTHENTICATED role.
  Anyone holding the publishable key gets it. This exact shape has reached
  this production database before.
- **`SECURITY DEFINER` with no matching `REVOKE`** — a definer function
  runs with its owner's rights.
- **`DROP TABLE` / `TRUNCATE`** — additive migrations only.
- **`DELETE FROM` with no `WHERE`.**

Its normalizer is **quote-aware on purpose**. A naive comment-stripper
turns `SELECT '--' as marker; DELETE FROM golf_players;` into `SELECT '`,
and the unscoped DELETE vanishes before the check runs — turning a block
into an allow.

Denied at the permission layer as well: `supabase config push`,
`db reset`, `db push`, `migration up`, each in four spellings (bare,
`./node_modules/.bin/`, `npx`, and prefixed).

Why each matters:

- **`config push`** pushes the entire `config.toml`, including the dev
  `site_url`. It would overwrite production's and break every auth email
  link.
- **`db push` / `migration up`** apply **every** pending migration and
  cannot be aimed at one. `supabase/migrations/HELD.md` exists because
  some are deliberately held; applying them all would run migrations that
  file explicitly forbids.
- **`db reset`** drops and recreates from migrations, against a project
  linked to production.

**MCP `apply_migration` and `execute_sql` hit production directly with
`service_role`** — no file, no review, no RLS. Treat every call as a
production write. That is why a hook matches those tool names and why the
MCP warning is always-on rather than path-scoped: an MCP call opens no
file, so a path-scoped warning would load after the damage.

Standing rules that no hook enforces:

- Use the **repo-local** CLI, `./node_modules/.bin/supabase`. Do not
  assume a global binary.
- Production MCP access stays **project-scoped and read-only**. Schema
  changes belong in a reviewed migration.
- **"Recorded" is not "applied."** The migrations directory and the live
  catalog have disagreed. Verify against the catalog, not the file list.
- New table means **RLS plus a policy in the same migration**. Enforced by
  the Review Gate.
- Recreating a view or matview **re-grants `anon`**. REVOKE after, then
  verify.
- For real Supabase work invoke the `supabase:supabase` skill (and
  `supabase:supabase-postgres-best-practices` for query and schema
  performance) rather than working from memory.
- `db-migration-reviewer` review is **mandatory** for schema changes —
  they are R3 under the engineering OS, meaning prepare only; the owner
  executes.

### Vercel — pushing is not deploying

**`vercel.json` carries `"git": {"deploymentEnabled": {"*": false}}`.**
No branch auto-deploys. Production is an on-demand CLI promote a human
runs. Any doc claiming "production serves main" is stale.

Denied at the permission layer in four spellings each: `vercel deploy
--prod`, `vercel --prod`, `vercel promote`, `vercel rollback`,
`vercel alias set`. `guard-bash.sh` blocks the same shapes by regex,
explicitly as belt-and-braces — the comment in that file notes that a
permission deny matches a literal prefix, so a reordered invocation would
dodge it.

All four mutate what production serves. `alias set` is included because
domain routing is production state even though it deploys nothing.

Practical rules that are not enforced by anything:

- **One deploy per milestone.** Deploys cost real money; do not deploy to
  preview a change. Use CI artefacts for visuals.
- **`vercel deploy` needs `--archive=tgz`** — there is a 15,000-file
  upload cap and this repo is over it.
- **`.vercelignore` replaces the default ignore set**, it does not extend
  it.
- **Team-scoped and integration env vars do not appear in
  `vercel env ls`.** Absence from that listing is not evidence a variable
  is unset.
- Use the **repo-local** CLI, `./node_modules/.bin/vercel`.

### What runs in production without touching CI

`vercel.json` declares **cron jobs**. They execute against production on
Vercel's schedule, independent of anything in this repo's CI. A green
pipeline says nothing about whether they are healthy — that is what the
Bridge is for.

### The rule underneath both

Under the engineering OS these are **R3 — privileged**: migrations, RLS,
auth, secrets, billing, destructive data, deploy permissions. An agent may
investigate and prepare. **The owner executes.** Daily reliability work
never deploys, promotes, or rolls back production, and a healthy day ends
with zero production actions.

---

## Part 12 — Traps, ranked by cost

1. `git branch --merged` never works here. Squash merge. Use PR state.
2. A required check is matched by name, and a stale name never errors —
   it waits forever.
3. `git check-ignore` on a path that does not exist **lies**. A
   trailing-slash pattern matches only directories; with no directory it
   reports NOT IGNORED for a rule that works. Verify with a probe file.
4. `.gitignore` hides a directory from git, not from `find` or `grep`. A
   nested worktree once put 4,314 duplicate `.ts` files in front of every
   search.
5. Grep finds callers only in the syntax you searched. CI invokes scripts
   by **path**, not `npm run <name>`; npm fires `prebuild`/`postbuild` by
   **naming convention**, so no file references them.
6. A gate that cannot fail is worse than no gate.
7. `timeout` does not exist on macOS. Use `gtimeout`.
8. `ls` is aliased to `eza`. Use `/bin/ls` in scripts.
9. A six-space continuation under a list item is a code block (MD046).
10. Imports do not save context.

---

## Part 13 — What the audit found

> Everything that resolved got trusted. Nothing checked what it resolved
> **to**.

Five defects, found separately, turned out to be one defect in different
clothes. Each passed the check that existed; none of those checks was
asking the right question.

## 13.1 A pointer that resolved to the wrong document

`memory/registry.yml` pointed the `recruiting` feature's canonical
`docs.feature` at a 1,399-line file containing **zero** occurrences of
"recruit". Seventeen feature docs existed for eighteen features.

Nobody noticed because the pointer **resolved** — `check-doc-coverage.mjs`
asserts `fileExists` and was satisfied. A dead pointer trips
`docs:path-drift`; a pointer to the wrong *live* document trips nothing.

Fixed both ways: `memory/features/recruiting.md` written from the source,
and `scripts/knowledge/check-doc-relevance.mjs` now fails when a feature's
doc does not describe it — wired into `knowledge:check`, which `ci.yml`
already runs. Proven as a regression: restoring the old pointer exits 1
naming `recruiting` with 0 hits.

## 13.2 A ratchet that disagreed between two checkouts of one commit

`markdown-lint-ratchet.mjs` walked `docs/` with `readdirSync`. That walk
is not gitignore-aware, and `docs/redesign/` is wholly ignored while
holding 21 `.md` files.

One checkout linted 1,479 files; CI linted 1,458. The same script, same
commit, gave two people numbers **1,850 apart**. Both measured honestly;
each concluded the other's tree was broken.

## 13.3 The rules file about verification was wrong about verification

`quality-gates.md` claimed `test:rls` "points at an empty vitest project"
and put coverage at "59 pgTAP suites". Both false — it runs the real
suites, and there are 74 files carrying 1,232 assertions. The same claim
also sat in `vitest.config.ts`.

This misleads exactly the person trying to check whether something is
covered, and it did: a session reported RLS "was not run", then corrected
to locally-unrunnable-but-CI-covered.

Fixed without writing new counts — a count in prose is what rotted in the
first place. The bullet now ships the commands that derive them.

## 13.4 A navigation doc committing the error three others warned of

The required-check NAME trap was documented in four files. One of them,
`docs/REPO_MAP.md` — which agents read before writing code — had drifted
into naming the phantom check `Review Gate / all`.

The fact now lives in `.github/branch-protection.md` alone. Restating is
how a warning system acquires the bug it warns about.

## 13.5 Tooling that misreports its own coverage

`npm run check:ledger` exits non-zero for anyone who runs it, because it
needs `psql` output on stdin and the alias supplies none. From a terminal
it used to **hang forever**, awaiting an EOF that never came.
`knowledge:report` is the same shape.

Both now print what they are and how to invoke them, and
`check-migration-ledger` short-circuits on a TTY.

---

## Part 14 — What this document's author got wrong

Four retractions, kept rather than edited away.

## 14.1 "Eleven orphan gates" was six, and two were actionable

I grepped CI for `npm run <name>`. **CI mostly invokes scripts by path.**
Every path-invoked gate read as an orphan — a fivefold inflation.

Worst of it: I claimed `markdown:ratchet` ran in no workflow and built a
narrative on it. It is a fully blocking required check. Another session
had told me hours earlier their PR went red on it, which is only possible
if it gates PRs. I had the disproof and did not reconcile it.

## 14.2 I wired a gate that cannot fail

Fixing the above, I added `check:env` to CI. It early-returns unless
`VERCEL_ENV` is set, which Actions never sets. Measured: without it, prints
OK and exits 0; forced to `production`, exits 1 properly.

It would have run on every PR inside the blocking aggregate, verifying
nothing — **in the same change whose purpose was removing gates that do
not gate**. It was also never an orphan: npm's `prebuild` hook runs it on
the Vercel build, where the check means something.

Caught by a second reader opening the script. This is the strongest
evidence here that the defect class is systemic, not historical.

## 14.3 "docs:check fails by design" — wrong

After `docs:regen` runs, a non-empty diff means the **committed** AUTOGEN
blocks do not match the generator. "Uncommitted regen output" and "stale
committed inventory" are the same state from two angles. I treated the
timing of the encounter as the defect. It also prints the true condition
and the exact remedy, and it is the only check that catches a hand-edit
inside an AUTOGEN block.

## 14.4 Measuring a working tree and calling it the repo

I reported a skill directory as "56M of the 57M". That was the canonical
checkout including untracked generated assets; a clean checkout has 1.7M
across 20 tracked files. Same error twice more: `docs/ui-audits` (39M on
disk, 0.1M tracked) and `docs/redesign` (16M, 0 tracked) are not repo
weight at all.

## 14.5 The method lesson

Every retraction came from inferring a system property by **grepping for a
caller** written in a syntax I was not searching:

| Looked for | Actually written as |
| --- | --- |
| `npm run <name>` in CI | the script **path** |
| the script name | an npm **lifecycle hook** |
| a config block by **line number** | a file that had shifted |
| a second reader's confirmation | agreement on a shared premise |

Every good finding came from **running the thing**. Grep tells you about
the text; only execution tells you about the system.

The fourth row has no mechanical fix. A wrong claim was held for hours by
two independent readers because it arrived **as agreement** — affirmed in
the same message that contained its disproof.

---

## Part 15 — Repo weight, measured

`git-sizer` names only the single largest object. Ranking every blob is
more useful:

```bash
git rev-list --objects --all > /tmp/objs.txt
git cat-file --batch-check='%(objecttype) %(objectname) %(objectsize) %(rest)' \
  < /tmp/objs.txt > /tmp/objinfo.txt
awk '$1=="blob" {printf "%.1fM  %s\n", $3/1048576, $4}' /tmp/objinfo.txt \
  | sort -rn | head -15
```

Against a 285 MiB pack:

| Object | Weight |
| --- | --- |
| `graphify-out/*` — three blobs | 155M |
| `.ultracode/…/events.ndjson` — three versions | 90M |
| `archive/misc/modern-saas-ui.skill` | 9.8M |
| `_staging-snapshot/…/mining/*.json` | 8.6M |

Roughly **245M of a 285M pack is two agent-tooling directories.** Both are
now gitignored; the existing blobs stay in history unless it is rewritten.

`docs/qa` is the largest tracked directory: 128 files, 69M, of which
**67M is 108 PNGs from one visual audit dated 2026-07-04** — 80% of all
tracked image weight in the repo.

## 15.1 Three stashes holding real work

`refs/stash` is repo-global, which is why `guard-bash.sh` blocks `git
stash`. Three entries predated the guard: 10 files (+234/−437), 18 files
(+923/−159), and a package-lock rebase. All preserved as
`recovered/stash-0/1/2`; `refs/preserved/stash-*` already held identical
copies. `refs/stash` was then cleared. Nothing dropped.

## 15.2 Refs that block garbage collection

Seventeen refs outside `heads`/`remotes`/`tags` keep old commits reachable
so `gc` cannot reclaim them. Two were provably redundant and deleted.
**Nine are the only reference to their commits and were deliberately
left** — the PRs they name (832, 839, 842, 845, 835, 666, 852, 854) **do
not exist in this repository**, so their contents cannot be evaluated and
gc after deletion is irreversible.

`git gc --prune=now` after the safe deletions took `.git` from 451M to
376M.

---

## Part 16 — A production bug, as illustration (since fixed)

Bridge fingerprint `af4c2c9d`: golf Messaging,
`fetch-team-chat-conversations`, 5 occurrences, 4 users, 8/19 to 8/26.
Every forensics field blank.

`src/hooks/golf/use-golf-messages.ts`:

```ts
logError(new Error(groupConvsError.message), { ... }, 'medium');
```

A `PostgrestError` carries `{ message, details, hint, code }`. Wrapping
only `.message` discards the rest — and `code`/`hint` are exactly the
fields the Bridge renders as ERROR CODE and ERROR HINT. **The information
was destroyed at the call site**, before any reporting layer saw it.

The dropped `code` is the diagnosis: `42501` an RLS denial, `PGRST301` a
JWT expiry, `PGRST116` no rows.

Why it belongs here: `src/test/lib/client-error-envelope.test.ts` exists
**because this was already found and fixed downstream**. The envelope was
fixed and pinned by a test; the call sites feeding it were not. Ten
`new Error(x.message)` wrappers remain, three in that one file.

There is a second defect at the same site: after logging there is **no
early return**, so the conversation list silently drops every team chat.
The error is logged and the UI lies.

### Fixed while this was being written — `9dea37c56` (#1635)

Both halves shipped to `main` on 2026-08-27, hours after the paragraphs
above were written. Recorded rather than rewritten: the gap between what
I proposed and what actually shipped is the useful part.

- The call site now uses `toPostgrestError()` and
  `postgrestErrorContext()` from `src/lib/utils/describe-error.ts`. The
  code rides on `.name`, because that is the only channel the client path
  has — `/api/log-error` lifts `context.error.name` into
  `metadata.errorCode`, which is where `extractErrorCode()` reads. A
  context-level `errorCode` would have been inert.
- `details` and `hint` deliberately stay OUT of `.message`. Fingerprints
  hash the message and `details` carries row-specific text, so folding it
  in would mint a new incident group per occurrence.
- **The second defect was not fixed the way this document proposed.** I
  wrote "no early return". The fix does not add one, and should not: the
  team-chat query *supplements* the RPC, so returning early would blank a
  rail whose DMs loaded fine. The terminal check became
  `(rpcError ?? groupConvsError)` instead. The defect was real; the
  prescription attached to it was wrong.

### And a count I should not have written

"Ten wrappers remain, three in that one file" is not reproducible, and it
does not agree with the fix author's "~47 other sites" — we were counting
different shapes and neither of us said which. The measurable version,
with the query that produces it:

```bash
git grep -nE "new Error\([A-Za-z_$][A-Za-z0-9_$.]*\.message\)" \
  -- 'src/**/*.ts' 'src/**/*.tsx'
```

76 hits today; 74 outside tests; 12 that report rather than `throw`, of
which 3 are unrelated normalizers. **Zero remain in
`use-golf-messages.ts`.** Most of the rest are `throw`, which is a
different shape — a throw preserves control flow and the message
propagates. The harmful one is reporting an error and losing its code.

Section 1 of `shipping.md` says never write a count into prose. I wrote
one six pages after quoting the rule.

---

## Part 17 — Numbers, and what they do not mean

| Measure | Before | After |
| --- | --- | --- |
| Always-on context per session | 1,108 lines | 659 |
| Tracked markdown files | 1,678 | 486 |
| Schema drift baseline | 59 | 58 |
| Path drift baseline | 44 | 31 |
| `npm run preflight` | failing | 10/10 |
| `.git` | 451M | 376M |

Every ratchet moved **down**. None was raised, no test weakened, no check
removed to make a sentence true.

## The caveat that matters more than the numbers

Late the same night, a session walked into the `ls`-is-aliased-to-`eza`
trap — documented in a rules file it had read hours earlier, in a file
both sessions had been discussing.

**A rule being loaded is not a rule being followed.** 1,108 to 659
measures what this repo stopped *paying* every session. It does not
measure what anyone started *doing*.

---

## Part 18 — Still open

Decisions, not work:

- **Land `docs/consolidation-2026-08-27`** — 23 commits, reviewed,
  preflight green, **not pushed**. It carries the `git ls-files` scope
  fixes, so landing it fixes the ratchet for everyone.
- **`docs/qa`** — 67M of July screenshots.
- **Nine unverifiable refs** — inspect with `git log --oneline -5 <ref>`.
- **`graphify-out`'s 53.5M blob** — still in history; removal needs a
  rewrite and force-push, which the guards block for good reason.
- **The messaging bug** — Part 14, and the ten call sites behind it.
- **Branch pruning** — five of six origin branches are spent; only
  `agent/push-token-teardown` holds unmerged product work.

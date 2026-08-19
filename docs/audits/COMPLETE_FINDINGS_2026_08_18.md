# Complete Findings — 2026-08-18

Every raw finding from both audits, **before** editorial merging into
`HEALTH_AUDIT_2026_08_18.md`. Nothing is collapsed or dropped here, including
the ones a skeptic struck down.

| Audit | Raw | Confirmed | Refuted | No verdict |
|---|---|---|---|---|
| Structure (12 dimensions) | 59 | 41 | 3 | 15 |
| Code (12 dimensions) | 35 | 22 | 1 | 12 |
| **Total** | **94** | **63** | **4** | **27** |

**Reading the labels**

- `CONFIRMED` — a second agent opened the file and saw the thing.
- `REFUTED` — struck down on inspection. Shown ~~struck through~~ and kept, so
  the same claim does not get re-reported next time.
- `UNVERIFIED` — the verifier returned no verdict for that title. Treat as
  *unconfirmed*, **not** as false: most are real but unchecked.
- `SAFE` / `DECISION` — whether the fix can just be applied.

Severity is the verifier's corrected value wherever it supplied one, which is
why some differ from what the finding agent originally claimed.

> ⚠️ Some entries name live, unfixed security holes. This repo is **public** —
> keep this file out of public issues until the items in §1 of the main audit
> are closed.

---

## Structure audit

Worktrees, nesting, database drift, broken config. Ran 25 agents; the live database was queried read-only via the Supabase MCP.

### `git-topology` — 6 findings

#### git-topology-1 · `HIGH` · `UNVERIFIED` · `SAFE`

**Two remote branches already SHIPPED (byte-identical to main) but never deleted — squash merge makes them invisible to --merged**

- **Where:** `refs/remotes/origin/codex/golf-team-operations (fdae1f4b6)` · `refs/remotes/origin/fix/composite-priority-confidence-gate (559b7b915)`
- **Why it matters:** Both branches will never be caught by `git branch -r --merged` or similar hygiene sweeps because the content landed via squash-merge under different commit hashes (#1513, #1510). They sit indefinitely as false 'in-flight work' signals for anyone auditing `branch -r`.
- **Evidence:** `git diff main:src/lib/golf/nav-registry.ts origin/codex/golf-team-operations:src/lib/golf/nav-registry.ts` and the same for `src/lib/server-error-logger.ts` both produced EMPTY output (byte-identical to main). `git log --oneline main -i --grep="team hub"` shows `a9f2c7f37 Fix Golf team operations and reliability (#1513)` as the landing commit. Separately, `git diff main:src/lib/coachhelm/v3/composite/synthesis.ts origin/fix/composite-priority-confidence-gate:...synthesis.ts` is also EMPTY, and `git log --oneline main -i --grep="confidence.gate"` shows `0ddfac0a5 fix(coachhelm): composite insights bypassed the confidence gate (#1510)`. `git merge-base --is-ancestor origin/fix/composite-prior…
- **Fix:** git push origin --delete codex/golf-team-operations fix/composite-priority-confidence-gate

#### git-topology-2 · `MEDIUM` · `UNVERIFIED` · `SAFE`

**13 non-standard local refs pin ~a month of dead PR-review objects, inflating the 251.97 MiB pack for no live purpose**

- **Where:** `.git/refs (refs/pr666, refs/pr832head, refs/pr839head, refs/pr842head, refs/pr845head, refs/pull-835-head, refs/batchbas…`
- **Why it matters:** These refs keep old review-checkpoint commits/trees permanently reachable, so `git gc`/`git prune` can never reclaim that history even though the underlying PRs shipped weeks ago. They correlate exactly with the CodeRabbit/review-gate tooling `.claude/rules/code-review-tooling.md` says was dropped 2026-07-20 — the refs are its fossils.
- **Evidence:** `git for-each-ref` lists all 13; `git log -1 --format="%h %ci %s"` on each dates them 2026-07-01 through 2026-07-15 (34+ days stale as of today 2026-08-18), and every subject line references an already-merged PR (#832, #839, #842, #845, #835, #852, #853, #854). `git cat-file -t 7efafbf63` (the codex/turn-diffs ref) returns `tree` — a ref pointing directly at a tree object, not a commit, which is itself non-standard. None are under refs/heads or refs/tags-proper (except the 3 legitimate `refs/tags/archive/*`), so `git worktree prune`, `git branch --merged`, and normal PR-branch cleanup never touch them.
- **Fix:** for r in refs/pr666 refs/pr832head refs/pr839head refs/pr842head refs/pr845head refs/pull-835-head refs/batchbase refs/review-pinned/base852 refs/review-pinned/base854 refs/review-pinned/pr852 refs/review-pinned/pr854; do git update-ref -d "$r"; done (handle the refs/codex/turn-diffs/... path separately, then `git gc` to reclaim space)

#### git-topology-3 · `LOW` · `UNVERIFIED` · `SAFE`

**21 of 23 branch.<name>.remote/.merge config sections are dangling — the local branch behind them is gone**

- **Where:** `.git/config [branch.*] sections`
- **Why it matters:** Harmless today (no functional effect), but it's a hygiene signal: normal `git branch -d`/`-D` removes its own config section, so this many orphans means these ~20 branches were deleted by another path (raw ref removal, or an interrupted operation) — consistent with the fsmonitor half-applied-checkout failure mode `.claude/rules/autonomy.md` already documents for `git checkout -b`.
- **Evidence:** `git config --list --local` shows branch tracking config for 23 names; `git branch -vv` shows only 2 local branches exist (`main`, `agent/team-hub-option-c`). A loop of `git show-ref --verify --quiet refs/heads/<name>` over the other 21 (perf/golf-shot-detail-rls, recovery/coachhelm-premium-wip-2026-07-21, fix/baseball-coaches-narrow-select, fix/push-token-survives-login, fix/p0-join-idempotency-calendar-terms, fix/join-request-rls-and-onboarding-email, fix/genome-page-read-failures, fix/travel-authz-read-failure, fix/stale-bundle-login-recovery, fix/restore-reverted-read-guards, fix/analytics-zero-from-unread-roster, fix/event-lifecycle-honest, fix/layout-remaining-reads, fix/calendar-page-…
- **Fix:** for b in perf/golf-shot-detail-rls recovery/coachhelm-premium-wip-2026-07-21 fix/baseball-coaches-narrow-select fix/push-token-survives-login fix/p0-join-idempotency-calendar-terms fix/join-request-rls-and-onboarding-email fix/genome-page-read-failures fix/travel-authz-read-failure fix/stale-bundle-login-recovery fix/restore-reverted-read-guards fix/analytics-zero-from-unread-roster fix/event-lifecycle-honest fix/layout-remaining-reads fix/calendar-page-reads fix/provider-fault-code-through-soft…

#### git-topology-4 · `MEDIUM` · `UNVERIFIED` · `SAFE`

**3 stashed WIP snapshots are tied to branches that no longer exist locally and are reachable only through refs/stash's reflog**

- **Where:** `refs/stash (stash@{0}, stash@{1}, stash@{2})`
- **Why it matters:** This is real, possibly-unlanded work (uncommitted diffs) sitting only in the stash reflog. Unlike a normal ref, reflog entries are subject to expiry (`gc.reflogExpireUnreachable`, default 30 days) — some of this content is already close to or past that window given the branches were deleted before today (2026-08-18), so a routine `git gc` could silently delete it.
- **Evidence:** `git stash list` returns: `stash@{0}: WIP on fix/provider-fault-code-through-soft-failure: 77b611316 fix(golf): the class parser dropped end times, weekdays, and the stated term`, `stash@{1}: On baseball/overnight-completion: pre-baseball-sweep snapshot 1785364718`, `stash@{2}: On agent/fairway-crm-ui: preserve local package updates during CRM PR rebase`. None of `fix/provider-fault-code-through-soft-failure`, `baseball/overnight-completion`, or `agent/fairway-crm-ui` exist as local branches (confirmed above), so there is no branch to `git stash pop` back onto.
- **Fix:** For each entry, inspect with `git stash show -p stash@{N}`; if still needed, apply onto a new branch (`git stash branch recovered/<name> stash@{N}`) before it ages out — do not `git gc --prune` until reviewed.

#### git-topology-5 · `LOW` · `UNVERIFIED` · `SAFE`

**merge.ours.driver=true is configured locally but no .gitattributes exists anywhere to invoke it — dead config that is a latent silent-data-loss trap**

- **Where:** `.git/config [merge] ours.driver=true`
- **Why it matters:** Unused today. But this driver, once wired via a `.gitattributes` line like `path merge=ours`, makes `git merge`/`git pull` silently keep 'our' side and discard the other branch's changes to that path with no conflict marker and no warning — a classic way for another agent's changes to vanish on the next merge if a `.gitattributes` is ever added without the team knowing this driver is already primed.
- **Evidence:** `git config --list --local` shows `merge.ours.driver=true`. `ls /Users/ricknini/Downloads/helmv3/.gitattributes` returns `No such file or directory`, and `find . -maxdepth 1 -name .gitattributes` returns nothing.
- **Fix:** Confirm nothing depends on it, then `git config --local --unset merge.ours.driver` (or, if intentional, add a comment in a checked-in doc explaining which path it's meant to protect).

#### git-topology-6 · `LOW` · `UNVERIFIED` · `SAFE`

**.git/hooks/pre-commit is a REAL (non-sample) hook that auto-runs npm run db:types and git add's a file into every qualifying commit, undocumented in CLAUDE.md's hook table**

- **Where:** `.git/hooks/pre-commit`
- **Why it matters:** Any commit (by a human or an agent) that stages a migration file silently triggers a `npm run db:types` network call to Supabase and mutates the staged tree by re-adding `database.ts` — before the commit is created. This isn't listed among the `.claude/hooks/*.sh` scripts CLAUDE.md documents, so an agent following CLAUDE.md's hook table has no way to anticipate it, and it can hang or fail in a sandboxed session that lacks `SUPABASE_PROJECT_ID`/network access to Supabase.
- **Evidence:** `ls -la .git/hooks` shows `pre-commit` (mode 755, dated `8 Jan 20:45`) alongside all the `*.sample` files (dated `18 Dec 2025`, non-executable-by-convention templates). Its content: `if echo "$STAGED_FILES" | grep -q "supabase/migrations/.*\.sql$"; then ... npm run db:types ... git add src/lib/types/database.ts ... fi`.
- **Fix:** Document it in CLAUDE.md's hook section (or move its logic into `.claude/hooks/` for consistency), and guard it to no-op cleanly when `SUPABASE_PROJECT_ID` can't be resolved and the environment is non-interactive/sandboxed.

### `nesting` — 3 findings

#### nesting-1 · `MEDIUM` · `CONFIRMED` · `SAFE`

**helm-website-ui/ is a fully-deleted project whose 376M node_modules and Next.js fingerprint files were never cleaned off disk**

- **Where:** `helm-website-ui/` · `helm-website-ui/node_modules` · `helm-website-ui/next-env.d.ts` · `helm-website-ui/tsconfig.tsbuildinfo`
- **Why it matters:** next-env.d.ts + tsconfig.tsbuildinfo + a fully-populated node_modules make `ls`/`find`/`grep` present this as a live Next.js project with no source — the same class of confusion CLAUDE.md already flags for the removed .worktrees nested-repo (files in front of every search). 376M of dead disk weight with nothing left to consume it.
- **Evidence:** `git ls-files | grep -ic helm-website-ui` → 0. `find helm-website-ui -name package.json -not -path "*/node_modules/*"` → empty (no package.json anywhere). `git log --oneline --all -- helm-website-ui` shows commit 761bea048 (2026-07-15, 'chore: devibe wave 1 follow-up - remove helm-website-ui/') did `git rm -r` on all 86 tracked files, describing it as 'a v0.dev scaffold ("my-v0-project")'. What's left on disk: `du -sh helm-website-ui` → 376M, 100% inside node_modules, plus next-env.d.ts, tsconfig.tsbuildinfo, .DS_Store. All four are individually ignored by generic root patterns (`.gitignore:123` node_modules, `:30` next-env.d.ts, `:54` tsconfig.tsbuildinfo, `:62` .DS_Store) — confirmed via `…
- **Fix:** rm -rf helm-website-ui/ (git rm is unnecessary — nothing here is tracked); also drop the now-dead `helm-website-ui/**/*.js` line from .gitignore (line 157).
- **Verifier (CONFIRMED):** Personally verified every cited fact: `git ls-files | grep -ic helm-website-ui` returns 0; no package.json exists anywhere under the tree (tracked or not); `git log --oneline --all -- helm-website-ui` shows 761bea048 removed all 86 tracked files via `git rm -r` (commit message reads 'delete dead root dirs...' rather than the claim's paraphrase 'a v0.dev scaffold', but the deletion fact is correct and prior history at 6809c7d65/27a9e7931/1aa6b3fcf…

#### nesting-2 · `MEDIUM` · `CONFIRMED` · `SAFE`

**output/ is an untracked, ungitignored scratch dump — its 6 sibling scratch dirs are all gitignored for the identical purpose**

- **Where:** `.gitignore` · `output/playwright/`
- **Why it matters:** CLAUDE.md's own autonomy rule documents this exact tree already having a `git add -A` incident that swept in another agent's half-finished files. `output/` is exactly the kind of directory that incident describes: real, ungitignored artifacts sitting in git status, one `-A` away from landing in a commit.
- **Evidence:** `git status --porcelain` → `?? output/` (untracked, matches no ignore rule). `output/playwright/` holds 20+ PNG screenshots plus `.playwright-cli/console-*.log` and `page-*.yml` debug captures from a manual run today (2026-08-18). Six directories doing the same job are all fully ignored: `git status --porcelain --ignored` shows `!! .dev-screenshots/`, `!! .tmp-screenshots/`, `!! .playwright-mcp/`, `!! frames/`, `!! .dev-assets/`, `!! audit/` (audit/ alone is 1.0G of the same kind of content). No `.gitignore` line matches `output/` at all — checked with `grep -n output .gitignore` (only unrelated 'Ops audit outputs' comments) and `git check-ignore -v output` (exit 1, no match).
- **Fix:** add `/output/` to .gitignore alongside the other 6 scratch-output entries (or, if `output/` should be retained on purpose, rename/consolidate it into one of the existing ignored dump dirs rather than leaving a 7th, differently-governed one).
- **Verifier (CONFIRMED):** `git status --porcelain` shows `?? output/` exactly as claimed. `find output/playwright -maxdepth 1 -type f | wc -l` → 22 PNGs, and a nested `output/playwright/qualifier-e2e/.playwright-cli/` holds console-*.log and page-*.yml debug captures timestamped 2026-08-18T16:4x — today, consistent with a manual run (this is a different, still-live .playwright-cli than the top-level one already removed per the known-fixed list, so it's fair game). `git st…

#### nesting-3 · `MEDIUM` · `CONFIRMED` · `DECISION`

**.skills/skills/golfhelm-creative-engine/tools/ is a dead duplicate of the real, tracked skill at .claude/skills/golfhelm-creative-engine/tools/**

- **Where:** `.skills/skills/golfhelm-creative-engine/tools/`
- **Why it matters:** Any name-based search for `golfhelm-creative-engine` (grep, find, an agent orienting itself) hits two directories, only one of which is real; the dead one carries an untracked `.env` that should not be assumed benign without reading it.
- **Evidence:** `find .skills -not -path "*/node_modules/*" -type f` returns exactly 4 files: test-photo-composite.png, test-output.png, test-dark-final.png, test-dark-output.png, plus a `.env` (`.gitignore:41` matches it — confirmed gitignored/untracked via `git check-ignore -v`; contents were not read, sandbox denied it). No SKILL.md, no package.json, nothing that defines a skill — this path is 100% leftover run artifacts. The real skill lives at `.claude/skills/golfhelm-creative-engine/` (90 tracked files per `git ls-files .claude/skills/ | wc -l`, includes its own package.json/package-lock.json/SKILL definition). Both paths independently vendor a near-identical node_modules: `du -sh .skills/skills/golfh…
- **Fix:** rm -rf .skills/ — but do so deliberately (not folded into a generic node_modules sweep) because of the `.env` file inside it; confirm its contents aren't needed before deleting.
- **Verifier (CONFIRMED):** `find .skills -not -path '*/node_modules/*' -type f` returns exactly the 5 files claimed: test-photo-composite.png, test-output.png, .env, test-dark-final.png, test-dark-output.png — no SKILL.md, no package.json. `.claude/skills/golfhelm-creative-engine` by contrast has `SKILL.md` and `tools/package.json` tracked, with `git ls-files .claude/skills/ | wc -l` → 90. Both vendor independent node_modules of near-identical size: `.skills/.../node_modul…

### `gitignore` — 3 findings

#### gitignore-1 · `HIGH` · `CONFIRMED` · `SAFE`

**The mandated production-deploy script is invisible to any doc in the repo**

- **Where:** `scripts/deploy-prod.sh` · `CLAUDE.md:15-24 (Branch & deploy section)`
- **Why it matters:** It is not wired into package.json as an npm script either (no 'deploy' or 'deploy:prod' entry). An agent asked to deploy to production has no doc-based way to discover this script exists and will reach for the bare `vercel deploy --prod` the script's own comment names as the cause of a real prior incident (misdiagnosed stale-release-tag, near-unnecessary force redeploy).
- **Evidence:** grep -rl "deploy-prod" --include=*.md --include=*.yml --include=*.yaml --include=*.json --include=*.sh --include=*.mjs --include=*.ts . (excluding node_modules) returns ZERO hits outside scripts/deploy-prod.sh itself — not in CLAUDE.md, README.md, AGENTS.md, docs/CI_RUNBOOK.md, .claude/rules/*, or any .github/workflows/*.yml. Yet CLAUDE.md's own 'Branch & deploy' section discusses production deploys at length ('A push to main ships nothing... production is an on-demand CLI promote') without ever naming the script. The script's own header states why it exists: '`vercel deploy --prod` uploads local source with no git connection, so Vercel never sets VERCEL_GIT_COMMIT_SHA... On 2026-08-16 that …
- **Fix:** Add a line to CLAUDE.md's 'Branch & deploy' section: 'Deploy to production with `scripts/deploy-prod.sh` (stamps the Sentry release from the real git SHA) — never a bare `vercel deploy --prod`.' Optionally also wire it as an npm script (e.g. `"deploy:prod": "bash scripts/deploy-prod.sh"`) for discoverability via `npm run`.
- **Verifier (CONFIRMED):** Verified independently: `grep -rln "deploy-prod" --include="*.md" --include="*.yml" --include="*.yaml" --include="*.json" --include="*.sh" --include="*.mjs" --include="*.ts" .` (excluding node_modules/.git) returns exactly one hit: scripts/deploy-prod.sh itself. `grep -n "deploy" package.json` returns zero lines — no `deploy` or `deploy:prod` npm script exists. `grep -rln "deploy-prod" README.md docs/ .claude/ .github/` also returns nothing. The …

#### gitignore-2 · `LOW` · `CONFIRMED` · `SAFE`

**verify:business is a redundant alias for test:business**

- **Where:** `package.json:45-46`
- **Why it matters:** Two names for one command with no behavioral difference. Not broken, but it is exactly the kind of duplicate an agent can be confused by — editing test:business expecting it to be dead code, or adding a third alias instead of realizing one already exists.
- **Evidence:** package.json line 45: `"test:business": "vitest run --project business"`; line 46: `"verify:business": "npm run test:business"`. grep across .github/workflows/*.yml, docs/*.md, .claude/rules/*.md, README.md, AGENTS.md, CLAUDE.md for the literal string 'test:business' finds it referenced ONLY as the target of the verify: alias — every real caller (CI and docs) invokes `npm run verify:business`, never `npm run test:business` directly.
- **Fix:** Collapse to a single name (drop test:business, rename verify:business's target inline, and update the one caller in .github/workflows/*.yml), or keep both but comment in package.json/CLAUDE.md that verify:business is the canonical CI entrypoint and test:business is only its implementation.
- **Verifier (CONFIRMED):** package.json:45-46 confirmed verbatim: `"test:business": "vitest run --project business"` followed by `"verify:business": "npm run test:business"`. Repo-wide grep for both strings across *.yml/*.yaml/*.md/*.json shows the only real caller is `.github/workflows/ci.yml:384: run: npm run verify:business` — CI never invokes `test:business` directly. Two docs (docs/qa/helm-system-overview.md:178, docs/baseballhelm-overnight/RESUME_INSTRUCTIONS.md:59) …

#### gitignore-3 · `LOW` · `CONFIRMED` · `SAFE`

**CLAUDE.md's description of docs:regen omits a file the script actually writes**

- **Where:** `CLAUDE.md:161` · `package.json:28-29` · `scripts/regen-docs.mjs:45-47,186`
- **Why it matters:** CLAUDE.md elsewhere states 'Never hand-edit inside an AUTOGEN block — your edit will be overwritten on the next run.' An agent that trusts the docs:regen one-line description (which names only 2 of the 3 AUTOGEN-managed files) could reasonably believe memory/context/golfhelm-database.md is NOT AUTOGEN-managed and hand-edit it, only to have `npm run docs:regen` (or CI's docs:check) silently overwrite that edit on the next run.
- **Evidence:** CLAUDE.md:161 says: `npm run docs:regen # Regenerate memory/glossary.md + memory/projects/golfhelm.md inventory` — naming only two files. But package.json:29's docs:check script diffs THREE files: `git diff --exit-code memory/glossary.md memory/projects/golfhelm.md memory/context/golfhelm-database.md`, and scripts/regen-docs.mjs:47 defines `DATABASE_DOC = join(REPO_ROOT, 'memory/context/golfhelm-database.md')`, with its own comment at line 186 confirming that file is a real AUTOGEN target of this same script.
- **Fix:** Update CLAUDE.md:161 to: `npm run docs:regen # Regenerate memory/glossary.md + memory/projects/golfhelm.md + memory/context/golfhelm-database.md inventory`, matching what docs:check (package.json:29) and regen-docs.mjs actually touch.
- **Verifier (CONFIRMED):** CLAUDE.md:161 confirmed verbatim: `npm run docs:regen # Regenerate memory/glossary.md + memory/projects/golfhelm.md inventory` — names only two files. package.json:29's docs:check confirmed to diff three: `git diff --exit-code memory/glossary.md memory/projects/golfhelm.md memory/context/golfhelm-database.md`. scripts/regen-docs.mjs:47 confirmed: `const DATABASE_DOC = join(REPO_ROOT, 'memory/context/golfhelm-database.md')`, and the script writes …

### `db-migrations-vs-types` — 5 findings

#### db-migrations-vs-types-1 · `HIGH` · `CONFIRMED` · `DECISION`

**supabase/migrations/ cannot rebuild prod — 32 files were never recorded as applied migrations, prod ran different (uncommitted) versions instead**

- **Where:** `supabase/migrations/20260807030400_gate_qualifier_leaderboard.sql` · `supabase/migrations/20260807080000_golf_dm_join_requires_creator.sql` · `supabase/migrations/20260730030000_avatars_storage_bucket_rls.sql` · `mcp__supabase__list_migrations`
- **Why it matters:** The migration file's own committed content was never what ran on prod — someone applied equivalent-but-different SQL out of band (via apply_migration with a fresh timestamp, or raw execute_sql with no migration record at all) and then wrote/renamed the repo file afterward without reconciling it to the actual applied version. A `supabase db reset`, a new preview branch, or disaster recovery built by replaying supabase/migrations/ in filename order will not reproduce prod: it applies THIS file's exact text under THIS filename's timestamp, which the live schema_migrations table has no record of, so tooling that diffs local-vs-remote migration history will show these as perpetually pending again…
- **Evidence:** list_migrations (803 rows) has no version '20260807030400' or '20260807080000' etc. — comm -23 of file-timestamps vs applied-timestamps names 32 files with zero matching entry. For 4 of them I confirmed the fix IS live, just under a different, uncommitted version/name: file 20260807030400_gate_qualifier_leaderboard.sql -> actually applied as version 20260807044633 name 'gate_qualifier_leaderboard_and_revoke_anon_effectiveness'; file 20260807080000_golf_dm_join_requires_creator.sql -> applied as 20260807163532 'golf_dm_join_requires_creator_not_team'; file 20260807030300_baseball_conversations_recursion_and_tenant_binding.sql -> applied as 20260807044402 'baseball_conversations_fix_recursion_…
- **Fix:** Reconcile: for each of the 32 files, either (a) insert the correct historical row into supabase_migrations.schema_migrations for that exact version so CLI tooling agrees prod ran it, or (b) delete/renumber the repo file to match what was actually applied. Do this via `supabase migration repair` or a documented backfill migration — not silently, since it changes what future `db reset`/branch runs will produce.
- **Verifier (CONFIRMED):** The core count is exact: `find supabase/migrations -name '*.sql' | wc -l` = 300 files; `list_migrations` returns 803 applied rows; `comm -23` on the sorted version-prefixes yields exactly 32 files with zero matching applied version — matching the claim precisely. I independently re-derived all 4 'renamed reconciliation' examples from the raw 803-row applied list and they match verbatim: 20260807030400→20260807044633 'gate_qualifier_leaderboard_an…

#### db-migrations-vs-types-2 · `MEDIUM` · `CONFIRMED` · `SAFE`

**public.crm_email_templates_backup_20260720 — RLS enabled, ZERO policies, no primary key, live in public schema with 40 rows of real data**

- **Where:** `mcp__supabase__get_advisors(security)` · `mcp__supabase__get_advisors(performance)` · `public.crm_email_templates_backup_20260720`
- **Why it matters:** A dated ad-hoc backup snapshot (name suggests a manual copy made 2026-07-20) sits live in the queryable `public` schema — discoverable via PostgREST schema introspection at /rest/v1/ — with no primary key and RLS that grants nothing to anon/authenticated (silently returns 0 rows for them), but no FORCE ROW SECURITY, so the table owner/postgres role can read it unrestricted. It is dead weight that widens the public schema's attack surface and inventory for no functional benefit; this exact codebase already has an `archive` schema convention for retired snapshots (e.g. archive.golf_events_momentic_20260731) that this table did not use.
- **Evidence:** security advisor: {"name":"rls_enabled_no_policy","detail":"Table `public.crm_email_templates_backup_20260720` has RLS enabled, but no policies exist"}. performance advisor: {"name":"no_primary_key","detail":"Table `public.crm_email_templates_backup_20260720` does not have a primary key"}. list_tables confirms rows=40 (not empty). pg_class: relrowsecurity=true, relforcerowsecurity=false.
- **Fix:** Move to the `archive` schema (`ALTER TABLE public.crm_email_templates_backup_20260720 SET SCHEMA archive;`) or drop it if the backup is no longer needed, after confirming with `grep -r crm_email_templates_backup_20260720 src/` that no code path references it.
- **Verifier (CONFIRMED):** Every element checks out exactly. Security advisor: {"name":"rls_enabled_no_policy","detail":"Table `public.crm_email_templates_backup_20260720` has RLS enabled, but no policies exist"}. Performance advisor: {"name":"no_primary_key","detail":"...does not have a primary key"}. Direct query on pg_class: relrowsecurity=true, relforcerowsecurity=false, and `select count(*) from public.crm_email_templates_backup_20260720` returns exactly 40. The only …

#### db-migrations-vs-types-3 · `LOW` · `REFUTED` · `SAFE`

~~**4 SECURITY DEFINER views flagged ERROR by the security advisor, never previously triaged**~~

- **Where:** `mcp__supabase__get_advisors(security)` · `public.baseball_coaches_public` · `public.organizations_public_profile` · `public.baseball_team_coach_staff_public` · `public.baseball_teams_public_profile`
- **Why it matters:** These read as an intentional 'public profile' pattern (curated columns + row filters, bypassing base-table RLS by design) rather than a bug, but the security advisor still lists them at its highest severity and this repo's memory/audit trail has no record of that ERROR having been reviewed or accepted. Because a SECURITY DEFINER view does not re-check RLS on the base table, any future column addition to organizations/baseball_teams/baseball_coaches that a developer expects RLS to gate will instead be silently exposed through these views to anon/authenticated unless the view is remembered and updated in lockstep.
- **Evidence:** 4 ERROR-level lints: {"name":"security_definer_view","level":"ERROR","detail":"View `public.baseball_coaches_public` is defined with the SECURITY DEFINER property"} (same for organizations_public_profile, baseball_team_coach_staff_public, baseball_teams_public_profile). pg_get_viewdef shows they select a curated non-sensitive column subset (e.g. organizations_public_profile: id,name,type,logo_url,description,division,conference,website_url,location_city,location_state — no owner/contact/private fields) and baseball_teams_public_profile/baseball_team_coach_staff_public filter rows (public_profile_mode <> 'private', visible_to_players=true AND status='active'). Grants: organizations_public_pro…
- **Fix:** Either convert to SECURITY INVOKER views backed by explicit RLS SELECT policies on the base tables (the RLS-native equivalent), or explicitly document these 4 as an accepted by-design exception (e.g. in golfhelm-database.md / a migration comment) so the ERROR is a tracked accepted-risk rather than an unreviewed advisor line.
- **Verifier (REFUTED):** The technical facts are accurate — 4 views (baseball_coaches_public, organizations_public_profile, baseball_team_coach_staff_public, baseball_teams_public_profile) are flagged `security_definer_view` at level ERROR, and the column/filter descriptions match `pg_views.definition` exactly — but the claim's load-bearing assertion is that this is unreviewed ('never previously triaged', 'no record of that ERROR having been reviewed or accepted', 'unrev…

#### db-migrations-vs-types-4 · `LOW` · `CONFIRMED` · `SAFE`

**pg_trgm and citext extensions installed in the public schema (security WARN, unaddressed)**

- **Where:** `mcp__supabase__get_advisors(security)`
- **Why it matters:** Extensions in `public` add their functions/operators to every unqualified search_path lookup, which is the standard Supabase advisory concern (a compromised/miswritten function relying on unqualified names could resolve to extension-defined objects). Not evidence of an active exploit, but it is a currently-live, unresolved advisory with a known remediation.
- **Evidence:** {"name":"extension_in_public","level":"WARN","detail":"Extension `pg_trgm` is installed in the public schema. Move it to another schema."} and identical for `citext`.
- **Fix:** `CREATE SCHEMA IF NOT EXISTS extensions;` then `ALTER EXTENSION pg_trgm SET SCHEMA extensions; ALTER EXTENSION citext SET SCHEMA extensions;` and add `extensions` to relevant search_paths — test locally first since any index/column typed `citext` or expression using pg_trgm operators needs the schema on its search_path.
- **Verifier (CONFIRMED):** Verbatim match in the security advisor output: {"name":"extension_in_public","level":"WARN","detail":"Extension `pg_trgm` is installed in the public schema. Move it to another schema."} and an identical entry for `citext`. Independently corroborated via `list_extensions`: pg_trgm schema="public" installed_version="1.6"; citext schema="public" installed_version="1.6" — both exactly matching the advisor's flagged state.

#### db-migrations-vs-types-5 · `LOW` · `CONFIRMED` · `SAFE`

**Duplicate index on baseball_decision_log wastes writes and storage**

- **Where:** `mcp__supabase__get_advisors(performance)` · `public.baseball_decision_log`
- **Why it matters:** Two functionally identical indexes on the same table double the write-time index-maintenance cost and storage for that column with zero read benefit — a pure inefficiency, low blast radius since the table currently has 0 rows.
- **Evidence:** {"name":"duplicate_index","level":"WARN","detail":"Table `public.baseball_decision_log` has identical indexes {baseball_decision_log_meeting_item_id_idx,baseball_decision_log_meeting_item_idx}. Drop all except one of them"}
- **Fix:** `DROP INDEX baseball_decision_log_meeting_item_idx;` (keep the `_id_idx` one, matching this repo's naming convention elsewhere) in a new migration.
- **Verifier (CONFIRMED):** Verbatim match in the performance advisor: {"name":"duplicate_index","level":"WARN","detail":"Table `public.baseball_decision_log` has identical indexes {baseball_decision_log_meeting_item_id_idx,baseball_decision_log_meeting_item_idx}. Drop all except one of them"}. `select count(*) from public.baseball_decision_log` returns 0, confirming the claim's stated low blast radius. Independently corroborated in `docs/qa/helm-database-map.md:645`, which…

### `db-live-drift` — 6 findings

#### db-live-drift-1 · `HIGH` · `CONFIRMED` · `SAFE`

**Blanket `*.png` rule creates false confidence — silently rejects new PNGs in directories that already hold dozens of tracked ones**

- **Where:** `.gitignore:88` · `public/ (10 tracked pngs)` · `design/ (12 tracked pngs)` · `.claude/skills/golfhelm-creative-engine/ (1 tracked png)` · `ios/App/App/Assets.xcassets/ (4 tracked pngs)`
- **Why it matters:** Anyone dropping a new PNG into public/, design/, .claude/skills/, or ios/App/App/Assets.xcassets/ — the exact folders that already hold dozens of committed PNGs, so a dev has every reason to assume images there are tracked — gets a silent no-op from `git add .`/`git add -A`. A replaced app icon, updated dashboard screenshot, or new App Store asset can sit on disk, render locally, and never reach a commit or PR.
- **Evidence:** `git ls-files -ci --exclude-standard` returns 53 tracked-but-ignored paths; 47 of them resolve via `git check-ignore -v --no-index` to `.gitignore:88:*.png` (e.g. `public/og/home.png`, `design/screenshots/calendar.png`, `ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png`). Live proof: `touch public/zzz-new-marketing-graphic.png && git add public/zzz-new-marketing-graphic.png` returns `The following paths are ignored by one of your .gitignore files: public/zzz-new-marketing-graphic.png / hint: Use -f if you really want to add them.`
- **Fix:** Add explicit `!` exceptions the same way lines 90-101 already do for public/email/, docs/qa/, android, and playstore assets — e.g. `!public/**/*.png`, `!design/**/*.png`, `!ios/App/App/Assets.xcassets/**/*.png`, `!.claude/skills/**/*.png` — or narrow the `*.png` rule to only the scratch paths that actually need it.
- **Verifier (CONFIRMED):** Core mechanism reproduced live and unedited: `touch public/zzz-skeptic-test-new.png && git add public/zzz-skeptic-test-new.png` returned the exact 'ignored by one of your .gitignore files... hint: Use -f' message (file removed immediately after, no lasting change). `git ls-files -ci --exclude-standard` does return 53 tracked-but-ignored paths as claimed, and .png files in public/, design/, .claude/skills/golfhelm-creative-engine/, and ios/App/App…

#### db-live-drift-2 · `HIGH` · `CONFIRMED` · `SAFE`

**Nested ios/.gitignore's `App/App/public` + `config.xml` rules are entirely defeated — a macOS `.DS_Store` is tracked in git**

- **Where:** `ios/.gitignore:4` · `ios/.gitignore:13` · `ios/App/App/public/.DS_Store` · `ios/App/App/config.xml`
- **Why it matters:** App/App/public is Capacitor's synced copy of the web build, explicitly ignored so `npx cap sync ios` can regenerate it freely — but the whole directory (plus config.xml, separately ignored one line below with a "Generated Config files" comment) was committed anyway, including a Finder junk file with zero source value. The ignore rules provide no actual protection here; the tracked copy can drift from what a real sync produces, and every future sync now has to be manually reconciled against stale checked-in files instead of silently regenerating.
- **Evidence:** `git check-ignore -v --no-index ios/App/App/public/.DS_Store` → `ios/.gitignore:4:App/App/public ios/App/App/public/.DS_Store`. `git ls-files | grep '^ios/App/App/public/' | wc -l` → 15 tracked files (logos, offline.html, sw.js, icons, .DS_Store). `git check-ignore -v --no-index ios/App/App/config.xml` → `ios/.gitignore:13:App/App/config.xml`. All 16 files were added in one commit: `git log -1 -- ios/App/App/public/.DS_Store` → `59e7a34f4 2026-04-11 Fix Capacitor iOS config — restore contentInset + keyboard options`.
- **Fix:** `git rm -r --cached ios/App/App/public ios/App/App/config.xml` (working-tree files stay put) so the existing ignore rules take effect going forward; if config.xml genuinely must ship (as the adjacent comment says capacitor.config.json must), delete line 13 instead and document why.
- **Verifier (CONFIRMED):** Verified exactly: ios/.gitignore line 4 is `App/App/public`, line 13 is `App/App/config.xml` with the 'Generated Config files' comment on line 11. `git ls-files | grep '^ios/App/App/public/' | wc -l` returns 15 (not 16 — the claim's own count of 'ios/App/App/config.xml' as a 16th file outside that grep is fine, so total ignored-but-tracked files across both rules is 16, matching). `git check-ignore -v --no-index` on .DS_Store and config.xml both …

#### db-live-drift-3 · `MEDIUM` · `CONFIRMED` · `SAFE`

**`output/` Playwright CLI artifacts (console logs + page snapshots) have zero .gitignore coverage**

- **Where:** `.gitignore (no rule present)` · `.gitignore:174-175 (nearest analogous rules)` · `output/playwright/qualifier-e2e/.playwright-cli/`
- **Why it matters:** Every Playwright CLI run drops fresh timestamped log/YAML files under output/ that nothing excludes; a routine `git add -A` after running e2e tests locally stages this throwaway diagnostic noise straight into a commit or PR, the same failure mode the repo already added dedicated rules to prevent for test-results/ and playwright-report/.
- **Evidence:** `git status --porcelain=v1 --ignored=matching -uall` lists `?? output/playwright/qualifier-e2e/.playwright-cli/console-2026-08-18T16-41-39-455Z.log`, a second timestamped console log, and two `page-*.yml` DOM-snapshot files — all `??` (untracked, NOT matched by any ignore rule), unlike `/test-results/` and `/playwright-report/` which the file already ignores at lines 174-175.
- **Fix:** Add `output/` (or `/output/` if it should stay root-only) to .gitignore next to the existing `/test-results/` and `/playwright-report/` rules.
- **Verifier (CONFIRMED):** Verified precisely. `git status --porcelain=v1 --ignored=matching -uall` shows the four qualifier-e2e/.playwright-cli/ files (2 console-*.log, 2 page-*.yml) as `??` untracked, while every output/playwright/*.png screenshot in the same tree shows as `!!` ignored (incidentally, via the unrelated blanket *.png rule, not any output/-specific rule). `git check-ignore -v --no-index` on both a .log and a .yml file under .playwright-cli/ returns exit cod…

#### db-live-drift-4 · `HIGH` · `CONFIRMED` · `SAFE`

**`docs/operations/generated/` is commented "regenerated by CI/scripts" but 5 of its JSON files are tracked, contradicting the rule's own stated intent**

- **Where:** `.gitignore:119-120` · `docs/operations/generated/route-boundary-findings.json` · `docs/operations/generated/route-coverage-findings.json` · `docs/operations/generated/route-dead-candidate-findings.json` · `docs/operations/generated/route-duplicate-findings.json` · `docs/operations/generated/route-stale-link-findings.json`
- **Why it matters:** If the comment is accurate, these files are meant to be ephemeral CI output — but they're checked into history and stay tracked, so they don't actually get regenerated fresh each run; they sit as a permanently-committed snapshot that only updates when someone remembers to `git add` the exact same paths again, silently going stale relative to whatever job the comment claims produces them.
- **Evidence:** Line 119 comment: `# Ops audit outputs (regenerated by CI/scripts)`, line 120: `docs/operations/generated/`. `git check-ignore -v --no-index` resolves all 5 tracked JSON files under that path to `.gitignore:120:docs/operations/generated/`.
- **Fix:** `git rm --cached docs/operations/generated/*.json` if they're truly scratch output, or remove the ignore rule/comment if this particular audit snapshot is meant to be a durable, versioned record.
- **Verifier (CONFIRMED):** Verified and found stronger evidence than cited. .gitignore:119-120 confirmed as quoted; `git check-ignore -v --no-index` on all 5 JSON files resolves to `.gitignore:120:docs/operations/generated/`. Went further: nothing in the repo actually regenerates these files. `scripts/check-route-hygiene-p0-p1.mjs` (wired into `.github/workflows/ci.yml`'s `route-hygiene` job, line 466-488) only READS these 5 files and throws if missing — it never writes th…

#### db-live-drift-5 · `LOW` · `CONFIRMED` · `SAFE`

**`.ultracode/**/events.ndjson` and `.ultracode/**/*.log` are dead rules, fully shadowed by the later blanket `.ultracode/` rule — which also silently reverses the documented intent to keep state JSON tracked**

- **Where:** `.gitignore:112-114` · `.gitignore:200-201`
- **Why it matters:** Lines 113-114 can no longer independently match anything — every path they'd catch is already caught by line 201. Worse, line 201 silently revokes the exception line 112 documents ("state JSON may stay tracked"): any new state JSON written under .ultracode/ today is ignored too, contradicting the comment still sitting three lines above the rule that overrides it.
- **Evidence:** Line 112: `# Ultracode append-only logs (machine-specific; state JSON may stay tracked)`, lines 113-114: `.ultracode/**/events.ndjson`, `.ultracode/**/*.log`. Line 200: `# session/tool artifacts (added 2026-08-15)`, line 201: `.ultracode/`. `git check-ignore -v --no-index .ultracode/state.json` (a hypothetical new state file, not a log) resolves to `.gitignore:201:.ultracode/`, not lines 113-114 — the broad later rule fires for everything under the directory.
- **Fix:** Delete the now-dead lines 113-114. If state JSON under .ultracode/ is still meant to be trackable, add an explicit `!.ultracode/**/*.json`-style exception next to line 201, mirroring the `!` exception pattern already used elsewhere in this file.
- **Verifier (CONFIRMED):** Verified exactly as claimed, and confirmed against a real (not just hypothetical) file. `.gitignore` lines 112-114 and 200-201 read as quoted. `git check-ignore -v --no-index` on hypothetical `.ultracode/state.json`, `.ultracode/testdir/events.ndjson`, and `.ultracode/testdir/foo.log` all resolve to `.gitignore:201:.ultracode/`, not lines 113-114, proving those two lines are dead. Additionally found a REAL untracked file in the working tree, `.ul…

#### db-live-drift-6 · `LOW` · `CONFIRMED` · `SAFE`

**`.env.local` / `.env.development.local` / `.env.test.local` / `.env.production.local` are dead weight, fully shadowed by `.env*.local`**

- **Where:** `.gitignore:42-45` · `.gitignore:82`
- **Why it matters:** Purely cosmetic rot — the four explicit lines have had zero independent effect since line 82 was added, but they mislead a future editor into treating them as load-bearing when only line 82 actually is, and duplicate maintenance means a future edit to one form (e.g. adding `.env.staging.local`) might get added to the wrong list.
- **Evidence:** Lines 42-45 individually list `.env.local`, `.env.development.local`, `.env.test.local`, `.env.production.local`. Line 82, `.env*.local`, glob-matches all four (`*` matches any substring including the empty string in gitignore syntax), and no negation rule sits between line 45 and line 82 to un-shadow them.
- **Fix:** Delete lines 42-45 and keep line 82 as the single source of truth for `.env*.local` variants (line 41's bare `.env` stays, since it isn't covered by the `*.local` glob).
- **Verifier (CONFIRMED):** Verified exactly. .gitignore lines 42-45 list the four filenames individually; line 82 is `.env*.local`. `git check-ignore -v --no-index` on all four filenames resolves to `.gitignore:82:.env*.local` in every case, confirming git's last-match-wins semantics make lines 42-45 have zero independent effect. Inspected lines 41-82 directly and confirmed no `!` negation sits between line 45 and line 82 that would change this.

### `package-scripts` — 3 findings

#### package-scripts-1 · `HIGH` · `CONFIRMED` · `DECISION`

**scripts/ is invisible to both hard-gate CI checks (typecheck, lint) even though its scripts run against production**

- **Where:** `tsconfig.json:71` · `package.json:23` · `.github/workflows/playwright.yml:187` · `.github/workflows/playwright.yml:191` · `.github/workflows/baseball-readiness-matrix.yml:58` · `eslint.config.mjs:51`
- **Why it matters:** A type error, an unchecked-null dereference, or a violation of one of the custom `helm/no-unchecked-supabase-error` / `helm/no-empty-collection-on-error` design-system rules introduced anywhere in `scripts/` — including the exact scripts that write to production via `--allow-prod` — passes the required `typecheck` and `lint` jobs (both feed the `all` aggregate branch-protection check) with zero warnings, because neither tool ever opens the file. The only static check scripts/ receives is a single narrow ast-grep security pattern in review-gate.yml (line ~136, `no-admin/scripts/edge`), which catches service-role-key leaks but nothing else — no general type safety, no `noUncheckedIndexedAccess…
- **Evidence:** tsconfig.json:71 `"scripts",` inside `exclude` (so `tsc --noEmit` never opens the 52 `.ts` files under `scripts/`, confirmed via `find scripts -iname '*.ts' | grep -v __tests__ | wc -l` = 52). package.json:23 `"lint": "eslint \"src/**/*.{ts,tsx}\" --max-warnings 0"` — the glob is scoped to `src/` only, so `npm run lint` never touches `scripts/` either. Yet `.github/workflows/playwright.yml:187` runs `npm run seed:baseball:e2e -- --confirm --allow-prod` and line 191 runs `npm run seed:baseball:ci -- --allow-prod` (both are `tsx scripts/seed-baseball-*.ts` per package.json), and `.github/workflows/baseball-readiness-matrix.yml:58` runs `npm run check:readiness-matrix` (`tsx scripts/baseball/ch…
- **Fix:** Add a scripts-scoped type-check step (e.g. `tsc --noEmit -p tsconfig.scripts.json` with its own narrower tsconfig, or simply drop `"scripts"` from tsconfig.json's `exclude` and fix whatever surfaces) and widen the lint invocation to include scripts, e.g. `eslint "src/**/*.{ts,tsx}" "scripts/**/*.{ts,mjs,cjs}"` — or, if the exclusion is intentional, document it the way vitest.config.ts documents the `rls` project's zero-file match, and gate the prod-touching seed scripts behind a step that actual…
- **Verifier (CONFIRMED):** Core mechanism verified exactly as claimed: tsconfig.json:71 excludes "scripts" (repo-wide `include` is **/*.ts(x), so `tsc --noEmit` never opens the 52 scripts/*.ts files, confirmed via `find scripts -iname '*.ts' | grep -v __tests__ | wc -l` = 52); package.json:23 `lint` runs `eslint "src/**/*.{ts,tsx}"` — scoped to src only. I went further than the original evidence and it holds up stronger, not weaker: the four `lint-ratchet` job steps (ci.ym…

#### package-scripts-2 · `MEDIUM` · `UNVERIFIED` · `DECISION`

**tsconfig's global `types: ["vitest/globals"]` disables tsc's only defense against a stray test-API call leaking into production code**

- **Where:** `tsconfig.json:11` · `eslint.config.mjs (tseslint.configs.recommended)` · `node_modules/@typescript-eslint/eslint-plugin/dist/configs/eslint-recommended-raw.js:36`
- **Why it matters:** A stray, accidentally-committed call to a vitest global (e.g. a copy-pasted `expect(...)` or `vi.fn()` left in a component or server action) type-checks cleanly under `tsc --noEmit` AND lints cleanly under `eslint` (which has explicitly delegated that exact check to tsc) because the global is ambiently declared project-wide. It only fails at runtime — a `ReferenceError` in production, since `vitest` is a devDependency never bundled into the Next.js client or server output — after both hard CI gates have already passed it.
- **Evidence:** tsconfig.json:11 sets `"types": ["vitest/globals"]` at the top-level `compilerOptions` with no per-file scoping (there is no second tsconfig for tests) — so `include`'s repo-wide `**/*.ts`/`**/*.tsx` glob means EVERY file tsc opens, application code included, gets `describe`/`it`/`expect`/`vi`/`beforeEach`/etc. declared as ambient globals (verified: `node_modules/vitest/globals.d.ts` declares them via `declare global { let expect: ...; let vi: ...; }`, with nothing scoping the declaration to `*.test.ts`). Separately, `node_modules/@typescript-eslint/eslint-plugin/dist/configs/eslint-recommended-raw.js:36` shows typescript-eslint's recommended config (which eslint.config.mjs spreads in) expli…
- **Fix:** Scope vitest's globals to test files only: drop `vitest/globals` from the root `types` array and instead reference it only where tests live (e.g. a `src/test/vitest-globals.d.ts` triple-slash reference, or per-file via vitest.config.ts's own type resolution / `/// <reference types="vitest/globals" />` in the setup file), or add a dedicated `tsconfig.test.json` that extends the root config and adds `types: ["vitest/globals"]` only for `*.test.ts(x)`.

#### package-scripts-3 · `LOW` · `CONFIRMED` · `SAFE`

**supabase/functions/ (Deno edge functions) has no type-check gate at all, only an unrelated tsconfig exclusion**

- **Where:** `tsconfig.json:72` · `.github/workflows/review-gate.yml:128` · `supabase/functions`
- **Why it matters:** A type error in an edge function (wrong Deno API signature, bad payload shape sent to APNs/FCM) is caught by nothing before merge — not `tsc` (excluded), not ESLint (glob-scoped to `src/`), not any Deno-native check. It would only surface when the function is invoked in production (a push notification silently failing to send, for example).
- **Evidence:** tsconfig.json:72 excludes `"supabase/functions"` — correct, since those 3 functions (`send-apns-push`, `send-fcm-push`, `personalize-email`) run on Deno and there is no `deno.json`/import map in the directory (`find supabase/functions -iname 'deno.json*'` returned nothing) so they aren't even resolvable under the Node/`bundler` moduleResolution the root tsconfig uses. But no compensating check exists anywhere else in CI: `.github/workflows/review-gate.yml:128` only runs one ast-grep security pattern (`'^supabase/functions/.*\.ts$' '' 'supabase/functions/**'`) against changed files there; grepping every workflow for `deno` turns up nothing.
- **Fix:** Add a `deno check supabase/functions/**/*.ts` (or `deno lint`) step to review-gate.yml or ci.yml scoped to changed files under `supabase/functions/`, mirroring the pattern already used for shell/SQL/Python in that same workflow.
- **Verifier (CONFIRMED):** Verified directly: tsconfig.json:72 excludes "supabase/functions"; the directory holds exactly the 3 named functions (`send-apns-push`, `send-fcm-push`, `personalize-email`, confirmed via `find supabase/functions -maxdepth 2`) with no deno.json/import map anywhere in the repo (`find . -iname 'deno.json*'` returns nothing) and no `deno` reference in any GitHub Actions workflow or `.circleci/config.yml` (both greps empty). review-gate.yml:126-128 c…

### `build-config` — 3 findings

#### build-config-1 · `HIGH` · `CONFIRMED` · `DECISION`

**/db-audit command's mandatory skill file does not exist anywhere in the repo**

- **Where:** `.claude/commands/db-audit.md:20` · `.claude/commands/db-audit.md:29`
- **Why it matters:** Any invocation of `/db-audit` (the documented full or targeted GolfHelm database audit workflow) fails at instruction step 1: there is no skill file, methodology, or reference material to read. An agent following the command either halts immediately or improvises an audit procedure with no grounding in the '7 agents, 2 waves' workflow the command's own examples describe, defeating the command's purpose.
- **Evidence:** db-audit.md:20: '1. **Read the skill file** at `.skills/skills/golfhelm-db-engineer/SKILL.md`'; db-audit.md:29: '## Reference Files (in `.skills/skills/golfhelm-db-engineer/references/`)'. A full-repo search confirms the path is fictional: `find . -iname "*golfhelm-db-engineer*" -not -path "./node_modules/*" -not -path "./.git/*"` returns nothing, and `/bin/ls .claude/skills/` lists only six real skills (feature-finisher, finish-task, golfhelm-creative-engine, modern-saas-ui, pencil-golfhelm, pproenca-dot-skills-framer-motion) — 'golfhelm-db-engineer' is not among them, and there is no `.skills/skills/` directory tree at all (`.claude/skills/` is the real location). `/db-audit` is also a liv…
- **Fix:** Either restore `.claude/skills/golfhelm-db-engineer/SKILL.md` (and its `references/` directory) from history if it was deleted or moved, or rewrite `.claude/commands/db-audit.md` to point at wherever the real audit methodology now lives (or delete the command if the workflow was intentionally retired). This is a judgment call between restoring vs. redirecting vs. removing — not a safe blind auto-fix.
- **Verifier (CONFIRMED):** Read .claude/commands/db-audit.md directly: line 20 says 'Read the skill file at `.skills/skills/golfhelm-db-engineer/SKILL.md`' and line 29 references `.skills/skills/golfhelm-db-engineer/references/`. A `.skills/skills/` directory does genuinely exist in this repo (unlike a totally fictional path), but `find ./.skills -maxdepth 4` shows it contains only one subdirectory: `golfhelm-creative-engine` (with its own tools/ subfolder). `golfhelm-db-e…

#### build-config-2 · `HIGH` · `CONFIRMED` · `DECISION`

**/complete and /status commands point at docs/FEATURE_CHECKLIST.md, which was archived months ago**

- **Where:** `.claude/commands/complete.md:3` · `.claude/commands/complete.md:11` · `.claude/commands/status.md:3`
- **Why it matters:** `/complete <feature-id>` and `/status` both open a file that no longer exists at the documented location; they either fail outright or, if an agent guesses and opens the archived copy instead, silently mutate a 2026-01 snapshot that is no longer the tracked feature list — producing a checklist edit or status report that reflects nothing about the current state of the product.
- **Evidence:** complete.md:3: 'Mark the specified feature as complete in `docs/FEATURE_CHECKLIST.md`.'; complete.md:11: '- Open `docs/FEATURE_CHECKLIST.md`'; status.md:3: 'Read `docs/FEATURE_CHECKLIST.md` and provide a comprehensive status report with:'. The file is not at that path: `ls docs/FEATURE_CHECKLIST.md` returns 'No such file or directory'. A repo-wide search finds it was relocated: `find . -iname "*FEATURE_CHECKLIST*"` returns only `./docs/archive/2026-01/features/FEATURE_CHECKLIST.md`. Both commands are live/invokable — 'complete: Mark Feature Complete' and 'status: Project Status Report' appear in this session's own available-skills listing.
- **Fix:** Decide and apply one of: (a) update both commands to `docs/archive/2026-01/features/FEATURE_CHECKLIST.md` if that archived file is still the intended source of truth, or (b) repoint them at whatever now tracks feature completion (e.g. `memory/registry.yml` / `memory/context/golfhelm-features.md`) if the checklist was superseded, or (c) delete both commands if feature tracking moved elsewhere entirely. This is a content decision, not a mechanical path swap.
- **Verifier (CONFIRMED):** Read both command files directly. complete.md:3 says 'Mark the specified feature as complete in `docs/FEATURE_CHECKLIST.md`' and line 11 says 'Open `docs/FEATURE_CHECKLIST.md`'; status.md:3 says 'Read `docs/FEATURE_CHECKLIST.md` and provide a comprehensive status report'. `ls docs/FEATURE_CHECKLIST.md` returns 'No such file or directory'. `find . -iname '*FEATURE_CHECKLIST*'` (excluding node_modules/.git) finds exactly one hit: `./docs/archive/20…

#### build-config-3 · `HIGH` · `UNVERIFIED` · `DECISION`

**tools/ux-flow-auditor/CLAUDE.md fabricates the tech stack and omits all four of root CLAUDE.md's CRITICAL RULES, in the exact directory an automated agent is launched from**

- **Where:** `tools/ux-flow-auditor/CLAUDE.md:117-123` · `tools/ux-flow-auditor/CLAUDE.md:74` · `docs/CODEBASE_MAP.md:555`
- **Why it matters:** An agent picking up a HelmDev-dispatched task with this file as its operative instructions has no warning about sport-prefixed table names, the correct types import path, or auth-check requirements, and is actively pointed at a form-handling pattern (react-hook-form + zodResolver) that would fail to import in this codebase, wasting a turn or producing broken code before the mismatch is noticed.
- **Evidence:** tools/ux-flow-auditor/CLAUDE.md:117-123 states as a 'Common Pattern in This Codebase': 'Uses React Hook Form + Zod: ```tsx const { register, handleSubmit } = useForm({ resolver: zodResolver(schema), }) ```'. `react-hook-form` is not a dependency: `grep -n "react-hook-form" package.json package-lock.json` returns zero matches in both files — the package isn't installed, so this pattern cannot exist in the codebase. This directly violates the same file's own rule 1 at line 74: '**Never hallucinate** - Only reference code that actually exists'. The file also never mentions any of root CLAUDE.md's four CRITICAL RULES (import types only from `@/lib/types`, correct server-vs-client Supabase client…
- **Fix:** Rewrite tools/ux-flow-auditor/CLAUDE.md to either (a) explicitly defer to the root CLAUDE.md for all product/stack rules and only document HelmDev's own task-file protocol, or (b) correct its stack claims (drop the react-hook-form snippet, verify the shadcn/ui and `types/` directory claims against current code) and add the four critical rules. Which approach is right depends on whether this file is meant to be a standalone stack reference or a thin protocol doc, so leave the choice to a maintain…

### `ci-workflows` — 7 findings

#### ci-workflows-1 · `HIGH` · `CONFIRMED` · `DECISION`

**Required check "all" is genuinely ambiguous between ci.yml and review-gate.yml**

- **Where:** `.github/workflows/ci.yml:652-653` · `.github/workflows/review-gate.yml:410-411` · `.github/branch-protection.md:14-30`
- **Why it matters:** GitHub branch protection stores the required context as the bare string `all`, which cannot distinguish `ci.yml`'s hard test/type/RLS/auth-smoke aggregate from `review-gate.yml`'s lint/secret-scan aggregate. branch-protection.md documents a concrete failure mode from this exact ambiguity: on PR #1125 a check-runs query returned `all -> success` while the `BaseballHelm authenticated smoke` job that CI's `all` `needs` was still `in_progress` -- the green was Review Gate's `all`, not CI's, and the smoke then failed. The doc states this is "very likely how a PR with failing Unit tests merged on 2026-07-29." The file-level collision (only one in the whole repo) is confirmed as of this session; th…
- **Evidence:** ci.yml:652-653 = ` all:\n name: all`; review-gate.yml:410-411 = ` all:\n name: all`. Ran `for f in .github/workflows/*.yml; do awk job-name extractor; done | sort | uniq -c | sort -rn | awk '$1>1'` across all 12 workflow files' job-level `name:` fields -> only one collision printed: `2 all`. branch-protection.md:14-16 quotes its own prior live check: `gh api repos/njrini99-code/helmv3/branches/main/protection -q '.required_status_checks | {strict, contexts}'` => `{"strict": true, "contexts": ["CodeQL", "all", "Smoke checks"]}`, dated "verified live 2026-07-30" -- 19 days stale relative to today (2026-08-18); I could not re-run that gh api call myself because .config/gh/hosts.yml is on this s…
- **Fix:** In one atomic change: rename one job (e.g. ci.yml's `all` -> a distinctly-named aggregate) AND update branch protection's required_status_checks to the new name (or move to GitHub's fully-qualified `<workflow> / <job>` check-run names) at the same time. Do not split this across two changes -- branch-protection.md itself warns that renaming alone leaves protection waiting forever for a context named `all` that no longer exists, which blocks every PR.
- **Verifier (CONFIRMED):** Personally verified: ci.yml:652-653 and review-gate.yml:410-411 both declare `all:\n name: all`. A repo-wide job-name collision scan (`for f in .github/workflows/*.yml; do awk ...; done | sort | uniq -c`) across all 12 workflow files turns up exactly one collision — 2x `all` — matching the claim's stated methodology output exactly. branch-protection.md:10-30 and docs/CI_RUNBOOK.md:12-65 (the latter freshly updated TODAY, 2026-08-18, same day as t…

#### ci-workflows-2 · `HIGH` · `CONFIRMED` · `SAFE`

**No PR-time required check invokes Playwright at all; the one advisory browser check that does cannot fail**

- **Where:** `.github/workflows/playwright.yml:69-90` · `.github/branch-protection.md:58-60` · `.github/workflows/pr-smoke.yml:118-127`
- **Why it matters:** A PR can merge with zero browser-level verification of any kind blocking it: the required "Smoke checks" job is a build-only smoke test despite living in a workflow named "Playwright E2E" and being the workflow's sole required check; the real E2E suite (`Playwright (chromium)`) never runs on PRs (push/dispatch-only, and advisory even when it does run); and the one PR-time step that does execute a Playwright spec has `continue-on-error: true` on its only assertion, so it cannot turn the job -- or the PR -- red even on a genuine accessibility regression.
- **Evidence:** playwright.yml:69-90, the `smoke` job (`name: Smoke checks`, the only required check this workflow emits per branch-protection.md:58 `Playwright E2E / Smoke checks`): its 4 steps are Checkout, Setup Node, `npm ci`, and `npm run build` -- zero `playwright test` invocations anywhere in the job. branch-protection.md:58-60 itself: "hard smoke build check ... (`npm ci` + `next build`). The full `Playwright (chromium)` suite runs on `main` pushes and manual `workflow_dispatch` only and remains advisory." pr-smoke.yml:118-124, the one PR-triggered job that does run a real browser assertion (`e2e/accessibility.spec.ts`): `- name: Run public accessibility smoke\n continue-on-error: true\n ...\n run: …
- **Fix:** Either fold a small, fast, real Playwright smoke spec into the required `smoke` job so "Smoke checks" earns its name, or rename the job to something that doesn't imply browser coverage (e.g. "Build check") so reviewers stop reading a green "Smoke checks" as evidence the UI was exercised.
- **Verifier (CONFIRMED):** Personally verified all three file citations. playwright.yml:69-90 `smoke` job (the sole required check this workflow emits, `if: push || pull_request`) runs only Checkout/Setup Node/npm ci/npm run build — zero `playwright test` invocations. pr-smoke.yml:121-124's accessibility step does carry `continue-on-error: true` on its assertion, exactly as quoted. docs/CI_RUNBOOK.md (updated today) independently states in its own required-checks table: `S…

#### ci-workflows-3 · `LOW` · `CONFIRMED` · `SAFE`

**CircleCI lighthouse-preview cannot reach a real Vercel preview and its own wrapper treats that as a silent green skip**

- **Where:** `vercel.json:7-10` · `.circleci/scripts/wait-for-vercel-preview.sh:38,80-83` · `.circleci/config.yml:307-323`
- **Why it matters:** Because `deploymentEnabled.*` is false for every ref, no push (including this job's own trigger) will ever produce a Vercel deployment for that commit SHA, so the script's `SEEN_DEPLOYMENT` stays 0 and it deterministically hits the ~120s grace-timeout path on every run -- which the wrapper script is coded to treat as a graceful, GREEN skip, not a failure. The advisory `ci/circleci: lighthouse-preview` check has therefore likely been reporting success while performing zero real Lighthouse assertions on every run since 2026-07-08, which is a monitoring blind spot (looks healthy, provides no signal) rather than a visible one. Caveat: this directly conflicts with a standing team note characteriz…
- **Evidence:** vercel.json:7-10: `"git": { "deploymentEnabled": { "*": false } }` -- CLAUDE.md dates this to 2026-07-08 and states it applies to every branch, not just main. wait-for-vercel-preview.sh:80-83: when no deployment for the commit SHA has ever been seen after `NO_DEPLOYMENT_GRACE_S` (default 120s), it prints `"No Vercel deployment found for SHA ${CIRCLE_SHA1:0:7} after ${ELAPSED}s -- skipping Lighthouse preview."` and `exit 2`. config.yml's `lighthouse-preview` job wraps that call and its `elif` branch matches exactly that string (`grep -Eq "(Timeout after|is not configured|No Vercel deployment found|...)"`), then does `echo "Vercel preview was unavailable; skipping advisory Lighthouse run."` an…
- **Fix:** Either retire the `lighthouse` CircleCI workflow entirely (there is nothing for it to poll for while deploys are globally disabled) or replace the Vercel-preview dependency with an explicit `vercel deploy` step inside the job itself so there is a real target to run Lighthouse against.
- **Verifier (CONFIRMED):** Personally verified vercel.json:7-10 (`deploymentEnabled: {"*": false}`, no branch overrides), wait-for-vercel-preview.sh's grace-timeout exit-2 path, and config.yml's lighthouse-preview job wrapper whose regex (`Timeout after|is not configured|No Vercel deployment found|...`) matches that exact exit-2 message and sets LIGHTHOUSE_PREVIEW_READY=false, which the next step turns into an `exit 0` — all quoted correctly. Grepped every workflow/config …

#### ci-workflows-4 · `MEDIUM` · `CONFIRMED` · `SAFE`

**coderabbit-issue-enrichment.yml still runs live automation for an integration the repo says was dropped**

- **Where:** `.github/workflows/coderabbit-issue-enrichment.yml:1-33` · `.coderabbit.yaml:1-7` · `.claude/rules/code-review-tooling.md:1-7`
- **Why it matters:** Every issue opened, reopened, or edited on the repo still triggers a live Actions run that writes a `plan-me` label onto it, on the premise that a still-installed CodeRabbit App will consume that label to auto-generate an issue plan -- a feature killed alongside the rest of the integration that the founder-decision note attributes specifically to credit-quota cost. Since the App itself is documented as still installed pending an owner uninstall, this workflow is either (a) mislabeling every issue for a consumer that no longer acts on it, or (b) still spending against the exact credit quota the integration was dropped to stop paying -- and nothing in the repo currently distinguishes which.
- **Evidence:** coderabbit-issue-enrichment.yml triggers on `issues: types: [opened, reopened, edited]` and, unless the issue carries `no-plan`/`wip`, runs `gh label create plan-me ... --description "Trigger CodeRabbit automatic issue planning"` then `gh issue edit ... --add-label plan-me`. .coderabbit.yaml:1-6: "CodeRabbit DISABLED (2026-07-20, founder decision) -- auto-reviews and the pre-merge gate are off ... Full removal = uninstall the CodeRabbit GitHub App (repo Settings -> Integrations), which requires the owner." code-review-tooling.md: "the external AI reviewers (CodeRabbit, Greptile) were DROPPED by founder decision -- CodeRabbit's credit quota had become the slowest step in shipping ... The GitH…
- **Fix:** Delete or disable `.github/workflows/coderabbit-issue-enrichment.yml` in the same pass that completes the CodeRabbit removal, and follow through on the owner-only GitHub App uninstall already noted in code-review-tooling.md.
- **Verifier (CONFIRMED):** Personally verified the full 33-line workflow file: triggers on issues opened/reopened/edited, and unless labeled no-plan/wip, runs `gh label create plan-me --description "Trigger CodeRabbit automatic issue planning"` then `gh issue edit --add-label plan-me` — quoted exactly. .coderabbit.yaml:1-7 and .claude/rules/code-review-tooling.md both state CodeRabbit was dropped 2026-07-20 and that the GitHub App itself still needs an owner uninstall. `gi…

#### ci-workflows-5 · `MEDIUM` · `CONFIRMED` · `SAFE`

**CircleCI's entire weekly quality/security sweep depends on a dashboard-only trigger with zero in-repo evidence it exists**

- **Where:** `.circleci/config.yml:20-24,386-401` · `.circleci/README.md:29-35,59`
- **Why it matters:** knip (dead-code detection), full-repo sqlfluff, Squawk migration-safety scanning, npm audit, Stryker mutation testing on the CoachHelm V2 engine, and Promptfoo evals -- the repo's entire weekly quality/security sweep -- fire only if a CircleCI dashboard Scheduled Pipeline was configured with `run-weekly=true` and is still active. That configuration has no representation in version control, so nothing in the repo can prove it was ever set up, or that it wasn't since disabled/misconfigured; if it wasn't, all six jobs simply never run, indefinitely, with no signal anywhere in this codebase that they've stopped.
- **Evidence:** config.yml:20-24: `run-weekly:\n type: boolean\n default: false`. config.yml:390 (`weekly:` workflow): `when: << pipeline.parameters.run-weekly >>` gating all 6 jobs: knip, sqlfluff-full, squawk-migrations, npm-audit, stryker-coachhelm, promptfoo-evals. README.md:29-35: "3. Project settings -> Triggers (Scheduled Pipelines) ... Pipeline parameters: set `run-weekly` = `true`" -- a manual, dashboard-only setup step. `grep -rn "run-weekly"` across every `.yml/.sh/.md/.mjs/.ts` in the repo returns only the config.yml definition/usage and doc mentions of it -- no script, workflow, webhook, or CI config anywhere in version control sets this parameter.
- **Fix:** Confirm directly in the CircleCI dashboard (Project Settings -> Triggers) that a Scheduled Pipeline exists with `run-weekly=true` and has a recent successful trigger history. Consider migrating to CircleCI's native `schedule:` workflow trigger, which is expressed in config.yml itself and would make this verifiable from the repo going forward.
- **Verifier (CONFIRMED):** Personally verified config.yml:21-24 (`run-weekly: type: boolean, default: false`) and the `weekly:` workflow (lines 389-397) gated by `when: << pipeline.parameters.run-weekly >>` on all six named jobs (knip, sqlfluff-full, squawk-migrations, npm-audit, stryker-coachhelm, promptfoo-evals). A repo-wide grep for `run-weekly` across every yml/yaml/md/mjs/ts/sh file returns only config.yml's own definition/usage plus three doc mentions (code-review-t…

#### ci-workflows-6 · `LOW` · `CONFIRMED` · `SAFE`

**ios-compile's own comment claims path-based PR triggering that the config does not implement**

- **Where:** `.circleci/config.yml:399-412`
- **Why it matters:** A PR on a normally-named feature branch (e.g. `fix/ios-crash`, `feat/capacitor-bump`) that touches `ios/**`, `capacitor.config.ts`, or a Capacitor plugin in `package.json` gets zero iOS compile verification, silently, because its branch name matches none of the five patterns -- exactly contradicting what the job's own comment says should trigger it. This is the identical class of hole the adjacent `android-compile` job's own comment (lines further down) says was added specifically to close: "A PR could add or break the entire Android platform and every check would stay green."
- **Evidence:** config.yml:399-401: "# iOS compile verification -- runs on every PR that touches ios/**,\n # capacitor.config.ts, or any Capacitor plugin in package.json, plus\n # on every push to main." The actual job trigger, lines 408-412: `filters:\n branches:\n only:\n - main\n - /release\\/.*/\n - /ios\\/.*/\n - /capacitor\\/.*/\n - /agent\\/fix-circleci-ios-.*/` -- branch-name matching only. `grep -n "paths"` over the whole file returns no matches, and the `orbs:` block declares only `circleci/node@5.2.0` -- no path-filtering orb is present, so CircleCI has no mechanism configured here to gate on changed files at all.
- **Fix:** Either add real path-based gating (CircleCI `path-filtering` orb + dynamic config, evaluated at pipeline-continuation time) so the comment's claim becomes true, or correct the comment to state plainly that iOS verification is branch-name-gated only, so nobody relies on the false path-based claim when naming a branch.
- **Verifier (CONFIRMED):** Personally verified config.yml:399-412: the comment reads 'iOS compile verification -- runs on every PR that touches ios/**, capacitor.config.ts, or any Capacitor plugin in package.json, plus on every push to main,' but the actual `filters.branches.only` list (main, release/*, ios/*, capacitor/*, agent/fix-circleci-ios-*) is branch-name matching only — confirmed no `paths:` key exists anywhere in the file and the `orbs:` block declares only `circ…

#### ci-workflows-7 · `LOW` · `CONFIRMED` · `SAFE`

**review-gate.yml's env-secrets job runs on stale action pins that a same-day Dependabot bump skipped**

- **Where:** `.github/workflows/review-gate.yml:400,404` · `.github/workflows/visual-audit.yml:103`
- **Why it matters:** review-gate.yml is the repo's dedicated security/lint gate, and its newest job (env-secrets, itself a secret-hygiene check) is one full major version behind on setup-node and one patch behind on checkout relative to every other job in the file, because it was added in the ~2-hour window between a Dependabot scan and its own PR's merge and never got swept up. Low functional risk today (both pins resolve to legitimate, signed upstream releases; no CVE evidence was gathered against either), but it will keep drifting: the next grouped Dependabot bump has no reason to notice this outlier unless something changes its detection. The `# v4` comment on visual-audit.yml's upload-artifact pin is purely…
- **Evidence:** review-gate.yml:400: `actions/checkout@9c091bb21b7c1c1d1991bb908d89e4e9dddfe3e0` (confirmed via GitHub API: tag `v7.0.0`). Line 404: `actions/setup-node@48b55a011bda9f5d6aeb4c2d9c7362e8dae4041e` (confirmed: tag `v6.4.0`). Every other checkout/setup-node reference in every one of the 12 workflow files uses `3d3c42e5aac5ba805825da76410c181273ba90b1` (v7.0.1) / `820762786026740c76f36085b0efc47a31fe5020` (v7.0.0). `git log --format="%h %ad %s" --date=iso` shows the `env-secrets` job was added in `2a95fca00` at 2026-08-02 16:59:33, and `git show 8c59b579d` (a Dependabot group bump titled "bump the github-actions group with 8 updates," landed 2026-08-02 18:43:43, 104 minutes later) bumped `actions…
- **Fix:** Bump review-gate.yml:400 to `actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1` and line 404 to `actions/setup-node@820762786026740c76f36085b0efc47a31fe5020` to match every other job in the repo; correct visual-audit.yml:103's trailing comment from `# v4` to `# v7.0.1`.
- **Verifier (CONFIRMED):** Fully verified end to end. review-gate.yml:400/404 pins actions/checkout@9c091bb2... and actions/setup-node@48b55a01...; a repo-wide grep confirms these are the ONLY occurrences of those SHAs anywhere (checkout: 38 refs use 3d3c42e5... vs. this 1 outlier; setup-node: 23 refs use 820762... vs. this 1 outlier). Resolved all four SHAs against GitHub's live tag refs via the GitHub API (an allowed host): 9c091bb2...=v7.0.0 (stale), 3d3c42e5...=v7.0.1 …

### `claude-config` — 3 findings

#### claude-config-1 · `HIGH` · `CONFIRMED` · `DECISION`

**Table crm_email_templates_backup_20260720 exists in prod and in generated types, but no migration creates it**

- **Where:** `src/lib/types/database.ts:9390 (crm_email_templates_backup_20260720: {)` · `supabase/migrations/20260721002502_harden_crm_template_backup.sql:1-12 (only file that mentions the table)`
- **Why it matters:** The table was created directly against production (a manual pg_dump-side or ad-hoc backup) and was never captured as a CREATE TABLE in migration history. Replaying supabase/migrations/** against a fresh database (CI's shadow-DB reset, or disaster recovery) produces a database that is missing this table entirely, so 20260721002502's `to_regclass(...) is not null` guard silently no-ops there and the RLS/grant hardening it applies is never exercised by CI. The gap between 'what migrations build' and 'what prod actually has' is exactly the drift this file exists to prevent for other objects (see the graveyard-schema migrations elsewhere in the repo, which are careful to move — not silently orpha…
- **Evidence:** supabase/migrations/20260721002502_harden_crm_template_backup.sql line 1-4: "A production-side backup created on 2026-07-20 inherited the API roles' default table grants. It is operational backup data, not an application surface: deny both API roles and enable RLS with no policies." Line 7: `if to_regclass('public.crm_email_templates_backup_20260720') is not null then`. `grep -riE 'CREATE TABLE( IF NOT EXISTS)? ("?public"?\.)?"?crm_email_templates_backup_20260720' supabase/migrations/*.sql` returns zero matches across all 300 migration files. Live production query `select table_schema,table_name from information_schema.tables where table_name='crm_email_templates_backup_20260720'` (via mcp__…
- **Fix:** Add a migration that does `CREATE TABLE IF NOT EXISTS public.crm_email_templates_backup_20260720 (...)` matching the live schema (13 columns per information_schema.columns), so a fresh replay produces the same object prod has, then let 20260721002502's existing guard harden it as today. Alternatively, if the backup is no longer needed, drop it in prod and add a migration recording the drop.
- **Verifier (CONFIRMED):** Independently reproduced every part of this claim. grep across all 300+ migration files for a CREATE TABLE of this name returns zero matches; the only file mentioning the table (supabase/migrations/20260721002502_harden_crm_template_backup.sql) is a guarded ALTER (`if to_regclass(...) is not null then revoke/enable rls`). Live query against the production Supabase project (`select table_schema,table_name,table_type from information_schema.tables …

#### claude-config-2 · `HIGH` · `CONFIRMED` · `DECISION`

**View v_crm_coaches_by_school exists in prod and in generated types, but no migration creates it**

- **Where:** `src/lib/types/database.ts:20180 (v_crm_coaches_by_school: {)` · `supabase/migrations/20260623131038_harden_crm_view_and_recruit_doc_functions.sql:13,15 (only file that references the vi…`
- **Why it matters:** Same class of drift as the backup-table finding, for a security-relevant object: this view was hardened with `security_invoker = true` (a Supabase-advisor security fix for definer-view privilege leakage) by a migration that only fires if the view already exists. On a fresh replay (CI shadow DB, disaster recovery, a new environment) the view is never created, so the security-invoker hardening silently no-ops and the resulting database lacks a view that live code may query.
- **Evidence:** supabase/migrations/20260623131038_harden_crm_view_and_recruit_doc_functions.sql line 13: `select 1 from pg_views where schemaname = 'public' and viewname = 'v_crm_coaches_by_school'`; line 15: `execute 'alter view public.v_crm_coaches_by_school set (security_invoker = true)';` — an ALTER guarded by existence check, never a CREATE. `grep -rn v_crm_coaches_by_school supabase/migrations/*.sql` returns only these two lines in the whole repo. Live query `select table_name, table_type from information_schema.tables where table_name='v_crm_coaches_by_school'` returns `{"table_name":"v_crm_coaches_by_school","table_type":"VIEW"}` — confirmed live in prod.
- **Fix:** Add a migration with the view's actual `CREATE VIEW public.v_crm_coaches_by_school AS ...` definition (16 columns per information_schema.columns) ahead of 20260623131038 in timestamp order, so a fresh replay creates and then hardens it exactly as prod has it today.
- **Verifier (CONFIRMED):** The core fact holds and is confirmed by direct query: `information_schema.tables` shows v_crm_coaches_by_school as a VIEW in public, and grep across every migration file finds it referenced only in 20260623131038_harden_crm_view_and_recruit_doc_functions.sql, as a guarded ALTER, never a CREATE. However, one part of the original reasoning needs correction, which strengthens rather than weakens the finding: I checked `supabase_migrations.schema_mig…

#### claude-config-3 · `MEDIUM` · `UNVERIFIED` · `SAFE`

**Migration 20260715141727 (baseball_legacy_backfill_manifest) is self-documented as never applied, and production confirms it — table and manifest ledger do not exist anywhere in prod**

- **Where:** `supabase/migrations/20260715141727_baseball_legacy_stats_backfill.sql:5-6` · `supabase/migrations/20260715141727_baseball_legacy_stats_backfill.sql:214`
- **Why it matters:** This is a large (827-line) one-time data-backfill migration for baseball_player_stats -> box-score tables that is sitting in supabase/migrations/ unapplied, by design, pending manual sign-off documented in docs/baseball/legacy-backfill-runbook.md. It is not a bug in the sense of broken state, but it is exactly the audit pattern requested: database.ts and prod correctly reflect a world where this table does not exist, while the migrations directory contains a CREATE TABLE for it that has never run. Anyone diffing migrations against database.ts without checking apply-status (as this audit does) would misclassify it as either a missed regen or a broken migration; it is neither — it's pending hu…
- **Evidence:** File header, lines 5-6: "STATUS: WRITTEN, NOT APPLIED. This file is committed pending Nick's explicit go-ahead. Do not `apply_migration` this without that sign-off". Line 214: `CREATE TABLE IF NOT EXISTS public.baseball_legacy_backfill_manifest (`. Confirmed two independent ways: (1) `mcp__supabase__list_migrations` against the live project returns 803 applied migration versions and version `20260715141727` is not among them (checked programmatically against the full JSON list). (2) Live query `select table_schema, table_name from information_schema.tables where table_name = 'baseball_legacy_backfill_manifest'` returns an empty result set — the table exists in no schema (not public, not grav…
- **Fix:** No code fix needed. Track this migration's pending status somewhere more durable than a comment (e.g. a checklist in docs/baseball/legacy-backfill-runbook.md or a tracking issue) so it isn't lost, and apply it only with Nick's explicit go-ahead per its own instructions.

### `env-secrets` — 8 findings

#### env-secrets-1 · `HIGH` · `CONFIRMED` · `SAFE`

**helm-website-ui/ is a git-deleted fossil (376M) that docs/REPO_MAP.md, tsconfig.json, and vitest.config.ts still describe as a live second Next.js app**

- **Where:** `helm-website-ui/` · `docs/REPO_MAP.md:113-115` · `tsconfig.json:69` · `vitest.config.ts:77,231,257`
- **Why it matters:** An agent reading the repo's own canonical cross-cutting-structure doc (which CLAUDE.md explicitly directs it to for 'route trees, canonical idioms') is told a second Next.js app exists at paths that don't exist; the directory itself is 376M of orphaned node_modules with zero source, wasting disk and du/find scans
- **Evidence:** git log shows commit 761bea048 'chore: devibe wave 1 — delete dead root dirs...' removed helm-website-ui/app/page.tsx etc ("a v0.dev scaffold ('my-v0-project')"); `git ls-files helm-website-ui | wc -l` = 0; `find helm-website-ui -maxdepth 1 -type f` shows only .DS_Store, next-env.d.ts, node_modules, tsconfig.tsbuildinfo (no app/ dir); yet docs/REPO_MAP.md:113-115 reads '**helm-website-ui/** is a second, wholly separate Next.js app (helm-website-ui/app/page.tsx, helm-website-ui/app/products/page.tsx)'
- **Fix:** rm -rf helm-website-ui/; remove the helm-website-ui exclude entries from tsconfig.json:69 and vitest.config.ts:77,231,257; delete the helm-website-ui/ paragraph at docs/REPO_MAP.md:113-115
- **Verifier (CONFIRMED):** Personally verified every element: `git ls-files helm-website-ui | wc -l` = 0. `find helm-website-ui -maxdepth 2` shows only .DS_Store, next-env.d.ts, tsconfig.tsbuildinfo, and a stray node_modules/ tree (next, react-redux, victory-vendor, etc.) — no app/ directory exists. `du -sh helm-website-ui` = exactly 376M, matching the claim. `git log --oneline -- helm-website-ui` shows commit 761bea048 (2026-07-15, over a month ago) deleted it. Yet `git s…

#### env-secrets-2 · `MEDIUM` · `CONFIRMED` · `SAFE`

**Screenshot/audit output is scattered across 7 unrelated top-level directories (~1.15G) with no documented canonical location**

- **Where:** `audit/product-audit/` · `docs/qa/` · `docs/ui-audits/` · `.dev-screenshots/` · `frames/` · `.tmp-screenshots/` · `output/`
- **Why it matters:** An agent asked to save a verification/audit screenshot has 7 plausible candidate directories and no rule for which is correct, so new screenshot output keeps landing in an 8th new location instead of consolidating
- **Evidence:** du -sh: audit/product-audit=1.0G (1,268 PNGs, git ls-files audit=0), docs/qa=69M, docs/ui-audits=39M (only 6 of its files tracked), .dev-screenshots=29M, frames=16M, .tmp-screenshots=4.2M, output=6.8M (flagged untracked in this session's own git status). `grep -n screenshot CLAUDE.md` returns zero hits — no canonical location is documented anywhere
- **Fix:** Designate .dev-screenshots/ (already gitignored, largest tracked-adjacent option) as canonical in CLAUDE.md; rm -rf audit/product-audit frames .tmp-screenshots output/playwright (all confirmed untracked, zero git cost) after grep confirming no script references them
- **Verifier (CONFIRMED):** Every number checks out exactly: audit/product-audit=1.0G (1,268 PNGs via `find ... -name '*.png' | wc -l`, 0 git-tracked), docs/qa=69M (128 tracked files), docs/ui-audits=39M (6 tracked), .dev-screenshots=29M (0 tracked, and IS in .gitignore), frames=16M (0 tracked), .tmp-screenshots=4.2M (0 tracked), output=6.8M (0 tracked, confirmed via `git status --porcelain` showing '?? output/' right now). `grep -ni screenshot CLAUDE.md` returns zero hits.…

#### env-secrets-3 · `MEDIUM` · `CONFIRMED` · `SAFE`

**A 67M one-time QA screenshot dump from a stale audit is permanently committed to git via a global gitignore carve-out**

- **Where:** `.gitignore (docs/qa/**/*.png exemption)` · `docs/qa/baseball-fairway-visual-audit-2026-07-04/`
- **Why it matters:** Every clone permanently carries 67M of a finished, stale audit's raw screenshots inside what CLAUDE.md treats as the reference-docs tree, and the blanket exemption means any future docs/qa screenshot dump will also be force-committed
- **Evidence:** 116 files, 67M under docs/qa/baseball-fairway-visual-audit-2026-07-04/, committed 2026-07-09 (git log -1 --format=%ad) for an audit dated 2026-07-04 — six weeks stale as of today 2026-08-18; individual blobs run up to 4.2M each (confirmed via git cat-file --batch-check over git rev-list --objects --all); the exemption '!docs/qa/**/*.png' in .gitignore applies to all future docs/qa content, not just this run
- **Fix:** Move docs/qa/baseball-fairway-visual-audit-2026-07-04/ out of docs/qa into an untracked scratch location or delete it since the audit is complete; scope the gitignore exemption to a specific subpath rather than all of docs/qa/**
- **Verifier (CONFIRMED):** `.gitignore:92` reads exactly `!docs/qa/**/*.png`, a blanket exemption not scoped to one run. docs/qa/baseball-fairway-visual-audit-2026-07-04/ has exactly 116 tracked files totaling 67M. `git log -1 --format=%ad` for that path returns 'Thu Jul 9 23:02:36 2026' — committed for a 2026-07-04-dated audit, six weeks stale as of 2026-08-18. Largest blobs confirmed via git cat-file --batch-check: four files over 4.2M each (4228174, 4228150, 4228117, 42…

#### env-secrets-4 · `MEDIUM` · `CONFIRMED` · `SAFE`

**docs/ (1,432 md files) is 81% archive and its remaining size is mostly screenshot dumps, not reference material**

- **Where:** `docs/archive/ (1,163 tracked md)` · `docs/qa/ (69M)` · `docs/ui-audits/ (39M)`
- **Why it matters:** Directory listings or size scans of docs/ overweight it toward audit-run byproducts rather than the narrative reference material CLAUDE.md points agents to; an agent trying to gauge 'how much real documentation is here' gets a misleading picture from du/find alone
- **Evidence:** find docs -name '*.md' | wc -l = 1432; git ls-files docs/archive | wc -l = 1163 (cleanly dated buckets 2024-12..2026-08); live reference dirs total well under 300 files (docs/audits=42, docs/superpowers=56, docs/operations=35, docs/features=16 tracked files each); the remaining 108M of docs/'s 145M du size is docs/qa (69M) + docs/ui-audits (39M, only 6 of its files git-tracked)
- **Fix:** Leave docs/archive/ as-is (correctly organized); move docs/qa/ and docs/ui-audits/ out of docs/ entirely since they are audit output, not documentation
- **Verifier (CONFIRMED):** `find docs -name '*.md' | wc -l` = 1432 exactly. `git ls-files docs/archive` = 1163 total tracked files (1163/1432 = 81.2%, matching '81%'), though the claim's evidence line says '1,163 tracked md' when actually only 1119 of those are .md and 44 are non-md (sql/json/etc) — a minor evidence imprecision that doesn't change the 81% figure since it's computed off total files, not md-only. `du -sh docs` = 145M; docs/qa (69M) + docs/ui-audits (39M) = 1…

#### env-secrets-5 · `LOW` · `CONFIRMED` · `SAFE`

**Two identically-named 'archive' directories (archive/ and docs/archive/) hold the same kind of content, plus 4 more one-off dated archive fossils at root**

- **Where:** `archive/` · `docs/archive/` · `.full-stack-feature-archived-20260311000014/` · `.full-stack-feature-archived-20260311110415/` · `.full-stack-feature-archived-20260311115559/` · `.full-review-archive-2026-03-07/`
- **Why it matters:** Nothing distinguishes which 'archive' new dead material should go into — an agent archiving something has to guess between two same-named locations, and the 4 dated root fossils are 5-month-stale clutter no rule points to
- **Evidence:** archive/ (top level, tracked, 30 files: misc/, old-reports/, sql-scripts/) including a tracked 10MB binary archive/misc/modern-saas-ui.skill (confirmed via git cat-file --batch-check) that duplicates the live .claude/skills/modern-saas-ui/ skill; docs/archive/ (tracked, 1,163 files, dated buckets); plus four untracked one-off root dirs all dated 2026-03-11/2026-03-07 (git ls-files = 0 for each)
- **Fix:** Consolidate into docs/archive/ (the one with real date-based structure); rm -rf archive/ .full-stack-feature-archived-* .full-review-archive-2026-03-07 after moving anything worth keeping from archive/old-reports into a docs/archive/2026-XX/ bucket; delete the duplicate archive/misc/modern-saas-ui.skill
- **Verifier (CONFIRMED):** archive/ has exactly 30 tracked files across misc/ (9), old-reports/ (10), sql-scripts/ (11) — matches claim. archive/misc/modern-saas-ui.skill confirmed tracked, 10,237,259 bytes (~9.76M, matches '10MB'), and is a zip archive duplicating the live .claude/skills/modern-saas-ui/ (confirmed to exist with SKILL.md + references/). docs/archive/ confirmed 1163 tracked files in cleanly dated buckets 2024-12 through 2026-08 (verified via `/bin/ls docs/a…

#### env-secrets-6 · `LOW` · `CONFIRMED` · `SAFE`

**routes/ collides with the strongest possible meaning of 'routes' in a Next.js App Router project but holds an unrelated wiki-scrape artifact**

- **Where:** `routes/` · `routes/devin-wiki/` · `docs/REPO_MAP.md (route atlas)` · `scripts/ui-intelligence/`
- **Why it matters:** An agent told to 'check the routes' in this Next.js App Router repo has a near-certain false hit at repo root before reaching src/app, the actual routing source of truth
- **Evidence:** routes/ (gitignored, .gitignore:171) contains routes.json, routes.raw.md, and routes/devin-wiki/ — 15 imported external wiki pages (e.g. Statistics-Engine-&-Strokes-Gained.md, CoachHelm-AI-Engine.md) unrelated to Next.js routing; regenerated by scripts/ui-intelligence/generate-atlas.ts and others; the project's actual routes live at src/app/**/page.tsx, documented as the 'resolved route atlas' in docs/REPO_MAP.md
- **Fix:** Rename to something that doesn't overload 'routes', e.g. .ui-intelligence-cache/; update the ~5 references in scripts/ui-intelligence/*.ts (grep -rln 'routes/' scripts/ui-intelligence)
- **Verifier (CONFIRMED):** routes/ confirmed gitignored (.gitignore:171 = '/routes/'), containing routes.json, routes.raw.md, and routes/devin-wiki/ with 41 imported wiki pages (Statistics-Engine-&-Strokes-Gained.md, CoachHelm-AI-Engine.md, etc. all confirmed present) — none related to Next.js routing. The pipeline is real: scripts/ui-intelligence/normalize-devin-routes.ts writes routes/routes.json (confirmed via grep showing `path.join(ROOT, 'routes', 'routes.json')` writ…

#### env-secrets-7 · `LOW` · `CONFIRMED` · `SAFE`

**Loose one-off files are committed at repo root alongside package.json/CLAUDE.md, and the pattern is still active**

- **Where:** `helm-newsletter-march-2026.docx` · `helm-newsletter-march-2026.html` · `.coachhelm-fix-progress.md` · `next-session-md-8-18.md`
- **Why it matters:** Repo-root listings mix marketing collateral and scratch session notes in with actual project config files, and the untracked pattern shows it will keep recurring without a designated home
- **Evidence:** git ls-files confirms helm-newsletter-march-2026.docx, helm-newsletter-march-2026.html, and .coachhelm-fix-progress.md are all tracked at root (176K combined for the newsletter pair); this session's own git status snapshot shows next-session-md-8-18.md (today's date in the filename) sitting untracked at root right now, the same naming pattern repeating
- **Fix:** Move helm-newsletter-march-2026.* into docs/business/ (already exists, thematically matches); move .coachhelm-fix-progress.md and next-session-md-8-18.md into memory/ (the location CLAUDE.md already designates for this kind of running note)
- **Verifier (CONFIRMED):** `git ls-files` confirms all three tracked at root: helm-newsletter-march-2026.docx (144K), helm-newsletter-march-2026.html (32K) — combined exactly 176K as claimed — and .coachhelm-fix-progress.md (8K, tracked). next-session-md-8-18.md confirmed untracked at root right now via `git status --porcelain` ('?? next-session-md-8-18.md'), dated today, 30K. docs/business/ confirmed to exist with thematically matching files (00-business-context.md throug…

#### env-secrets-8 · `LOW` · `CONFIRMED` · `SAFE`

**landing/ is a dead component subtree living outside src/, unimported anywhere**

- **Where:** `landing/components/Hero.tsx` · `landing/components/ScrollProgress.tsx` · `landing/components/FinalCTA.tsx` · `landing/components/MobileNav.tsx` · `landing/components/Navigation.tsx`
- **Why it matters:** An agent asked to edit the landing page looks under src/ first (per convention) and either misses this dead code entirely or edits it and can't understand why changes never appear in the running app
- **Evidence:** git ls-files landing shows 5 tracked files (24K); grep -rn 'landing/components' --include='*.ts' --include='*.tsx' . (excluding landing/ itself) returns zero matches — nothing in src/ imports these components, breaking the file-structure convention that all components live under src/
- **Fix:** Confirm dead with grep -rn 'from.*landing' src/app, then rm -rf landing/ (or move into docs/design/ as reference if marketing wants to keep it, clearly out of the app-code path)
- **Verifier (CONFIRMED):** `git ls-files landing` confirms exactly the 5 named files tracked. `grep -rn 'landing/components' . --exclude landing/ --exclude node_modules` returns zero matches, confirming the claim's specific evidence. Extended checks (relative-path imports, tsconfig/next.config aliases) also found nothing pointing at root landing/. This strengthens the claim's impact scenario: the live app has a completely separate, actively-imported src/components/landing/…

### `autogen-inventory` — 6 findings

#### autogen-inventory-1 · `HIGH` · `UNVERIFIED` · `SAFE`

**golfhelm.md "Hooks (12 golf hooks)" table: 5 of 12 hooks don't exist anywhere in src/hooks; the true golf-scoped total is 17**

- **Where:** `memory/projects/golfhelm.md:207-222` · `src/hooks/**`
- **Why it matters:** Anyone using this table as the golf-hooks reference (CLAUDE.md routes 'routes/actions/file locations' questions to this exact doc) will grep for 5 filenames that don't exist and undercount the real golf-hook surface by at least 5 (17 current golf-scoped hooks vs. 12 claimed). This is the literal '12 hooks' figure the doc's own CLAUDE.md preamble cites as a historical example of rot ('the "75 tables / 41 action files / 12 hooks" numbers ... rotted within weeks') — it is not historical, it is still live in the file today, sitting 500 lines above the AUTOGEN block that was supposed to replace hand-copied counts like it.
- **Evidence:** Line 207: `## Hooks (12 golf hooks)` followed by a table listing `use-golf-messages`, `use-golf-rounds`, `use-golf-team`, `use-team-context`, `use-auto-save-round`, `use-message-attachments`, `use-offline-sync`, `use-qualifier-realtime`, `use-rsvp-realtime`, `use-task-realtime`, `use-connection-status`, `use-service-worker`. `find src/hooks -iname '*golf-rounds*' -o -iname '*golf-team*' -o -iname '*team-context*' -o -iname '*auto-save-round*' -o -iname '*rsvp-realtime*'` returns empty — none of these 5 filenames exist anywhere under src/hooks (48 files total, confirmed against the file's own AUTOGEN:hooks block 500+ lines below, which lists all 48 and matches an independent recount from src/…
- **Fix:** Delete the hand-curated '## Hooks (12 golf hooks)' section (lines 207-222) and replace it with a one-line pointer to the AUTOGEN:hooks block further down (which is accurate — independently reverified: 48 hooks, list matches exactly). `npm run docs:regen` will NOT fix this: regen-docs.mjs only rewrites content between `<!-- AUTOGEN:hooks:start -->` and `:end -->` markers, and this narrative table sits entirely outside them. `npm run docs:check` (package.json line 29: `npm run docs:regen && git di…

#### autogen-inventory-2 · `HIGH` · `UNVERIFIED` · `SAFE`

**golfhelm.md "Server Actions by Role (41 files)" table: 5 of 41 files no longer exist; true golf-scoped total is 114, not 41**

- **Where:** `memory/projects/golfhelm.md:111-172` · `src/app/**/actions/**`
- **Why it matters:** This is the '41 action files' figure CLAUDE.md's own preamble names as an example of rot from an earlier doc version ('the "75 tables / 41 action files / 12 hooks" numbers that appeared in older versions of this doc rotted within weeks'). It rotted again in the file CLAUDE.md is pointing readers to, and was never removed after the AUTOGEN:actions block (509 lines below, 199 files, verified accurate) was introduced to replace exactly this pattern. A reader following CLAUDE.md's routing table to 'find where code lives' gets a 41-file map for a codebase that now has 114 golf action files, with 5 of the 41 pointing at files that don't exist.
- **Evidence:** Line 111: `## Server Actions by Role (41 files)`, followed by three role-grouped tables (Coach-Specific 9 + Player-Specific 6 + Team/Shared 26 = 41, matching the header). Checked each of the 41 filenames against the file's own AUTOGEN:actions list (199 files, independently reverified against `src/app/**/actions/**/*.ts` — exact match): `event-lifecycle.ts`, `availability-polling.ts`, `availability-locking.ts`, `caldav-sync.ts`, and `stats-v2.ts` are absent from the current 199-file corpus under any path. Scoping the AUTOGEN total to golf only (`grep -c '/golf/' <actions list>`) gives 114 golf action files today, not 41.
- **Fix:** Delete the hand-curated 'Server Actions by Role' tables (lines 111-172) or explicitly re-scope/relabel them as a curated illustrative subset (not a full inventory), and point to the AUTOGEN:actions block for the current complete list. Same caveat as the hooks finding: `docs:regen`/`docs:check` cannot detect or fix this — it's outside the AUTOGEN markers by construction.

#### autogen-inventory-3 · `MEDIUM` · `UNVERIFIED` · `SAFE`

**golfhelm-database.md preamble contradicts its own AUTOGEN block 6 lines vs. 1543 lines apart: "3,998 columns" vs. "4002 columns"**

- **Where:** `memory/context/golfhelm-database.md:7` · `memory/context/golfhelm-database.md:1550`
- **Why it matters:** Small in magnitude but a clean example of the exact anti-pattern this audit was asked to find: a hand-typed count sitting in the same file as, and disagreeing with, the generated source of truth it's introducing. The preamble even instructs readers to trust the AUTOGEN block over the narrative ('Do not trust it for column names') but states its own column count in the narrative anyway, so the file is self-contradicting on the one number it explicitly flags as authoritative-elsewhere.
- **Evidence:** Line 7 (hand-written preamble): '...currently 266 tables / 3,998 columns.' Line 1550 (inside the file's own `<!-- AUTOGEN:columns:start -->` block): '**266 tables, 4002 columns** — generated from `src/lib/types/database.ts`...'. Independent recount from `src/lib/types/database.ts` using the same extraction logic as `scripts/regen-docs.mjs` confirms 4002 columns is current and correct; 3,998 is stale by 4 columns.
- **Fix:** Change '3,998 columns' to '4,002 columns' on line 7, or better, drop the hardcoded number from the preamble entirely and say 'see the AUTOGEN:columns block below for the current count' so it can never drift again.

#### autogen-inventory-4 · `HIGH` · `UNVERIFIED` · `SAFE`

**golfhelm-features.md Calendar feature "DB Tables (17 tables)": 10 of the 17 named tables don't exist anywhere in the schema**

- **Where:** `memory/context/golfhelm-features.md:270-271`
- **Why it matters:** This doc is CLAUDE.md's designated first-read for 'any golf feature' work, specifically promising 'tables, dependencies, gaps' per feature. Two of the phantom tables (`golf_availability_polls`, `golf_poll_responses`) belong to the very Polling capability the same feature section already marks as 'not built — no files exist (backlog)' in its own Key Files table two lines above — so the doc contradicts itself within one feature entry, listing tables for a capability it has already documented as unbuilt.
- **Evidence:** Line 270-271: '### DB Tables (17 tables)\ngolf_events, golf_event_attendance, golf_event_exclusions, golf_event_status_log, golf_availability_polls, golf_poll_responses, golf_academic_exclusions, golf_player_availability_blocks, golf_coach_blocked_time, golf_attendance_summary, golf_player_attendance_stats, golf_calendar_feeds, golf_calendar_notifications, golf_calendar_sync_log, golf_calendar_sync_state, golf_external_calendars, golf_recurring_events'. Checked each of the 17 against the full current table list (266 tables) and view list (9 views) extracted from `src/lib/types/database.ts` via the same logic as `regen-docs.mjs`: `golf_event_exclusions`, `golf_event_status_log`, `golf_availab…
- **Fix:** Re-derive the per-feature table list from the tables actually referenced by the feature's action/route files (or hand-verify against the current 266-table list) and drop the 10 non-existent names, updating the '(17 tables)' count to match. This list is entirely outside regen-docs.mjs's scope (it only handles the whole-repo AUTOGEN:tables/routes/actions/hooks blocks, not per-feature curated subsets), so it requires a manual correction.

#### autogen-inventory-5 · `MEDIUM` · `UNVERIFIED` · `SAFE`

**golfhelm-features.md CoachHelm "DB Tables (18 CoachHelm tables)": 5 of the 18 named tables don't exist**

- **Where:** `memory/context/golfhelm-features.md:577-578`
- **Why it matters:** CLAUDE.md routes 'CoachHelm AI' work to this exact section. A reader trying to trace where insight weighting or player-insight preferences are persisted will chase 3 table names (`golf_insight_weights`, `golf_player_insight_preferences`, `golf_insight_feedback`) that don't exist in the live schema, likely landing on the wrong actual tables or concluding data isn't persisted at all.
- **Evidence:** Line 577-578: '### DB Tables (18 CoachHelm tables)\ngolf_coach_philosophy, golf_coachhelm_settings, golf_team_coachhelm_settings, golf_coach_insights, golf_player_focus_areas, golf_round_reviews, golf_review_events, golf_review_insights, golf_patterns_v2, golf_predictions, golf_validations, golf_learned_behavior, golf_insight_generation_log, golf_insight_effectiveness, golf_insight_feedback, golf_insight_weights, golf_prediction_model_performance, golf_player_insight_preferences'. Checked against the current 266-table / 9-view list: `golf_review_insights`, `golf_validations`, `golf_insight_feedback`, `golf_insight_weights`, `golf_player_insight_preferences` — 5 of 18 — appear in neither.
- **Fix:** Manually re-verify this list against the current schema (or against `src/lib/coachhelm/v2/` source referencing these tables) and correct the 5 phantom names; update the '(18 CoachHelm tables)' header to match. Outside regen-docs.mjs's scope — manual fix required.

#### autogen-inventory-6 · `MEDIUM` · `UNVERIFIED` · `SAFE`

**baseballhelm-database.md's "118 present in current database.ts" was accurate when written (2026-06-30) but database.ts now has only 93 baseball_* tables — a 25-table drop the doc never picked up**

- **Where:** `memory/context/baseballhelm-database.md:9-13` · `src/lib/types/database.ts`
- **Why it matters:** Unlike the other findings, this one isn't an authoring error — it's real, undocumented schema churn: 25 baseball_* tables that existed in generated types on 2026-06-30 are gone from database.ts today, and nothing in this doc (still headlined '119'/'118') reflects it. A reader trusting this count for baseball table inventory work will believe 25 more tables exist than actually do. (`baseball_demo_sessions`, called out as 'not yet in generated types' as of 06-30, IS present in current database.ts, so at least one gap the doc flagged has since closed — but the doc doesn't know that either.)
- **Evidence:** Lines 9-11: 'Total `baseball_*` tables confirmed via migrations: **119** (118 present in the current `src/lib/types/database.ts`; `baseball_demo_sessions` — added 2026-06-30 — is not yet in generated types...)'. Re-running the same top-level-key extraction `scripts/regen-docs.mjs` uses (brace-scoped, anchored to the `public` schema) against `git show d325fbcac:src/lib/types/database.ts` — the commit dated exactly 2026-06-30, matching the doc's stated mining date — gives 118 `baseball_*` tables, confirming the doc was correct at authoring time. The same extraction against current HEAD gives only 93 `baseball_*` tables — a drop of 25 (21%) — while the doc still asserts 118.
- **Fix:** Update the header count and the 'not yet in generated types' caveat against a fresh count of `baseball_*` keys in current `src/lib/types/database.ts` (93, independently reverified), and note the table loss as its own finding worth investigating (was this an intentional consolidation/rename, or did tables get dropped without a corresponding migration record?) rather than silently re-stating 118/119.

### `layout` — 6 findings

#### layout-1 · `LOW` · `CONFIRMED` · `SAFE`

**QA coverage doc fabricates Google Calendar env var names that appear nowhere in code**

- **Where:** `docs/qa/helm-system-overview.md:113` · `src/app/api/crm/google-calendar/auth/route.ts:6-9` · `src/app/api/crm/google-calendar/callback/route.ts:6-7` · `src/app/api/crm/google-calendar/sync/route.ts:6-7` · `.env.example (grep: 0 hits for GOOGLE_CLIENT)`
- **Why it matters:** All three names the QA doc gives someone configuring this integration are wrong: GOOGLE_CALENDAR_CLIENT_ID/SECRET are never read anywhere in src/ (the real names have no CALENDAR infix), and GOOGLE_CALENDAR_REDIRECT_URI doesn't exist as a config point at all — the redirect URI is derived from NEXT_PUBLIC_APP_URL. Following the doc literally leaves GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET undefined, so the three CRM Google Calendar OAuth routes build an auth/token request with an undefined client_id/secret. .env.example has no Google Calendar section at all, so there is no correct place in this repo to learn the real names.
- **Evidence:** docs/qa/helm-system-overview.md:113: '| Google Calendar | CRM booking/sync | crm Google OAuth API routes | GOOGLE_CALENDAR_CLIENT_ID, GOOGLE_CALENDAR_CLIENT_SECRET, GOOGLE_CALENDAR_REDIRECT_URI | OAuth | ...' vs. the actual code: auth/route.ts:6-7 'const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;' / 'const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;' and auth/route.ts:9 'const REDIRECT_URI = process.env.NEXT_PUBLIC_APP_URL + "/api/crm/google-calendar/callback";'. `grep -rn "GOOGLE_CALENDAR_CLIENT_ID|GOOGLE_CALENDAR_CLIENT_SECRET|GOOGLE_CALENDAR_REDIRECT_URI" src .env.example` returns zero matches, and `grep -n "GOOGLE_CLIENT" .env.example` also returns zero matches.
- **Fix:** Correct docs/qa/helm-system-overview.md:113 to list GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET (and note the redirect URI is derived, not a separate var), and add a 'Google Calendar (CRM)' section with GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET to .env.example.
- **Verifier (CONFIRMED):** The specific defect is real: docs/qa/helm-system-overview.md:113 lists GOOGLE_CALENDAR_CLIENT_ID/GOOGLE_CALENDAR_CLIENT_SECRET/GOOGLE_CALENDAR_REDIRECT_URI, none of which src/app/api/crm/google-calendar/{auth,callback,sync}/route.ts read (they read GOOGLE_CLIENT_ID/GOOGLE_CLIENT_SECRET, and derive the redirect URI from NEXT_PUBLIC_APP_URL) — confirmed by direct file read. .env.example genuinely has zero Google Calendar entries (grep -n "GOOGLE_CL…

#### layout-2 · `LOW` · `CONFIRMED` · `SAFE`

**.env.example documents a dead var name (CLAUDE_API_KEY) instead of the one the AI code actually reads (ANTHROPIC_API_KEY)**

- **Where:** `.env.example:200-202` · `src/lib/ai/model-provider.ts:8,41,59`
- **Why it matters:** model-provider.ts's own header documents exactly what happens when the direct-Anthropic account isn't picked: 'v3/llm/compose.ts passed the string -> every round review served its template from 07-29' — the call silently fell through to the Vercel AI Gateway on its free tier. Anyone following .env.example and setting CLAUDE_API_KEY gets no effect (that name is read nowhere in src/); ANTHROPIC_API_KEY, the actual switch documented in code as choosing between the direct Anthropic account and the gateway, has no entry in the setup file at all.
- **Evidence:** .env.example:201-202: '# OPENAI_API_KEY=sk-your-openai-api-key\n# CLAUDE_API_KEY=your-claude-api-key' — CLAUDE_API_KEY has zero matches in `grep -rhoE "process\.env\.[A-Za-z_][A-Za-z0-9_]*" src scripts`. The real var is at model-provider.ts:59: 'const key = process.env.ANTHROPIC_API_KEY?.trim();', which is completely absent from .env.example (`grep -n ANTHROPIC_API_KEY .env.example` → no match).
- **Fix:** Replace the CLAUDE_API_KEY line in .env.example:202 with ANTHROPIC_API_KEY=sk-ant-your-key-here and a short comment pointing at model-provider.ts's account-routing logic.
- **Verifier (CONFIRMED):** Narrowly true: .env.example:202 has the dead CLAUDE_API_KEY (0 hits anywhere in src/scripts) and lacks any ANTHROPIC_API_KEY line (grep -n ANTHROPIC_API_KEY .env.example -> no match). But the claim's central impact assertion — that ANTHROPIC_API_KEY 'has no entry in the setup file at all' and operators have no documented way to learn it — is false. A repo-wide grep for ANTHROPIC_API_KEY across every non-source file returns 40+ hits, including CLA…

#### layout-3 · `LOW` · `CONFIRMED` · `SAFE`

**Super-admin and baseball-admin allowlists (SUPER_ADMIN_USER_IDS, ADMIN_EMAILS) are undocumented**

- **Where:** `src/lib/admin/require-super-admin.ts:104-124` · `src/app/baseball/actions/auth.ts:198-206` · `.env.example (0 matches for either name)`
- **Why it matters:** SUPER_ADMIN_USER_IDS is the only way into /admin/* while the DB is unreachable (degraded mode) — an operator has no documented way to know this override exists or to populate it before that path is ever exercised. ADMIN_EMAILS is the sole gate for baseball's command-center dashboard. Both fail closed when unset (no accidental over-grant), but both are undiscoverable except by reading source.
- **Evidence:** require-super-admin.ts:122-124: 'const allow = parseSuperAdminUserIds(process.env.SUPER_ADMIN_USER_IDS); if (!allow.has(user.id)) return { allowed: false, reason: 'forbidden' }; return { allowed: true, context: { userId: user.id, email: user.email ?? '', degraded: true } };' — this is the fallback branch used only when the DB-backed is_super_admin() RPC is unreachable (the primary branch at lines 113-118 is otherwise final in both directions). baseball/actions/auth.ts:201-206: 'const adminAllowlist = (process.env.ADMIN_EMAILS || '').split(",")...' gates redirect to '/baseball/dashboard/command-center'. `grep -n "SUPER_ADMIN_USER_IDS|ADMIN_EMAILS" .env.example` returns no matches.
- **Fix:** Add SUPER_ADMIN_USER_IDS and ADMIN_EMAILS to .env.example with their exact semantics (comma-separated, fail-closed when unset, and — for SUPER_ADMIN_USER_IDS — that it only activates when the is_super_admin() RPC is unreachable).
- **Verifier (CONFIRMED):** This is a compound claim about two variables and it splits. SUPER_ADMIN_USER_IDS is REFUTED as 'undocumented' — it is one of the most thoroughly documented env vars in the repo: docs/REPO_MAP.md:102 (a file CLAUDE.md explicitly directs readers to for cross-product structure) states plainly 'SUPER_ADMIN_USER_IDS is the env gate'; it also appears with full setup/fail-closed semantics in docs/qa/helm-system-overview.md:76, docs/qa/helm-role-permissi…

#### layout-4 · `LOW` · `REFUTED` · `SAFE`

~~**CRON_SECRET, the bearer secret for all 17 Vercel Cron routes, is undocumented in .env.example**~~

- **Where:** `src/lib/cron/auth.ts:14-21` · `vercel.json:39-56` · `.env.example (0 matches)`
- **Why it matters:** Fails closed (401), so this is a setup-friction gap rather than a live vulnerability — I could not verify .env.production.local's actual contents (sandbox-denied read). Locally or in a new environment, none of the 17 cron routes can be exercised and nothing in the repo's setup docs explains that Vercel's native Cron feature sends this value as an Authorization: Bearer header, or that the var needs to be set at all.
- **Evidence:** src/lib/cron/auth.ts:14-15: 'const expected = process.env.CRON_SECRET; if (!expected) return false; // unset secret fails closed, as before'. vercel.json's `crons` array lists 17 entries under /api/cron/*, each protected by requireCronAuth(). `grep -n CRON_SECRET .env.example` → no match (exit 1, clean no-match, not a read error).
- **Fix:** Add CRON_SECRET to .env.example with a comment explaining the Vercel-Cron bearer-header convention.
- **Verifier (REFUTED):** True only that .env.example itself lacks a CRON_SECRET line, but the claim's actual assertion is broader ('nothing in the repo's setup docs explains...that the var needs to be set at all' / explains the Bearer-header convention) and that is false. CRON_SECRET is exceptionally well documented: docs/superpowers/plans/2026-04-21-coachhelm-fix/05-team-e-engine-durability.md:254 states verbatim '// Vercel Cron sends `Authorization: Bearer ${CRON_SECRE…

#### layout-5 · `LOW` · `CONFIRMED` · `SAFE`

**INGEST_ENCRYPTION_KEY, the AES-256-GCM key protecting stored Arccos OAuth tokens, is undocumented anywhere in the repo**

- **Where:** `src/lib/coachhelm/v3/ingest/providers/arccos.ts:4-16,36` · `docs/qa/helm-system-overview.md:114`
- **Why it matters:** Unlike ARCCOS_CLIENT_ID/SECRET (loosely covered by the ARCCOS_* wildcard note) and GARMIN_/TRACKMAN_ (explicitly documented as reserved at helm-system-overview.md:116), the key that actually protects stored OAuth tokens at rest has zero coverage anywhere — a setup or rotation guide following the existing docs would miss it entirely.
- **Evidence:** arccos.ts:7: '- INGEST_ENCRYPTION_KEY (32-byte hex key for AES-256-GCM token decryption)'; arccos.ts:13-16: 'Token encryption: access/refresh tokens are stored AES-256-GCM encrypted in golf_ingest_connections... INGEST_ENCRYPTION_KEY must be a 64-char hex string (32 bytes). If the key is missing, sync returns an error.' `grep -rn INGEST_ENCRYPTION_KEY docs/ .env.example README.md` returns no matches. The only related doc coverage is helm-system-overview.md:114's generic 'ARCCOS_* provider variables where configured' — which doesn't cover INGEST_ENCRYPTION_KEY since that name doesn't share the ARCCOS_ prefix.
- **Fix:** Add INGEST_ENCRYPTION_KEY to .env.example with a generation hint (e.g. `openssl rand -hex 32`), and name it explicitly (not just via the ARCCOS_* wildcard) in helm-system-overview.md's Arccos row.
- **Verifier (CONFIRMED):** Verified as stated. A repo-wide grep for INGEST_ENCRYPTION_KEY (any file extension, excluding node_modules/.next) returns exactly three hits, all source/test files: src/lib/coachhelm/v3/ingest/providers/arccos.ts (where it's defined/used) and its two test files (arccos.test.ts, arccos-transactional.test.ts). Zero hits in any .md/.yml/.example/.json doc or config anywhere in the repo. docs/qa/helm-system-overview.md:114's 'ARCCOS_* provider variab…

#### layout-6 · `LOW` · `REFUTED` · `SAFE`

~~**NEXT_PUBLIC_DEV_AUTH_BYPASS is read only in server-side edge middleware but ships to the client bundle anyway**~~

- **Where:** `src/proxy.ts:68`
- **Why it matters:** No secret value leaks — it's a boolean flag, not a credential — but the NEXT_PUBLIC_ prefix means Next.js inlines its literal build-time value into every client JS bundle for no functional reason: proxy.ts is the only reader and it never executes client-side. A production build with this flag flipped on for its /dev/design-system bypass now advertises that fact in the shipped bundle.
- **Evidence:** src/proxy.ts:68: "if (process.env.NEXT_PUBLIC_DEV_AUTH_BYPASS === 'true') {" — the only reference to this var in the entire src/ tree (`grep -rn NEXT_PUBLIC_DEV_AUTH_BYPASS src` returns exactly this one line), inside proxy.ts (edge middleware, never runs in the browser). Also 0 matches in .env.example.
- **Fix:** Rename to a server-only DEV_AUTH_BYPASS (drop the NEXT_PUBLIC_ prefix) in proxy.ts and whatever deploy config sets it; add it to .env.example.
- **Verifier (REFUTED):** Directly disproved against this session's actual .next build output. grep -rl "DEV_AUTH_BYPASS" .next/static -> zero hits (the client-side static chunks that get downloaded by browsers). grep -rl "DEV_AUTH_BYPASS" .next/server -> hits only in .next/server/middleware.js and .next/server/proxy.js.map — the server-side edge-middleware bundle, which Vercel executes on its own infrastructure per-request and never serves to the browser as a static asse…


---

## Code audit

Bugs, duplicates, dead code, organization. Ran 25 agents, all read-only — no suite was executed, because peer sessions had runs in flight in this shared checkout.

### `dup-components` — 5 findings

#### dup-components-1 · `HIGH` · `CONFIRMED`

**CodeRabbit Issue Enrichment workflow is still live — the exact functionality docs say was dropped**

- **Where:** `.github/workflows/coderabbit-issue-enrichment.yml:1-31` · `.github/branch-protection.md:63-65` · `.coderabbit.yaml:1-6`
- **Why it matters:** Every time someone opens, reopens, or edits a GitHub issue in this repo, CI still actively labels it to trigger CodeRabbit's automatic issue-planning bot — the exact "issue enrichment, and auto-planning" feature that branch-protection.md and AGENTS.md/code-review-tooling.md say was dropped 2026-07-20. Anyone reading the docs ("no AI reviewers", "CodeRabbit dropped") would reasonably assume no CodeRabbit automation still fires; instead one code path was missed by the removal PR and keeps calling out to CodeRabbit on every issue.
- **Evidence:** `.github/workflows/coderabbit-issue-enrichment.yml`: `name: CodeRabbit Issue Enrichment` (line 1), triggers `on: issues: types: [opened, reopened, edited]`, and its only job does `gh label create plan-me ... --description "Trigger CodeRabbit automatic issue planning"` then `gh issue edit ... --add-label plan-me` under a step named `Add CodeRabbit planning trigger label`. Meanwhile `.github/branch-protection.md:63-65` says: `~~CodeRabbit — CodeRabbit's own status check, with assertive review, pre-merge checks, issue enrichment, and auto-planning configured in .coderabbit.yaml.~~ DROPPED 2026-07-20 by founder decision and removed from the required set`. Git history confirms the split: `.codera…
- **Fix:** Either delete `.github/workflows/coderabbit-issue-enrichment.yml` (and the `plan-me` label lifecycle) as part of the same cleanup that produced #994, or update branch-protection.md/AGENTS.md to explicitly carve out issue-planning as a deliberate exception with a reason — right now the two are simply out of sync.
- **Verifier (CONFIRMED):** Opened .github/workflows/coderabbit-issue-enrichment.yml directly: it is exactly as quoted — triggers on issues opened/reopened/edited, and its only job creates a 'plan-me' label and applies it via `gh issue edit ... --add-label plan-me`, described in-file as 'Trigger CodeRabbit planning' / 'Add CodeRabbit planning trigger label'. `git log --follow` shows its last touch was commit 38a9ead20 (2026-06-30, 'chore(coderabbit): make issue enrichment p…

#### dup-components-2 · `HIGH` · `CONFIRMED`

**CONTRIBUTING.md still tells contributors to branch from main and never push directly, contradicting CLAUDE.md's 2026-08-15 'work directly on main' decision**

- **Where:** `CONTRIBUTING.md:10-16` · `CLAUDE.md:68` · `CLAUDE.md:77`
- **Why it matters:** A contributor (or an agent) following CONTRIBUTING.md's stated workflow — which the file itself calls out as the summary of CLAUDE.md/AGENTS.md — would branch off main and wait for a `CodeRabbit` check that no longer exists as a required context, instead of doing the actual current workflow of pushing straight to main. This is the exact 'old branch-first workflow' CLAUDE.md explicitly warns is stale ('Any doc, hook, or comment claiming production serves main is stale... it is what made the old branch-first workflow feel mandatory') — CONTRIBUTING.md is that stale doc.
- **Evidence:** CONTRIBUTING.md:10-11: `1. **Branch from `main`.** `main` is protected (linear history, no force-push, required reviews + checks). Never push to it directly.` CONTRIBUTING.md:15: `3. **Pass the required checks.** A PR can merge only when these are green: `CodeRabbit`, `CodeQL`, `all` ... and `Smoke checks`.` CLAUDE.md:68: `Work directly on `main`. Owner decision, 2026-08-15.` CLAUDE.md:77: `Branch protection on `main`: 0 required reviews, `enforce_admins` off, linear history, 3 required checks (`CodeQL`, `all`, `Smoke checks`). Direct push is permitted for the owner.` `git log` shows CONTRIBUTING.md was last touched 2026-06-30 (#518, initial governance scaffolding) and has never been updated…
- **Fix:** Rewrite CONTRIBUTING.md's Workflow section to match CLAUDE.md section 0 (main is the working branch, 0 required reviews, 3 required checks are CodeQL/all/Smoke checks, no CodeRabbit).
- **Verifier (CONFIRMED):** Read CONTRIBUTING.md directly: line 10-11 reads verbatim '1. **Branch from `main`.** ... Never push to it directly.' and line 15-16 lists required checks as 'CodeRabbit, CodeQL, all ... and Smoke checks'. CLAUDE.md:68 confirms 'Work directly on `main`. Owner decision, 2026-08-15.' and CLAUDE.md:77 lists only 3 required checks (CodeQL, all, Smoke checks) with CodeRabbit absent and direct push explicitly permitted for the owner. `git log` shows CON…

#### dup-components-3 · `MEDIUM` · `CONFIRMED`

**memory/registry.yml lists greptile/coderabbit as active integrations and references the deleted .greptile/** path**

- **Where:** `memory/registry.yml:34-37` · `memory/registry.yml:1085-1091`
- **Why it matters:** CLAUDE.md and AGENTS.md both instruct agents to treat `memory/registry.yml` as the first-stop, authoritative feature-routing table ('For feature work, use memory/registry.yml first'). An agent trusting that file for the review_gate system would try to map/read a `.greptile/**` glob that resolves to nothing, and would list a dead tool (greptile) and a disabled one (coderabbit) as live integrations for feature-awareness review.
- **Evidence:** memory/registry.yml:34-37, under `feature_awareness_system.integrations`: `- github_actions\n - codex\n - greptile\n - coderabbit`. memory/registry.yml:1088-1091, under `systems.review_gate`: `docs: .github/branch-protection.md\n code:\n - .github/workflows/review-gate.yml\n - .coderabbit.yaml\n - .greptile/**`. A filesystem check confirms `.greptile/` does not exist anywhere in the repo root (`find . -maxdepth 1 -iname ".greptile*"` returns nothing), matching AGENTS.md's own statement: `.greptile/ is deleted. Any reference to .greptile/rules.md or .greptile/config.json is stale.`
- **Fix:** Remove `.greptile/**` from `systems.review_gate.code` and drop `greptile`/`coderabbit` from `feature_awareness_system.integrations`, or replace with the actual live reviewers (Review Gate, CodeQL).
- **Verifier (CONFIRMED):** Read memory/registry.yml directly: lines 34-37 list `- github_actions / - codex / - greptile / - coderabbit` under an integrations block exactly as quoted, and lines 1088-1091 list `code: - .github/workflows/review-gate.yml / - .coderabbit.yaml / - .greptile/**` under `review_gate`. Confirmed via `find . -maxdepth 1 -iname '.greptile*'` that no `.greptile` directory exists anywhere in the repo root. AGENTS.md:56-57 independently states '`.greptil…

#### dup-components-4 · `MEDIUM` · `CONFIRMED`

**CircleCI ios workflow comment claims path-based PR triggering; the actual filter is branch-name-only, and a later comment in the same file says so correctly**

- **Where:** `.circleci/config.yml:399-402` · `.circleci/config.yml:407-415` · `.circleci/config.yml:242-244`
- **Why it matters:** A PR from a branch that doesn't match one of those five patterns (e.g. a normal `fix/...` or agent-generated branch name) but that does touch ios/** files will NOT run ios-compile, despite the workflow's own header comment promising it 'runs on every PR that touches ios/**'. Someone relying on that comment (as CLAUDE.md does, correctly describing it as branch-based) would wrongly believe iOS breakage on an off-pattern branch is caught by CI when it isn't.
- **Evidence:** .circleci/config.yml:399-402 (git blame: commit d09af966b2, 2026-05-26): `# iOS compile verification — runs on every PR that touches ios/**,\n # capacitor.config.ts, or any Capacitor plugin in package.json, plus\n # on every push to main.` The actual job definition right below it, lines 407-415, filters purely on branch name: `filters:\n branches:\n only:\n - main\n - /release\\/.*/\n - /ios\\/.*/\n - /capacitor\\/.*/\n - /agent\\/fix-circleci-ios-.*/` — there is no path/file filter anywhere in this config. A separate, later comment on the android-compile job (lines 242-244, git blame: commit 4ab0f5197c, 2026-08-01) correctly describes the same mechanism: `the only\n # mobile job was \`ios-c…
- **Fix:** Update the comment at .circleci/config.yml:399-402 to match the accurate branch-filter description already written at lines 242-244 (or add an actual path filter via CircleCI's path-filtering orb if push-on-touched-files was the real intent).
- **Verifier (CONFIRMED):** Read .circleci/config.yml directly. Lines 399-406 carry the header comment '# iOS compile verification — runs on every PR that touches ios/**, capacitor.config.ts, or any Capacitor plugin in package.json, plus on every push to main' immediately above the `ios:` workflow, whose only gate (lines 403-415) is `filters: branches: only: [main, /release\/.*/, /ios\/.*/, /capacitor\/.*/, /agent\/fix-circleci-ios-.*/]` — branch-name matching only, no path…

#### dup-components-5 · `LOW` · `REFUTED`

~~**memory/prompts/pr-review.md tells reviewers to check for Greptile/CodeRabbit comments that no bot posts anymore**~~

- **Where:** `memory/prompts/pr-review.md:14`
- **Why it matters:** This prompt template is still checked in (unlike docs/v3-master-plan.md, which carries an explicit STATUS: SUPERSEDED banner) and instructs whoever runs it to look for PR-comment input from two tools that no longer comment on PRs at all, wasting a review step on a source that will always come back empty.
- **Evidence:** memory/prompts/pr-review.md:14, in the Inputs list: `- Greptile and CodeRabbit comments if available`. AGENTS.md:47-48 states as current fact: `There are no AI reviewers on PRs. CodeRabbit and Greptile were dropped 2026-07-20 by founder decision`.
- **Fix:** Delete the Greptile/CodeRabbit line from the Inputs list, or mark the file superseded/historical the way docs/v3-master-plan.md was.
- **Verifier (REFUTED):** Opened the full 39-line file at memory/prompts/pr-review.md. Line 14 is a blank line, not '- Greptile and CodeRabbit comments if available'. Ran `grep -n -i "greptile\|coderabbit" memory/prompts/pr-review.md` and it returned no matches (exit 1) — the phrase does not appear anywhere in the file. The actual Inputs list (lines 3-13) is: PR title/description, changed files, relevant diff, registry.yml mapping, mapped feature/flow docs, mapped busines…

### `dup-logic` — 1 finding

#### dup-logic-1 · `HIGH` · `CONFIRMED`

**computeCounterfactual uses a green-hit PERCENT as the feet target for approach_proximity_* metrics, unconditionally overriding the correct pga_value**

- **Where:** `src/lib/coachhelm/v3/counterfactual/cohort-baselines.ts:55-57` · `src/lib/coachhelm/v3/counterfactual/compute.ts:94-101` · `src/lib/coachhelm/v3/counterfactual/compute.ts:107-109` · `src/lib/coachhelm/v3/standing/gender-anchor.ts:91-98` · `src/lib/coachhelm/v3/counterfactual/player-cohort-loader.ts:20,37-39` · `src/lib/coachhelm/v3/engine/generator-base.ts:194-207` · `src/test/coachhelm/v3/counterfactual-cohort.test.ts:67-88`
- **Why it matters:** For every approach_proximity_50_125ft / 125_175ft / 175_plus_ft insight, whenever the app-wide cohort (`golf_player_standing.level_avg`, gated at >=8 players per band) is not yet populated or is rejected by the plausibility bound, the gap is computed as `player_value(feet, ~15-40) - target(percent, 42-80)`, which is almost always negative for `lower_better`. That trips `gap <= 0` -> 'no_gap' and the counterfactual is silently suppressed — the real per-round strokes-impact for this metric family never surfaces, never floors the priority (leveragePriorityFloor), and never ranks the insight (backfilledStrokesImpact). This happens for BOTH genders (mens anchor 80/65/50 is just as wrong a unit as…
- **Evidence:** cohort-baselines.ts:55-57: `approach_proximity_50_125ft: { mens: 80, womens: 70 }` / `approach_proximity_125_175ft: { mens: 65, womens: 56 }` / `approach_proximity_175_plus_ft: { mens: 50, womens: 42 }` — these are the same green-hit *percentages* the old TOUR_GREEN_HIT_PCT table used, not feet. But `approach_proximity_*` is registered `unit: 'feet', direction: 'lower_better'` (metric-config.ts:70-72, metrics/registry.ts:140-142), and the real feet benchmarks live in golf_pga_standards seeded at 18/30/45 (men) and 26/38/55 (women, LPGA) — supabase/migrations/20260610040300_seed_golf_pga_standards.sql:12-14 and 20260610170000_seed_lpga_standards.sql:146-150. compute.ts:94-101: `const anchor =…
- **Fix:** In counterfactual/compute.ts, either (a) stop consulting cohortAnchor() for metrics whose unit differs from the anchor table's stored unit — restrict the `anchor` fallback to the metric families it is actually correct for (putts_made_*, scrambling_pct_*, gir_pct), or (b) give cohort-baselines.ts real feet-denominated approach_proximity anchors (mirroring the pga-standards/lpga-standards feet values already seeded: ~18/30/45 men, ~26/38/55 women) instead of green-hit percentages, and add a test t…
- **Verifier (CONFIRMED):** Verified every cited file/line directly. cohort-baselines.ts:55-57 stores approach_proximity_50_125ft/125_175ft/175_plus_ft as {mens: 80/65/50, womens: 70/56/42} under the comment 'Approach green-hit % (approximate band anchors)' — percentages, not feet. metric-config.ts:70-72 and registry.ts:140-142 both register these three metrics as unit:'feet', direction:'lower_better'. compute.ts:94-101 computes `anchor = input.cohort_gender ? cohortAnchor(…

### `dead-code` — 3 findings

#### dead-code-1 · `HIGH` · `CONFIRMED`

**Putts-per-round divides by all holes played in two files, contradicting the #917 fix that divides by holes-with-recorded-putts**

- **Where:** `src/lib/cache/golf-stats-calculator.ts:711-713` · `src/lib/golf/stat-formulas.ts:57-64` · `src/lib/golf/putts-per-round.ts:16-24,61-64` · `src/lib/utils/golf-stats-calculator-shots.ts:2661-2667`
- **Why it matters:** For any completed round where not every hole has a recorded putts value (a common partial-log state), cache/golf-stats-calculator.ts's buildLiveStatsSnapshot computes a different putts-per-round than golf-stats-calculator-shots.ts / the Team Stats page compute for the exact same player and round set. Because this function feeds isStatsCacheOutOfSync (tolerance 0.5) inside invalidateOnRoundComplete — which runs on every round completion/edit in src/app/golf/actions/golf.ts — the stale, pre-#917 formula can make a genuinely in-sync cache look 'out of sync', triggering needless refresh_player_stats_cache RPC retries and 'Stats cache remained out of sync' warning/error telemetry for players who …
- **Evidence:** cache/golf-stats-calculator.ts:711-713 (LIVE, called from every round-save via invalidateOnRoundComplete): `livePuttsPerRound: totalHolesPlayed > 0 ? Math.round(((totalPutts / totalHolesPlayed) * 18) * 100) / 100 : null,` — vs. golf/putts-per-round.ts:61-64 (the documented, actually-shared fix): `export function calculatePuttsPerRound(totalPutts: number, holesWithPutts: number): number | null { if (holesWithPutts <= 0 || totalPutts <= 0) return null; return (totalPutts / holesWithPutts) * 18; }` whose own docstring (lines 16-20) says dividing by every hole played 'dilutes the average downward — which is exactly the reported drift (Team Stats 33.3 vs. player profile 32.6 for the same player)'…
- **Fix:** Route cache/golf-stats-calculator.ts's buildLiveStatsSnapshot putts calculation (and stat-formulas.ts's computePuttsPerRound) through the same calculatePuttsPerRound(totalPutts, holesWithPutts) in src/lib/golf/putts-per-round.ts that golf-stats-calculator-shots.ts and the Team Stats page already use, computing totalHolesWithPutts the same null-skip way; update stat-formulas.ts's docstring/implementation to match or delete the now-superseded computePuttsPerRound export.
- **Verifier (CONFIRMED):** Read all four cited files. src/lib/cache/golf-stats-calculator.ts:711-713 (buildLiveStatsSnapshot) literally computes `livePuttsPerRound: totalHolesPlayed > 0 ? Math.round(((totalPutts / totalHolesPlayed) * 18) * 100) / 100 : null` where totalHolesPlayed = sum of round.holes_played (every hole played, not holes with a recorded putt). This is a genuinely different denominator than src/lib/golf/putts-per-round.ts:61-64's `calculatePuttsPerRound(tot…

#### dead-code-2 · `MEDIUM` · `CONFIRMED`

**formatToPar's own doc-rot: the files it names as still drifted are fixed, but a same-purpose formatToParShort duplicate (ASCII hyphen, not the Unicode minus) still exists undetected**

- **Where:** `src/lib/golf/format-to-par.ts:1-16` · `src/components/fairway/pages/coachhelm/FairwayPlayerInsight.tsx:250-253,1008`
- **Why it matters:** The docstring actively misdirects: it tells the next engineer two specific files are the sync risk when they were already fixed, while the one function that is genuinely still drifted (formatToParShort) goes unmentioned and unprotected by the codebase's own single-source regression test (which only searches for `formatToPar`, not the renamed variant) — so a player can see '-3' on the CoachHelm insight card next to '−3' on the rounds/qualifiers surfaces for the identical score-to-par value.
- **Evidence:** format-to-par.ts:8-11 claims: 'A few other local copies (FairwayMyQualifiers, RosterTable) still stringify the raw negative number and so render an ASCII hyphen instead — this file doesn't guarantee every surface stays in sync.' Both named files now `import { formatToPar } from '@/lib/golf/format-to-par'` and call it (RosterTable.tsx:6,94,151; FairwayMyQualifiers.tsx:48,330) — the comment's specific claim is false today. Meanwhile FairwayPlayerInsight.tsx:250-253 defines an undetected sibling under a different name: `function formatToParShort(diff: number | null): string { if (diff === null) return ''; return diff === 0 ? 'E' : diff > 0 ? \`+${diff}\` : String(diff); }`, called live at line …
- **Fix:** Delete formatToParShort in FairwayPlayerInsight.tsx and call the shared formatToPar from src/lib/golf/format-to-par.ts instead; update format-to-par.ts's docstring to drop the stale FairwayMyQualifiers/RosterTable claim now that they're consolidated, and broaden the single-source regression test's search to catch any `formatToPar*`-named local re-implementation, not just an exact-name redeclaration.
- **Verifier (CONFIRMED):** format-to-par.ts:8-11 does say 'A few other local copies (FairwayMyQualifiers, RosterTable) still stringify the raw negative number' — but grep confirms both RosterTable.tsx (src/app/admin/teams/[id]/RosterTable.tsx:6,94,151) and FairwayMyQualifiers.tsx (src/components/fairway/pages/my-qualifiers/FairwayMyQualifiers.tsx:48,330) now import and call the canonical formatToPar, so the docstring's specific claim is stale/false today. Meanwhile Fairway…

#### dead-code-3 · `LOW` · `CONFIRMED`

**Two live label maps disagree on the capitalization of the same putts_per_round metric name**

- **Where:** `src/lib/utils.ts:18-24` · `src/lib/coachhelm/focus-areas/catalog.ts:89`
- **Why it matters:** Both are imported and rendered on the same player-facing route: formatMetricLabel from utils.ts is used in WhatIfPanel.tsx and FairwayTrendBrain.tsx, which render inside DeepDiveDrill.tsx, which is rendered by PlayerCoachHelmHome.tsx on /dashboard/coachhelm — the same page tree where catalog.ts's labels drive InsightCard.tsx and PromoteToFocusAreaButton.tsx. A player can see 'Putts per Round' in the What-If simulator and 'Putts Per Round' in an adjacent Focus Area / Insight card for the identical metric in the same session.
- **Evidence:** utils.ts:23-24: `puttsPerRound: 'Putts per Round', putts_per_round: 'Putts per Round',` inside `METRIC_LABELS`, consumed by `formatMetricLabel()`. catalog.ts:89: `{ key: 'putts_per_round', label: 'Putts Per Round', ... }`. Same metric key, capitalized differently ('per' vs 'Per').
- **Fix:** Have one of the two maps import its label from the other (or extract a single METRIC_DISPLAY_LABELS module both consume) so `putts_per_round` resolves to one capitalization everywhere.
- **Verifier (CONFIRMED):** src/lib/utils.ts:23-24 confirmed verbatim: `puttsPerRound: 'Putts per Round', putts_per_round: 'Putts per Round',` inside METRIC_LABELS, consumed by formatMetricLabel (line 34-36). src/lib/coachhelm/focus-areas/catalog.ts:89 confirmed verbatim: `{ key: 'putts_per_round', label: 'Putts Per Round', ... }`. Same key, different capitalization of 'per'/'Per' as claimed. Also verified the rendering chain: formatMetricLabel is imported and called in Wha…

### `bugs-recent` — 2 findings

#### bugs-recent-1 · `HIGH` · `CONFIRMED`

**Native-app idle window equals the activity cookie's own Max-Age, so an abandoned native session never actually expires**

- **Where:** `src/lib/auth/session-idle-shared.ts:58` · `src/lib/auth/session-idle-shared.ts:97` · `src/lib/auth/session-idle-shared.ts:116-122` · `src/lib/supabase/__tests__/middleware-native-app-idle.test.ts:103-114`
- **Why it matters:** A native session's `sb_last_activity` cookie is written with Max-Age = SESSION_IDLE_COOKIE_MAX_AGE_S (30 days) on every write (login, staff-invite signup bootstrap, or client activity heartbeat), so it always expires at exactly `lastActivity + 30 days` — the identical instant NATIVE_APP_SESSION_IDLE_TIMEOUT_MS says the session must be forced to re-authenticate. Once real time crosses that boundary, the cookie is gone before the next request is even sent, so `parseLastActivity` returns null and `isSessionIdleExpired` short-circuits to 'not idle'; middleware then bootstraps a fresh marker (middleware.ts:836) and silently lets the session continue with no re-login. This directly contradicts the…
- **Evidence:** session-idle-shared.ts:58: `export const NATIVE_APP_SESSION_IDLE_TIMEOUT_MS = 30 * 24 * 60 * 60 * 1000; // 30 days` — set EQUAL to session-idle-shared.ts:97: `export const SESSION_IDLE_COOKIE_MAX_AGE_S = 60 * 60 * 24 * 30; // 30 days`. isSessionIdleExpired at session-idle-shared.ts:121-122: `if (lastActivity === null) return false; return now - lastActivity >= timeoutMs;` — explicitly fails open when the cookie is absent. The file's own docstring for the cookie (lines 90-96) states the invariant this violates: 'deliberately MUCH longer than the timeout... If the cookie expired *at* the timeout it would vanish exactly when we need to read it to detect staleness (a fail-open bug)'. middleware-…
- **Fix:** Set NATIVE_APP_SESSION_IDLE_TIMEOUT_MS strictly (and by a wide margin) shorter than SESSION_IDLE_COOKIE_MAX_AGE_S — e.g. keep the cookie lifetime at 30+ days but cap the native idle window at ~21-25 days — matching the 'much longer' invariant already applied to the standard/demo windows. Add a regression test that omits the sb_last_activity cookie entirely (simulating real browser eviction) at `now = lastActivity + NATIVE_APP_SESSION_IDLE_TIMEOUT_MS + slack` and asserts the request is still forc…
- **Verifier (CONFIRMED):** Read session-idle-shared.ts directly: line 58 NATIVE_APP_SESSION_IDLE_TIMEOUT_MS = 30*24*60*60*1000 and line 97 SESSION_IDLE_COOKIE_MAX_AGE_S = 60*60*24*30 are numerically identical (30 days), and isSessionIdleExpired (116-122) returns false when lastActivity is null. Traced every cookie write (session-activity.ts:58, session-idle-server.ts:20-22, middleware.ts:837-843): all set cookie value=Date.now() and max-age=SESSION_IDLE_COOKIE_MAX_AGE_S, s…

#### bugs-recent-2 · `MEDIUM` · `CONFIRMED`

**New isNativeAppUserAgent() claims 'one definition' but middleware.ts (and proxy.ts) keep their own separate, unlinked copy of the UA marker**

- **Where:** `src/lib/auth/session-idle-shared.ts:65` · `src/lib/auth/session-idle-shared.ts:70-76` · `src/lib/supabase/middleware.ts:138` · `src/lib/supabase/middleware.ts:151-154` · `src/proxy.ts:17`
- **Why it matters:** If the Capacitor UA marker literal is ever changed in only one of the three independently-hardcoded copies (a rebrand, an App Store review requirement, etc.), the client's idle-timeout hook (session-activity.ts, via isNativeAppUserAgent) and the server's idle-timeout gate (middleware.ts, via its own isNativeUserAgent) would silently apply different idle windows to the same user — reproducing exactly the client/server disagreement bug this same commit fixed, 'just relocated' as the docstring itself puts it, except with no actual single source of truth backing that claim today.
- **Evidence:** session-idle-shared.ts:70-76 docstring: 'Deliberately usable from BOTH sides... One definition keeps the middleware and the client hook from disagreeing about whether a session is idle — a disagreement would mean the client signs the user out while the server considers them active, which is the exact bug this fixes, just relocated.' But middleware.ts:138 defines its own separate `const NATIVE_UA_MARKER = 'HelmSportsLabsApp';` and middleware.ts:151-154's `isNativeUserAgent(request)` — the function this commit actually wired into the new `isNativeApp` idle-timeout branch (middleware.ts:680, 770) — uses that local constant, not the new `isNativeAppUserAgent`/`NATIVE_APP_UA_MARKER` exported from…
- **Fix:** Have middleware.ts and proxy.ts import NATIVE_APP_UA_MARKER / isNativeAppUserAgent from session-idle-shared.ts instead of maintaining their own local copies, or add a unit test asserting the constants are referentially/value-equal so a future edit to one is caught immediately.
- **Verifier (CONFIRMED):** Read middleware.ts:138 (const NATIVE_UA_MARKER = 'HelmSportsLabsApp') and confirmed via grep that isNativeUserAgent() built on that local constant is what's actually called at middleware.ts:680 and :770, the exact call sites gating the native idle-timeout branch -- not the new isNativeAppUserAgent/NATIVE_APP_UA_MARKER from session-idle-shared.ts. Read proxy.ts:17 and found a third independent copy of the same literal. Grepped for imports of the s…

### `bugs-coachhelm` — 4 findings

#### bugs-coachhelm-1 · `MEDIUM` · `UNVERIFIED`

**DocumentPreview modal forked wholesale from golf into baseball, then drifted**

- **Where:** `/Users/ricknini/Downloads/helmv3/src/components/golf/documents/DocumentPreview.tsx:111` · `/Users/ricknini/Downloads/helmv3/src/components/golf/documents/DocumentPreview.tsx:167-176 (noContent state)` · `/Users/ricknini/Downloads/helmv3/src/components/golf/documents/DocumentPreview.tsx:226-236` · `/Users/ricknini/Downloads/helmv3/src/components/baseball/documents/DocumentPreview.tsx:14-18` · `/Users/ricknini/Downloads/helmv3/src/components/baseball/documents/DocumentPreview.tsx:121` · `/Users/ricknini/Downloads/helmv3/src/components/baseball/documents/DocumentPreview.tsx:220-231`
- **Why it matters:** Two ~390-line modals implement the identical mime-type-dispatch preview UI (PDF/text/image/video/office-doc branches, download/open-external actions, loading/error states) with only cosmetic differences (golf: Fairway ModalShell/Button/fw-* tokens; baseball: legacy ui/dialog + hardcoded warm-*/blue-* colors). Every future preview-behavior fix (new mime type, new error state, the noContent honesty fix) has to be manually re-applied to both files or one product silently regresses -- which has already happened with the noContent state and the paren-precedence bug.
- **Evidence:** golf/documents/DocumentPreview.tsx:220-236 (case 'custom' branch): return ( <div className="h-[70vh]"> <TextPreview content={textContent || undefined} url={textContent ? undefined : previewUrl} fileName={fileName} mimeType={mimeType} onFullScreen={toggleFullScreen} onDownload={handleDownload} /> </div> ); baseball/documents/DocumentPreview.tsx:214-230 -- byte-identical JSX, same prop list, same className: return ( <div className="h-[70vh]"> <TextPreview content={textContent || undefined} url={textContent ? undefined : previewUrl} fileName={fileName} mimeType={mimeType} onFullScreen={toggleFullScreen} onDownload={handleDownload} /> </div> ); Baseball's own import comment admits the fork: base…
- **Fix:** Extract the shared DocumentPreview shell (mime-dispatch switch, loading/error/noContent states, download/open-external handlers) into one component parameterized by the document/version types and the server actions (getPreviewUrl/getTextFileContent), mirroring how PDFViewer/ImagePreview/TextPreview are already shared. Port baseball onto Fairway ModalShell + the golf noContent state as part of the merge; keep only the golf/baseball server-action wiring as the per-sport seam.

#### bugs-coachhelm-2 · `LOW` · `UNVERIFIED`

**UploadNewVersionModal duplicated golf-to-baseball with byte-identical formatFileSize**

- **Where:** `/Users/ricknini/Downloads/helmv3/src/components/golf/documents/UploadNewVersionModal.tsx:25-31` · `/Users/ricknini/Downloads/helmv3/src/components/baseball/documents/UploadNewVersionModal.tsx:17-23`
- **Why it matters:** A second full leaf-modal (upload-new-version) copy-pasted between golf/documents and baseball/documents confirms this is a systemic pattern across the whole documents feature, not a one-off. Baseball's copy is stuck on the pre-Fairway hand-rolled-backdrop modal idiom (raw fixed/z-50 div + decoy close button) that the rest of the app has moved off of, and it will silently miss any accessibility or behavior fix made to golf's Drawer-based version.
- **Evidence:** golf/documents/UploadNewVersionModal.tsx:25-31: function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i]; } baseball/documents/UploadNewVersionModal.tsx:17-23: function formatFileSize(bytes: number): string { if (bytes === 0) return '0 Bytes'; const k = 1024; const sizes = ['Bytes', 'KB', 'MB', 'GB']; const i = Math.floor(Math.log(bytes) / Math.log(k)); return Math.round((bytes / Math.pow(k, i)) * 100) / 100 + ' ' + sizes[i]; } Identical drag/drop upload logic (dragOver state, current-…
- **Fix:** Fold into the same shared-shell extraction as DocumentPreview: one UploadNewVersionModal driven by the sport-specific server action (createNewVersion) and file-type constraints, built on the Fairway Drawer/Input primitives baseball already has access to via '@/components/fairway'.

#### bugs-coachhelm-3 · `LOW` · `UNVERIFIED`

**baseball's DocumentVersionHistoryModal is an admitted, unmerged fork of golf's VersionHistory**

- **Where:** `/Users/ricknini/Downloads/helmv3/src/components/baseball/documents/DocumentVersionHistoryModal.tsx:3-9` · `/Users/ricknini/Downloads/helmv3/src/components/golf/documents/VersionHistory.tsx:39-61` · `/Users/ricknini/Downloads/helmv3/src/components/baseball/documents/DocumentVersionHistoryModal.tsx:68-107`
- **Why it matters:** A third file pair in the same golf/documents <-> baseball/documents split (after DocumentPreview and UploadNewVersionModal), different names this time (VersionHistory vs DocumentVersionHistoryModal) which makes it harder to find via a straight filename grep -- confirming the whole documents feature was hand-forked component-by-component rather than shared, and any bug fix to the shared revert-flow logic (already the site of a real off-by-one bug historically, per revertingTo vs revertingToNumber comments in golf's file) has to be remembered and re-applied to a differently-named baseball twin.
- **Evidence:** baseball/documents/DocumentVersionHistoryModal.tsx:3-9 (the file's own header): /** * DocumentVersionHistoryModal -- coach-facing revert/history surface for a * single baseball_document. Adapted from `src/components/golf/documents/ * VersionHistory.tsx` (timeline layout + revert confirm) but packaged as a * self-contained modal ... */ Matching state/call shape both sides: golf/documents/VersionHistory.tsx:43,61: const [revertingTo, setRevertingTo] = useState<DocumentVersion | null>(null); ... const { success, error } = await revertToVersion(document.id, revertingTo.id); baseball/documents/DocumentVersionHistoryModal.tsx:68,107: const [revertTarget, setRevertTarget] = useState<BaseballDocumen…
- **Fix:** Same consolidation as the other two: extract a shared VersionHistory primitive (timeline row + revert-confirm) parameterized by document/version type and the revertToVersion action; baseball's self-contained-modal packaging preference can be a presentational wrapper around the shared primitive rather than a full reimplementation.

#### bugs-coachhelm-4 · `MEDIUM` · `UNVERIFIED`

**StepIndicator hand-mirrored between golf and baseball onboarding, already out of lock-step**

- **Where:** `/Users/ricknini/Downloads/helmv3/src/components/golf/onboarding/StepIndicator.tsx:37-56` · `/Users/ricknini/Downloads/helmv3/src/components/baseball/onboarding/StepIndicator.tsx:9-11` · `/Users/ricknini/Downloads/helmv3/src/components/baseball/onboarding/StepIndicator.tsx:46-65`
- **Why it matters:** This is manual, comment-enforced synchronization instead of a shared component -- exactly the failure mode the comment itself warns against. It has already failed once (baseball's per-step Icon glyph capability never made it back into golf's onboarding, so golf onboarding is missing a feature baseball has), and each is consumed by two live onboarding pages per sport (confirmed via grep on both /golf/(onboarding) and /baseball/(onboarding) route files), so any future visual tweak silently applies to only one sport unless someone remembers to hand-port it to the other file.
- **Evidence:** golf/onboarding/StepIndicator.tsx:47-56: export function StepIndicator<T extends string>({ currentStep, steps }: StepIndicatorProps<T>) { const currentIndex = steps.findIndex((s) => s.id === currentStep); return ( <nav aria-label="Onboarding progress" className="flex items-center justify-center gap-0 mb-8 sm:mb-10"> {steps.map((step, index) => { const isCompleted = index < currentIndex; const isCurrent = index === currentIndex; baseball/onboarding/StepIndicator.tsx:58-67 -- same function signature, same aria-label string, same className, same variable names, plus one addition: export function StepIndicator<T extends string>({ currentStep, steps }: StepIndicatorProps<T>) { const currentIndex …
- **Fix:** Move StepIndicator into a shared location (e.g. src/components/shared or src/components/fairway/controls) with the Icon-capable StepConfig shape baseball already has, and have both golf and baseball onboarding wizards import the single component.

### `bugs-auth` — 2 findings

#### bugs-auth-1 · `MEDIUM` · `CONFIRMED`

**getTeamOverview / getTeamCategoryInsights trust a caller-supplied teamId with no ownership check**

- **Where:** `src/app/golf/actions/team-category-insights.ts:322-352` · `src/app/golf/actions/team-category-insights.ts:691-721` · `src/app/golf/actions/stats-intelligence.ts:319-338`
- **Why it matters:** getTeamOverviewImpl and getTeamCategoryInsightsImpl check `session?.coach` (any coach, any team) but then use the caller-supplied `teamIdArg` verbatim with zero staff/org check — an authenticate-only check, not the resource-specific authorization the docstring of validateCoachTeamAccess demands and that the identical-shape sibling action (stats-intelligence.ts) actually performs. Both exported actions (getTeamOverview, getTeamCategoryInsights) are directly invocable Next.js server actions, so any authenticated coach can pass an arbitrary teamId. Verified this is not fully masked by RLS today: golf_team_members' SELECT policy and golf_player_stats_cache's coach-read policy both route through …
- **Evidence:** team-category-insights.ts:342-343 and :711-712 (identical in both functions): if (teamIdArg) { team = { id: teamIdArg }; } // comment above it: "Caller may pass it (e.g. intelligence page) so we skip the redundant org→team lookup." Compare the sibling file's identical-shape parameter, which DOES validate it (stats-intelligence.ts:327-337): let teamId: string | null = teamIdArg ?? null; if (teamId) { // Caller-supplied team id must be validated — the cookie-resolved // fallback path below already goes through this same check inside // resolveCoachTeamIdWithCookie's own validation. const ok = await validateCoachTeamAccess( supabase, session.coach.id, teamId, session.coach.organization_id, ); i…
- **Fix:** In both getTeamOverviewImpl and getTeamCategoryInsightsImpl, replace `team = { id: teamIdArg }` with the same `validateCoachTeamAccess(supabase, session.coach.id, teamIdArg, session.coach.organization_id)` gate already used in stats-intelligence.ts's getTeamStatsIntelligenceImpl, returning `{ success: false, error: 'Unauthorized' }` on failure.
- **Verifier (CONFIRMED):** Read team-category-insights.ts directly. Both getTeamOverviewImpl (line ~322-350) and getTeamCategoryInsightsImpl (line ~688-716) contain the identical block: 'if (teamIdArg) { team = { id: teamIdArg }; }' with the comment 'Caller may pass it (e.g. intelligence page) so we skip the redundant org→team lookup.' — no call to validateCoachTeamAccess or any per-team authorization; only session?.coach is checked (auth, not resource authorization). Conf…

#### bugs-auth-2 · `MEDIUM` · `CONFIRMED`

**getPlayerHubSummaryData has no session/auth check in the action itself**

- **Where:** `src/app/golf/actions/player-hub-data.ts:76-117` · `src/app/golf/actions/player-hub-data.ts:271-276`
- **Why it matters:** getPlayerHubSummaryData(teamId, playerId) is an exported server action reachable directly (not gated by any wrapper — withAdminObserved only adds telemetry) yet performs zero identity check before querying golf_travel_itineraries (hotel/flight/confirmation details), golf_task_assignments/golf_tasks, an events RPC, an announcements RPC, and a top-insight lookup for whatever teamId/playerId the caller supplies. Verified the current production schema backstops every one of these reads independently (golf_travel_itineraries/golf_tasks/golf_task_assignments carry RLS policies scoped to auth.uid() membership; get_player_hub_events and get_player_hub_announcements are SECURITY DEFINER functions wit…
- **Evidence:** async function getPlayerHubSummaryDataImpl( teamId: string, playerId: string, ): Promise<PlayerHubSummaryData> { const supabase = await createClient(); ... // (lines 80-117: five parallel Supabase queries/RPCs keyed only on the caller-supplied teamId/playerId — no supabase.auth.getUser(), getGolfSessionProfile(), or any other identity check anywhere in the function) export async function getPlayerHubSummaryData( teamId: string, playerId: string, ): Promise<PlayerHubSummaryData> { return observedGetPlayerHubSummaryData(teamId, playerId); } withAdminObserved (src/lib/admin/observed-action.ts) is confirmed to be observability-only, not an auth boundary — its own comment says: "the action's own …
- **Fix:** Add an explicit auth + resource check at the top of getPlayerHubSummaryDataImpl before the Promise.all — e.g. resolve the session via getGolfSessionProfile() and confirm the caller is either the player (session.player?.id === playerId) or a coach staffed on teamId (mirroring authorizePlayerAccess in player-effectiveness.ts / validateCoachTeamAccess), returning early on failure rather than relying solely on downstream RLS/RPC checks.
- **Verifier (CONFIRMED):** Read player-hub-data.ts directly. getPlayerHubSummaryDataImpl(teamId, playerId) (lines 76-117) contains five parallel Supabase calls keyed only on the caller-supplied teamId/playerId with no supabase.auth.getUser(), getGolfSessionProfile(), or any other identity check anywhere in the function body. Confirmed the exported wrapper (lines 265-276) is just withAdminObserved(...) with no additional gate. Read observed-action.ts and confirmed withAdmin…

### `server-actions` — 6 findings

#### server-actions-1 · `MEDIUM` · `CONFIRMED`

**src/components/ui/ 'canonical' chart + primitives kit — 11 files, ~15 exports, zero real consumers anywhere in src/**

- **Where:** `src/components/ui/chart-shell.tsx:106` · `src/components/ui/chart-tooltip.tsx:56` · `src/components/ui/chart-legend.tsx:35` · `src/components/ui/chart-legend.tsx:72` · `src/components/ui/containers.tsx:24` · `src/components/ui/containers.tsx:48` · `src/components/ui/filter-chips.tsx:19` · `src/components/ui/pagination.tsx:15` · `src/components/ui/progress-ring.tsx:35` · `src/components/ui/row-actions-menu.tsx:13` · `src/components/ui/secondary-nav.tsx:72` · `src/components/ui/shimmer.tsx:33` · `src/components/ui/shine-effect.tsx:15` · `src/components/ui/index.ts:4`
- **Why it matters:** This is a self-described "canonical" chart/nav/pagination kit that shipped fully built (mobile variants, active-item matching, chart palette tokens) and was never adopted — every product surface instead grew its own parallel ChartTooltip/ChartLegend/pagination/sub-nav. A future contributor grepping for "the canonical chart primitive" or "the single canonical sub-nav" will find and start extending this dead code, producing a second live-but-unused branch, or will waste time debugging a component that renders nowhere.
- **Evidence:** src/components/ui/index.ts:4-8: "Wave W5A introduces the canonical chart primitives — a single chart surface (ChartShell), tooltip (ChartTooltip), legend (ChartLegend)... re-exported here so consumers can `import { ChartShell, ChartTooltip, ChartLegend, CHART_PALETTE } from '@/components/ui'`." src/components/ui/secondary-nav.tsx:4: "SecondaryNav — the single canonical in-section sub-navigation primitive." `grep -rn "import.*ChartShell.*from\|<ChartShell\b" src/` and the same pattern for ChartTooltip, ChartLegend, Pagination, CompactPagination, PageSizeSelector, ProgressRing, RowActionsMenu, Shimmer, ShimmerCard, ContainerGrid, ContainerReading, FilterChips, ChipGroup, BadgeChip, SecondaryNa…
- **Fix:** Either delete src/components/ui/{chart-shell,chart-tooltip,chart-legend,containers,filter-chips,pagination,progress-ring,row-actions-menu,secondary-nav,shimmer,shine-effect}.tsx and the dead index.ts barrel, or if the design intent still stands, migrate one real call site (e.g. replace fairway/charts/ChartTooltip or baseball/stat-visuals/chart-primitives's ChartLegend) onto these primitives to prove they're wired in, then remove the duplicate.
- **Verifier (CONFIRMED):** Verified every cited file/line: chart-shell.tsx:106 `export function ChartShell(`, chart-tooltip.tsx:56 `export function ChartTooltip(`, chart-legend.tsx:35 `export const CHART_PALETTE`, chart-legend.tsx:72 `export function ChartLegend(`, containers.tsx:24/48 (`ContainerGrid`/`ContainerReading`), filter-chips.tsx:19, pagination.tsx:15, progress-ring.tsx:35, row-actions-menu.tsx:13, secondary-nav.tsx:72, shimmer.tsx:33, shine-effect.tsx:15 — all r…

#### server-actions-2 · `MEDIUM` · `CONFIRMED`

**BaseballHelm 'Living Annual' L2 kit — 4 molecules + 2 dependents (7 files) exported via two barrels but never composed into any surface**

- **Where:** `src/components/baseball/living-annual/molecules/GradeStampGrid.tsx:42` · `src/components/baseball/living-annual/molecules/ToolRailStack.tsx:34` · `src/components/baseball/living-annual/ToolRail.tsx:88` · `src/components/baseball/living-annual/molecules/TearSheet.tsx:37` · `src/components/baseball/living-annual/molecules/StatLineStack.tsx:29` · `src/components/baseball/living-annual/viz/BreakPlot.tsx:94` · `src/components/baseball/living-annual/index.ts:98`
- **Why it matters:** This is a design-system L2 layer explicitly built for reuse ("Composed, reused-across-surfaces blocks" per molecules/index.ts:9) alongside actively-used siblings, so it reads as live when skimming the barrel. Two of the six components (ToolRailStack, TearSheet) also drag a same-directory dependency (ToolRail, StatLineStack) with them into unreachability, so this is a 2-deep dead subtree Knip-style export analysis would under-report (it would only flag the roots).
- **Evidence:** src/components/baseball/living-annual/index.ts:98,100 re-export both L2 barrels wholesale: `export * from './molecules';` and `export * from './viz';`. `grep -rn "\bGradeStampGrid\b\|\bToolRailStack\b\|\bTearSheet\b\|\bStatLineStack\b\|\bBreakPlot\b\|\bToolRail\b" src/` (word-boundary, whole-repo) returns matches only inside the molecules/viz directories themselves: ToolRailStack.tsx:14 imports ToolRail from '..' (its only consumer, and ToolRailStack itself has zero external consumers), TearSheet.tsx:17 imports StatLineStack (its only consumer, and TearSheet itself has zero external consumers). Sibling molecules in the SAME barrel (SlashLine, PlayerRowPlate, RecruitCard, CoverHero, EmptyIssu…
- **Fix:** Delete GradeStampGrid.tsx, ToolRailStack.tsx, ToolRail.tsx, TearSheet.tsx, StatLineStack.tsx, BreakPlot.tsx and their barrel export lines, or wire each into the recruiting/evaluation and pitch-break surfaces the doc comments describe (spec §7, §6 P1 #4) if the redesign still wants them.
- **Verifier (CONFIRMED):** Verified index.ts:98,100 `export * from './molecules';` / `export * from './viz';` exist exactly as quoted. Grepped GradeStampGrid, ToolRailStack, TearSheet, StatLineStack, BreakPlot, ToolRail whole-repo: every match is confined to the molecules/viz/living-annual directories and their own barrels — no external app/component consumer. Confirmed ToolRailStack.tsx:14 imports ToolRail from '..' as its sole real usage, and TearSheet.tsx:17 imports Sta…

#### server-actions-3 · `MEDIUM` · `CONFIRMED`

**src/components/baseball/ui/ barrel — half its exports (EvidencePill, PlayerTile, StatusRibbon) are dead; the barrel's own usage example advertises two of them**

- **Where:** `src/components/baseball/ui/EvidencePill.tsx:66` · `src/components/baseball/ui/PlayerTile.tsx:283` · `src/components/baseball/ui/StatusRibbon.tsx:77` · `src/components/baseball/ui/index.ts:7`
- **Why it matters:** The barrel's own header comment (line 7) and EvidencePill's own doc comment (line 57) both assert usage that doesn't exist, so a reader trusting the file's self-description will believe these are live, adopted primitives when they render nowhere.
- **Evidence:** src/components/baseball/ui/index.ts:7 doc comment: `import { CommandCard, EvidencePill, PlayerTile } from '@/components/baseball/ui';`. src/components/baseball/ui/EvidencePill.tsx:57: "EvidencePill — source-evidence chip used by CommandCard and SignalCard." `grep -rn "\bEvidencePill\b\|\bPlayerTile\b\|\bStatusRibbon\b" src/` returns matches only in each component's own file and the barrel re-export — never an import statement or JSX tag elsewhere. Checking the claimed consumers directly: CommandCard.tsx:46 and :152 only mention "EvidencePill" in comments (`/** Accepts EvidencePill nodes... */`), and SignalCard.tsx defines its own separate local `EvidenceList` component (SignalCard.tsx:74) ra…
- **Fix:** Delete EvidencePill.tsx, PlayerTile.tsx, StatusRibbon.tsx and their exports in index.ts, or fix the doc comments and actually wire EvidencePill into CommandCard/SignalCard as originally intended.
- **Verifier (CONFIRMED):** index.ts:7 doc comment quote confirmed verbatim: `import { CommandCard, EvidencePill, PlayerTile } from '@/components/baseball/ui';`. EvidencePill.tsx:57 'EvidencePill — source-evidence chip used by CommandCard and SignalCard' confirmed verbatim (actual line 57 in file). Grepped EvidencePill, PlayerTile, StatusRibbon whole-repo (excluding tests): zero matches anywhere outside their own declaration files. Confirmed CommandCard.tsx only mentions 'E…

#### server-actions-4 · `LOW` · `CONFIRMED`

**LiftLabWelcomeState — deliberately dropped from the lift page but the component and its barrel export were left behind**

- **Where:** `src/components/baseball/performance/lift-onboarding/LiftLabWelcomeState.tsx:27` · `src/components/baseball/performance/lift-onboarding/index.ts:6` · `src/app/baseball/(dashboard)/dashboard/lift/page.tsx:19`
- **Why it matters:** Low risk since the abandonment is explicitly documented at the decision point, but the file and its barrel export still ship in the bundle and will be found by anyone grepping the lift-onboarding barrel, costing a re-investigation cycle to rediscover what the page.tsx comment already settled.
- **Evidence:** src/app/baseball/(dashboard)/dashboard/lift/page.tsx:19-21: "The bespoke LiftLabWelcomeState branded empty state is not carried over — a brand-new athlete with zero upcoming/recent sessions now sees the canonical component's own on-brand EmptyState." `grep -rn "\bLiftLabWelcomeState\b" src/` returns only the component's own declaration (LiftLabWelcomeState.tsx:27) and its barrel re-export (lift-onboarding/index.ts:6) — no import anywhere, including in lift/page.tsx itself, which only mentions the name in a comment explaining the removal.
- **Fix:** Delete LiftLabWelcomeState.tsx and its export in lift-onboarding/index.ts now that page.tsx:19-21 confirms the canonical EmptyState replaced it.
- **Verifier (CONFIRMED):** lift/page.tsx:19-21 comment quote confirmed verbatim: 'The bespoke LiftLabWelcomeState branded empty state is not carried over — a brand-new athlete...sees the canonical component's own on-brand EmptyState.' index.ts:6 `export { LiftLabWelcomeState } from './LiftLabWelcomeState';` confirmed. LiftLabWelcomeState.tsx:27 `export function LiftLabWelcomeState(...)` confirmed. Whole-repo grep for LiftLabWelcomeState finds only: its own declaration, its…

#### server-actions-5 · `MEDIUM` · `CONFIRMED`

**golf/coachhelm/settings — AlertTypeToggles superseded and unused; WeightDistributor's doc comment falsely claims a live consumer**

- **Where:** `src/components/golf/coachhelm/settings/AlertTypeToggles.tsx:11` · `src/components/golf/coachhelm/settings/WeightDistributor.tsx:25` · `src/components/fairway/pages/settings/FairwaySettingsCoachingIntelligence.tsx:26` · `src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx:26`
- **Why it matters:** AlertTypeToggles is straightforward superseded dead code. WeightDistributor is a deliberate placeholder with a live TODO, but its own doc comment is now factually wrong — it claims consuming pages need it unchanged, when no consumer imports it at all (the legacy page it names is gone). A reader following the comment would look for a caller that doesn't exist.
- **Evidence:** AlertTypeToggles: `grep -rn "\bAlertTypeToggles\b" src/` finds only its own declaration and the barrel `export * from './AlertTypeToggles'` (settings/index.ts:6); the one prose reference is FairwaySettingsCoachingIntelligence.tsx:26-27: "that section is rendered directly with the Fairway `Switch` primitive instead of the shared AlertTypeToggles editor". WeightDistributor: its own doc comment (WeightDistributor.tsx:25-28) asserts "The `values`/`onChange` props are intentionally kept so the consuming settings pages (legacy + Fairway) need no change" — but the legacy page no longer exists as a route (src/app/golf/(dashboard)/dashboard/settings/coaching-intelligence/page.tsx:26 renders only `<Fa…
- **Fix:** Delete AlertTypeToggles.tsx and its barrel export. For WeightDistributor, either correct the doc comment to state it currently has zero importers (both consuming pages have moved on), or restore an actual render call in FairwaySettingsCoachingIntelligence per the P079 TODO.
- **Verifier (CONFIRMED):** AlertTypeToggles.tsx:11 `export function AlertTypeToggles(...)` confirmed; whole-repo grep finds only its own declaration, `settings/index.ts:6: export * from './AlertTypeToggles';`, and the one prose reference in FairwaySettingsCoachingIntelligence.tsx:27 (comment) — no real import. WeightDistributor.tsx:25-28 doc-comment quote confirmed verbatim ('The `values`/`onChange` props are intentionally kept so the consuming settings pages (legacy + Fai…

#### server-actions-6 · `MEDIUM` · `CONFIRMED`

**HeroInsightCard — barrel and neighboring-file comments both assert it's composed into the CoachHelm dashboard; nothing imports it**

- **Where:** `src/components/golf/coachhelm/insight-card/HeroInsightCard.tsx:32` · `src/components/golf/coachhelm/insight-card/index.ts:20` · `src/components/golf/coachhelm/player/index.ts:7`
- **Why it matters:** The similarly-named internal `HeroInsightCardInner` makes this easy to mistake for "used" on a quick read, and the player/index.ts comment actively asserts the dashboard composes it — a reader will conclude the hero-density wrapper is live CoachHelm UI when it is not reachable from any route.
- **Evidence:** src/components/golf/coachhelm/player/index.ts:6-8: "`AIInsightsPanel` removed in the 2026-04-22 Insight Delivery refactor — the CoachHelm dashboard now composes HeroInsightCard + InsightCard (default) from `@/components/golf/coachhelm/insight-card` instead." `grep -rn "HeroInsightCard" src/` shows the only real code reference is `HeroInsightCardInner`, a distinct, unexported, private component defined inside InsightCard.tsx (line 555) — not the exported `HeroInsightCard` wrapper. The actual `HeroInsightCard` export (HeroInsightCard.tsx:32, re-exported at insight-card/index.ts:20) has no import statement anywhere in src/ outside its own file and barrel.
- **Fix:** Delete HeroInsightCard.tsx and its barrel export if InsightCard's internal hero-density rendering (density='hero') already covers the need, or replace the internal HeroInsightCardInner usage in InsightCard.tsx with the actual exported HeroInsightCard wrapper if the two were meant to be the same thing.
- **Verifier (CONFIRMED):** player/index.ts:6-8 comment quote confirmed verbatim: '`AIInsightsPanel` removed...the CoachHelm dashboard now composes HeroInsightCard + InsightCard (default) from `@/components/golf/coachhelm/insight-card` instead.' Confirmed `HeroInsightCardInner` is a distinct, separately-named private component defined inside InsightCard.tsx (declared line 555-556, used internally at line 276) — genuinely different from the exported `HeroInsightCard` wrapper…

### `config-drift` — 4 findings

#### config-drift-1 · `HIGH` · `CONFIRMED`

**New React #310 regression test mocks the exact component it claims to guard — never imports the real SmoothScrollMount**

- **Where:** `src/test/golf/players/genome-not-found-hooks.test.tsx:21-63` · `src/test/golf/players/genome-not-found-hooks.test.tsx:118-128` · `src/components/golf/layout/SmoothScrollMount.tsx:60` · `src/app/golf/(dashboard)/dashboard/layout.tsx:69`
- **Why it matters:** This test file (added today, commits 3179cc52a/a826f13e4) was written specifically to guard against React #310 'Rendered more hooks than during the previous render', which the file's own docstring says has 4 confirmed production hits on genome/game routes. But it never imports `SmoothScrollMount` from `src/components/golf/layout/SmoothScrollMount.tsx` (the real component mounted in the dashboard layout at layout.tsx:69) — it hand-writes a `MockDashboardShell` that merely 'replicates' the hook structure by guesswork. The second test's own comment admits it can't test the real component and ends in `expect(true).toBe(true)` as a placeholder. If the real SmoothScrollMount regresses into conditi…
- **Evidence:** function MockDashboardShell({ children }: { children: React.ReactNode }) { 'use client'; ... } // (test file, no import of the real SmoothScrollMount) ... it('SmoothScrollMount hook calls must remain constant regardless of route availability', () => { ... // This is harder to test directly without importing the real SmoothScrollMount, ... // If this test passes, the hook structure is sound. expect(true).toBe(true); // placeholder for more specific assertions });
- **Fix:** Import and render the real SmoothScrollMount (and the actual dashboard layout tree) in the loading→not-found rerender, or delete the second 'placeholder' test entirely rather than leaving a green no-op that looks like coverage.
- **Verifier (CONFIRMED):** Opened src/test/golf/players/genome-not-found-hooks.test.tsx in full: no import of SmoothScrollMount anywhere (only React + testing-library imports). MockDashboardShell is hand-defined at lines 34-66 with a comment 'We replicate the hook structure to verify consistency' — a guess, not the real component. The real SmoothScrollMount (src/components/golf/layout/SmoothScrollMount.tsx:60, `export function SmoothScrollMount()`) is unconditionally mount…

#### config-drift-2 · `HIGH` · `CONFIRMED`

**Golf coach-role E2E specs are permanently skipped in CI — GOLFHELM_COACH_EMAIL/PASSWORD are never set**

- **Where:** `e2e/fixtures/golf-auth.ts:80-82` · `e2e/golf-critical-paths.spec.ts:26` · `e2e/golf-qualifier.spec.ts:32` · `.github/workflows/playwright.yml:58-59`
- **Why it matters:** coachTest.describe('GolfHelm — Coach critical paths', ...) in golf-critical-paths.spec.ts (roster, calendar, messaging, intelligence dashboards) and the coach-role qualifier-creation block in golf-qualifier.spec.ts both gate on hasGolfCoachAuth, which is unconditionally false in every CI run since the required secret pair is never provisioned. These specs have never executed in CI and give zero regression coverage for the golf coach experience, while appearing in the suite as legitimate (if skipped) coverage.
- **Evidence:** export const hasGolfCoachAuth = Boolean( process.env.GOLFHELM_COACH_EMAIL && process.env.GOLFHELM_COACH_PASSWORD, ); (golf-auth.ts:80-82, no fallback to E2E_GOLF_*, unlike hasGolfPlayerAuth). playwright.yml's env: block only sets E2E_GOLF_EMAIL / E2E_GOLF_PASSWORD (lines 58-59) plus four E2E_BASEBALL_* vars — GOLFHELM_COACH_EMAIL and GOLFHELM_COACH_PASSWORD appear nowhere in .github/workflows/.
- **Fix:** Add GOLFHELM_COACH_EMAIL/GOLFHELM_COACH_PASSWORD as repo secrets and wire them into playwright.yml's env block (mirroring E2E_GOLF_*/E2E_BASEBALL_COACH_* which already exist), or add a fallback to existing golf coach credentials if one exists, so these specs actually run.
- **Verifier (CONFIRMED):** e2e/fixtures/golf-auth.ts:80-82 defines hasGolfCoachAuth as Boolean(process.env.GOLFHELM_COACH_EMAIL && process.env.GOLFHELM_COACH_PASSWORD) with no E2E_GOLF_* fallback (unlike hasGolfPlayerAuth at lines 76-79, which does fall back to E2E_GOLF_EMAIL/PASSWORD). Confirmed .github/workflows/playwright.yml's env: block (lines 55-65) sets only NEXT_PUBLIC_SUPABASE_*, E2E_GOLF_EMAIL/PASSWORD, SUPABASE_SERVICE_ROLE_KEY, and four E2E_BASEBALL_* vars — gr…

#### config-drift-3 · `MEDIUM` · `UNVERIFIED`

**approach-analytics.test.ts skip cites a resolved blocker (Plan 03 emit shape) but the real reason — a sample-size gate the fixture never met — predates the skip and wasn't fixed**

- **Where:** `src/test/coachhelm/v2/mining/approach-analytics.test.ts:199-224` · `src/lib/coachhelm/v2/mining/approach-analytics.ts:45` · `src/lib/coachhelm/v2/mining/approach-analytics.ts:487-490` · `src/lib/coachhelm/v2/mining/approach-analytics.ts:436`
- **Why it matters:** The skip's stated blocker (Plan 03 normalizing the emit shape via BaselineRegistry) already landed for this file's comparison_source field back on 2026-05-17. But the skipped test's fixture creates only 9 rows against a MIN_SAMPLES_FOR_SEVERITY gate of 15 that has existed since 2026-04-28 — before this skip was ever written. Un-skipping today, even with 'corrected assertions' for the emit shape, would still fail: the function returns early on insufficient sample and never emits the insight the test asserts on. Anyone trusting the stated blocker will fix the wrong thing.
- **Evidence:** Test: '// TODO(plan-03): un-skip after Plan 03 (CoachHelm evidence contract)\n // finalizes the approach-analytics emit shape...' then it.skip('emits the severity insight when avg distance_from_green exceeds 1.5x baseline', ...) with 'const rows = Array.from({ length: 9 }, ...)'. Source: 'const MIN_SAMPLES_FOR_SEVERITY = 15;' (introduced 2026-04-28, commit 4bb5768d8) and 'if (stats.n < MIN_SAMPLES_FOR_SEVERITY) { ... return; }' (approach-analytics.ts:487-489). Separately, comparison_source already reads 'absolute_target' elsewhere in the same file (line 436, dated '2026-05-17: was peer_percentile').
- **Fix:** Update the fixture to create >=15 missed-approach rows (matching the current sample gate) before un-skipping, and correct the SKIPPED.md/TODO comment to name the sample-size gate as a second, independent blocker.

#### config-drift-4 · `MEDIUM` · `UNVERIFIED`

**EvidencePanel/InsightCard skips are attributed to 'user's uncommitted WIP' that has actually been merged and stable for weeks, and one masks a structural behavior change, not a pending tweak**

- **Where:** `src/test/SKIPPED.md` · `src/test/golf/components/EvidencePanel.test.tsx:109-125` · `src/components/golf/coachhelm/insights/EvidencePanel.tsx:349-376` · `src/test/golf/components/InsightCard.test.tsx:408-423` · `src/components/golf/coachhelm/insight-card/InsightCard.tsx:700-712`
- **Why it matters:** The EvidencePanel compact redesign landed in commit ffd0fd8ab (2026-07-09) and the InsightCard modal flow landed in PR #1009 (2026-07-23) — both committed and unchanged since, not 'uncommitted WIP'. SKIPPED.md's last edit (2026-07-30) postdates both landings, so the framing was already stale when it was last reviewed. Whoever eventually 'finalizes the sweep' per the doc's instructions will find there's no WIP to finalize — EvidencePanel needs a rewritten assertion set (the testid the test looks for no longer exists) and InsightCard needs an async modal-interaction test, not a one-line tweak.
- **Evidence:** SKIPPED.md: 'These component tests drifted because the user's uncommitted WIP modified component behavior... The user is expected to update these specs as part of finalizing the sweep.' Test expects `screen.getByTestId('evidence-your-value')` in compact mode, but the current EvidencePanel compact branch (lines 349-376) renders only `v3Standing`/BenchmarkScale plus `evidence-sample`, `evidence-impact`, `evidence-confidence` testids — no `evidence-your-value` exists anywhere in the file. Separately, InsightCard's skipped test expects clicking `action-create-focus-area` to call `onAction('create_focus_area', ...)` directly, but the current handler is `onClick={(e) => { e.stopPropagation(); setO…
- **Fix:** Rewrite EvidencePanel's compact test against the current v3Standing/evidence-sample/evidence-impact/evidence-confidence structure, and rewrite InsightCard's two tests to open the FocusAreaModal and assert on its submit path calling createFocusAreaFromInsightV2, then update SKIPPED.md to drop the 'uncommitted WIP' framing.

### `routes-nav` — 1 finding

#### routes-nav-1 · `LOW` · `CONFIRMED`

**Three surface-registry entries for distinct player-detail routes share one identical, non-routable href**

- **Where:** `src/lib/golf/surface-registry.ts:120` · `src/lib/golf/surface-registry.ts:121` · `src/lib/golf/surface-registry.ts:124` · `src/lib/golf/nav-registry.ts:143` · `src/lib/golf/surface-registry.test.ts:225`
- **Why it matters:** The registry's own type contract calls `href` the 'Canonical destination route (absolute, starts with /golf/dashboard)', and `surfaceHref()` exists precisely so a consumer never hand-writes a wrong link. For these three ids the field cannot do that job: 'Scouting Report' really lives at `/players/[id]/game?tab=scouting`, 'Game Fingerprint' at `/players/[id]/game`, and 'Genome' at `/players/[id]/genome` (confirmed on disk: only `players/[playerId]/game/page.tsx` and `players/[playerId]/genome/page.tsx` exist -- there is no `page.tsx` directly under `players/`, so the bare `/golf/dashboard/players` href these three entries share resolves to `src/app/golf/(dashboard)/dashboard/not-found.tsx`, n…
- **Evidence:** { id: 'player-insight', canonicalName: 'Scouting Report', href: '/golf/dashboard/players', role: 'coach', group: 'page' }, { id: 'player-game', canonicalName: 'Game Fingerprint', href: '/golf/dashboard/players', role: 'coach', group: 'page' }, ... { id: 'genome-detail', canonicalName: 'Genome', href: '/golf/dashboard/players', role: 'coach', group: 'page' },
- **Fix:** Either give each entry its real, distinguishable href (e.g. append a `${'{playerId}'}` template marker documented as such, or store the /game and /genome suffixes explicitly) or, if a per-player id can't be modeled in this static table, remove the three entries (or mark them `hidden: true`) so the registry's orphan-guard and the `href` contract stop implying a resolvable destination that doesn't exist. Also tighten the orphan-detection test in surface-registry.test.ts so a shared substring like …
- **Verifier (CONFIRMED):** Every factual assertion checks out against the source. surface-registry.ts:120/121/124 all set href: '/golf/dashboard/players' verbatim for ids 'player-insight', 'player-game', 'genome-detail' — confirmed by direct read. The type contract at surface-registry.ts:63 literally says '/** Canonical destination route (absolute, starts with /golf/dashboard). */'. On disk, `src/app/golf/(dashboard)/dashboard/players/` contains only a `[playerId]` subdire…

### `test-health` — 6 findings

#### test-health-1 · `HIGH` · `UNVERIFIED`

**helm-website-ui/ is a confirmed-dead directory still sitting at repo root, and dependabot.yml drifted from its own removal commit**

- **Where:** `.github/dependabot.yml:70` · `tsconfig.json:69` · `helm-website-ui/ (root)`
- **Why it matters:** A new agent doing `ls` at repo root sees a directory that looks like a live, actively-dependency-bot-maintained Next.js subproject (reinforced by dependabot.yml still configuring monthly scans of it), when the team has twice declared it dead. Dependabot's `/helm-website-ui` job now silently fails or no-ops every month against a path with no package.json, wasting a CI slot and producing misleading dependency-bot activity (or silence) that nobody will think to question because the commit message already claims it was cleaned up.
- **Evidence:** Commit 761bea048 ("chore: devibe wave 1 follow-up - remove helm-website-ui/ and helm-intelligence/") states: "helm-website-ui/ (86 files) - a v0.dev scaffold (\"my-v0-project\"), verified NOT a deployed Vercel project... Removes the corresponding '/helm-website-ui' and '/helm-intelligence/typescript' npm-ecosystem entries from .github/dependabot.yml so Dependabot stops scanning paths that no longer exist." Yet `.github/dependabot.yml:70` currently still reads `directory: "/helm-website-ui"` under a monthly npm-ecosystem job, and `tsconfig.json:69` still excludes `"helm-website-ui"`. `git ls-tree HEAD -- helm-website-ui` returns nothing (0 tracked files, confirming the git-rm happened), but t…
- **Fix:** Delete the leftover on-disk helm-website-ui/ tree (git-untracked, safe to rm -rf), then actually remove the `/helm-website-ui` npm-ecosystem block from `.github/dependabot.yml` and the `"helm-website-ui"` entry from `tsconfig.json`'s exclude array, closing the gap between the commit message's claim and the current file state.

#### test-health-2 · `HIGH` · `UNVERIFIED`

**docs/ is 145M and 85% of that weight (124M) is dated screenshot/audit-run output mixed flat into the same tree as living reference docs**

- **Where:** `docs/qa/` · `docs/ui-audits/` · `docs/redesign/`
- **Why it matters:** A new agent trying to orient in docs/ (1,432 md files) cannot tell from directory names alone which subtrees are current reference material versus disposable screenshot dumps from one-off QA/redesign passes; the three heaviest subtrees by far are all the latter, but nothing distinguishes them from docs/architecture or docs/features at a glance, and their bulk (124M of 145M) makes any full-tree search or clone slower for no ongoing value.
- **Evidence:** du -sh shows docs/qa/ = 69M (108 PNGs + 17 md under a single dated run: docs/qa/baseball-fairway-visual-audit-2026-07-04/), docs/ui-audits/ = 39M (298 PNGs across four dated shot batches: shots-2026-08-15, shots-2026-08-15-PRE-DEPLOY-BASELINE, shots-2026-08-16, shots-2026-08-15-POST-DEPLOY-PARTIAL), docs/redesign/ = 16M (mockup jpg/png/html/js/css under marketing-overhaul-2026-06-18/). That is 124M of docs' 145M total, sitting as siblings to genuinely-curated reference subtrees like docs/architecture (64K), docs/features (704K), and docs/guides (48K).
- **Fix:** Move dated, single-run screenshot/mockup output (docs/qa/*, docs/ui-audits/shots-*, docs/redesign/*/mockups and /research image assets) out of docs/ entirely — into a gitignored local artifacts directory or, if historical value is wanted, into docs/archive/ following the precedent already set by docs/archive/2026-07-devibe/. Keep only the written findings (the .md summaries) in docs/ if anything from these runs needs to stay discoverable.

#### test-health-3 · `MEDIUM` · `UNVERIFIED`

**Root-level landing/components/ is a dead, unimported directory that duplicates and shadows the live src/components/landing/**

- **Where:** `landing/components/Hero.tsx` · `landing/components/FinalCTA.tsx` · `landing/components/Navigation.tsx` · `landing/components/MobileNav.tsx` · `landing/components/ScrollProgress.tsx` · `src/components/landing/`
- **Why it matters:** An agent asked to edit the landing hero or nav has two similarly-named candidate locations at first glance (root `landing/components/Hero.tsx` and `src/components/landing/LandingHero.tsx`); editing the root copy silently does nothing since it's never imported, wasting a full edit-test cycle before the mistake is discovered.
- **Evidence:** `git ls-files landing` returns exactly 5 tracked files (Hero.tsx, ScrollProgress.tsx, FinalCTA.tsx, MobileNav.tsx, Navigation.tsx) at repo-root `landing/components/`. A repo-wide grep for any import of `landing/components` (`grep -rln "from ['\"].*landing/components" . --include="*.ts*" --include="*.js*" --include="*.json"`, excluding node_modules) returns zero hits anywhere in the codebase. Meanwhile the actual, live marketing UI lives in `src/components/landing/` (19 files including LandingHero.tsx, FinalCTASection.tsx, LandingHeader.tsx, LandingFooter.tsx, Footer.tsx) — near-1:1 name overlaps with the dead root copies (Hero vs LandingHero, FinalCTA vs FinalCTASection, Navigation vs Landin…
- **Fix:** Delete the root-level landing/ directory (confirmed unreferenced) so src/components/landing/ is the single, unambiguous home for marketing UI.

#### test-health-4 · `MEDIUM` · `UNVERIFIED`

**docs/v3-testing-standards.md presents CodeRabbit as an active, current PR gate, contradicting the authoritative code-review-tooling.md**

- **Where:** `docs/v3-testing-standards.md:210-212` · `.claude/rules/code-review-tooling.md`
- **Why it matters:** An agent that reads docs/v3-testing-standards.md before touching CoachHelm v3 test code (as its own intro instructs: "Every v3 PR's verification checklist includes these as gates") will believe CodeRabbit review is still a real, blocking gate and may reference or wait on it, when the actual current gate is the Review Gate workflow's ast-grep/semgrep packs.
- **Evidence:** docs/v3-testing-standards.md:212 states, in present tense with no date/supersede qualifier: "Every PR is also reviewed by **CodeRabbit** against `.coderabbit.yaml`." The file's last commit is 2026-05-26 and carries no SUPERSEDED banner (unlike its sibling docs/v3-master-plan.md, which explicitly opens with `STATUS: SUPERSEDED`). This directly contradicts `.claude/rules/code-review-tooling.md`, loaded on every session, which states: "the external AI reviewers (CodeRabbit, Greptile) were DROPPED by founder decision — CodeRabbit's credit quota had become the slowest step in shipping... `.coderabbit.yaml` is now a disable stub."
- **Fix:** Add the same SUPERSEDED/date-qualifier treatment already applied to v3-master-plan.md, or strike the CodeRabbit-specific claims and point to `.claude/rules/code-review-tooling.md` / `docs/CI_RUNBOOK.md` as the living source of truth for current review gates.

#### test-health-5 · `LOW` · `UNVERIFIED`

**core/__init__.py — an orphaned, empty Python package stub at repo root with zero references anywhere**

- **Where:** `core/__init__.py`
- **Why it matters:** In an otherwise pure TypeScript/Next.js repository, a top-level `core/` Python package directory with no content and no referrer is pure noise that a new agent has to investigate and rule out before concluding it's inert.
- **Evidence:** `find core -type f` returns exactly one file, `core/__init__.py`, which is 0 bytes (`wc -c` confirms). A repo-wide grep for `core` as a directory/module reference across *.json, *.md, *.yml, *.yaml, *.py (excluding node_modules and npm packages named core-js/corepack) finds no hit that refers to this directory — the only two matches were unrelated (`@stryker-mutator/core`, an npm package name).
- **Fix:** Delete core/ — nothing imports or builds against it.

#### test-health-6 · `LOW` · `UNVERIFIED`

**Two unrelated commits incidentally dragged loose, undocumented non-code files into repo root and they've sat there since**

- **Where:** `.coachhelm-fix-progress.md` · `helm-newsletter-march-2026.docx` · `helm-newsletter-march-2026.html`
- **Why it matters:** These are exactly the kind of loose root files the project's own July cleanup (commit 761bea048, "devibe wave 1") targeted and moved into docs/archive/2026-07-devibe/ — but these three predate/postdate that sweep and were missed, so the precedent set by that cleanup (no undocumented docs at repo root) has already silently regressed twice.
- **Evidence:** `.coachhelm-fix-progress.md` (7.2k, tracked) was last touched by commit "fix(golf): close authorization and tenancy holes found by deepsec wave 1 (#1220)" (2026-08-02) — a security-fix commit unrelated to CoachHelm progress notes. `helm-newsletter-march-2026.docx` (143k) and `.html` (29k) were both last touched by "Final iOS resubmission polish: admin gated on native, global offline banner, demo data seeded" (2026-04-11) — an iOS-submission commit unrelated to a newsletter. None of the three is referenced by README.md, CONTRIBUTING.md, or anything under docs/ or memory/ (verified by grep).
- **Fix:** Move .coachhelm-fix-progress.md and the newsletter docx/html into docs/archive/ (or delete if genuinely obsolete), following the same pattern the devibe-wave-1 cleanup already established.

### `db-migrations` — 1 finding

#### db-migrations-1 · `MEDIUM` · `CONFIRMED`

**crm_email_templates_backup_20260720 exists in generated types but no migration creates it**

- **Where:** `src/lib/types/database.ts:9390` · `supabase/migrations/20260721002502_harden_crm_template_backup.sql:1`
- **Why it matters:** A database rebuilt from this migrations folder alone (a fresh environment, the CI "shadow-DB replay" pattern this repo's own migration comments describe elsewhere, or a disaster-recovery restore) will never have this table, so it silently diverges from prod. Meanwhile src/lib/types/database.ts advertises it as a real, typed table in the public schema — Database['public']['Tables']['crm_email_templates_backup_20260720'] — so any code (or a future Supabase-typed query) that references it type-checks against a table that migrations cannot reproduce. It is also permanent clutter in the type surface: a one-off 2026-07-20 backup with no owning migration, no lifecycle, and no path to being dropped.
- **Evidence:** supabase/migrations/20260721002502_harden_crm_template_backup.sql: "-- A production-side backup created on 2026-07-20 inherited the API roles'\n-- default table grants. It is operational backup data, not an application\n-- surface: deny both API roles and enable RLS with no policies.\ndo $$\nbegin\n if to_regclass('public.crm_email_templates_backup_20260720') is not null then\n execute 'revoke all on table public.crm_email_templates_backup_20260720 from anon, authenticated';\n execute 'alter table public.crm_email_templates_backup_20260720 enable row level security';\n end if;\nend\n$$;" -- this is the ONLY migration in supabase/migrations/*.sql that mentions the table, and it only condition…
- **Fix:** Add a migration that either (a) formally CREATE TABLEs crm_email_templates_backup_20260720 (documenting it as a point-in-time backup, matching its current columns) so migration history matches prod, or (b) DROP TABLE it now that 20260721002502 has already locked it down, and regenerate database.ts so the type no longer references a table nothing creates.
- **Verifier (CONFIRMED):** Opened both files. src/lib/types/database.ts:9345 (crm_email_templates_backup_20260720 block) sits inside the public schema's Tables: {} (Tables: at line 41, public: at line 40), immediately following crm_email_templates, with all 14 columns nullable in Row/Insert/Update as claimed. grep -rl across supabase/migrations/*.sql shows exactly one file mentions the table name: 20260721002502_harden_crm_template_backup.sql, whose full contents I read ve…


---

## Method, and its limits

Each dimension ran as an independent agent with no knowledge of the others, then
every finding was handed to a **skeptic instructed to refute it** — checking the
specific ways such claims go wrong: the "duplicate" files that differ on
inspection, the "dead" export referenced dynamically or through a barrel, the
"bug" already guarded by its caller, the severity inflated past what is reachable
in production.

Only what survived reaches the main report. This file keeps the rest.

**What this method cannot tell you:** nothing was executed. Every claim comes
from reading source, querying the database read-only, or inspecting git — not
from observing a failure. The `UNVERIFIED` rows in particular have had no second
pair of eyes at all.

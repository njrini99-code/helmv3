# CodeRabbit / Review Gate failure investigation — 2026-05-28

**Author:** investigation agent (read-only)
**Scope:** 14 PRs landed today (#92, #94, #117 – #127)
**TL;DR:** Every PR fails an identical set of Review Gate checks. The
failures are **inherited from `main`**, not introduced by today's PRs.
Two distinct root causes — (a) the Review Gate workflow runs ast-grep
and semgrep rules repo-wide instead of honoring the scopes in
`.coderabbit.yaml`'s `path_instructions`, and (b) the
`no-bare-table-names` rule matches `supabase.storage.from('documents')`
which is a Storage **bucket** identifier, not a database table.

---

## 1. Failure tally across the 14 PRs

Per-PR failed Review Gate jobs (collected from `gh pr view <n> --json statusCheckRollup`):

| PR | ast-grep | semgrep | actionlint | yamllint | shellcheck | ruff+pylint | Review Gate `all` | Other |
|---:|:--------:|:-------:|:----------:|:--------:|:----------:|:-----------:|:-----------------:|:-----|
| 92  | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 94  | x | x | x | x | x | x | x | block-historical-edits, Playwright, Supabase RLS |
| 117 | x | x | x | x | x | x | x | build, Playwright, block-historical-edits, Supabase RLS |
| 118 | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 119 | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 120 | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 121 | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 122 | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 123 | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 124 | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 125 | x | x |    | x | x | x |    | Supabase RLS *(docs-only PR — still fails Review Gate)* |
| 126 | x | x | x | x | x | x | x | build, Playwright, Supabase RLS |
| 127 | x | x | x | x | x | x | x | Playwright, Supabase RLS |

The **same six Review Gate jobs** (ast-grep, semgrep, actionlint,
yamllint, shellcheck, ruff+pylint) fail on every PR that touches any
file. PR #125 is docs-only and still fails ast-grep, semgrep,
yamllint, shellcheck, and ruff+pylint — proving every failure is
inherited from `main`, independent of the PR diff.

Spot-check confirming inheritance: same rule output on the oldest PR
(#117 run `26545935342` 23:58Z) and the newest (#127 run `26549116241`
01:31Z) — both fire `helmv3-no-bare-table-names` at
`src/app/baseball/actions/documents.ts:169:42`. No PR today touched
that file (last modified `b1fd78f2`, 2026-04-21).

---

## 2. ast-grep — rule-by-rule breakdown (run 26549116241, PR #127)

From the failed log:

| Rule | Errors | Verdict |
|------|-------:|---------|
| `helmv3-no-console-log-in-src` | **259** | Inherited noise — files like `src/lib/admin-logger-client.ts` (last touched `d002cf24`, 2026-04-22) |
| `helmv3-no-process-env-in-edge` | **197** | **Misconfigured** — see §4.1 |
| `helmv3-no-bare-table-names` | **22**  | **Misconfigured** — see §4.2 |
| `helmv3-no-service-role-key` | **14** | **Misconfigured** — see §4.3 |

Total: **492** ast-grep errors. Zero introduced by today's diffs
(verified via `git log --since="2026-05-27" -- <file>` on every flagged
path — no hits).

---

## 3. semgrep — fundamental rule-pack breakage (PR #126 + #127)

The semgrep job fails with **rule parse errors**, not findings:

```
[ERROR] Rule parse error in rule coderabbit.semgrep.helmv3-server-action-missing-auth-check:
 Invalid pattern for TypeScript: Stdlib.Parsing.Parse_error
----- pattern -----
export async function $F(...) {
  ...
  $X.from($T)...
  ...
}

[ERROR] Rule parse error in rule coderabbit.semgrep.helmv3-destructive-write-pattern:
 Invalid pattern for TypeScript: Stdlib.Parsing.Parse_error
----- pattern -----
$X.from($T).delete()...
```

Plus ~50 deprecation warnings about exclude/include path globs being
re-anchored under Semgrepignore v2 (e.g.
`src/lib/supabase/admin*` → must become `**/src/lib/supabase/admin*`).

Result: the two **most security-critical** rules in the pack
(`server-action-missing-auth-check`, `destructive-write-pattern`,
which CLAUDE.md calls out as blocking custom_check rules) never
actually run. The semgrep job exits non-zero **only because of the
parse errors**, not because of real findings.

---

## 4. Classification — real vs misconfigured vs inherited

### 4.1 `helmv3-no-process-env-in-edge` — **MISCONFIGURED** (197 false positives)

Rule note in the YAML literally says: *"This rule is scoped to
`supabase/functions/` via `.coderabbit.yaml` path_instructions."* But
the Review Gate workflow at `.github/workflows/review-gate.yml:46-55`
runs `sg scan --rule "$rule" --error` against the **entire repo** with
no `--paths` filter. The 197 hits are mostly legitimate Node-side
`process.env.X` usage in `src/lib/email/*`, `src/lib/notifications/*`,
`scripts/*` — all of which run on Node, not Deno, where `process.env`
is correct.

**Fix:** either (a) bake the path scope into the rule's `rule.files`
section, or (b) add `--paths "supabase/functions/**"` to the workflow
step, or (c) split the loop in `review-gate.yml` to read scope from a
sibling `*.scope` file per rule.

### 4.2 `helmv3-no-bare-table-names` — **MISCONFIGURED** (22 false positives)

The rule patterns include `$X.from("documents")`, `$X.from("travel")`,
`$X.from("messages")` etc. — but these patterns also match Supabase
**Storage** calls, e.g.:

```ts
// src/app/baseball/actions/documents.ts:169
const { error: uploadError } = await supabase.storage
  .from('documents')      // <-- Storage bucket, NOT a DB table
  .upload(path, file)
```

Storage buckets live in a separate namespace (`storage.buckets`) and
have nothing to do with the sport-prefix policy that the rule
enforces. Every one of the 22 errors is a storage call against a
bucket named `documents`, not a database table.

**Fix:** add an `inside` / `precedes` constraint so the rule only
fires for `supabase.from(...)` and `<client>.from(...)` where the
`from` is **not** preceded by `.storage`. Easiest implementation:
add `pattern-not-inside: $X.storage` (semgrep) or `inside: { not: { pattern: $X.storage } }` (ast-grep).

### 4.3 `helmv3-no-service-role-key` — **MISCONFIGURED** (14 false positives)

Same shape as 4.1. The rule says it expects path-scoping via
`.coderabbit.yaml`, but the Review Gate runs it everywhere. All 14
hits are in **admin-only / scripts / cron** paths that legitimately
need the service role: `src/lib/supabase/admin.ts`, `scripts/*.ts`,
`src/lib/auth/supabase-rate-limit.ts`, `src/lib/notifications/push.ts`.

**Fix:** bake the exclude list into the rule (the same exclude list
already exists in `.coderabbit/semgrep/helmv3.yml` for the equivalent
semgrep rule `helmv3-service-role-outside-admin`).

### 4.4 `helmv3-no-console-log-in-src` — **INHERITED NOISE** (259 hits)

Largest count by far. Files like `src/lib/admin-logger-client.ts`
(last touched 2026-04-22) and various instrumentation modules. These
predate the rule and were never cleaned up. Today's PRs did not add
new violations.

**Fix:** either (a) clean up the existing baseline in a dedicated
sweep PR, or (b) add an explicit allow-list for known
instrumentation/logger files where `console.log` is intentional, or
(c) downgrade severity to `warning` until the baseline is zero.

### 4.5 semgrep `helmv3-server-action-missing-auth-check` + `helmv3-destructive-write-pattern` — **MISCONFIGURED** (rule parse errors)

The TypeScript patterns are not valid semgrep syntax. The
`export async function $F(...) { ... $X.from($T)... ... }` form
parses as JS but not as semgrep TypeScript. Result: both rules
**never run**, but the semgrep job itself fails because of the parse
error — masking real findings from the other 9 valid rules in the
pack.

**Fix:** rewrite both rules using `pattern-inside` + simpler
sub-patterns. Example:

```yaml
patterns:
  - pattern-inside: |
      export async function $F(...) {
        ...
      }
  - pattern: $X.from($T)
  - pattern-not-inside: |
      ...
      $Y.auth.getUser()
      ...
```

### 4.6 yamllint — **INHERITED NOISE**

Firing on `./age-ratings-snapshot.yml` (committed 2026-04-11,
`2390f8ef`). Not touched by any of today's PRs. ~200 indentation
errors in a single asset file.

**Fix:** add `age-ratings-snapshot.yml` to a yamllint ignore file, or
delete it if it's truly unused.

### 4.7 shellcheck + actionlint — **INHERITED NOISE**

shellcheck fails on `scripts/apply-migration.sh:25` SC2155 (last
modified 2026-01-08). actionlint reports SC2086/SC2071/SC2251 in
`.github/workflows/ci.yml`, `migration-lockdown.yml`, `review-gate.yml`
— none of which were modified by today's PRs.

**Fix:** trivial — quote the variable on line 25 of `apply-migration.sh`
and address the three workflow shellcheck nags.

### 4.8 ruff + pylint — **INHERITED NOISE**

Failing on `tools/continuous-improvement/comprehensive_agent.py`
F401 unused imports + F541 f-strings without placeholders. Not part
of any of today's PR diffs.

**Fix:** add to ruff ignore or clean up.

### 4.9 Real custom_check hits — **NONE**

Checked the five blocking custom_check rules from CLAUDE.md:

| custom_check rule | Trips on today's diffs? |
|-------------------|:-----------------------:|
| service-role-in-client | No (all hits are in admin/scripts) |
| missing-RLS-on-new-table | No (the rule's semgrep file glob is broken — see §3) |
| server-action-without-auth-check | **Rule itself doesn't parse** (§4.5) |
| sport-prefixed-table-name | False positives only (§4.2) |
| destructive-DELETE-then-INSERT | **Rule itself doesn't parse** (§4.5) |

Net: zero legitimate blocking findings were surfaced today. The gate
is firing at 100% but catching nothing real.

---

## 5. Recommended next step (priority order)

1. **P0 — Unblock merges today.** Two surgical PRs:
   - Fix `helmv3-no-bare-table-names` to ignore `.storage.from(...)`.
   - Bake `paths.include` into `no-process-env-in-edge` and
     `no-service-role-key` ast-grep rules so they don't fire repo-wide.
   - Fix the two semgrep TS patterns so the rule pack parses.
2. **P1 — Eliminate inherited noise.** One sweep PR each:
   - `no-console-log-in-src` baseline (259 hits) — allow-list the
     instrumentation files, fix or migrate the rest.
   - `age-ratings-snapshot.yml` yamllint baseline.
   - shellcheck SC2155 in `apply-migration.sh` + actionlint nags.
   - ruff F401/F541 in `tools/continuous-improvement/`.
3. **P2 — Add a smoke test for the Review Gate config itself.** Run
   `sg scan --rule .coderabbit/ast-grep/<each>.yml --validate` and
   `semgrep --validate --config .coderabbit/semgrep/helmv3.yml` as a
   pre-merge step on `.coderabbit/**` changes so future rule
   regressions don't silently break the gate.

Until P0 lands, **today's 14 PRs all merged with a red Review Gate**
and the gate is providing zero blocking value.

---

## Appendix — run IDs cited

- PR #117 ast-grep: run `26545935342`, job `78197669908`
- PR #126 ast-grep: run `26548712487`, job `78206134274`
- PR #126 semgrep: run `26548712487`, job `78206134306`
- PR #126 yamllint: run `26548712487`, job `78206134267`
- PR #126 shellcheck: run `26548712487`, job `78206134282`
- PR #126 actionlint: run `26548712487`, job `78206134313`
- PR #126 ruff+pylint: run `26548712487`, job `78206134279`
- PR #127 ast-grep: run `26549116241`, job `78207313170`
- PR #127 semgrep: run `26549116241`, job `78207313150`
- PR #125 ast-grep: run `26549218295`, job `78207619018`

Workflow source: `.github/workflows/review-gate.yml` lines 32–55
(ast-grep), 56–66 (semgrep).

# Issue ledger — 2026-08-19

Consolidates four sources into one actionable list:

- the codebase audit at `~/helmv3-audit-2026-08-19/` (MF-001..018, 34 tools)
- two agent-context reviews of `.claude/`, `.cursor/` and git config
- a structural review of the knowledge registry, types and folders
- items still open from the overnight remediation run

**Every entry below was re-verified against the working tree, the live hooks,
or production before being listed.** Where a source claim turned out to be
stale or wrong, that is recorded rather than quietly dropped — the corrections
are as useful as the findings.

Baseline: `5f2c66152`. Verified 2026-08-19 ~22:45 EDT.

---

## DO NOT DO — verified harmful

### X1. Bulk-removing the internal worktrees with `--force` / `branch -D`

Both reviews recommend:

> `git worktree remove --force` each, then `git branch -D` the branches.
> They're all on stale commits.

**This destroys work.** There are **11** worktrees, not 9, and **10 of them
hold unmerged commits or uncommitted files** — roughly 40 commits and 21
uncommitted files. `git branch -D` force-deletes regardless of merge state and
`remove --force` discards uncommitted changes.

| worktree | commits not on main | uncommitted |
|---|---|---|
| `agent/push-token-teardown` | 1 | 0 |
| `worktree-agent-a6757af3a0dbf47a5` | 8 | 0 |
| `wf_509b1144-d87-16` | 16 | 0 |
| `wf_509b1144-d87-15`, `-18` | 6 each | 0 |
| `wf_509b1144-d87-13`, `-14` | 2 each | 0, 1 |
| `wf_509b1144-d87-17`, `-19`, `-20` | 0 | 8, 10, 2 |
| `overnight-remediation` | 0 | 0 |

`agent/push-token-teardown` is another live session's pending work.

The reasoning error is worth keeping: **being on a stale base commit says
nothing about whether the work is merged.** This repo squash-merges, so
`git branch --merged` never reports true even for shipped branches — the usual
safety check is structurally broken here.

**Safe alternative (H1 below):** prune by PR state, never by base commit.

---

## OWNER-ONLY — I cannot do these

### O1. `guard-bash.sh` rule 3 misses `;` masking  (was C1)

Verified by running the hook against inputs. `2` = blocked, `0` = allowed:

| command | result |
|---|---|
| `npm test; true` | **0 — allowed** |
| `npm run typecheck; true` | **0 — allowed** |
| `npm test; echo done` | **0 — allowed** |
| `npm test \|\| true` | 2 — blocked |
| `npm test 2>&1 \| tail -40` | 2 — blocked |

So a gate failure can be masked with `; true`. Note `\|\| true` is caught only
incidentally, because `\|\|` contains a pipe character, and the block message
then wrongly says "piped".

Correctly allowed (the documented escapes, confirmed working): `set -o pipefail;
… | tail`, and `… > /tmp/o 2>&1; echo "exit=$?"`.

**Blocked on:** `.claude/hooks/` is deliberately not agent-writable, so an agent
must not patch its own guardrails.

### O2. `guard-bash.sh` rule 4 block message is stale  (was C2)

Lines 60-65 tell agents "main has allow_force_pushes enabled and enforce_admins
off … GitHub will NOT stop you." Force pushes were disabled 2026-08-19, so the
rationale is now false. The hook is still right to block; only its stated reason
is wrong. `CLAUDE.md` rule 0 carried the same claim and was fixed in
`7b09b4ee8`.

Same blocker as O1.

### O3. Rotate the history-exposed credentials  (MF-008 / MF-009)

Two hardcoded DB passwords were removed from HEAD in `634af1eda`, but removal
does not touch git history — only rotation does. Also unresolved: a live
Supabase token sits in `.cursor/mcp.json` (correctly gitignored and never
committed, verified via `git ls-files` + `git check-ignore`).

### O4. Apply the golf history migration  (MF-001 / MF-002)

`20260819050000` is complete and its anonymization trigger is verified on a
replica, but it is item 1 of the golf packet and was never authorized for
production. Needs an explicit decision.

### O5. Decide on `Bash(*)` in `.claude/settings.local.json`  (was M6)

Confirmed present among 44 allow entries, so the scoped allowlist in
`settings.json` never constrains anything locally. Reasonable for a solo owner —
the hooks do the real work — but it means the permission layer is inert. This is
a decision to record, not necessarily a defect to fix.

### O6. Resolve the 538 orphan migration-ledger rows

Full analysis in the decision packet from the earlier session. Independently
confirmed by two tools: 275 matched / 538 remote-only / 33 local-only. 171 of
the 538 are provably safe duplicates; **300 need a human** because they are
renames, where deleting the row makes `db push` re-run an applied migration.
This is why
`Supabase Preview` has been red on every commit.

---

## HIGH — agent-doable, biggest impact first

### H1. Prune the internal worktrees SAFELY

4.6 GB inside `.claude/worktrees`, 9 registered. The cost is not disk — it is
that every `find`/`grep`/agent search from the repo root returns duplicates.
Demonstrated live: a grep for stale check-names returned 6 hits, **all** from
worktree copies of files already fixed in the real tree.

Method: `gh pr list --state merged --json headRefName`, remove only worktrees
whose branch has a merged PR **and** 0 uncommitted files. Everything else needs
its owner. See X1.

### H2. Re-verify or delete the 9 `unverified` rules  (was H3 / #4)

Confirmed: 12 rules carry a `verified:` field; **9 say `unverified`**, including
the load-bearing `database.md`, `code-patterns.md`, `golf-feature-ownership.md`,
`golf-review.md`. 75% of the rule surface says "do not trust without grepping
first," so every session re-derives what the rules should state.

The only item here that compounds: stale rules produce wrong work that then
needs correcting. Do it one rule at a time, verifying claims against code.

### H3. `.cursorignore` blinds Cursor agents to the DB source of truth  (C4)

Verified — line 32 `src/lib/types/database.ts`, line 36 `*.sql`. In a repo whose
first rule is "table names are sport-prefixed, check `database.ts`", a Cursor
agent doing DB work cannot see either the types or any migration.

### H4. gitleaks has no rule for `sbp_` Supabase tokens

Verified: `grep -c 'sbp_' .gitleaks.toml` returns **0**. That token shape is
invisible to the secret scanner, so the `.cursor/mcp.json` token would not be
caught if it were ever committed. Adding a rule is cheap and closes the gap
without touching the token.

### H5. `stop-verify.sh` is inert whenever peers are running  (was H4)

When `PEERS > 1` the hook prints an advisory and exits 0 rather than blocking.
Four live sockets right now, so the "don't stop before verified" gate is
currently off. The rationale is sound — attribution is genuinely unknowable
across sessions — but the practical effect is the gate disables itself exactly
when parallel agents are running. Worth a design pass, not a quick fix.

---

## MEDIUM

### M1. `.cursor/settings.json` is tracked and grants `*` + `mcp_*`  (C3)

Verified tracked via `git ls-files .cursor/`. Same class as O5 but committed to
the repo rather than machine-local.

### M2. `.cursor/rules/design.mdc` contradicts the real design system  (M3)

Generic "superdesign" prompt: Flowbite, Google Fonts, `!important`, "avoid
indigo or blue". The actual system is Fairway tokens with system fonts and
banned `!important`. Tracked, so it ships to anyone cloning.

### M3. `coderabbit-issue-enrichment.yml` is dead but live  (M4)

CodeRabbit was dropped 2026-07-20 and `.coderabbit.yaml` is a disable stub, but
this workflow still labels every new issue `plan-me` for a service that no
longer acts on them.

### M4. Subagents have no automatic triggering  (M2)

`db-migration-reviewer` says "MANDATORY for DB changes" and nothing enforces it.
A path-triggered reminder on `supabase/migrations/**` would close the gap.
Three of the six agents are two months stale.

### M5. `claude-code.yml` grants `contents: write` on `@claude` PR comments
(M5)

Currently gated behind an unset `ENABLE_CLAUDE_CODE_ACTION` variable. Audit the
trigger scope BEFORE ever setting it — with `fetch-depth: 0` and write
permissions, anyone who can comment on a PR gets a repo-write run.

### M6. `autonomy.md` and `code-review-tooling.md` load on every session  (#7)

No `paths:` frontmatter, so ~6 KB of prose loads for a one-line typo fix. The
worktree tutorial inside `autonomy.md` is only relevant when dispatching
parallel agents.

---

## LOW

- **L1.** `guard-bash.sh` numbering jumps 4 → 6; rule 5 was removed without
  renumbering, so coverage reads as accidentally lost rather than deliberate.
- **L2.** `RESUME.md` is a stale 2026-08-19 03:55 checkpoint an agent may read
  as live state.
- **L3.** `.devin/wiki.json` exists with no `.devin/skills/` or config — Devin
  sessions get none of the guard-bash / guard-sql / stop-verify net.
- **L4.** Skills have no `verified:` convention; `feature-finisher` is 7 months
  old, two golf skills are from May.
- **L5.** `.gitattributes` is empty while `.git/config` sets `ignorecase` and
  `precomposeunicode` — a `* text=auto eol=lf` would make clones deterministic.
- **L6.** Stale branch tracking entries for `overnight/remediation-2026-08-18`
  and `agent/push-token-teardown`.
- **L7.** MF-013 — 3 dependency-cruiser orphans remain genuinely unexplained
  (83 of 86 were accounted for).

---

## KNOWLEDGE-SYSTEM & STRUCTURE (third review, 2026-08-19)

Verified the same way. The theme is real and worth naming: this repo built
sophisticated systems — the registry, AUTOGEN blocks, `knowledge:map`, scoped
rules — and then stopped checking for drift INSIDE them.

### K1. `src/lib/recruiting/**` is routed by nothing

Verified, and sharper than reported. The review said the `recruiting` registry
entry "points at golf routes for a baseball feature". What is actually true:

- the entry maps golf routes/components/actions and golf docs
- a golf recruiting route really does exist, so that half is not wrong
- but `src/lib/recruiting/**` appears in **no registry entry at all**

`npm run knowledge:map -- --files src/lib/recruiting/stages.ts` returns
`impactedFeatures: []`. Meanwhile CLAUDE.md routes that same path to
`baseball-review`, and `stages.ts:17` reads the `baseball_pipeline_stage` DB
enum. So the rule layer calls it baseball, the registry calls it nothing, and
the only registry entry named `recruiting` is golf. **Priority: this is a
silent no-op, which is worse than a wrong answer.**

### K2. Registry keys and feature-doc filenames use different conventions

Verified: 19 of 25 registry keys are snake_case; 15 of 16 feature docs are
kebab-case. Mapping still works because it resolves through `code.routes` globs
and an explicit `docs.feature` path, not filename inference — so this is a
navigability problem, not a broken pipeline. Also verified: 9 of 25 entries have
no feature/context doc, and `baseball_core` points at `CLAUDE.md`, a routing
file rather than a feature doc.

### K3. Two parallel feature-doc systems

`memory/context/golfhelm-features.md` (57 KB, 28 features) and
`memory/features/*.md` (16 per-feature docs) both exist and are both maintained.
CLAUDE.md's routing table sends agents to the first; the registry sends them to
the second. Two sources of truth for the same feature is double the drift
surface. Pick one; make the other an index or an archive.

### K4. `baseballhelm-database.md` is 50 days stale with no AUTOGEN block

Golf's equivalent was regenerated 2026-08-19 and carries an `AUTOGEN:columns`
block; baseball's has neither. `database.md` points at the golf doc's AUTOGEN
block for columns and says the surrounding narrative is stale — baseball has no
equivalent guardrail. Either give it an AUTOGEN block or route baseball column
lookups to `database.ts` + `execute_sql` explicitly.

### K5. Staleness detectors exist but nothing runs them

`scripts/knowledge/` has `stale-doc-check.mjs` and `check-doc-coverage.mjs`;
`feature-awareness.yml` runs only `knowledge:check`. The AUTOGEN system catches
inventory drift via `docs-regen.yml`, but feature-doc staleness (K4) has no
automated detector. CircleCI's `weekly` workflow is the natural home.

### K6. Rename bare `Coach` / `Player` to `BaseballCoach` / `BaseballPlayer`

The doc half is fixed (`1be0b96f0` annotated CLAUDE.md's example, which was
actively teaching the trap). The rename itself is still open: 24 files import
the bare names, **0 of them golf**, so this is pre-emptive rather than a live
bug — do it before a golf file ever picks them up.

### K7. Document the `ui/` vs `fairway/` boundary

`design-system.md` says "Fairway is the only dashboard design system", but
`ui/` has 50 files and 376 `button.tsx` import sites against fairway's 62.
Baseball and lifting are almost entirely `ui/`; golf is genuinely split
(116 fairway / 123 ui). The rule and the tree disagree, so agents guess. Write
down the real boundary rather than restating the aspiration.

### K8. Smaller structural items

- **`docs/` root holds ~12 dated session reports** that belong in
  `docs/archive/<month>/`, which already exists and is organised by month.
  They are sediment in every `docs/` search.
- **`src/lib/` has 30+ top-level dirs** mixing product-specific (`golf/`,
  `baseball/`) with cross-product (`auth/`, `email/`, `stripe/`) and loose
  files. No structural signal for "shared". At minimum document it in
  `file-structure.md` — which is itself one of the 9 `unverified` rules (H2).
- **Route groups differ per product** — baseball has `(public)` and
  `(player-dashboard)` that golf and lifting lack. `file-structure.md`
  documents only golf's.
- **`src/lib/types/` is 24 baseball files vs 1 golf file.** Not a bug, but the
  convention (baseball split per-feature, golf consolidated) is undocumented,
  so an agent adding a golf type does not know where it goes.
- **`.vscode/` is split** — `launch.json` is tracked while `settings.json`
  (which carries the Momentic YAML schema mapping) is ignored. Pick one.
- **No `jsconfig.json`** mirroring tsconfig's `@/*` alias, so non-TS tooling
  cannot resolve it.

---

## DEFERRED, with reason

- **MF-006 dependency refresh** (55/114 direct deps outdated). No driver:
  MF-018 traced all 12 npm-audit vulnerabilities to two devDependencies
  (`@lhci/cli`, `promptfoo`), so **0 reach production**. A "safe in-range"
  stripe bump broke typecheck earlier today. Churn without a reason to churn.
- **MF-004 knip widening** — tried, measured, reverted. Widening `project` to
  `scripts/` yields 168 findings of which **78 of 83 script hits are false
  positives** (knip follows JS imports; these are invoked from npm/YAML/shell).
  Rationale recorded in `knip.jsonc` so it is not retried blind.

---

## CLOSED 2026-08-19 (recorded so the reviews are not re-run against them)

| item | commit |
|---|---|
| Knip gate never ran (`_comment` + `\|\| true`) | `4c4d1b29b` |
| Committed `.pyc`; `codeql.yml` default permissions | `ccf5c5b2c` |
| `.helmdev` ignore anchored to a nonexistent dir | `9e7cd6814` |
| Bare `&` in JSX costing semgrep whole files | `38a680f20` |
| shellcheck never checked the safety hooks | `ed325c170` |
| Golf migration retained the PII it promised to clear | `cf5c51b02` |
| Two hardcoded DB passwords in HEAD | `634af1eda` |
| `code-review-tooling.md` phantom check name | `5f2c66152` |
| `autonomy.md` stale fsmonitor warning | `5f2c66152` |
| `.cursorignore` hid `database.ts` + `*.sql` from Cursor | `1be0b96f0` |
| CONTRIBUTING.md + PR template phantom check names | `1be0b96f0` |
| CLAUDE.md rule 1 taught the baseball `Coach`/`Player` types | `1be0b96f0` |
| No `.editorconfig` (values measured from the tree) | `1be0b96f0` |
| Required contexts: 2 of 3 were phantoms | `7b09b4ee8` |
| `CLAUDE.md` rule 0 force-push claim | `7b09b4ee8` |

**Corrections to the source reviews, recorded deliberately:**

- Review #1 listed `CLAUDE.md` rule 0 as a live contradiction; it had been fixed
  hours earlier. Two of its three cited sources already agreed.
- Both reviews said "9 worktrees". There are 11.
- MF-008 listed 6 secret carriers in HEAD; **2** are real. Two of the others
  (`check-rls.ts`, `diagnose-rls.ts`) already read env vars and guard on them —
  they were flagged because the identifier `TEST_LOGIN_PASSWORD` is 19
  characters with entropy 3.7, so an entropy detector matched the variable NAME
  as if it were a value.

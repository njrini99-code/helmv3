# Master plan — rebuild the repo around the GolfHelm Engineering OS

**Status:** ACTIVE · opened 2026-08-27 · owner directive: *"Follow the OS engineering
model. Everything else should be scrapped. The architecture redone and bloat needs to
go away."*

**Sessions:** `helmv3-e7` (this plan, docs + agent config) · `helmv3-c5` (Bridge → main,
`src/**`, `supabase/**`, `.claude/hooks/**`) · `helmv3-5d` (idle, holds no locks).

**Hard constraints, standing:** no production deploy / promote / rollback. No production
migrations. No `git push --force`. No baseline raised to make a gate green. Owner asleep
— nothing here needs a decision before morning.

---

## 1. The model we are building around

`memory/system/golfhelm-engineering-os.md` defines a six-tier source-of-truth
hierarchy. **That hierarchy is the architecture.** It already ranks every document in
this repo, and it already tells us which tier is disposable:

| Tier | What | Verdict |
|---|---|---|
| 1 | Live production state (catalog queries, real env) | canonical |
| 2 | Generated artifacts — `database.ts`, AUTOGEN blocks, `surface-registry.ts` | canonical |
| 3 | Current code | canonical |
| 4 | Canonical feature memory — `memory/features/<id>.md` | canonical |
| 5 | Semantic history — `memory/ledgers/*`, `memory/incidents/*`, `memory/decisions/*` | canonical |
| 6 | **Everything else in `memory/` and `docs/` — "hints; verify before acting"** | **scrap** |

**Tier 6 is a statement about TRUST, not about VALUE, and it is not a delete list.**
(Correction from `helmv3-c5`, 2026-08-27, adopted.) `docs/superpowers/plans/helm-bridge/**`
is tier 6 by that reading and is the only record of the Bridge architecture and which
waves are done — deleting it would cost exactly the hunt this work exists to eliminate.
Same for `docs/CI_RUNBOOK.md` and the operations runbooks.

The criterion is therefore **provably stale, not merely unverified**:

- names a table, column, or enum that does not exist → `npm run docs:schema-drift`
- names a file path that does not resolve → `npm run docs:path-drift`
- states a status the code contradicts (a "TODO" for debt already paid, a plan marked
  "in progress" that shipped)

Both drift checks have baselines that may only go DOWN, so **deleting a provably-stale
file ratchets a real gate in the right direction** — the evidence is per-file and
machine-checked, not a tier heuristic.

### Measured scope

Classification of all 1,678 tracked `.md` files against the hierarchy:

| Count | Class | Action |
|---|---|---|
| 1,195 | T6 archive (`docs/archive/**`, `archive/**`) | **DONE** — evicted in Phase 1 (1,265 files) |
| 273 | T6 docs prose (`docs/**`) | triage per-file on drift evidence — **not** a bulk delete |
| 97 | config (`.claude/rules`, skills, agents) | consolidate |
| 42 | T6 root/other | triage |
| 31 | T5 semantic history | **KEEP — load-bearing** |
| 17 | T4 canonical feature memory | **KEEP — load-bearing** |
| 11 | T6 memory prose | delete |
| 6 | T6 superseded generation (`memory/context/**`) | delete |
| 2 | T0 constitution (`CLAUDE.md`, `AGENTS.md`) | rewrite thin |
| 1 | T0 the OS itself | **KEEP — becomes the root** |

**148 canonical.** The remaining 1,527 were the *starting* candidate pool, not a
delete list; 1,265 of them (the archive trees) are gone, and the rest are triaged
per-file on the evidence above.

---

## 2. What must NOT be deleted, and why

This section exists because the first draft of this plan got it wrong. Verified
empirically, not assumed.

### `memory/registry.yml` and `memory/features/**` are executable, not prose

`.claude/hooks/guard-feature-context.mjs` is a `PreToolUse` hook. Its logic:

```js
if (!isGoverned(relPath)) process.exit(0);
const { features } = await mapPathToFeatures(repoRoot, relPath);
if (features.length === 0) { block("...maps to NO feature in memory/registry.yml") }
```

Deleting the registry makes `features.length === 0` for every governed path —
`src/app/golf`, `src/lib/golf`, `src/components/golf`, `src/app/baseball`,
`src/lib/baseball`, `src/components/baseball`, `supabase/migrations/**`, any `.sql`,
`src/lib/supabase/**`, `scripts/db/**`. Every edit to any of them fails closed.
Confirmed by running the hook: exit 2.

There is an escape hatch (`npm run knowledge:map` records an acknowledged gap), so it
is a severe degradation rather than a permanent brick — but it would present as a
mysterious permissions failure, not as a deletion. **These files stay.**

### Also load-bearing tonight

- `memory/ledgers/**`, `memory/incidents/**` — the Stop gate requires a session to
  write a **dated** entry. c5 wrote two tonight.
- `supabase/migrations/HELD.md` — the only record distinguishing a deliberately-held
  migration from a forgotten one.
- `docs/superpowers/plans/helm-bridge/EXECUTION_LOG.md` — c5 rewrote the W16 section
  tonight with verification evidence.
- `.claude/hooks/**` — c5's tonight. This plan does not touch hooks.

---

## 3. The ordering principle

From c5, and it is the right call: **the biggest measured problem is not volume, it is
stale documents that read as current.** Evidence from tonight alone — a bridge
execution log claiming W16 "in progress" after it merged; three polish TODOs warning
about debt already paid (0 `bg-white`, 0 arbitrary `text-px`, eslint exit 0 on the
named file); a `registry.yml` comment asserting a guard trip that `isGoverned()`
disproves; `CLAUDE.md` carrying 59 database identifiers that do not exist in
production.

So the sequence is **delete what is provably stale → date what remains → then reduce
volume.** A shorter corpus that still lies is not an improvement.

---

## 4. Phases

Each phase is independently committable and independently revertable. Nothing here
requires the other phases to have run.

### Phase 1 — Archive eviction (biggest win, lowest risk) · `e7`

`docs/archive/**` (1,185 files) and `archive/**` (10). `AGENTS.md` already says these
are "historical evidence only. Never use them as the source of truth." They remain in
git history permanently; deleting them from the working tree loses nothing and removes
1,195 files from every `find`, `grep`, and agent file search.

- [ ] `git rm -r docs/archive archive`
- [ ] Remove the `docs/archive` exclusion from `scripts/markdown-lint-ratchet.mjs`
- [ ] Verify: `npm run docs:path-drift` (baseline 44 may only go DOWN)

**Note:** this does *not* fix the red markdown ratchet — `docs/archive` is already
excluded from its scope. The ratchet is Phase 5.

### Phase 2 — `memory/context/**`, per file, NOT as a directory · `e7`

**A blanket delete here would have destroyed generated truth.** `memory/context/`
holds six files of three different kinds, and only one kind is disposable:

| File | Kind | Verdict |
|---|---|---|
| `golfhelm-database.md` | **5 AUTOGEN blocks** — CLAUDE.md's trust table calls it **Authoritative** (tier 2). `c5` regenerated it tonight. | **KEEP** |
| `golfhelm-features.md` | Provably stale: banner names **19 identifiers verified absent from production** | delete → ratchets `.doc-schema-baseline.json` DOWN |
| `baseballhelm-database.md` | check for AUTOGEN blocks before touching | triage |
| `baseballhelm-features.md`, `baseballhelm-workflows.md`, `coachhelm-ai.md` | narrative | triage on drift evidence |

Two doc-rot findings while verifying this, both to fix in Phase 3:

- `CLAUDE.md` claims `golfhelm-features.md` "now carries a SUPERSEDED banner". It does
  not. It carries a **schema-drift** banner — a different thing that says 19 table
  names are fiction. The constitution is wrong about its own corpus.
- `CLAUDE.md:213` points at `memory/context/golfhelm-database.md` for "full column
  definitions" while `CLAUDE.md:128` calls that same file "the legacy prose rendering —
  prefer the command". Two lines of one file disagreeing about one document.

- [ ] Delete `golfhelm-features.md`; run `node scripts/check-doc-schema-drift.mjs --update`
      to ratchet the baseline DOWN (59 → expected ~40), never up
- [ ] Triage the remaining four on `docs:schema-drift` / `docs:path-drift` evidence
- [ ] Verify: `npm run docs:path-drift`, `npm run docs:schema-drift`, `npm run knowledge:globs`

### Phase 3 — Constitution rewrite · `e7`

Currently **1,095 lines load on every session**: `CLAUDE.md` 353 + `AGENTS.md` 207 +
engineering-os 192 (both imported) + 343 lines of always-on rules. Official Claude Code
guidance targets **under 200 lines**, and states plainly that imports do *not* reduce
context — they load at launch too.

The new shape, derived from the OS:

- **`memory/system/golfhelm-engineering-os.md` is the root document.** It stays as-is.
- **`AGENTS.md`** → the vendor-neutral constitution, trimmed to what the OS does not
  already say. Target ~60 lines.
- **`CLAUDE.md`** → a thin Claude adapter: import the OS, import AGENTS, and add only
  Claude-specific mechanics. Target ~50 lines.
- Delete from `CLAUDE.md`: the context-routing table (the OS's §Feature routing
  replaces it), the trust table (it *is* the OS hierarchy), the task-type table, the
  role-context table, the command list (derivable from `package.json`), and every
  "Fixed 2026-08-19: TWO PHANTOMS" correction — those belong in git history.

Apply the `/doctor` heuristic per line: **cut what Claude can derive from the codebase
(directory layouts, dependency lists, architecture overviews); keep pitfalls,
rationale, and conventions that differ from tool defaults.**

- [ ] Rewrite `AGENTS.md`, then `CLAUDE.md`
- [ ] Verify: `npm run docs:schema-drift` (baseline 59, may only go DOWN — a shorter
      CLAUDE.md should *reduce* it), `npm run docs:path-drift`

### Phase 4 — Rules consolidation · `e7`

15 files, 1,215 lines. 3 always-on (343 lines), 12 path-scoped (872). The path-scoped
ones are well designed and mostly stay. The always-on three — `autonomy.md`,
`shipping.md`, `code-review-tooling.md` — are the ones charging every session.

- [ ] Fold `code-review-tooling.md` (57 lines) into `AGENTS.md`'s automated-review
      section; it is already half-duplicated there
- [ ] Give `shipping.md` and `autonomy.md` `paths:` frontmatter where their content is
      genuinely path-specific; keep only the truly universal traps always-on
- [ ] Add the four rules missing from `CLAUDE.md`'s rules table (`golf-review`,
      `coachhelm-review`, `baseball-review`, `database`) — or delete the table, since
      Phase 3 removes it
- [ ] Verify: `/context` shows the reduced load

### Phase 5 — Put local, CI, and the ratchets in sync · `e7`, one item needs `c5`

**This is the phase the owner called out directly: "all ci ratchet lint all that shit
should be in sync."** It is currently a three-way desync, measured.

**5a. `preflight` makes a false claim.** It ends by printing *"PREFLIGHT GREEN — this
is the blocking static set CI runs."* It is not. Two of its ten gates run in **no** CI
workflow:

| In `preflight`, absent from all CI |
|---|
| `markdown:ratchet` |
| `lint:duplicate-exports` |

**CORRECTION, 2026-08-27.** An earlier revision of this plan said
`markdown:ratchet` had "been red since 2026-08-20 with +389 violations across 96
files, from no current branch". That was wrong, and it was wrong in an
instructive way — see 5f. It passes on a clean `origin/main` worktree (verified,
exit 0). The orphan finding above stands regardless of colour: a gate no
workflow runs is an orphan whether it is green or red.

**5b. `preflight` misses 15 gates CI does run:** `build`, `test:run`,
`test:integration`, `audit:paginated-reads`, `check:cycles`, `check:types-drift`,
`check:readiness-matrix`, `db:drift:check`, `knowledge:check`, `routes:hygiene:p0p1`,
`seed:baseball:ci`, `typecheck:functions`, `ui:routes`, `verify:business`.

**5c. Eleven gates are orphans** — a script exists, a baseline file is maintained and
committed, and **nothing runs them** on a PR or locally:

`check:env` · `check:helm-bridge-env` · `check:ledger` · `check:stats` ·
`check:row-caps` · `check:env-secrets` · `sql:ratchet` · `db:ledger-drift` ·
`markdown:ratchet` · `lint:duplicate-exports` · `docs:check` · `knowledge:report`

`check:ledger` currently **fails** (exit 2) and no one would ever see it.

**The target: one list, three consumers.** Define the gate set once and have local, CI,
and the ratchet baselines all read from it.

- [ ] Decide per orphan: **promote** it into `ci.yml` + `preflight`, or **delete** the
      script and its baseline file. No gate keeps a committed baseline without a runner.
- [ ] Make `preflight` exactly the static subset of `ci.yml`, then fix its final
      message to say what it actually ran. If it cannot be exact, it must say so.
  - **Do NOT fix the lie by removing `markdown:ratchet` from `preflight`.**
    (`c5`, adopted.) Removing a check to make a sentence true is the wrong
    direction. Either wire it into CI or change the sentence. As of Phase 1 the
    ratchet is passing anyway, so wiring it in is now cheap.
- [ ] Fix `check:ledger` or delete it — a red orphan is the worst of both.
- [ ] Reconcile the 12 baseline files against the surviving gate list; delete the
      orphaned ones (`.sqlfluff-baseline.json`, `.paginated-read-baseline.json`, etc.
      only where their gate is being dropped).
- [ ] Nothing to fix in the markdown violations — the count was an artefact.
      See 5f. The remaining work is wiring the gate into CI, or correcting
      `preflight`'s claim that CI already runs it.
- [ ] `docs:diff-check` is `git diff --exit-code`, so it fails by design whenever regen
      output is uncommitted — exactly while you are working. Split it out of
      `docs:check` so `docs:check` reports correctness only.
- [ ] **`tsconfig.json` (needs `c5` — `src`-adjacent):** `npm run build` re-injects
      `.next/types/**/*.ts` and `.next/dev/types/**/*.ts` into `include`, which the
      file's own comment records as deliberately removed because they break
      `npm run typecheck` (measured: exit 2 with, exit 0 without) while matching zero
      files in CI. Every local build silently dirties the repo and re-arms the trap.

**5e. Known gate limitation, not a doc rule.** `docs:schema-drift` reads
any `golf_*` or `baseball_*` token in a doc as a schema identifier. A
foreign-key constraint name is a real identifier but not a table, view,
function or enum, so naming one registers as documented-but-nonexistent
drift. A doc that correctly names its constraints therefore *fails* the
gate. Tonight's workaround was to omit them — but that trains people to
write vaguer docs, which is the opposite of the point. Teach the checker
about constraint names rather than teaching authors to avoid them.
(Raised by `c5`, 2026-08-27.)

**5f. A ratchet that walks the filesystem is not reproducible — FIXED.**
This is the sharpest gate defect found, and it cost two sessions an evening.

`markdown-lint-ratchet.mjs` resolved its scope with a `readdirSync` walk of
`docs/`. That walk is not gitignore-aware, and `.gitignore:11` ignores the
whole of `docs/redesign/`, which holds **21 `.md` files**. So the canonical
checkout linted 1,479 files where CI linted 1,458 — the same script, on the
same commit, failing locally and passing in CI. Both sessions measured
honestly, got numbers ~1,850 apart, and each believed the other's tree was
the broken one. I published "+389, red for a week, pre-existing" from that
number. It was an artefact of which files happened to be on my disk.

A ratchet whose scope depends on untracked local files is not a ratchet. It is
a coin flip that gets blamed on whoever last touched a doc.

The failure mode is worse than wrong numbers: **two checkouts of the same commit
disagree**, so neither engineer can reproduce the other's result and each
concludes the other is confused. That is exactly what happened here for about an
hour — both sessions measuring honestly, both correct about their own tree.

Fixed by intersecting both walks with `git ls-files`:

- `scripts/markdown-lint-ratchet.mjs` — the defect
- `scripts/check-doc-path-drift.mjs` — same architecture, no distortion today
  (`memory/` and `.claude/rules/` carry zero gitignored `.md`), hardened so it
  cannot start

Proven, not asserted: with the fix in place, creating a gitignored `.md` under
`docs/` produces byte-identical output. Guarded by
`src/test/scripts/ratchet-scope.test.ts`.

**The general rule for this repo: a gate must read `git ls-files`, never the
filesystem.** Audit the other ten against it.

**5d. Required checks vs jobs.** 13 workflows define 43 jobs; `main` requires 6
contexts. Every job that is not required and not informative is spend without a gate.
Audit the 43 against the 6 and cut or promote.

### Phase 6 — Config and disk bloat · `e7`

- [ ] Delete duplicate AI-tool configs: `.agents/skills/supabase` and
      `.agents/skills/supabase-postgres-best-practices` duplicate `.claude/skills/`.
      Triage `.codex`, `.cursor`, `.devin`, `.ultracode`, `.design-sync` — keep only
      what a tool actually in use reads.
- [ ] Untracked junk at repo root: 5 `.png` screenshots, `.DS_Store`,
      `CLAUDE-SECURITY-20260826-224016/` (260K), `.ruff_cache`, `.playwright-mcp`
      (20M). Add to `.gitignore` and remove.
- [ ] `.claude/skills/golfhelm-creative-engine` is **56M of the 57M** `.claude/`
      total. Confirm the assets are needed in-repo; if they are reference imagery,
      move them out.
- [ ] Prune 17 stale local branches — **by PR state, not `git branch --merged`**
      (this repo squash-merges, so merged branches never become ancestors of `main`).
      Includes 4 `worktree-wf_509b1144-*` leftovers.

### Phase 7 — Reconcile with `c5` · both

- [ ] c5 lands the Bridge on main
- [ ] This branch rebases onto the new `main`
- [ ] Joint verification: `npm run typecheck`, `npm run lint`, `npm test`,
      `npm run build`, `npm run docs:check`, every ratchet
- [ ] One PR per phase, not one giant PR

---

## 5. The end state — bare bones, organized, labeled

Owner directive: *"At the end of it all it should be bare bones necessary and organized
and labeled."* This is the target shape. Every directory gets one job and a `README.md`
saying what it is, what tier it sits in, and who maintains it.

```
CLAUDE.md                    ~50 lines · Claude adapter. Imports the OS + AGENTS.
AGENTS.md                    ~60 lines · vendor-neutral constitution.

memory/
  system/
    golfhelm-engineering-os.md   THE ROOT. The model everything else serves.
  registry.yml                   T-router · executable (guard-feature-context reads it)
  features/       17 files       T4 canonical · executable
  ledgers/        \
  incidents/       >  31 files   T5 semantic history · Stop gate reads these
  decisions/      /
  glossary.md                    generated (AUTOGEN) · never hand-edited
  projects/golfhelm.md           generated (AUTOGEN) · never hand-edited
  operations/release-queue.yml   verified repair units
  — nothing else. context/ is gone.

.claude/
  settings.json                  permissions + hooks wiring
  hooks/                         the enforcement layer (owner: c5 tonight)
  rules/                         path-scoped only; always-on folded into the two above
  agents/ commands/ skills/      only what is actually invoked

docs/
  MASTER_PLAN_DOC_CONSOLIDATION.md   this file, until it is done
  ai-system/                     the long-form specs the OS points at
  operations/                    runbooks that are current
  architecture/                  contracts, not narrative
  — archive/ is gone. Stale prose is gone.

.github/workflows/               one gate set, matching preflight
```

**Labeling rule, enforced by a `README.md` in each directory:** name the tier, name the
maintainer, and state whether the contents are *generated*, *executable*, or *narrative*.
A reader must be able to tell in one line whether a file is authoritative or a hint —
that distinction is the whole point of the OS hierarchy, and today it is invisible from
the filesystem.

**Dating rule:** every narrative file that survives carries an explicit `YYYY-MM-DD`
last-verified date and the SHA it was verified against. Per `.claude/rules/shipping.md`,
a bare date reads as current forever, so pair it with the anchor SHA and let the reader
run `git rev-list --count <sha>..HEAD -- 'src/**'`.

---

## 6. Verification contract

No phase is complete until its named checks pass. Per the OS: *more accurate truth, not
quieter dashboards.* Specifically forbidden — raising any baseline, deleting a failing
test, downgrading a severity, or excluding a directory from a linter to make a count
drop.

Never pipe a gate command; `guard-bash.sh` blocks it, and the pipeline reports the last
command's exit status, manufacturing a green result.

---

## 7. Open questions for the owner (morning, non-blocking)

1. **`docs/qa` (69M) and `docs/ui-audits` (39M)** — mostly screenshots. Keep in repo,
   move to external storage, or delete? This is the bulk of `docs/`'s 156M.
2. **`.helm/`** — a parallel doc tree (`ACTIONS.md`, `ISSUES.md`, `HELM_ESSAY.md`,
   cycles). Superseded by `memory/`, or still used?
3. **Auto memory is OFF for this project** (`autoMemoryEnabled: false` in
   `.claude/settings.json`). It was set by commit `e8f3b7749`, whose message never
   mentions it — an undocumented side-effect, not a decision. Claude Code's auto memory
   is capped at 200 lines, self-pruning, and holds exactly the category
   (`corrections`, `project context not derivable from code`) that `memory/`'s
   hand-written prose is trying to be. Turning it on would give the trimmed corpus a
   maintained replacement. Owner's call — I will not flip a settings file.

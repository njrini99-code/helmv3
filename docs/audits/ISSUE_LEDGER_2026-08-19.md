# Issue ledger — 2026-08-19

Single backlog for four sources: the 34-tool codebase audit
(`~/helmv3-audit-2026-08-19/`, MF-001..018), two agent-context reviews of
`.claude/` / `.cursor/` / git config, and a structural review of the knowledge
registry, types and folders.

**Nothing here is closed by memory.** Every item is re-checked by a command:

```bash
python3 scripts/audit/verify-issue-ledger.py
```

That prints OPEN / OWNER / DONE per item with the evidence it measured. Run it
before acting on this file — it is the source of truth and this prose is a
commentary on it. As of the last run: **18 OPEN · 3 OWNER · 5 DONE**, plus the
CLOSED table at the bottom.

Written because this repo has now been bitten three separate ways in one night
by documentation that looked correct and did nothing: a required CI context
matching nothing that posts, a gitignore rule anchored to a directory that does
not exist, and a rule file naming a check renamed weeks earlier.

---

## DO NOT DO — verified harmful

### X1. Bulk-removing worktrees with `--force` / `branch -D`

Both agent-context reviews recommend it, justified by "they're all on stale
commits". **It destroys work.** Measured before the safe fix was applied: 11
worktrees, and 10 held unmerged commits or uncommitted files — ~40 commits and
21 files, including another session's live branch and two unreleased
migrations. `git branch -D` force-deletes regardless of merge state.

The reasoning error is the transferable part: **a stale BASE commit says
nothing about whether work is MERGED.** This repo squash-merges, so
`git branch --merged` never reports true even for shipped branches — the usual
safety check is structurally broken here.

**What was done instead (H1, closed):** `git worktree move`. All 9 internal
trees relocated outside the repo with commits and dirty state preserved
byte-for-byte. Search pollution gone, zero work lost. Deletion was never the
only option; neither review considered moving them.

---

## OWNER-ONLY — an agent cannot or should not do these

`.claude/hooks/` and `.claude/settings*.json` are deliberately not
agent-writable. An agent editing its own guardrails is exactly what that
protection exists to prevent, so O1/O2 are flagged rather than fixed.

| id | item | evidence |
|---|---|---|
| **O1** | `guard-bash` rule 3 misses `; true` masking | 3/3 forms allowed |
| **O2** | `guard-bash` rule 4 says force pushes are enabled | 1 stale claim |
| **O3** | credentials in git history | HEAD clean; needs rotation |
| **O4** | golf history migration unapplied | complete + trigger verified |
| **O5** | `Bash(*)` makes the scoped allowlist inert | among 44 allow entries |
| **O6** | 538 orphan rows keep `Supabase Preview` red | 300 need judgement |

**O1 detail.** Verified by running the hook, not reading it. `2` = blocked:

| command | result |
|---|---|
| `npm test; true` | **0 — allowed** |
| `npm run typecheck; true` | **0 — allowed** |
| `npm test; echo done` | **0 — allowed** |
| `npm test \|\| true` | 2 — blocked |

Rule 3 matches a literal pipe only, so the `\|\|` form is caught incidentally
and the block message then wrongly says "piped". `; true` is not caught at all.

**O2 detail.** Force pushes were disabled 2026-08-19. The hook is still right
to block; only its stated rationale is false. `CLAUDE.md` rule 0 carried the
same claim and was fixed in `7b09b4ee8`.

**O6 detail.** Independently confirmed by two tools: 275 matched / 538
remote-only / 33 local-only. 171 of the 538 are provably safe duplicates; the
other 300 are mostly RENAMES, where deleting the row makes `db push` re-run an
applied migration. Full analysis in the session decision packet.

---

## OPEN — agent-doable, ranked by what compounds

### H2. Nine of twelve rules self-declare `verified: unverified`

Includes the load-bearing ones: `database.md`, `code-patterns.md`,
`golf-feature-ownership.md`, `golf-review.md`. 75% of the rule surface says "do
not trust without grepping first", so every session re-derives what the rules
should already state.

**The only item that compounds** — stale rules produce wrong work that then
needs correcting. Do them one at a time, verifying claims against code.

### K9. Code inside agent docs is unlinted, untyped, unreferenced

Found the hard way tonight. The `Coach`/`Player` rename was verified with a
`tsc` probe, which caught 7 misses in `src/` — and could not see the eighth,
in `CLAUDE.md` rule 1, because doc code is compiled by nothing. So a commit
that *documented* the trap and a commit that *removed* it left the canonical
example still teaching it, non-compiling, for about an hour.

`.claude/rules/*.md`, `AGENTS.md` and every `SKILL.md` have the same exposure.
A doc-example extractor that type-checks fenced TS would close a class, not an
instance.

### K10. Migration version-stamp collision

`20260819050000_drop_duplicate_baseball_decision_log_index.sql` sits
uncommitted in the `wf_509b1144-d87-20` worktree and collides with
`20260819050000_preserve_golf_history_on_account_deletion.sql` on main. Two
different migrations, one stamp. Whoever lands second silently shadows the
other. Needs a re-stamp before either ships.

### M7. `ruff` / `pylint` only cover `tools/**/*.py`

29 Python files exist; the Review Gate globs only `tools/`. Same class as the
shellcheck gap fixed in `ed325c170` — a linter whose scope excludes most of its
language. `scripts/audit/verify-issue-ledger.py` was written ruff-clean and
pylint 10.00/10 anyway, but nothing enforces that for the next one.

### K2. Seven of 25 registry entries have no feature/context doc

`knowledge:map` routes to nothing useful for them. `baseball_core` was the
worst case and is fixed (`8ab54f35b`) — it pointed `feature`, `ui` and
`business_logic` all at `CLAUDE.md`, a routing file.

### K4. Baseball database doc is stale with no AUTOGEN block

Last modified 2026-06-30. Golf's equivalent was regenerated 2026-08-19 and
carries `AUTOGEN:columns`; baseball has neither, so nothing detects its drift.
Either give it a block or route baseball column lookups to `database.ts` and
`execute_sql` explicitly.

### K5. Staleness detectors exist and no CI runs them

`scripts/knowledge/` has `stale-doc-check.mjs` and `check-doc-coverage.mjs`;
`feature-awareness.yml` runs only `knowledge:check`. K4 is exactly the drift
those would have caught. CircleCI's `weekly` workflow is the natural home.

### K7. The `ui/` vs `fairway/` boundary is undocumented

`design-system.md` says Fairway is the only dashboard design system and
mentions `components/ui` once, as a carve-out for `skeleton.tsx`. Measured:

| product | `ui/` | `fairway/` |
|---|---|---|
| golf | 181 | 126 |
| baseball | **238** | 4 |
| lifting | 52 | 3 |

561 files import `components/ui` in total. The rule describes an aspiration;
agents get contradictory signals. Write down the real boundary.

### H5. `stop-verify` disables itself exactly when it is needed

When `PEERS > 1` the hook prints an advisory and exits 0 instead of blocking.
Five live sockets during this session, so the "don't stop before verified" gate
was off for all of it. The rationale is sound — attribution across sessions is
genuinely unknowable — but the effect is that the gate is absent whenever
parallel agents run. Needs a design pass, not a patch.

### M1 / M2. Cursor config

`.cursor/settings.json` is **tracked** and grants `*` plus `mcp_*`.
`.cursor/rules/design.mdc` carries 3 directives that contradict the repo's
design system (Flowbite, Google Fonts, `!important`) and is also tracked, so it
ships to anyone cloning.

### M4. `db-migration-reviewer` is "MANDATORY" and unenforced

Nothing in `.claude/rules/` or `.claude/hooks/` mentions it, so an agent
editing `supabase/migrations/**` is never reminded. A path-triggered line in
`database.md` would close it.

### M6. `code-review-tooling.md` loads on every session

No `paths:` frontmatter, so it loads for a one-line typo fix. (`autonomy.md`
deliberately has none — that is documented in the file itself.)

### L2 / L4. Small

`.claude/RESUME.md` is a stale 03:55 checkpoint an agent may read as live
state. All 6 skills lack the `verified:` field the rules use, so skill drift
has no detector at all.

---

## DEFERRED, with reason

**MF-006 dependency refresh** (55/114 direct deps outdated). No driver:
MF-018 traced all 12 npm-audit vulnerabilities to two devDependencies
(`@lhci/cli`, `promptfoo`), so **0 reach production**, and a "safe in-range"
stripe bump broke typecheck earlier today.

**MF-004 knip widening** — tried, measured, reverted. Widening `project` to
`scripts/` yields 168 findings of which **78 of 83 script hits are false
positives**: knip follows JS imports and these are invoked from npm/YAML/shell.
Enabling knip's `github-actions` plugin moved the count by zero. Rationale
recorded in `knip.jsonc` so it is not retried blind.

**MF-013** — 3 dependency-cruiser orphans remain genuinely unexplained (83 of
86 were accounted for).

---

## CLOSED — verified, with commits

| item | commit |
|---|---|
| Required contexts: 2 of 3 were phantoms; force pushes off | `7b09b4ee8` |
| `CLAUDE.md` rule 0 force-push claim | `7b09b4ee8` |
| Knip gate never ran (config rejected, exit swallowed) | `4c4d1b29b` |
| Committed `.pyc`; `codeql.yml` default permissions | `ccf5c5b2c` |
| `.helmdev` ignore anchored to a nonexistent directory | `9e7cd6814` |
| Bare `&` in JSX costing semgrep whole files | `38a680f20` |
| shellcheck never checked the safety hooks | `ed325c170` |
| Golf migration retained the PII it promised to clear | `cf5c51b02` |
| Two hardcoded DB passwords in HEAD | `634af1eda` |
| `code-review-tooling.md` phantom check name | `5f2c66152` |
| `autonomy.md` stale fsmonitor warning | `5f2c66152` |
| `.cursorignore` hid `database.ts` + `*.sql` | `1be0b96f0` |
| CONTRIBUTING + PR template phantom check names | `1be0b96f0` |
| `.editorconfig` absent (values measured, not assumed) | `1be0b96f0` |
| `src/lib/recruiting` routed by no registry entry | `8ab54f35b` |
| `baseball_core` docs pointed at a routing file | `8ab54f35b` |
| gitleaks blind to `sbp_` tokens | `8ab54f35b` |
| Dead CodeRabbit issue-enrichment workflow | `8ab54f35b` |
| `.gitattributes` / `jsconfig.json` absent | `8ab54f35b` |
| Bare `Coach`/`Player` were baseball types | `1505e1ddd` |
| `CLAUDE.md` rule 1 left non-compiling by that rename | `94c0293d8` |
| 9 worktrees inside the repo (moved, not deleted) | this session |

---

## Corrections to the source reviews

Recorded because they change how much the next report should be trusted.

- **Both reviews said "9 worktrees". There were 11**, and their recommended
  remedy would have destroyed ~40 commits.
- **Review #1 listed `CLAUDE.md` rule 0 as a live contradiction**; it had been
  fixed hours earlier. Two of its three cited sources already agreed.
- **MF-008 listed 6 secret carriers in HEAD; 2 were real.** Two others already
  read env vars and guard on them — flagged because the identifier
  `TEST_LOGIN_PASSWORD` is 19 characters with entropy 3.7, so an entropy
  detector matched the variable NAME as a value.
- **U2 said `recruiting` was a baseball feature mis-mapped to golf.** The entry
  is genuinely golf's and correct; the real gap was that
  `src/lib/recruiting/**` was mapped by nothing at all.
- **A control-plane report was ~1/3 already fixed**, and part of its file list
  was read out of `.claude/worktrees/` rather than the repo — the same
  contamination that inflated a TruffleHog count from 1 to 1,335.

Across three reviews roughly a third of "critical/high" items were already
fixed, overstated, or actively dangerous as written. The observations were
mostly sound; the **remediations** were where the risk sat.

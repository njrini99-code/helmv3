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
| **O4** | golf history migration unapplied (`20260819200000`) | verified |
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

### K11. `.deepsec/` is the worktree problem, unfixed

Moving the worktrees closed the instance, not the class. Counting `.ts/.tsx`
from the repo root:

| directory | files |
|---|---|
| `node_modules` | 40,008 |
| **`.deepsec`** | **7,990** |
| `src` | 3,900 |
| `tools` | 1,452 |

`.deepsec/` holds **2x `src/`**, is gitignored with 0 tracked files, and is
770 MB. Gitignored means invisible to git and fully visible to `find`, `grep`
and every filesystem scanner — the exact property that made the worktrees
dangerous. It is also where the `.env` JSON copies live that bypass the
sandbox's `.env*` deny-list (MF-010). Any scan that excludes
`.claude/worktrees` and stops there still reads ~8,000 phantom files.

### K12. An orphaned production fix is sitting uncommitted

Three cron routes are modified in the shared tree and three
`docs/SECURITY_*_POSTGREST_1000_ROW_CAP` files are untracked. All four live
sessions have disowned them; the timestamps (22:12–22:14) point to a session
that has since exited.

The change is real and correct. `PAGE_SIZE = 2000` in
`coachhelm-insight-lifecycle` meant a full 1,000-row PostgREST response read as
a short page, so the early-exit logic halted — leaving **~9,000 insights
unprocessed per run**. The other two cron files are comment-only.

**The committed test asserts the bug**:
`coachhelm-insight-lifecycle-bounds.test.ts` expects
`.limit(2000)`, which is why the suite is 1120/1121. Three sessions reached
that conclusion independently. Treating it as a regression would revert a live
production fix.

Nobody should commit this on the original author's behalf without a decision —
but it should not be lost either, and a dirty tree is currently the only thing
blocking a deploy.

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

## SEMGREP — the CSV is stale, and 29 of its 72 authz findings still stand

Two artifacts arrived together and disagree. My first two readings were both
partly wrong. This is the corrected triage: every one of the 72 findings was
anchored to its enclosing function at the scan commit and that function was
diffed against HEAD and read.

### Correction 1 — absence from the CI scan is NOT evidence of a fix

The 72 high-severity rows are `ai.detection.authz` / `idor` / `logic`:
Semgrep **Assistant/Pro** rules that run in the cloud platform.
`review-gate.yml` runs the **OSS** engine, which does not carry those rules
at all. "The fresh 347-finding scan does not contain them" is therefore
*expected*, not exculpatory. An earlier note here implied they were phantom.
They are not.

This class is also structurally invisible to our own gate. The Review Gate
hard rule is *"server action without `supabase.auth.getUser()` before any DB
call"* — which passes cleanly on an action that authenticates and then trusts
a client-supplied `playerId`. That is why CI is green and 72 findings exist.

### Correction 2 — the CSV is two scans, not one

| rows | rule family | commit | behind |
|---|---|---|---|
| 72 | `ai.detection.*` (Pro) | `8a7f049be` 07-26 | 547 |
| 15 | OSS (crypto/CORS/ATS/npm) | `e7a354eff` 08-18 | 109 |

Line numbers in the 72 are unusable — 75 of 87 flagged files have changed.
Anchor by enclosing function, never by line. Note also that most flagged
symbols are thin `withAdminObserved` wrappers; the logic lives in `<name>Impl`.

### What closed the ones that closed: `2a95fca00`, a week after the scan

`2a95fca00` — *"close authorization and tenancy holes found by deepsec wave
1"* (2026-08-02, #1220) — scanned 113 files, fixed 52 of 77 findings, refuted
25. BaseballHelm got the parallel treatment via `withBaseballAction` (AUTH →
server-validated team CONTEXT → CAPABILITY). Both landed **after** the scan
commit, so the CSV cannot see either. Those fixes carry in-code tags (`DS-03`,
`DS-3`, `DS-B4`, `DS-B10-1`), which is how each verdict below was confirmed.

### Verdict on all 72 — and all 68 actionable ones are now CLOSED

| verdict | n | state |
|---|---|---|
| CLOSED at triage time | 34 | fix already in HEAD |
| OPEN, now FIXED | 29 | `f30f1fdd1`, `6f6217835`, `ec49ee2fd`, `295afb103` |
| OAUTH, now FIXED | 3 | `e462448ce` |
| FALSE POSITIVE | 2 | premise is factually wrong |
| DESIGN QUESTION | 4 | org-vs-team scope, owner's call |

**The 2 false positives.** `lib/notifications/push.ts::sendPushNotification`
and `sendBulkPushNotification` are described as "exported server actions". The
file carries an explicit comment saying it deliberately has **no** `'use
server'` directive, for exactly the reason Semgrep gives. Not client-callable,
not an endpoint. Do not "fix" these.

### The 29 were one bug, 29 times

Team scope was already enforced almost everywhere after wave 1. **Scope of the
id *inside* the call was not.** An action proved "you are a coach of team X"
and then accepted an arbitrary `playerId`, `player_ids[]`, `event_id`,
`reviewId` or `attendeeIds[]` and wrote it.

Three primitives now carry that check, rather than 29 bespoke ones:

- `verifyPlayersOnTeam(teamId, ids)` — golf, in
`@/lib/auth/verify-player-access`
- `verifyRoundBelongsToPlayer(roundId, playerId)` — golf, same module
- `assertPlayersOnBaseballTeam(sb, teamId, ids)` — `@/lib/baseball/resolve-team`

Three rules they all share, each of which had a wrong answer available. An
empty list PASSES, because callers legitimately branch on it — a helper that
rejected `[]` would break `createTaskFromTemplate`'s whole-roster path while
looking stricter. A failed read fails CLOSED **and says which kind of no it
is**, because this repo has already shipped the version where a discarded
roster-read error told a coach their own player was not on their team.
Membership, not lifecycle: `pending`/`inactive`/NULL still count, since the
defect is cross-TEAM writes and quietly retiring removed players at 29 call
sites under cover of a security fix would be a different change.

Two sites turned out worse than the scan reported. `createTaskFromTemplate`
(golf) had **no team gate at all** — only "is a coach" — and wrote `team_id`
straight from its argument. `addSecondTeam` checked that a primary staff row
existed, never that it was a head-coach row, then inserted the caller into the
new team's staff as `role: 'head_coach'`.

Verified by `S10` in the verifier, which keys on the GATE rather than on the
vulnerable shape — a check that looks for the old code goes green the moment
someone reformats it — and names the first site to lose one.

### The 3 OAuth rows, one fix

`api/crm/google-calendar/*` state was unsigned base64 JSON, and both consumers
only compared its `userId` to the session. That catches a mismatch, never a
forgery: an attacker knowing a victim's uuid could mint a state naming them and
have the victim's browser complete a callback carrying the attacker's Google
code. Now HMAC-signed via `src/lib/crm/oauth-state.ts`, with the expiry
enforced on both consumers — the callback previously checked identity and not
age. Key derives from `GOOGLE_CLIENT_SECRET`, which both routes already
require, rather than a new env var that would be unset on the day it shipped.

### 4 design questions, not bugs — owner's call

`getTeamReviews` scopes to `organization_id`; `getTeamCoachHelmAccess`,
`getOrCreateTeamCoachHelmSettings` and baseball `getTeamAcademics` allow
org-wide reach. The rule calls org-wide visibility a tenancy violation.
Whether an org's coaches may see sibling teams is a product decision. The
settings-row *creation* side effect on an unstaffed team is worth tightening
either way.

### The 15 OSS rows

- **12 `crypto-weak-algorithm` — all false positives.** Every one is SHA-1 or
  MD5 deriving a deterministic UUIDv5-style id from a `namespace:key` pair.
  Checked all twelve for secret/signature adjacency: zero. All in seed
  scripts, e2e helpers, dev tooling. Settled; do not re-verify.
- **1 `npm-missing-minimum-release-age` — REAL and cheap, still open.** npm
  11.17 does support this, under the key `min-release-age` (currently `null`),
  not the `minimum-release-age` spelling the rule name suggests. A cooldown
  blunts the npm-compromise wave class. `npm ci` installs pinned versions, so
  CI is unaffected; Dependabot PRs are the path that changes.
- **1 `cors-default-config-express`** — `tools/ultra-agent-audit/src/server.js`
  uses bare `app.use(cors())`. Local dev tool, referenced by nothing in
  `package.json` or CI. Low value.
- **1 `ATS-consider-pinning`** — `ios/App/App/Info.plist` has no
  `NSAppTransportSecurity` block at all. Informational.

### The `sharp` supply-chain finding, re-derived

Three copies in the tree, not the two I first reported:

| path | version | `dev` |
|---|---|---|
| `node_modules/sharp` | 0.34.5 **vuln** | **true** |
| `promptfoo/node_modules/sharp` | 0.35.3 | true |
| `next/node_modules/sharp` | 0.35.3 | — (prod) |

`npm ci --omit=dev` never installs the vulnerable copy and prod already runs
0.35.3. Not force-overridden: promoting the `next`-scoped override globally
would push `@huggingface/transformers` off its declared range for zero
production benefit. Tracked as K13; the verifier reads the `dev` flag, so it
reopens automatically if that ever stops being true.

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

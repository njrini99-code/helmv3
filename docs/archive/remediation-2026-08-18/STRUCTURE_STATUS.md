# Structure findings — open/closed status

**Verified:** 2026-08-19 07:45Z · read-only · every line below re-measured against
the live repo, not read from the audit's own status column.

The audit was written ~14 hours ago on a checkout four sessions have been editing.
Its statuses were hypotheses. These are measurements.

---

## Status at a glance

**23 INFRA findings: 6 CLOSED · 11 OPEN · 4 DECISION (not fixable, needs owner) ·
2 reclassified.**

| ID | Claim | Measured now | Status |
|---|---|---|---|
| 01 | `.worktrees/` shadowed `src/` with 4,314 duplicate files | dir exists, holds **1** entry (`.metadata_never_index`), **0** source files | **CLOSED** |
| 02 | `core.fsmonitor=true` with broken daemon | `core.fsmonitor=false` | **CLOSED** |
| 03 | 10 abandoned Playwright processes | not re-checked (transient) | — |
| 04 | 3 fossil `refs/original/*` | **0** refs | **CLOSED** |
| 05 | Stop hook blamed whoever ended a turn | **STILL FIRING** — hit me twice tonight over cb's files | **OPEN** |
| 06 | Worktree convention undocumented | documented in `.claude/rules/autonomy.md` | **CLOSED** |
| 07 | **32 unaccounted migrations** | re-derived independently: **still 32** | **OPEN** — plan below |
| 08 | Sibling worktree symlinks `.env` | not re-checked | — |
| 09 | 4 Dependabot alerts, all dev-scope | not re-checked | — |
| 10 | Repo is PUBLIC | unchanged | **DECISION** |
| 11 | 3 orphaned stashes aging toward expiry | **`git stash list` = 3** | **OPEN · TIME-BOXED** |
| 12 | `migrations/` can't rebuild prod; 193 dup groups | **corrected**: 27 historical + 166 self-inflicted | **OPEN, restated** |
| 13 | Required check `all` emitted by two workflows | unchanged | **DECISION** |
| 14 | `.git/hooks/pre-commit` undocumented, hits network | **PRESENT + executable**, still reads `.env.local` | **OPEN** |
| 15 | `merge.ours.driver=true` with no `.gitattributes` | **driver now unset**; `.gitattributes` still absent | **CLOSED** |
| 16 | Blanket `*.png` ignore rejects new images | **still 1 blanket rule** in `.gitignore` | **OPEN** |
| 17 | `output/` has no ignore coverage | **still not ignored** | **OPEN** (1-line fix) |
| 18 | CI gate checks a 49-day-frozen snapshot | not re-checked | **OPEN** |
| 19 | `helm-website-ui/` deleted from git, `node_modules` remains | **376M, 0 tracked files** | **OPEN** |
| 20 | 13 non-standard refs pin dead objects | **17 now** — grew | **OPEN** |
| 21 | `deploy-prod.sh` under-referenced | present, referenced in 3 files | **OPEN · minor** |
| 22 | Doc rot outside AUTOGEN markers | not re-checked | **UNVERIFIED** |
| 23 | Screenshots across 7 dirs (~1.15G) | largest single dir now 512K | **likely CLOSED** |

**Not re-checked (5):** 03, 08, 09, 18, 22. Named rather than guessed.

### The two worth acting on first

- **INFRA-05 is not fixed and I am direct evidence.** The stop hook fired on me
  twice tonight over `src/app/golf/actions/auth.ts`, `teams.ts` and the staff-invite
  test files — all cb's work. I wrote nothing to this repo all night. The hook reads
  the whole dirty tree, so with four sessions sharing one checkout it asks whoever
  ends a turn to vouch for everyone's edits. Both times I had to stop and prove a
  negative. **This is the single biggest tax on parallel sessions.**
- **INFRA-19, quantified:** `helm-website-ui/` is 376M, has **0 tracked files**, and
  is **not** ignored as a directory (only `helm-website-ui/**/*.js` is). Its
  `node_modules` holds ~6,000 `.ts/.tsx` files.

> ⚠ **My own first measurement of INFRA-19 was wrong**, in the alarming direction.
> A `find` without pruning `node_modules` reported 6,047 source files under
> `helm-website-ui` against 3,888 in `src/` — i.e. "the shadow tree is bigger than
> the app". Re-run with pruning: **1** real source file. The shadowing risk is real
> but it comes from `node_modules`, not from a duplicate source tree, and only bites
> a search that doesn't prune. Ninth instrument defect of the run.

## The 32 unaccounted migrations — what it takes to reach zero

Re-derived independently after cb's fix (diffing all 302 filenames against a fresh
version dump): **still exactly 32.** From `MIGRATION_RECONCILIATION.csv`:

| Count | Class | What closing it takes |
|---:|---|---|
| 12 | `RENAMED_EQUIVALENT` | **Stamp.** All objects live; body matches a ledger row under another name |
| 3 | `OUT_OF_BAND_NO_LEDGER` | **Stamp.** All objects live; applied outside the ledger |
| 2 | `PRE_BASELINE_SUBSUMED` | **Stamp or exclude.** Predate the baseline; `migration-lockdown.yml` already names them "superseded pre-baseline" |
| 3 | `PARTIAL_EQUIVALENT` | **Forward-fix migration**, then stamp |
| 10 | `NO_DETECTABLE_OBJECTS` | **Individual read.** ALTER/DO/data-only — not statically verifiable |
| 2 | `INTENTIONALLY_PENDING` | **Never.** Held by decision |

**17 of 32 are stamp-only** — mechanical, additive `INSERT (version, name)`, the
identical operation `helmv3-cb` already performed twice tonight on its own two
migrations. **13 are real work** (3 forward-fix + 10 reads). **2 are permanent
exceptions.**

> **So "zero" is the wrong target.** Two migrations are deliberately unapplied
> (`20260708141000_gate_secdef_ownership_and_redemption`, held draft;
> `20260715141727_baseball_legacy_stats_backfill`, explicit HOLD). The achievable
> target is **zero *unexplained*** — 32 → 2 known exceptions. Anything that claims
> to reach literal zero is proposing to apply a migration someone deliberately held.

The 10 needing a read, the only genuinely unknown group:

```
20260528011000  harden_coach_insights_update_grants
20260528012000  relock_crm_admin_rpcs
20260605040000  reaffirm_golf_rounds_update_grants      <- golf grants; through the Commander
20260610150000  notification_type_event_updated_pattern
20260610170000  seed_lpga_standards
20260621170000  retire_stranded_predictions
20260623131038  harden_crm_view_and_recruit_doc_functions
20260625000040  baseball_staff_display_scope_columns
20260625000080  helm_lifting_backfill_from_baseball
20260807060000  retype_orphaned_class_events
```

**Sequencing:** the 17 stamps are safe and unblock nothing on their own — the
GitHub deploy toggle stays off while *any* file is unaccounted. So the 10 reads are
the critical path, not the stamps. Estimating ~10 minutes each, this is one focused
session, not a project.

**None of it is mine to execute.** Ledger writes go through the Commander, and
`reaffirm_golf_rounds_update_grants` touches golf grants.

## Repo structure — no shadow source tree exists

| Directory | `.ts/.tsx` excl. `node_modules` |
|---|---:|
| `src/` | **3,888** |
| `helm-website-ui/` | 1 |
| `tools/` | 0 |
| `android/` | 0 |
| `.worktrees/` | 0 |

Nested `src/` dirs exist at `tools/ultra-agent-audit/src`,
`tools/ux-flow-auditor/src`, `android/app/src`,
`android/capacitor-cordova-android-plugins/src` — all empty of TypeScript, so none
shadows the app for a source search.

All three git worktrees are correctly **outside** the repo
(`~/Downloads/helmv3-push-teardown`, `~/worktrees/helmv3/overnight-remediation`).
The `.worktrees/` directory survives as an empty shell holding one macOS metadata
file; deleting it would remove the trap's last residue, but it is inert today.

**Verdict: the "agents get lost" structural cause described in the original brief
is fixed.** What remains is `node_modules` volume (INFRA-19) and the stop-hook
attribution problem (INFRA-05) — the latter being, on tonight's evidence, the one
actually costing sessions time.

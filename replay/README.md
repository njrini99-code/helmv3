<!-- markdownlint-disable MD004 MD007 MD012 MD013 MD022 MD032 MD034 MD036 MD037 MD038 MD040 MD041 MD050 MD060 -->
# Incident Replay Lab

Formalizes what the self-heal Repair stage's STEP 3 already does ad hoc
(`docs/ai-system/selfheal/repair-contract.md`): check out a `bad_version` SHA
in an isolated worktree, write or apply the regression test the repair
introduced, prove it fails there, then prove it passes at `fixed_version`.
This is not a new mechanism — it is that existing reproduction step, given a
fixture format, a manifest, and a reusable runner so the proof survives past
one Repair run instead of being thrown away.

This is the practical, minimal instantiation of the "Helm Twin" concept in
`docs/ai-system/HELM_AUTONOMY_CONTROL_PLANE.md` §3: an isolated worktree
checked out at a real release SHA, a sanitized fixture injected, a real test
run, and an observed pass/fail difference — with no production Supabase
project, no production write path, and no external side effect anywhere in
the loop.

## What this is not

**Shadow execution is explicitly out of scope for this cut** — see
`docs/ai-system/CONTROL_PLANE_IMPLEMENTATION_PLAN_2026-09-03.md` §5 (G.4.4).
It requires side-effect sinks (email/push/webhook stubs) for every external
integration this codebase has, which do not exist anywhere today — a
genuinely large build. Build it once this lab has real fixture coverage to
shadow against, not before.

**This is read-only against production, always.** A replay never opens a
Supabase connection to the production project, never calls a Vercel deploy
API, and never writes anything outside its own disposable worktree. If a
future fixture cannot be proven read-only end to end, it does not belong
here — render it "not replayable" with the reason instead of running it.

## Directory layout

```text
replay/
  README.md                 — this file
  schema/manifest.schema.json — the manifest contract; run.mjs and the
                                 vitest meta-test both validate against it
  manifests/<replay_id>.yml — one per replay: bad/fixed SHAs, fixture list,
                               test command, expected verdicts
  fixtures/<feature_id>/<replay_id>/... — the files a manifest overlays onto
                               the worktree at both SHAs (today: always the
                               repair commit's own regression test)
  runners/run.mjs           — checks out bad_version, applies the fixture,
                               runs the test, checks out fixed_version,
                               re-applies the fixture, runs it again
  proofs/<replay_id>.json   — written ONLY by a real run.mjs execution;
                               absence means "not yet run", never "passed"
  __tests__/                — the manifest-schema meta-test
```

## Manifest -> fixture -> proof, in order

1. A manifest names `bad_version`, `fixed_version`, the fixture files to
   overlay, and the test command to run against them.
2. A fixture is applied identically at both SHAs — the file, not the
   checkout, is authoritative. This is deliberate: it means a replay is
   reproducible even when the repair commit rewrote the test file's imports
   entirely (all three fixtures in this corpus do), and it means re-running
   a replay later against a since-modified `main` test file cannot silently
   change what the replay checks.
3. `run.mjs` records a `proof.json` with the real exit code, stdout tail,
   and a `failure_mode` for the bad-version run — never just pass/fail. A
   manifest can declare `expected_failure_mode` for exactly this reason: in
   this repo, STEP 3 usually means the regression test imports a symbol the
   repair itself introduces, so the bad-version run legitimately fails with
   a module-resolution error, not a thrown assertion. Both are valid
   reproductions; a proof records which one happened so a future reader
   does not mistake "unrelated drift broke the fixture" for "reproduced".

## Backfill corpus (3 replays, G.4.2)

`find memory/incidents -iname "INC-*.md"` returns 11 incident files across
four feature directories (`golf_round_lifecycle`, `admin_platform`,
`qualifiers`, `shot_tracking`) as of 2026-09-03. Three were backfilled —
sized to what has a clean, single-commit `bad_version`/`fixed_version` pair
with a named, verifiable regression test, per the spec's own instruction to
size the corpus to what actually exists rather than an invented count:

| replay_id | feature | bad_version | fixed_version |
| --- | --- | --- | --- |
| `shot-tracking-stale-delete-2026-08-22` | shot_tracking | `d5b9368d1` | `5eececafc9` |
| `shot-tracking-confirmed-recovery-prompt-2026-08-22` | shot_tracking | `4fba16c63` | `48b41e1c4d` |
| `qualifiers-automatic-completion-2026-08-22` | qualifiers | `45a87e70c` | `82aaa3bf7c` |

A fourth candidate, `admin_platform/INC-2026-08-26-error-rate-hourly-never-
written.md`, was checked and excluded: its only touching commit
(`9daee7b2e`) bundles the fix with an unrelated batch of follow-up items
("close the refit follow-up list"), so it has no clean single-commit
bad/fixed boundary to replay against without pulling in unrelated diffs.

All six SHAs in this table share one identical `package-lock.json`
(`sha256:54e0187cc56c8f67c75e85f936362cb18f748e68645c91b6865da8204a71bd03`),
verified with `git show <sha>:package-lock.json | shasum -a 256` for each —
which differs from the current `HEAD` lockfile. Practically: one real
`npm ci` against any one of these six SHAs produces a `node_modules` valid
for all three replays' `bad_version` and `fixed_version` checkouts alike.

## Running a replay

```bash
node replay/runners/run.mjs <replay_id>          # one manifest
node replay/runners/run.mjs --all                # every manifest in replay/manifests/
node replay/runners/run.mjs <replay_id> --keep    # don't remove the scratch worktree after
```

The runner reuses `scripts/new-worktree.sh` for the worktree itself (per
`AGENTS.md`'s worktree canonicality rule — this is not a second worktree
mechanism) and `scripts/ensure-worktree-deps.mjs` for the install, which
means it inherits that script's own disk-preflight refusal. **A disk
refusal is reported as `unknown`, never as a failed replay** — a tool that
could not run must not look like a tool that ran and found a problem, the
same rule `src/lib/admin/incidents/sources.ts`'s `canClaimAllClear` applies
to a blind incident source.

## Status as of this PR

No replay in this corpus has a `proofs/*.json` entry, and `run.mjs` was not
exercised end to end against a real worktree — it is verified only at the
unit/integration level (the manifest-schema meta-test, `npx tsc --noEmit`,
and direct code review of `scripts/new-worktree.sh` /
`scripts/ensure-worktree-deps.mjs`, the two existing tools it shells out to
and does not reimplement). `~/worktrees/helmv3` had 13 GiB free when this
lab was authored and 12 GiB free minutes later while running this PR's own
gates — real, observed contention from other concurrent agent sessions on
the same shared volume, not a one-time reading. `ensure-worktree-deps.mjs`
needs `reserve (12) + budget (5) = 17` GiB before it will run `npm ci`, and
`scripts/new-worktree.sh` itself refuses below its own 12 GiB reserve — so
even creating a scratch worktree to *observe* a disk refusal risked pushing
the shared volume under the floor other agents' worktrees depend on. The
Bridge's "Replay coverage" panel on `/admin/self-heal` renders this
honestly as **not yet run** for all three, not as a fabricated pass. Run
`node replay/runners/run.mjs --all` once `~/worktrees/helmv3` has real
headroom, to produce genuine proofs and finish validating the runner
end to end.

## Growing this corpus for free

`docs/ai-system/selfheal/repair-contract.md` STEP 3 now requires every
successful Repair run to write its reproduction as a fixture + manifest
under this directory, as part of finishing the repair — not as a follow-up
task. Every future Repair PR grows this lab automatically.

## Sanitization

Every manifest's `sanitization.reviewed` must be `true` before it lands —
there is no assumed-safe default. `docs/ai-system/GOLFHELM_ADVANCED_
RELIABILITY_EXTENSION.md` §10-11's warning is the binding constraint: never
raw profiles, emails, tokens, private messages, or raw logs in a fixture.
All three fixtures in this corpus are the repair commits' own regression
tests over synthetic data (literal UUIDs, in-memory storage stubs, bare
status-string inputs) — reviewed, no production data.

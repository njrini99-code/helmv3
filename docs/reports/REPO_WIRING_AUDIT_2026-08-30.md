# Repo wiring audit — is every check actually wired?

Measured **2026-08-30** against `a03ef845d`..`ad57fa828`. A point-in-time
audit, not a live document. Staleness:
`git rev-list --count ad57fa828..HEAD -- 'scripts/**' '.github/**'`.

## The question

Not "is the repo tidy" — that is not auditable. The question is narrower and
has answers: **does every check that exists actually run, and does every
ratchet actually ratchet?** A check nobody runs is indistinguishable from a
check that passes.

## Result

| | |
| --- | --- |
| guard tests that executed **never** | 19 |
| now executing | 2 promoted, 3 deleted as obsolete |
| ratchets with a baseline that no job ran | 1 — now wired |
| CI-wiring "gaps" that were false positives | 6 |

## Phase 0 — CI wiring, reconciled

A naive sweep said 30 npm scripts were "referenced nowhere." That was wrong in
both directions and worth recording as method: **CI invokes many checks as
`node scripts/…` inside multi-line `run:` blocks**, not as `npm run <name>`, so
matching on script names alone produces false positives. Six were:
`check:env-secrets`, `check:helm-bridge-env`, `check:row-caps`,
`knowledge:report`, `markdown:ratchet`, `sql:ratchet` — all wired, all passing.

Three more resolve as correctly-unwired rather than gaps:

- `check:ledger` reads its input from **stdin**; it is a pipeline component, not
  a standalone gate. (It does, separately, have no caller anywhere — see
  Findings.)
- `db:ledger-drift` needs database credentials CI does not hold.
- `orphans:mounts` prints "these are candidates, not a verdict" — advisory by
  design.

`test:rls` looked unwired and is not: pgTAP runs inside the
`Supabase lint + RLS tests` job as a direct `run:` block.

**One real gap.** `lint:duplicate-exports` has a committed baseline
(`.duplicate-exports-baseline.json`, 27 grandfathered), exits 1 on anything new
— and **no job ran it**. A ratchet nothing compares against is a green that
means nothing. Now wired as a fifth step in the `Lint ratchet` job's
continue-on-error + aggregate pattern.

## Phase 1 — the 19 guards that executed never

`vitest.config.ts` already documented this trap and ships a self-check:

```text
files in scripts/__tests__ : 51
listed in vitest.config.ts : 31
                   unlisted: 20   (19 dead + 1 false positive in my own diff)
```

All 19 import `node:test`, and **nothing in this repo runs `node --test`** — not
a script, not a workflow. Promoting one is therefore a port, not a config line.

Run under `node --test`, all 19 fail. The important part is *why*, and it splits
cleanly by whether the files each guard names still exist:

| class | n | meaning |
| --- | --- | --- |
| **GUARD-ROT** | 6 | every path the guard names was deleted |
| **CODE-DRIFT** | 10 | every path exists; the violations are real |
| needs reading | 3 | no file references to check |

Every one of the 19 missing paths was traced to a dated deletion commit — mostly
`ffd0fd8ab` (2026-07-09, the W1 Fairway consolidation) and `a259fa296`
(2026-08-18, the dead player-CoachHelm cluster). **One was a move, not a
deletion**: `GenomeRadar.tsx` now lives at `src/components/fairway/charts/`.
That distinction mattered — dropping a moved file silently loses coverage.

### Fixed and now wired

- `admin-tables-mobile` — one stale target dropped. **Green, promoted.**
- `no-arbitrary-text-px-fairway-pages` — one stale scoped file dropped, and
  `stat-xl`/`stat-lg` removed from `REQUIRED_TOKENS`: their only consumer was
  the deleted `FairwayPlayerCoachHelm.tsx`, so asserting consumption asserted a
  dead consumer. **Green, promoted.**

The `guards` project goes 11 files / 32 tests → **13 / 37**.

### Deleted as obsolete

Not "made to pass" — making a retired rule pass is implementing retired policy.

- `chart-tooltip-consolidated` — all four subject modules deleted. A guard with
  an empty subject list is not a guard. (Its rule is still live; see Findings.)
- `genome-fluid` — its subject was **rewritten**, not moved. The Fairway
  `GenomeRadar` is a recharts `ResponsiveContainer`; the guard asserts a fixed
  `viewBox`, `aspect-square` and `max-w-md` on a hand-rolled SVG that no longer
  exists. Fluidity is now structurally guaranteed by the charting library.
- `microcopy-banned-phrases` — five of seven subjects deleted when the Chat and
  Round-Review surfaces were rebuilt (`#1058`, `#984`). What remained could not
  carry the test's positive assertions.

### Repaired but still red — real drift, recorded not fixed

- `badge-consolidation` — six dead entries and one stale allowlist entry
  removed, so its failure is now **honest**: two live CRM badges
  (`EngagementBadge.tsx`, `EmailStatusBadge.tsx`) no longer delegate to
  `<Badge>`. Left unlisted deliberately. `/golf/admin/crm` is **not** dead —
  `next.config.mjs:183` redirects `/golf/admin` on the EXACT path only, and 144
  files live under that tree. Fixing this is a colour-fidelity refactor the
  guard's own comments warn about; it is product work, not audit work.

### Not repaired — real code drift, with counts

Every rule below was checked against `.claude/rules/design-system.md` and is
**still live policy**. None is retired, so none should be deleted; each is a
piece of design debt that a working guard would have caught.

| guard | violating files |
| --- | --- |
| `sweep-clean-app` | 56 |
| `sweep-clean-components` | 23 |
| `no-stale-cream-hardcodes` | 17 |
| `no-arbitrary-text-px-components` | 16 |
| `no-raw-button-product` | 12 |
| `motion-reduced-motion-coverage` | 10 |
| `single-h1-per-page` | 8 |
| `no-vh-in-mobile-paths` | 4 |
| `no-arbitrary-text-px-app` | 1 |
| `cmd-k-coverage` | 1 |
| the other three | assertions carry no file list |

`no-raw-button-product`'s hits are mostly inside `__tests__/*.test.tsx` files,
which suggests its exclude list is wrong rather than the product being wrong.
That one is closer to rot than drift and is the cheapest of the ten to revisit.

## Bottleneck — measured, and not where it was feared

`vitest.config.ts` warns that eleven of these sweeps each walk every `.ts`/`.tsx`
under `src/` (~4,066 files, ~45,000 sequential reads) and carries a 120s timeout
for it. Measured today, the whole `guards` project runs in **1.48s**, and each
newly promoted guard costs **0.1s**. The generous timeout is correct as a
fail-safe, but promoting more guards is not a CI-cost problem. Nothing here
argues for promoting in waves.

## Findings that are not about wiring

**Two `ChartTooltip` components, one exported name.**
`src/components/fairway/charts/ChartTooltip.tsx` (220 lines) has five real
importers, all relative. `src/components/ui/chart-tooltip.tsx` (108 lines) has
**zero** importers — but is re-exported as `ChartTooltip` from
`src/components/ui/index.ts`, so anyone importing `ChartTooltip` from
`@/components/ui` silently gets the dead one. This is precisely what the
`chart-tooltip-consolidated` guard existed to prevent, and it happened while
that guard was not running. Not deleted here: it is product code, and Knip's
weekly dead-code job is the right owner.

**`check-migration-ledger.mjs` has no caller.** Its reconciler is tested
(`scripts/__tests__/check-migration-ledger.test.mjs`, which does run) but the
tool itself is invoked by nothing — a tested component with no consumer. Adjacent
to `MIGRATIONS_REPO_PRODUCTION_LEDGER_DIVERGENCE`; noted, not wired, because
what should pipe into it is a design decision.

## Branch durability — the verdict that hid it

`AGENTS.md` treats "no important work exists in one accidental local ref" as the
point of branch hygiene, and `NO_UPSTREAM_UNIQUE_WORK` is the verdict that
surfaces it. Measured directly rather than through the tool, **nine branches held
commits that existed nowhere but this laptop** — up to 95 on one:

```text
backup/1641-pre-phase2-2026-08-27          11
backup/1641-pre-restack-2026-08-27         10
backup/1656-pre-main-refresh-2026-08-28    14
preserve/claude-ckpt                        1
preserve/local-main-2026-08-27              6
preserve/pr852-closed                      33
recovered/stash-0                          12
recovered/stash-1                          95
recovered/stash-2                           4
```

The lifecycle tool reported **none** of them, and was not wrong to: it checks the
protected prefixes (`backup/`, `preserve/`, `recovered/`, `stage/`) *before* it
checks for unique upstream-less work, so those branches return `KEEP_PROTECTED`
and never reach the durability verdict. Both verdicts are correct in isolation.
The ordering means **the branches named for preservation are exactly the ones
whose non-durability is invisible.**

That also reconciles an earlier claim. The 2026-08-30 closeout recorded
`NO_UPSTREAM_UNIQUE_WORK remaining: NONE` after pushing ten branches. True as
stated — protected branches were never in that verdict's population.

All nine were scanned and pushed. **gitleaks: no leaks found, 127 commits
scanned** on the four largest before any push; the only secret-shaped literal
was `.env.example`'s placeholder `your-service-role-key`. Branches whose work
exists in one place: **9 → 0**.

Not changed here: whether `KEEP_PROTECTED` should still report unique-work
status alongside its verdict. It is a real question — a protected branch cannot
be deleted by the tool, so the durability fact is advisory rather than
load-bearing — and it is a design decision, not a repair.

### A zsh trap worth its own line

Pushing them failed seven times with `src refspec ... does not match any` against
refs that demonstrably resolved. In zsh, `"refs/heads/$b:refs/heads/$b"` parses
`$b:r` as the `:r` history modifier and **eats the `:r`**, yielding
`refs/heads/recovered/stash-0efs/heads/recovered/stash-0`. The same command typed
literally works, which is what makes it convincing: the bug appears only when the
branch name is a variable. `git push origin "$b"` avoids it.

## What this audit did not cover

118 script files under `scripts/` are unreachable from CI. Most of that is
**correct** — one-off operational tooling (`stripe-*`, `send-coach-*`,
`verify-emails-*`, `backfill-*`, `reseed-*`) is not a gate and should not be
wired. Deliberately out of scope rather than swept.

One explicit exception worth stating: **`scripts/deploy-prod.sh` is not dead.**
It is the production deploy path, and PR #1678 is open about the claim that
deploying through it is UNENFORCED. Its absence from CI is deliberate.

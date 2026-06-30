# BaseballHelm route/shell contract runbook (#374)

This is the operations doc for the BaseballHelm route/shell contract:

- **Analysis core (pure):** `src/lib/baseball/route-contract.ts`
- **Filesystem inventory + curated manifests (Node-only):**
  `src/test/helpers/baseball-route-inventory.ts`
- **Advisory contract test:**
  `src/app/baseball/actions/__tests__/route-shell-contract.test.ts`
- **Report generator:** `scripts/baseball/generate-route-coverage-report.ts`
  (`npm run baseball:route-coverage`)
- **Generated artifact:**
  `docs/operations/generated/route-coverage-report.json`

The test and the generator both call `analyzeRouteContract()` — the rules for
"what counts as a gap" live in exactly one place. This doc explains what each
gap bucket means, how a route rename should be handled, and the exact
promotion path from advisory to hard-gated CI enforcement.

## Why this exists

BaseballHelm's navigable surface is declared in four places that can drift
independently:

1. `src/lib/baseball/nav-registry.ts` — `BASEBALL_NAV_REGISTRY` +
   `BASEBALL_MESSAGES_NAV` (the top-level sidebar / mobile-nav truth).
2. `src/app/baseball/(dashboard)/_components/hub-definitions.ts` — the
   `COACH_*_TABS` / `PLAYER_*_TABS` grouped-hub sub-tab arrays.
3. The real App Router filesystem under `src/app/baseball/`.
4. The server-guard capability policy in
   `src/lib/supabase/middleware.ts` (`STAFF_CAPABILITY_ROUTES`) and
   `src/lib/baseball/server-route-guards.ts`.

This contract reconciles all four into one report instead of relying on each
feature PR to remember every consumer.

## Gap buckets

| Bucket | Meaning | Enforcement |
|---|---|---|
| `staleLinks` | A `BASEBALL_NAV_REGISTRY` href, `playerHref`, or `BASEBALL_MESSAGES_NAV` href that resolves to neither a real page on disk nor a registered alias. | **Advisory** (console-reported), except the curated known-good set below, which is **hard-failed**. |
| `orphanRoutes` | A real page on disk with no nav entry, hub-tab href/`matchPrefixes`, or alias-manifest reference. | **Advisory** only. |
| `staticHubTabs` | A hub-tab href (`COACH_*_TABS` / `PLAYER_*_TABS`) with no backing page on disk (regardless of whether it also has a top-level registry entry — most hub tabs intentionally don't). | **Advisory** only. |
| `missingDynamicSamples` | A dynamic route template (`[id]`, `[gameId]`, ...) on disk with no representative sample id registered in `DYNAMIC_ROUTE_SAMPLES`. | **Advisory** only. |
| `guardWithoutNavGating` | A capability-gated route from `STAFF_CAPABILITY_ROUTES` whose nav-registry entry is missing or whose `requiredCapability`/`requiredAnyCapabilities` doesn't match. | **Hard-failed**, no allowlist (see Scope note below). |

`guardWithoutNavGating` is intentionally NOT advisory: it is the
defense-in-depth invariant already locked by
`src/lib/baseball/__tests__/nav-capability-gating.test.ts`, and a regression
here means a staffer can be redirected by middleware to a route the nav never
advertised matching gating for.

### Scope note — program-type guards are deferred

`middleware.ts` also program-type-gates `RECRUITING_ROUTES`, `ORG_ROUTES`, and
`ACADEMICS_ROUTES`, but those consts are module-private (not exported), and
several nav-registry entries they cover (`pipeline`, `discover`, `watchlist`,
`compare`, `comparisons`, `college-interest`, `scout-packets`, `camps`,
`academics`) do not yet carry matching `allowedProgramTypes` nav metadata.
Folding that policy into `guardWithoutNavGating` today would make a
hard-gated bucket non-empty, so this pass scopes the bucket to the capability
policy alone. **Follow-up:** export those route lists from `middleware.ts`,
add a `programGuardWithoutNavGating` advisory bucket, and either backfill
`allowedProgramTypes` on the affected registry entries or document why they
stay nav-ungated.

## Renames: the rule

**Every route rename must ship in the same PR as one of:**

1. A new entry in `REDIRECT_ALIAS_MANIFEST`
   (`src/test/helpers/baseball-route-inventory.ts`) with a `reason` and
   `implementedAt` pointing at the actual redirect implementation, **or**
2. Updated nav-registry / hub-definition hrefs pointing at the new path, with
   no dangling reference to the old one.

If neither happens, the rename surfaces as a `staleLinks` (old href orphaned
from the registry/hub side) or `orphanRoutes` (new page with no nav reference)
gap on the next report run — console-reported today, and a CI failure once
the relevant bucket is promoted to hard-gated (see below).

## Regenerating the report

```bash
npm run baseball:route-coverage
```

Writes `docs/operations/generated/route-coverage-report.json` with per-bucket
gap lists + counts, the alias manifest, the dynamic-route sample registry, and
a `generatedAt` timestamp. Safe to run anytime; it never mutates app code.

## Promoting an advisory bucket to a hard gate

Each advisory bucket (`staleLinks` beyond the curated known-good set,
`orphanRoutes`, `staticHubTabs`, `missingDynamicSamples`) is promotion-ready
once:

1. The bucket is at zero for the current codebase (run
   `npm run baseball:route-coverage` and check `counts`), **or** every
   remaining item is intentionally allowlisted in `ADVISORY_ALLOWLIST`
   (`route-shell-contract.test.ts`) with a documented reason.
2. The bucket has stayed at that state for a defined stabilization window
   (recommend: two consecutive weekly CircleCI `weekly` runs, or ~2 sprints)
   with no un-allowlisted regression.
3. Team sign-off that the bucket should block merges going forward.

**The one-line change** (per bucket, in
`src/app/baseball/actions/__tests__/route-shell-contract.test.ts`): replace
the `reportAdvisory('<bucket>', result.<bucket>)` call in that bucket's `it()`
with a hard assertion against the un-allowlisted subset, e.g.:

```ts
it('staleLinks is empty (hard-gated)', () => {
  const allowlisted = allowlistedHrefs('staleLinks');
  const unallowlisted = result.staleLinks.filter((item) => !allowlisted.has(item.href));
  expect(unallowlisted).toEqual([]);
});
```

No changes to `route-contract.ts` or the generator are needed — both already
compute the full bucket; only the test's enforcement level changes.

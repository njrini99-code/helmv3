#!/usr/bin/env tsx
/**
 * dump-feature-keys.mjs — print `FEATURE_REGISTRY`'s `{key, app, tier}` as
 * JSON to stdout.
 *
 * `world-model.mjs` is plain `.mjs` on purpose (no tsx dependency for its
 * main pass), but `FEATURE_REGISTRY` is defined in a `.ts` file and its
 * `FeatureKey` set is a value derived at import time (`check-feature-
 * registry.ts`'s own comment: "FEATURE_KEYS is a Set derived from
 * FEATURE_REGISTRY, not an array literal, so it has to be IMPORTED"). Rather
 * than regex-scanning a ~1700-line generated-adjacent file (fragile: the
 * `actions` manifest between `app:` and `tier:` on each entry can be large
 * enough for a naive non-greedy match to behave unpredictably), this one
 * small step is spawned through `tsx`, the same way `scripts/knowledge/
 * check.mjs` spawns `check-feature-registry.ts` and `gen-feature-map.ts` for
 * the same reason.
 */
import { FEATURE_REGISTRY } from '../../../src/lib/admin/feature-registry.ts';

const dump = FEATURE_REGISTRY.map((f) => ({ key: f.key, app: f.app, tier: f.tier })).sort((a, b) =>
  a.key.localeCompare(b.key),
);
process.stdout.write(JSON.stringify(dump));

# `docs/superpowers/specs/` — design specifications

**A spec describes an intended design. It is not a registry, an inventory, or a
statement about what is running.**

That distinction was not always kept. `helm-bridge/FEATURE_COVERAGE.md` called
itself a "Canonical spec" and was being read as the list of features Helm has —
while nothing regenerated it and nothing failed when it drifted. A directory
named `specs/` cannot hold a live registry. It was demoted to `DESIGN_SPEC` on
2026-08-30 and its registry role moved to the two places that actually own it:

```text
src/lib/admin/feature-registry.ts   runtime FeatureKey vocabulary, imported by
                                    shipped code, so it cannot drift from it
memory/registry.yml                 semantic feature identity + the crosswalk,
                                    checked by npm run knowledge:registry-check
```

What a spec is still the best source for is **reasoning** — why an
instrumentation rule exists, what was rejected, which trade-off was taken. That
does not rot the way an inventory does, and nothing else in the repository
records it.

`memory/registry.yml` routes to no file in this directory, and
`npm run knowledge:check` fails if that changes.

Per-file categories and lifecycle: `docs/generated/DOCUMENT_AUTHORITY_INVENTORY.md`.

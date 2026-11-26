# Ratchet baselines

Every `*-baseline.json` here is the grandfathered count for one ratchet or
audit script. A count may only go down. They moved here from the repo root on
2026-11-25 (repo tidy 1); each script resolves its file from the repo root, and
`--update` rewrites it in place.

| Baseline | Script that reads it |
| --- | --- |
| `.any-ratchet-baseline.json` | `scripts/ratchets/any-ratchet.mjs` |
| `.cycles-baseline.json` | `scripts/checks/check-cycles.mjs` |
| `.dead-refs-baseline.json` | `scripts/knowledge/document-inventory.mjs` |
| `.doc-path-baseline.json` | `scripts/checks/check-doc-path-drift.mjs` |
| `.doc-schema-baseline.json` | `scripts/checks/check-doc-schema-drift.mjs` |
| `.duplicate-exports-baseline.json` | `scripts/checks/check-duplicate-exports.mjs` |
| `.fail-open-baseline.json` | `scripts/fail-open-audit.mjs` |
| `.healthy-on-error-baseline.json` | `scripts/healthy-on-error-audit.mjs` |
| `.lint-baseline.json` | `scripts/ratchets/lint-ratchet.mjs` |
| `.markdownlint-baseline.json` | `scripts/ratchets/markdown-lint-ratchet.mjs` |
| `.migration-drift-baseline.json` | `scripts/db/migration-ledger-drift.mjs` |
| `.migration-headers-baseline.json` | `scripts/db/check-migration-headers.mjs` |
| `.paginated-read-baseline.json` | `scripts/paginated-read-audit.mjs` |
| `.registry-globs-baseline.json` | `scripts/checks/check-registry-globs.mjs` |
| `.sqlfluff-baseline.json` | `scripts/ratchets/sql-lint-ratchet.mjs` |
| `.supabase-chunk-baseline.json` | `scripts/supabase-chunk-audit.mjs` |
| `.supabase-error-baseline.json` | `scripts/supabase-error-audit.mjs` |
| `.test-location-baseline.json` | `scripts/ratchets/test-location-ratchet.mjs` |
| `retrieval-bench-baseline.json` | `scripts/knowledge/bench.mjs` |
| `supabase-advisor-baseline.json` | `scripts/db/advisor-ratchet.mjs` |

Most names start with a dot, so `ls -A` shows them.

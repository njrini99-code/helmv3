# Security Hygiene Report

Generated from first-pass audit outputs on branch cleanup/comprehensive-code-audit. First pass is audit/report only; no product-code cleanup is approved.

## Potential Secret-Like Findings

Do not include raw secrets. Redact values.

| File | Pattern | Risk | Recommendation |
|---|---|---|---|
| `.cleanup/reports/secret-pattern-scan.txt` | Raw grep output risk | SECURITY_REVIEW | The playbook command is unsafe as written because it does not exclude env/key files or `.cleanup`; raw output was truncated after self-recursive expansion. Do not commit raw scan output. |
| `src/lib/supabase/admin.ts` and service-role callers | `SUPABASE_SERVICE_ROLE_KEY` | SECURITY_REVIEW | Keep admin-client use scoped and server-only. |
| docs/scripts/comments | token/secret/password strings | MANUAL_REVIEW | Re-run with a dedicated secret scanner and redacted output. |

## Service Role / Admin Client Risk

| File | Concern | Recommendation |
|---|---|---|
| `src/lib/supabase/admin.ts` | Central service-role creation path | No cleanup without security review. |
| `src/app/golf/actions/stats-data.ts` | Service-role fallback around detailed stats reads | Preserve explicit authorization gates. |
| Baseball admin/service paths | Frozen | DEFERRED_BASEBALLHELM. |

## Environment Variable Hygiene

| File | Issue | Recommendation |
|---|---|---|
| `.env*` local files | Must not be scanned into tracked reports | Exclude with `--exclude='.env*'`. |
| raw report files | May contain sensitive values | Add gitignore policy for raw secret scans. |

## Playbook Safety Finding

The Phase 14 command should be amended before merge to exclude `.env*`, key material, and `.cleanup`, and to keep raw reports untracked.

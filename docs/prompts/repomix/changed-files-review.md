# HelmV3 Changed Files Review

Use this with `npm run ctx:changed` or `npm run ctx:staged`.

## Goal

Review only the changed HelmV3 files and decide whether the patch is safe to merge.

## Rules

- Lead with bugs, regressions, missing tests, or broken wiring.
- Avoid style-only commentary unless it hides a product, security, or maintainability issue.
- Check that Helm Bridge changes land in `src/app/admin/**`, `src/app/api/admin/**`, `src/lib/admin/**`, or shared code actually consumed by those paths.
- Verify scripts and generated outputs are ignored when they should be.
- Name any commands that failed or were not run.

## Output

1. Merge verdict.
2. Blocking findings.
3. Non-blocking findings.
4. Verification run.
5. Follow-up cleanup that should not block this patch.

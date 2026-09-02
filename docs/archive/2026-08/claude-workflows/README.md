# Archived Claude workflows (moved 2026-08-19)

These six scripts were one-off automations for tasks that have completed. They
lived in `.claude/workflows/` — an **active configuration path** — where they
were indistinguishable from live control-plane infrastructure.

    golfhelm-remediation-wave1.js         remediation wave 1
    golfhelm-remediation-wave2-color.js   the emerald/green colour consolidation
    golfhelm-vibecoded-audit.js           the 16-dimension craft audit
    course-library-phase5-verify.mjs      course-library phase 5 verification
    round-flow-rewire-analyze.mjs         round-flow rewire analysis
    merged-features-integration-test.mjs  a merge-window integration check

## Why they moved rather than being deleted

Each encodes how a specific historical migration was actually performed, which
is worth keeping — `golfhelm-remediation-wave2-color.js` in particular records
the classification logic that decided which greens meant "brand" and which were
deliberate data-viz accents. That reasoning is not recoverable from the diff.

## Why they should not have stayed in `.claude/`

`.claude/` is read as current agent configuration. A completed task script
sitting beside live hooks and rules:

- adds search noise — an agent grepping `.claude/` for how this repo works hits
  six scripts describing work that finished months ago;
- carries apparent authority, since location implies currency;
- risks re-execution of a migration that has already been applied.

Before moving them, the only reference outside `.claude/workflows/` itself was
from `docs/archive/2026-06/audits/GOLFHELM_VIBECODED_AUDIT_2026-06-14.md` —
already archived — so nothing active broke.

**These are history, not authority.** Do not run them against the current tree
without re-reading them first; they assume a repo state that no longer exists.

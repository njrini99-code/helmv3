# BaseballHelm Bug Audit — 2026-06-30

## What this is

8 parallel codebase audits of BaseballHelm (each scoped to a distinct feature
area) were run to find concrete, reproducible bugs and UI/UX problems — as
opposed to re-stating the architectural/tech-debt work already tracked in
issues #367-#418 (active-context migration, RLS scoping, demo seeding, route
registry consolidation, product-truth contracts, etc.).

Every finding below is backed by file/line citations from on-disk source at
audit time and was cross-checked against the ~50 open BaseballHelm issues to
avoid duplicating already-tracked work.

**Total: 61 distinct findings** (7 × P0, 31 × P1, 23 × P2 by the auditing
agents' own severity calls — severity is informational only; GitHub labels on
the generated issues use this repo's existing label set: `bug`, `baseball`,
plus `stats` / `coachhelm` / `import` / `high-risk` where applicable).

## Why this doc exists instead of 61 filed issues

The agent that ran this audit only has **read-only** GitHub CLI access (per
its tool policy, `gh` may be used to view information but not to create or
modify issues/PRs), and there is no issue-creation MCP tool configured in this
workspace. So the findings could not be filed directly.

Instead, everything needed to file them is in
[`scripts/baseballhelm-bug-audit/issues.mjs`](../scripts/baseballhelm-bug-audit/issues.mjs)
as structured `{ title, labels, body }` objects, plus a runner script:

```bash
# Preview titles/labels without calling the GitHub API
node scripts/baseballhelm-bug-audit/create-issues.mjs --dry-run

# File a subset first if you want to sanity-check formatting (1-indexed, inclusive)
node scripts/baseballhelm-bug-audit/create-issues.mjs --yes --start 1 --end 3

# File all 61
node scripts/baseballhelm-bug-audit/create-issues.mjs --yes
```

Requires `gh` installed and authenticated (`gh auth status`) — uses your own
write access, run from your machine or any environment with full `gh` perms.

## Areas covered

| Area | Findings | Notable highlights |
|---|---|---|
| Recruiting & Discovery | 8 | Pipeline drag-and-drop writes invalid stage values; Discover Teams pagination/count is wrong; pipeline stage UI offers 2 stages the server rejects |
| Stats & Performance | 7 | Editing a completed box score can silently delete existing lines; innings-pitched summed as decimals instead of outs (breaks ERA/WHIP); OBP/SLG/OPS never computed for legacy aggregates |
| Team Operations | 8 | The primary college/JUCO team-join-code flow is broken end-to-end; camp capacity isn't enforced atomically (overbooking); calendar `requires_rsvp` is never persisted |
| Communication & Content | 8 | Players can't complete their own dev-plan goals (wrong capability gate); first players to see a new announcement never get an Acknowledge button; document upload/versioning UI is non-functional |
| Player Daily Experience | 8 | Today's readiness/lift card reads/writes a different table than the gating read-model (contradictory UI on the same day); practice CTAs send players to the coach planner, not the player view |
| Coach Variants, Settings, Onboarding | 8 | Player onboarding completion still uses a raw client `.update()` instead of the UPSERT-safe server action that already has regression tests; privacy settings save fields that don't match the real schema |
| CoachHelm AI | 7 | Insight dismiss/feedback compares the wrong ID types and returns "Forbidden" for every real coach; even once fixed, the engine's next run would resurrect dismissed insights |
| Mobile UI/UX | 7 | Many pages stack a legacy `Header` on top of the shell's own sticky bar, eating ~120px+ of mobile viewport and duplicating notification UI |

## Full findings

See `scripts/baseballhelm-bug-audit/issues.mjs` for the complete, ready-to-file
list (61 entries) with full Problem / Evidence / Why it matters / Acceptance
criteria write-ups in this repo's existing issue style (matches issue #368 as
the style reference).

## Caveats

- A handful of files referenced here (`onboarding.ts`, `documents/page.tsx`,
  `with-baseball-action.ts`, `philosophy.ts`, `recruiting-philosophy.ts`,
  `watchlist.ts`, `interests.ts`) had **in-progress local diffs** in this
  workspace at audit time. The relevant findings note this explicitly —
  re-verify against the latest on-disk content before starting work, since
  some gaps may already be partially addressed by that in-flight change.
- These are static-analysis-grade findings (careful code reading, not live
  reproduction against a running app/DB). Confirm each one against a real
  environment before fixing, especially the timezone/date-math and realtime
  subscription findings, which are easiest to misjudge from code alone.
- Severity labels in the source script are the auditing agents' judgment calls,
  not a formal triage — re-prioritize as needed when filing.

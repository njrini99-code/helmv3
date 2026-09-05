<!--
STATUS: PARKED
DATE: 2026-07-10
MOVED: 2026-09-05, from docs/qa/baseball-fairway-visual-audit-2026-07-04/ to
docs/archive/2026-07/baseball-fairway-visual-audit-2026-07-04/. The 108
labeled PNG screenshots and the two manifest.json sidecar files this README
describes below were `git rm`'d in the same change — they remain recoverable
from git history (`git log --diffFilter=D -- docs/qa/baseball-fairway-visual-audit-2026-07-04`)
but are no longer in the tracked tree. That directory was orphaned from the
rest of the doc corpus (self-referencing only — no memory/registry.yml,
AGENTS.md, or top-level docs/*.md named it) and two months stale, at ~80MB
for a repo whose whole docs/ tree should not need to carry that. The prose
below — the diagnostic value of NAV_ISSUES.md especially — is kept because
it explains real, fixed bugs without needing the screenshots to make sense.
PARKING DECISION: Entry point for the (now-archived) BaseballHelm Fairway
visual QA pack generated 2026-07-04. Kept as historical audit evidence
(paper trail for NAV_ISSUES.md); do not treat any of this as current UI
truth without re-running the audit, since the Fairway migration continued
after this pass.
KEPT FOR HISTORY -- do not delete this file.
-->

# BaseballHelm Fairway Visual QA Pack

**Generated:** 2026-07-04 · **Archived:** 2026-09-05
**Purpose:** Labeled screenshots from coach + player click-through audits, cross-referenced to code and database dependencies.

## Structure (as originally generated — screenshots and manifests since removed, see MOVED note above)

```
docs/qa/baseball-fairway-visual-audit-2026-07-04/   (historical path)
├── README.md          ← this file
├── coach/
│   ├── INDEX.md       ← human index (routes, code, DB, notes)
│   ├── ERRORS.md      ← redirects, failures, console errors only
│   ├── manifest.json  ← machine-readable metadata (removed 2026-09-05)
│   ├── desktop/       ← labeled PNGs (removed 2026-09-05)
│   └── mobile/        (removed 2026-09-05)
└── player/
    ├── INDEX.md
    ├── ERRORS.md
    ├── manifest.json  (removed 2026-09-05)
    ├── desktop/       (removed 2026-09-05)
    └── mobile/        (removed 2026-09-05)
```

See [NAV_ISSUES.md](NAV_ISSUES.md) for the continual routing/nav issue registry derived from this pack.

## Accounts (demo seed)

| Role | User | Team |
|------|------|------|
| Coach | Nick Rini | Rini University Baseball |
| Player | Marcus Rodriguez (#7) | Rini University Baseball |

## Summary

- **Coach:** 72 desktop routes + 7 mobile spot-checks. Fairway shell renders correctly on all coach-intended routes. Several player-only or showcase-only routes redirect as designed.
- **Player:** 22 desktop routes + 7 mobile spot-checks. Player Today hub, stats, profile, development, team, and recruiting surfaces render correctly. College-player gates on Activate; the coach-only Interest surface has been moved out of player nav.

## Known issues (both roles)

1. SLG / OPS / exit velo columns show `—` despite AVG/OBP populated (seed/compute gap).
2. Stats Center charts empty while tables have data (event-level visuals not seeded).
3. Coach pipeline/discover empty (no recruits in demo seed — empty states OK).

## Player-specific follow-ups

1. `/dashboard/dev-plan` — cold URL can bounce before navContext resolves; sidebar navigation works.

## Regenerate

```bash
# Run audits (requires local dev + credentials via env)
E2E_ROLE=coach E2E_EMAIL=... E2E_PASSWORD=... OUT_DIR=/tmp/baseball-qa-full node scripts/tmp-baseball-route-audit.mjs
E2E_ROLE=player E2E_EMAIL=... E2E_PASSWORD=... OUT_DIR=/tmp/baseball-qa-full node scripts/tmp-baseball-route-audit.mjs
node scripts/build-baseball-qa-pack.mjs
```

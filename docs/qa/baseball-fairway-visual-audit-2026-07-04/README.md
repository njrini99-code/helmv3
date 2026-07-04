# BaseballHelm Fairway Visual QA Pack

**Generated:** 2026-07-04  
**Purpose:** Labeled screenshots from coach + player click-through audits, cross-referenced to code and database dependencies.

## Structure

```
docs/qa/baseball-fairway-visual-audit-2026-07-04/
├── README.md          ← this file
├── coach/
│   ├── INDEX.md       ← human index (routes, code, DB, notes)
│   ├── ERRORS.md      ← redirects, failures, console errors only
│   ├── manifest.json  ← machine-readable metadata
│   ├── desktop/       ← labeled PNGs (01-coach-…)
│   └── mobile/
└── player/
    ├── INDEX.md
    ├── ERRORS.md
    ├── manifest.json
    ├── desktop/
    └── mobile/
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

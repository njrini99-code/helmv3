# 2026-11-11 — retired pages

## 2026-11-11 — Old page versions retired; old addresses open the current page

```text
Design package: none (owner decisions, 11 Nov 2026)
PR/commit:      agent/clubhouse-release-train, e8eb79b972, b0a7cb39d8, 4b5a82a987
Contract IDs:   see the P009 and P013 entries of this date
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `preview/retired.ts` (new): a retired `/clubhouse-preview/<screen>` address
  redirects to the screen that replaced it. Today: `my-qualifiers` to
  `qualifiers-player`, `coachhelm` to `coachhelm-team`.
- `styles/base.css` and `styles/controls.css`: the retired boards' classes
  (`.ch-hl-focus`, `.ch-hl-since__b`) leave two shared selector lists. No rule
  for a surviving element changed.
- `src/clubhouse/AGENTS.md` lists the one current version of each page, and
  `design/handoff/RETIRED.md` lists the handoff files that are no longer the
  design (the "Your players." Roster).
- The capture scripts (`scripts/clubhouse/a11y.mjs`, `aesthetic-capture.mjs`,
  `premium-capture.mjs`, `e2e/clubhouse-materials.spec.ts`) name the surviving
  previews.

### Why

- The owner, 11 Nov 2026: "Get rid of the old versions or note them as retired
  so this doesn't happen again."

### Verification

- See the P009 and P013 entries of this date.

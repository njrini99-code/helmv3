# 2026-11-15 — auth

## 2026-11-15 — The ivory page and one system (production audit look rows)

```text
Design package: clubhouse-handoff/prod-audit-2026-11-15/CLUBHOUSE-PROD-AUDIT-FINAL.md; design-refresh/DESIGN_LANGUAGE.md
PR/commit:      claude/project-thread-d9q2qs
Contract IDs:   none added or reworded
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Two figures move from the 650 weight to 600 (weights are 400, 500, 600, 700).
- The shared change (page, cards, ink, charts, toggle, keys, elevations, radii)
  is logged once in
  [docs/clubhouse/changes/2026-11-15-ivory-page-one-system.md](../../../changes/2026-11-15-ivory-page-one-system.md).

### Why

- Nick's 15 Nov calls ("Bring the ivory gradient back", "Ivory cards, deeper
  page", "The Practice-style toggle everywhere") and the production audit's
  specs S1.1 to S2.8.

### Verification

- Unit tests for tokens, page colour, contrast, toggles and ratchets; before and
  after screenshots at 393 and 1440, light and dark, Chromium (tier C), in the
  PR.

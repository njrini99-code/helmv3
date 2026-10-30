# 2026-10-30 — Team Hub: season label from the 1 August rule

## 2026-10-30 — The season shown is computed, never the stored text (F-0002)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0002 S0; fix
                plan PR 2)
PR/commit:      claude/audit-fix-02-season-label
Contract IDs:   none
Actions:        none (the golf_teams.season column and the Settings write are
                untouched)
Data impact:    none
Held items:     whether to remove the now-unused Settings "Season" field is
                the owner's call (fix plan §4, decision 2)
```

### Changed

- The Team Hub header shows the computed season. It is `currentSeasonLabel(now, zone)` (`data/season.ts`): 1 August in
  the team's zone, en dash, "2026–27". Files: `data/hub.ts`.

### Why

- The loaders printed `golf_teams.season`, free text typed once in Settings,
  so the demo team read "2025-26" in October 2026.

### Verification

- `src/clubhouse/lib/__tests__/season-label.test.ts` (new): red on `main`
  (`expected '2025-26' to be '2026–27'`), green after.

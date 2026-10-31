# 2026-10-30 — Skeleton feature shape

## 2026-10-30 — Skeleton takes shape="feature" (F-0060)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0060; fix plan
                PR 4)
PR/commit:      claude/audit-fix-04-rounds-live-shot (#2415)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- ui/States.tsx: Skeleton shape="feature" draws a block on the feature (green
  hero) tone, so a page whose hero is a feature card lands without a tone
  change.

### Verification

- review-skeleton-hero.test: red on main, green after.

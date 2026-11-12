# 2026-11-12 — rounds

## 2026-11-12 — A round entry failure raised twice is one toast (G18)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   CH-11010, CH-11011, CH-11902 (a repeat replaces the one on screen)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Each entry failure toast carries its own `replace` key, so raised again it takes the place of the one on screen instead of stacking a copy.

### Why

- Grading 2d-A (G18): the entry preview showed each toast twice (Strict Mode runs its mount effect twice in development); the real round can raise "updated on another device" for two refused saves.

### Verification

- `round-entry.test.tsx` (twice, and a Strict Mode mount), `round-entry-continue`, `round-entry-wiring`, `preview-entry-layout`: exit 0.

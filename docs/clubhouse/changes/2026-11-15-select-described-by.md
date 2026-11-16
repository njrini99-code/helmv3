# 2026-11-15 — Select can name its help text

## 2026-11-15 — `ui/Select.tsx` `describedBy` (launch readiness F-04)

```text
Design package: none; no visible change
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f04)
Contract IDs:   used by 90181, CH-09281
Actions:        none of its own (ACT-P009-TIE-RULE uses it)
Data impact:    none
Held items:     none
```

### Changed

- **`src/clubhouse/ui/Select.tsx`** takes an optional `describedBy`, set as the
  native select's `aria-describedby`, so a screen reader reads a field's help
  sentence with it (the qualifier form's Ties field says what the rule does).
  Left out, nothing changes for any other Select.

### Why

- The Ties field's help changes with the rule and with whether the rule can be
  saved; it has to be read with the control, not found separately.

### Verification

- `src/clubhouse/__tests__/qualifier-ties.test.tsx` (90181 reads the help
  through the field's `aria-describedby`).

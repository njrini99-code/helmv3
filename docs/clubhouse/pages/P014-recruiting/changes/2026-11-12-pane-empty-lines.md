# 2026-11-12 — recruiting

## 2026-11-12 — The prospect pane draws an empty part as one line (W42)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   CH-14303, CH-14304, CH-14305 (desktop layout)
Actions:        none
Data impact:    none
Held items:     the empty-state design (W19/Q3, the owner's)
```

### Changed

- Desktop: under its heading an empty part is one line, the "No … yet" and its
  Add, no icon tile; the longer line describes the Add (aria-describedby). The
  phone's rows on seams are unchanged.

### Why

- Nick's walk (W42): three empty states stacked in the pane.

### Verification

- `pane-empty-lines.test.ts` (new), `recruiting.test.tsx` (the Add's
  description), hairline guard lowered where the tile's ring went: exit 0.

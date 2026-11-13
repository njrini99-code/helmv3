# 2026-11-12 — recruiting

## 2026-11-12 — A pipeline stage with nobody in it is quiet (W41)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   CH-14601 (the zero coin)
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- A stage at 0 draws the quiet ivory coin whatever its stage, light and dark;
  pressed, it keeps its second ring.

### Why

- Nick's walk (W41): "Committed 0" was the only filled dark ring.

### Verification

- `pipeline-zero.test.tsx` (new), `recruiting.test.tsx`: exit 0.

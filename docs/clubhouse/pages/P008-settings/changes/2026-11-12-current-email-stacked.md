# 2026-11-12 — settings

## 2026-11-12 — Current email reads under its label (G8)

```text
Design package: none (preview grade G8, GRADE_A.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     other read-only rows (Version, On the roster) keep the label-left, value-right row, the iOS Settings pattern
```

### Changed

- In Account's email section, "Current email" and its address stack, label over
  value, as the New email field under it
  reads. `Row` takes `stack` for this.

### Why

- Preview grade G8: on a desk the label and the address sat at opposite ends of
  a wide row.

### Verification

- `screens/settings/__tests__/row-stack.test.tsx`; settings suites with
  look-feel-pass-css, 35 files, 490 tests, exit 0;
  eslint exit 0. Not re-shot in WebKit.

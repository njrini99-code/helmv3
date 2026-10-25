# 2026-10-24 — Screen gaps (Clubhouse A+ lane D)

## 2026-10-24 — Failure hints say Try again (CONS-6)

```text
Design package: none (Clubhouse A+ handoff, B10.3 and CONS-6)
PR/commit:      agent/aplus-lane-d
Contract IDs:   CH-12002, CH-12006, CH-12203
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- The sync and delete-all failure toasts say "Try again to add it now",
  "Try again." and "Try again to finish.", matching their Try again button.
- A crashed section says "The rest of the page is fine. Try again." (the shared
  template), no longer "reported automatically".

### Why

- The cross-page entry, docs/clubhouse/changes/2026-10-24-screen-gaps.md.

### Verification

- classes.test › CH-12002, CH-12006; error-copy.test.ts.

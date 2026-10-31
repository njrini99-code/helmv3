# 2026-10-30 — Shell: section strip and edge swipe motion

## 2026-10-30 — The strip holds its plate, then navigates; the edge swipe tracks under Reduce Motion (F-0008, F-0046, F-0018)

```text
Design package: none (Clubhouse audit 2026-10-29-720962bc4, F-0008, F-0046,
                F-0018; fix plan PR 5)
PR/commit:      claude/audit-fix-05-motion (#2416)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- SectionStrip.tsx: choose() prevents the default, marks the row data-holding
  (scroll snap off), then navigates one frame later, so the plate lands before
  the route commits (F-0046, F-0008). LinkPending takes a pending prop.
- use-edge-swipe.ts: under Reduce Motion the back swipe still follows the
  finger and settles at once (F-0018).
- shell.css: .ch-strip__row[data-holding] { scroll-snap-type: none }.

### Verification

- section-strip-nav.test (new) red on main, green after; phone-shell-gestures
  and shell tests updated for the reduced path.

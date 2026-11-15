# 2026-11-15 — rounds

## 2026-11-15 — Course page note: "Show all" sets the height at once and fades the text in (MOT-15)

```text
Design package: none (production audit 2026-11-15, MOT-15)
PR/commit:      worktree-agent-a28a8e337f498ea91 (motion, ambient loops slice)
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     screenshots owed (a long note, clamped and opened)
```

### Changed

- `screens/rounds/course-motion.tsx`: `useExpandHeight` (a height ease on the
  smooth spring) is replaced by `SwapFade`: the block takes its new height at
  once and its content fades back in over the quick beat (180 ms), through
  the page's existing `useFadeOnChange`. Never on first paint; instant under
  reduced motion and Animations off.
- `screens/rounds/CoursePage.tsx`: the note plate uses `SwapFade`.

### Why

- A height animation lays the page out again on every frame.

### Verification

- Typecheck and the rounds tests; source only, no browser or device run.

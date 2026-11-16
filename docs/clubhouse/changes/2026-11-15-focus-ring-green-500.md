# Shared — Changelog

## 2026-11-15 — Focus ring on green-500 (MOTION-AND-VISUAL 3.8)

```text
Design package: MOTION-AND-VISUAL.md 3.8 (owner, 15 Nov 2026), keyboard focus row
PR/commit: draft PR #2537, branch claude/project-thread-10vtd2
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `--ch-border-focus` reads `--ch-green-500` in light and dark (was
  `--ch-green-600` light, `#6bbb8c` dark). Rows keep their 2px inset ring and
  controls their 2px outline offset 2px; the ring appears at once.

### Why

- Spec 3.8 names the focus ring as a 2px `--ch-green-500` ring. The ivory thread
  confirmed the ring is this thread's to set.

### Verification

- vitest: focus-ring, shell-reach-css, coachhelm-visual-artifact-css,
  contrast-tokens, dark-ink-guard, selected-state and the token tests, 142
  passed (jsdom). A W-tier look at a focused row in light and dark is still
  owed.

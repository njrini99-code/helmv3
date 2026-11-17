# 2026-11-17 — Silent errors reported (screens-a)

## 2026-11-17 — Swallowed CoachHelm failures now reach error tracking

```text
Design package: none
PR/commit: branch agent/ch-silent-errors-screens-a
Contract IDs: none
Actions: none
Data impact: none (reporting only)
Held items: none
```

### Changed

- Ask: requesting more Ask and its Undo, a draft's save and Undo, the folder
  list, a confirmed action's Undo and Save now, the outcome poll after a held
  action, the week behind a calendar draft, the board picture of a hand-off
  and a failed answer copy are reported with `chReport` when they throw.
- Plans: `safeSave` reports the save or undo it turns into a failure; the PDF
  share, the plan format's Undo and the clean-up of a replaced sample are
  reported.
- A correction that throws, and a focus removal that throws, are reported.
- Animation and storage catches that are quiet by design carry a comment.

### Why

- The owner asked to fix the errors: every swallowed failure in Clubhouse is
  reported through the existing pipeline. Nothing the coach sees changes.

### Verification

- Typecheck, eslint on the changed files, and the CoachHelm vitest suites.

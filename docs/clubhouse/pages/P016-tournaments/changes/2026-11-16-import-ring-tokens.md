# Tournament import ring tokens — Changelog

## 2026-11-16 — The import grid's field rings read tokens

```text
Design package: MOTION-AND-VISUAL 4.6 and build step 7 (the CSS ratchet)
PR/commit: claude/project-thread-10vtd2 (#2550)
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- The import grid's field (`tournaments-import.css`) draws its rings with
  `--ch-ring-field` and `--ch-ring-field-focus` (tokens),
  and its invalid ring reads `--ch-tour-imp-ring-invalid`, named in the
  error state's own rule because it is red.
  They hold the same values, so nothing looks different.

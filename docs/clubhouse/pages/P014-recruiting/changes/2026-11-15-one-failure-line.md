# P014 Recruiting — 2026-11-15

## 2026-11-15 — One failure line

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-33)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   none (CH-14201, CH-14202 copy)
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `RecruitingDesktop.tsx`, `RecruitingPhone.tsx`, `Documents.tsx`: the generic
  failure bodies are the one line, "Nothing you saved is lost. Try again."
  (`FAILURE_COPY.page`).

### Why

- GAP-S-33: the same failure was worded several ways across pages.

### Verification

- `recruiting.test.tsx` (assertions updated for the deliberate copy change).

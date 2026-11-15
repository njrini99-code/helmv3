# 2026-11-12 — hub

## 2026-11-12 — Documents: the Hub keeps its practice plans

```text
Design package: none (release readiness: the N-10 reader shim before practice publishing)
PR/commit:      #2504 (agent/documents-file-url-shim)
Contract IDs:   none new
Actions:        none
Data impact:    none (read path only)
Held items:     20261026010400_golf_documents_practice_plan.sql (its reader half)
```

### Changed

- `getDocuments` now returns files only. A practice plan row (no `file_url`)
  is left out of every other reader: the event attachment picker, the
  announcement picker and Ask's documents list.
- Team Hub is the one reader that asks for plan rows (`{ plans: true }`), so
  its folders still show a published plan and open it in Practice. Nothing
  the Hub shows changes.

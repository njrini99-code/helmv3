# 2026-11-15 — hub

## 2026-11-15 — Files accept a document row with no file (practice plan)

```text
Design package: none (release bookkeeping; no visible change)
PR/commit:      #2526, agent/release-bookkeeping
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     none; 20261026010400 is applied in production (2026-11-15)
```

### Changed

- `folders()` in `data/hub.ts` now types `file_url` as nullable, matching
  `golf_documents` after `20261026010400` (regenerated `database.ts`). It
  already showed a row with no file as a plan, so the page looks the same.

### Verification

- `__tests__/hub.test.tsx`, `__tests__/hub-paged-reads.test.ts`,
  `screens/hub/__tests__/hub-summary.test.ts`,
  `screens/hub/__tests__/hub-redesign.test.tsx`, `__tests__/wiring-p010-hub.test.tsx`.

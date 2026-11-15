# 2026-11-15 — one spreadsheet-safe CSV for every export

## 2026-11-15 — `lib/csv.ts` and the Export key (launch readiness F-02)

```text
Design package: none (launch readiness findings, 15 Nov 2026, §4 F-02); no owner board, built on Button, IconButton and the toast
PR/commit:      claude/project-thread-8hytxy (QUEUE lr-f02)
Contract IDs:   used by CH-09080, CH-11080, CH-11480, CH-16082
Actions:        none of its own (ACT-P009-EXPORT-STANDINGS, ACT-P011-EXPORT-ROUNDS, ACT-P016-EXPORT-RESULTS use it)
Data impact:    none; the file is made on the device
Held items:     none
```

### Changed

- **`src/clubhouse/lib/csv.ts`** builds every Clubhouse export:
  - Text goes through the shared formula guard (`lib/csv/safe-cell.ts`), so a
    name typed as `=HYPERLINK(…)` opens as text, and is quoted per RFC 4180.
  - Figures are written bare with an ASCII minus (a to-par is −6 on screen and
    -6 in the file), so a spreadsheet sums and sorts them. Empty is an empty
    cell, never a made-up zero; a flag is Yes or No.
  - The file starts with a UTF-8 byte order mark and ends its lines CRLF, so
    Excel on Windows reads accented names and curly apostrophes right.
  - `chCsvName` makes a plain file name ("demo-university-rounds-2026-11-15.csv").
  - `saveCsv` hands the file to the share sheet on a phone (Files, Mail,
    AirDrop) and downloads it anywhere else. Closing the share sheet is not a
    failure.
- **`src/clubhouse/ui/ExportButton.tsx`** is the one Export key: a ghost
  Download button (an icon button on a phone's tool row), busy while it reads,
  the success haptic and a toast that says what went ("Rounds exported · 12
  rounds"), and an error toast with the page's code when the read fails or the
  browser refuses the file.

### Why

- Coaches keep their own spreadsheets and send results to their athletic
  department. Nothing in Clubhouse could be exported except the roster and the
  team stats table.

### Verification

- Unit: `src/clubhouse/lib/__tests__/csv.test.ts`, 9 tests (cells, the formula
  guard, the byte order mark and CRLF, names, download and share sheet).
- Component: `src/clubhouse/__tests__/exports.test.tsx`, 8 tests.

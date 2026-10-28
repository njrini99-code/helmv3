# 2026-10-28 — Event files open through a signed link

## 2026-10-28 — A file attached to an event opens

```text
Design package: wiring review of 2026-10-27 (item 4); no new design
PR/commit:      fix/clubhouse-cal-must-fixes
Contract IDs:   CH-6024 (new)
Actions:        getPreviewUrl (read; signs a short-lived link)
Data impact:    none
Held items:     none
```

### Changed

- A file in an event's Files list is a button, not a link to the stored
  `file_url`. That address is a public URL on the private documents bucket,
  so it 404ed. A tap opens a tab at once (inside the tap, so Safari allows
  it) and fills it with a fresh signed link from `getPreviewUrl`, the way
  Team Hub and Fairway's event drawer open a document. While it signs, the
  row reads "Opening…".
- CH-6024: a file that won't open says "Couldn’t open Local rules" with the
  reason (or "This file has no stored copy to open."), offers Try again and
  closes the tab it opened. Offline, nothing opens (CH-1903).

### Why

- Wiring review: attached files never opened.

### Verification

- `src/clubhouse/__tests__/calendar-files-open.test.tsx` (signed link, no
  public address, CH-6024, no stored copy, offline) and the CH-6024 case in
  `calendar.test.tsx`. Unit tests only; no screenshots.

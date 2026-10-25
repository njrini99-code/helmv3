# 2026-10-25 — Messages: polls land at once, and the phone "+" (P-2 follow-up, slice 3)

## 2026-10-25 — No blank beat after Send, and one "+" on the phone

```text
Design package: P-2 build plan, 4.5, D21, D27
PR/commit:      claude/clubhouse-polls (#2362)
Contract IDs:   none new
Actions:        sendGolfPoll also returns the saved row
Data impact:    none
Held items:     none
```

### Changed

- `sendGolfPoll` returns the row it saved, and the thread draws it at once
  (`insertConfirmed` in use-golf-messages, deduped by id against the realtime
  insert that follows), so the card is there as the sheet goes. A background
  refetch still runs.
- On a phone, a group thread's composer has one "+" that opens a menu, "Photo or
  file" and "Poll". A direct thread keeps the plain "+" that picks a file.
  Desktop keeps the paperclip and the poll button side by side.

### Verification

- `messages.test.tsx` › D21, D27; the action test reads the row.
- `npm run build` not run (a `'use server'` action changed): end batch.

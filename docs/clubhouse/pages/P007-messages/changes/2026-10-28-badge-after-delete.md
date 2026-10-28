# 2026-10-28 — Messages: a deleted conversation leaves the badge

## 2026-10-28 — The Messages badge stops counting a deleted conversation

```text
Design package: none (wiring review 2026-10-27, item 3)
PR/commit:      fix/clubhouse-badge-and-confirm-order
Contract IDs:   none
Actions:        none (the two badge counters, reads only)
Data impact:    reads only (the viewer's own hidden_at, already readable)
Held items:     none
```

### Changed

- Both badge counters skip a conversation the viewer deleted, with the
  inbox's own rule: a hidden conversation is out until a message arrives
  after the delete. From then on it is back and counts as any other
  conversation does, from the viewer's last read, so the badge and the row
  it opens agree.
- The two counters share one counting function
  (`src/app/golf/actions/unread-message-count.ts`). On a database without
  the `hidden_at` column it reads the rows again without it, and counts
  every conversation as before.

### Why

- Delete sets only `hidden_at`. The counters counted every conversation, so
  a deleted conversation's unread messages stayed on the badge for good,
  with no row left in the inbox to open and clear them.
- Delete does not stamp `last_read_at`: other members read it as "Seen by",
  and deleting a conversation is not reading it.

### Verification

- `messages-badge-hidden-conversations.test.ts`: for the coach and the
  player counter, a deleted conversation drops off; a new message brings it
  back with the inbox row's count; a deleted message does not; the
  missing-column fallback. The drop-off and fallback cases fail without the
  fix.

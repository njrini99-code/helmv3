# P007 Messages — 2026-11-13

## 2026-11-13 — The inbox head counts unread conversations, and says so (F-0021)

```text
Design package: none (audit 2026-11-13, F-0021)
PR/commit:      agent/ch-look-data-honesty
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/messages/inbox/Rail.tsx` (`inboxContextDesktop`): "1 unread
  conversation" (was "1 unread · 1 conversation"); with none unread, "7
  conversations". The phone inbox has no count line, so it is unchanged.

### Why

- F-0021: the head read "1 unread" while the sidebar badge read 2: one
  conversation held two unread messages. Naming the unit keeps both true.

### Verification

- `src/clubhouse/screens/messages/__tests__/inbox-unread-unit.test.ts` (RED,
  then GREEN); the rail suites pass.
- No screenshots: no browser in this slice (lead's instruction).

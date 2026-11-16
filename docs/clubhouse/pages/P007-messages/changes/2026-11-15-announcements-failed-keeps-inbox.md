# P007 Messages — 2026-11-15

## 2026-11-15 — A failed announcements read keeps the inbox (GAP-S-01)

```text
Design package: none (Nov 15 gap pass, GAP-PASS-FINDINGS.md, GAP-S-01)
PR/commit:      claude/project-thread-pryzf0
Contract IDs:   none new (CH-7301, CH-7309 rows updated; CH-7206 reused)
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- `screens/messages/MessagesFirstRun.tsx` (`isMessagesFirstRun`): the first-run
  page (CH-7309, "No conversations yet" with Start a conversation) is drawn only
  when both reads answered empty. When the announcements read failed it is not.
- `screens/messages/inbox/Rail.tsx` and `inbox/PhoneInboxV2.tsx`: with no
  conversations and failed announcements, the inbox stays. The rail says "No
  conversations yet" (CH-7301), and the announcements section says
  "Announcements didn’t load" with its Try again (CH-7206). The phone inbox
  draws the same compact line under its filter.

### Why

- GAP-S-01 (P0): a coach whose announcements read failed, with no
  conversations, saw the first-run page. That page says nobody has posted
  anything yet, which may not be true, and it hid the failure and its Try
  again.

### Verification

- `src/clubhouse/screens/messages/__tests__/first-run-ann-failed.test.ts`
  (new) and the Messages suites pass.
- Preview: `/clubhouse-preview/messages?state=empty-ann-failed`.

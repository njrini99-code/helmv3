# P007 — Messages: changelog

Newest first. Earlier history is in `docs/clubhouse/PROGRESS.md` (verification log and decisions).

## 2026-09-29 — V2 page docs (gold standard)

```text
Design package: design/handoff/ v2 (Coach - Messages.html, Coach - Messages - Mobile.html)
PR/commit:      agent/clubhouse (this commit)
Contract IDs:   70101 to 72401 (88 on this page: 73 from the catalog, 15 new behaviour contracts without a code)
Actions:        18 (ACT-P007-*)
Data impact:    none
Held items:     conversation-files (feature), message-attachments-hardening (data)
```

### Changed

- The six page docs, the manifest's actions, and the 15 behaviour contracts (core view, deep links,
  realtime, success, draft kept, optimistic send, retry, section Try again, phone stack, Enter to send,
  one load per thread, failures reported, the held gate, the tests).

### Why

- D-62: Messages is the gold standard the other pages copy. D-69: every category answered.

### Verification

- `clubhouse:check` clean with the contract check on; `npx vitest run src/clubhouse` 377/377.

## 2026-09-29 — v2 foundation carried onto Messages

```text
Contract IDs: 70408 (new: no team, CH-7308)
```

### Changed

- v2 motion (D-64), v2 haptics (D-70): sends and changes that land fire success; Retry and Add are
  silent. The no-team state is the v2 page empty state (D-71). Messages moved under More on the
  phone for both roles (D-66).

## 2026-09-29 — Phone build and merge

- The phone stack (Inbox, Thread, Details, New message, announcements) on the approved spec, D-40 to
  D-49; `getGolfConversationFiles`, held (D-48, D-61).

## 2026-09-29 — Desktop build

- Desktop Messages on the live realtime hooks (D-13) with announcements inside (D-16), and the full
  state catalog (CH-70xx to CH-78xx).

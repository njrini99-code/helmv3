# 2026-11-03 — Messages thread and bubbles behind the lane's flag

## 2026-11-03 — PR 11c (golf_messages_redesign_v1, off)

```text
Design package: design-refresh/messages/ (PR 11c)
PR/commit:      agent/msg-11c
Contract IDs:   as today's thread
Actions:        none new
Data impact:    `typingUserIds` and a 5s typing clear in use-golf-messages,
                under the flag
Held items:     none
```

### Changed

- Runs: name inside the first bubble, face beside the last, tail on the last.
  Typing bubbles open into the reply. Thread drag for times, date pill, jump
  key, the face's flight into the bar.

### Verification

- thread-v2.test.tsx (new). Not run yet: the owner deferred testing to the end
  of the build.

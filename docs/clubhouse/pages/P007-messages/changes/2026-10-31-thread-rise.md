# 2026-10-31 — Messages: both threads use the rising arrival

## 2026-10-31 — A sent or received message rises in; the thread holds still

```text
Design package: none (owner, 2026-10-31; shared change in
                docs/clubhouse/changes/2026-10-31-fairway-bubbles-and-send.md)
PR/commit:      claude/round-bar-discard
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- MessagesView and MessagesPhone pass `arrive="rise"` to the thread's
  ListPresence: a message that arrives rises 8px and fades in at its full
  height instead of opening from 0.

### Verification

- wiring-p007-messages B7 (desktop and phone) passes.

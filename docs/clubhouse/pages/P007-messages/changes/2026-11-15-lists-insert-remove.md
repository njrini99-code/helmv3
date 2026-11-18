# P007 — Changelog

## 2026-11-15 — A sent message is an insert; the send flight is gone

```text
Design package: none (MOTION-AND-VISUAL 3.5, 3.10, 3.12)
PR/commit:      worker E2 "lists": 33f9610af, 8b7f1e5a9, 20f27f5d1, 77c0c2ec2
Contract IDs:   none changed
Actions:        none
Data impact:    none
Held items:     before/after captures of a send, a delete and the inbox loading; D-tier check owed
```

### Changed

- A sent or arriving message rises 8px with opacity over 260 ms on the iOS curve
  (ListPresence); the thread above it makes room over the same 260 ms on the iOS
  curve, and the new row counters that glide so only the 8px rise shows. The
  send flight (launch, lift, send springs, the ghost, the field return, the
  reply-from-typing hand-off) is deleted.
- "Delivered" is late content: it fades in over 180 ms once the 260 ms rise is
  done. The arrow leaves over 180 ms.
- Popovers and menus that used `pop` or `lift` (seen-by, the + menu, Hello card,
  details, hold lift, glass menu, bubble actions) use `settle`.
- The inbox (rail and phone) waits 150 ms before its skeleton, holds it 300 ms
  once shown (`useBusy`), and the list that replaces it fades in over 180 ms,
  opacity only. The thread's messages fade in the same way when they replace its
  skeleton; that skeleton still shows at once, because a search hit's jump looks
  for its row when loading ends.
- The success haptic still fires once per send (`Composer.tsx`); `plate="thumb"`
  is dropped (Segmented's plate is a no-op).

### Why

- Spec 3.5: one insert and remove, late content as a 180 ms crossfade. Spec
  3.12: the overshooting springs retire.

### Verification

- `__tests__/messages.test.tsx` (two new late-content cases; the animation stubs
  gained `pause` and `play`, as every real Animation has), `messages-beats`,
  `send-receipt`, `thread-make-room`, `messages-motion`, `d-details-motion`,
  `lift-motion`, `glass-menu`, `wiring-p007-messages`, `rail-keys`,
  `rail-sections` and `inbox-model` pass. jsdom only.

# P007 — Changelog

## 2026-11-27 — A phone thread opens at its newest message again

```text
Design package: none
PR/commit:      agent/presentation-gate-green
Contract IDs:   MSG-201, MSG-211
Actions:        none new
Data impact:    none
Held items:     none
```

### Changed

- Phone thread (`PhoneThread.tsx`): the pushed screen and the thread inside it
  are two components. The screen's content renders a frame after the screen
  (POP-02, #2601), and the thread's scroller hooks ran with the screen, so they
  found no scroller and never attached: the open at the end and its settle
  hold (useThreadAnchor), the bar and composer layers and the keyboard ride
  (useThreadLayers), the drag times and the room made for a new message. They
  now run in the thread, which mounts with its scroller.
- `ACT-P007-COPY-MESSAGE` names `PhoneThreadContent`, where `copy` now lives,
  so the phone sheet's two Copy rows keep their action in the control ledger.

### Why

- A thread whose messages were already loaded opened at its oldest message
  and stayed there, and Jump to latest came in as it opened. The nightly
  motion gate reported it on `messages-stress` (2 tests on main):
  "first-paint: button.ch-msv-jump animates as the screen opens", and the
  same under Reduce Motion. The 2026-11-25 jump key hold (#2616) waited for
  a pin to the end that never came on the phone.

### Verification

- `messages.test.tsx`: a phone thread with its messages loaded opens at its
  end. Red on main's PhoneThread, green with the split.
- Clubhouse quality, motion gate, on this branch.

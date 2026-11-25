# P007 — Changelog

## 2026-11-25 — The jump key no longer flashes as a thread opens

```text
Design package: none (a motion fix)
PR/commit: #2616, health routine, agent/health-20261125-0347
Contract IDs: MSG-211
Actions: none
Data impact: none
Held items: none
```

### Changed

- The jump key (`ThreadJumpKey`, `thread-v2.tsx`) holds its first read on every
  thread open until useThreadAnchor's settle is over (`THREAD_SETTLE_MS`) or the
  reader touches the thread. Before, it held only when the thread's messages had
  not landed yet.

### Why

- A thread whose messages were already laid out when it opened still sat at its
  top until the anchor pinned it to its end. The key read "far from the end",
  scaled in, then left: motion on first paint. The nightly motion gate reported
  it on `messages-stress` (run 45677933069): "first-paint: button.ch-msv-jump
  animates as the screen opens" and, under Reduce Motion, "reduced:
  button.ch-msv-jump moves under Reduce Motion".

### Verification

- `thread-v2-traps.test.tsx`: the new case (a laid-out thread at its top that
  settles to its end shows no key) failed before the fix and passes after it.
  The show cases now let the open settle first.
- Not re-run in WebKit locally; the next nightly motion gate is the proof.

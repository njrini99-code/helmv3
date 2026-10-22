---
title: A committed edge swipe leaves nothing running when its screen goes
---

## 2026-10-22 — A committed edge swipe leaves nothing running when its screen goes

```text
Design package: none (flake fix, queue row new-04)
PR/commit:      draft PR #2332 from claude/project-thread-llcuya
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     none
```

`useEdgeSwipeBack`'s effect cleanup now hands a committed swipe's exit back
(`exit.done`, once) and cancels its two frame callbacks, as it already did for
a spring-back. Before, the `finish` timer outlived the screen: in the unit
shard it fired after the test file's window was gone ("window is not defined",
main run 39714700693). No visible change: the exit still ends on the spring or
`transitionend`, whichever comes first.

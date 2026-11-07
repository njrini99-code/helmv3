# 2026-11-07 — messages

## 2026-11-07 — A thread opens at rest

```text
Design package: design-refresh/messages
PR/commit:      agent/ch-shell-motion
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

`useThreadMakeRoom` skips a thread's first messages landing and replaces its running move instead of adding to it. The settle hold runs on scroll, and the Jump key waits for it.

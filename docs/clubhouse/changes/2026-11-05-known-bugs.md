# 2026-11-05 — Known bugs: retries, slow navigation, a plan that's gone

## 2026-11-05 — Fixes across pages

```text
Design package: none
PR/commit:      agent/clubhouse-known-bugs
Contract IDs:   none new
Actions:        none new
Data impact:    none (one extra read before each insert)
Held items:     none
```

A retry after a lost response no longer doubles a post: the same coach sending
the same announcement or task to the same team within two minutes gets the one
that landed, with no second notice. A push's motion waits 3 seconds for a slow
navigation, up from 1.5. A practice plan that's gone or unpublished shows an
empty state with a way to Calendar instead of redirecting.

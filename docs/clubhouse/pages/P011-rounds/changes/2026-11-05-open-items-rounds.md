# 2026-11-05 — P011

## 2026-11-05 — Round review Back, same-day order, course names

```text
Design package: none
PR/commit:      agent/clubhouse-open-items
Contract IDs:   none new
Actions:        none new
Data impact:    none; stored course names are left as they are
Held items:     none
```

Team rounds' link now carries `?from=rounds`, so the review's Back reads
"Rounds" on the server render too; a reload no longer paints "Stats" first.

One player's rounds on one day stay together in Team rounds, in the order
played: by qualifier round number, then when they were posted.

Course names are tidied for display ("pine lakes" and "Pine lakes" read "Pine
Lakes"). Search is unchanged: it ignores case.

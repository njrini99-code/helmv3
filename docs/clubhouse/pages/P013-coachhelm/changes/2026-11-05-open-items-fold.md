# 2026-11-05 — P013

## 2026-11-05 — Player file: a lens card folds only on a real flip

```text
Design package: none
PR/commit:      agent/clubhouse-open-items
Contract IDs:   none new
Actions:        none new
Data impact:    none
Held items:     none
```

A lens card's fold ran on a re-run of its effect as well as on a flip: Strict
Mode's second mount folded it open on load, Reduce Motion or not. It now moves
only when the lens has changed.

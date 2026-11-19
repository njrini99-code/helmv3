# P002 Home — Changelog

## 2026-11-19 — A bench caption balances its two lines

```text
Design package: none
PR/commit: agent/clubhouse-motion-batch3
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- `styles/home.css`: `.ch-ph-leg__n` declared `text-wrap` twice, so the
  older `pretty` overrode the L-067 `balance` added on 18 Nov. The old one
  is gone: the caption now balances, as L-067 asks (on screen: a two-line
  caption splits evenly).

### Why

- The Clubhouse CSS ratchet counted raw values that #2586 added. Nothing
  changes on screen except where noted.

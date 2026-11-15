# 2026-11-12 — hub

## 2026-11-12 — The head says what the team owes, as figures (W20)

```text
Design package: none (preview grade fix, PREVIEW_ISSUES.md)
PR/commit:      agent/preview-fixes-f9
Contract IDs:   none new
Actions:        none
Data impact:    none
Held items:     none
```

### Changed

- Under the title: at most three figures, each a number over its words that
  opens its tab: replies due, posts unacknowledged (a player's: to acknowledge;
  "awaiting acknowledgement" until the phone sweep, so the three fit one row at
  the default Text Size), tasks overdue when any are, else open. Players, the
  next trip and the no-rounds line are gone.
- No Coach view pill; both roles take the head's no-eyebrow top, and the
  skeleton matches.

### Why

- Nick's walk (W20): five figures in a run of 13px text, separated by bars and
  underlined, under a chip.

### Verification

- `hub-summary.test.ts`, `hub-redesign.test.tsx`, `hub.test.tsx`, CSS guards
  (hub.css counts lowered where they fell): exit 0.

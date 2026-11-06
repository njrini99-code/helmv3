# 2026-11-06 — P003

## 2026-11-06 — One source for rounds and strokes gained

```text
Design package: design-refresh/redesign-ui-sweep-2026-11-06
PR/commit:      agent/ch-numbers
Contract IDs:   none new
Actions:        none new
Data impact:    figures read one helper; no query changes
Held items:     none
```

- Rounds and strokes gained come from one helper (`data/figure-window.ts`).
  Team view, Roster and Stats read the same rounds, so two figures differ only
  by the window each names.
- Every figure names its window: Team view and Roster this season, Home and
  Stats' default the last 10.
- Ask lists players only; the team is a caption. A visual that can't draw is
  its table or nothing.

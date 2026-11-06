## 2026-11-06 — One source for rounds and strokes gained

- Rounds and strokes gained come from one helper (`data/figure-window.ts`).
  Team view, Roster and Stats read the same rounds, so two figures differ only
  by the window each names.
- Every figure names its window: Team view and Roster this season, Home and
  Stats' default the last 10.
- Ask lists players only; the team is a caption. A visual that can't draw is
  its table or nothing.

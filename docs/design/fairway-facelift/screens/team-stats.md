<!-- markdownlint-disable MD013 -->
# Team stats — `/golf/dashboard/stats/team` (coach)

Files: `src/components/fairway/pages/**` — find with `rg -l "Team fundamentals" src/components`; likely `src/components/golf/stats/**` or `fairway/pages/stats/**`.

## What the capture shows

Header with two pills (Ask CoachHelm, Open team intelligence) + an export icon, a 2×2 of KPI cells (Team scoring, Team SG, Trajectory, Rounds 30d), the player rank board (good — this is the MatrixBoard), then card after card: "Team fundamentals" (rails + 3 numbers), "Team strokes gained" tornado, "SG: Total −4.8" hero (a duplicate of the header SG), "Where the strokes leak" with two chart cards. Content is right; containers are wrong, and the SG hero repeats a number already shown.

## SCREEN

- Archetype: B (board) with a C analysis stage.
- Dominant object: the player MatrixBoard (rank cells per category, expand inline).
- Supporting: header StatMatrix (Scoring · SG/rd · Trajectory · Rounds 30d) and ONE analysis Bento (tornado 2×1 hero, fundamentals rails, putts-by-distance, approach proximity).
- Tertiary: cache/refresh metadata line (quiet Metadata role), export.
- Floating: none; sticky board header on desktop.
- Modal: none.

## EXISTING FAIRWAY

ViewHeader, StatMatrix, MatrixBoard, RankCell, RailBars, StrokesGainedTornado, TrendChart/MakeCurve (existing chart components), Bento/BentoCell, Menu, IconButton.

## CONTAINERS TO REMOVE

1. Two header pills → one primary "Open team intelligence"; "Ask CoachHelm" and Export into the overflow Menu (Export keeps its IconButton on desktop).
2. The 2×2 KPI cells → StatMatrix, 4 columns desktop, 2×2 phone.
3. "SG: Total" hero card → removed (duplicate of the SG cell).
4. Fundamentals / tornado / leak cards → one Bento: tornado hero (2×2), fundamentals rails (1×2), putts-by-distance (1×1), approach proximity (1×1). Cells are matte, hairline-separated; chart titles as Section title role, "View as table" as a text action.
5. The three-line cache/rank/insight metadata → one quiet Metadata line under the subtitle.

## COMPOSITION (desktop)

```text
ViewHeader  TEAM STATS / Team Stats / every player ranked…           [Open team intelligence] [⤓] [⋯]
StatMatrix  75.5 scoring · −4.8 SG/rd · 3▲ 0→ 4▼ trajectory · 4 rounds (30d)
MatrixBoard (dominant)   Player · Tee · App · Short · Putt · (expand → player SG rails + sparkline)
Bento
┌ SG tornado (2×2) ───────────────┬ Fundamentals rails (Fairways · GIR · Scrambling) ┐
│                                 │ 75.5 avg · 33.0 putts · 2.6 birdies (StatMatrix) │
│                                 ├──────────────────────┬───────────────────────────┤
│                                 │ Putts made by dist.  │ Approach proximity        │
└─────────────────────────────────┴──────────────────────┴───────────────────────────┘
```

Phone: StatMatrix 2×2, board rows compress (player + 4 rank cells), Bento single column with the tornado first.

## STATES

- Fewer than 8 completed rounds: the trend/trajectory cell shows InsufficientData inline, the board still renders.

## RISKS

- Charts are Recharts/visx already; composition only. Tests pin "View as table" toggles and rank cells.

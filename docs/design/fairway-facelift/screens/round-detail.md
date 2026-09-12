<!-- markdownlint-disable MD013 -->
# Round detail and review — `/golf/dashboard/rounds/[id]` and `/review`

Files: `src/components/fairway/pages/rounds/FairwayRoundDetail.tsx` (1319), `RoundTypeEditor.tsx`, `src/components/golf/coachhelm/round-review/ReviewHero.tsx`, `FilmstripReview.tsx`, and the review route component (`rg -l "Your CoachHelm analysis for this round"`).

## What the captures show

Detail: header with three pills (Open full review, All stats, Change round type), a "Final score" card containing a huge 75 and a prose inset, a "Front / Back" card of dashes, a card of "NO DATA — 0 OF 1" cells, an "Areas to work on" card with a prose inset and a second "Open full review" button. Review (scorecard-only round): "Strokes gained: This round" card "NOT COMPUTED", "By category" card with an empty state, the green round-score instrument (good), "The story" card, "Coach notes" card, "Where this sits" with four standing cards, "Round breakdown" Front/Back cards of zeros, putting-by-distance dashes, "Not enough putts", a "No shot detail" notice, and an "All stats" block button. Two screens, ~15 containers, most of them empty for this round.

## SCREEN

- Archetype: E (chronology) — the round is the story.
- Dominant object: the round-score instrument (green, existing) with the Filmstrip beneath it when hole data exists.
- Supporting: standing (one StatMatrix with rails: GIR · SG tee · approach · putting vs team/tour), the story + coach notes as one Surface with a seam, "what to do next" (RxCard) when computed.
- Tertiary: breakdown (front/back, putting by distance) ONLY when data exists; round type editor in the overflow.
- Floating: none.
- Modal: coach note editor (existing), change round type (existing editor in a Sheet).

## EXISTING FAIRWAY

InstrumentPanel (score), GradeDots, Filmstrip, StatMatrix, RailBars, StandingStrip, Surface, RxCard, InlineNotice, Menu, Button shape="block" (phone CTA).

## CONTAINERS TO REMOVE

1. Detail: three header pills → one primary "Open full review", overflow Menu (All stats, Change round type). "Final score" card + prose inset → the green instrument (score, to par, grade dots, course · date · player) with the one-line story as its caption. Front/Back + GIR/FW/Putts empty cards → when no hole data: ONE InlineNotice "Scorecard only — enter holes to unlock the breakdown" with the action; when data exists: Filmstrip + a StatMatrix (Front · Back · GIR · Fairways · Putts). "Areas to work on" card with a second CTA → RxCard only when computed; no duplicate CTA.
2. Review: "Strokes gained: This round" + "By category" empty cards → collapse to nothing when not computed (one line in the standing surface: "SG not computed for this round"). "Where this sits" four cards → one Surface, four seam rows each with a StandingStrip rail (team · you · tour) and a delta chip. "Round breakdown" cards of zeros, putting dashes, "Not enough putts" → hidden when no hole data; the single "No shot detail" notice stays. "All stats" block button → overflow / a text link; the phone sticky CTA is "Open full review" on detail only.
3. Refresh pill → IconButton in the header actions.

## COMPOSITION (desktop, hole data present)

```text
ViewHeader  ROUND REVIEW · AUG 31 / Monday at QA Test Course / Qualifier · 18 holes · Cole Bennett   [Open full review] [⋯]
InstrumentPanel (green)   75  +3   ●●●○○○  QA Test Course · Mon, Aug 31    "75 on the card…"
Filmstrip  1 2 3 4 5 6 7 8 9 | 10 … 18  (GradeDots, tap → hole)
┌ Standing (Surface) ──────────────────────────┐ ┌ Story + notes ───────────────┐
│ GIR 66%  team ─●─ you ─●─ tour   ↑ vs team   │ │ Shot 75 (+3) … 0 pars.        │
│ SG tee +1.10 …                               │ │ ── Coach notes ── [Add note]  │
└──────────────────────────────────────────────┘ └──────────────────────────────┘
StatMatrix  Front 38 · Back 37 · GIR 12/18 · FW 9/14 · Putts 33
RxCard (what to do next)
```

Scorecard-only round: instrument → standing → story/notes → one InlineNotice. Nothing else.

## RISKS

- Two components, both large; composition only. Tests pin "Open full review", the round type editor, and coach-note flows.

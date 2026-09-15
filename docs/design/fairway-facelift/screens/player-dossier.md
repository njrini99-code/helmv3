<!-- markdownlint-disable MD013 -->
# Player dossier — `/golf/dashboard/roster/[id]` and `/players/[id]/game` (coach)

Files: `src/components/fairway/pages/roster/FairwayPlayerProfile.tsx`, `src/components/fairway/pages/player-game/FairwayPlayerGameFingerprint.tsx` (911), `FairwayGolfClasses.tsx` (1002), `src/components/fairway/pages/coachhelm/GenomeDetailView.tsx`.

## What the capture shows

Profile: a hero card (photo, name, chips, Message pill, "member since"), three link cards (Scouting report, Game fingerprint, Genome), a "Showing" Select, a deep green Strokes Gained instrument (good — the one structural green), then nine stat cards (core ball striking, per 18, putting, off the tee, approach, short game, scoring, standing, last 10). 6,900px. Game fingerprint: 16,800px of category sections each with "Key numbers" cards, miss-direction cards, insight cards with Make-focus-area / Acknowledge / Dismiss buttons. Genome: 12,000px with five "NEEDS MORE ROUNDS" empty cards and focus-area cards with three-button outcome rows.

## SCREEN

- Archetype: A (Spine + Stage) with C drill views.
- Dominant object: the Spine (identity, standing, SG priorities, ledger, CTA "Ask CoachHelm") — it already exists in code as the green instrument; promote it to the Spine and put identity inside it.
- Supporting: the Stage — overview Bento (Tee · Approach · Around the green · Putting as four cells with a RailBar each, scoring cell, last-10 TickerStrip) and StageRouter drills (Driving: ShotDispersion hero + miss rail; Approach: proximity bands; Putting: PuttingHeatmap/RampMatrix + make curve; Scoring: par-type DivergingBars).
- Tertiary: scouting report, genome, classes as StageRouter destinations, not link cards.
- Floating: none; sticky Spine on desktop.
- Modal: focus-area Sheet (create / record outcome), message composer.

## EXISTING FAIRWAY

Spine, SpineLedger, StageRouter, Bento, BentoCell, RailBars, DivergingBars, ShotDispersion, PuttingHeatmap, RampMatrix, MakeCurve, TickerStrip, StandingTrack, PriorityList, InsightCard (one per drill, raised), Sheet, Menu, Segmented (window: "All rounds / Season / Last 10" inside the Spine header).

## CONTAINERS TO REMOVE

1. Profile hero card + Message pill + member-since → Spine header (avatar 56, name, year · status · hometown, Message as a ghost icon action, overflow Menu).
2. Three link cards → StageRouter tabs on the stage (Overview · Tee · Approach · Green · Putting · Scoring · Genome · Report).
3. Nine stat cards → one Bento (2 rows): hero cell = SG tornado (what hurts most) 2×2; four category cells with a RailBar vs benchmark; scoring cell (avg, to par, birdies) as a StatMatrix; last-10 TickerStrip full width.
4. Per-category "Key numbers" cards inside fingerprint → the drill view's StatMatrix header, then ONE visual, then ONE InsightCard with the focus-area action; Acknowledge/Dismiss move into the card's overflow Menu.
5. Genome "NEEDS MORE ROUNDS" cards → a single InsufficientData row per dimension inside one Surface; focus-area cards → seam rows with a compact status and a Record-outcome Menu.

## COMPOSITION (desktop)

```text
┌ Spine (4) ───────────────┐ ┌ Stage (8) ─────────────────────────────────┐
│ ● Cole Bennett  '27 Active│ │ [Overview · Tee · Approach · Green · Putting …]
│ Austin, TX · since Jan 26 │ │ ┌ SG tornado (2×2, raised) ┬ Tee  65% ▮▮▮▯ ┐
│ ── standing ──            │ │ │ Putting −2.99            │ Appr 71% ▮▮▮▯ │
│ SG −3.62 /rd  [CB·Team·Tour]│ │ Approach −0.71           ├──────────────┤
│ ── priorities ──          │ │ │ Tee +0.40                │ Green 34%    │
│ 01 SG putting   −2.99     │ │ └──────────────────────────┴ Putt 28% ───┘
│ 02 Three-putts  −1.09     │ │ Scoring 74.3 · 33.8 · 2.7      Last 10 ▁▃▅▂▆
│ 03 3–5ft make   −0.71     │ │ InsightCard: "Leaking most in putting…" [Focus]
│ ── ledger ── 18 rds · 65% │ └────────────────────────────────────────────┘
│ [Ask CoachHelm]           │
└───────────────────────────┘
```

Phone: Spine collapses to identity + SG readout + priorities (3 rows) + CTA; stage tabs as a Segmented rail with edge fade; drill content in place.

## STATES

- Insufficient rounds: InsufficientData inside the cell, never five empty cards.
- Loading: Spine skeleton + Bento skeleton.

## RISKS

- Three components with their own data loaders; compose without changing loaders.
- `GenomeDetailView` is also used by `/coachhelm/genome/[playerId]`; the Stage embeds it via StageRouter rather than forking.

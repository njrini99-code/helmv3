# Proposed foundations and pilot picks (for Nick's review)

QUEUE row `dsx-01`, 27 Nov 2026. Nothing here is built. It turns the gap
register ([03-gap-register.md](03-gap-register.md)) and the external
database ([research/R-external-references.md](research/R-external-references.md))
into the Phase 4 foundations and the five Phase 6 pilots. Owner locks in
[README.md](README.md) hold throughout.

## The diagnosis in one paragraph

Clubhouse's behaviour layer is better than most open-source kits: native
`<dialog>` with focus return and scroll lock, a press controller with a
finger delay, honest charts (gaps stay gaps, change coloured only past two
standard errors), one Reduce Motion listener. What makes the product feel
"functional but basic" is that the system lives in prose and ratchets rather
than in components. The type roles, the three elevations, the one card and
the one chart are each declared once and then re-drawn by hand in feature
CSS: 2,788 off-role type uses, 1,148 raw shadows, 35 card classes, 14 trend
renderers. Every hand-drawn copy drifts a little, so the page reads as many
near-identical rectangles of semibold black text rather than a composed
hierarchy. The premium references (Radix Themes, shadcn blocks, vaul,
Observable Plot, React Aria) differ mainly in where decisions live: inside
the primitive, as variants and slots, with every state built in.

## Phase 4 foundations (proposed)

Each is a token or primitive change with a ratchet, so the old ways can only
shrink. None changes a locked look.

1. **Complete type roles.** A role sets size, weight, leading, tracking and
   numeric features together (a class plus a `font` token per role), with a
   `metric` and `numeric` role that bake in `tabular-nums` and the true
   minus. Hierarchy moves from weight to colour: three text tones with a
   real quiet tier (meta and captions at 400 in the tertiary tone), 600
   only for titles and figures. Target: off-role uses fall from 2,788; new
   CSS may not add one (GAP-T1 to T3). Reference: Radix Themes and Geist
   type scales (SOURCE in the database, family 12).
2. **Three named elevations and one border technique.** `flat`, `card`,
   `raised` plus `overlay`; the border drawn as a 1 px inset ring inside the
   shadow stack, same layer count in every state so hover and press blend;
   nested radius as `calc(outer - padding)`; a recessed tile token for
   tiles inside cards; a real dark ramp where selected, elevated and
   secondary differ (GAP-S1, S3, R1). Reference: Radix Themes
   `base-card.css`.
3. **Space and layout tokens.** A 2 px-based scale including 2 and 6,
   section and card gaps, and named breakpoints from one source (the phone
   query already in `lib/phone-query.ts`) replacing the 349 pasted media
   strings (GAP-G1, G2). Dependency note: PostCSS custom media needs a
   plugin; a build-time constant is the zero-dependency alternative.
4. **Environment tokens.** `--ch-safe-top/right/bottom/left` reading
   Capacitor's inset first and `env()` second; one keyboard inset token fed
   by one visualViewport owner; root resets for tap highlight, callout and
   overscroll; `touch-action: pan-x pan-y pinch-zoom` on pressables (the
   Safari press-cancel issue React Aria documents) (GAP-P1, P2).
5. **Opacity and z ladders.** Named opacity steps (disabled, muted, scrim)
   and the existing z ladder made mandatory with a ratchet (GAP-O1, Z1).
6. **Motion clean-up, not new motion.** Retire the 552 legacy token uses;
   one interruptible transition helper over the existing `chSpringCurve`;
   drop `domMax` if the two `layout` props can move to `ListPresence`'s
   existing path (GAP-M1, M2).
7. **Governance that blocks.** `clubhouse:css` into the required static
   checks; gate rows for the 42 uncovered preview keys; the phone gate on
   the iPhone 17 Pro device profile; one ESLint rule for colour and size
   literals in TSX; every `var(--ch-*)` must resolve (GAP-Q1 to Q3, B3).
   Making a check required is an owner setting on GitHub.

## Phase 6 pilots (proposed picks)

Chosen to prove the system on real screens, avoid owner-locked surfaces and
avoid other threads' open work (look-09 owns option F cards, the motion
thread owns pa-mot-07 to 10, the overlays thread owns pa-ovl-13 to 20).

| # | Pilot | Why this one | What it proves | Overlap to manage |
| --- | --- | --- | --- | --- |
| P1 | **Card architecture under option F**: `Surface` gains slots (header, eyebrow, title, meta, body, figure, footer, action), an interactive mode (stretched link, press wash, focus ring) and state slots (loading, empty, failed). Option F's green title bar and feature card become variants, not per-area CSS. Pilot screen: Roster's season strip and leader cards | Option F is approved but drawn per area; every new screen repeats the selector work. Roster's KPI strip shows the uniform-tile problem and a visible header defect | Same look, fewer rules; every card state built in; "one feature card per view" enforced by a test | look-09's draft #2610 touches Roster title bars: P1 starts after it merges, or the look-09 thread does P1 |
| P2 | **Stats overview as a composed dashboard** (QUEUE `lay-02`, open): integrated figure and chart, sample size beside every graded figure, a comparison window ghost, a drill path to rounds | The highest-traffic analytical screen; `lay-02` is already the agreed next layout | Dashboard standards: primary vs supporting, n shown, one focal point per section | Needs `lay-02` claimed in the parity area |
| P3 | **One trend chart**: the Stats round trend and the scoring feature chart on `ui/charts/Line.tsx`, one `useChartPin` scrub (one threshold, selection that stays after lift, readout pinned above the finger), `ChartTable` built in, and the weighted mean (GAP-B1) | Fixes a data inconsistency and collapses four path builders | Chart architecture layers (data, metric, config, renderer, presentation) | Stats only; Player Home's ScoreChart stays as it is unless Nick opens it |
| P4 | **Sheet detents**: the Stats filter sheet with a medium and large detent, velocity-or-distance dismissal, drag handoff from scrolled content, keyboard-aware | Every phone overlay is one fixed height today | The overlay primitive in `Modal`/`sheet-drag`, not a new library (vaul's rules, not vaul) | Overlays thread owns other sheets; this touches only the shared sheet drag and one consumer |
| P5 | **One touch sequence end to end**: Rounds list row to round detail on the phone: press wash, the shared score figure travelling into the page (existing `share-morph`), interruptible Back mid-push, haptic per D-70 | Shows feedback, continuity and interruption together on a path every player uses | Interaction map format, rapid-tap and mid-flight tests | Motion thread's pa-mot rows: check for overlap before starting |

Each pilot ships with: before and after real-app shots on staging from the
Mac (the evidence rule), the gate rows that cover it, a page change log,
and the rubric scores from the brief with their evidence.

## Decisions only Nick can make

1. Approve the five pilots (or swap any).
2. P1 owner: this thread after #2610 merges (recommended), or the look-09
   thread.
3. Whether Player Home's headline chart may move onto the shared chart
   contract (it breaks the one-line rule today; the look stays locked until
   he says).
4. Making the browser UI gates required checks (a GitHub setting).

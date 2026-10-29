# CoachHelm visual playbook and message mechanics

Owner brief, 2026-10-29: CoachHelm's answers looked "terrible and basic". Make
them premium, let the model design visuals on the spot the way Claude and
ChatGPT do, add a full playbook with motion, and mirror the message mechanics
of the best AI chat products. This file is the contract for both renderers
(Fairway `src/components/golf/coachhelm/chat/**`, Clubhouse
`src/clubhouse/screens/coachhelm/chat/**`) and for the model's system prompt
(`VISUALS_SECTION` in `src/lib/coachhelm/v3/chat/instructions.ts`).

Research behind it: three web-research passes (Claude, ChatGPT, Gemini,
Perplexity, Cursor, Vercel AI SDK / AI Elements / Streamdown,
use-stick-to-bottom) on 2026-10-29. No product publishes its motion numbers or
CSS, so every duration below is a design choice informed by them, not a copy.

## 1. The model designs, the data fills

`show_visual` (always registered; the flag was removed at the owner's request)
takes `kind: "compose"` with a title, an optional one-line lede, a layout
(`stack` | `split`) and up to six blocks:

| Block | Use for | Rules the compiler enforces |
| --- | --- | --- |
| `headline` | the one figure the answer turns on | the metric must exist in that read; label has no digit |
| `kpis` | up to six related figures from one read | at least one drawable figure |
| `trend` | one metric over rounds | at least 3 rounds; `benchmark` only if the read carried one, else the average |
| `bars` | distance bands, or players on one metric | bands need 2+; players need 2+; `best_first` only when the metric has a direction; `highlight` dropped if not in the data |
| `split` | signed figures either side of zero for one player (strokes gained) | one player, one window, no conflicting reads; `sg_total` left out unless named |
| `compare` | two to twelve players across the same metrics (the team table) | 2–12 players; players become rows when they outnumber metrics |
| `note` | one sentence: `measured`, `association` (pattern) or `hypothesis` | no digit |

`compile-composition.ts` copies every figure from this turn's reads, drops a
block it cannot draw honestly and tells the model why, refuses a digit in the
title or lede, and refuses a composition with no figure block left. It hides
the plain evidence card only for reads it draws in full, and carries their
coverage notes so a caveat is never hidden. The result is the
`data-visual-composition` part (`ValidatedComposition`), replayed on reload.

How the model chooses (the prompt's playbook, kept in step with this table):

| Question | Design |
| --- | --- |
| How is X doing / trending | headline + trend |
| Where is X losing strokes | headline (largest loss) + split + note |
| Compare X and Y | compare + note on the difference that matters |
| Who is best at…, team rankings | bars, `best_first` |
| Build a dashboard, how is the team doing | compare (team table) + bars `best_first` on the key metric + note; never one card per metric |
| Putting or proximity by distance | bars on the bands, highlight the band asked about |
| A single number, a yes/no | no visual; the plain card is enough |

Craft: the title is the finding in words, not the metric name; the block that
answers the question goes first; two to four blocks; `split` layout only for
two figure blocks worth reading side by side; one visual per answer, then two
or three sentences that add what the visual cannot say.

## 2. Card anatomy (both renderers)

Every visual is one card: entity (caption, tertiary) → title (body, semibold)
→ the answer as a number (h1 tabular, with a verdict chip coloured by the
metric's own direction) → the figure → one provenance line at the foot
(window · sample in words · computed N ago). Never `n=`; say "15 rounds".
A to-par score is signed ("+3.1", "E", "−0.4"). The model never writes a
markdown table; a renderer still draws one properly if an old answer has it.
"View as table" on every figure. Figures draw at real pixels (measure the box,
no viewBox text scaling); a dot per round on straight segments, never a spline.

## 3. Motion

| Element | Spec |
| --- | --- |
| Card / block entrance | opacity 0→1, rise 8px, 320ms, `EASE_CINEMATIC`; 80ms stagger, capped at 6 |
| Line | path draws 0→1 over 600ms, starting 140ms after its card |
| Dots | fade in as the line reaches them, 220ms |
| Bars, diverging bars | scaleX from the baseline, 420ms, 50–60ms stagger |
| Numbers | never counted up; shown final |

Only a visual that arrives in the live answer moves; a thread restored from
history renders final (decided once at mount, never from a live `busy`
flag). Reduced motion renders everything final. Animate opacity, transform
and SVG path length only. (This replaces the earlier Fairway rule "data
renders final on mount" for chat visuals, at the owner's request.)

## 4. Message mechanics

### Text

- Answer body 16px / 1.65, primary ink (≥ 13:1 on the canvas); the lead
  sentence 17px at weight 500. Measure about 68ch; visuals may run wider.
- Paragraph gap 14px; 16–20px between prose and a visual. Prose after a
  visual is styled exactly like prose before it.
- Secondary text (captions, provenance) must hold ≥ 4.5:1; never use the
  tertiary tier for anything the coach has to read to act.
- The coach's message: right-aligned tinted bubble, body size, primary ink,
  max 85% width. The assistant: no bubble.

### Streaming

- Re-render at most every 50ms (`useChat({ throttle: 50 })`).
- Follow the bottom only while the coach is at the bottom; an upward scroll
  releases it; a round "jump to latest" button returns.
- Never stream a partial number into a visual: a visual appears whole.
- Word smoothing (`smoothStream`) is wanted but the installed `ai` build
  omits it from its type exports; revisit on the next SDK bump.

### Working states

- Before text: one "Thinking" line; while tools run, a step list in coach
  language ("Reading Maya's last 12 rounds"), spinner → check → warning.
- When the answer starts, steps collapse to one row ("Worked for 6s · 3
  steps") that re-expands; the summary survives reload.
- Stopped or failed: keep the partial text, add one status line with Retry.

### Actions

- A proposal shows exactly what will be written, with a specific verb
  ("Create task"), and collapses to a receipt with a link once confirmed.

### Chrome

- Copy / retry under a finished answer; always visible on touch, on hover on
  desktop; 44pt targets on the phone.
- Follow-up suggestions: at most three, one wrapped row.

### Loading between tabs and conversations

- A skeleton shaped like the real first paint (not a spinner, not a generic
  block); a short cross-fade (≈180ms) between tabs; no layout jump when data
  lands; scroll restored per conversation.

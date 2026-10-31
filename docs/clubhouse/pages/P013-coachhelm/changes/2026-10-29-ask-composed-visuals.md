# 2026-10-29 — CoachHelm Ask: designed visuals, staging fixes, answer type

## 2026-10-29 — Composed visuals and the staging-transcript fixes

```text
Design package: docs/architecture/coachhelm-visual-playbook.md (owner brief
                2026-10-29: "terrible and basic"; staging transcript "its the
                coachhelm chat. its ass"); no owner phone board for the
                composed card
PR/commit:      agent/coachhelm-visuals
Contract IDs:   CH-13850, CH-13852, CH-13853 (presentation; the parts protocol is
                unchanged: data-visual-composition = ValidatedComposition)
Actions:        none
Data impact:    none (every figure is copied from a read by compile-composition.ts)
Held items:     motion on a real iPhone (Safari, the Capacitor shell); the
                playbook's 320/600/420/220 ms timings are drawn on the D-64 beats
                (base 260, reveal 520, quick 180) instead, pending the owner
```

### Changed

- Ask draws a model-designed visual (`data-visual-composition`) as one card,
  `screens/coachhelm/chat/visual/CoachComposition.tsx`: whose figures, the
  finding as a title, the takeaway, the blocks (headline with a verdict in the
  metric's direction, figures, strokes gained either side of zero, a to-par
  trend, bars, a ranking, a team table, notes labelled Measured, Pattern or
  Hypothesis), coverage notes, and one provenance line with the sample in
  words. `split` sets figure blocks two-up on a wide screen only. The plain
  evidence card of a read it draws in full is hidden, as for an artifact.
- Motion, the CoachHelm chat exception to Q-153 (`.claude/rules/clubhouse.md`):
  only a visual that arrives in a live answer rises in, block by block; its
  line draws and its bars grow from the baseline. A restored thread, Reduce
  Motion and Animations off draw it final. `ui/charts/Line.tsx` gains an opt-in
  `drawIn`; no other chart moves.
- Answer text: body 16px at 1.65 in the primary ink, the lead sentence 17px at
  medium weight, 16px between paragraphs; captions and provenance 13px in the
  secondary ink. The colour already held (17.9:1 by day, 13.4:1 at night,
  measured in WebKit); the line height (1.31) and the regular-weight lead were
  what read as faint.
- From the staging transcript: an old answer's pipe table draws as a table; an
  evidence table's title is said once (its table takes its name from the
  title, no hidden duplicate caption); tool tables say dates, times, statuses
  and yes or no in words, with human headings ("RSVP required"); "View as
  table" is a quiet secondary control; a roster count says its figure once;
  the work line is one quiet row ("Worked for 6s · 3 steps"), what was read
  inside it; a ranking is rank, name, sample, bar and figure (no initials
  list); players across metrics are a team table, players as rows when they
  outnumber the metrics, the best per metric marked by its direction; a to-par
  score is signed with E for even; strokes gained is green or amber by sign,
  against the baseline.
- The Board | Ask strip keeps its x across the switch on the desktop: the Ask's
  strip now ends at the Board's right edge (page gutter plus the Board
  header's 4px), 1228 at 1280 and 1388 at 1440 on both views and in the Ask
  skeleton (it sat 25px right). Its y still differs (Board 225, or 193 with no
  roster, at the foot of its title header; Ask 76, at the top of the chat):
  matching it from the Ask would take a band of about 150px above the chat, so
  it is left to the Board header (coachhelm.css) to bring the strip up.

### Verified

- WebKit (Playwright), 402 and 1280 px, preview states `compose`,
  `composelive`, `staging`, `visual`, `answer`; screenshots in the PR.
- Tests: `coachhelm-composition.test.tsx`, `coachhelm-thread-staging.test.ts`,
  the existing `coachhelm-*` suites.

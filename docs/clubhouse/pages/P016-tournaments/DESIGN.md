# P016 — Tournaments: design

Source: the owner's Claude Design project "Coach home dashboard redesign", copied unchanged into `design/handoff/`
(v3 in `design/handoff/VERSIONS.md`): `Coach - Tournaments.html` (desktop), `Coach - Tournaments - Mobile.html`
(phone), `Tournaments Deck.html` (walkthrough), `tour.jsx`, `tour-m.jsx`, `tour-compare.jsx`, `tour-data.js`,
`tour.css`, `tour-m.css`. The plan that builds on them is the handoff's section 4.33, which wins where it changes the
boards (no NumberFlow or digit rolling, D-100; the comparison rebuilt around a question bar and tiered verdicts,
D-86 and D-101; the live round as the centerpiece, 5L).

Rules every view keeps (plan 0.4 and sections 8 and 9):

- Clubhouse tokens and `ui/*` primitives only, `.ch-tour-*` classes; Instrument Sans, sentence case, tabular figures,
  the true minus, `E` for even, `—` for no data.
- Red only for under par and destructive actions. Gain and loss are close in lightness, so a signed mark always
  carries a side, a sign triangle or a word (DeltaChip draws the triangle).
- Motion: durations 0, 110, 180, 260, 280, 520 ms from `lib/motion.ts`; nothing on first paint; a changed value takes
  its new value in place with the 520 ms changed-wash; Reduce Motion respected.

Each lane records here, for its views, every element on the boards it matches and every one it leaves out with the
reason (plan Phase 2 acceptance).

# 2026-10-24 — Type roles, one tight leading and step tracking on every sheet (rows 26, 27, 28)

## 2026-10-24 — every sheet's type on the step roles

```text
Design package: none (Clubhouse A+ handoff, rows 26-28; lane B, logged by S1)
PR/commit:      e3bd98611, fa775cd71 (agent/clubhouse-aplus-phase2, #2361)
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     the sign-in pages keep the owner's ported type (auth.css is not passed to the codemod); 329 uses of the legacy ratio roles (caption, body, label...) were left for a later pass
```

### Changed

- `scripts/clubhouse/type-roles.mjs` moved every 400/500/600 `font:` on a step (11-17, 20, 22, 28, 34) onto the role of the same size and weight; a px size now follows Dynamic Type. Off-step sizes, 700, italics, mono, and step-sized text on chart, tick, badge, count and keycap text or in a fixed-height box stay raw (named exceptions).
- Multi-line text takes the role's leading; a single line (1.15 or under) takes `--ch-lead-tight` (1.1).
- Negative off-role tracking on a step becomes the step's token, and a rule on a tracked step with no letter-spacing gains `var(--ch-track-<n>)`.
- Raw shorthands 691 -> 214, raw line-heights 665 -> 41, off-role tracking 76 -> 70; every ratchet in look-feel-pass-css.test.ts is exact, plus a line-height ratchet and the tracked-step rule.
- Owner decision (Nick, 2026-10-24, item 1 text size): kept. The roughly 400 sizes this pass moved off raw px onto the roles follow the iPhone's Text Size through `--ch-type-k`; they are not pinned back, and nothing new is built on it. Later type moves (2026-10-24-legacy-type-roles.md) use the same unit, so text grows evenly.

### Why

- Rows 26-28: one named style per step, Apple's leading per step, one tracking value per step.

### Verification

- Device check owed: text at the largest Text Size (the XXL cap).
- look-feel-pass-css.test.ts. Needs a screenshot pass: single-line labels' line boxes are 10% taller where height is content-driven, and multi-line px rules take the step leading.

# Type roles on live pages (dsx-07, batch 2)

## 2026-11-27 — Live pages read the nine type roles

```text
Design package: design lab foundation 1 (QUEUE dsx-07)
PR/commit: claude/project-thread-yzx7s4 (#2660)
Contract IDs: none new
Actions: none
Data impact: none
Held items: none
```

### Changed

- 1,214 of 1,243 numeric type step reads in 36 live stylesheets (every live
  file not owned by another open PR) now read a role: footnote 361, callout
  300, body 245, caption 165, headline 100, title 37, figure 4, large title 2.
  Rule: the nearest role within 2px, by desktop value in a desk or shared
  rule and by phone value in a phone rule; the row figure only where the rule
  sets tabular numbers; ties go to the role of the same weight.
- 945 rules keep their old weight with `font-weight: var(--ch-fw-400|500|600)`.
  On 1x screens `--ch-fw-400` is 450 and `--ch-fw-500` 560, and the body role
  450, so the W1 lift (owner, 12 Nov) holds.
- Shared stylesheets: `ui.css`, `command.css`, `hero-tones.css`,
  `quick-chat.css`, `whats-new.css`.
- The 29 reads of the 28 and 34 steps (no role within 2px) read a new display
  pair, `--ch-type-display` (28/34) and `--ch-type-display-xl` (34/41), the same
  on phone and desk, so those headings and big figures look as they did.
- Left: the stylesheets of open PRs #2610, #2655, #2656, #2658, #2659, #2661.
  `legacy-type-roles.test.ts` lowered to match.

### Why

Foundation 1: one type system that follows iPhone Text Size. Staging before
and after shots on real teams are owed before landing.

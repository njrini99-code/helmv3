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

- 1,213 of 1,243 numeric type step reads in 36 live stylesheets (every live
  file not owned by another open PR) now read a role: footnote 361, callout
  300, subhead 246, caption 165, headline 100, title 37, body 3, large title 1.
  Rule: the nearest role within 2px, by desktop value in a desk or shared
  rule and by phone value in a phone rule; the row figure only where the rule
  sets tabular numbers; ties go to the role of the same weight.
- The 15 step in a desk or shared rule reads a new role, the subhead,
  `--ch-type-subhead` (15/20, the same on phone and desk; 450 on 1x screens
  like the step), not the body: the body is 17/24 on a phone, so 242 rules of
  secondary text (row names, second lines, labels) and four row figures grew
  from 15 to 17 there and the hierarchy under the body flattened, and the
  body's 22 leading opened them on a desk. Each now renders as before on both.
- 949 rules keep their old weight with `font-weight: var(--ch-fw-400|500|600)`.
  On 1x screens `--ch-fw-400` is 450 and `--ch-fw-500` 560, and the body and
  subhead roles 450, so the W1 lift (owner, 12 Nov) holds.
- Shared stylesheets: `ui.css`, `command.css`, `hero-tones.css`,
  `quick-chat.css`, `whats-new.css`.
- The 30 reads of the 28 and 34 steps (no role within 2px; the desk Ask
  greeting had read the 40 large title) read a new display pair,
  `--ch-type-display` (28/34) and `--ch-type-display-xl` (34/41), the same on
  phone and desk, so those headings and big figures look as they did: the desk
  greeting is 34 again.
- Left: the stylesheets of open PRs #2610, #2655, #2656, #2658, #2659, #2661.
  `legacy-type-roles.test.ts` lowered to match.

### Why

Foundation 1: one type system that follows iPhone Text Size. Staging before
and after shots on real teams are owed before landing.

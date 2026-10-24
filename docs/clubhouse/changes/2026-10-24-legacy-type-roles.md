# 2026-10-24 — Caption and label rules onto the step roles, pixel-identical (type leftovers)

## 2026-10-24 — 218 legacy-role rules moved; the other 111 counted

```text
Design package: none (Clubhouse A+ handoff, rows 26-27 leftovers; FINISH_DIRECTIONS S1 item 5)
PR/commit:      agent/aplus-s1
Contract IDs:   none
Actions:        none
Data impact:    none
Held items:     111 rules stay on legacy roles: body (21), body-s (49), body-l (3) and title (9) change size on the phone
                (the 820px block), so no single step matches them on both breakpoints; serif-l/m/s and display-s (23)
                would gain their step's tracking under the tracked-step rule; mono (5) and figure-l (1) have no step.
                Moving any of them changes pixels and needs the owner's look.
```

### Changed

- tokens.css: `--ch-lead-caption: 1.4` and `--ch-lead-label: 1.3`, the old roles' own leadings as tokens.
- 218 rules across 20 stylesheets: `font: var(--ch-type-caption)` becomes `font: var(--ch-type-13)` with
  `line-height: var(--ch-lead-caption)`; `-label` becomes `-14-medium` and `-label-s` `-13-medium`, with
  `line-height: var(--ch-lead-label)`. Where the rule already set its own line-height after the font (3 rules), only
  the font changed. Same size, weight, face and leading at every text size; the step tracking for 13 and 14 is 0.
- New `__tests__/legacy-type-roles.test.ts`: caption and the labels stay gone, the two leading tokens are pinned, and
  the remaining legacy uses only fall, file by file.

### Why

- The type leftovers: the legacy ratio roles onto the step roles, pixel-identical at the default size.

### Verification

- WebKit (Playwright 1.63) at 390 and 1440 on the 38 preview screens plus components, gallery, popup lab, sign-in and
  onboarding: every element's computed font family, size, weight, line-height and letter-spacing, before and after
  (51,855 elements matched; about 1,100 of them on the caption and label leadings). No difference except the Next.js dev
  overlay's own portal. A second unchanged run showed the full-page PNGs differ run to run (the time-of-day light), so
  pixels were not usable as proof; the computed styles were.
- look-feel-pass-css.test.ts and legacy-type-roles.test.ts.

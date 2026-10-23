# 2026-10-23 — Button roles and one eyebrow (Clubhouse A+ WP-11)

## 2026-10-23 — Done, Clear filters and Try again by role (CONS-5)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, CONS-5)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: none
```

### Changed

- "Done" is the sheet's primary action (the calendar feed sheet, Roster's
  invite sheet). "Clear filters" on Stats is secondary, not primary.
- "Try again" by scope (B-10): the course plan's failed section is
  secondary (was ghost); the travelers' inline line stays ghost; a failed
  CoachHelm answer's card stays secondary.

### Why

- The same label carried three weights in three files.

### Verification

- New `buttons-ast.test.ts`, reading the JSX: every "Done" is primary, no
  "Clear filters" or "Clear search" is.

## 2026-10-23 — Every eyebrow is one role (CONS-30)

```text
Design package: none (Clubhouse A+ handoff, section 4.18, CONS-30)
PR/commit: #2361
Contract IDs: none
Actions: none
Data impact: none
Held items: Hub's team line above the title (left as is)
```

### Changed

- `--ch-type-eyebrow` (13/500, no tracking). The 15 eyebrow and kicker rules
  that set type now use it: qualifiers (were 11, 12 and 14), Hub (12/600),
  the shell hero (14/600), the canopy heads (13 with +0.01em), onboarding
  (14), Roster's kicker (12) and the intro and feature kickers.
- Left: moving Hub's team line above the title (a markup change, not taken).

### Why

- Eyebrows ran from 11 to 14px and 500 to 600 across screens.

### Verification

- `look-feel-pass-css.test.ts`: an eyebrow or kicker rule sets the role or
  no type at all. WebKit before and after on Qualifiers, a qualifier, Hub
  and Roster at 390, and Home, Qualifiers, the new-qualifier form and
  CoachHelm at 1280: no layout moved.

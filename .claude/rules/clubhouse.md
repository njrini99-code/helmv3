---
paths:
  - "src/clubhouse/**"
  - "docs/clubhouse/**"
  - "design/handoff/**"
---

## Clubhouse (the from-scratch GolfHelm UI)

`src/clubhouse/` is a new UI tree built from the owner-approved handoff in
`design/handoff/` (the Fairway Clubhouse Edition spec). **The Fairway rules in
`design-system.md` do not apply here, and Fairway code must never be reused
here.** An earlier redesign layered new styles on top of Fairway and the owner
rejected the result; this tree exists so that cannot happen again.

- **Never import** `@/components/fairway/**`, `@/lib/fairway/**`,
  `@/lib/redesign/**`, `fairwayScope` or `.fairway-ds`. Never read `--fw-*` or
  any non-`--ch-*` custom property. Shared non-UI plumbing is fine: session,
  Supabase loaders, `@/lib/utils/capacitor`.
- **Styling:** plain CSS files, with every selector under `.ch-*` or
  `[data-ui="clubhouse"]` and tokens from `src/clubhouse/styles/tokens.css`.
  No Tailwind utilities in Clubhouse markup.
- **Doctrine:**
  - Red means under par, the pin flag, or a destructive action (D-42). Gains are green; losses are amber.
  - Instrument Sans only, in sentence case: no tracked uppercase, no serif.
  - Tabular numbers everywhere. Use a true minus `−`, `E` for even and `—` for no data.
  - Motion uses 90, 150, 220 and 360ms with `cubic-bezier(.2,.8,.2,1)`, and a 0.985 press. No count-ups, no entrance staggers.
  - No emoji and no exclamation marks.
- **Haptics:** only through `src/clubhouse/lib/haptics.ts`.
- **Phone:** iPhone only. The owner's design in `design/handoff/mobile/` is
  the phone spec; without one, a draft in `docs/clubhouse/phone/<screen>.md`
  needs owner approval before it is built. It is never a shrunken desktop.
  Follow `docs/clubhouse/MOBILE.md`, and never commit a native config that
  points anywhere but production.
- **New design:** follow `docs/clubhouse/README.md` step by step. The
  screen checklist is `docs/clubhouse/SCREENS.md`.
- **Tracker:** `docs/clubhouse/PROGRESS.md`. Move a gate only with evidence.
- **Before you report work done,** run `npm run clubhouse:check`.
- **Reviews:** `ui-polish-reviewer` reviews against Fairway. Don't use it here;
  review against the handoff screenshots instead.

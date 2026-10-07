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
  No Tailwind utilities in Clubhouse markup. Each page stylesheet has its own
  class prefix (`.ch-rsu-`, `.ch-cal-ft`): `clubhouse:check` fails when two
  page stylesheets anchor the same class.
- **Doctrine:**
  - Red means under par, the pin flag, or a destructive action (D-42). Gains are green; losses are amber.
  - Instrument Sans for display, body and data; JetBrains Mono for keyboard hints only (`lib/fonts.ts`). Sentence case: no tracked uppercase, no serif.
  - Tabular numbers everywhere. Use a true minus `−`, `E` for even and `—` for no data.
  - Motion follows v2 (D-64): press 110ms, quick 180ms, base 260ms, release 280ms and reveal 520ms, from the `--ch-dur-*` tokens and `CH_DUR`, on the v2 ease-out, in-out and spring curves. The press is `useChPress` (about 6px). Routine first-paint staggering is retired: content is visible immediately, and `shell/RouteFrame.tsx` plus `styles/shell.css` own the whole-page crossfade. Use `useChReducedMotion`; reduced motion and Animations off swap immediately. Pushed phone screens retain their separate `PhoneScreen` transition; auth course choreography follows its own tokens and contract. No count-ups or routine staggers.
  - Haptics follow v2 (D-70): selection, light for primary buttons, success for saves and sends, warning before destructive actions, medium only for a sheet settling, error on failure; other taps are silent.
  - No emoji and no exclamation marks.
- **Haptics:** only through `src/clubhouse/lib/haptics.ts`.
- **Phone:** iPhone only. The owner's phone board (`… - Mobile.html` in
  `design/handoff/`; v1 boards in `design/handoff/mobile/`) is the phone spec; without one, a draft in `docs/clubhouse/phone/<screen>.md`
  needs owner approval before it is built. It is never a shrunken desktop.
  Follow `docs/clubhouse/MOBILE.md`, and never commit a native config that
  points anywhere but production.
- **New design:** follow `docs/clubhouse/README.md` step by step. The
  screen checklist is `docs/clubhouse/SCREENS.md`.
- **Tracker:** `docs/clubhouse/PROGRESS.md`. Move a gate only with evidence.
  Each page also has a manifest (`config/clubhouse/pages/`), six page docs
  (layout in `docs/clubhouse/README.md`) and numbered contracts (D-60, D-68, D-69);
  after a catalog change run `node scripts/clubhouse/registry.mjs sync`.
- **Before you report work done,** run `npm run clubhouse:shots -- check` and
  `npm run clubhouse:check` (it also gates changelogs and the VERIFY
  screenshot logs, below).
- **Reviews:** when a reviewer is useful, use `clubhouse-polish-reviewer`
  (`.claude/agents/clubhouse-polish-reviewer.md`) against current runtime owners,
  page contracts and handoff screenshots; for an optional deep, scored
  design audit use `clubhouse-design-reviewer`. `ui-polish-reviewer` targets
  Fairway. Reviewer agents remain optional and risk-based under `AGENTS.md`.
- **Shared exemplars:** `src/clubhouse/AGENTS.md` indexes current Modal, Menu,
  Button, FormLine, Surface, PhoneScreen and route-transition owners. Follow
  their live implementations and current styles, rather than stale comments
  or unmodified handoff timings.

## Docs and screenshots in the same change

A changed page needs a dated `CHANGELOG.md` entry, and a visible change needs
logged before/after screenshots (PR description, never git). Steps, naming
and links: `docs/clubhouse/README.md`, "Docs and screenshots in the same
change".

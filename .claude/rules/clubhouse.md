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
  - Instrument Sans only, in sentence case: no tracked uppercase, no serif.
  - Tabular numbers everywhere. Use a true minus `−`, `E` for even and `—` for no data.
  - Motion follows v2 (D-64): press 110ms, quick 180ms, base 260ms, release 280ms and reveal 520ms, from the `--ch-dur-*` tokens and `CH_DUR`, on the v2 ease-out, in-out and spring curves. The press is `useChPress` (about 6px), and the only stagger is the first-paint `.ch-reveal`. No count-ups.
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
- **Reviews:** `ui-polish-reviewer` reviews against Fairway. Don't use it here;
  review against the handoff screenshots instead.

## Docs and screenshots in the same change

`clubhouse:check` fails a page whose implementation files changed since the
merge-base with `origin/main` (tests exempt) but whose `CHANGELOG.md` did not.

- **Visible change:** a dated entry in the page's `CHANGELOG.md` (the header
  block in `docs/clubhouse/templates/CHANGELOG.md`), plus before and after
  screenshots.
- **Naming:** `npm run clubhouse:shots -- name --page P### --surface <kebab>
  --role coach|player|none --viewport 390 --state <kebab> --phase
  before|after|baseline|evidence` prints the path, in the local gitignored store
  `.helm/screenshots/clubhouse/<P###-slug>/<YYYY-MM-DD>/`:
  `P###__surface__role__viewport__state__phase__sha7.png`. Then
  `clubhouse:shots -- record <file> --route <route>`.
- **Log:** one row per file in the page's VERIFY.md `## Screenshots` (label =
  file name, phase, commit, what it shows). Never invent rows.
- **Screenshots go in the PR description, never in git.**
- **Behavior or state change:** also CONTRACT.md and the catalog, then
  `node scripts/clubhouse/registry.mjs sync`. A gate that moves in `PROGRESS.md`
  moves with evidence; the manifest `status` stays true.

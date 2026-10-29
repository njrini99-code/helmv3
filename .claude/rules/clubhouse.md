---
paths:
  - "src/clubhouse/**"
  - "docs/clubhouse/**"
  - "design/handoff/**"
---

## Clubhouse (the from-scratch GolfHelm UI)

`src/clubhouse/` is a new UI tree built from the handoff in `design/handoff/`
(the Fairway Clubhouse Edition spec). It is off in production (its release
flag in `config/feature-flags.yml`; preview and development render it), so Fairway serves
coaches and players live. **The Fairway rules in
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
  - Motion follows v2 (D-64): press 110ms, quick 180ms, base 260ms, release 280ms and reveal 520ms, from the `--ch-dur-*` tokens and `CH_DUR`, on the v2 ease-out, in-out and spring curves. The press is `useChPress` (about 6px). Routine first-paint staggering is retired: content is visible immediately, and `shell/RouteFrame.tsx` plus `styles/shell.css` own the whole-page crossfade. Use `useChReducedMotion`; reduced motion and Animations off swap immediately. Pushed phone screens retain their separate `PhoneScreen` transition; auth course choreography follows its own tokens and contract. What moves and can be interrupted or thrown (sheets, pushed screens, the segmented pill, a swap's incoming copy, the nav plate) rides the D-64 springs on those durations, `CH_SPRINGS` through `chSpring`/`chSpringCurve` in `lib/motion.ts`, bounce 0 to 0.1 (D-64 extension). No count-ups or routine staggers, and no first-paint draw-ins on charts or graphics (Q-153): a graphic is drawn in place, and only a value that changes afterwards may move. One exception (owner, 2026-10-29; `docs/architecture/coachhelm-visual-playbook.md` §3): a CoachHelm chat visual that arrives in a LIVE Ask answer (`screens/coachhelm/chat/visual/CoachComposition.tsx`) rises in, block by block 80 ms apart, on the base beat, its line draws over the reveal beat and its bars grow on the base beat; decided once at mount, never under reduced motion or Animations off, never for a thread restored from history, opacity, transform and path length only, and numbers are never counted up. `ui/charts/Line.tsx` takes it only through its opt-in `drawIn`. The full live set, pinned by `src/clubhouse/__tests__/motion-durations-pinned.test.ts`: the phone page fade-through is 120 ms out, a gap as long, 220 ms in, and a desktop drill-in crossfades with no gap, 120 ms out and 180 ms in together (owner decision 3, A10), with the route skeleton held 300 ms (skeletons themselves show at once), and a section switch (the tab bar, a sidebar item) swaps at once instead, with the same hold onto a skeleton (`data-ch-tab`, `lib/nav-motion.ts`); the smooth spring settles in 462 ms; loops are the shimmer 1.9 s, the live pulse 2.8 s and the sweep 900 ms; the Stats busy dim holds off 150 ms (`--ch-dur-busy-delay`, A11). Change one only together with this text and that test.
  - Type sits on 11 sizes (owner-approved, mot-08): 11, 12, 13, 14, 15, 16, 17, 20, 22, 28 and 34 px, written as `calc(N * var(--ch-type-k))` or `Npx`; weights on 400, 500, 600 and 700. Big figures of 40px and up are free. Pick the nearest step, never a half pixel. `src/clubhouse/__tests__/look-feel-pass-css.test.ts` pins it; SVG chart labels sized in drawing units are outside it.
  - Haptics follow v2 (D-70): selection, light for primary buttons, success for saves and sends, warning before destructive actions, medium only for a sheet settling, error on failure; other taps are silent.
  - No emoji and no exclamation marks.
- **Haptics:** only through `src/clubhouse/lib/haptics.ts`.
- **Phone:** iPhone only. The owner's phone board (`… - Mobile.html` in
  `design/handoff/`; v1 boards in `design/handoff/mobile/`) is the phone spec; without one, write the draft in
  `docs/clubhouse/phone/<screen>.md` first and build from it, noting in the PR
  that no owner board exists. It is never a shrunken desktop.
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
  page contracts and handoff screenshots. `ui-polish-reviewer` targets Fairway.
  Reviewer agents are optional and risk-based.
- **Shared exemplars:** `src/clubhouse/AGENTS.md` indexes current Modal, Menu,
  Button, FormLine, Surface, PhoneScreen and route-transition owners. Follow
  their live implementations and current styles, rather than stale comments
  or unmodified handoff timings.

## Docs and screenshots in the same change

`clubhouse:check` fails a page whose implementation files changed since the
merge-base with `origin/main` (tests exempt) but which logged nothing.
It runs in CI (Static checks, full history) and reads uncommitted files too, so
a red gate can be another session's work in progress.

Log a change as a new file, never by editing a shared log: a page's entry is
`docs/clubhouse/pages/<P###-slug>/changes/<YYYY-MM-DD>-<slug>.md`, and a shared
piece (a file under `src/clubhouse/ui`, `lib` or `styles` that no page owns, or
a component several pages name) gets one entry in `docs/clubhouse/changes/`,
not one on each page. Each branch adds its own file, so parallel branches never
conflict on a log; the page `CHANGELOG.md` files keep the older history and
an edit to one still satisfies the gate.

- **Visible change:** a change file holding one entry (the `## YYYY-MM-DD`
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
- **Screenshots go in the PR description, never in git.** A capture left in a
  scratch dir (`clubhouse:shots -- check` warns) is filed with
  `clubhouse:shots -- import <file> --page P### ...`.
- **Gallery:** `clubhouse:shots -- gallery [--page P###]` builds a local HTML
  gallery per page (before and after side by side, filter by role and
  viewport) and opens it; `record` and `import` rebuild it.
- **Links:** each PAGE.md "Related" block and `docs/clubhouse/AUDITS.md` are
  generated by `registry.mjs sync`. A new audit or plan doc is registered in
  `config/clubhouse/audits.json` first; `clubhouse:check` fails an unregistered
  one and any relative markdown link under `docs/clubhouse/` that does not resolve.
- **Behavior or state change:** also CONTRACT.md and the catalog, then
  `node scripts/clubhouse/registry.mjs sync`. A gate that moves in `PROGRESS.md`
  moves with evidence; the manifest `status` stays true.

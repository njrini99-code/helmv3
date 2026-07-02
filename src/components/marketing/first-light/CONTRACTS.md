# First Light — build contracts

Scaffold for the "First Light" landing redesign
(`docs/LANDING_ENTRY_WORLD_DESIGN.md`). Built by the `foundation` lane
(`feat/entry-world-foundation`). Every other lane builds ON this scaffold
— read this file before touching anything under
`src/components/marketing/first-light/`.

## Ownership map

| File | Owner (per the design doc's build plan) | Status after this PR |
|---|---|---|
| `first-light.css` | foundation (this lane) — shared, edit-with-care | LIVE — palette vars + 3-grade glass grammar |
| `fonts.ts` | foundation (this lane) — shared, edit-with-care | LIVE — Fraunces (400/500/600/700, no italic) |
| `scroll/LenisRoot.tsx` | foundation (this lane) — shared, edit-with-care | LIVE — the ONE Lenis instance |
| `scroll/useScrollProgress.ts` | foundation (this lane) — shared, edit-with-care | LIVE |
| `scroll/PinnedScrub.tsx` | foundation (this lane) — shared, edit-with-care | LIVE |
| `scroll/MaskedReveal.tsx` | foundation (this lane) — shared, edit-with-care | LIVE |
| `lib/photoBg.ts` | foundation (this lane) — shared, edit-with-care | LIVE |
| `moments/M1Hero.tsx` | `landing-hero+nav` | STUB — replace in place |
| `moments/M2Clarity.tsx` | `landing-editorial` | STUB — replace in place |
| `moments/M3ProductCinema.tsx` | `landing-cinema` | LIVE — rebuilt 2026-07-02 to a film-strip column + hardware bezel + ledger captions (see the dedicated M3 section below); the three desktop screens + Lift Lab phone are LIVE INTERACTIVE COMPONENT REPLICAS (`screens/*.tsx`, see "Screen replica contract" below) — not screenshots |
| `moments/M4TwoFields.tsx` | `landing-portals+cta` | STUB — replace in place |
| `moments/M5Intelligence.tsx` | `landing-editorial` | STUB — replace in place |
| `moments/M6ForThePlayer.tsx` | `landing-editorial` | STUB — replace in place |
| `moments/M7Honesty.tsx` | `landing-editorial` | STUB — replace in place |
| `moments/M8FinalCTA.tsx` | `landing-portals+cta` | STUB — replace in place |
| `moments/M9Footer.tsx` | `landing-portals+cta` | STUB — replace in place |
| `src/app/page.tsx` | shared — composition only, keep diffs small | LIVE — composes `LenisRoot` + M1..M9 |

**Rule for downstream lanes:** replace a `moments/M*.tsx` file's internals
freely, but keep its **filename, default-vs-named export, and top-level
props interface name** — `src/app/page.tsx` and the barrel (`index.ts`)
import by those exact names. If a prop needs to change, update `index.ts`'s
re-export and this table in the same PR.

## The "shared" files — edit-with-care

`first-light.css`, `fonts.ts`, and everything under `scroll/` +  `lib/`
are infrastructure every moment leans on. If your lane needs a change
here (a new glass grade, a different Lenis tuning, a new scroll
primitive), make the smallest possible addition — don't restyle existing
classes/exports other moments already depend on without checking who
else uses them (`grep -rn "fl-glass-\|MaskedReveal\|PinnedScrub\|useScrollProgress" src/components/marketing/first-light`).

## Glass grammar (from `first-light.css`)

Three grades, all: `backdrop-filter: blur+saturate`, a 1px brass top
edge-light (`box-shadow: inset 0 1px 0 0 rgba(brass, 0.35)`), a faint
grain `::before` layer, and an `@supports not (backdrop-filter)` solid
fallback.

- **`.fl-glass-1`** — hairline nav pill. Lightest touch, always visible
  chrome (M1's nav). `blur(16px) saturate(1.4)`.
- **`.fl-glass-2`** — floating card over photography. Product proof, sport
  portals (M3's frame, M4's portal cards, M6's vignettes). `blur(20px)
  saturate(1.3)`.
- **`.fl-glass-3`** — deep panel. Auth forms, dense product-cinema
  content, the M5 signal card. `blur(24px) saturate(1.2) brightness(0.92)`.

**Position:** `fl-glass-*` defaults to `position: relative` via a
zero-specificity `:where()` selector (NOT plain `.fl-glass-2 { position:
relative }`, and NOT `@layer components` — Next.js processes this file
through its own independent PostCSS pass, so `@layer` throws without a
matching `@tailwind components` directive in the SAME file). This means a
consumer that needs `absolute`/`fixed`/`sticky` instead just adds that
Tailwind utility alongside the `fl-glass-*` class and it wins. (M3's
2026-07-02 film-strip rebuild moved its `fl-glass-2` consumer —
`HardwareShell` — behind a plain, in-flow wrapper instead of combining
`fl-glass-2` with `absolute` on one element directly, so there's currently
no live same-element example in this scaffold; the mechanism is still
load-bearing for whichever future moment needs it next.) Don't reintroduce
a plain (non-`:where()`) `position` rule on `.fl-glass-*` — confirmed
2026-07-02 that broke exactly this case.

**Budget:** at most 2 `fl-glass-*` layers visible in a single viewport
(CLAUDE.md motion rules). Content placed inside a glass surface needs
`position: relative` (or `z-10`+) to render above the `::before` grain
layer — every moment in this scaffold wraps its content in a `relative
z-10` div for this reason; copy that pattern.

`.fl-grain` — fixed, full-bleed, `pointer-events: none`, `aria-hidden`.
Mount once per page (M1 and M3 currently do — check before adding a
second one; it's a cheap layer but doesn't need duplicating).

`.fl-rule` — a 1px brass hairline gradient, `height: 1px`. Override
`background` inline for a specific ink (M2 does this for its green
ledger rules).

## Palette v2 — SAGE & CREAM (CSS custom properties, `first-light.css` `:root`)

**⚠ Respec 2026-07-02 (Nick):** the landing moved from dusk-pine drama to
morning sage-and-cream calm — see the ⚠ AMENDMENT at the top of
`docs/LANDING_ENTRY_WORLD_DESIGN.md` (THE contract; overrides the older
"deep pine bands / kelly-as-only-accent" language anywhere else in that
doc or in this file's history).

**The mood is daylight.** The page lives in morning light now — if any
frame reads dark, moody, or murky, it's off-spec; fix it before shipping.

| Var | Hex | Use |
|---|---|---|
| `--fl-ecru` / `--fl-cream` | `#F5F1E6` | Cream field (unchanged) — `--fl-cream` is the first-class name, `--fl-ecru` an equal-value alias |
| `--fl-cream-high` | `#FBF9F2` | Cream high — glass highlights, replaces white |
| `--fl-sage-mist` | `#E4E9DD` | Sage mist — section tints, glass tint |
| `--fl-sage` | `#94A38A` | Sage — rules, icons, decorative/large type ONLY (never body text) |
| `--fl-sage-deep` | `#5C6E58` | Sage deep — CTAs + emphasis, cream text |
| `--fl-sage-ink` | `#2E3A2C` | Sage ink — dark bands + ALL body/display ink |
| `--fl-clay` | `#B0703C` | Warm clay accent — demoted to trace only (M4 baseball-diptych grade) |
| `--fl-brass` | `#B08D57` | Glass-edge hairlines (kept) |

**Legacy aliases (repointed, not removed):** `--fl-pine` and `--fl-green`
keep their names so in-flight lane work referencing them recolors
automatically — no find/replace needed in moment files that already
shipped.

| Legacy var | Old value | Repointed to (2026-07-02) |
|---|---|---|
| `--fl-pine` | `#143527` (deep pine) | `#2E3A2C` (`--fl-sage-ink`) |
| `--fl-green` | `#16A34A` (kelly) | `#5C6E58` (`--fl-sage-deep`) |

Each var also has a `-rgb` sibling (e.g. `--fl-sage-ink-rgb: 46, 58, 44`)
for `rgba(var(--fl-sage-ink-rgb), 0.5)` compositing.

**Read-mapping — wherever older spec text or code comments say:**
- **deep pine `#143527`** → read **sage-ink `#2E3A2C`** (`--fl-pine` /
  `--fl-sage-ink`, same value now).
- **kelly `#16A34A` CTA / accent on landing or auth chrome** → read
  **sage-deep `#5C6E58`** (`--fl-green` / `--fl-sage-deep`, same value
  now), cream text. **Kelly is demoted to product-only** — it appears
  exclusively *inside* real app screenshots and the M5 signal-card
  replica (that's the product's own chrome, i.e. content — honest).
  Landing/auth chrome never uses kelly directly.
- **clay `#B0703C`** → trace only (the baseball half of the M4 diptych
  grade); nothing structural.
- **photo grade "pine→amber duotone"** → **sage→cream grade**: shadows
  toward sage-ink, mids toward sage, highlights lifted to cream-high.
  Airy morning, never murky.

**Never hardcode** `#143527` or `#16A34A` (or any other retired hex) —
always reach for the token.

## Fonts (`fonts.ts`)

`flFraunces` — `next/font/google` Fraunces, weights 400/500/600/700,
`style: ['normal']` only (**no italic** — per
`feedback_helm_no_italic_accent_word`, never italicize an accent word in
a serif headline; use color/weight instead, as M1/M2 do). Import
`flFraunces.className` onto display/serif elements. Deliberately separate
from `src/lib/fonts.ts`'s `fraunces` export (single weight 600, owned by
the BaseballHelm Living Annual kit) — don't cross-import between them.

Root `layout.tsx` / `tailwind.config.ts` are OUT OF SCOPE for every First
Light lane — this module loads its own font instance instead.

## Reduced-motion: two valid patterns, pick correctly

- **Prop-only variation** (e.g. `transition={reduced ? { duration: 0 } :
  {...}}` on an otherwise-identical `m.*` element — the repo-wide pattern,
  see `/golf/join`, `/golf/(auth)/demo`) → use framer-motion's own
  `useReducedMotion()` directly. Safe: it doesn't change DOM structure, so
  a first-render mismatch (server assumes not-reduced; a real
  reduced-motion user's first client render already knows better) never
  surfaces as a hydration error — transition config isn't serialized into
  SSR HTML.
- **Structural branching** (rendering an entirely different JSX tree for
  reduced vs. not — what `MaskedReveal` and `PinnedScrub` do) → use
  `usePrefersReducedMotion` (`scroll/usePrefersReducedMotion.ts`) INSTEAD.
  It's a `useSyncExternalStore` hook with `getServerSnapshot` returning
  `false`, so the server AND the very first client render always agree
  (structurally identical), then React swaps in the real value right
  after hydration — zero console errors. Using framer-motion's
  `useReducedMotion()` for structural branching throws a real hydration
  mismatch for actual reduced-motion users (confirmed 2026-07-02 via
  Playwright's `page.emulateMedia({ reducedMotion: 'reduce' })`) since it
  resolves `matchMedia` synchronously on the first client render, before
  the server's motion-unaware markup has been reconciled.
- **Known gap, left for downstream lanes**: the simple `whileInView`
  reveals inside the M1/M2/M5/M6/M7/M8 moment stubs don't check
  reduced-motion at all yet (framer-motion's `whileInView`/`initial`
  animate unconditionally unless wrapped in `<MotionConfig
  reducedMotion="user">` or checked explicitly) — they're STUBS, and each
  owning lane should apply the prop-only pattern above when it replaces
  that file. Don't add a blanket `<MotionConfig reducedMotion="user">` to
  `LenisRoot` without re-testing for hydration mismatches first — it
  routes through the same synchronous-`matchMedia`-on-first-render
  mechanism as `useReducedMotion()` and would likely spread the same
  issue to every `m.*` element on the page, not fix it.

## Scroll primitives

- **`LenisRoot`** (`scroll/LenisRoot.tsx`) — the ONE Lenis instance,
  mounted once in `src/app/page.tsx`. `lerp: 0.09`. Disabled (native
  scroll) on `prefers-reduced-motion` and coarse-pointer/touch. **Never**
  nest a second Lenis instance (or the dashboard's `useSmoothScroll`/
  `SmoothScroll`) inside this tree. It ALSO wraps children in the ONE
  `<LazyMotion features={domAnimation} strict>` the whole landing tree
  needs — every moment uses framer-motion's `m.*` components (not
  `motion.*`), and `m.*` silently no-ops every animation prop without a
  `LazyMotion` ancestor (see `src/app/golf/admin/_motion-provider.tsx`
  for the same pattern elsewhere in the repo). `strict` mode means a
  stray `motion.*` import anywhere in this tree throws — use `m.*`.
- **`useScrollProgress<T>(options?)`** (`scroll/useScrollProgress.ts`) —
  returns `{ ref, progress, rawProgress }`. `progress` is a
  spring-smoothed `MotionValue<number>` (0→1) unless `smooth: false`.
  Feed `progress` into `useTransform` — transform/opacity only.
- **`PinnedScrub`** (`scroll/PinnedScrub.tsx`) — `height: Nvh` outer +
  `position: sticky` inner, render-prop `children(progress)`. Under
  `prefers-reduced-motion`, renders unpinned with `progress` frozen at
  `1` — design your `children` render so `progress === 1` is a coherent
  final frame (M3 does this: last screen landed, phone in place).
- **`MaskedReveal`** (`scroll/MaskedReveal.tsx`) — serif line write-in.
  Pass `lines` (array of `ReactNode`, one per visual line). Omit
  `progress` for a `whileInView` one-shot entrance (M1, M2 use this);
  pass a `PinnedScrub`-sourced `progress` MotionValue to scrub-link the
  write-in to scroll instead (available for a future M3-style caption
  paragraph — M3's own captions are scrub-linked inline rather than
  through `MaskedReveal` since they're mutually-exclusive per-screen
  lines, not an additive paragraph; see that file's comments).

## M3 · Product Cinema — film-strip architecture (rebuild 2026-07-02)

Nick called the original crossfade-panels + progress-dots version "vibe
coded and basic as hell." The rebuild (Fable spec) replaces the
composition — not the primitives underneath — with "film through a
projector, hardware on a desk." Read `M3ProductCinema.tsx`'s own file-header
doc comment for the full component-by-component breakdown; this section is
the contract downstream lanes should hold to if they touch the file again.

- **The screens are live interactive component replicas, not
  screenshots** (2026-07-02, Fable spec — Nick: "the mockups are basic and
  don't look like my app" / "I want interactive mockups not screenshots").
  See "Screen replica contract" below for the full write-up — the short
  version: each screen is a real JSX component under `screens/` that
  studies the actual product surface it depicts and animates its own
  content in when its dwell window engages, built to the `M5Intelligence.tsx`
  signal-card replica's quality bar.
- **Film column, not a crossfade.** `FilmColumn`/`FilmSlab` — the three
  desktop screens are ONE absolutely-positioned `height: 300%` column
  inside the frame's screen well. Its `y` steps 0% → -33.333% → -66.667%
  (of its OWN height — that's exactly two well-heights of travel) across
  two handoff windows, holding still (dwell) between them. **Opacity never
  crossfades between screens** — they physically push each other out.
  Opacity is reserved for exactly two things: the dock-in and the ledger
  captions (never the screens themselves) — don't reintroduce a
  screen-to-screen fade here.
- **One timing map drives four surfaces.** The named progress constants at
  the top of the file (`DOCK_END`, `SCREEN0_HOLD_END`, `HANDOFF_01_END`,
  `SCREEN1_HOLD_END`, `HANDOFF_12_END`, `SCREEN2_HOLD_END`, plus the phone's
  `PHONE_ARC_START`/`PHONE_ARC_END`) are the single source of truth for:
  the column's dwell/handoff steps, each slab's depth-parallax counter
  motion, the ledger caption crossfade, and the phone arc + frame
  "rebalance" window. If a future lane retimes the scrub, change these
  constants only — don't hand-tune a duplicate window somewhere else in
  the file.
- **Hardware, not a bare rectangle.** `HardwareShell` is the shared
  presentational primitive (outer `fl-glass-2` shell, inset screen well,
  and either a webcam-style dot (`variant="monitor"`) or a notch
  (`variant="phone"`)) — both the scrubbed `HardwareFrame` and
  `StaticCinema`'s stacked fallback wrap around it, so the two paths can't
  drift apart. The frame's base reflection (a soft cream gradient strip,
  `scaleY(-1)`) replaces the old shadow-blob idiom — don't reintroduce a
  drop-shadow here.
- **Ledger captions replace the progress dots.** `ProgressDot` is gone —
  don't resurrect it. `Ledger`/`LedgerEntry` render a left-anchored,
  numbered (`01`/`02`/`03`, `font-annual`) caption block below the frame,
  sharing the frame's `max-w-4xl`. A brass rule draws in (`scaleX`,
  origin-left) and the caption writes in through the existing
  `fl-line-mask` pattern — both driven by the same per-screen
  "activeness" `MotionValue` (0→1) that comes from the handoff windows
  above, not a separately-tuned clock.
- **The phone is a co-star, not a sticker.** `PhoneArc` docks late
  (`[PHONE_ARC_START, PHONE_ARC_END]` = `[0.60, 0.78]`) with a curved
  trajectory: x/y/scale ease in while `rotate` overshoots past level
  (10° → -1.5° → 0°) rather than settling linearly. It overlaps the
  frame's lower-right edge, above it in stacking order (`z-20` vs. the
  frame's `z-10`). The main frame eases `x` by -2% over the same window
  on the SAME transform as its dock-in scale/y (one element, one
  `style={{ scale, y, x }}` — not a second wrapper) — "the desk
  rebalances to make room."
- **No cream veil — M3's predecessor is now M4, not M2.** An earlier
  `CreamVeil` (a full-band `var(--fl-cream)` overlay at opacity 1 at
  progress 0, lifting across the first sliver of scrub) existed so M2's
  cream could hand off into this section's sage-ink depth as a camera
  move rather than a hard cut. The foundation lane's page-order change
  ("M4 two-fields moves ahead of M3", Nick A-override) put M4's
  dark-grounded two-fields photography directly before M3 instead —
  with a dark predecessor, that same veil would flash cream at the seam.
  Removed entirely (2026-07-02): the sage-ink band now flows straight
  from M4's own dark grounding with no handoff layer. Don't reintroduce
  a cream veil here unless M3's predecessor moment changes back to a
  cream/light one — check the current page order in `src/app/page.tsx`
  first. The frame's existing dock-in (`HardwareFrame`'s `scale`/`y` over
  `[0, DOCK_END]`) still supplies the section's only entrance motion.
- **`noUncheckedIndexedAccess` traps, already worked around** — worth
  knowing if you touch this file again: `SCREENS` is typed as a literal
  3-tuple (not `CinemaScreen[]`) specifically so `Ledger`'s
  `SCREENS[0]`/`[1]`/`[2]` literal-index reads stay exact; the multi-input
  `useTransform([mvA, mvB], (values) => ...)` calls need explicit
  `useTransform<I, O>(...)` type arguments (the overload can't infer `I`
  from its union input-array type) and `values[n] ?? 0` defaults (array
  indexing is `T | undefined` under this flag even on a statically
  two-element array).
- **Static fallback holds the same design language.** `StaticCinema`
  wraps all four screenshots (three desktop + Lift Lab) in the same
  `HardwareShell` chrome and gives each its own numbered ledger caption
  (`StaticLedgerEntry`) — no dots, no motion, reads as one coherent system
  with the scrubbed version rather than a simplified stand-in.

## Photo asset contract

`public/marketing/first-light/photos/{hero,golf,baseball.jpg,mist}.jpg`
are the REAL photography paths, ultimately sourced by a parallel lane.
**Never** render photography as a plain `<img>`/`next/image` for these
hero backgrounds — a 404 shows a visibly broken image. Use
`photoLayerStyle({ src, fallbackGradient })` (`lib/photoBg.ts`): it
returns a `backgroundImage` with the gradient UNDER the photo `url(...)`
layer, so a missing file just leaves the graded gradient showing — always
on-brand, never broken. Every moment that uses photography (M1, M4, M8)
already does this; keep the pattern when you replace those files.

**Placeholder files checked in by this lane:** to keep the dev console
clean (zero 404s) during this PR's live verification, this lane generated
lightweight graded-gradient JPGs at all four paths (`scripts` used:
Pillow, one-off, not committed as a script). They are intentionally
generic — the parallel photo lane should overwrite them in place with
real graded photography; no code changes are needed on either side, it's
a pure asset swap.

## Screen replica contract

**Superseded 2026-07-02 (Fable spec, Nick escalation — "the mockups are
basic and don't look like my app" / "I want interactive mockups not
screenshots").** M3's four screens (Command Center, Stats Center, Decision
Room, and the Lift Lab phone) were Pillow-rendered PNGs at
`public/marketing/first-light/screens/*.png` (deleted this pass — nothing
else referenced them; the stale `.gitignore` exemption for that path was
removed too). They are now **live JSX component replicas**:

| File | Depicts | Studied from |
|---|---|---|
| `screens/CommandCenterScreen.tsx` | Coach Command Center | `command-center/CommandCenterFairway.tsx` |
| `screens/StatsCenterScreen.tsx` | Baseball box score | `stats-center/StatsCenterClient.tsx` |
| `screens/DecisionRoomScreen.tsx` | CoachHelm signal list | `insights/EvidencePanel.tsx`'s confidence pill + `M5Intelligence.tsx`'s signal card |
| `screens/LiftLabScreen.tsx` (phone) | Player Lift Lab | `performance/PlayerLiftHomeClient.tsx` |
| `screens/shared.tsx` | `KELLY`, `ScreenEyebrow`, `RollingStat`, `rowVariants`/`containerVariants`/`barVariants` | shared write-in plumbing, not a per-surface concern |
| `screens/useScreenActive.ts` | `MotionValue<number>` → one-way sticky boolean | drives the `active` prop below |

**The study-the-real-surface rule.** A replica is a faithful MINIATURE of
the real product surface — not a generic dashboard mockup with the right
color palette. Before touching any of these files, read the actual
page/component it depicts (table above) and note its real layout idioms
(masthead grammar, card shapes, data presentation), not just its colors.
The bar is `M5Intelligence.tsx`'s signal-card replica (Nick-approved,
predates this pass) — match that level of faithfulness, not the
"dignified neutral placeholder" bar the old PNGs settled for.

**Props.** Every replica takes `ScreenReplicaProps` (`screens/shared.tsx`):

- `active: boolean` — this screen's dwell window is (or has been)
  engaged. `M3ProductCinema.tsx` derives one `active` boolean per screen
  from the SAME `activeness`/handoff `MotionValue`s the ledger captions
  already use (`useScreenActive`, a one-way sticky conversion — once a
  screen crosses the engagement threshold it stays "written in" even if
  the user scrubs back past it; per spec, reversal on scrub-back is fine
  to leave as completed-state, so this never flips back to `false`).
  Flipping `active` stages the content's write-in: rows stagger up
  (opacity/y via framer-motion variant orchestration, `rowVariants`/
  `containerVariants`), figures roll via `RollingStat` (a rAF-tweened
  reimplementation of `ui/animated-number.tsx`'s odometer idiom, since
  `AnimatedNumber`'s own mount-roll doesn't fit here — these screens mount
  once, inside the always-mounted `FilmColumn`, and need to roll on the
  `active` FLIP, not on mount), and confidence/meter bars scaleX in
  (`barVariants`).
- `instant?: boolean` — renders the fully-resolved end state immediately,
  zero animation. `StaticCinema` (mobile + `prefers-reduced-motion`) passes
  `active instant` — the structural reduced-motion fork already happened
  one level up (per the "Reduced-motion: two valid patterns" section
  above), so the replicas don't re-detect it themselves.
- `className?: string` — merged via `cn()`; callers pass `h-full w-full`.

**Palette + kelly.** Cream paper (`--fl-cream`/`--fl-cream-high` gradient),
sage-ink type (`--fl-sage-ink`), brass hairlines (`.fl-rule`) throughout —
first-light's OWN tokens, never the baseball Living-Annual kit's scoped
CSS vars (`--grade-plus`, `--hairline`, etc. only resolve inside
`.living-annual`; importing those classes here would silently break
outside that scope). `font-annual` (Space Grotesk) is reserved for
tabular figures only (`RollingStat`, box-score digits) — matching
`StatReadout.tsx`'s real "ODOMETER TRUTH" convention, not applied to
eyebrow labels. **Kelly (`#16A34A`, `KELLY` in `shared.tsx`) appears only
as tiny accents inside these four files** (roster sync dot, live-inning
dot, confidence pill/bar, meter fill) — legitimate per the sage/cream
amendment's kelly-demotion carve-out, since these ARE simulated product
screens (content), not landing chrome. Never reach for `KELLY` outside
`screens/`.

**Wiring.** `FilmSlab` (the scrub path) and `StaticCinema` (the static
path) both render these components directly as children/JSX — no more
`<Image>`, no more `photoBg.ts` tint layer (that pattern existed to cover
an async image load; these are synchronous component renders, so the
"never flash empty/dark" concern it solved no longer applies). A real
future integration (real product screenshots, if ever wanted again) would
be a revert of this section, not an asset swap — these are not
placeholder-shaped the way the old PNGs were.

## Motion discipline (recap — see CLAUDE.md + this repo's motion rules)

- Transform/opacity only for anything scroll-linked.
- `position: sticky` for pinning (never JS-measured pin plugins here —
  no GSAP dependency in this scaffold).
- `prefers-reduced-motion` → fully static, final-state DOM. Every
  primitive in this scaffold (`LenisRoot`, `PinnedScrub`, `MaskedReveal`)
  already handles its own reduced-motion branch; moments built on top
  should lean on that rather than re-implementing the check, except for
  simple `whileInView` reveals (framer-motion's `useReducedMotion`
  pattern used throughout M1/M2/M5/M6/M7/M8 — copy that pattern for new
  reveals).
- At most 2 `backdrop-blur` layers per viewport.
- Ease: the house `[0.16, 1, 0.3, 1]` cinematic-settle curve (mirrors
  `EASE_GLIDE` in `src/components/baseball/living-annual/motion.ts`) or
  `cubic-bezier(0.22, 0.7, 0, 1)`. Never invent a new easing curve.

## CTA architecture (already wired in the stubs — keep these targets or
update deliberately)

- **"See it in action"** (sage-deep `--fl-sage-deep`, primary — repointed
  2026-07-02, was kelly green) → `/golf/demo` (the real, live self-serve
  product demo — not a dead button).
- **"Join your team"** (ghost / `fl-glass-1`) → `/golf/join` (real
  invite-code entry page).
- M4 portal cards → `/products#golfhelm`, `/products#baseballhelm`.
- M9 footer → real `/golf/login`, `/baseball/login`, `/golf/signup`,
  `/baseball/signup`, `/privacy`, `/terms` — no golf-only bias, no dead
  "Request Demo" button.

If a downstream lane wires a calendar-link demo-request flow instead
(per the design doc's "demo request w/ calendar" CTA architecture note),
update this section and keep both a functioning fallback for JS-disabled
contexts.

## `src/app/page.tsx`

Preserves: the `metadata` export, `<NativeRedirect to="/golf/login" />`,
and the skip-to-content link (`id="main-content"` target). Composes
`LenisRoot` wrapping `M1Hero` → `M9Footer` in order. Imports
`first-light.css` directly (not through `globals.css`). The old
`Hero`/`Footer`/`SmoothScroll` components are left on disk, unused —
don't delete them from this lane (out of scope; another lane's call).

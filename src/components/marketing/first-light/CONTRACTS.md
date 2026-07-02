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
| `moments/M3ProductCinema.tsx` | `landing-cinema` | STUB — replace in place |
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
Tailwind utility alongside the `fl-glass-*` class and it wins (`PhoneArc`
in M3ProductCinema does this — `className="fl-glass-2 ... absolute ..."`).
Don't reintroduce a plain (non-`:where()`) `position` rule on `.fl-glass-*`
— confirmed 2026-07-02 that broke exactly this case.

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

## IMMACULATE utilities (⚠ AMENDMENT 2, `first-light.css`)

Added by the foundation lane 2026-07-02 PM per the ⚠ AMENDMENT 2 —
IMMACULATE section of `docs/LANDING_ENTRY_WORLD_DESIGN.md` (Nick: "I
don't want basic cards and basic components… we did research on this,
we need to use it"). Translates
`docs/redesign/marketing-overhaul-2026-06-18/research/04_premium_aesthetic_system.md`
to sage & cream. Same edit-with-care rule as the rest of this file —
grep `fl-aurora\|fl-light-pool\|fl-cta-glow\|fl-card\|fl-gradient-ring\|fl-link-underline`
before restyling.

| Utility | Recipe | Consumer (per Amendment 2's M-moment map) |
|---|---|---|
| `.fl-aurora` | Cream field + 4 low-chroma sage radial blobs (the brightest blob is cream, not cream-high — §D2), optional 32s drift | Page/section background behind **M2, M5, M6, M7** (§A.1) |
| `.fl-light-pool` | Radial **cream** pool (§D2 — was cream-high), blurred, `position: absolute` default | Behind hero copy + section anchors: **M2** statement, **M5** signal card, **M7** stats (§A.2) |
| `.fl-cta-glow` | Sage bloom `::after`, opacity 0→1 on hover/focus-visible | Primary CTAs only: **M1** + **M8** (§A.3, §B.8) |
| `--fl-shadow-xs/sm/md/lg` + `--fl-specular` | Stacked warm shadows + 1px cream-high top highlight (the ONE cream-high fill §D2 still allows — a hairline, not a fill) | Every elevated light surface sitewide (§B.5) |
| `.fl-card` + `.fl-card-lift` | Top-edge cream-high → cream gradient (18% stop, §D2 — was a flat cream-high fill), specular + ring, hover swell | **M6**'s three vignettes (converted from `.fl-glass-2`, §B.6) + any other solid card |
| `.fl-gradient-ring` | Masked 1px conic ring (sage-deep → sage → brass → sage-deep) | **M5**'s signal card ONLY — the page's single gradient-ring moment (§B.7) |
| `.fl-link-underline` | Sage-deep 2px wipe on hover/focus-visible | Footer + nav text links (§B.10) |
| `.fl-grain` (flipped) | `mix-blend-mode` overlay → multiply | Sitewide standalone grain plate (§A.4) — glass-baked grain (`.fl-glass-*::before`) unchanged |

**Budgets (Amendment 2 §E final gate — Fable judges rendered frames
against this, code review alone does not pass a moment):**
- ≤2 `.fl-glass-*` layers per viewport (unchanged, existing rule above).
- ≤2 sage glows per viewport — every `.fl-cta-glow` instance counts.
- Exactly ONE `.fl-gradient-ring` per page (M5's signal card).
- Exactly one hero moment per viewport-story.
- Grayscale test, effects-off test, squint test, 8px audit,
  reduced-motion audit all pass.

### §D2 — MORE CREAM, NO WHITE (2026-07-02, Nick directive — overrides
anything lighter elsewhere in this doc or the design doc)

Nothing larger than a 1px specular/hairline may render at or near white
(`#FFFFFF` or `--fl-cream-high` `#FBF9F2` as a FILL). `--fl-cream-high` is
demoted to exactly three uses: **1px specular lips** (`--fl-specular`,
`.fl-glass-*`'s brass top edge-light is unaffected — that's brass, not
cream-high), **text-on-dark** (e.g. button labels on `--fl-sage-deep`),
and **≤2px accents**. Every other light surface uses `--fl-cream`
(`#F5F1E6`) or warmer — never cream-high, never white.

Fixed in this pass (foundation lane, `first-light.css`):
- `.fl-card` background — was a flat `var(--fl-cream-high)` fill; now
  `linear-gradient(180deg, rgba(var(--fl-cream-high-rgb),0.55) 0%,
  var(--fl-cream) 18%)` — only the top edge catches light, body reads
  true cream.
- `.fl-light-pool` — was `rgba(var(--fl-cream-high-rgb), 0.9)`; now
  `rgba(var(--fl-cream-rgb), 0.9)`.
- `.fl-aurora`'s brightest blob (bottom-left, §A.1) — was
  `rgba(var(--fl-cream-high-rgb), 0.9)`; now `rgba(var(--fl-cream-rgb),
  0.9)`.

Left as-is (both are the hairline/text-on-dark carve-outs §D2 exempts):
- `--fl-specular` (`inset 0 1px 0 rgba(var(--fl-cream-high-rgb), 0.9)`)
  — a literal 1px inset highlight, the "80% move" recipe (§B.5). Do not
  demote this one — a cream specular lip reads as no light at all.
- Any cream-high used for text color on a sage-deep/sage-ink background
  (button labels, CTA text) — text-on-dark is explicitly allowed.

**Rule for every downstream lane:** before adding a new cream-high fill
anywhere under `src/components/marketing/first-light/`, ask "is this
bigger than a 1px lip and not text-on-dark?" — if yes, use `--fl-cream`
instead. Grep `cream-high` in your file before shipping a new surface.

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

## Screenshot asset contract

`public/marketing/first-light/screens/` — real Living-Annual product
screenshots for M3's product-cinema sequence, sourced by the
`landing-cinema` lane. Until they land, M3 renders labeled gradient
placeholder panels (`Command Center` / `Stats Center` / `Decision Room`).
Swap in real screenshots the same way `photoBg.ts` is used elsewhere: a
solid/gradient panel behind, an `<Image>` on top, sized so a slow load or
missing file never collapses the frame's layout (fixed aspect-ratio
container, `object-cover`).

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

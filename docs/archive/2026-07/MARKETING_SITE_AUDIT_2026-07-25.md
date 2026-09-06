# Marketing site audit — "remove anything that feels vibe coded"

**Date:** 2026-07-25
**Brief:** audit and improve the marketing site to remove vibe-coded /
template-like feel — replace generic icons, number badges and vague SaaS
phrases; make GolfHelm the clear flagship; sharpen the hero to outcome +
audience; single strong "Request Demo" CTA; rewrite generic copy into specific
coach outcomes; cohesive, premium, muted, product-derived marks. Across landing,
products, about, pricing.

---

## Headline: the premise mostly does not hold any more

I audited for each named tell before changing anything. **The marketing site is
not vibe-coded.** The PR #1026 landing ship (2026-07-23) already removed this
class of problem. Measured across `src/components/landing`,
`src/components/products`, `src/app/{page,products,about,pricing}`:

| Tell the brief names | Found |
|---|---|
| Number badges (`01` / `02` / `03`, step counters) | **0** |
| Stock icon imports (`lucide-react` etc.) | **0** |
| Vague SaaS phrases (seamless, unlock, empower, leverage, robust, world-class, supercharge, all-in-one, …) | **0** |
| Clip-art / SVG scenery illustration | **0** — the hero is graded course photography |

So a sweeping rewrite would not be removing template-ness; it would be
re-litigating a design that shipped two days ago and was approved. I did not do
that. What follows is what genuinely diverged from the brief, and what I fixed.

---

## Fixed

### One CTA verb across the site

`Request Demo` appeared at 15 call sites; the pricing page's submit button was
the single outlier reading **"Set up a call."** Now unified — 17 × "Request
Demo". Its helper copy was realigned to match ("Request a demo and we'll walk
your program through it — rounds, stats, and what your roster looks like inside
Helm") so the button and the sentence above it agree.

Two non-CTA strings deliberately left alone, because neither competes for the
conversion:

- `Explore GolfHelm` — a quiet text anchor in the hero, not a button. It also
  *serves* the flagship goal by pointing at GolfHelm specifically.
- `Get started` — an uppercase mono section eyebrow in
  `products/landing/sections/FinalCta.tsx`, not a button.

---

## Verified already satisfied — no change needed

**GolfHelm is already the clear flagship.** The hero subhead names it ("The
operating system for college golf"), the only secondary link is "Explore
GolfHelm", and the first product section after the thesis is the GolfHelm
`DashboardReveal`.

**The hero already leads with outcome + audience.** *"Command every angle of
your program"* / *"The operating system for college golf — where every round,
shot, and stat resolves into your next coaching decision."* Audience is named
explicitly; the outcome is the next decision. Sharpening this further is a taste
call on approved work, and the standing rule is to get one hero band approved
before rebuilding it — so it is left as shipped.

**Pricing is already specific and honest** — no tiers, no fake table, one
editorial statement plus one email field, with an accessible success state and a
honeypot. Its AA note is correct: `accent-600` is used rather than the raw helm
green because `accent-500` is only 2.67:1 on the champagne canvas.

**Products' green is not a second green system.** I suspected one and was wrong:
`products-landing.module.css:25` sets `--accent: var(--fw-color-accent-600)`,
correctly aliasing the canonical token.

**There is no dark-mode bug on marketing.** `products/` hardcodes
`--canvas` / `--surface` / `--line` as byte-identical copies of the Fairway
tokens, which would strand it in dark mode — but no `.dark` class is applied on
any marketing route (not in `src/app/layout.tsx`, not in `MarketingShell`). The
marketing site is light-only, so this is dead risk, not a live defect. Worth
knowing if marketing ever gains a theme toggle.

---

## Open finding, deliberately NOT fixed blind: 23 raw green literals in `products/`

`src/components/products` uses **zero** Fairway token classes (vs 110 uses in
`src/components/landing`) and styles inline against its own `.root` vars. That
was a deliberate choice — the module header states the OKLCH palette is carried
"verbatim … so the page is pixel-faithful to the mock" — so the architecture
itself is not a defect to unilaterally undo.

But **23 raw green literals bypass `--accent`**, and about six of them are
hand-picked greens that are not on the Fairway ramp:

| Value | Sites |
|---|---|
| `oklch(0.82 0.11 150)` | `CoachHelm.tsx:104,136,147` |
| `oklch(0.92 0.04 150)` | `LiveRound.tsx:83,115,125` |
| `oklch(0.72 0.132 150)` | `LiveRound.tsx:13,70` |
| `oklch(0.724 0.132 150)` | `FinalCta.tsx:30` |
| `oklch(0.44 0.11 150)` | `LiveRound.tsx:108` |
| `oklch(0.28 0.1 150/0.22)` | `ProductsIntro.tsx:106` |
| `oklch(0.648 0.149 149.6/…)` (accent-500 hardcoded) | `Hero.tsx:23`, `FinalCta.tsx:26`, `CoachHelm.tsx:100,104,147`, `products-landing.module.css:50` |

This is the one real "marks aren't cohesive" finding. **I did not swap them
blind.** Several sit on dark washes where the correct token is the `.dark`-scoped
`--fw-color-accent-700` (`oklch(0.800 0.115 150)`), which is not reachable from
light context; picking the right replacement per site needs the rendered page,
and the standing rule is to reproduce the real view before changing it. A blind
23-site colour swap on a shipped, liked page risks regressing it for no
functional gain.

**Recommended next step:** one pass with the page open — introduce
`--accent-on-dark` and `--accent-wash-*` vars on `.root`, map each of the 23
sites to the nearest ramp step, and confirm visually band by band.

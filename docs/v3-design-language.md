# GolfHelm v3 Design Language

> Locked 2026-05-26. The bones are the three manifestos the founder
> issued: **The Death of Flat UI**, **The Ultimate Premium UI Doctrine**,
> and **The Premium UX Philosophy System**. This doc encodes those
> principles into concrete tokens, primitives, and rules — so every
> future agent picks up the same vocabulary and the system doesn't
> drift back into "shipped" mediocrity.
>
> **The product is not a webpage. It is an emotionally intelligent
> computational environment.**

---

## Audience truths (why coherence matters here)

The product runs across two very different surfaces — and both must feel like the **same physical universe**:

### Coach desktop · 27" iMac, 7am with coffee
- Wants to feel **calm**, **in control**, **respected by the tool**.
- Density: more whitespace. Slower motion. Editorial typography.
- Mood: New York Times morning edition crossed with a Whoop coach app.

### Player phone · iPhone 15, on the team bus
- Wants to feel **seen**, **encouraged without being coddled**, **inside premium gear**.
- Density: tighter, but uses the *same* materials + motion grammar.
- Mood: Strava / Garmin / Whoop tier — high-end performance tech.

Both share the same surface system, same motion language, same lighting. They differ only in pacing + density.

---

## Doctrine I — The Death of Flat UI

| Manifesto principle | v3 implementation |
|---|---|
| Depth, translucency, atmosphere | `surface-stone` (5-layer warm shadow plinth) / `surface-matte` (mid-content) / `surface-lift` (Liquid Glass float) |
| Layered, suspended, luminous | Inset top hairline + composed shadow scale → every elevated surface has a "machined upper edge" catching light |
| Motion > color | One canonical motion library, one cubic-bezier curve, four duration tiers — applied across every v3 surface |
| Restraint | Eyebrow at 11px tracking-0.14em uppercase / heading at 17-32px tracking-tight / body at 15-17px relaxed; never a third type role on the same surface |

**Where it lives in code:**
- Surface materials: `src/app/globals.css` → `.surface-stone`, `.surface-matte`, `.surface-linen`, `.surface-lift`, `.surface-hairline`, `.v3-lift`
- Motion: `src/lib/coachhelm/v3/motion.ts`
- CSS motion vars: `:root --v3-ease-cinematic`, `--v3-ease-tap`, `--v3-duration-{micro,short,medium,long}`

---

## Doctrine II — The Ultimate Premium UI Doctrine

### Liquid Glass tier

Every floating surface (chat drawer, tooltip, modal, command palette) uses `surface-lift`:

```css
.surface-lift {
  background:
    linear-gradient(180deg,
      hsl(45 22% 99% / 0.86) 0%,
      hsl(42 18% 96% / 0.82) 100%);
  backdrop-filter: blur(28px) saturate(1.05);
  border: 1px solid hsl(40 14% 84% / 0.45);
  box-shadow:
    inset 0 1px 0 hsl(45 22% 100% / 0.6),       /* machined upper edge */
    0 1px 2px hsl(42 14% 22% / 0.06),            /* contact shadow */
    0 12px 28px hsl(42 16% 22% / 0.14),          /* ambient */
    0 40px 80px hsl(42 16% 22% / 0.10);          /* atmospheric */
}
```

Three optical effects compose the feel: (1) heavy backdrop-blur so what's behind diffuses cleanly; (2) inset top hairline implying a machined edge catching ambient light; (3) directional drop shadow biased downward + slightly right (light source at roughly 10 o'clock — consistent with the rest of the v3 surface system).

### Spatial layering

Z-depth is felt through **shadow + composition**, not borders. Three "pressures":

| Tier | Material | When |
|---|---|---|
| Plinth | `surface-stone` — heaviest, opaque cream gradient + 5-layer shadow | Hero headers, page-level plinths |
| Card | `surface-matte` — mid translucency, gentle blur | Content rows, sections |
| Lift | `surface-lift` — full Liquid Glass | Floating UI — drawers, tooltips, command palettes |

### What we explicitly defer

The manifesto names WebGPU, WGSL shaders, R3F, Gaussian splatting, and neural rendering as the next-gen frontier. **Not shipped tonight.** They would add 200KB+ of runtime for atmospheric gains the current users (coaches on MacBooks) wouldn't feel. Future v3.5 wave when a flagship surface (e.g., a 3D player genome scene) justifies the bundle.

---

## Doctrine III — The Premium UX Philosophy

### "Everything has mass"

Every interactive element enters space with weight, not pop-in.

- Buttons: `whileHover={liftHover}` (2px translateY, soft shadow growth — never scale).
- Cards: `surface-matte` + `v3-lift` class → CSS transform-based lift on hover.
- Press feedback: `whileTap={tapPress}` (scale 0.97, 120ms, ease-tap).
- Entrances: `enterVariants` + `enterTransition` (8px rise + fade, 440ms cinematic).
- Hero reveals: `heroVariants` + `heroTransition` (12px rise + fade, 680ms cinematic).

### "Continuity of perception"

- **Lenis smooth scroll** mounted at the dashboard layout root via `SmoothScrollMount`. Hook gates on coarse-pointer + reduced-motion so mobile + accessibility users keep native behavior.
- **AnimatePresence** wraps every conditional render in v3. Components fade out, not snap.
- **State pills crossfade** when state changes (SelectionStateBar). The coach sees the new state arrive, not replace.
- **Optimistic UI** in ChatDrawer — the user bubble appears instantly on send, rolls back on error.

### "Attention is sacred"

Visual weight is intentional:
- **Eyebrow** (11px uppercase tracking-0.14em warm-500) → ambient context
- **Heading** (17-32px font-medium tracking-tight warm-900) → primary
- **Body** (15-17px leading-relaxed warm-800) → content
- **Empty hint** (sm warm-400 italic) → never bold, never alarming
- **Active state** primary-50 wash + primary-600 fill (helm green)
- **Critical** firm warm-900 contrast — used sparingly

### "Calm confidence"

Restraint by default:
- Two type roles per surface max
- Larger spacing on coach surfaces (`p-6 md:p-8`), tighter on player phone (`p-5 md:p-7`)
- Slower transitions on hero reveals (680ms), snappier on UI swaps (280ms)
- Empty states are italic warm-400 — never bold, never CAPS, never alarming color

### "Motion has meaning"

Every transition answers: where did this come from, where is it going, what changed? Examples:

- **Drawer slides from right** because that's where the launcher is — spatial continuity.
- **Polygon scales up from origin** on the radar — implies "growing into your shape", not "appearing."
- **Tool-call pill appears in line** with the assistant message — shows the agent's work, doesn't hide it.
- **Coach pick "Save" button has a green-tinted drop-shadow** — implies the action will commit, not just dismiss.

### "Interaction should feel rewarded"

Magnetic hover + depth compression on press. Every interactive surface in v3 uses the canonical:

```tsx
<m.button
  whileHover={liftHover}   // -2px y + shadow growth
  whileTap={tapPress}      // scale 0.97
  className="... shadow-[0_8px_18px_-10px_rgba(22,163,74,0.55)] ..."
>
```

The shadow color is keyed to the action color (helm green for primary, warm for neutral, violet for picks). Subconscious continuity.

### "Reduce invisible friction"

- ChatDrawer empty state has **three quick-prompt chips** so the coach doesn't have to invent their first question.
- HeroNarrativeCard shows **fallback text on mount** — never empty, even before the LLM resolves.
- Practice Rx parser **drops hallucinated drill ids** — the coach never sees a fabricated drill they can't open.
- QualifyingBoard's "Confirm selection" button **tooltip-explains** why it's disabled, instead of just looking dead.

### "Designed, not generated"

Every screen has a **header plinth** with eyebrow + heading + meta. Every list has **divide-y hairlines** at 0.4 alpha, not 1.0 borders. Every dim card has an **8-cell quintile bar** filled in helm green — same visual language across the genome dimension grid and the (future) team-stat surface.

---

## Canonical motion library

`src/lib/coachhelm/v3/motion.ts` exports the entire vocabulary. **No v3 surface should import a raw cubic-bezier or define its own duration.**

### Easing curves

| Token | Curve | Use |
|---|---|---|
| `EASE_CINEMATIC` | `cubic-bezier(0.16, 1, 0.3, 1)` | Entrances + content swaps |
| `EASE_TAP` | `cubic-bezier(0.32, 0.72, 0, 1)` | Taps + hovers (settles faster, no overshoot) |

### Durations

| Token | ms | Use |
|---|---|---|
| `DURATION.micro` | 120 | Tap feedback, hover state change |
| `DURATION.short` | 280 | Small content swap, toggle, badge in/out |
| `DURATION.medium` | 440 | Section enter, panel transitions |
| `DURATION.long` | 680 | Hero reveal, page enter |

### Stagger

70ms between sibling entrances — feels like a wave, not a stutter. Use `stagger(i)` helper.

### Variants

| Variant | Use |
|---|---|
| `enterVariants` + `enterTransition` | Section enter — 8px rise + fade, 440ms |
| `heroVariants` + `heroTransition` | Hero — 12px rise + fade, 680ms |
| `liftHover` | Hover target — 2px rise + shadow growth |
| `tapPress` | Tap target — scale 0.97, 120ms |
| `drawerVariants` + `drawerTransition` | Drawer slide-in/out — 420ms |
| `crossfadeVariants` + `crossfadeTransition` | Content swap — 280ms |
| `badgeVariants` + `badgeTransition` | Pill / badge in-out — scale + fade, 280ms |
| `backdropVariants` + `backdropTransition` | Modal/drawer backdrop fade |

---

## Surface system

| Class | Material | Use |
|---|---|---|
| `.surface-stone` | Heaviest, opaque cream gradient + 5-layer warm shadow + inset machined upper edge | Hero plinths, page headers |
| `.surface-matte` | Mid translucency, gentle backdrop blur, hairline border | Content rows, sections, cards |
| `.surface-linen` | Softest — solid linen fill + hairline ring, no blur | "Rooms" — full-bleed sections that should feel architectural |
| `.surface-lift` | **NEW** — Liquid Glass tier, heavy backdrop-blur + saturate + inset highlight + directional shadow stack | Floating surfaces (chat drawer, tooltip, modal) |
| `.surface-hairline` | Delicate divider variant (alpha 0.32 vs 0.6 on warm-200) | Inner section dividers — never the boxy `border-warm-200` |
| `.v3-lift` | Interactive transform + shadow growth on hover, return on active | Anything tappable that should physically respond |

---

## Color hierarchy

Color is used for **state**, never decoration.

| Role | Token | When |
|---|---|---|
| Background | `cream` / `warm-50` | Default canvas |
| Body text | `warm-900` | Primary readable text |
| Meta text | `warm-500` / `warm-600` | Eyebrows, captions |
| Ambient | `warm-400 italic` | Empty hints, deferred states |
| Hairlines | `warm-200/40` (via `surface-hairline`) | Inner dividers |
| Active | `primary-50` wash + `primary-600` fill | Selected, on, success |
| Critical | `red-50` bg + `red-700` text | Errors only |
| Warm-action | `amber-50` + `amber-700` | Scoring / closed state |
| Cool-action | `violet-50` + `violet-700` | Coach picks |

---

## Type scale

| Role | Mobile | Desktop | Tracking | Color |
|---|---|---|---|---|
| Hero `<h1>` | 30px medium | 32-40px medium | tracking-tight | warm-900 |
| Heading `<h2>` | 17px medium | 17-21px medium | tracking-[-0.012em] | warm-900 |
| Eyebrow — hero plinth | 11px font-serif uppercase | 11px font-serif uppercase | tracking-[0.16em] | warm-500 |
| Eyebrow — section | 11px font-medium uppercase | 11px font-medium uppercase | tracking-[0.14em] | warm-500 |
| Body | 15px | 15-18px | normal | warm-800 |
| Caption | 13px | 13px | normal | warm-500 |
| Tabular | 13px tabular-nums | 13px tabular-nums | normal | varies |

### Two eyebrow scales — by design

There are intentionally **two editorial eyebrow scales** in the system:

- **Hero plinth** (Fraunces serif, tracking-0.16em) — rendered by the existing `<PageHeader eyebrow="…">` primitive. The strongest top-of-plinth marker. Use for the eyebrow that introduces an entire page.
- **Section** (Geist sans, tracking-0.14em) — written inline in v3 surfaces. The smaller ambient marker for in-card section headings.

The hero scale predates v3 and ships with the existing `PageHeader` component. The section scale is the v3 vocabulary for everything inside a card. Use both correctly and they create a clear hierarchy (page → card → section).

---

## Premium primitives (future expansion)

Per the manifesto, these are the named primitives we should evolve toward. Tonight the v3 surfaces use combinations of `surface-*` classes and the motion library directly. As surfaces accumulate, factor into:

- **`LiquidSurface`** — wraps `surface-lift` with optional `tone` prop
- **`AmbientLayer`** — background atmospheric layer (volumetric blur + gradient)
- **`DepthContainer`** — explicit z-layer wrapper for parallax + focus planes
- **`GlowField`** — primary-50 wash + soft ring for active states
- **`MotionShell`** — page-level entrance wrapper, replaces ad-hoc `<m.div initial>` blocks
- **`OpticalCard`** — `surface-matte` + `v3-lift` + canonical Reveal
- **`MagneticButton`** — `whileHover={liftHover}` + colored drop-shadow keyed to action
- **`AICommandBar`** — chat-launcher pattern formalized

These are roadmap, not blockers. The classes + variants already do the work; the primitives just package them.

---

## What ships in this PR (premium polish pass)

### Foundation
- **`src/lib/coachhelm/v3/motion.ts`** — canonical motion library (8 variants + 4 durations + 2 easing curves + stagger helper)
- **`src/app/globals.css`** — `.surface-lift` (Liquid Glass tier), `.surface-hairline`, `.v3-lift`, CSS motion vars (`--v3-ease-*`, `--v3-duration-*`)
- **`src/components/golf/layout/SmoothScrollMount.tsx`** — Lenis smooth-scroll mount, gated on coarse-pointer + reduced-motion
- **Mounted Lenis** at the dashboard layout root

### Surface refactors (every v3 surface now speaks the canonical vocabulary)
- HeroNarrativeCard — canonical hero entrance + crossfade + badge variants + ✦ glyph
- GenomeRadar — animated grid rings + center dot + polygon glow filter + tooltip with series-colored dot + canonical durations
- GenomePersonaPanel — Reveal-staggered sections + glow rings on accent dots
- GenomeDimensionGrid — canonical stagger + score-bar scale-in + hover lift on tagged cards
- ChatDrawer — drawer/backdrop variants + Liquid Glass `surface-lift` + ✕ SVG close + quick-prompt chips with stagger + warm-900 backdrop blur
- QualifyingBoard — editorial eyebrow + Reveal staggered across 4 sections
- SelectionStateBar — pill crossfade on state change + ring on each state + magnetic buttons
- LeaderboardWithSlots — staggered row entrance + emerald gradient on top-N lock + emerald-glow lock dot + violet coach-pick dot
- CoachPickPanel — surface-hairline dividers + magnetic buttons keyed to action color + colored drop shadows + animated reasoning editor reveal
- NotificationPrefsClient — Toggle uses canonical CSS motion vars + primary-glow on checked + focus-visible ring

### Doctrine doc
- **This file** — encodes the three founder manifestos into v3 vocabulary so the next agent picks up the same language.

---

## What "wow they paid attention" actually means here

The premium feel doesn't come from any single effect. It comes from these invariants holding **everywhere**:

1. Every motion uses the same easing curve.
2. Every interactive surface lifts 2px on hover, presses 3% on tap.
3. Every elevated surface has a 1px inset top hairline.
4. Every eyebrow is 11px uppercase tracking-0.14em.
5. Every empty state is italic warm-400 + an icon.
6. Every accent dot has a 3px soft ring at 18% alpha of the accent color.
7. Every action button has a colored drop-shadow keyed to its action color.
8. Every hairline is 0.4 alpha, not 1.0.
9. Every floating surface uses `surface-lift` (Liquid Glass).
10. Every transition has a *reason* (state change, navigation, focus).

Coherence is the brand.

---

## Future v3.5 wave (deferred from tonight)

When a flagship visual surface justifies the bundle weight:
- WebGPU shader materials for real refraction (vs. CSS backdrop-filter approximation)
- React Three Fiber atmospheric backgrounds
- GSAP timelines for scroll-choreographed reveals
- Postprocessing.js bloom + depth-of-field passes
- Gaussian splatting for a 3D player genome environment

Until then, the CSS + Framer Motion stack covers 90% of the premium feel at <50KB of additional runtime cost. We get the look, we don't pay for it.

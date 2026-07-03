# Helm Sports Labs — Design System Reference
# For use with Pencil and any design tooling

> **Ground truth is code, not this file.** Every value below is a
> hand-copied snapshot of `tailwind.config.ts` and `src/app/globals.css`
> / `src/styles/tokens.css`. If this file and the config ever disagree,
> the config wins — treat that as a bug in this file and re-sync it.
> Last reconciled: 2026-07-03.

---

## Brand Identity

**Product:** GolfHelm — AI-powered college golf team management
**Aesthetic:** California-modern × neo-futurism — warm cream + helm green, matte sculptural surfaces, editorial typography
**Font:** Geist Sans (default UI sans, falls back to DM Sans) + Fraunces (serif accents, falls back to Playfair Display) — see Typography below

---

## Color Palette

### Primary Brand — Helm Green (`primary-*` in Tailwind)
| Token | Hex | Usage |
|-------|-----|-------|
| primary-50 | #f0fdf4 | Lightest tint, subtle backgrounds |
| primary-100 | #dcfce7 | Hover tints |
| primary-200 | #bbf7d0 | Light accents |
| primary-300 | #86efac | Medium accents |
| primary-400 | #4ade80 | Active states |
| primary-500 | #22c55e | Bright green |
| primary-600 | #16A34A | **PRIMARY BRAND COLOR** (buttons, CTAs — matches the Helm logo) |
| primary-700 | #15803d | Dark green |
| primary-800 | #166534 | Darker green |
| primary-900 | #14532d | Darkest green |

`helm-green-*` and `helm-amber-*` OKLCH scales were **deleted** in the
W0 token unification — `primary-*` is now the single canonical brand
green. Don't reintroduce an OKLCH brand scale.

### Warm Neutrals (NOT cool grays) — `warm-*`
| Token | Hex | Usage |
|-------|-----|-------|
| warm-50 | #fafaf9 | Lightest neutral |
| warm-100 | #f5f5f4 | Subtle bg |
| warm-200 | #e7e5e4 | Borders, dividers |
| warm-300 | #d6d3d1 | Disabled states |
| warm-400 | #a8a29e | Placeholder text |
| warm-500 | #78716c | Secondary text |
| warm-600 | #57534e | Medium text |
| warm-700 | #44403c | Dark text |
| warm-800 | #292524 | Near-black |
| warm-900 | #1c1917 | **Primary text** |

### Cream / Linen Backgrounds — `cream-*`
Shifted (Apr 2026 California-modern brief) from pure off-white
`#FFFEFA` to a warmer "linen" base. Don't use the old `#FFFEFA` value.

| Token | Hex | Usage |
|-------|-----|-------|
| cream (DEFAULT) / cream-100 | #F7F5F2 | California linen — primary page backdrop |
| cream-50 | #FBFAF7 | Lightest — inset highlights |
| cream-200 | #F0EBE3 | Tab backgrounds, soft separators |
| cream-300 | #E5DFD3 | Warm divider tone, table-row alternation |
| cream-400 | #CFC8B8 | Sand inset, subtle borders (glass borders derive from this) |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| success | #16A34A | Positive states (same value as primary-600) |
| warning | #F59E0B | Caution/amber |
| destructive (danger) | #FF3B30 | Error/destructive — **not** the old #DC2626, which is a deleted/banned hex |
| info | #0EA5E9 | Informational (sky-500) — **not** the old #3B82F6 |

`eslint-rules/no-banned-color.mjs` (`helm/no-banned-color`) flags
`helm-green-*`, `sf-green`, `emerald-*`, raw `green-*`, and the literal
hexes `#16A34A`/`#DC2626` outside `src/components/ui` — use the token
names above instead of hex literals in new code.

---

## Glass Material System

Three cream-derived tiers — **not white**. A plain-white glass over the
linen background reads as a washed-out gray card, which is why W0
moved every tier off `rgba(255,255,255,*)` onto cream-100/cream-50
derived tints. Use the `.glass-subtle` / `.glass-standard` /
`.glass-prominent` CSS classes (`src/app/globals.css`, values sourced
from `src/styles/tokens.css`) rather than assembling glass by hand.

### Glass Backgrounds
| Level | Value | Usage |
|-------|-------|-------|
| Subtle (`.glass-subtle`) | rgba(247, 245, 242, 0.62) | Large surfaces, filter panels |
| Standard (`.glass-standard`) | rgba(247, 245, 242, 0.78) | Standard cards, panels, metrics (most common) |
| Prominent (`.glass-prominent`) | rgba(251, 250, 247, 0.92) | Nav, modals, overlays |

### Glass Borders (cream-400 derived — sand inset, not a white hairline)
| Level | Value |
|-------|-------|
| Subtle | rgba(207, 200, 184, 0.40) |
| Standard | rgba(207, 200, 184, 0.45) |
| Prominent | rgba(207, 200, 184, 0.55) |

### Glass Blur Values
| Level | `.glass-*` CSS class (tokens.css) | `backdrop-blur-glass-*` Tailwind utility |
|-------|-----------------------------------|-------------------------------------------|
| Subtle | 12px | 12px |
| Standard | 14px | 16px |
| Prominent | 18px | 20px |

The CSS-class values and the Tailwind-utility values are two parallel
systems that don't perfectly match — prefer the `.glass-*` CSS classes
for anything that isn't hand-composing `bg-glass-*` + `backdrop-blur-*`
Tailwind utilities directly.

### Glass Card Recipe (Standard tier)
```
Background: rgba(247, 245, 242, 0.78)
Backdrop blur: 14px
Border: 1px solid rgba(207, 200, 184, 0.45)
Border radius: 20px (rounded-2xl)
Shadow: 0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)
```
(In Tailwind: `glass-standard border border-cream-400/40 rounded-2xl shadow-glass`)

### Never use `bg-white/N`
`eslint-rules/no-arbitrary-bg-white.mjs` (`helm/no-arbitrary-bg-white`)
flags raw `bg-white`/`bg-white/N` outside `src/components/ui`. If you're
extracting a mockup back into code, translate any white glass fill in
this doc's older versions to the cream values above.

---

## Typography

### Font Stack (from `tailwind.config.ts` `fontFamily`)
- **Sans (default UI):** `var(--font-geist-sans)` (Geist Sans) → falls
  back to `'DM Sans'` → system stack. DM Sans is still loaded
  (`next/font/google`, CSS var `--font-sans`) and used explicitly in
  places; Geist Sans is the Tailwind `font-sans` default.
- **Serif (accents):** `var(--font-fraunces)` (Fraunces) → falls back
  to `var(--font-serif)` (Playfair Display) → Georgia → serif.

### Canonical 9-Step Type Scale (current — use these, not the legacy list below)
| Token | Size / line-height | Usage |
|-------|---------------------|-------|
| text-display | 40px / 48px | Hero text |
| text-h1 | 32px / 40px | Dashboard H1 |
| text-h2 | 24px / 32px | Page sub-headers |
| text-h3 | 18px / 26px | Section headers |
| text-body-lg | 17px / 26px | Large body |
| text-body | 15px / 24px | **Body text** |
| text-body-sm | 13px / 20px | Secondary body text |
| text-caption | 12px / 18px | Captions |
| text-eyebrow | 11px / 16px | Eyebrow labels (uppercase, tracked) |

`eslint-rules/no-arbitrary-text-px.mjs` (`helm/no-arbitrary-text-px`)
flags `text-[Npx]` arbitrary font sizes outside `src/components/ui` —
use the scale above instead.

### Legacy / additional sizes still in the Tailwind config
These remain defined (backward compatibility + specific chrome needs)
but are **not** the canonical scale for new work: `micro` (10px),
`label` (11px), `xs` (12px), `sm` (14px), `base` (16px), `lg` (18px),
`xl` (20px), `2xl`–`7xl`, `display-sm/md/lg/xl`, plus Fairway-specific
`stat-xl`/`stat-lg`/`microlabel`/`microbadge` and BaseballHelm
"Living Annual" `ink`/`ink-hero` numerals, and an iOS HIG scale
(`large-title`…`caption-2`) for native-feeling mobile surfaces.

### Weights
| Token | Value |
|-------|-------|
| normal | 400 |
| medium | 500 |
| semibold | 600 |
| bold | 700 |

### Letter Spacing
| Token | Value | Usage |
|-------|-------|-------|
| tightest | -0.03em | Display text |
| tighter | -0.025em | H1/H2 |
| tight | -0.02em | Subheadings |

---

## Spacing System

| Token | Value | Usage |
|-------|-------|-------|
| 1 | 4px | Tight spacing |
| 2 | 8px | Icon gaps |
| 3 | 12px | Small padding |
| 4 | 16px | Standard gap |
| 5 | 20px | Medium gap |
| 6 | 24px | **Card gaps** |
| 8 | 32px | **Card padding** |
| 10 | 40px | Section spacing |
| 12 | 48px | Large section |
| 16 | 64px | Page sections |

---

## Border Radius

Canonical scale (W0) — reconciled the prior conflict between
`tokens.css` and `globals.css`. `rounded-lg` shifted from 14px → 12px.

| Token | Value | Usage |
|-------|-------|-------|
| sm | 6px | Tags, chips |
| md | 10px | Buttons, inputs |
| lg | 12px | Small cards |
| xl | 16px | Cards |
| 2xl | 20px | **Modals** (also the standard "card" radius in practice) |
| 3xl | 24px | Hero plinths only |
| full | 9999px | Pills, avatars |

---

## Shadow / Elevation System

### Core Elevation
| Token | Value | Usage |
|-------|-------|-------|
| sm | 0 1px 2px rgba(0,0,0,0.04) | Subtle |
| DEFAULT | 0 1px 3px rgba(0,0,0,0.08) | Base |
| md | 0 4px 8px rgba(0,0,0,0.06) | Medium |
| lg | 0 12px 24px rgba(0,0,0,0.08) | Large |
| xl | 0 20px 40px rgba(0,0,0,0.1) | Extra large |

### Glass Shadows
| Token | Value |
|-------|-------|
| glass | 0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6) |
| glass-hover | 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7) |

(The white inset highlight here is a specular shine on the shadow
value itself — not a background fill — so it's not a `bg-white`
violation.)

### Interactive
| Token | Value |
|-------|-------|
| card | 0 1px 3px rgba(0,0,0,0.04), 0 1px 2px rgba(0,0,0,0.02) |
| card-hover | 0 8px 24px rgba(0,0,0,0.1) |
| focus | 0 0 0 3px rgba(22,163,74,0.1) |

### Glow
| Token | Value |
|-------|-------|
| glow-green | 0 0 20px rgba(22,163,74,0.3) |
| glow-green-lg | 0 0 40px rgba(22,163,74,0.4) |

---

## Animation / Motion

### Timing
| Token | Value |
|-------|-------|
| fast | 150ms |
| default | 200ms |
| slow | 300ms |

### Easing
| Token | Value |
|-------|-------|
| default | cubic-bezier(0.4, 0, 0.2, 1) |
| bounce | cubic-bezier(0.68, -0.55, 0.265, 1.55) |
| out-expo | cubic-bezier(0.16, 1, 0.3, 1) |

### Entrance Animations
- fade-in (0.3s), fade-in-slow (0.6s)
- fade-up (0.4s), fade-up-slow (0.6s)
- scale-in (0.2s)
- slide-up, slide-down, slide-in-right, slide-in-left (0.3s)
- bounce-in (0.6s)

---

## Gradients & Backgrounds

| Name | Value |
|------|-------|
| cream-gradient | linear-gradient(180deg, #FBFAF7 0%, #F7F5F2 35%, #F0EBE3 70%, #E5DFD3 100%) |
| gradient-green | linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%) |
| hero-glow | radial-gradient(ellipse at center, rgba(22,163,74,0.15), transparent 70%) |

(The old `glass-gradient` — `linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.3))`
— is white-based and superseded by the `.glass-standard`/`.glass-subtle`/
`.glass-prominent` classes above; don't hand-roll a white glass gradient.)

---

## Component Patterns

### Standard Glass Card
```
bg: rgba(247, 245, 242, 0.78)
blur: 14px
border: 1px solid rgba(207, 200, 184, 0.45)
radius: 20px
padding: 24-32px
shadow: glass
hover: shadow → glass-hover / card-hover, translateY(-2px)
transition: all 200ms ease
```

### Button (Primary)
```
bg: #16A34A (primary-600)
text: white
radius: 10px
padding: 8px 16px
font: sans 500
hover: darken to primary-700 (#15803d), shadow-md
active: scale(0.98)
```

### Input Field
```
bg: rgba(251, 250, 247, 0.85)  (glass "input" tint — slightly whiter than card surfaces so form chrome reads distinct)
border: 1px solid #E0DED9
radius: 10px
padding: 8px 12px
focus: border → #16A34A (primary-600), ring → 0 0 0 3px rgba(22,163,74,0.1)
```

---

## Quality Standards

- Skeleton loaders (not spinners)
- Helpful empty states with illustration + CTA
- User-friendly error messages
- Subtle framer-motion animations
- Proper focus rings for accessibility
- Server components by default (client only when interactive)
- Think Apple-grade quality bar

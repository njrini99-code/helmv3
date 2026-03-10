# Helm Sports Labs — Design System Reference
# For use with Pencil and any design tooling

---

## Brand Identity

**Product:** GolfHelm — AI-powered college golf team management
**Aesthetic:** Linear/Vercel-inspired, premium glassmorphism, warm tones
**Font:** DM Sans (primary), Playfair Display (serif accents)

---

## Color Palette

### Primary Brand — Helm Green
| Token | Hex | Usage |
|-------|-----|-------|
| green-50 | #f0fdf4 | Lightest tint, subtle backgrounds |
| green-100 | #dcfce7 | Hover tints |
| green-200 | #bbf7d0 | Light accents |
| green-300 | #86efac | Medium accents |
| green-400 | #4ade80 | Active states |
| green-500 | #22c55e | Bright green |
| green-600 | #15803D | **PRIMARY BRAND COLOR** (buttons, CTAs) |
| green-700 | #15803D | Dark green |
| green-800 | #166534 | Darker green |
| green-900 | #14532d | Darkest green |

### OKLCH Brand Colors (Modern Gamut)
| Token | OKLCH | Usage |
|-------|-------|-------|
| helm-green-500 | oklch(0.65 0.19 150) | Primary hero/accent |
| helm-amber-500 | oklch(0.70 0.18 45) | Secondary/warning accent |

### Warm Neutrals (NOT cool grays)
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

### Cream Backgrounds
| Token | Hex | Usage |
|-------|-----|-------|
| cream (DEFAULT) | #FFFEFA | Page background |
| cream-100 | #FDF9F3 | Hover states, tab bg |
| cream-200 | #F5F0E8 | Table rows, message bubbles |
| cream-300 | #EDE8DD | Warm dividers |

### Semantic Colors
| Token | Hex | Usage |
|-------|-----|-------|
| success | #15803D | Positive states |
| warning | #F59E0B | Caution/amber |
| danger | #DC2626 | Error/destructive |
| info | #3B82F6 | Informational/blue |

---

## Glass Material System

### Glass Backgrounds
| Level | Value | Usage |
|-------|-------|-------|
| Subtle | rgba(255,255,255,0.55) | Large surfaces, filter panels |
| Default | rgba(255,255,255,0.7) | Standard cards, panels |
| Prominent | rgba(255,255,255,0.8) | Nav, modals, overlays |

### Glass Borders
| Level | Value |
|-------|-------|
| Subtle | rgba(255,255,255,0.4) |
| Standard | rgba(255,255,255,0.5) |
| Prominent | rgba(255,255,255,0.6) |

### Glass Blur Values
| Level | Value |
|-------|-------|
| Subtle | 12px |
| Default | 16px |
| Prominent | 20px |

### Glass Card Recipe
```
Background: rgba(255,255,255,0.7)
Backdrop blur: 16px
Border: 1px solid rgba(255,255,255,0.5)
Border radius: 20px
Shadow: 0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6)
```

---

## Typography

### Font Stack
- **Primary:** DM Sans, -apple-system, BlinkMacSystemFont, system-ui, sans-serif
- **Serif:** Playfair Display, Georgia, serif

### Scale
| Token | Size | Usage |
|-------|------|-------|
| micro | 10px / 14px lh | Badges, annotations |
| label | 11px / 16px lh | Form labels, captions |
| xs | 12px | Small text |
| sm | 14px | Secondary body text |
| base | 16px | **Body text** |
| lg | 18px | Large body |
| xl | 20px | Subheadings |
| h3 | 24px | Section headers |
| h2 | 28px | Page sub-headers |
| h1 | 30px | **Dashboard H1** |
| display | 36px | Hero text |
| display-sm | 48px | Large hero |
| display-md | 56px | XL hero |
| display-lg | 72px | XXL hero |

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

| Token | Value | Usage |
|-------|-------|-------|
| sm | 8px | Small elements |
| md | 10px | Buttons, inputs |
| lg | 14px | Medium cards |
| xl | 16px | Large elements |
| 2xl | 20px | **Cards** |
| 3xl | 24px | Larger cards |
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
| cream-gradient | linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 35%, #F5F0E6 70%, #EDE8DD 100%) |
| gradient-green | linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%) |
| glass-gradient | linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.3)) |
| hero-glow | radial-gradient(ellipse at center, rgba(22,163,74,0.15), transparent 70%) |

---

## Component Patterns

### Standard Glass Card
```
bg: rgba(255,255,255,0.7)
blur: 16px
border: 1px solid rgba(255,255,255,0.5)
radius: 20px
padding: 24-32px
shadow: glass
hover: bg → 0.8, shadow → glass-hover, translateY(-2px)
transition: all 200ms ease
```

### Button (Primary)
```
bg: #15803D
text: white
radius: 10px
padding: 8px 16px
font: DM Sans 500
hover: darken, shadow-md
active: scale(0.98)
```

### Input Field
```
bg: rgba(255,255,255,0.6)
border: 1px solid #E0DED9
radius: 10px
padding: 8px 12px
focus: border → #15803D, ring → 0 0 0 3px rgba(22,163,74,0.1)
```

---

## Quality Standards

- Skeleton loaders (not spinners)
- Helpful empty states with illustration + CTA
- User-friendly error messages
- Subtle framer-motion animations
- Proper focus rings for accessibility
- Server components by default (client only when interactive)
- Think Linear, Stripe, Vercel quality bar

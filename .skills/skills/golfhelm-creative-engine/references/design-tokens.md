# GolfHelm Design Tokens — Source of Truth

Extracted directly from `tailwind.config.ts`, `tokens.css`, and `globals.css`. Every creative MUST use these exact values. Never approximate, never substitute.

## Colors

### Brand Green (Primary)
The soul of GolfHelm. Use for CTAs, accent bars, progress indicators, and headline emphasis.

| Token | Hex | OKLCH | Usage |
|-------|-----|-------|-------|
| primary-600 | `#15803D` | `oklch(0.58 0.19 150)` | **Primary brand color** — buttons, CTAs |
| primary-500 | `#22c55e` | `oklch(0.65 0.19 150)` | Hover states, accent highlights |
| primary-400 | `#4ade80` | `oklch(0.70 0.17 150)` | Light accent, progress bars |
| primary-300 | `#86efac` | `oklch(0.74 0.15 150)` | Subtle tints on light backgrounds |
| glow-green | — | `rgba(22, 163, 74, 0.3)` | Glow effects behind hero elements |
| glow-green-lg | — | `rgba(22, 163, 74, 0.4)` | Larger glow radius for emphasis |

### Amber (Secondary Accent)
Used for warnings, coaching highlights, "golden hour" warmth.

| Token | Hex | Usage |
|-------|-----|-------|
| helm-amber-500 | `oklch(0.70 0.18 45)` | Secondary accent |
| warning | `#F59E0B` | Warning indicators |
| golden-400 | `rgb(251, 191, 36)` | Golden hour accent |
| golden-600 | `rgb(217, 119, 6)` | Deep amber emphasis |

### Warm Neutrals (NOT cool grays)
GolfHelm uses warm stone tones, never blue-gray.

| Token | Hex | Usage |
|-------|-----|-------|
| warm-50 | `#fafaf9` | Lightest background |
| warm-100 | `#f5f5f4` | Card backgrounds (light mode) |
| warm-200 | `#e7e5e4` | Dividers, subtle borders |
| warm-500 | `#78716c` | Secondary text |
| warm-700 | `#44403c` | Body text |
| warm-800 | `#292524` | Primary text (dark on light) |
| warm-900 | `#1c1917` | Headline text, strongest contrast |

### Cream Background System
The signature GolfHelm warmth. Never use pure white (#fff).

| Token | Hex | Usage |
|-------|-----|-------|
| cream-50 | `#FFFEFA` | Base background |
| cream-100 | `#FDF9F3` | Hover states, tab backgrounds |
| cream-200 | `#F5F0E8` | Table rows, message bubbles |
| cream-300 | `#EDE8DD` | Warm divider tone |
| cream-gradient | `linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 35%, #F5F0E6 70%, #EDE8DD 100%)` | Full-page background |

### Semantic Colors
| Token | Hex |
|-------|-----|
| success | `#15803D` |
| warning | `#F59E0B` |
| danger | `#DC2626` |
| info | `#3B82F6` |

### Dark Mode / Dark Glass (for Instagram dark-bg creatives)
| Token | Value |
|-------|-------|
| glass-dark | `rgba(28, 25, 23, 0.97)` |
| aurora bg | `linear-gradient(to bottom, #0f172a, #020617)` |
| aurora-green | `rgba(22, 163, 74, 0.15)` |
| aurora glow | `radial-gradient(ellipse at center, rgba(22, 163, 74, 0.15), transparent 70%)` |

## Glass Effects

GolfHelm's signature visual layer. Three tiers of frosted glass:

| Tier | Background | Border | Blur | Shadow | Use Case |
|------|-----------|--------|------|--------|----------|
| Subtle | `rgba(255,255,255,0.55)` | `rgba(255,255,255,0.4)` | `12px` | `glass-sm` | Large surfaces, filters |
| Default | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.5)` | `16px` | `glass` | Standard cards, panels |
| Prominent | `rgba(255,255,255,0.8)` | `rgba(255,255,255,0.6)` | `20px` | `glass-lg` | Nav, modals, hero cards |

Glass shadows (always include the inset highlight):
```css
--glass:       0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6);
--glass-hover: 0 8px 24px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7);
--glass-lg:    0 8px 32px rgba(0,0,0,0.08), inset 0 1px 0 rgba(255,255,255,0.7);
```

## Typography

| Property | Value |
|----------|-------|
| Font family | `'DM Sans', -apple-system, BlinkMacSystemFont, system-ui, sans-serif` |
| Serif (accent) | `'Playfair Display', Georgia, serif` |
| Weight - normal | 400 |
| Weight - medium | 500 |
| Weight - semibold | 600 |
| Weight - bold | 700 |
| Tracking - tight | `-0.02em` |
| Tracking - tighter | `-0.025em` |
| Tracking - tightest | `-0.03em` |

### Type Scale
| Token | Size | Usage |
|-------|------|-------|
| micro | 10px | Badges, annotations |
| label | 11px | Form labels, captions |
| xs | 12px | Small detail text |
| sm | 14px | Secondary body |
| base | 16px | Body text |
| lg | 18px | Emphasized body |
| xl | 20px | Subheadings |
| h3 | 24px | Section headings |
| h2 | 28px | Page sections |
| h1 | 30px | Dashboard H1 |
| display | 36px | Hero numbers |
| display-sm | 48px / 1.1 / -0.025em | Large display |
| display-md | 56px / 1.2 / -0.01em | Hero display |
| display-lg | 72px / 1.0 / -0.03em | Maximum display |

## Spacing
4px base unit: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64

## Border Radius
| Token | Value | Usage |
|-------|-------|-------|
| sm | 8px | Small elements |
| md | 10px | Buttons, inputs |
| lg | 14px | Medium cards |
| xl | 16px | Large cards |
| 2xl | 20px | Primary cards |
| 3xl | 24px | Hero cards |
| full | 9999px | Pills, avatars |

## Shadows (Elevation System)
| Level | Value | Usage |
|-------|-------|-------|
| sm | `0 1px 2px rgba(0,0,0,0.04)` | Subtle elevation |
| DEFAULT | `0 1px 3px rgba(0,0,0,0.08)` | Base elevation |
| md | `0 4px 8px rgba(0,0,0,0.06)` | Cards at rest |
| lg | `0 12px 24px rgba(0,0,0,0.08)` | Floating elements |
| xl | `0 20px 40px rgba(0,0,0,0.1)` | Modals, hero cards |
| card-hover | `0 8px 24px rgba(0,0,0,0.1)` | Interactive lift |

## Animation (for motion-static Instagram creatives)
| Token | Duration | Easing | Usage |
|-------|----------|--------|-------|
| fade-in | 300ms | ease-out | Element entrance |
| fade-up | 400ms | ease-out | Staggered reveals |
| scale-in | 200ms | ease-out | Button/badge pop |
| bounce-in | 600ms | `cubic-bezier(0.68, -0.55, 0.265, 1.55)` | Celebration moments |
| glow | 2s | ease-in-out infinite alternate | Ambient green glow |

## Background Textures
| Token | Value | Usage |
|-------|-------|-------|
| mesh | SVG cross pattern, fill-opacity 0.03 | Subtle texture overlay |
| noise | 3-5% opacity grain | Premium surface texture |
| glass-gradient | `linear-gradient(135deg, rgba(255,255,255,0.7), rgba(255,255,255,0.3))` | Glass card fill |
| gradient-green | `linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)` | CTA gradient |

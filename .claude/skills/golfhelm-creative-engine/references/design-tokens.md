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

---

## Brand Logo & Assets

### CRITICAL: Always use the REAL GolfHelm logo — NEVER invent/generate icons

The GolfHelm logo is a **ship's helm wheel with a golf ball in the center**. It is a PNG image, NOT an SVG. Never substitute it with a generic hexagon, shield, or made-up icon.

### Logo Files (in `tools/` directory)

| File | Size | Usage |
|------|------|-------|
| `helm-logo.png` | 189×154px | Primary logo — sidebar, nav, creative brand mark |
| `helm-logo-512.png` | 512×512px | App icon variant (helm + ship) — favicon, OG images |
| `helm-icon-512.png` | 512×512px | PWA icon variant (helm + golf ball) — app install icon |

### Logo Usage in Creatives

**In HTML creatives, ALWAYS reference the logo as an `<img>` tag:**
```html
<!-- Brand mark in creative — use the helm-logo.png -->
<img src="./helm-logo.png" alt="GolfHelm" width="52" height="52" style="object-fit: contain;" />
```

**Wordmark pairing:**
```html
<img src="./helm-logo.png" width="48" height="48" style="object-fit: contain;" />
<span style="font-size: 24px; font-weight: 700; color: #fff; letter-spacing: -0.02em;">
  Golf<span style="color: #4ade80;">Helm</span>
</span>
```

**On dark backgrounds:** The green logo works on dark — no modifications needed.
**On light/cream backgrounds:** The green logo works on cream — no modifications needed.
**Never:** Create SVG approximations, use generic icons, or skip the logo entirely.

### Logo Glow Effect (from auth pages)
```css
.logo-glow {
  position: relative;
}
.logo-glow::before {
  content: '';
  position: absolute;
  inset: 0;
  background: rgba(22, 163, 74, 0.3);
  border-radius: 9999px;
  filter: blur(20px);
  transform: scale(1.5);
}
```

---

## Icon SVG Library

### CRITICAL: Use these EXACT SVG paths — never invent icons or use emojis as placeholders

These are extracted from `src/components/icons/index.tsx`. All icons use `viewBox="0 0 24 24"`, `fill="none"`, `stroke="currentColor"`, `stroke-width="2"`, `stroke-linecap="round"`, `stroke-linejoin="round"`.

### CoachHelm / AI Icons
```html
<!-- IconSparkles — CoachHelm AI indicator, insights, predictions -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/>
  <path d="M5 3v4M19 17v4M3 5h4M17 19h4"/>
</svg>

<!-- IconBrain — Intelligence hub, pattern detection, AI analysis -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 5a3 3 0 1 0-5.997.125 4 4 0 0 0-2.526 5.77 4 4 0 0 0 .556 6.588A4 4 0 1 0 12 18Z"/>
  <path d="M12 5a3 3 0 1 1 5.997.125 4 4 0 0 1 2.526 5.77 4 4 0 0 1-.556 6.588A4 4 0 1 1 12 18Z"/>
  <path d="M15 13a4.5 4.5 0 0 1-3-4 4.5 4.5 0 0 1-3 4"/>
  <path d="M12 18v4"/>
</svg>

<!-- IconBolt — Quick actions, performance, power -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/>
</svg>
```

### Golf-Specific Icons
```html
<!-- IconGolf — Golf flag/pin -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="19" cy="5" r="2"/>
  <path d="M4 22h16M12 22v-7M8 22a5 5 0 0 1 8 0"/>
  <path d="M12 15V5l7-2"/>
</svg>

<!-- IconFlag — Qualifiers, goals, milestones -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/>
  <path d="M4 22V3"/>
</svg>

<!-- IconTrophy — Achievements, rankings -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M6 9H4.5a2.5 2.5 0 0 1 0-5H6"/>
  <path d="M18 9h1.5a2.5 2.5 0 0 0 0-5H18"/>
  <path d="M4 22h16"/>
  <path d="M10 14.66V17c0 .55-.47.98-.97 1.21C7.85 18.75 7 20.24 7 22"/>
  <path d="M14 14.66V17c0 .55.47.98.97 1.21C16.15 18.75 17 20.24 17 22"/>
  <path d="M18 2H6v7a6 6 0 0 0 12 0V2Z"/>
</svg>
```

### Analytics & Stats Icons
```html
<!-- IconTrendingUp — Improvement trends, positive stats -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M22 7L13.5 15.5 8.5 10.5 2 17"/>
  <path d="M16 7h6v6"/>
</svg>

<!-- IconTrendingDown — Declining trends, areas to improve -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M22 17L13.5 8.5 8.5 13.5 2 7"/>
  <path d="M16 17h6v-6"/>
</svg>

<!-- IconChartBar — Stats, analytics -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 20V10M18 20V4M6 20v-4"/>
</svg>

<!-- IconCrosshair — Accuracy, targeting, focus areas -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <path d="M22 12h-4M6 12H2M12 6V2M12 22v-4"/>
</svg>
```

### UI / Status Icons
```html
<!-- IconAlertCircle — Warnings, attention needed -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="10"/>
  <path d="M12 8v4M12 16h.01"/>
</svg>

<!-- IconCheckCircle — Success, completed -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/>
  <path d="m9 11 3 3L22 4"/>
</svg>

<!-- IconUsers — Team, roster -->
<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/>
  <circle cx="9" cy="7" r="4"/>
  <path d="M22 21v-2a4 4 0 0 0-3-3.87"/>
  <path d="M16 3.13a4 4 0 0 1 0 7.75"/>
</svg>
```

### Recommended Icon-to-Feature Mapping for Creatives

| Feature | Icon | SVG Reference |
|---------|------|---------------|
| CoachHelm AI badge | IconSparkles | Sparkle star |
| Score predictions | IconCrosshair | Target crosshair |
| Pattern detection | IconBrain | Brain outline |
| Round analysis | IconGolf | Golf flag |
| Stats/analytics | IconChartBar | Bar chart |
| Trends up | IconTrendingUp | Arrow trending up |
| Trends down | IconTrendingDown | Arrow trending down |
| Team features | IconUsers | People group |
| Achievements | IconTrophy | Trophy cup |
| Qualifiers | IconFlag | Waving flag |
| Alerts/warnings | IconAlertCircle | Circle with ! |
| Performance | IconBolt | Lightning bolt |

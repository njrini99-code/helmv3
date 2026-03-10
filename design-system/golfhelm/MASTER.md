# Design System Master File — GolfHelm

> **LOGIC:** When building a specific page, first check `design-system/golfhelm/pages/[page-name].md`.
> If that file exists, its rules **override** this Master file.
> If not, strictly follow the rules below.

---

**Project:** GolfHelm — College Golf Team Management + CoachHelm AI
**Brand Personality:** Premium, Warm, Intelligent, Professional — think Linear meets Augusta
**Category:** Sports SaaS / Team Intelligence Platform

---

## Global Rules

### Color Palette

| Role | Hex | Tailwind | CSS Variable |
|------|-----|----------|--------------|
| Primary | `#15803D` | `green-700` | `--primary` |
| Primary Light | `#16A34A` | `green-600` | `--primary-light` |
| Primary Dark | `#166534` | `green-800` | — |
| Background | `#FFFEFA` | `cream-50` | `--background` |
| Background Warm | `#FDF9F0` | `cream-100` | — |
| Background Muted | `#F5F0E8` | `cream-200` | — |
| Foreground | `#1c1917` | `warm-900` | `--foreground` |
| Muted Text | `#78716c` | `warm-500` | `--muted-foreground` |
| Subtle Text | `#a8a29e` | `warm-400` | — |
| Border | `#e7e5e4` | `warm-200` | `--border` |
| Accent Amber | `#F59E0B` | `amber-500` | — |
| Error | `#DC2626` | `red-600` | `--destructive` |
| Success | `#16A34A` | `green-600` | — |

**CRITICAL:** Never pure white bg. Never cool grays. Never blue/purple accents.

### Typography

- **Primary:** DM Sans (all UI) — 400, 500, 600, 700
- **Display:** Playfair Display (marketing only) — 700
- **Scale:** H1=30px, H2=24px, H3=20px, Body=16px, Small=14px, Label=13px
- **Headlines:** letter-spacing -0.025em, line-height 1.1-1.2
- **Body:** line-height 1.5-1.6, max 65-75 chars per line

### Glass System

| Tier | Background | Border | Blur |
|------|-----------|--------|------|
| Subtle | `white/50` | `white/15` | `backdrop-blur-lg` |
| Default | `white/70` | `white/20` | `backdrop-blur-xl` |
| Prominent | `white/85` | `white/30` | `backdrop-blur-2xl` |

**Standard glass card:** `bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass`

### Spacing

Card padding: p-6. Card radius: rounded-2xl. Gap: gap-6. Buttons: rounded-xl.

### Shadows

- Glass: `0 4px 24px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)`
- Hover: `0 8px 40px rgba(0,0,0,0.08), 0 2px 4px rgba(0,0,0,0.04)`

### Animation

- All transitions: 200ms ease
- Framer Motion enter/exit: 300ms spring
- Skeleton loaders only (no spinners)
- Respect `prefers-reduced-motion`

---

## Anti-Patterns

- ❌ Pure white (#fff) backgrounds
- ❌ Cool grays (slate, gray, zinc)
- ❌ Blue/purple accents
- ❌ Inter/Roboto/system fonts
- ❌ Emojis as icons (use Lucide)
- ❌ Spinners (use skeletons)
- ❌ Missing cursor:pointer
- ❌ Layout-shifting hovers
- ❌ Color as only indicator

## Pre-Delivery Checklist

- [ ] Cream bg (#FFFEFA), warm palette only, green primary
- [ ] DM Sans throughout, Playfair only for marketing
- [ ] Glass cards with backdrop-blur
- [ ] Lucide icons, no emojis
- [ ] cursor:pointer, 200ms transitions, visible focus rings
- [ ] 4.5:1 contrast, alt text, form labels, reduced-motion
- [ ] Responsive: 375/768/1024/1440px

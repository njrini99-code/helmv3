---
name: pencil-golfhelm
description: Supercharged Pencil design system for GolfHelm — UI mockups, marketing creatives, and feature prototypes using the Lunaris component library. Use when designing anything in Pencil for GolfHelm including dashboards, screens, IG posts, carousels, landing pages, or any visual asset. Connects Pencil's 101-component design system with GolfHelm's full feature catalog, screenshot pipeline, and design reference search. Trigger with "design in Pencil", "mock up", "create a screen", "Pencil creative", "design a dashboard", or any Pencil + GolfHelm design task.
---

# Pencil × GolfHelm — Supercharged Design System

> The complete bridge between GolfHelm's product and Pencil's design canvas.

## Before You Start — EVERY TIME

1. **Open the right file:** `pencil-welcome-desktop.pen` (the Lunaris design system with 101 components)
2. **Read the reference you need** (see table below)
3. **Get variables:** Call `get_variables()` — all GolfHelm tokens are pre-loaded
4. **Get components:** Call `batch_get` with `patterns: [{"reusable": true}]` to see available components

### Reference Files

| File | Read When |
|------|-----------|
| `references/component-map.md` | **Always** — maps every Pencil component ID to its purpose and usage |
| `references/feature-templates.md` | When building a specific GolfHelm feature (CoachHelm, rounds, stats, etc.) |
| `references/creative-specs.md` | When making marketing creatives (IG posts, stories, carousels) |
| `references/ad-vibe-guide.md` | **REQUIRED before ANY ad/creative** — full visual DNA: floating mockups, sage canvas, editorial layout, badges |
| `references/screenshot-pipeline.md` | When capturing and importing actual GolfHelm UI into Pencil |
| `references/workflow-router.md` | When deciding which skills to activate for a task (routes to global skills) |
| `references/layer-annotations.md` | When annotating Pencil layers for handoff to Claude Code implementation |

### Connected Systems

| System | Location | Purpose |
|--------|----------|---------|
| **Design System (persisted)** | `design-system/golfhelm/MASTER.md` | Global brand tokens — read EVERY time |
| **Page Overrides** | `design-system/golfhelm/pages/*.md` | Page-specific rules (dashboard, landing, IG) |
| **ui-ux-pro-max** | `~/.agents/skills/ui-ux-pro-max/` | Searchable design intelligence DB |
| **web-accessibility** | `~/.agents/skills/web-accessibility/` | WCAG 2.1 audit |
| **web-design-guidelines** | `~/.agents/skills/web-design-guidelines/` | Design linter |
| **ui-animation** | `~/.agents/skills/ui-animation/` | Motion design rules |
| **Design folder** | `design/DESIGN-SYSTEM.md` | Extracted Tailwind tokens for Pencil |
| **Screenshots** | `design/screenshots/` | Captured UI for import into Pencil |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────┐
│              pencil-welcome-desktop.pen          │
│  ┌───────────┐  ┌───────────┐  ┌─────────────┐  │
│  │ 101 Lunaris│  │ 70+ Design│  │ Light/Dark  │  │
│  │ Components │  │ Variables │  │ Theme Modes │  │
│  └───────────┘  └───────────┘  └─────────────┘  │
└─────────────────────────────────────────────────┘
         │                │               │
         ▼                ▼               ▼
┌──────────────┐  ┌──────────────┐  ┌──────────────┐
│ UI Mockups   │  │ Marketing    │  │ Feature      │
│ (Dashboards, │  │ Creatives    │  │ Prototypes   │
│  Screens)    │  │ (IG, Ads)    │  │ (New Ideas)  │
└──────────────┘  └──────────────┘  └──────────────┘
```

---

## Quick Start Recipes

### Recipe 1: Design a Dashboard Screen

```
1. get_editor_state() → confirm pencil-welcome-desktop.pen is open
2. Read references/feature-templates.md → find the feature template
3. get_variables() → load tokens
4. find_empty_space_on_canvas() → find placement
5. batch_design() → create screen frame (placeholder: true)
6. batch_design() → populate with components from the map
7. get_screenshot() → verify
8. batch_design() → remove placeholder flag
```

### Recipe 2: Create an IG Post Creative

```
1. Read references/creative-specs.md → get canvas specs + rules
2. batch_design() → create 1080×1350 frame (placeholder: true)
3. Build background layer (cream gradient, dark aurora, or grass texture)
4. Insert glass card with UI component using Lunaris refs
5. Add headline text (DM Sans Bold, 48-72px)
6. Add CTA button (use Button/Default component ref)
7. G() → generate any stock/AI images needed
8. get_screenshot() → verify
```

### Recipe 3: Screenshot → Creative Pipeline

```
1. Read references/screenshot-pipeline.md → setup instructions
2. Capture screenshots of live GolfHelm UI (Playwright or manual)
3. Save to helmv3/design/screenshots/
4. In Pencil, create frame → apply image as fill:
   batch_design: I(parent, {type: "frame", width: 400, height: 300,
     fill: {type: "image", url: "../../design/screenshots/feature-x.png", mode: "fill"}})
5. Overlay glass card + crop for creative composition
```

### Recipe 4: Design Reference Search

```
1. Use WebSearch to find design inspiration:
   - "premium SaaS dashboard design 2025"
   - "editorial dashboard glassmorphism"
   - "premium billing page design patterns"
   - "Premium SaaS [feature-type] UI"
2. Screenshot references with get_screenshot of browser
3. Use as visual guide while building in Pencil
4. Match GolfHelm tokens — never copy verbatim, adapt to our system
```

---

## The Component System (101 Components)

### Quick Reference — Most Used Components

| Category | Component | ID | Usage |
|----------|-----------|-----|-------|
| **Buttons** | Button/Default (primary) | `ZETEA` | CTAs, primary actions |
| | Button/Secondary | `U83R7` | Secondary actions |
| | Button/Ghost | `Svd9t` | Tertiary/nav actions |
| | Button/Outline | `4x7RU` | Alternative actions |
| | Button/Destructive | `ftEoU` | Delete/danger actions |
| | Button/Large/Default | `ZGI9Z` | Hero CTAs |
| **Inputs** | Input Group/Default | `gKpi4` | Form fields |
| | Input Group/Filled | `z6HCm` | Pre-filled fields |
| | Select Group/Default | `XhJWF` | Dropdowns |
| | Textarea Group | `QFzE8` | Multi-line input |
| | Search Box/Default | `T5yK2` | Search fields |
| | Search Box/Filled | `Zksub` | Active search |
| **Cards** | Card | `ERkuB` | Standard content card |
| | Card Image | `ksvfk` | Card with image header |
| | Card Action | `wg5F3` | Card with action buttons |
| | Card Plain | `eBwLd` | Minimal card |
| **Data** | Data Table | `yLiVX` | Full data table |
| | Table | `pPOgy` | Simple table |
| | Table Row | `T73Cd` | Table row |
| | Table Cell | `uKYIj` | Table cell |
| | Table Column Header | `tbrR4` | Column header |
| **Navigation** | Sidebar | `d5ZTS` | Side navigation |
| | Sidebar Item/Active | `dOLzc` | Active nav item |
| | Sidebar Item/Default | `X6nwq` | Inactive nav item |
| | Tabs | `Kbr4h` | Tab navigation |
| | Breadcrumb Item | `nW26m` | Breadcrumb nav |
| **Feedback** | Alert/Error | `YZjRF` | Error messages |
| | Alert/Success | `nIj3a` | Success messages |
| | Alert/Warning | `vbyqV` | Warning messages |
| | Alert/Info | `ITZkn` | Info messages |
| | Progress | `W4YFH` | Progress bar |
| | Tooltip | `xCEfn` | Tooltip overlay |
| **Form** | Checkbox/Default | `Wxq1C` | Unchecked checkbox |
| | Checkbox/Checked | `r91nP` | Checked checkbox |
| | Radio/Default | `Ao9E1` | Unselected radio |
| | Radio/Selected | `u61z6` | Selected radio |
| | Switch/Default | `wk1O8` | Toggle off |
| | Switch/Checked | `zdFKu` | Toggle on |
| **Labels** | Icon Label/Secondary | `XYdcn` | Status badges |
| | Icon Label/Success | `Ffti9` | Success badges |
| | Icon Label/Orange | `7Fif0` | Warning badges |
| | Icon Label/Violet | `A58oI` | Info badges |
| **Modals** | Dialog | `cYAuh` | Standard dialog |
| | Modal/Center | `5JUG0` | Centered modal |
| | Modal/Center Icon | `DBtsv` | Modal with icon |
| **Other** | Avatar/Text | `90SQo` | Text avatar |
| | Avatar/Image | `4AN1p` | Image avatar |
| | Pagination | `9PVw5` | Page navigation |
| | Dropdown | `cH4wO` | Dropdown menu |
| | List Item/Checked | `5RtqD` | Checked list item |
| | IG Post — GolfHelm v2 | `15lvJ` | Instagram post template |

### Variables (Design Tokens)

All tokens are pre-loaded. Reference them with `$` prefix:

**Colors:**
- `$--primary` → #15803D (brand green)
- `$--foreground` → #1c1917 (primary text)
- `$--muted-foreground` → #78716c (secondary text)
- `$--background` → #FFFEFA (cream bg)
- `$--border` → #e7e5e4 (dividers)
- `$--destructive` → #DC2626 (danger)
- `$--warning` → #F59E0B (amber)
- `$--info` → #3B82F6 (blue)
- `$--success` → #15803D (green)
- `$--cream-50` through `$--cream-300` (cream scale)
- `$--warm-50` through `$--warm-900` (warm neutral scale)
- `$--glass-subtle-bg`, `$--glass-default-bg`, `$--glass-prominent-bg`
- `$--glass-subtle-border`, `$--glass-default-border`, `$--glass-prominent-border`

**Typography:**
- `$--font-primary` → DM Sans
- `$--font-secondary` → Playfair Display

**Radius:**
- `$--radius-sm` (8) / `$--radius-md` (10) / `$--radius-lg` (14) / `$--radius-xl` (16) / `$--radius-2xl` (20) / `$--radius-3xl` (24)

---

## Design Rules — NEVER Break These

### Colors
- ✅ Use `$--background` (#FFFEFA cream) for page backgrounds
- ✅ Use warm stone tones (`$--warm-*`) for neutrals
- ❌ NEVER use pure white (#ffffff) for backgrounds
- ❌ NEVER use cool/blue grays (slate, gray, zinc)

### Glass
- ✅ Use exact glass token values (subtle/default/prominent)
- ✅ Add `background_blur` effect (12/16/20px) to glass elements
- ❌ NEVER approximate glass values — use the tokens

### Typography
- ✅ DM Sans for everything (set via `$--font-primary`)
- ✅ Playfair Display only for serif accents (set via `$--font-secondary`)
- ✅ Headlines: 48-72px Bold, letter-spacing -0.025em
- ❌ NEVER use Inter, Roboto, or system fonts

### Spacing
- ✅ 4px base unit: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64
- ✅ Card padding: 24-32px
- ✅ Card gap: 24px (gap: 6 in Tailwind units)
- ✅ Border radius: 20px for cards (`$--radius-2xl`)

### Marketing Creatives
- ✅ Ad IS the product — use real UI components as heroes
- ✅ Max 12 words in headlines
- ✅ Isolate 1-2 UI components, never full screenshots
- ✅ Use aspirational but realistic stats (scores 70-78, improvement +2 to +8)
- ❌ NEVER use stock pro golf photos
- ❌ NEVER use generic "AI-powered" messaging
- ❌ Max 2 accent colors per creative

---

## Advanced: Building Custom GolfHelm Components in Pencil

When Lunaris doesn't have what you need, build custom components following GolfHelm patterns:

### Glass Card (custom)
```javascript
card=I(parent, {
  type: "frame", layout: "vertical",
  fill: "$--glass-default-bg",
  stroke: {align: "inside", fill: "$--glass-default-border", thickness: 1},
  cornerRadius: "$--radius-2xl",
  padding: 32, gap: 16,
  effect: [
    {type: "background_blur", radius: 16},
    {type: "shadow", shadowType: "outer", offset: {x: 0, y: 4}, blur: 16, color: "#0000000f"},
    {type: "shadow", shadowType: "inner", offset: {x: 0, y: 1}, blur: 0, color: "#ffffff99"}
  ]
})
```

### Stat Card
```javascript
stat=I(parent, {
  type: "frame", layout: "vertical",
  fill: "$--glass-default-bg",
  stroke: {align: "inside", fill: "$--glass-default-border", thickness: 1},
  cornerRadius: "$--radius-2xl",
  padding: 24, gap: 8,
  effect: [{type: "background_blur", radius: 16}]
})
label=I(stat, {type: "text", content: "Scoring Average", fill: "$--muted-foreground", fontFamily: "$--font-primary", fontSize: 14, fontWeight: "500"})
value=I(stat, {type: "text", content: "72.4", fill: "$--foreground", fontFamily: "$--font-primary", fontSize: 36, fontWeight: "700", letterSpacing: -0.03})
trend=I(stat, {type: "text", content: "↓ 1.2 from last season", fill: "$--success", fontFamily: "$--font-primary", fontSize: 13, fontWeight: "500"})
```

### Score Prediction Card
```javascript
pred=I(parent, {
  type: "frame", layout: "vertical", alignItems: "center",
  fill: "$--glass-default-bg",
  stroke: {align: "inside", fill: "$--glass-default-border", thickness: 1},
  cornerRadius: "$--radius-2xl",
  padding: 32, gap: 16,
  effect: [{type: "background_blur", radius: 16}]
})
title=I(pred, {type: "text", content: "Predicted Score", fill: "$--muted-foreground", fontFamily: "$--font-primary", fontSize: 14, fontWeight: "500"})
score=I(pred, {type: "text", content: "73", fill: "$--foreground", fontFamily: "$--font-primary", fontSize: 72, fontWeight: "700", letterSpacing: -0.03})
conf=I(pred, {type: "text", content: "78% confidence · Range: 71-76", fill: "$--muted-foreground", fontFamily: "$--font-primary", fontSize: 14})
```

---

## Screenshot Pipeline Setup

### Capturing GolfHelm UI
```bash
# Using Playwright (recommended)
npx playwright screenshot http://localhost:3000/golf/dashboard/hub \
  --viewport-size=1440,900 \
  --full-page \
  helmv3/design/screenshots/player-hub.png

# Specific component isolation (crop after capture)
# Use browser DevTools to screenshot specific elements
```

### Importing into Pencil
```javascript
// Apply screenshot as image fill on a frame
frame=I(parent, {type: "frame", width: 600, height: 400,
  fill: {type: "image", url: "../../design/screenshots/player-hub.png", mode: "fill"},
  cornerRadius: "$--radius-2xl",
  effect: [{type: "shadow", shadowType: "outer", offset: {x: 0, y: 8}, blur: 24, color: "#00000014"}]
})
```

### Recommended Screenshots to Capture
Save these to `helmv3/design/screenshots/`:

| Screenshot | URL | Best For |
|-----------|-----|----------|
| player-hub.png | /dashboard/hub | Player dashboard overview |
| coachhelm-insights.png | /dashboard/insights | AI insights feed |
| round-review.png | /dashboard/rounds/[id]/review | Round review scorecard |
| team-stats.png | /dashboard/stats/team | Team stats bento |
| score-prediction.png | /dashboard/coachhelm | Score prediction card |
| calendar.png | /dashboard/calendar | Calendar view |
| roster.png | /dashboard/roster | Team roster grid |
| qualifier.png | /dashboard/qualifiers | Qualifier leaderboard |

---

## Design Reference Search Patterns

When you need visual inspiration, search for these patterns:

### Dashboard Inspiration
- "premium issue tracker UI design"
- "premium analytics dashboard 2025"
- "premium dashboard glassmorphism design"
- "Notion workspace premium UI"

### Marketing Creative Inspiration
- "SaaS product Instagram ad design premium"
- "App screenshot marketing creative glassmorphism"
- "Product-led growth social media creative"
- "Mobile app marketing carousel Instagram"

### Component Patterns
- "Data table design system premium"
- "Stats card bento grid dashboard"
- "Glass card component library"
- "premium SaaS sidebar navigation design"

When finding references, ALWAYS adapt to GolfHelm's token system. Never copy verbatim — translate to our cream/green/glass palette.

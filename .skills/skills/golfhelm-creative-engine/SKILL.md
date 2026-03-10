---
name: golfhelm-creative-engine
description: Generate premium Instagram creatives, social media ads, and marketing mockups for GolfHelm — an AI-powered golf coaching SaaS for college teams. Use this skill whenever the user mentions Instagram ads, social creatives, marketing mockups, ad templates, carousel posts, social media content, or any visual marketing asset for GolfHelm. Also trigger when the user asks to "make an ad", "create a post", "design a carousel", "mockup a creative", or anything related to GolfHelm marketing visuals. This skill contains the complete extracted design token system, product feature catalog, and creative rules — everything needed to generate pixel-perfect, on-brand assets without accessing the codebase.
---

# GolfHelm Creative Engine

Generate premium Instagram creatives that look like they were designed by a senior product designer at Vercel, not an AI. Every creative is built from GolfHelm's real design tokens, real UI patterns, and real product features.

## Before You Start

Read these reference files based on what you need:

| File | Read When |
|------|-----------|
| `references/design-tokens.md` | **Always** — this is the visual source of truth |
| `references/product-features.md` | When you need feature details, sample data, or dashboard layouts |
| `references/creative-rules.md` | When deciding layout, composition, or what NOT to do |

Read `design-tokens.md` first on every invocation. The tokens are the non-negotiable foundation.

---

## Core Philosophy

GolfHelm creatives follow one rule: **the ad IS the product.** Every creative should look like a natural extension of the GolfHelm dashboard — same glass cards, same DM Sans typography, same warm cream-to-green palette. A user mid-session should think it's a screenshot with editorial framing, not a marketing asset.

This means:
- Use real UI components (score predictions, insight cards, round reviews) as the visual hero
- Use the exact glass morphism values from the token system
- Use warm neutrals (stone tones), never cool/blue grays
- Use cream (#FFFEFA), never pure white (#ffffff)
- Use DM Sans, never Inter/Roboto/system defaults
- Show aspirational but realistic golf stats (see sample data in product-features.md)

---

## Creative Types

### 1. Single Feed Post (1080 × 1350px)
The workhorse format. One hero UI component + headline + CTA.

**Best for:** Feature highlights, score predictions, stat showcases

**Structure:**
```
┌──────────────────────────────┐
│     [60px safe zone]         │
│                              │
│   ┌────────────────────┐     │
│   │                    │     │
│   │   Glass Card       │     │
│   │   (UI Component)   │     │
│   │                    │     │
│   └────────────────────┘     │
│                              │
│   HEADLINE (48-72px Bold)    │
│   Subtext (18-20px Regular)  │
│                              │
│   ┌──────────────┐           │
│   │  CTA Button  │           │
│   └──────────────┘           │
│                              │
│     [120px safe zone]        │
└──────────────────────────────┘
```

**Which UI component to feature:**
- Score prediction card → "Your AI-Powered Golf Coach"
- AI insights feed → "Patterns Your Coach Can't See"
- Round review scorecard → "Every Round, Reviewed by AI"
- Team stats bento grid → "Your Team's Command Center"
- Development plan card → "Structured Improvement Plans"

### 2. Carousel (6-10 slides, each 1080 × 1350px)
The engagement engine. Instagram's algorithm rewards swipe-through behavior.

**Best for:** Feature walkthroughs, "How it works", before/after stories

**Slide architecture:**

| Slide | Purpose | Content |
|-------|---------|---------|
| 1 | The Hook | Bold headline + single stunning UI component. Must stop the scroll. |
| 2-3 | The Problem | Pain point the coach/player faces. Use stats or scenarios. |
| 4-7 | The Solution | One GolfHelm feature per slide, each with an isolated UI component. |
| 8-9 | Social Proof | Team stats, improvement metrics, testimonial-style data. |
| 10 | CTA | Clear action — "Get Started Free" or "See It In Action →" |

**Consistency rules across slides:**
- Same background treatment on every slide
- Logo/wordmark in same position (top-left, 48px from edges)
- Slide counter in same position (top-right or bottom-center)
- Same headline font size and position
- Glass card placement varies but maintains visual rhythm

### 3. Story / Reel Cover (1080 × 1920px)
Vertical canvas optimized for full-screen viewing.

**Safe zones are critical:**
- Top 200px: Camera/status bar overlay
- Bottom 280px: Swipe-up / CTA zone

**Best for:** Quick stats, single insight highlights, event teasers

### 4. Dark Mode Creative
Premium variant using the aurora/dark glass palette.

**Background:** `linear-gradient(to bottom, #0f172a, #020617)` + `radial-gradient(ellipse at center, rgba(22, 163, 74, 0.15), transparent 70%)`

**Glass cards on dark:** Use `rgba(255, 255, 255, 0.08)` bg with `rgba(255, 255, 255, 0.12)` border and white text.

**Best for:** High-impact hero posts, "Coming Soon" teasers, nighttime posting

---

## Building a Creative — Step by Step

### Step 1: Choose the hero component
Pick 1-2 UI regions from the product. See `references/product-features.md` for the full feature catalog with sample data. The five strongest hero components are:

1. **Score Prediction Card** — The "73" with confidence bar, range, and trend bullets
2. **AI Insights Feed** — Three stacked insight cards with emoji icons and percentages
3. **Round Review Scorecard** — Hole-by-hole strip + stat badges
4. **Team Stats Bento** — Grid of stat cards showing team performance
5. **Roster Cards** — Player avatars with stats (for "Built for Teams" messaging)

### Step 2: Build the glass card
Wrap the hero component in the GolfHelm glass card:

```css
.glass-card {
  background: rgba(255, 255, 255, 0.7);
  border: 1px solid rgba(255, 255, 255, 0.5);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border-radius: 20px;
  box-shadow: 0 4px 16px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.6);
  padding: 32px;
}
```

For multiple cards, use slight rotation (1-3°) and stagger positioning to create depth.

### Step 3: Set the background
Choose from three treatments (see `references/creative-rules.md` for details):
- **Grass texture** (current brand — photograph with dark/green overlay)
- **Cream gradient** (dashboard-native — warm, clean, product-forward)
- **Dark aurora** (premium — for high-impact hero posts)

Add noise texture at 3-5% opacity for premium grain on any background.

### Step 4: Add typography
- **Headline:** DM Sans Bold, 48-72px, letter-spacing -0.025em, max 12 words
- **Subtext:** DM Sans Regular, 18-20px, warm-500 color, max 2 lines
- **CTA:** Green gradient button (`linear-gradient(135deg, #16a34a, #22c55e, #4ade80)`), white text, DM Sans SemiBold 16px, 12px 24px padding, 10px radius

### Step 5: Add brand elements
- GolfHelm logo/wordmark: top-left, 48px from edges
- "CoachHelm AI" badge (optional): small pill badge near the hero component
- "Helm Sports Labs" subtle footer text (optional)

---

## Output Format

Generate creatives as self-contained HTML files rendered at the exact pixel dimensions. Use inline CSS with the exact token values. The HTML should be screenshot-ready — no placeholder content, no "Lorem ipsum", no approximate values.

### HTML Template Structure

Every creative HTML file MUST follow this structure for the rendering pipeline:

```html
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=1080">
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'DM Sans', sans-serif; overflow: hidden; }
    .canvas {
      width: 1080px;
      height: 1350px; /* 1920px for stories */
      position: relative;
      /* Background goes here — cream gradient, dark aurora, or transparent for photo bg */
      background: linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 35%, #F5F0E6 70%, #EDE8DD 100%);
    }
    /* ... your creative styles ... */
  </style>
</head>
<body>
  <div class="canvas">
    <!-- Creative content here -->
  </div>
</body>
</html>
```

**Critical:** Set the `.canvas` background to `transparent` if using the compositing pipeline with a photo background (the compositor adds the background layer).

### Rendering Pipeline (tools/)

The skill includes a full rendering toolchain in `tools/`. Setup once:

```bash
cd golfhelm-creative-engine/tools
bash setup.sh
```

#### Quick Render (HTML → PNG)
```bash
node render.js creative.html                    # Feed post (1080×1350 @ 2x)
node render.js creative.html --preset=story     # Story (1080×1920 @ 2x)
node render.js creative.html --preset=square    # Square (1080×1080 @ 2x)
```

#### With Background Compositing
```bash
# Cream gradient background (default)
node creative-pipeline.js creative.html --bg-type=cream

# Dark aurora background (premium)
node creative-pipeline.js creative.html --bg-type=dark --glow

# Photo background (grass texture treatment)
node fetch-background.js grass                   # Download stock golf photos
node creative-pipeline.js creative.html --bg=backgrounds/bg-grass-1.jpg

# With logo overlay
node creative-pipeline.js creative.html --bg-type=cream --logo=logo.png
```

#### Carousel Batch (directory of slides)
```bash
# Generate all slides, save each to slide-01.html, slide-02.html, etc.
# Then render all at once:
node creative-pipeline.js ./carousel-slides/ --bg-type=cream --logo=logo.png
```

#### Stock Background Sourcing (Pixabay — free)
```bash
node fetch-background.js grass      # Close-up turf texture
node fetch-background.js fairway    # Aerial fairway landscape
node fetch-background.js sunset     # Golden hour course
node fetch-background.js dark       # Dark green abstract
node fetch-background.js morning    # Morning dew/mist
node fetch-background.js premium    # Luxury golf club scenic
```

### Pipeline Architecture

```
Claude generates HTML (this skill)
    ↓
render.js (Playwright) → pixel-perfect PNG at exact Instagram dimensions
    ↓
composite.js (Sharp) → layers: background + creative + noise + logo
    ↓
Final Instagram-ready PNG (2160×2700 retina)
```

The pipeline handles all three background treatments from `creative-rules.md`:
- **Cream gradient** — SVG-generated, exact token values
- **Dark aurora** — SVG with radial green glow
- **Grass texture** — stock photo with desaturation, darkening, and green tint

All outputs include 3% noise texture for premium grain.

---

## Quick Reference: The 10 Commandments

1. **Use real tokens** — Every color, shadow, radius, and font value comes from `design-tokens.md`
2. **Isolate components** — Never show a full dashboard screenshot
3. **Warm, not cool** — Stone/cream neutrals, never blue-gray
4. **Cream, not white** — `#FFFEFA` minimum, never `#ffffff`
5. **DM Sans only** — Never substitute fonts
6. **12 words max** — Headlines that don't fit need rewriting
7. **Realistic data** — Use the sample data library, not made-up numbers
8. **Glass everything** — The inset highlight (`inset 0 1px 0 rgba(255,255,255,0.6)`) is non-negotiable
9. **Safe zones** — 60px inset on feed, 200px top + 280px bottom on stories
10. **The ad IS the product** — If it doesn't look like it belongs in the dashboard, start over

# GolfHelm Creative Rules

These rules are distilled from competitive research across Vercel, Linear, Stripe, and Supabase design systems, adapted specifically for GolfHelm's warm-glass aesthetic. They represent what separates premium SaaS creatives from generic "AI slop."

## The Golden Rule

**Your ad IS the product.** The creative should look like a natural extension of the GolfHelm dashboard — same glass cards, same DM Sans typography, same warm cream-to-green palette. If you showed it to a user mid-session, they should think it's a new feature, not an ad.

## Canvas Specifications

### Instagram Feed (Primary)
- **Dimensions:** 1080 × 1350px (4:5 portrait)
- **Safe zone:** 60px inset from all edges
- **Bottom safe zone:** 120px (Instagram UI overlay)

### Instagram Story / Reel Cover
- **Dimensions:** 1080 × 1920px (9:16)
- **Top safe zone:** 200px (camera/status bar)
- **Bottom safe zone:** 280px (swipe-up / CTA zone)

### Carousel Slides
- **Same canvas as feed** (1080 × 1350)
- **6–10 slides** for algorithmic reach
- **Consistent header/footer positioning** across slides

## Component Isolation (Never Full Screenshots)

The single most important creative rule: never screenshot the full GolfHelm dashboard. Instead, extract and magnify 1–2 high-value UI regions:

**Hero-worthy components:**
- Score prediction card (the "73" with confidence bar)
- AI Insights list (the three-item insight cards)
- Round Review scorecard (hole-by-hole with stat badges)
- Stat comparison bars (61%, 56%, 30%, 55%)
- Coach assignment card
- Practice plan module

**How to isolate:**
1. Crop the component with generous padding (32–48px)
2. Place on a glass card with `rounded-2xl` (20px) corners
3. Add the signature inset highlight: `inset 0 1px 0 rgba(255,255,255,0.6)`
4. Float it over the background with `shadow-lg` or `shadow-glass`
5. Angle slightly (1–3° rotation) for dynamism if using multiple cards

## Layout Patterns

### Pattern 1: Hero Component + Headline
Best for: Single-image feed posts, first carousel slide
```
┌─────────────────────────┐
│  [60px top safe zone]   │
│                         │
│   ┌───────────────┐     │
│   │  Glass Card   │     │
│   │  (UI Region)  │     │
│   │               │     │
│   └───────────────┘     │
│                         │
│   HEADLINE TEXT         │
│   Subtext copy          │
│                         │
│   [CTA Button]          │
│                         │
│  [120px bottom safe]    │
└─────────────────────────┘
```

### Pattern 2: Stacked Cards (Carousel Narrative)
Best for: Feature walkthroughs, "How it works" series
```
┌─────────────────────────┐
│  Step label (01/06)     │
│                         │
│   ┌───────────────┐     │
│   │  Glass Card   │     │
│   │  (Feature)    │     │
│   └───────────────┘     │
│                         │
│   Feature Headline      │
│   Brief explanation     │
│   in 1-2 lines max     │
│                         │
└─────────────────────────┘
```

### Pattern 3: Split Comparison
Best for: Before/after, stat comparisons
```
┌─────────────────────────┐
│                         │
│  ┌──────┐  ┌──────┐    │
│  │Before│  │After │    │
│  │Card  │  │Card  │    │
│  └──────┘  └──────┘    │
│                         │
│   Impact headline       │
│                         │
└─────────────────────────┘
```

## Background Treatments

### Option A: Textured Grass (Current — from mockups)
A high-res golf course turf photograph, slightly desaturated and darkened. Glass cards float above it. This is the current GolfHelm signature look.
- Desaturate 15–20% from raw photo
- Apply dark overlay: `rgba(0, 0, 0, 0.25)`
- Add subtle green tint: `rgba(22, 163, 74, 0.08)`

### Option B: Cream Gradient (Dashboard-Native)
Use the exact `cream-gradient` token for a clean, product-native feel:
```css
background: linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 35%, #F5F0E6 70%, #EDE8DD 100%);
```
Add the mesh texture at 3% opacity for premium grain.

### Option C: Dark Aurora (Premium / Nighttime)
For high-impact hero creatives:
```css
background: linear-gradient(to bottom, #0f172a, #020617);
/* Plus radial glow: */
background-image: radial-gradient(ellipse at center, rgba(22, 163, 74, 0.15), transparent 70%);
```

## Typography Rules for Creatives

### Headlines
- **Font:** DM Sans Bold (700)
- **Size:** 48–72px (display-sm to display-lg)
- **Letter-spacing:** -0.025em to -0.03em
- **Color (on dark):** `#FFFEFA` (cream-50)
- **Color (on light):** `#1c1917` (warm-900)
- **Max width:** 12 words. If longer, rewrite.

### Subtext
- **Font:** DM Sans Regular (400) or Medium (500)
- **Size:** 18–20px
- **Color:** `#78716c` (warm-500) on light, `#a8a29e` (warm-400) on dark
- **Max width:** 2 lines

### CTA Buttons
- **Background:** `linear-gradient(135deg, #16a34a 0%, #22c55e 50%, #4ade80 100%)`
- **Text:** White, DM Sans SemiBold (600), 16px
- **Padding:** 12px 24px
- **Radius:** 10px (md)
- **Shadow:** `0 4px 8px rgba(0,0,0,0.06)`

## Data Display Rules (Aspirational but Realistic)

When showing stats in creatives, use numbers that are impressive but believable for a college golfer:
- Score predictions: 70–78 range
- Improvement metrics: +2 to +8 strokes over a season
- Percentages: 55%–75% for fairways/GIR, 28–32 for putts
- Confidence bars: 70%–85% range
- Round counts: "Last 5 rounds", "Last 10 rounds"

Never show: 100% anything, sub-65 scores, or stats that would make a scratch golfer suspicious.

## What NOT to Do

1. **Never use full dashboard screenshots** — always isolate components
2. **Never use cool/blue grays** — GolfHelm is warm stone tones only
3. **Never use pure white (#ffffff)** — always cream (#FFFEFA minimum)
4. **Never use stock golf photos of pros** — this is for college teams
5. **Never use more than 2 accent colors** — green primary + amber secondary max
6. **Never exceed 12 words in a headline** — rewrite until it fits
7. **Never use generic "AI-powered" language** — be specific: "Score predictions", "Pattern detection", "Round analysis"
8. **Never approximate the glass effect** — use the exact rgba/blur/shadow values from the token system
9. **Never use Inter, Roboto, or system fonts** — DM Sans only
10. **Never generate fake UI** — always base creatives on real GolfHelm components

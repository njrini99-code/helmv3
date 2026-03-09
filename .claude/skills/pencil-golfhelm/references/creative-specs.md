# Creative Specs — GolfHelm Marketing in Pencil

> Canvas dimensions, safe zones, background treatments, and composition rules for every creative format.
>
> **⚠️ REQUIRED: Before creating ANY ad or marketing creative, read `ad-vibe-guide.md` first.**
> That file defines the visual DNA — floating device mockups, sage canvas backgrounds, editorial scattered layouts, badge elements, and the premium sports-tech aesthetic that ALL GolfHelm ads must follow.

---

## Format Reference

| Format | Width | Height | Aspect | Use Case |
|--------|-------|--------|--------|----------|
| IG Feed Post | 1080 | 1350 | 4:5 | Feature highlights, stat showcases |
| IG Square | 1080 | 1080 | 1:1 | Simple announcements, logos |
| IG Story / Reel Cover | 1080 | 1920 | 9:16 | Quick stats, event teasers |
| IG Carousel Slide | 1080 | 1350 | 4:5 | Multi-slide walkthroughs |
| Twitter/X Post | 1200 | 675 | 16:9 | Announcements, links |
| LinkedIn Post | 1200 | 627 | 1.91:1 | Professional content |
| Open Graph | 1200 | 630 | 1.91:1 | Link previews |

---

## Safe Zones

### Feed Post (1080 × 1350)
```
┌──────────────────────────────────┐
│ ← 60px →               ← 60px → │  ← Top safe: 60px
│                                  │
│   ┌──────────────────────────┐   │
│   │                          │   │
│   │     CONTENT AREA         │   │
│   │     960 × 1170           │   │
│   │                          │   │
│   └──────────────────────────┘   │
│                                  │
│ ← 60px →               ← 60px → │  ← Bottom safe: 120px
│          [interaction zone]      │
└──────────────────────────────────┘
```
- **Top:** 60px (profile pic, username overlay)
- **Bottom:** 120px (like/comment/share buttons)
- **Sides:** 60px (edge cropping on some devices)
- **Content area:** 960 × 1170px

### Story (1080 × 1920)
```
┌──────────────────────────────────┐
│         [status bar zone]        │  ← Top safe: 200px
│         [camera/back icons]      │
│ ← 48px →               ← 48px → │
│   ┌──────────────────────────┐   │
│   │                          │   │
│   │     CONTENT AREA         │   │
│   │     984 × 1440           │   │
│   │                          │   │
│   └──────────────────────────┘   │
│                                  │
│         [swipe up / CTA zone]    │  ← Bottom safe: 280px
│         [reply bar]              │
└──────────────────────────────────┘
```
- **Top:** 200px (camera, status bar, story indicators)
- **Bottom:** 280px (swipe-up, reply bar, CTA zone)
- **Sides:** 48px
- **Content area:** 984 × 1440px

---

## Background Treatments

> **NEW DEFAULT: Sage Canvas is now the primary background for ads.** See `ad-vibe-guide.md` for the full sage palette and rationale. Cream gradient is now secondary, used only for product-native content that should feel like the dashboard itself.

### 0. Sage Canvas (NEW DEFAULT — Primary Ad Background)
Muted green canvas that echoes the golf course. Creates editorial photography-studio feel.

```javascript
canvas=I(document, {type: "frame", width: 1080, height: 1350, name: "GolfHelm Ad",
  fill: {type: "gradient", gradientType: "linear", rotation: 170, colors: [
    {color: "#B5C0AD", position: 0},
    {color: "#A8B5A0", position: 0.4},
    {color: "#97A78F", position: 0.75},
    {color: "#8B9E82", position: 1}
  ]}
})
```

**Best for:** All ads, feature highlights, carousels, story content — the default choice

### 1. Cream Gradient (Product-Native — Secondary)
The default — feels like a natural extension of the GolfHelm dashboard.

```javascript
// Pencil batch_design
canvas=I(document, {type: "frame", width: 1080, height: 1350,
  fill: {type: "gradient", gradientType: "linear", rotation: 180, colors: [
    {color: "#FFFEFA", position: 0},
    {color: "#FDF9F0", position: 0.35},
    {color: "#F5F0E8", position: 0.70},
    {color: "#EDE8DD", position: 1}
  ]}
})
```

**Best for:** Feature highlights, dashboard showcases, "clean" product-forward posts

### 2. Dark Aurora (Premium)
High-impact dark mode with subtle green glow.

```javascript
canvas=I(document, {type: "frame", width: 1080, height: 1350,
  fill: {type: "gradient", gradientType: "linear", rotation: 180, colors: [
    {color: "#0f172a", position: 0},
    {color: "#020617", position: 1}
  ]}
})
// Add green glow overlay frame
glow=I(canvas, {type: "ellipse", width: 800, height: 600,
  x: 140, y: 375,
  fill: "rgba(22, 163, 74, 0.15)",
  effect: [{type: "background_blur", radius: 100}]
})
```

**Glass cards on dark:**
```javascript
darkCard=I(canvas, {type: "frame",
  fill: "rgba(255, 255, 255, 0.08)",
  stroke: {align: "inside", fill: "rgba(255, 255, 255, 0.12)", thickness: 1},
  cornerRadius: "$--radius-2xl",
  effect: [{type: "background_blur", radius: 16}]
})
```

**Best for:** Hero posts, "Coming Soon" teasers, nighttime posting schedule

### 3. Grass Texture (Brand Photography)
Real golf photography with branded overlay treatment.

```javascript
// Use G() to fetch a stock golf photo, then overlay
canvas=I(document, {type: "frame", width: 1080, height: 1350, placeholder: true})
G(canvas, "stock", "golf course fairway aerial green grass texture")
// Add dark overlay for text readability
overlay=I(canvas, {type: "frame", width: 1080, height: 1350,
  fill: "rgba(0, 0, 0, 0.45)"
})
```

**Best for:** Emotional/aspirational posts, team culture content, event promotions

---

## Composition Rules

### The Ad IS the Product
Every creative must look like a natural extension of the GolfHelm dashboard. The UI component is the hero — not a stock photo, not a generic graphic.

### Component Isolation
- **DO:** Isolate 1-2 UI components from the dashboard
- **DON'T:** Show full dashboard screenshots (too busy, too small)
- **DO:** Wrap components in glass cards with proper shadows
- **DON'T:** Show raw UI without creative framing

### Visual Hierarchy (top → bottom)
1. **UI Component** — The glass card hero (largest element, ~50% of content area)
2. **Headline** — DM Sans Bold, 48-72px, max 12 words
3. **Subtext** — DM Sans Regular, 18-20px, 1-2 lines, warm-500 color
4. **CTA Button** — Green gradient, white text, or Button/Large component

### Typography Rules
```
Headline:    DM Sans Bold 48-72px, letter-spacing -0.025em, $--foreground
Subtext:     DM Sans Regular 18-20px, $--muted-foreground
CTA text:    DM Sans SemiBold 16-18px, white
Stat number: DM Sans Bold 36-72px, letter-spacing -0.03em, $--foreground
Label:       DM Sans Medium 13-14px, $--muted-foreground
```

### Color Budget
- Max 2 accent colors per creative
- Primary palette: cream bg + green accents + warm neutrals
- Never introduce blue, purple, or cool grays
- Dark mode: slate-900/950 bg + green glow + white/warm text

### Spacing
- Edge margins: 60px (feed), 48px (story)
- Between sections: 32-48px
- Card padding: 24-32px
- Element gap within cards: 12-16px

---

## Carousel Architecture

### Slide Sequence (6-10 slides)

| Slide | Purpose | Visual Treatment |
|-------|---------|-----------------|
| **1 — Hook** | Stop the scroll | Bold headline + single stunning glass card. Minimal text. |
| **2-3 — Problem** | Pain point | Text-heavy with small supporting icons/badges. "Sound familiar?" tone. |
| **4-7 — Solution** | One feature per slide | Each slide: one isolated UI component in glass card + benefit headline |
| **8-9 — Proof** | Stats/social proof | Stat cards, improvement metrics, team data |
| **10 — CTA** | Convert | Clean CTA button + "Get Started Free" + website URL |

### Carousel Consistency Rules
- **Same background** on every slide (cream, dark, or grass)
- **Logo** in same position: top-left, 48px from edges
- **Slide counter** in same position: "4/10" bottom-center or top-right
- **Headline position** consistent across slides
- **Glass card placement** varies for visual rhythm but stays in content area

### Carousel Pencil Pattern
```javascript
// Create all slides as separate frames
slide1=I(document, {type: "frame", width: 1080, height: 1350, name: "Slide 1 - Hook",
  fill: {type: "gradient", gradientType: "linear", rotation: 180, colors: [
    {color: "#FFFEFA", position: 0}, {color: "#EDE8DD", position: 1}
  ]},
  placeholder: true
})
slide2=I(document, {type: "frame", width: 1080, height: 1350, name: "Slide 2 - Problem",
  fill: {type: "gradient", gradientType: "linear", rotation: 180, colors: [
    {color: "#FFFEFA", position: 0}, {color: "#EDE8DD", position: 1}
  ]},
  placeholder: true,
  positionDirection: "right", positionPadding: 40
})
// ... continue for each slide
```

---

## Headline Templates

### Feature Highlights
- "Your AI-Powered Golf Coach"
- "Patterns Your Coach Can't See"
- "Every Round, Reviewed by AI"
- "Your Team's Command Center"
- "Structured Improvement Plans"
- "Know Your Score Before You Play"

### Problem/Pain Points
- "Still Using Spreadsheets?"
- "Your Best Players Are Guessing"
- "Coaching Blind Spots Cost Wins"
- "Post-Round Reviews Take Hours"

### Stats/Proof
- "72.4 → 70.1 in One Season"
- "3.2 Strokes Gained Per Player"
- "91% Prediction Accuracy"
- "12 Teams Already Use CoachHelm"

### CTA Slides
- "Get Started Free →"
- "See It In Action →"
- "Built for College Golf →"
- "Your Team Deserves Better →"

---

## Don'ts Checklist

- ❌ Never use stock pro golf photos (PGA/LPGA imagery)
- ❌ Never use pure white (#ffffff) backgrounds
- ❌ Never use cool/blue grays
- ❌ Never use Inter, Roboto, or system fonts
- ❌ Never show full dashboard screenshots (isolate components)
- ❌ Never exceed 12 words in headlines
- ❌ Never use more than 2 accent colors
- ❌ Never use generic "AI-powered" as the primary message
- ❌ Never skip the glass card treatment on UI components
- ❌ Never place content in safe zones (top/bottom margins)

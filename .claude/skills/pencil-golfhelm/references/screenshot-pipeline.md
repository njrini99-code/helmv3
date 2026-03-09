# Screenshot Pipeline — Capturing GolfHelm UI for Pencil

> How to capture live GolfHelm screenshots and import them into Pencil designs.

---

## Overview

The pipeline captures actual GolfHelm UI (running locally or in production), saves screenshots to a shared folder, and imports them as image fills on Pencil frames — letting you composite real product UI into marketing creatives and mockups.

```
GolfHelm App (browser)
    ↓ Playwright / DevTools / Manual
Screenshots saved to helmv3/design/screenshots/
    ↓ Pencil batch_design
Imported as image fills on frames
    ↓ Overlay glass cards, text, branding
Final marketing creative or mockup
```

---

## Directory Setup

```bash
# Create the screenshot directory (if it doesn't exist)
mkdir -p helmv3/design/screenshots
```

All screenshots should be saved here so Pencil can reference them via relative paths.

---

## Capture Methods

### Method 1: Playwright (Recommended — Automated)

Best for repeatable, full-page or element-specific captures.

```bash
# Install Playwright if needed
npx playwright install chromium

# Full page screenshot
npx playwright screenshot http://localhost:3000/golf/dashboard/hub \
  --viewport-size=1440,900 \
  --full-page \
  helmv3/design/screenshots/player-hub.png

# Specific viewport (no scroll)
npx playwright screenshot http://localhost:3000/golf/dashboard/hub \
  --viewport-size=1440,900 \
  helmv3/design/screenshots/player-hub-viewport.png
```

#### Playwright Script for Element Isolation
```javascript
// capture-element.js
const { chromium } = require('playwright');

async function captureElement(url, selector, outputPath) {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(url, { waitUntil: 'networkidle' });

  // Wait for the element to be visible
  await page.waitForSelector(selector, { state: 'visible' });

  // Screenshot just the element
  const element = await page.$(selector);
  await element.screenshot({ path: outputPath });

  await browser.close();
}

// Usage examples:
// Score prediction card
captureElement(
  'http://localhost:3000/golf/dashboard/coachhelm',
  '[data-testid="score-prediction"]',
  'helmv3/design/screenshots/score-prediction.png'
);

// Insights feed
captureElement(
  'http://localhost:3000/golf/dashboard/insights',
  '.insights-feed',
  'helmv3/design/screenshots/insights-feed.png'
);
```

### Method 2: Browser DevTools (Manual — Quick)

1. Open GolfHelm in Chrome at the target page
2. Open DevTools (Cmd+Option+I)
3. Click the device toolbar icon (Cmd+Shift+M)
4. Set viewport to **1440 × 900**
5. Right-click any element → "Capture node screenshot"
6. Or use DevTools command palette (Cmd+Shift+P) → "Capture full size screenshot"
7. Save to `helmv3/design/screenshots/`

### Method 3: Claude in Chrome MCP

If Claude in Chrome is connected, use the browser automation tools:

```
1. Navigate to GolfHelm URL
2. Take screenshot using computer tool
3. Save screenshot to helmv3/design/screenshots/
```

---

## Recommended Screenshots

Capture these for the most commonly needed creative and mockup assets:

### Dashboard Screens (1440 × 900)

| Screenshot | URL Path | Notes |
|-----------|----------|-------|
| `player-hub.png` | `/golf/dashboard/hub` | Player home — welcome, stats, upcoming |
| `coach-dashboard.png` | `/golf/dashboard` | Coach home with sidebar |
| `coachhelm-insights.png` | `/golf/dashboard/insights` | AI insights feed |
| `round-review.png` | `/golf/dashboard/rounds/[id]/review` | Round review with scorecard |
| `team-stats.png` | `/golf/dashboard/stats/team` | Team stats bento grid |
| `score-prediction.png` | `/golf/dashboard/coachhelm` | Score prediction card |
| `calendar.png` | `/golf/dashboard/calendar` | Calendar view |
| `roster.png` | `/golf/dashboard/roster` | Team roster grid |
| `qualifiers.png` | `/golf/dashboard/qualifiers` | Qualifier leaderboard |
| `intelligence-hub.png` | `/golf/dashboard/intelligence` | Coach intelligence hub |
| `development-plans.png` | `/golf/dashboard/development` | Player development plans |
| `messages.png` | `/golf/dashboard/messages` | Messaging interface |

### Isolated Components (element screenshots)

| Screenshot | Selector Hint | Notes |
|-----------|--------------|-------|
| `card-score-prediction.png` | Score prediction widget | Big number + confidence + range |
| `card-insight.png` | Single insight card | Emoji + title + description + confidence |
| `card-round-summary.png` | Round summary card | Score + course + date + key stats |
| `stat-card-grid.png` | Stats bento grid section | 4-6 stat cards in grid |
| `sidebar-nav.png` | Sidebar element | Full sidebar with active state |
| `scorecard-strip.png` | 18-hole scorecard | Horizontal hole-by-hole strip |

---

## Importing into Pencil

### Basic Image Fill
```javascript
// Create a frame and apply the screenshot as an image fill
frame=I(parent, {type: "frame", width: 600, height: 400,
  fill: {type: "image", url: "../../design/screenshots/player-hub.png", mode: "fill"},
  cornerRadius: "$--radius-2xl"
})
```

### With Shadow (floating card effect)
```javascript
frame=I(parent, {type: "frame", width: 600, height: 400,
  fill: {type: "image", url: "../../design/screenshots/score-prediction.png", mode: "fill"},
  cornerRadius: "$--radius-2xl",
  effect: [
    {type: "shadow", shadowType: "outer", offset: {x: 0, y: 8}, blur: 24, color: "#00000014"},
    {type: "shadow", shadowType: "outer", offset: {x: 0, y: 2}, blur: 6, color: "#0000000a"}
  ]
})
```

### With Rotation (depth/perspective effect)
```javascript
// Slight rotation for marketing creative depth
frame=I(parent, {type: "frame", width: 600, height: 400,
  fill: {type: "image", url: "../../design/screenshots/insights-feed.png", mode: "fill"},
  cornerRadius: "$--radius-2xl",
  rotation: -2,
  effect: [
    {type: "shadow", shadowType: "outer", offset: {x: 0, y: 12}, blur: 32, color: "#0000001a"}
  ]
})
```

### Stacked Cards (multiple screenshots with depth)
```javascript
// Back card (slightly rotated, smaller, faded)
back=I(parent, {type: "frame", width: 550, height: 370,
  fill: {type: "image", url: "../../design/screenshots/team-stats.png", mode: "fill"},
  cornerRadius: "$--radius-2xl",
  rotation: 3, opacity: 0.7,
  x: 30, y: 20,
  effect: [{type: "shadow", shadowType: "outer", offset: {x: 0, y: 4}, blur: 16, color: "#00000010"}]
})

// Front card (prominent, centered)
front=I(parent, {type: "frame", width: 600, height: 400,
  fill: {type: "image", url: "../../design/screenshots/score-prediction.png", mode: "fill"},
  cornerRadius: "$--radius-2xl",
  x: 0, y: 0,
  effect: [{type: "shadow", shadowType: "outer", offset: {x: 0, y: 8}, blur: 24, color: "#00000014"}]
})
```

---

## Creative Composition Patterns

### Pattern 1: Screenshot Hero + Text Below
The most common layout. One screenshot card as the visual hero, text content underneath.

```javascript
// On a 1080×1350 canvas:
heroFrame=I(canvas, {type: "frame", width: 880, height: 550,
  fill: {type: "image", url: "../../design/screenshots/score-prediction.png", mode: "fill"},
  cornerRadius: "$--radius-2xl",
  x: 100, y: 160,
  effect: [{type: "shadow", shadowType: "outer", offset: {x: 0, y: 8}, blur: 24, color: "#00000014"}]
})

headline=I(canvas, {type: "text", content: "Know Your Score\nBefore You Play",
  fill: "$--foreground", fontFamily: "$--font-primary", fontSize: 56, fontWeight: "700",
  letterSpacing: -0.025, textAlign: "center",
  x: 100, y: 780, width: 880
})
```

### Pattern 2: Glass Card Overlay on Screenshot
Screenshot as background, glass card with additional info layered on top.

```javascript
bgFrame=I(canvas, {type: "frame", width: 1080, height: 1350,
  fill: {type: "image", url: "../../design/screenshots/player-hub.png", mode: "fill"},
  clip: true
})

// Dark overlay for readability
overlay=I(canvas, {type: "frame", width: 1080, height: 1350,
  fill: "rgba(0, 0, 0, 0.3)"
})

// Glass info card
infoCard=I(canvas, {type: "frame", layout: "vertical",
  fill: "$--glass-prominent-bg",
  stroke: {align: "inside", fill: "$--glass-prominent-border", thickness: 1},
  cornerRadius: "$--radius-2xl",
  padding: 32, gap: 16,
  width: 700, x: 190, y: 800,
  effect: [{type: "background_blur", radius: 20}]
})
```

---

## File Naming Convention

```
helmv3/design/screenshots/
├── player-hub.png                    # Full page screenshots
├── coach-dashboard.png
├── coachhelm-insights.png
├── round-review.png
├── card-score-prediction.png         # Isolated component screenshots (prefix: card-)
├── card-insight.png
├── card-round-summary.png
├── stat-card-grid.png
└── sidebar-nav.png
```

Use descriptive kebab-case names. Prefix isolated components with `card-` or `component-` to distinguish from full-page captures.

---

## Tips

- **Retina captures:** Use `--device-scale-factor=2` in Playwright for 2x resolution (recommended for marketing creatives)
- **Consistent state:** Log in as a specific test user so data is consistent across screenshots
- **Light mode only:** GolfHelm is light-mode-first; always capture in light mode unless specifically building a dark creative
- **Wait for animations:** Add `await page.waitForTimeout(1000)` after navigation to let skeleton loaders resolve
- **Crop generous:** Capture slightly more than needed — you can always crop in Pencil with `clip: true`

# GolfHelm Feature Templates for Pencil

> Pre-built frame recipes for each major feature. Copy these patterns to quickly scaffold any GolfHelm screen.

---

## Coach Dashboard — Intelligence Hub

**Screen size:** 1440 × 900 (desktop)
**Layout:** Sidebar (240px) + Main content area

```javascript
// Scaffold
screen=I(document, {type: "frame", layout: "horizontal", width: 1440, height: 900, fill: "$--background", placeholder: true})
sidebar=I(screen, {type: "ref", ref: "d5ZTS", height: "fill_container"})
main=I(screen, {type: "frame", layout: "vertical", width: "fill_container", height: "fill_container", padding: 32, gap: 24})

// Header row
header=I(main, {type: "frame", layout: "horizontal", width: "fill_container", justifyContent: "space_between", alignItems: "center"})
title=I(header, {type: "text", content: "Intelligence Hub", fill: "$--foreground", fontFamily: "$--font-primary", fontSize: 30, fontWeight: "700", letterSpacing: -0.025})
btn=I(header, {type: "ref", ref: "ZETEA"})

// Stats row (4 stat cards)
stats=I(main, {type: "frame", layout: "horizontal", width: "fill_container", gap: 16})
// ... insert 4 glass stat cards with fill_container width
```

**Key components to use:**
- Sidebar (`d5ZTS`) with nav items (`dOLzc`, `X6nwq`)
- Card (`ERkuB`) for insight panels
- Data Table (`yLiVX`) for player comparisons
- Progress (`W4YFH`) for confidence bars
- Alert/Info (`ITZkn`) for AI recommendations

---

## Player Hub (Home)

**Layout:** Full-width, no sidebar, card grid

```javascript
screen=I(document, {type: "frame", layout: "vertical", width: 1440, height: 900, fill: "$--background", padding: [32, 48], gap: 24, placeholder: true})

// Welcome header
welcome=I(screen, {type: "frame", layout: "vertical", gap: 8})
greeting=I(welcome, {type: "text", content: "Good morning, Tyler", fill: "$--foreground", fontFamily: "$--font-primary", fontSize: 30, fontWeight: "700"})
sub=I(welcome, {type: "text", content: "Here's what's happening with your game", fill: "$--muted-foreground", fontFamily: "$--font-primary", fontSize: 16})

// Bento grid
grid=I(screen, {type: "frame", layout: "horizontal", width: "fill_container", gap: 16})
// Left column (60%)
left=I(grid, {type: "frame", layout: "vertical", width: "fill_container", gap: 16})
// Right column (40%)
right=I(grid, {type: "frame", layout: "vertical", width: 400, gap: 16})
```

**Key cards for Player Hub:**
- Score Prediction (custom glass card with big number)
- Upcoming Events (Card with list items)
- Recent Round Summary (Card Action `wg5F3`)
- Tasks Due (Checkbox list in Card)
- AI Insight of the Day (Alert/Info styled)

---

## Round Review

**Layout:** Full-width with scorecard strip

```javascript
screen=I(document, {type: "frame", layout: "vertical", width: 1440, height: 1200, fill: "$--background", padding: [32, 48], gap: 24, placeholder: true})

// Header with round info
header=I(screen, {type: "frame", layout: "horizontal", width: "fill_container", justifyContent: "space_between"})
// ... round name, date, course

// Score strip (18 holes)
strip=I(screen, {type: "frame", layout: "horizontal", width: "fill_container", gap: 2, clip: true, cornerRadius: "$--radius-2xl"})
// Each hole is a narrow column with hole#, par, score, colored by performance

// AI Review section
review=I(screen, {type: "frame", layout: "vertical", width: "fill_container", gap: 16})
// Glass cards with AI analysis for each category (driving, approach, short game, putting)
```

---

## CoachHelm Insights

**Layout:** Sidebar + stacked insight cards

**Key components:**
- Alert variants for different insight types
- Icon Labels for categories (Success, Orange, Violet, Secondary)
- Cards with expandable detail sections
- Progress bars for confidence/impact scores

---

## Team Stats / Analytics

**Layout:** Sidebar + bento grid of stat cards + data table

**Key components:**
- Tabs (`Kbr4h`) for time periods (Season, Month, Week)
- Custom stat cards (see Stat Card recipe in SKILL.md)
- Data Table (`yLiVX`) for detailed comparisons
- Progress (`W4YFH`) for visual bars

---

## Calendar & Events

**Layout:** Sidebar + calendar grid + event detail panel

**Key components:**
- Custom month grid frame (7 columns)
- Card (`ERkuB`) for event details
- Icon Labels for event types (Practice, Match, Travel)
- Button/Default for RSVP actions

---

## Marketing Creative — IG Feed Post

**Canvas:** 1080 × 1350px

```javascript
canvas=I(document, {type: "frame", width: 1080, height: 1350, layout: "vertical", alignItems: "center", justifyContent: "center", gap: 32, placeholder: true,
  fill: {type: "gradient", gradientType: "linear", rotation: 180, colors: [
    {color: "#FFFEFA", position: 0},
    {color: "#FDF9F0", position: 0.35},
    {color: "#F5F0E8", position: 0.70},
    {color: "#EDE8DD", position: 1}
  ]}
})

// Hero glass card with UI component
hero=I(canvas, {type: "frame", layout: "vertical", width: 800, ...glassStyles, padding: 32})
// ... populate with feature content

// Headline
headline=I(canvas, {type: "text", content: "Your AI Golf Coach", fill: "$--foreground", fontFamily: "$--font-primary", fontSize: 64, fontWeight: "700", letterSpacing: -0.03, textGrowth: "fixed-width", width: 900, textAlign: "center"})

// CTA Button
cta=I(canvas, {type: "ref", ref: "ZGI9Z"})
U(cta+"/[label-id]", {content: "Get Started Free →"})
```

---

## Marketing Creative — IG Story

**Canvas:** 1080 × 1920px
**Safe zones:** Top 200px, Bottom 280px

Same pattern as feed post but vertical with larger spacing and safe zone awareness.

---

## Sample Data for Mockups

Use these realistic values in any GolfHelm mockup:

**Scores:** 70, 72, 73, 74, 75, 76, 78
**Scoring average:** 72.4, 73.8, 74.1, 75.6
**Improvement:** +2.1, +3.4, +5.2, -1.8
**Putts per round:** 28, 29, 30, 31, 32
**GIR %:** 55%, 61%, 67%, 72%
**Fairways hit:** 58%, 64%, 71%
**Confidence scores:** 72%, 78%, 84%, 91%
**AI prediction range:** 71-76, 72-78, 73-79
**Player names:** Tyler M., Sarah K., James R., Olivia T., Marcus W.
**Rounds played:** 8, 12, 15, 22, 31
**Course names:** TPC Sawgrass, Pinehurst No. 2, Augusta National, Pebble Beach, Whistling Straits

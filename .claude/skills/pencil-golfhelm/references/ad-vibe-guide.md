# GolfHelm Ad Vibe Guide — Style & Creative Direction

> **This is the primary style reference for ALL GolfHelm marketing creatives.**
> When creating any ad, social post, marketing mockup, or promotional asset in Pencil, follow these rules EXACTLY. They define the visual DNA of how GolfHelm presents itself to the world.

---

## The Vibe in One Sentence

**Premium sports-tech meets editorial magazine — floating product mockups on muted organic canvases, with bold confident typography and real golf atmosphere woven into every pixel.**

---

## Core Aesthetic Pillars

### 1. FLOATING DEVICE MOCKUPS — The Hero Treatment

The product is always the star, but never as a flat screenshot. GolfHelm screens float in 3D space as physical objects — phones tilted at slight angles, laptops with perspective depth, tablets showing the dashboard in context.

**Rules:**
- Phone mockups: rounded corners (radius 40-48px), realistic status bar (9:41, signal bars, battery), subtle drop shadow underneath creating "floating" effect
- Perspective tilt: 3-8° rotation for dynamism. Never perfectly flat, never more than 12° (becomes gimmicky)
- Shadow treatment: Large soft shadow beneath the device — `blur: 60-80px, spread: -10px, opacity: 0.15-0.25` — creates the "hovering above the canvas" illusion
- Multi-device: Show coach view on laptop/desktop + player view on mobile simultaneously when possible. Coach = authority, Player = accessibility
- Screen content: ALWAYS show real GolfHelm UI — CoachHelm insights, stat cards, round reviews, development plans. Never generic placeholder data. Use realistic player names, realistic stats, realistic golf metrics
- Device frames: Minimal bezels. Dark frame color (#1c1917 warm-900) for phones. Silver/space gray for laptops. No chunky frames that distract from UI content

**Size relationships:**
- Single phone: 55-65% of content area height
- Phone pair: Two phones, one slightly behind/overlapping, staggered 60px vertically
- Laptop + phone: Laptop at 50% width, phone overlapping at 30% width, phone positioned right and slightly forward
- Three devices (rare, hero shots): Desktop center, phone left tilted, tablet right tilted — creates a "command center" composition

### 2. MUTED ORGANIC CANVAS — The Background Philosophy

Backgrounds are never sterile. They breathe. They feel like the natural environment where golf lives — sage greens, warm creams, soft olive tones. Think: the color of a golf course at golden hour, filtered through linen.

**Canvas palette (in order of frequency):**

| Treatment | Colors | When to Use | Mood |
|-----------|--------|-------------|------|
| **Sage Canvas** | `#A8B5A0` to `#8B9E82` | Default for most ads | Calm, natural, premium |
| **Warm Cream** | `#FFFEFA` to `#EDE8DD` | Product-native, clean | Approachable, bright |
| **Dark Aurora** | `#0f172a` to `#020617` + green glow | Premium/nighttime | Sophisticated, exclusive |
| **Olive Depth** | `#3D4A38` to `#2C3527` | Dark but earthy | Serious, competitive |
| **Cream-Sage Gradient** | `#FFFEFA` → `#C5CEBD` | Hybrid, versatile | Fresh, inviting |

**IMPORTANT — Sage Canvas is the NEW default.** The reference images overwhelmingly use muted green/sage/olive backgrounds rather than pure cream. This creates:
- Visual differentiation from every other SaaS ad (which uses white/gray)
- Natural association with golf (green = fairway = the sport itself)
- A "editorial photography studio" feel — devices displayed on a muted backdrop like objects in a catalog
- Warmth without being loud

**Sage Canvas Pencil code:**
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

**Background texture treatment:**
Add a subtle noise/grain overlay at 3-5% opacity to prevent the canvas from feeling digitally flat. This mimics the paper/fabric texture visible in the reference images.

### 3. BOLD CONFIDENT TYPOGRAPHY — The Voice

Headlines are large, bold, and unapologetic. They command attention. They don't whisper — they state with authority. The typography feels like a premium sports brand crossed with a tech company.

**Headline treatment:**
- Font: DM Sans Bold (primary) or Playfair Display Bold (editorial accent)
- Size: 56-80px for primary headlines on feed posts, 36-48px on stories
- Letter-spacing: -0.025em to -0.04em (tight, confident, compressed)
- Line height: 1.0 to 1.1 (headlines are TIGHT, not airy)
- Color: `#1c1917` on light canvases, `#FFFFFF` on dark
- Max words: 6-8 for primary headline (shorter than before — punchier)

**Emphasis word technique (from Avola reference):**
One word in the headline uses a different treatment to create a focal point:
- Italic version of same font: "Find *your* next edge"
- Color accent: "Your team's **green[command]** center"
- Underline or highlight bar behind one word

**Supporting text:**
- Font: DM Sans Regular, 16-20px
- Color: warm-500 (#78716c) on light, warm-200 (#e7e5e4) on dark
- Max 2 lines. If you need more than 2 lines, the headline isn't doing its job.

**Stat numbers as typography:**
Large stat numbers (from the dashboard) become typographic elements in the ad:
- Size: 64-120px, DM Sans Bold
- Color: primary green (#15803D) or foreground (#1c1917)
- Always paired with a small label beneath (12-14px, muted)
- Example: "72.4" massive, "Avg Score" tiny beneath

### 4. SCATTERED EDITORIAL LAYOUT — The Composition

Forget rigid grids. The reference images use a scattered magazine-spread aesthetic where elements are deliberately placed at slight offsets, overlapping naturally, creating visual rhythm.

**Composition principles:**
- **Asymmetric balance:** Nothing is perfectly centered. The main device mockup sits at 55-60% from left, creating visual tension
- **Overlap is good:** Cards overlap device edges by 10-20%. Phone mockups overlap each other. Text can bleed into image areas with proper contrast
- **Z-depth layering:** Background (canvas) → mid-ground (supporting graphics, blurred elements) → foreground (device mockup, main text). At least 3 depth layers.
- **Breathing room:** Despite the scattered feel, maintain generous margins. The sage canvas should be visible — it's part of the design, not just filler
- **Rotation:** Supporting cards, badge elements, and secondary frames can be rotated 2-5° for dynamism. The PRIMARY device stays upright or max 5° tilt.

**Layout patterns (pick one per ad):**

| Pattern | Description | Best For |
|---------|-------------|----------|
| **Hero Center** | One large device mockup centered, headline above, CTA below | Single feature highlights |
| **Dual Stack** | Two phones side-by-side, slightly staggered, overlapping | Coach vs Player comparison |
| **Editorial Spread** | Laptop left + floating cards scattered right | Dashboard showcases, feature tours |
| **Stat Wall** | 3-4 large stat numbers arranged in a bento-style grid | Social proof, results content |
| **Perspective Tilt** | All elements on a 5-8° perspective plane | Premium, modern feel |
| **Scattered Cards** | 3-5 UI cards floating at various angles on sage canvas | Brand awareness, overview posts |

### 5. BADGE & PILL ELEMENTS — The Detail Layer

The reference images consistently use small badge/pill elements that add information density without clutter. These are floating annotation-style elements that call attention to specific features.

**Badge types:**
- **Status pills:** Rounded-full, small text (12-13px), solid fill. "AI-Powered" in green, "Real-Time" in warm-800, "CoachHelm" in gradient green
- **Feature tags:** Outline style, rounded-lg. "Putting Analysis", "Team Stats", "Round Review"
- **Data callouts:** Small cards (120-160px wide) with a stat + label, floating near the relevant part of the device mockup. Connected by a subtle thin line or just proximity.
- **Glow badges:** On dark backgrounds, badges get a subtle green glow shadow (`rgba(22, 163, 74, 0.3), blur: 12px`)

**Placement:** Scattered around the device mockup, pointing to features. 2-4 badges per ad maximum. They should feel like "annotation bubbles" — as if someone is pointing out cool features.

### 6. REAL GOLF ATMOSPHERE — The Environmental Layer

The sport itself should be felt, not just shown. Golf course imagery, equipment, and environmental textures add authenticity.

**How to integrate golf atmosphere:**
- **Blurred background photography:** A golf course photo at 15-25% opacity behind the sage canvas, adding texture without competing with UI
- **Equipment as props:** A golf ball, tee, or club head placed at the edge of the composition as a physical prop. Use G() with "stock" to fetch these.
- **Color echoes:** The sage canvas already echoes fairway green. Cream echoes sand traps. This is intentional — the color palette IS the golf course, abstracted.
- **NEVER:** Full bleed golf course photos as the primary background (that's for team social media, not product ads). The product mockup is ALWAYS the hero.

### 7. GLASS CARD EXTRACTION — The Product Showcase Technique

When showing GolfHelm features in ads, don't screenshot the full dashboard. Extract individual components and present them as standalone glass cards floating in the composition.

**Extraction rules:**
- Pick 1-2 components from the dashboard that best represent the feature being advertised
- Wrap each in a glass card: `bg-white/70, backdrop-blur-xl, border: white/20, cornerRadius: 20, shadow: 0 8px 32px rgba(0,0,0,0.08)`
- Scale up 1.5-2x from actual dashboard size so details are readable at ad dimensions
- Add a subtle "screenshot glow" — a very faint green border glow on the extracted card to make it feel alive: `box-shadow: 0 0 40px rgba(22, 163, 74, 0.08)`
- On dark canvases, glass cards become: `bg-white/8, border-white/12, backdrop-blur-md`

**What to extract per feature:**
| Feature | Best Component to Extract |
|---------|--------------------------|
| CoachHelm AI | Insight card with player name + pattern description + stats |
| Round Tracking | Score entry card or hole-by-hole breakdown |
| Stats | Stat comparison card with trend arrows and improvement metrics |
| Development Plans | Focus area card with progress bar and goal |
| Qualifiers | Leaderboard card with rankings and scores |
| Calendar | Event card with date, location, team attendance |
| Player Hub | The "welcome back" dashboard header with upcoming items |

---

## Color Rules for Ads (Override for Creatives)

The standard GolfHelm palette applies, but with these creative-specific additions:

| Role | Light Canvas | Dark Canvas | Sage Canvas |
|------|-------------|-------------|-------------|
| **Canvas BG** | `#FFFEFA → #EDE8DD` | `#0f172a → #020617` | `#B5C0AD → #8B9E82` |
| **Primary text** | `#1c1917` | `#FFFFFF` | `#1c1917` |
| **Secondary text** | `#78716c` | `#d6d3d1` | `#44403c` |
| **Accent** | `#15803D` | `#22c55e` | `#15803D` |
| **Card fill** | `rgba(255,255,255,0.7)` | `rgba(255,255,255,0.08)` | `rgba(255,255,255,0.85)` |
| **Card border** | `rgba(255,255,255,0.5)` | `rgba(255,255,255,0.12)` | `rgba(255,255,255,0.6)` |
| **Badge fill** | `#15803D` | `#22c55e` | `#15803D` |
| **Badge text** | `#FFFFFF` | `#FFFFFF` | `#FFFFFF` |
| **Device frame** | `#1c1917` | `#292524` | `#1c1917` |
| **Device shadow** | `rgba(0,0,0,0.12)` | `rgba(0,0,0,0.4)` | `rgba(0,0,0,0.15)` |

---

## The Don'ts — Hard Rules

- ❌ **No flat screenshots.** Every UI element floats as a 3D object with depth.
- ❌ **No pure white backgrounds.** Sage, cream, dark, or olive only.
- ❌ **No cool grays or blues.** Everything stays warm. The only blue allowed is info-state (#3B82F6) inside UI components, never as a creative accent.
- ❌ **No generic stock photos.** If using photography, it must be golf-specific (courses, equipment, team practice).
- ❌ **No centered-everything layouts.** At least ONE major element must be asymmetric.
- ❌ **No more than 3 fonts per creative.** DM Sans + Playfair Display = sufficient. Never add a third family.
- ❌ **No tiny UI screenshots.** If text in the mockup isn't readable at the ad's native size, the mockup is too small or too zoomed out.
- ❌ **No emoji in headlines.** The brand is premium, not playful.
- ❌ **No gradients on text** (except subtle green-to-emerald on dark backgrounds for special emphasis).
- ❌ **No more than 4 badges/pills per ad.** They're accents, not the content.

---

## Pencil Quick-Start: Creating an Ad

```javascript
// STEP 1: Sage Canvas (default)
canvas=I(document, {type: "frame", width: 1080, height: 1350, name: "GH Ad — [Feature Name]",
  fill: {type: "gradient", gradientType: "linear", rotation: 170, colors: [
    {color: "#B5C0AD", position: 0},
    {color: "#A8B5A0", position: 0.4},
    {color: "#97A78F", position: 0.75},
    {color: "#8B9E82", position: 1}
  ]},
  placeholder: true
})

// STEP 2: Device mockup frame (phone)
phone=I(canvas, {type: "frame", width: 280, height: 570, cornerRadius: 40,
  fill: "$--card", stroke: {align: "outside", fill: "#1c1917", thickness: 8},
  effect: {type: "shadow", blur: 60, color: "rgba(0,0,0,0.15)", offset: {x: 0, y: 20}, spread: -10, shadowType: "outer"},
  x: 400, y: 380
})
// Slight rotation for dynamism
// Note: rotation in Pencil uses the 'rotation' property

// STEP 3: UI content inside phone (extract a glass card component)
// ... build the specific feature card here ...

// STEP 4: Headline
headline=I(canvas, {type: "text", content: "Your AI Golf Coach", fontFamily: "DM Sans",
  fontSize: 64, fontWeight: "700", fill: "#1c1917", lineHeight: 1.05,
  letterSpacing: -0.03, width: 600, x: 60, y: 120
})

// STEP 5: Subtext
sub=I(canvas, {type: "text", content: "Patterns your coach can't see. Predictions that improve every round.",
  fontFamily: "DM Sans", fontSize: 18, fontWeight: "400", fill: "#44403c",
  lineHeight: 1.5, width: 500, x: 60, y: 260
})

// STEP 6: CTA Badge
cta=I(canvas, {type: "frame", cornerRadius: 999, fill: "$--primary", padding: [14, 28],
  alignItems: "center", justifyContent: "center", x: 60, y: 1180
})
ctaText=I(cta, {type: "text", content: "Get Started Free →", fontFamily: "DM Sans",
  fontSize: 16, fontWeight: "600", fill: "#FFFFFF"
})

// STEP 7: Floating badges
badge1=I(canvas, {type: "frame", cornerRadius: 999, fill: "$--primary", padding: [6, 14],
  x: 700, y: 350
})
badge1Text=I(badge1, {type: "text", content: "AI-Powered", fontFamily: "DM Sans",
  fontSize: 12, fontWeight: "600", fill: "#FFFFFF"
})
```

---

## Format-Specific Adjustments

### Instagram Feed (1080 × 1350)
- Phone mockup: 280-320px wide, centered-right
- Headline: top-left quadrant, 56-72px
- Max 1 device mockup + 2-3 floating elements

### Instagram Story (1080 × 1920)
- Phone mockup: 300-360px wide, centered
- Headline: centered above phone, 44-56px
- Vertical flow: headline → phone → CTA
- Remember safe zones (200px top, 280px bottom)

### Instagram Carousel (1080 × 1350 per slide)
- Slide 1 (Hook): Bold headline + single dramatic device mockup
- Slides 2-3 (Problem): Text-dominant, small icons, warm-500 text color
- Slides 4-7 (Solution): One extracted glass card per slide + benefit headline
- Slide 8-9 (Proof): Large stat numbers as typographic hero
- Slide 10 (CTA): Clean green CTA button + URL + minimal text
- **Consistency:** Same sage canvas gradient on ALL slides. Logo position consistent. Slide counter consistent.

### Twitter/X (1200 × 675)
- Wider format: device mockup on right 50%, text on left 50%
- Headline: 36-48px (smaller due to wide format)
- Simpler composition — fewer floating elements

### LinkedIn (1200 × 627)
- Professional tone: less scattered, more structured
- Device mockup centered with text above
- Can use the Editorial Spread pattern

---

## Reference Mood Summary

The GolfHelm ad aesthetic is the intersection of:
- **Rapha cycling brand** (premium sport, editorial photography, muted earth tones)
- **Linear app marketing** (product-as-hero, dark mode elegance, confident typography)
- **Kinfolk magazine** (scattered editorial layouts, organic textures, breathing room)
- **Augusta National** (deep green, tradition meets innovation, quiet confidence)

It is NOT:
- Flashy like Nike (too aggressive)
- Minimal like Apple (too cold)
- Playful like Headspace (too casual)
- Corporate like Salesforce (too boring)

It IS: **Confident. Warm. Premium. Golf.**

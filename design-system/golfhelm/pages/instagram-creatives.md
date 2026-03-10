# Instagram Creatives Page Overrides — GolfHelm

> Rules here **override** `MASTER.md` for marketing creative output.
>
> **⚠️ REQUIRED: Read `.claude/skills/pencil-golfhelm/references/ad-vibe-guide.md` for the full creative direction.** This file is a compact summary. The vibe guide has the complete visual DNA.

## The Vibe (Summary)

**Premium sports-tech meets editorial magazine.** Floating 3D device mockups on muted sage canvases. Bold confident typography. Real golf atmosphere. Scattered editorial layouts. Badge annotations. The product IS the hero, presented as a physical object in space.

Think: Rapha cycling × Linear app marketing × Kinfolk magazine × Augusta National.

## Canvas Dimensions
- **Feed post:** 1080 × 1350 (4:5)
- **Story:** 1080 × 1920 (9:16)
- **Square:** 1080 × 1080 (1:1)
- **Carousel:** 1080 × 1350 per slide, 6-10 slides

## Safe Zones
- Feed: 60px top/sides, 120px bottom
- Story: 200px top, 280px bottom, 48px sides

## The Core Rules
1. **The Ad IS The Product** — Every creative shows real GolfHelm UI as the hero
2. **Float, Don't Flatten** — UI shown as 3D device mockups with depth/shadow, never flat screenshots
3. **Sage Is Default** — Muted sage green canvas (`#B5C0AD → #8B9E82`), not white
4. **Scatter, Don't Center** — Editorial asymmetric layouts, nothing perfectly centered
5. **Badge & Annotate** — 2-4 floating pill badges calling out features

## Background Treatments (Priority Order)
1. **Sage canvas** (DEFAULT): `#B5C0AD → #A8B5A0 → #97A78F → #8B9E82` linear gradient at 170°
2. **Dark aurora** (premium): `#0f172a → #020617` + green glow overlay `rgba(22, 163, 74, 0.15)`
3. **Cream gradient** (product-native): `#FFFEFA → #FDF9F0 → #F5F0E8 → #EDE8DD`
4. **Olive depth** (serious): `#3D4A38 → #2C3527`
5. **Grass texture**: Stock golf photo + 45% dark overlay for text readability

## Device Mockup Rules
- **Phone:** 280-320px wide, cornerRadius 40-48px, dark frame (stroke 8px #1c1917)
- **Shadow:** `blur: 60px, offset-y: 20px, color: rgba(0,0,0,0.15), spread: -10px`
- **Tilt:** 3-8° rotation for dynamism. Never flat, never >12°
- **Content:** ALWAYS real GolfHelm UI inside. Realistic names, stats, golf metrics.
- **Multi-device:** Coach view on laptop + Player view on mobile when possible

## Typography Override
- **Headline:** DM Sans Bold, 56-80px, letter-spacing -0.03em, line-height 1.05, max 6-8 words
- **Emphasis word:** One word gets italic or color accent treatment
- **Subtext:** DM Sans Regular, 16-20px, max 2 lines, warm-500 on light / warm-200 on dark
- **CTA text:** DM Sans SemiBold, 16-18px, white on green pill
- **Stat numbers:** DM Sans Bold, 64-120px, tight tracking (-0.03em), green or foreground

## Layout Patterns
| Pattern | Description | Best For |
|---------|-------------|----------|
| Hero Center | Large device centered, text above, CTA below | Single features |
| Dual Stack | Two phones staggered, overlapping | Coach vs Player |
| Editorial Spread | Laptop left + floating cards right | Dashboard showcases |
| Stat Wall | 3-4 big stat numbers in bento grid | Social proof |
| Perspective Tilt | All elements on 5-8° plane | Premium feel |
| Scattered Cards | 3-5 UI cards floating at angles | Brand awareness |

## Badge Elements
- **Status pills:** Rounded-full, 12-13px, solid green fill. "AI-Powered", "Real-Time", "CoachHelm"
- **Feature tags:** Outline style. "Putting Analysis", "Team Stats", "Round Review"
- **Data callouts:** Small cards 120-160px with stat + label, near device mockup
- **Max 4 badges per ad.** They're accents, not content.
- On dark: add green glow shadow `rgba(22, 163, 74, 0.3), blur: 12px`

## Glass Card Extraction
Extract 1-2 dashboard components. Scale 1.5-2x. Wrap in glass:
- **Light:** `bg-white/70, border-white/20, backdrop-blur-xl, shadow: 0 8px 32px rgba(0,0,0,0.08)`
- **Sage:** `bg-white/85, border-white/60, backdrop-blur-xl`
- **Dark:** `bg-white/8, border-white/12, backdrop-blur-md`
- Add screenshot glow: `0 0 40px rgba(22, 163, 74, 0.08)`

## Carousel Rules
- Same sage canvas on ALL slides
- Logo + slide counter in consistent positions
- Sequence: Hook → Problem → Solution (one feature/slide) → Proof → CTA
- Slide 1: Bold headline + single dramatic device mockup
- Slides 2-3: Text-dominant, small icons
- Slides 4-7: One extracted glass card per slide + benefit headline
- Slides 8-9: Large stat numbers as typographic hero
- Slide 10: Clean green CTA pill + URL

## Hard Don'ts
- ❌ Flat screenshots (everything floats with depth)
- ❌ Pure white backgrounds (sage, cream, dark, or olive)
- ❌ Cool grays or blues as creative accents
- ❌ Generic stock photos (golf-specific only)
- ❌ Centered-everything layouts (at least ONE element asymmetric)
- ❌ Tiny unreadable UI in mockups
- ❌ Emoji in headlines
- ❌ More than 4 badges per ad
- ❌ More than 8 words in headlines
- ❌ Content in safe zones

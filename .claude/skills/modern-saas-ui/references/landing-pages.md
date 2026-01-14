# Landing Pages and Hero Sections

Research-backed guidance for SaaS landing pages and hero sections—optimized decision funnels that communicate value and drive action.

---

## What Landing Pages Are For

NN/g: The homepage is one of the most important pages—often the first and possibly only chance to engage users. For SaaS:

- **Tight promise** — Clear value proposition
- **Clear primary path** — Single CTA (trial, demo, signup)
- **Supporting evidence** — Reduces perceived risk

Modern landing pages behave like **guided choices**: crisp thesis, then progressively answer objections with modular sections and scannable proof points.

---

## Hero Section: The 10-Second Contract

Above the fold, users decide if the page is "for them." The hero must deliver:

1. **Plain-language value proposition** — What you do
2. **Clear target user** — Who it's for
3. **Concrete next step** — Primary CTA

### Hero Anatomy (Premium)

```
┌─────────────────────────────────────────────────────────┐
│  [Logo]                    [Nav]           [CTA Button] │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ONE DOMINANT HEADLINE                                  │
│  (what you do)                                          │
│                                                         │
│  Clarifying subhead (for whom / why now)                │
│                                                         │
│  [Primary CTA]  [Secondary CTA]                         │
│                                                         │
│                    [Product Signal]                     │
│                    (screenshot/demo/snippet)            │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Hero Rules

- **One primary CTA** (demo or trial) + one secondary CTA (see product / view docs)
- **Concrete product signal** — Screenshot, short demo frame, or "how it works" snippet
- **Fast scannability** — Short lines, intentional whitespace, predictable rhythm
- **No carousels** — NN/g: many users see only the first frame; static hero is preferable
- **Protect readability** — Large type, comfortable line height, controlled backgrounds

---

## Layout: Bento as Modern Composition

Material Design: Layout arranges elements to direct attention and make action easy.

**Bento grids** encode hierarchy by size and placement:
- Large card = primary narrative
- Smaller cards = supporting details

### Avoiding "Box Soup"

The key to avoiding a generic look is **semantic sizing**:
- Every card must have a job (answering one question)
- Size should match importance of that answer
- When every card is the same = template smell

---

## Modern Aesthetics

Premium landing pages share a **conservative foundation** (grid, typography, spacing) with **controlled flourishes**:

| Element | Premium Use | Vibe-Coded Use |
|---------|-------------|----------------|
| Gradient meshes | Subtle background atmosphere | Competing with text |
| Glass/blur | Chrome only (nav, floating CTAs) | Dense text blocks |
| Glow | Single accent on primary CTA | Everywhere |
| Motion | Reinforces continuity/feedback | Decoration |

---

## Motion: Premium vs Gimmicky

**Premium motion** clarifies state and reduces friction:
- Button hover feedback
- Menu opening/closing
- Section reveals that guide reading
- Smooth state transitions

**Vibe-coded motion** is omnipresent, inconsistent, or unrelated to user intent.

### Motion Budget

Choose 2-4 recurring motions and reuse with consistent timing/easing:
1. Fade/slide for overlays
2. Subtle hover lift
3. Reveal on scroll
4. Modal transitions

Always respect `prefers-reduced-motion`.

---

## Glass on Landing Pages

Glass can look premium when it behaves like a **system**:
- Small set of material variants
- Applied consistently to chrome (nav bars, floating CTAs, small overlays)
- NOT on dense text blocks

### Making Glass Look Cheap (Avoid)

- Small text over busy imagery, assuming blur will fix it
- Complex backgrounds without contrast control
- Inconsistent blur/opacity across page

### Making Glass Look Premium

- Treat background as part of design system: controlled gradients, low noise, predictable contrast zones
- If background must be complex: raise opacity, add subtle border highlight
- Use glass on chrome, not content

---

## Implementation Rules (Avoid Template Look)

1. **Effects last** — Page should look premium in grayscale screenshot with effects removed
2. **Tokenize everything** — Spacing scale, radii, shadow levels, 2-3 glass variants max
3. **One focal moment per screen** — If hero has glass + mesh + motion, keep rest calm
4. **Prefer static clarity** — Don't hide your message in a carousel
5. **Accessibility is premium** — Ensure contrast (WCAG 1.4.3) and reduced-motion support (2.3.3)

---

## Landing Page Sections Checklist

### Hero
- [ ] One dominant headline (what you do)
- [ ] Clarifying subhead (for whom / why now)
- [ ] Primary CTA + secondary CTA
- [ ] Product signal (screenshot/demo)
- [ ] No carousel
- [ ] Readable on controlled background

### Features (Bento)
- [ ] Semantic card sizing (big = important)
- [ ] Every card has a job statement
- [ ] Consistent radii and spacing
- [ ] No "box soup" (varied weights)

### Social Proof
- [ ] Logos or testimonials
- [ ] Scannable format
- [ ] Real names/companies if possible

### Pricing
- [ ] Clear tier comparison
- [ ] One recommended tier highlighted
- [ ] Minimal gimmicks
- [ ] Easy to scan features

### Footer CTA
- [ ] One clear close-out action
- [ ] Reinforces primary CTA
- [ ] Glass chrome acceptable here

---

## Section-by-Section Glass Usage

| Section | Glass OK? | Notes |
|---------|-----------|-------|
| Nav bar | ✅ Yes | Sticky glass nav is premium |
| Hero panel | ⚠️ Careful | Only if background is controlled |
| Feature cards | ❌ Avoid | Keep solid for readability |
| Pricing cards | ❌ Avoid | Dense comparison needs clarity |
| Footer CTA | ✅ Yes | Light glass panel works well |
| Floating CTAs | ✅ Yes | Good for depth |

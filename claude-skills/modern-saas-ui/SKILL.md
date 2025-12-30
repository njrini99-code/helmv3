# Modern SaaS UI — App Enhancement Guide

Premium SaaS UI design system for Helm Sports Labs and similar products.

## Quick Start: What Am I Working On?

| Task | Go To | Visual Reference |
|------|-------|------------------|
| **Enhancing a dashboard** | [Dashboard Design](#dashboard-enhancement) | `assets/dashboard_images/` |
| **Building a landing page** | [Landing Pages](#landing-page-enhancement) | `assets/landing_images/` |
| **Adding glass/blur effects** | [Glass Materials](#glass-effects) | `assets/mockups/01-02` |
| **Fixing "template" look** | [De-Vibe Checklist](#audit-de-vibe-your-ui) | — |
| **Picking UI components** | [UI Kits Guide](references/ui-kits.md) | — |
| **Adding motion/animation** | [Motion Guide](#motion-microinteractions) | `assets/mockups/04` |
| **Full UI audit** | [Audit Checklist](#audit-de-vibe-your-ui) | — |

---

## Audit: De-Vibe Your UI

Run this before adding any new features. Order matters—fix foundation before effects.

### Step 1: Screenshot Test
Take a screenshot of your current UI. Does it pass?

- [ ] **Grayscale test**: Convert to grayscale—hierarchy should still be clear
- [ ] **Effects-off test**: Mentally remove glass/glow/motion—still looks premium?
- [ ] **Squint test**: Squint at screen—can you identify primary action?

### Step 2: Foundation Check

| Area | Check | Common Fix |
|------|-------|------------|
| **Spacing** | Consistent padding/margins? | Adopt 4/8/12/16/24/32 scale |
| **Typography** | Clear size hierarchy? | 3-4 sizes max, one dominant |
| **Radii** | Same border-radius everywhere? | Pick 2 values (cards: 16, inputs: 8) |
| **Colors** | Too many competing colors? | 1 brand accent, rest neutral |
| **Alignment** | Everything on a grid? | 8px grid alignment |

### Step 3: Hierarchy Check

- [ ] One primary action per screen (not 3 equal buttons)
- [ ] Clear grouping with whitespace
- [ ] Section rhythm is predictable
- [ ] Dense data on solid surfaces (not glass)

### Step 4: Restore Effects (Sparingly)

Only after Steps 1-3 pass:
- [ ] Glass only on chrome (nav, toolbars, overlays)
- [ ] Motion only for feedback/transitions
- [ ] One "hero moment" per page max

---

## Dashboard Enhancement

### Dashboard Structure

```
┌─────────────────────────────────────────────────┐
│  KPI ROW (3-7 metrics with deltas)              │  ← Answers "how are we doing?"
├─────────────────────────────────────────────────┤
│  TREND BAND (1-3 charts)                        │  ← Answers "why?"
├─────────────────────────────────────────────────┤
│  ACTION TABLE (where users do things)           │  ← Answers "what do I do?"
└─────────────────────────────────────────────────┘
```

### Dashboard Checklist

**KPI Cards**
- [ ] 3-7 metrics max
- [ ] Each has: label, value, delta (↑↓), trend indicator
- [ ] Consistent card sizing
- [ ] Solid surfaces (no glass on data)

**Charts**
- [ ] Direct labeling (not legends when possible)
- [ ] Minimal gridlines
- [ ] Clear annotation on anomalies
- [ ] Trend lines for "change over time"

**Tables**
- [ ] Sticky headers
- [ ] Row hover state
- [ ] Multi-select + bulk actions
- [ ] Consistent row height
- [ ] Solid background (never glass)

**Navigation**
- [ ] Command palette (⌘K) for power users
- [ ] Clear current location indicator
- [ ] Saved views accessible

---

## Landing Page Enhancement

### Hero Section Anatomy

```
┌─────────────────────────────────────────────────┐
│  [Logo]                    [Nav]    [CTA]       │
├─────────────────────────────────────────────────┤
│                                                 │
│  ONE HEADLINE (what you do)                     │
│  Subhead (for whom / why now)                   │
│                                                 │
│  [Primary CTA]  [Secondary CTA]                 │
│                                                 │
│  [Product Screenshot / Demo]                    │
│                                                 │
└─────────────────────────────────────────────────┘
```

### Landing Page Checklist

**Hero**
- [ ] One dominant headline
- [ ] Clear target audience in subhead
- [ ] Primary CTA stands out
- [ ] Product signal (screenshot/demo)
- [ ] No carousel

**Features (Bento)**
- [ ] Card size = importance
- [ ] Every card has a "job" (answers one question)
- [ ] No "box soup" (varied weights)

**Pricing**
- [ ] Easy tier comparison
- [ ] One recommended tier highlighted
- [ ] Scannable features

**Footer CTA**
- [ ] Reinforces primary action
- [ ] Glass chrome OK here

---

## Glass Effects

### When to Use Glass

| Surface | Glass OK? | Notes |
|---------|-----------|-------|
| Navigation bar | ✅ Yes | Sticky glass nav is premium |
| Filter bar | ✅ Yes | Chrome element |
| Toolbars | ✅ Yes | Floating toolbars work well |
| Modal backdrop | ✅ Yes | Blur behind modal |
| Side panels/sheets | ✅ Yes | Glass shell, solid insets |
| Data tables | ❌ No | Readability issues |
| Forms | ❌ No | Keep inputs on solid |
| KPI cards | ⚠️ Careful | Only if background controlled |
| Long text | ❌ No | Always solid |

### Glass Recipe (Tailwind)

```tsx
// Chrome glass (nav, toolbars)
className="backdrop-blur-md bg-white/70 border border-white/20"

// Overlay glass (modals, sheets)
className="backdrop-blur-lg bg-white/80 border border-white/30"

// With fallback
className="bg-white supports-[backdrop-filter]:bg-white/70 supports-[backdrop-filter]:backdrop-blur-md"
```

### Glass Anti-Patterns

- ❌ Glass on every card
- ❌ Small text over busy backgrounds
- ❌ Different blur values per element
- ❌ Glass without border highlight

---

## Motion & Microinteractions

### Motion Budget

Pick 2-4 and reuse consistently:

1. **Fade/slide** — Overlays, modals, dropdowns (150-220ms)
2. **Hover lift** — Cards, buttons (translateY -2px)
3. **Expand/collapse** — Accordions, details
4. **Page transitions** — Route changes (if any)

### Motion Timing

| Context | Duration | Easing |
|---------|----------|--------|
| Micro (hover, focus) | 150ms | ease-out |
| Small (dropdown, toast) | 220ms | ease-out |
| Medium (modal, sheet) | 320ms | ease-in-out |
| Marketing | 400-600ms | custom curves |

### Required: Reduced Motion

```css
@media (prefers-reduced-motion: reduce) {
  * { animation: none !important; transition-duration: 0.01ms !important; }
}
```

---

## Token System

Define these once, use everywhere:

```css
/* Spacing (use for all padding/margins/gaps) */
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-5: 24px;  --space-6: 32px;
--space-7: 48px;  --space-8: 64px;

/* Radii */
--radius-sm: 8px;   /* inputs, small elements */
--radius-md: 12px;  /* buttons, chips */
--radius-lg: 16px;  /* cards, panels */
--radius-xl: 24px;  /* modals, large containers */

/* Shadows */
--shadow-sm: 0 1px 2px rgba(0,0,0,0.05);
--shadow-md: 0 4px 6px rgba(0,0,0,0.07);
--shadow-lg: 0 10px 15px rgba(0,0,0,0.1);

/* Motion */
--duration-fast: 150ms;
--duration-base: 220ms;
--duration-slow: 320ms;
--ease-out: cubic-bezier(0.33, 1, 0.68, 1);
```

---

## Component Patterns

### Card

```tsx
// Base card
<div className="p-6 rounded-2xl border border-gray-200 bg-white shadow-sm
               hover:shadow-md hover:-translate-y-0.5 transition-all duration-200">

// Glass card (chrome only)
<div className="p-6 rounded-2xl border border-white/20 
               backdrop-blur-md bg-white/70 shadow-sm">
```

### Button Hierarchy

```tsx
// Primary (one per section)
<button className="px-4 py-2 rounded-lg bg-gray-900 text-white 
                   hover:bg-gray-800 transition-colors">

// Secondary
<button className="px-4 py-2 rounded-lg border border-gray-300 
                   hover:bg-gray-50 transition-colors">

// Ghost
<button className="px-4 py-2 rounded-lg hover:bg-gray-100 transition-colors">
```

---

## Benchmark: What Premium Looks Like

| Brand | Signature | Steal This |
|-------|-----------|------------|
| **Linear** | Spacing discipline + subtle lighting | Consistent 8px grid, muted colors |
| **Stripe** | Editorial typography + gradients | Large headlines, atmospheric backgrounds |
| **Vercel** | Technical clarity + high contrast | Black/white, sharp CTAs |
| **Framer** | Motion-forward + gallery | Smooth transitions, visual showcases |

The key: **a recognizable system** — premium because everything obeys the same rules.

---

## Recommended Stack for Helm

| Layer | Recommendation | Why |
|-------|----------------|-----|
| **Components** | shadcn/ui | You own the code, easy to customize |
| **Styling** | Tailwind CSS | Already using, consistent tokens |
| **Motion (marketing)** | Magic UI | Copy/paste animated components |
| **Motion (product)** | Framer Motion | Controlled, accessible |
| **Glass** | DIY with tokens | 2-3 variants max, consistent |

See [references/ui-kits.md](references/ui-kits.md) for detailed kit comparisons.

# 🎨 QUICK REFERENCE - COLOR SYSTEM

Copy-paste these exact values when building new pages.

---

## BACKGROUNDS

```tsx
// Primary sections (most common)
className="bg-white"

// Alternating sections (warm cream)
className="bg-neutral-50"

// Subtle variation
className="bg-neutral-100"

// Gradient sections (gentle)
className="bg-gradient-to-b from-neutral-50 to-white"

// Product accent sections
className="bg-helm-green-50"    // Golf
className="bg-amber-50"         // Baseball
```

---

## TEXT

```tsx
// Headings (bold, high contrast)
className="text-neutral-900"

// Strong body text
className="text-neutral-700"

// Body text (most common)
className="text-neutral-600"

// Captions/metadata
className="text-neutral-500"

// Disabled/placeholder
className="text-neutral-400"
```

---

## BORDERS

```tsx
// Standard borders
className="border border-neutral-200"

// Hover states
className="hover:border-neutral-300"

// Strong borders
className="border-2 border-neutral-300"

// Product accent borders
className="border-helm-green-200"   // Golf
className="border-amber-200"        // Baseball
```

---

## BUTTONS

### Primary CTA (Helm Green)

```tsx
<button className="px-8 py-4 rounded-xl bg-helm-green-600 text-white font-semibold shadow-lg shadow-helm-green-600/25 hover:bg-helm-green-700 transition-colors">
  Get Started
</button>
```

### Secondary CTA (White with Border)

```tsx
<button className="px-8 py-4 rounded-xl bg-white text-neutral-900 font-semibold border-2 border-neutral-200 hover:border-neutral-300 transition-colors">
  Learn More
</button>
```

### Baseball CTA (Amber)

```tsx
<button className="px-8 py-4 rounded-xl bg-amber-600 text-white font-semibold shadow-lg shadow-amber-600/25 hover:bg-amber-700 transition-colors">
  Start with BaseballHelm
</button>
```

---

## CARDS

### Standard Card

```tsx
<div className="p-8 rounded-2xl bg-neutral-50 border border-neutral-200 hover:border-helm-green-300 hover:shadow-lg hover:shadow-helm-green-600/5 transition-all duration-300">
  {/* Card content */}
</div>
```

### Elevated Card (Modals, Panels)

```tsx
<div className="p-8 rounded-2xl bg-white border border-neutral-200 shadow-xl">
  {/* Panel content */}
</div>
```

### Product Badge Card

```tsx
<div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-50 border border-helm-green-200/50">
  <div className="w-1.5 h-1.5 rounded-full bg-helm-green-500 animate-pulse" />
  <span className="text-sm font-medium text-helm-green-700">GolfHelm</span>
</div>
```

---

## ICONS

### Icon Container (Feature Cards)

```tsx
<div className="w-12 h-12 rounded-xl bg-helm-green-100 flex items-center justify-center group-hover:bg-helm-green-600 transition-colors">
  <YourIcon className="w-6 h-6 text-helm-green-600 group-hover:text-white transition-colors" />
</div>
```

### Small Icon Badge

```tsx
<div className="w-10 h-10 rounded-lg bg-helm-green-100 flex items-center justify-center">
  <YourIcon className="w-5 h-5 text-helm-green-600" />
</div>
```

---

## SHADOWS

```tsx
// Subtle card shadow
className="shadow-lg"

// Elevated panel shadow
className="shadow-xl"

// Button shadow with brand color
className="shadow-lg shadow-helm-green-600/25"

// Hover shadow with brand color
className="hover:shadow-lg hover:shadow-helm-green-600/5"
```

---

## GRADIENTS

### Background Gradients (Subtle)

```tsx
// Section gradient
className="bg-gradient-to-b from-neutral-50 to-white"

// Accent glow (very subtle)
<div className="absolute top-0 right-0 w-[500px] h-[500px] bg-helm-green-500/5 rounded-full blur-3xl" />
```

### Text Gradients (Minimal Use)

```tsx
<span className="text-transparent bg-clip-text bg-gradient-to-r from-helm-green-600 to-emerald-600">
  Gradient text
</span>
```

---

## SPACING

```tsx
// Section padding
className="py-20 md:py-32"

// Container
className="max-w-7xl mx-auto px-6"

// Gap between elements
className="gap-16"  // Major sections
className="gap-8"   // Card grids
className="gap-6"   // Form elements
className="gap-4"   // Small spacing
className="gap-3"   // Tight spacing
```

---

## TYPOGRAPHY

### Headings

```tsx
// Hero heading
className="text-5xl sm:text-6xl md:text-7xl font-bold text-neutral-900 tracking-tight leading-[1.1]"

// Section heading
className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4 leading-tight"

// Card heading
className="text-xl font-semibold text-neutral-900 mb-2"
```

### Body Text

```tsx
// Large body (hero subheadline)
className="text-xl md:text-2xl text-neutral-600 mb-12 leading-relaxed"

// Standard body
className="text-lg text-neutral-600 mb-8 leading-relaxed"

// Small body
className="text-base text-neutral-700"

// Caption
className="text-sm text-neutral-500"
```

---

## BORDER RADIUS

```tsx
// Buttons
className="rounded-xl"    // 12px

// Cards
className="rounded-2xl"   // 16px

// Small elements
className="rounded-lg"    // 8px

// Pills/badges
className="rounded-full"  // Full round
```

---

## TRANSITIONS

```tsx
// Standard transition
className="transition-colors duration-300"

// All properties
className="transition-all duration-300"

// Hover scale (buttons)
whileHover={{ scale: 1.02 }}
whileTap={{ scale: 0.98 }}
```

---

## COMMON PATTERNS

### Section Header

```tsx
<div className="text-center mb-16">
  <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4">
    Section Title
  </h2>
  <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
    Section description goes here.
  </p>
</div>
```

### Feature List Item

```tsx
<div className="flex items-start gap-3">
  <div className="flex-shrink-0 w-5 h-5 rounded-full bg-helm-green-100 flex items-center justify-center mt-0.5">
    <Check className="w-3 h-3 text-helm-green-600" />
  </div>
  <span className="text-neutral-700">Feature description</span>
</div>
```

### Product Badge

```tsx
<div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-helm-green-50 border border-helm-green-200/50 mb-6">
  <YourIcon className="w-4 h-4 text-helm-green-600" />
  <span className="text-sm font-medium text-helm-green-700">GolfHelm • Feature Name</span>
</div>
```

---

## DON'T USE

```tsx
// ❌ AVOID - Dark theme leftovers
bg-stone-950
bg-stone-900
text-white/50
text-white/40
bg-white/[0.03]
border-white/[0.06]
backdrop-blur-xl // (unless truly needed for overlay)

// ❌ AVOID - Too many effects
// Multiple glow orbs
// Fog overlays  
// Complex gradient layers
// Magnetic buttons (unnecessary)
```

---

## QUICK COPY-PASTE

### New Section Template

```tsx
function NewSection() {
  const ref = useRef<HTMLDivElement>(null)
  const isInView = useInView(ref, { once: true, margin: '-15%' })

  return (
    <section ref={ref} className="py-20 md:py-32 bg-white">
      <div className="max-w-7xl mx-auto px-6">
        {/* Header */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={isInView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.6 }}
          className="text-center mb-16"
        >
          <h2 className="text-4xl md:text-5xl font-bold text-neutral-900 mb-4">
            Your Section Title
          </h2>
          <p className="text-lg text-neutral-600 max-w-2xl mx-auto">
            Your description here.
          </p>
        </motion.div>

        {/* Content */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* Your content */}
        </div>
      </div>
    </section>
  )
}
```

### Feature Card Template

```tsx
<div className="group p-8 rounded-2xl bg-neutral-50 border border-neutral-200 hover:border-helm-green-300 hover:shadow-lg hover:shadow-helm-green-600/5 transition-all duration-300">
  <div className="w-12 h-12 rounded-xl bg-helm-green-100 flex items-center justify-center mb-6 group-hover:bg-helm-green-600 transition-colors">
    <YourIcon className="w-6 h-6 text-helm-green-600 group-hover:text-white transition-colors" />
  </div>
  <h3 className="text-lg font-semibold text-neutral-900 mb-2">Feature Title</h3>
  <p className="text-neutral-600">Feature description</p>
</div>
```

---

## PRODUCT COLORS

### GolfHelm

```tsx
// Background
bg-helm-green-50

// Border
border-helm-green-200
border-helm-green-300 // hover

// Text
text-helm-green-600
text-helm-green-700

// Button
bg-helm-green-600
hover:bg-helm-green-700

// Shadow
shadow-helm-green-600/25
```

### BaseballHelm

```tsx
// Background
bg-amber-50

// Border
border-amber-200
border-amber-300 // hover

// Text
text-amber-600
text-amber-700

// Button
bg-amber-600
hover:bg-amber-700

// Shadow
shadow-amber-600/25
```

---

## CHEAT SHEET

```
BACKGROUNDS:  white → neutral-50 → white (alternate)
TEXT:         neutral-900 → neutral-600 → neutral-500
BORDERS:      neutral-200 → neutral-300 (hover)
ACCENT:       helm-green-600 (Golf) | amber-600 (Baseball)
SHADOWS:      shadow-lg | shadow-xl (elevated)
SPACING:      py-20 md:py-32 (sections) | gap-8 (grids)
RADIUS:       rounded-xl (buttons) | rounded-2xl (cards)
```

---

**Copy these patterns. Build fast. Ship confidently.** 🚀

---
name: ui-stability-debugger
description: Debug and fix UI stability issues in Next.js/Tailwind/Supabase apps — glitchy overlays, broken responsiveness, layout shifts, fidgety animations, missing navigation patterns, z-index wars, mobile breakpoint failures, color inconsistency, skeleton loader mismatches, card overflow/overfilling, and glass blur performance problems. Use this skill whenever the user reports UI bugs like overlays escaping containers, elements jumping or jittering, tabs without back buttons, responsive layout breaking on mobile, modals appearing behind other elements, animations feeling janky, content shifting on load, cards overfilling with content, colors not matching across pages, skeleton loaders that don't match real content, or any "glitchy", "fidgety", or "messy" frontend behavior. Also trigger when the user asks to audit, debug, or fix UI stability, responsiveness, color consistency, loading states, or layout issues across desktop and mobile. This skill focuses on finding and fixing TECHNICAL bugs — not aesthetics (use premium-ui-systems or modern-saas-ui for design quality).
---

# UI Stability Debugger v2

Find and fix the technical bugs that make UIs feel broken: overlay escape, layout shifts, animation jank, responsive failures, navigation gaps, **color drift, skeleton mismatches, card overflow, and glass blur instability**.

**This skill is the technical complement to your design skills.** Use premium-ui-systems for aesthetics. Use THIS for stability.

---

## Quick Diagnosis

```
User reports "glitchy" / "messy" / "shaky" UI → Start here ↓

┌─ Cards overfilling / content spilling out?
│  └─ [Card Containment & Overflow](#card-containment--overflow)
│
├─ Colors inconsistent across pages?
│  └─ [Color Consistency System](#color-consistency-system)
│
├─ Skeletons don't match loaded content / layout jumps?
│  └─ [Skeleton Loading System](#skeleton-loading-system)
│
├─ Overlays escaping boxes / z-index wars?
│  └─ [Stacking Context & Overflow](#stacking-context--overflow-bugs)
│
├─ Layout jumping / content shifting?
│  └─ [Layout Stability](#layout-stability--cls)
│
├─ Animations feel janky / fidgety?
│  └─ [Animation Jank](#animation-jank--fidgety-behavior)
│
├─ Glass/blur effects bleeding or laggy?
│  └─ [Glass & Blur Stability](#glass--blur-stability)
│
├─ Mobile layout broken?
│  └─ [Responsive Debugging](#responsive-breakpoint-debugging)
│
├─ Missing back buttons / dead-end tabs?
│  └─ [Navigation Architecture](#navigation-architecture)
│
└─ Multiple issues / full audit?
   └─ [Systematic Audit](#systematic-stability-audit)
```

---

## Card Containment & Overflow

**Symptom**: Cards feel "overfilled" — content spills out, text runs off edges, elements crowd each other, cards stretch to awkward heights, or content escapes rounded corners.

This is the #1 source of "messy" feeling UIs. Cards need breathing room and strict containment.

### Root Cause Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Text runs off card edge | No truncation strategy | `truncate` for single-line, `line-clamp-N` for multi-line |
| Content escapes rounded corners | Missing overflow containment | `overflow-clip` (preferred) or `overflow-hidden` on the card |
| Card stretches to crazy height | No max-height + unbounded content | Set `max-h-[value]` with `overflow-y-auto` for scrollable content |
| Elements crowd / overlap inside card | Insufficient padding + no gap system | Consistent `p-6` padding + `gap-4` or `gap-6` between children |
| Card grid has uneven heights | Cards size to their content | Use `grid-rows-subgrid` or fixed `min-h`/`max-h` constraints |
| Long names/values break layout | No `min-w-0` on flex children | Add `min-w-0` to flex children that contain text |
| Numbers/stats overflow their space | Fixed width container too small | Use `tabular-nums` + responsive font sizing |

### Fix Patterns

**Pattern 1: Bulletproof card container**
```tsx
// The foundation: every card needs these three things
<div className={cn(
  // 1. CONTAINMENT — content cannot escape
  "overflow-clip rounded-2xl",
  // 2. BREATHING ROOM — consistent internal spacing
  "p-6",
  // 3. BOUNDARIES — prevent infinite stretching
  "min-h-[120px]",  // won't collapse to nothing
  // Glass or solid styling
  "bg-white/70 backdrop-blur-xl border border-white/20",
)}>
  {/* Flex column with gap for consistent spacing between children */}
  <div className="flex flex-col gap-4">
    {children}
  </div>
</div>
```

**Pattern 2: Safe text in cards**
```tsx
// PROBLEM: Long text breaks card layout
<h3>Extremely long player name that goes on forever and overflows</h3>

// FIX: Single-line with ellipsis
<h3 className="truncate" title={playerName}>{playerName}</h3>

// FIX: Multi-line with line clamp (2 lines max)
<p className="line-clamp-2 text-sm text-text-secondary">
  {description}
</p>

// FIX: Flex child text overflow (the min-w-0 trick)
<div className="flex items-center gap-3">
  <Avatar />
  {/* Without min-w-0, this text can push the flex container wider */}
  <div className="min-w-0 flex-1">
    <p className="truncate font-medium">{name}</p>
    <p className="truncate text-sm text-warm-500">{email}</p>
  </div>
  <Badge className="shrink-0">{status}</Badge>
</div>
```

**Pattern 3: Stats card with safe number display**
```tsx
// Numbers need tabular-nums for alignment + responsive sizing
<div className="overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl p-6">
  <p className="text-sm text-warm-500 truncate">{label}</p>
  <p className={cn(
    "font-bold text-warm-900 tabular-nums",
    // Scale font based on value length
    value.length > 6 ? "text-xl" : "text-3xl",
  )}>
    {value}
  </p>
</div>
```

**Pattern 4: Card grid with even heights**
```tsx
// Grid cards should align, not have wildly different heights
<div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
  {items.map(item => (
    <div key={item.id} className={cn(
      "overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl p-6",
      "flex flex-col",    // Flex column for internal layout
      "min-h-[180px]",    // Minimum height prevents collapse
    )}>
      <h3 className="truncate font-semibold">{item.title}</h3>
      <p className="line-clamp-3 text-sm text-warm-500 mt-2 flex-1">
        {item.description}
      </p>
      {/* Footer always at bottom thanks to flex-1 on description */}
      <div className="mt-4 pt-4 border-t border-warm-200/50 flex items-center justify-between">
        <span className="text-xs text-warm-400">{item.date}</span>
        <Button size="sm">View</Button>
      </div>
    </div>
  ))}
</div>
```

**Pattern 5: overflow-clip vs overflow-hidden**
```tsx
// PREFER overflow-clip (2025 best practice)
// - Clips content at rounded corners
// - Does NOT create a scroll container (lighter weight)
// - Works with backdrop-filter (no conflicts)
<div className="overflow-clip rounded-2xl">

// AVOID overflow-hidden when using glass/blur
// - Creates a scroll container (can conflict with backdrop-filter)
// - Still works, but overflow-clip is cleaner
<div className="overflow-hidden rounded-2xl"> // OK but not ideal
```

**Deep dive**: [references/card-containment.md](references/card-containment.md)

---

## Color Consistency System

**Symptom**: Colors don't match across pages. Buttons are slightly different greens. Backgrounds shift between views. Text grays are inconsistent. Dark mode (if applicable) has broken colors.

Color drift happens when components use raw hex/utility values instead of shared tokens. The fix is a **semantic token system** — name colors by their PURPOSE, not their value.

### Root Cause Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Buttons have 3 different greens | Hardcoded hex values (`bg-[#16A34A]` vs `bg-green-600`) | Use single token: `bg-primary` mapped to CSS variable |
| Background shifts between pages | Inconsistent `bg-white` vs `bg-warm-50` vs `bg-[#FFFEFA]` | Define `--color-surface` variable, use `bg-surface` everywhere |
| Text gray varies per component | Mixed `text-gray-500`, `text-warm-500`, `text-neutral-500` | Two text colors max: `text-primary` + `text-secondary` |
| Status colors inconsistent | Different reds for errors, different greens for success | Define `--color-success/error/warning` once in `:root` |
| Hover states unpredictable | Each component invents its own hover color | Define `--color-interactive-hover` token |
| Glass opacity varies randomly | `bg-white/60` vs `bg-white/70` vs `bg-white/80` | Three glass tiers: subtle, standard, prominent |

### Fix Patterns

**Pattern 1: Three-layer color token system**
```css
/* globals.css — THE source of truth for ALL colors */

/* Layer 1: Primitive values (raw colors — only referenced by Layer 2) */
:root {
  --green-600: #16A34A;
  --green-700: #15803D;
  --warm-900: #1c1917;
  --warm-500: #78716c;
  --warm-200: #e7e5e4;
  --warm-50: #fafaf9;
  --cream: #FFFEFA;
  --red-600: #DC2626;
  --amber-500: #F59E0B;
  --blue-500: #3B82F6;
}

/* Layer 2: Semantic tokens (MEANING — these are what components use) */
:root {
  /* Surfaces */
  --color-surface: var(--cream);
  --color-surface-card: rgba(255, 255, 255, 0.7);
  --color-surface-elevated: rgba(255, 255, 255, 0.8);

  /* Text */
  --color-text-primary: var(--warm-900);
  --color-text-secondary: var(--warm-500);
  --color-text-muted: var(--warm-200);

  /* Interactive */
  --color-interactive: var(--green-600);
  --color-interactive-hover: var(--green-700);

  /* Borders */
  --color-border: var(--warm-200);
  --color-border-subtle: rgba(255, 255, 255, 0.2);

  /* Status (never change these) */
  --color-success: var(--green-600);
  --color-error: var(--red-600);
  --color-warning: var(--amber-500);
  --color-info: var(--blue-500);
}
```

**Pattern 2: Map tokens to Tailwind utilities**
```typescript
// tailwind.config.ts — extend colors with semantic tokens
colors: {
  surface: 'var(--color-surface)',
  'surface-card': 'var(--color-surface-card)',
  'text-primary': 'var(--color-text-primary)',
  'text-secondary': 'var(--color-text-secondary)',
  interactive: 'var(--color-interactive)',
  'interactive-hover': 'var(--color-interactive-hover)',
  border: 'var(--color-border)',
  success: 'var(--color-success)',
  error: 'var(--color-error)',
  warning: 'var(--color-warning)',
}

// Then in components:
<button className="bg-interactive hover:bg-interactive-hover text-white">
  {/* Always the same green, everywhere */}
</button>

<p className="text-text-secondary">
  {/* Always the same gray, everywhere */}
</p>
```

**Pattern 3: Audit command — find color drift**
```bash
# Find hardcoded hex colors (should be tokens instead)
grep -rn "bg-\[#" --include="*.tsx" src/ | head -30
grep -rn "text-\[#" --include="*.tsx" src/ | head -30

# Find inconsistent gray usage
grep -rn "text-gray-" --include="*.tsx" src/ | wc -l
grep -rn "text-warm-" --include="*.tsx" src/ | wc -l
grep -rn "text-neutral-" --include="*.tsx" src/ | wc -l

# Find inconsistent green usage
grep -rn "bg-green-" --include="*.tsx" src/ | sort | uniq -c | sort -rn

# Find mixed background approaches
grep -rn 'bg-white/' --include="*.tsx" src/ | sort | uniq -c | sort -rn
```

**Deep dive**: [references/color-consistency.md](references/color-consistency.md)

---

## Skeleton Loading System

**Symptom**: Content jumps when data loads. Skeletons are the wrong size. Loading states feel janky or inconsistent. Some pages have skeletons and others just show blank space.

Skeletons are the difference between "premium" and "amateur" loading UX. They must **exactly match** the dimensions of the real content, and every data-loading section needs one.

### Root Cause Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Page jumps when data loads | Skeleton is smaller than real content | Measure real component, match skeleton dimensions exactly |
| Different shimmer speeds on same page | Multiple animation definitions | Single `animate-shimmer` keyframe, used everywhere |
| Some sections load blank, others have skeletons | Incomplete skeleton coverage | Every Suspense boundary needs a skeleton fallback |
| Skeleton → real content "flash" | No transition between states | Use opacity fade: skeleton fades out, content fades in |
| Skeleton colors don't match page | Skeleton uses wrong background | Match skeleton bg to card background (glass or solid) |
| Multiple skeletons pulse out of sync | Separate animation timelines | Use CSS animation-delay or single parent pulse |

### Fix Patterns

**Pattern 1: Dimension-matched skeleton (the golden rule)**
```tsx
// STEP 1: Measure the real component
function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl p-6">
      <p className="text-sm text-warm-500">{label}</p>    {/* h-5 (20px) */}
      <p className="text-3xl font-bold mt-2">{value}</p>  {/* h-9 (36px) */}
    </div>
  );
}

// STEP 2: Match EXACTLY in skeleton
function StatCardSkeleton() {
  return (
    <div className="overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl p-6">
      {/* Same height as "text-sm" line: h-5 */}
      <div className="h-5 w-24 rounded-md bg-warm-200/60 animate-shimmer" />
      {/* Same height as "text-3xl font-bold" line: h-9, with same mt-2 */}
      <div className="h-9 w-32 rounded-md bg-warm-200/60 animate-shimmer mt-2" />
    </div>
  );
}
// Result: ZERO layout shift when real data loads
```

**Pattern 2: Consistent shimmer animation**
```css
/* globals.css — ONE shimmer animation for the whole app */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
}

.animate-shimmer {
  background: linear-gradient(
    90deg,
    transparent 0%,
    rgba(255, 255, 255, 0.4) 50%,
    transparent 100%
  );
  background-size: 200% 100%;
  animation: shimmer 2s ease-in-out infinite;
}
```

```typescript
// tailwind.config.ts
animation: {
  shimmer: 'shimmer 2s ease-in-out infinite',
},
keyframes: {
  shimmer: {
    '0%': { backgroundPosition: '-200% 0' },
    '100%': { backgroundPosition: '200% 0' },
  },
},
```

**Pattern 3: Suspense boundaries at the right level**
```tsx
// BAD: One Suspense for entire page → everything loads or nothing does
<Suspense fallback={<PageSkeleton />}>
  <EntirePage />
</Suspense>

// GOOD: Granular Suspense → each section streams independently
export default async function DashboardPage() {
  return (
    <div className="space-y-6">
      {/* Header loads instantly (no data) */}
      <PageHeader title="Dashboard" />

      {/* Stats load independently */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <Suspense fallback={<StatCardSkeleton />}>
          <StatCard metric="rounds" />
        </Suspense>
        <Suspense fallback={<StatCardSkeleton />}>
          <StatCard metric="scoring-avg" />
        </Suspense>
        <Suspense fallback={<StatCardSkeleton />}>
          <StatCard metric="handicap" />
        </Suspense>
      </div>

      {/* Activity feed loads independently */}
      <Suspense fallback={<ActivityListSkeleton count={5} />}>
        <RecentActivity />
      </Suspense>
    </div>
  );
}
```

**Pattern 4: Skeleton composition (reusable building blocks)**
```tsx
// Build complex skeletons from simple pieces
function SkeletonLine({ width = "w-full", height = "h-4" }: {
  width?: string;
  height?: string;
}) {
  return <div className={cn(width, height, "rounded-md bg-warm-200/60 animate-shimmer")} />;
}

function SkeletonCircle({ size = "h-10 w-10" }: { size?: string }) {
  return <div className={cn(size, "rounded-full bg-warm-200/60 animate-shimmer")} />;
}

// Compose into page-specific skeletons
function PlayerCardSkeleton() {
  return (
    <div className="overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl p-6">
      <div className="flex items-center gap-4">
        <SkeletonCircle size="h-12 w-12" />
        <div className="flex-1 space-y-2">
          <SkeletonLine width="w-32" height="h-5" />
          <SkeletonLine width="w-48" height="h-4" />
        </div>
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4">
        <SkeletonLine height="h-16" />
        <SkeletonLine height="h-16" />
        <SkeletonLine height="h-16" />
      </div>
    </div>
  );
}
```

**Deep dive**: [references/skeleton-system.md](references/skeleton-system.md)

---

## Stacking Context & Overflow Bugs

**Symptom**: Modals/dropdowns/tooltips appear behind other elements, or content bleeds outside its container.

### Root Cause Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Modal behind sticky header | Modal inside a parent with `position + z-index` or `transform` | Use React Portal (`createPortal`) to render at `<body>` root |
| Dropdown clipped by parent | Parent has `overflow: hidden/auto` | Move dropdown to portal OR use `position: fixed` instead of `absolute` |
| Tooltip bleeds outside card | No overflow containment on card | Add `overflow-clip` to card, OR portal the tooltip |
| Overlay doesn't cover full screen | Overlay inside a stacking context, not at root | Portal to `document.body` |
| Glass blur leaks past container | `backdrop-filter` + `overflow: hidden` conflict | Use `overflow-clip` instead of `overflow-hidden` |
| Content escapes rounded corners | Missing overflow containment | Add `overflow-clip` alongside `rounded-*` classes |

### Stacking Context Creators (things that trap z-index)

These CSS properties create new stacking contexts — children CANNOT escape them with z-index:

```
position: relative/absolute/fixed/sticky + z-index (any value)
transform (any value, including transform: none in some browsers)
opacity < 1
filter (any value)
backdrop-filter (any value)   ← glass cards always create these!
will-change (layout-affecting values)
contain: layout/paint/strict/content
isolation: isolate
mix-blend-mode (anything other than normal)
```

### Fix Patterns

**Pattern 1: Portal escape (for modals/overlays)**
```tsx
'use client';
import { createPortal } from 'react-dom';
import { useEffect, useState } from 'react';

export function Portal({ children }: { children: React.ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  if (!mounted) return null;
  return createPortal(children, document.body);
}

// Usage: wrap any modal/dropdown/tooltip
<Portal>
  <div className="fixed inset-0 z-50 flex items-center justify-center">
    <div className="fixed inset-0 bg-black/50" onClick={onClose} />
    <div className="relative z-10 bg-white/80 backdrop-blur-2xl rounded-2xl p-6">
      {/* modal content */}
    </div>
  </div>
</Portal>
```

**Pattern 2: Z-index scale (single source of truth)**
```css
:root {
  --z-base: 0;
  --z-dropdown: 100;
  --z-sticky: 200;
  --z-overlay: 300;
  --z-modal: 400;
  --z-toast: 500;
  --z-tooltip: 600;
}
```

**Deep dive**: [references/stacking-overflow.md](references/stacking-overflow.md)

---

## Layout Stability & CLS

**Symptom**: Content jumps, shifts, or rearranges after page load. Elements resize unexpectedly.

### Root Cause Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Page jumps on load | Images/fonts without reserved space | Set explicit `width`/`height` or use `aspect-ratio` |
| Content shifts when data loads | No skeleton/placeholder sizing | Use dimension-matched skeleton loaders (see Skeleton section) |
| Sidebar/nav causes layout shift | Conditional rendering without space reservation | Use `visibility: hidden` or fixed-width container |
| Font swap causes text reflow | FOUT (Flash of Unstyled Text) | Use `font-display: swap` + `size-adjust` OR preload fonts |
| Accordion/expand shifts page | No smooth height animation | Animate `grid-template-rows: 0fr → 1fr` |

### Fix Patterns

**Pattern 1: Image dimension reservation**
```tsx
// GOOD — Next.js Image with automatic sizing
import Image from 'next/image';
<Image src={url} alt="" width={800} height={450} className="w-full h-auto" />
```

**Pattern 2: Smooth accordion without layout shift**
```tsx
// grid trick for smooth expand/collapse
<div className="grid transition-[grid-template-rows] duration-200"
     style={{ gridTemplateRows: isOpen ? '1fr' : '0fr' }}>
  <div className="overflow-hidden">
    {children}
  </div>
</div>
```

**Deep dive**: [references/layout-stability.md](references/layout-stability.md)

---

## Animation Jank & Fidgety Behavior

**Symptom**: Elements jitter, stutter during transitions, or feel "fidgety." Animations aren't smooth 60fps.

The rule is simple: **only animate `transform` and `opacity`**. Everything else triggers layout recalculation (reflow) which kills frame rate, especially on mobile.

### GPU-Safe vs Unsafe Properties

| Property | GPU-Accelerated | Safe to Animate |
|----------|:-:|:-:|
| `transform` (translate, scale, rotate) | ✅ | ✅ |
| `opacity` | ✅ | ✅ |
| `filter` (blur, brightness) | ✅ | ✅ |
| `clip-path` | ✅ | ✅ |
| `width` / `height` | ❌ | ❌ — use `transform: scale()` |
| `left` / `top` / `right` / `bottom` | ❌ | ❌ — use `transform: translate()` |
| `margin` / `padding` | ❌ | ❌ — use `transform` or `gap` |
| `border` / `border-width` | ❌ | ❌ — use `box-shadow` or `outline` |
| `background-color` | ❌ (repaint) | ⚠️ OK for color, not position |

### Root Cause Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Hover effects jitter | Element resizes on hover (border, padding) | Use `ring-2` or `shadow` instead of `border` for hover |
| Page transitions stutter | Animating `width`/`height`/`top`/`left` | ONLY animate `transform` and `opacity` |
| Cards bounce/flicker on hover | `translateY` + sibling layout reflow | Add `will-change-transform` on hover |
| Dropdown flickers open/close | Conflicting transition + conditional render | Separate mount state from visibility state |
| Tab content flashes | Unmount/remount on tab switch | Keep all tabs mounted, toggle `hidden`/`block` |
| Multiple transitions fight | `transition-all` catches everything | Be specific: `transition-transform`, `transition-opacity` |

### Fix Patterns

**Pattern 1: Hover without layout reflow**
```tsx
// BAD — border change causes reflow
<div className="border-2 border-transparent hover:border-green-500">

// GOOD — ring/shadow doesn't cause reflow
<div className="hover:ring-2 hover:ring-green-500/30 transition-shadow duration-150">

// GOOD — transform doesn't cause reflow
<div className="hover:-translate-y-0.5 hover:shadow-lg transition-all duration-150">
```

**Pattern 2: Stable tab switching (no flash)**
```tsx
// BAD — unmount/remount causes flash
{activeTab === 'stats' && <StatsPanel />}

// GOOD — all mounted, toggle visibility
<div className={activeTab === 'stats' ? 'block' : 'hidden'}>
  <StatsPanel />
</div>
<div className={activeTab === 'roster' ? 'block' : 'hidden'}>
  <RosterPanel />
</div>
```

**Pattern 3: `transition-all` is a code smell**
```tsx
// BAD — transition-all animates EVERYTHING, including layout properties
<div className="transition-all duration-200 hover:shadow-lg hover:-translate-y-1">

// GOOD — explicit about what you're transitioning
<div className="transition-[transform,box-shadow] duration-200 hover:shadow-lg hover:-translate-y-1">

// Tailwind shorthand for common combos:
"transition-transform"   // only transform
"transition-opacity"     // only opacity
"transition-shadow"      // only box-shadow
"transition-colors"      // only color/bg/border-color
```

**Pattern 4: Respect reduced motion**
```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    animation-iteration-count: 1 !important;
    transition-duration: 0.01ms !important;
  }
}
```

**Deep dive**: [references/animation-jank.md](references/animation-jank.md)

---

## Glass & Blur Stability

**Symptom**: Glass effects (backdrop-filter blur) bleed past containers, cause performance jank on scroll, look different across pages, or tank frame rate on mobile.

`backdrop-filter: blur()` is GPU-intensive. The key insight: **use glass on small, fixed elements** (navbars, modals, floating buttons) — never on large scrolling content areas.

### Root Cause Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Blur bleeds past rounded corners | `overflow-hidden` conflict with `backdrop-filter` | Use `overflow-clip` instead |
| Glass cards lag on scroll | Too many blurred elements in scroll area | Limit glass to ≤5 visible elements, reduce blur value on mobile |
| Glass opacity varies across pages | Hardcoded `bg-white/70` vs `bg-white/60` etc. | Three glass tiers with CSS variables |
| Blur effect flickers | Missing `will-change` or containment | Add `isolation: isolate` + `contain: paint` |
| Mobile performance drops with glass | High blur values on many elements | Use `backdrop-blur-sm` (4px) on mobile, `backdrop-blur-xl` (24px) on desktop |

### Fix Patterns

**Pattern 1: Three-tier glass system (consistency)**
```css
/* globals.css — define glass tiers ONCE */
:root {
  /* Glass Subtle — large surfaces, backgrounds */
  --glass-subtle-bg: rgba(255, 255, 255, 0.55);
  --glass-subtle-blur: 12px;
  --glass-subtle-border: rgba(255, 255, 255, 0.4);

  /* Glass Standard — default cards, panels (MOST COMMON) */
  --glass-standard-bg: rgba(255, 255, 255, 0.7);
  --glass-standard-blur: 16px;
  --glass-standard-border: rgba(255, 255, 255, 0.5);

  /* Glass Prominent — nav, modals, important overlays */
  --glass-prominent-bg: rgba(255, 255, 255, 0.8);
  --glass-prominent-blur: 20px;
  --glass-prominent-border: rgba(255, 255, 255, 0.6);
}
```

**Pattern 2: Glass + overflow-clip (prevent blur bleed)**
```tsx
// CORRECT: overflow-clip prevents blur bleeding past rounded corners
<div className="overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl border border-white/20 isolate">
  {children}
</div>

// WRONG: overflow-hidden can conflict with backdrop-filter
<div className="overflow-hidden rounded-2xl bg-white/70 backdrop-blur-xl">
  {children}
</div>
```

**Pattern 3: Responsive glass (reduce blur on mobile)**
```tsx
// Mobile gets lighter blur for performance, desktop gets full effect
<div className={cn(
  "overflow-clip rounded-2xl border border-white/20",
  "bg-white/70",
  "backdrop-blur-sm md:backdrop-blur-xl",  // 4px mobile, 24px desktop
  "isolate",  // contain stacking context
)}>
  {children}
</div>
```

**Pattern 4: Glass performance budget**
```
RULE: No more than 5 glass elements visible at once on mobile.

If you have a glass navbar + 6 glass cards in a grid, the cards
should use solid backgrounds on mobile:

<div className={cn(
  "overflow-clip rounded-2xl",
  // Mobile: solid white (no blur = fast)
  "bg-white border border-warm-200",
  // Desktop: glass effect
  "md:bg-white/70 md:backdrop-blur-xl md:border-white/20",
)}>
```

**Deep dive**: [references/glass-stability.md](references/glass-stability.md)

---

## Responsive Breakpoint Debugging

**Symptom**: Layout breaks at certain screen sizes. Mobile view is broken or unusable.

### Viewport Audit Points

| Width | Device | Tailwind | Common Failures |
|-------|--------|----------|-----------------|
| 320px | iPhone SE | Default | Horizontal overflow, text truncation |
| 375px | Standard phone | Default | Cramped cards, overlapping elements |
| 428px | Large phone | Default | Awkward spacing mobile→tablet |
| 768px | Tablet / iPad | `md:` | Sidebar collapse point, grid switch |
| 1024px | Small laptop | `lg:` | Sidebar + content too cramped |
| 1280px | Desktop | `xl:` | Content too wide or narrow |

### Root Cause Checklist

| Symptom | Likely Cause | Fix |
|---------|-------------|-----|
| Horizontal scroll on mobile | Fixed-width element exceeds viewport | `max-w-full` + `overflow-x-hidden` on body |
| Cards stack weird | Wrong grid breakpoint | `grid-cols-1 md:grid-cols-2 lg:grid-cols-3` |
| Touch targets too small | Desktop buttons on mobile | Minimum `h-12 min-w-[48px]` (48×48px per WCAG) |
| Bottom content hidden | Fixed bottom nav overlaps | Add `pb-20` to main content |
| Modal doesn't scroll on mobile | No scroll handling | `overflow-y-auto max-h-[calc(100dvh-2rem)]` |
| Content hidden behind mobile toolbar | `h-screen` (100vh) wrong on iOS | Use `h-dvh` or `min-h-[100svh]` |

### Fix Patterns

**Pattern 1: Modern viewport height (NOT 100vh)**
```tsx
// BAD — 100vh includes browser chrome on iOS = content hidden
<div className="h-screen">

// GOOD — svh accounts for browser chrome
<div className="min-h-[100svh]">

// GOOD — dvh for truly full-screen experiences
<div className="h-dvh">

// FALLBACK — for older browsers
<div className="h-screen supports-[height:100dvh]:h-dvh">
```

**Pattern 2: Safe area insets (notch, home indicator)**
```tsx
// Account for iPhone notch + home indicator
<nav className="fixed bottom-0 left-0 right-0 pb-[env(safe-area-inset-bottom)]">
  <BottomNav />
</nav>

// With Tailwind (add to config):
padding: {
  'safe-b': 'env(safe-area-inset-bottom)',
  'safe-t': 'env(safe-area-inset-top)',
}
```

**Pattern 3: Touch target sizing**
```tsx
// All interactive elements: minimum 48×48px
<button className="h-12 min-w-[48px] px-4 rounded-lg">
  {label}
</button>

// Icon buttons need explicit sizing
<button className="h-12 w-12 flex items-center justify-center rounded-lg">
  <Icon className="h-5 w-5" />
</button>
```

**Deep dive**: [references/responsive-debugging.md](references/responsive-debugging.md)

---

## Navigation Architecture

**Symptom**: Users hit dead ends. Tabs don't have back buttons. No way to return to previous screen.

### Navigation Audit Checklist

| Check | Standard | Fix |
|-------|----------|-----|
| Every detail page has a back path | ← button or breadcrumb | Add back button to all detail/sub-pages |
| Current location is clear | Active nav item highlighted | Highlight active route in sidebar/tabs |
| Deep links work | URL reflects state | Use URL params for all navigable state |
| Mobile has clear navigation | Bottom tab bar or hamburger | Bottom nav for primary routes on mobile |
| Tab state persists | Switching tabs keeps context | Store tab state in URL params (`?tab=roster`) |
| Modals have escape | Close + click outside + Escape key | Implement all three close methods |

### Fix Patterns

**Pattern 1: Universal back button**
```tsx
'use client';
import { useRouter } from 'next/navigation';
import { ChevronLeft } from 'lucide-react';

export function BackButton({ fallback = '/' }: { fallback?: string }) {
  const router = useRouter();
  return (
    <button
      onClick={() => {
        if (window.history.length > 1) router.back();
        else router.push(fallback);
      }}
      className="inline-flex items-center gap-1 text-sm text-warm-500
                 hover:text-warm-900 transition-colors h-12"
    >
      <ChevronLeft className="w-4 h-4" />
      Back
    </button>
  );
}
```

**Pattern 2: Tab state in URL**
```tsx
'use client';
import { useSearchParams, useRouter, usePathname } from 'next/navigation';

function TabNav({ tabs }: { tabs: { id: string; label: string }[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const activeTab = searchParams.get('tab') || tabs[0].id;

  function setTab(tabId: string) {
    const params = new URLSearchParams(searchParams);
    params.set('tab', tabId);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="flex gap-1 border-b border-warm-200">
      {tabs.map(tab => (
        <button
          key={tab.id}
          onClick={() => setTab(tab.id)}
          className={cn(
            "px-4 py-2 text-sm transition-colors h-12",
            activeTab === tab.id
              ? "text-warm-900 border-b-2 border-green-600 font-medium"
              : "text-warm-500 hover:text-warm-700"
          )}
        >
          {tab.label}
        </button>
      ))}
    </div>
  );
}
```

---

## Systematic Stability Audit

When doing a full UI stability pass, run these checks in order. Fix each category before moving to the next.

### Phase 1: Card Containment (10 min) — NEW
```
For EVERY card/panel on EVERY page:
□ Does content stay within the card boundary?
□ Is text truncated with ellipsis (not overflowing)?
□ Are rounded corners clipping content (overflow-clip)?
□ Are card heights reasonable (not stretching to absurd sizes)?
□ Do cards in grids align to consistent heights?
□ Is there adequate padding (p-6 minimum for cards)?
□ Do flex children have min-w-0 (prevent text blowout)?
```

### Phase 2: Color Consistency (10 min) — NEW
```
Across ALL pages:
□ Run grep audit commands (see Color Consistency section)
□ Is the primary green the SAME green on every button?
□ Are text grays consistent (text-primary/secondary tokens)?
□ Are backgrounds the same shade on every page?
□ Do glass cards use the same opacity everywhere?
□ Are status colors (success/error/warning) consistent?
```

### Phase 3: Skeleton Coverage (10 min) — NEW
```
For EVERY data-loading section:
□ Is there a skeleton loader while data fetches?
□ Does skeleton match the EXACT dimensions of real content?
□ Does skeleton use the same background as the real card?
□ Is shimmer animation consistent (same speed, same style)?
□ Throttle network → watch for layout jumps when data loads
□ Are Suspense boundaries at the right granularity (per-card, not per-page)?
```

### Phase 4: Overflow & Stacking (10 min)
```
For EVERY page:
□ Open Chrome DevTools → Toggle device toolbar
□ Check for horizontal scrollbar at 320px, 375px, 768px
□ Open every modal/dropdown/tooltip — renders above all content?
□ Check glass cards — does blur bleed past rounded corners?
□ Is overflow-clip (not overflow-hidden) used on glass cards?
```

### Phase 5: Animation Quality (10 min)
```
For EVERY interactive element:
□ Hover all buttons/cards — smooth or jittery?
□ Open/close all dropdowns — smooth enter/exit?
□ Switch all tabs — flash of empty content?
□ Are transitions specific (not transition-all)?
□ Only transform/opacity being animated (check DevTools Performance)?
```

### Phase 6: Responsive Check (15 min)
```
At 320px, 375px, 768px, 1024px, 1280px:
□ All text readable? No truncation hiding critical info?
□ All touch targets ≥ 48×48px?
□ No overlapping elements?
□ Tables scrollable horizontally?
□ Using svh/dvh instead of 100vh?
□ Bottom nav not hiding content?
□ Glass effect reduced on mobile (performance)?
```

### Phase 7: Navigation Completeness (10 min)
```
For EVERY page:
□ Can user get BACK from here?
□ Is current location clear? (active nav state)
□ Do tabs preserve state on switch?
□ Do modals have: close button + outside click + Escape key?
□ Does URL reflect current state? (deep-linkable)
```

---

## Codebase Grep Commands

Quick commands to find stability bugs in a Next.js/Tailwind codebase:

```bash
# === CARD OVERFLOW ===
# Find cards missing overflow containment
grep -rn "rounded-2xl" --include="*.tsx" src/ | grep -v "overflow"

# Find text that might overflow (no truncate/line-clamp)
grep -rn "text-3xl\|text-2xl" --include="*.tsx" src/ | grep -v "truncate\|line-clamp"

# === COLOR DRIFT ===
# Find hardcoded hex colors
grep -rn "bg-\[#\|text-\[#\|border-\[#" --include="*.tsx" src/ | head -20

# Count inconsistent gray families
grep -rn "text-gray-\|text-neutral-\|text-warm-\|text-stone-" --include="*.tsx" src/ | \
  sed 's/.*\(text-[a-z]*-\).*/\1/' | sort | uniq -c | sort -rn

# Find inconsistent green usage
grep -rn "green-[0-9]" --include="*.tsx" src/ | \
  sed 's/.*\(green-[0-9]*\).*/\1/' | sort | uniq -c | sort -rn

# === SKELETON COVERAGE ===
# Find Suspense boundaries
grep -rn "Suspense" --include="*.tsx" src/ | wc -l

# Find pages without loading states
grep -rn "loading.tsx" src/app/ | wc -l

# === ANIMATION ISSUES ===
# Find transition-all (potential jank source — should be specific)
grep -rn "transition-all" --include="*.tsx" src/ | wc -l

# Find animated properties that cause reflow
grep -rn "animate-\|transition-" --include="*.tsx" src/ | grep -i "width\|height\|left\|top\|margin\|padding"

# === STACKING ISSUES ===
# Find hardcoded z-index (should use scale)
grep -rn "z-\[" --include="*.tsx" src/ | head -20

# Find fixed positioning without z-index
grep -rn "fixed" --include="*.tsx" src/ | grep -v "z-"

# === RESPONSIVE ISSUES ===
# Find 100vh (should be dvh/svh)
grep -rn "h-screen\|100vh" --include="*.tsx" src/

# Find missing width/height on images
grep -rn "<img\|<Image" --include="*.tsx" src/ | grep -v "width"

# === GLASS/BLUR ISSUES ===
# Find overflow-hidden with backdrop-filter (should be overflow-clip)
grep -rn "overflow-hidden.*backdrop-filter\|backdrop-blur.*overflow-hidden" --include="*.tsx" src/

# Count glass elements (watch for too many)
grep -rn "backdrop-blur" --include="*.tsx" src/ | wc -l
```

---

## Critical Reminders

1. **Every card needs `overflow-clip`** — Content must not escape rounded corners or card boundaries
2. **Text in cards needs `truncate` or `line-clamp`** — Unbounded text destroys card layouts
3. **Colors come from tokens, never hardcoded** — One source of truth prevents drift
4. **Skeletons must match real content dimensions exactly** — Measure then match, pixel by pixel
5. **Only animate `transform` and `opacity`** — Everything else causes reflow jank
6. **`transition-all` is a code smell** — Be specific: `transition-transform`, `transition-shadow`
7. **Glass on ≤5 elements per mobile view** — `backdrop-filter` is GPU-expensive
8. **Use `overflow-clip` not `overflow-hidden` for glass** — Prevents blur/scroll conflicts
9. **`h-screen` breaks on mobile** — Use `h-dvh` or `min-h-[100svh]`
10. **48×48px minimum touch targets** — Anything smaller causes mis-taps
11. **Portal all modals/overlays** — Stacking contexts from glass cards trap z-index
12. **Every detail page needs a back path** — No dead ends, ever
13. **Flex children with text need `min-w-0`** — Prevents text from blowing out flex layouts
14. **Glass cards: `backdrop-blur-sm` on mobile, `backdrop-blur-xl` on desktop** — Performance budget

---

## When to Read References

| Reference | When to Use |
|-----------|-------------|
| [Card Containment Deep Dive](references/card-containment.md) | Cards overfilling, text overflow, grid alignment issues |
| [Color Consistency System](references/color-consistency.md) | Setting up or auditing a color token system |
| [Skeleton Loading System](references/skeleton-system.md) | Building skeleton loaders, Suspense patterns, shimmer effects |
| [Stacking & Overflow](references/stacking-overflow.md) | Complex z-index / overlay containment bugs |
| [Layout Stability](references/layout-stability.md) | CLS issues, skeleton sizing, font loading |
| [Animation Jank](references/animation-jank.md) | Performance profiling, GPU compositing, reflow triggers |
| [Glass & Blur Stability](references/glass-stability.md) | Backdrop-filter performance, blur bleed, mobile optimization |
| [Responsive Debugging](references/responsive-debugging.md) | Mobile breakpoints, viewport units, safe areas |

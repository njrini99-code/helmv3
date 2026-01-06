# BATCH 5: Dashboard Layouts (Premium Glassmorphism Implementation)

## Overview
The dashboards are the primary interface users interact with daily. They must feel **premium, modern, and polished** - like a well-funded startup's product. This batch implements sophisticated glassmorphism effects that create depth, hierarchy, and visual elegance.

**Prerequisite:** Batches 1-4 must be complete.

---

## TABLE OF CONTENTS
1. [Design Philosophy](#design-philosophy)
2. [The Glass Effect System](#the-glass-effect-system)
3. [Background System](#background-system)
4. [Card Hierarchy](#card-hierarchy)
5. [Shadow System](#shadow-system)
6. [Border Treatments](#border-treatments)
7. [Component Specifications](#component-specifications)
8. [Dashboard Layouts](#dashboard-layouts)
9. [Animation & Transitions](#animation--transitions)
10. [Implementation Guide](#implementation-guide)
11. [Files to Create](#files-to-create)
12. [Verification Checklist](#verification-checklist)

---

## DESIGN PHILOSOPHY

### The Premium Look

We're aiming for the aesthetic of **Linear, Stripe, and Vercel** - apps that feel expensive and carefully crafted. Key principles:

1. **Depth through layering** - Multiple translucent layers create visual depth
2. **Subtle complexity** - Many small details that compound into premium feel
3. **Soft, diffused lighting** - No harsh edges, everything feels "lit from within"
4. **Restraint** - Premium means knowing what to leave out
5. **Micro-interactions** - Small hover effects that reward attention

### What Makes Glass Look Premium vs Cheap

| Premium Glass ✅ | Cheap Glass ❌ |
|-----------------|---------------|
| Subtle blur (8-16px) | Heavy blur (>20px) |
| Low opacity (60-80%) | Full transparency or too opaque |
| Soft, thin borders | Thick, obvious borders |
| Layered shadows | Single harsh shadow |
| Warm, cohesive palette | Random colors |
| Consistent border radius | Mixed radiuses |
| Subtle gradients | Flat or garish gradients |
| Inset highlights | No lighting simulation |

---

## THE GLASS EFFECT SYSTEM

### Three Tiers of Glass

We use three distinct glass treatments based on visual hierarchy:

```
┌─────────────────────────────────────────────────────────────────────┐
│  PAGE BACKGROUND (cream gradient)                                   │
│                                                                     │
│    ┌─────────────────────────────────────────────────────────────┐  │
│    │  TIER 1: PRIMARY GLASS CARD                                 │  │
│    │  bg-white/70, blur-12, border-white/40, rounded-[20px]      │  │
│    │                                                             │  │
│    │    ┌─────────────────────────────────────────────────────┐  │  │
│    │    │  TIER 2: SECONDARY GLASS (nested)                   │  │  │
│    │    │  bg-white/50, blur-8, border-white/30, rounded-[14px]│  │  │
│    │    │                                                     │  │  │
│    │    │    ┌───────────────────────────────────────────┐    │  │  │
│    │    │    │  TIER 3: SUBTLE GLASS (inputs, buttons)   │    │  │  │
│    │    │    │  bg-white/60, blur-4, border-white/25     │    │  │  │
│    │    │    │  rounded-[10px]                           │    │  │  │
│    │    │    └───────────────────────────────────────────┘    │  │  │
│    │    │                                                     │  │  │
│    │    └─────────────────────────────────────────────────────┘  │  │
│    │                                                             │  │
│    └─────────────────────────────────────────────────────────────┘  │
│                                                                     │
└─────────────────────────────────────────────────────────────────────┘
```

---

### TIER 1: Primary Glass (Main Dashboard Cards)

**Use for:** Main content cards, stat cards, activity feeds, calendar widget

```css
/* Raw CSS */
.glass-primary {
  background: rgba(255, 255, 255, 0.70);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.40);
  border-radius: 20px;
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.02),
    0 4px 8px rgba(0, 0, 0, 0.02),
    0 8px 16px rgba(0, 0, 0, 0.02),
    inset 0 1px 0 rgba(255, 255, 255, 0.60);
}

/* Hover state */
.glass-primary:hover {
  background: rgba(255, 255, 255, 0.75);
  border-color: rgba(255, 255, 255, 0.50);
  transform: translateY(-2px);
  box-shadow: 
    0 2px 4px rgba(0, 0, 0, 0.02),
    0 8px 16px rgba(0, 0, 0, 0.03),
    0 16px 32px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.70);
}
```

**Tailwind equivalent:**
```tsx
className="
  bg-white/70 
  backdrop-blur-[12px] 
  border border-white/40 
  rounded-[20px]
  shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.02),0_8px_16px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.6)]
  transition-all duration-300
  hover:bg-white/75
  hover:border-white/50
  hover:-translate-y-0.5
  hover:shadow-[0_2px_4px_rgba(0,0,0,0.02),0_8px_16px_rgba(0,0,0,0.03),0_16px_32px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]
"
```

---

### TIER 2: Secondary Glass (Nested Elements)

**Use for:** Timeline items, list items inside cards, nested containers

```css
/* Raw CSS */
.glass-secondary {
  background: rgba(255, 255, 255, 0.50);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.30);
  border-radius: 14px;
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.02),
    inset 0 1px 0 rgba(255, 255, 255, 0.40);
}

.glass-secondary:hover {
  background: rgba(255, 255, 255, 0.60);
  border-color: rgba(255, 255, 255, 0.40);
}
```

**Tailwind equivalent:**
```tsx
className="
  bg-white/50 
  backdrop-blur-[8px] 
  border border-white/30 
  rounded-[14px]
  shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.4)]
  transition-all duration-200
  hover:bg-white/60
  hover:border-white/40
"
```

---

### TIER 3: Subtle Glass (Inputs, Small Buttons)

**Use for:** Form inputs, quick action buttons, badges

```css
/* Raw CSS */
.glass-subtle {
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 10px;
}

.glass-subtle:focus {
  background: rgba(255, 255, 255, 0.80);
  border-color: rgba(22, 163, 74, 0.40);
  box-shadow: 
    0 0 0 3px rgba(22, 163, 74, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.60);
}
```

**Tailwind equivalent:**
```tsx
className="
  bg-white/60 
  backdrop-blur-[4px] 
  border border-white/25 
  rounded-[10px]
  transition-all duration-200
  focus:bg-white/80
  focus:border-primary-400/40
  focus:ring-[3px] focus:ring-primary-600/10
"
```

---

### THE INSET HIGHLIGHT SECRET

The key to premium glass is simulating light catching the top edge:

```css
/* Always include this in your box-shadow */
box-shadow: 
  /* ...other shadows... */
  inset 0 1px 0 rgba(255, 255, 255, 0.60);

/* The formula: */
/* inset 0 [1-2px] 0 rgba(255, 255, 255, [0.4-0.8]) */
```

This creates a subtle "lit from above" effect that makes the glass feel real.

---

## BACKGROUND SYSTEM

### The 4-Stop Cream Gradient

The page background is crucial - it provides the surface that glass reflects:

```css
/* Add to globals.css or tailwind.config.js */
.bg-cream-gradient {
  background: linear-gradient(
    180deg,
    #FFFEFA 0%,      /* Top: Pure cream - lightest */
    #FDF9F0 35%,     /* Upper-mid: Warm cream */
    #F5F0E6 70%,     /* Lower-mid: Deeper cream */
    #EDE8DD 100%     /* Bottom: Warm sand - darkest */
  );
}
```

**Tailwind config:**
```javascript
// tailwind.config.js
module.exports = {
  theme: {
    extend: {
      backgroundImage: {
        'cream-gradient': 'linear-gradient(180deg, #FFFEFA 0%, #FDF9F0 35%, #F5F0E6 70%, #EDE8DD 100%)',
      },
    },
  },
}
```

---

### Adding Noise Texture (Optional, Extra Premium)

For that extra tactile feel, add subtle noise:

```css
/* CSS approach - no image needed */
.page-with-noise::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.015; /* Very subtle - 1.5% */
  pointer-events: none;
  z-index: 0;
}
```

---

### Ambient Glow Effects

Add colored glows behind important cards:

```tsx
// Component with ambient glow
<div className="relative">
  {/* Ambient glow - sits behind the card */}
  <div className="
    absolute inset-0 -z-10
    bg-primary-500/10 
    blur-3xl 
    rounded-[40px]
    scale-90
  " />
  
  {/* The actual card */}
  <div className="glass-primary p-6">
    {/* Content */}
  </div>
</div>
```

---

## SHADOW SYSTEM

### The 4-Layer Shadow Approach

Premium shadows use multiple soft layers, not one hard shadow:

```css
/* Level 1: Resting state - very subtle */
.shadow-glass-sm {
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.02),
    0 2px 4px rgba(0, 0, 0, 0.02),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

/* Level 2: Default cards */
.shadow-glass-md {
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.02),
    0 4px 8px rgba(0, 0, 0, 0.02),
    0 8px 16px rgba(0, 0, 0, 0.02),
    inset 0 1px 0 rgba(255, 255, 255, 0.6);
}

/* Level 3: Hover state, elevated */
.shadow-glass-lg {
  box-shadow: 
    0 2px 4px rgba(0, 0, 0, 0.02),
    0 8px 16px rgba(0, 0, 0, 0.03),
    0 16px 32px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.7);
}

/* Level 4: Modals, dropdowns */
.shadow-glass-xl {
  box-shadow: 
    0 4px 8px rgba(0, 0, 0, 0.02),
    0 12px 24px rgba(0, 0, 0, 0.04),
    0 24px 48px rgba(0, 0, 0, 0.06),
    0 48px 96px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.8);
}
```

**Tailwind config:**
```javascript
// tailwind.config.js
boxShadow: {
  'glass-sm': '0 1px 2px rgba(0,0,0,0.02), 0 2px 4px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
  'glass-md': '0 1px 2px rgba(0,0,0,0.02), 0 4px 8px rgba(0,0,0,0.02), 0 8px 16px rgba(0,0,0,0.02), inset 0 1px 0 rgba(255,255,255,0.6)',
  'glass-lg': '0 2px 4px rgba(0,0,0,0.02), 0 8px 16px rgba(0,0,0,0.03), 0 16px 32px rgba(0,0,0,0.04), inset 0 1px 0 rgba(255,255,255,0.7)',
  'glass-xl': '0 4px 8px rgba(0,0,0,0.02), 0 12px 24px rgba(0,0,0,0.04), 0 24px 48px rgba(0,0,0,0.06), inset 0 1px 0 rgba(255,255,255,0.8)',
},
```

---

## BORDER TREATMENTS

### The Double-Border Illusion

For extra depth, combine border with inset shadow:

```css
.premium-border {
  /* Visible outer border */
  border: 1px solid rgba(255, 255, 255, 0.40);
  
  /* Inner highlight creates "double border" look */
  box-shadow: 
    inset 0 0 0 1px rgba(255, 255, 255, 0.10), /* Subtle inner border */
    inset 0 1px 0 rgba(255, 255, 255, 0.60);   /* Top highlight */
}
```

### Accent Border (Left Side)

For stat cards that need emphasis:

```tsx
className="
  border border-white/40
  border-l-[3px] border-l-primary-600  /* Accent on left */
  /* Rest of glass styles... */
"
```

---

## CSS UTILITIES TO ADD

Add these to your `globals.css`:

```css
/* ============================================ */
/* GLASSMORPHISM UTILITIES */
/* ============================================ */

/* Tier 1: Primary Glass Card */
.glass-card {
  background: rgba(255, 255, 255, 0.70);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.40);
  border-radius: 20px;
  box-shadow: 
    0 1px 2px rgba(0, 0, 0, 0.02),
    0 4px 8px rgba(0, 0, 0, 0.02),
    0 8px 16px rgba(0, 0, 0, 0.02),
    inset 0 1px 0 rgba(255, 255, 255, 0.60);
  transition: all 300ms cubic-bezier(0.4, 0, 0.2, 1);
}

.glass-card:hover {
  background: rgba(255, 255, 255, 0.75);
  border-color: rgba(255, 255, 255, 0.50);
  transform: translateY(-2px);
  box-shadow: 
    0 2px 4px rgba(0, 0, 0, 0.02),
    0 8px 16px rgba(0, 0, 0, 0.03),
    0 16px 32px rgba(0, 0, 0, 0.04),
    inset 0 1px 0 rgba(255, 255, 255, 0.70);
}

/* Tier 2: Secondary/Nested Glass */
.glass-card-inner {
  background: rgba(255, 255, 255, 0.50);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(255, 255, 255, 0.30);
  border-radius: 14px;
  box-shadow: 
    0 1px 3px rgba(0, 0, 0, 0.02),
    inset 0 1px 0 rgba(255, 255, 255, 0.40);
  transition: all 200ms ease-out;
}

.glass-card-inner:hover {
  background: rgba(255, 255, 255, 0.60);
  border-color: rgba(255, 255, 255, 0.40);
}

/* Tier 3: Subtle Glass (inputs, buttons) */
.glass-input {
  background: rgba(255, 255, 255, 0.60);
  backdrop-filter: blur(4px);
  -webkit-backdrop-filter: blur(4px);
  border: 1px solid rgba(255, 255, 255, 0.25);
  border-radius: 10px;
  transition: all 200ms ease-out;
}

.glass-input:focus {
  background: rgba(255, 255, 255, 0.80);
  border-color: rgba(22, 163, 74, 0.40);
  box-shadow: 
    0 0 0 3px rgba(22, 163, 74, 0.10),
    inset 0 1px 0 rgba(255, 255, 255, 0.60);
  outline: none;
}

/* Accent variant with colored left border */
.glass-card-accent {
  background: rgba(255, 255, 255, 0.70);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.40);
  border-left: 3px solid #16A34A;
  border-radius: 20px;
  box-shadow: 
    0 4px 12px rgba(0, 0, 0, 0.03),
    inset 0 1px 0 rgba(255, 255, 255, 0.60);
}

/* Frosted panel (headers, sidebars) */
.glass-panel {
  background: rgba(255, 255, 255, 0.80);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  border: 1px solid rgba(255, 255, 255, 0.50);
}

/* ============================================ */
/* PAGE BACKGROUND */
/* ============================================ */

.bg-dashboard {
  background: linear-gradient(
    180deg,
    #FFFEFA 0%,
    #FDF9F0 35%,
    #F5F0E6 70%,
    #EDE8DD 100%
  );
  min-height: 100vh;
}

/* Optional noise texture */
.bg-dashboard::before {
  content: '';
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-image: url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.8' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  opacity: 0.015;
  pointer-events: none;
  z-index: 0;
}
```

---

## COMPONENT SPECIFICATIONS

### GlassCard Component

```tsx
// src/components/ui/glass-card.tsx

'use client'

import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface GlassCardProps extends React.HTMLAttributes<HTMLDivElement> {
  variant?: 'primary' | 'secondary' | 'subtle' | 'accent'
  padding?: 'none' | 'sm' | 'md' | 'lg'
  hover?: boolean
  glow?: 'none' | 'green' | 'subtle'
}

const variants = {
  primary: cn(
    "bg-white/70 backdrop-blur-[12px]",
    "border border-white/40",
    "rounded-[20px]",
    "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.02),0_8px_16px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.6)]"
  ),
  secondary: cn(
    "bg-white/50 backdrop-blur-[8px]",
    "border border-white/30",
    "rounded-[14px]",
    "shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.4)]"
  ),
  subtle: cn(
    "bg-white/60 backdrop-blur-[4px]",
    "border border-white/25",
    "rounded-[10px]"
  ),
  accent: cn(
    "bg-white/70 backdrop-blur-[12px]",
    "border border-white/40 border-l-[3px] border-l-primary-600",
    "rounded-[20px]",
    "shadow-[0_4px_12px_rgba(0,0,0,0.03),inset_0_1px_0_rgba(255,255,255,0.6)]"
  ),
}

const paddings = {
  none: "",
  sm: "p-4",
  md: "p-6",
  lg: "p-8",
}

const hoverEffect = cn(
  "transition-all duration-300",
  "hover:bg-white/75",
  "hover:border-white/50",
  "hover:-translate-y-0.5",
  "hover:shadow-[0_2px_4px_rgba(0,0,0,0.02),0_8px_16px_rgba(0,0,0,0.03),0_16px_32px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]"
)

export const GlassCard = forwardRef<HTMLDivElement, GlassCardProps>(
  ({ 
    className, 
    variant = 'primary', 
    padding = 'md',
    hover = true,
    glow = 'none',
    children, 
    ...props 
  }, ref) => {
    return (
      <div
        ref={ref}
        className={cn(
          "relative",
          variants[variant],
          paddings[padding],
          hover && hoverEffect,
          glow === 'green' && "before:absolute before:inset-0 before:-z-10 before:rounded-[24px] before:bg-primary-500/8 before:blur-2xl",
          glow === 'subtle' && "before:absolute before:inset-0 before:-z-10 before:rounded-[24px] before:bg-white/30 before:blur-xl",
          className
        )}
        {...props}
      >
        {children}
      </div>
    )
  }
)

GlassCard.displayName = 'GlassCard'
```

---

### StatCard Component

```tsx
// src/components/dashboard/stat-card.tsx

import { TrendingUpIcon, TrendingDownIcon, MinusIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface StatCardProps {
  label: string
  value: string | number
  change?: number
  changeLabel?: string
  icon?: React.ReactNode
  accent?: boolean
}

export function StatCard({ 
  label, 
  value, 
  change, 
  changeLabel,
  icon,
  accent = false 
}: StatCardProps) {
  const isPositive = change !== undefined && change > 0
  const isNegative = change !== undefined && change < 0
  const TrendIcon = isPositive ? TrendingDownIcon : isNegative ? TrendingUpIcon : MinusIcon
  // Note: For handicap/scores, DOWN is good (green), UP is bad (red)
  
  return (
    <div className={cn(
      // Glass effect
      "relative overflow-hidden",
      "bg-white/70 backdrop-blur-[12px]",
      "border rounded-[16px]",
      "p-5",
      
      // Shadow with inset highlight
      "shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.6)]",
      
      // Hover state
      "transition-all duration-300",
      "hover:bg-white/75",
      "hover:-translate-y-0.5",
      "hover:shadow-[0_4px_12px_rgba(0,0,0,0.04),inset_0_1px_0_rgba(255,255,255,0.7)]",
      
      // Accent border
      accent 
        ? "border-l-[3px] border-l-primary-600 border-t-white/40 border-r-white/40 border-b-white/40"
        : "border-white/40"
    )}>
      {/* Subtle inner gradient for depth */}
      <div className="
        absolute inset-0 
        bg-gradient-to-br from-white/30 via-transparent to-transparent
        pointer-events-none
        rounded-[16px]
      " />
      
      {/* Content */}
      <div className="relative">
        {/* Header row */}
        <div className="flex items-center justify-between mb-3">
          <span className="text-sm font-medium text-warm-500">{label}</span>
          {icon && (
            <div className="
              w-9 h-9 rounded-[10px]
              bg-primary-50
              flex items-center justify-center
              text-primary-600
            ">
              {icon}
            </div>
          )}
        </div>
        
        {/* Value */}
        <div className="text-3xl font-bold text-warm-900 tracking-tight">
          {value}
        </div>
        
        {/* Change indicator */}
        {change !== undefined && (
          <div className={cn(
            "flex items-center gap-1.5 mt-2",
            isNegative && "text-primary-600",  // Down = good for handicap
            isPositive && "text-red-500",       // Up = bad for handicap  
            !isPositive && !isNegative && "text-warm-400"
          )}>
            <TrendIcon className="w-4 h-4" />
            <span className="text-sm font-medium">
              {Math.abs(change)}
            </span>
            {changeLabel && (
              <span className="text-sm text-warm-400">{changeLabel}</span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
```

---

### Activity Feed Component

```tsx
// src/components/dashboard/activity-feed.tsx

import { formatDistanceToNow } from 'date-fns'
import { cn } from '@/lib/utils'

interface ActivityItem {
  id: string
  type: 'message' | 'round' | 'event' | 'milestone'
  title: string
  description?: string
  timestamp: Date
  avatarUrl?: string
  avatarFallback?: string
}

interface ActivityFeedProps {
  items: ActivityItem[]
  maxItems?: number
  title?: string
}

const typeDotColors = {
  message: 'bg-blue-500',
  round: 'bg-primary-500',
  event: 'bg-amber-500',
  milestone: 'bg-purple-500',
}

export function ActivityFeed({ 
  items, 
  maxItems = 5,
  title = 'Recent Activity' 
}: ActivityFeedProps) {
  const displayItems = items.slice(0, maxItems)

  return (
    <div className="
      bg-white/70 backdrop-blur-[12px]
      border border-white/40
      rounded-[20px]
      shadow-[0_1px_2px_rgba(0,0,0,0.02),0_4px_8px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.6)]
      overflow-hidden
    ">
      {/* Header */}
      <div className="px-5 py-4 border-b border-white/30">
        <h3 className="font-semibold text-warm-900">{title}</h3>
      </div>
      
      {/* Items */}
      <div className="divide-y divide-white/20">
        {displayItems.length === 0 ? (
          <div className="px-5 py-8 text-center">
            <p className="text-sm text-warm-400">No recent activity</p>
          </div>
        ) : (
          displayItems.map((item) => (
            <div 
              key={item.id}
              className="
                px-5 py-4
                hover:bg-white/30
                transition-colors duration-200
                cursor-pointer
              "
            >
              <div className="flex items-start gap-3">
                {/* Avatar */}
                <div className="relative flex-shrink-0">
                  <div className="
                    w-10 h-10 rounded-[10px]
                    bg-warm-100
                    flex items-center justify-center
                    text-warm-500 font-medium text-sm
                    overflow-hidden
                  ">
                    {item.avatarUrl ? (
                      <img 
                        src={item.avatarUrl} 
                        alt=""
                        className="w-full h-full object-cover"
                      />
                    ) : (
                      item.avatarFallback || item.type[0].toUpperCase()
                    )}
                  </div>
                  
                  {/* Type indicator dot */}
                  <div className={cn(
                    "absolute -bottom-0.5 -right-0.5",
                    "w-3.5 h-3.5 rounded-full",
                    "border-2 border-white",
                    typeDotColors[item.type]
                  )} />
                </div>
                
                {/* Content */}
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-warm-900 line-clamp-1">
                    {item.title}
                  </p>
                  {item.description && (
                    <p className="text-sm text-warm-500 line-clamp-1 mt-0.5">
                      {item.description}
                    </p>
                  )}
                  <p className="text-xs text-warm-400 mt-1">
                    {formatDistanceToNow(item.timestamp, { addSuffix: true })}
                  </p>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      
      {/* View All Link */}
      {items.length > maxItems && (
        <div className="px-5 py-3 border-t border-white/30 bg-white/20">
          <button className="
            text-sm font-medium text-primary-600
            hover:text-primary-700
            transition-colors duration-200
          ">
            View all activity →
          </button>
        </div>
      )}
    </div>
  )
}
```

---

### Timeline Schedule Component

```tsx
// src/components/dashboard/timeline-schedule.tsx

import { format } from 'date-fns'
import { CheckIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface ScheduleItem {
  id: string
  time: Date
  title: string
  status: 'completed' | 'active' | 'upcoming'
  players?: { name: string; avatarUrl?: string }[]
}

export function TimelineSchedule({ items }: { items: ScheduleItem[] }) {
  return (
    <div className="relative">
      {items.map((item, index) => {
        const isLast = index === items.length - 1
        
        return (
          <div key={item.id} className="relative flex gap-4">
            {/* Timeline track */}
            <div className="flex flex-col items-center">
              {/* Dot */}
              <div className={cn(
                "relative z-10 w-3 h-3 rounded-full mt-1.5 flex-shrink-0",
                item.status === 'completed' && "bg-primary-600",
                item.status === 'active' && "bg-primary-600 ring-4 ring-primary-100",
                item.status === 'upcoming' && "bg-white border-2 border-primary-300"
              )}>
                {/* Ping animation for active */}
                {item.status === 'active' && (
                  <div className="absolute inset-0 rounded-full bg-primary-400 animate-ping opacity-75" />
                )}
                
                {/* Checkmark for completed */}
                {item.status === 'completed' && (
                  <CheckIcon className="absolute inset-0 w-3 h-3 text-white" strokeWidth={3} />
                )}
              </div>
              
              {/* Connecting line */}
              {!isLast && (
                <div className={cn(
                  "w-0.5 flex-1 my-2",
                  item.status === 'completed' ? "bg-primary-200" : "bg-warm-200"
                )} />
              )}
            </div>
            
            {/* Content */}
            <div className={cn("flex-1 pb-6", isLast && "pb-0")}>
              {/* Time label */}
              <div className="flex items-center gap-2 mb-1.5">
                <span className={cn(
                  "text-sm font-medium",
                  item.status === 'active' ? "text-primary-600" : "text-warm-500"
                )}>
                  {format(item.time, 'h:mm a')}
                </span>
                {item.status === 'active' && (
                  <span className="
                    px-2 py-0.5 rounded-full
                    bg-primary-100 text-primary-700
                    text-[10px] font-semibold uppercase tracking-wide
                  ">
                    Now
                  </span>
                )}
              </div>
              
              {/* Event card (Tier 2 glass) */}
              <div className={cn(
                "p-4 rounded-[14px]",
                "bg-white/50 backdrop-blur-[8px]",
                "border border-white/30",
                "shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.4)]",
                "transition-all duration-200",
                "hover:bg-white/60 hover:border-white/40",
                item.status === 'active' && "ring-2 ring-primary-100 border-primary-200/50"
              )}>
                <h4 className="font-semibold text-warm-900">{item.title}</h4>
                
                {/* Player avatars */}
                {item.players && item.players.length > 0 && (
                  <div className="flex items-center gap-2 mt-3">
                    <div className="flex -space-x-2">
                      {item.players.slice(0, 4).map((player, i) => (
                        <div 
                          key={i}
                          className="
                            w-7 h-7 rounded-[8px]
                            bg-warm-100 border-2 border-white
                            flex items-center justify-center
                            text-[10px] font-medium text-warm-600
                            overflow-hidden
                          "
                          title={player.name}
                        >
                          {player.avatarUrl ? (
                            <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                          ) : (
                            player.name.split(' ').map(n => n[0]).join('')
                          )}
                        </div>
                      ))}
                      {item.players.length > 4 && (
                        <div className="
                          w-7 h-7 rounded-[8px]
                          bg-warm-200 border-2 border-white
                          flex items-center justify-center
                          text-[10px] font-medium text-warm-600
                        ">
                          +{item.players.length - 4}
                        </div>
                      )}
                    </div>
                    <span className="text-xs text-warm-400">
                      {item.players.length} player{item.players.length !== 1 ? 's' : ''}
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

---

### Quick Actions Bar

```tsx
// src/components/dashboard/quick-actions.tsx

import { cn } from '@/lib/utils'

interface QuickAction {
  label: string
  icon: React.ReactNode
  onClick: () => void
  variant?: 'default' | 'primary'
}

export function QuickActions({ actions }: { actions: QuickAction[] }) {
  return (
    <div className="
      flex items-center gap-2
      p-2
      bg-white/50 backdrop-blur-[8px]
      border border-white/30
      rounded-[14px]
      shadow-[0_1px_3px_rgba(0,0,0,0.02),inset_0_1px_0_rgba(255,255,255,0.4)]
    ">
      {actions.map((action, index) => (
        <button
          key={index}
          onClick={action.onClick}
          className={cn(
            "flex items-center gap-2",
            "px-4 py-2.5",
            "rounded-[10px]",
            "text-sm font-medium",
            "transition-all duration-200",
            action.variant === 'primary'
              ? [
                  "bg-primary-600 text-white",
                  "shadow-[0_2px_4px_rgba(22,163,74,0.2),inset_0_1px_0_rgba(255,255,255,0.15)]",
                  "hover:bg-primary-700",
                  "hover:shadow-[0_4px_8px_rgba(22,163,74,0.25),inset_0_1px_0_rgba(255,255,255,0.2)]",
                  "hover:-translate-y-0.5",
                  "active:translate-y-0",
                ]
              : [
                  "bg-white/60 text-warm-700",
                  "border border-white/30",
                  "hover:bg-white/80",
                  "hover:border-white/50",
                ]
          )}
        >
          {action.icon}
          {action.label}
        </button>
      ))}
    </div>
  )
}
```

---

### Leaderboard Widget

```tsx
// src/components/dashboard/leaderboard-widget.tsx

import { TrendingUpIcon, TrendingDownIcon, MinusIcon, CrownIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

interface Player {
  rank: number
  name: string
  avatarUrl?: string
  handicap: number
  change: number // Negative = improved (good)
}

export function LeaderboardWidget({ players }: { players: Player[] }) {
  const rankStyles: Record<number, string> = {
    1: 'bg-amber-400 text-amber-900',      // Gold
    2: 'bg-warm-300 text-warm-700',        // Silver
    3: 'bg-amber-600/70 text-amber-100',   // Bronze
  }

  return (
    <div className="space-y-2">
      {players.map((player) => {
        const isTop3 = player.rank <= 3
        const improved = player.change < 0
        const declined = player.change > 0
        
        const TrendIcon = improved 
          ? TrendingDownIcon 
          : declined 
            ? TrendingUpIcon 
            : MinusIcon
        
        return (
          <div 
            key={player.rank}
            className={cn(
              "flex items-center gap-3",
              "p-3 rounded-[12px]",
              // Tier 3 glass
              "bg-white/40 backdrop-blur-[4px]",
              "border border-white/20",
              "transition-all duration-200",
              "hover:bg-white/60",
              isTop3 && "bg-white/60"
            )}
          >
            {/* Rank badge */}
            <div className={cn(
              "w-8 h-8 rounded-[8px] flex-shrink-0",
              "flex items-center justify-center",
              "font-bold text-sm",
              isTop3 
                ? rankStyles[player.rank]
                : "bg-warm-100 text-warm-500"
            )}>
              {player.rank === 1 ? (
                <CrownIcon className="w-4 h-4" />
              ) : (
                player.rank
              )}
            </div>
            
            {/* Avatar + Name */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <div className="
                w-8 h-8 rounded-[8px] flex-shrink-0
                bg-warm-100 overflow-hidden
                flex items-center justify-center
                text-warm-500 text-xs font-medium
              ">
                {player.avatarUrl ? (
                  <img src={player.avatarUrl} alt="" className="w-full h-full object-cover" />
                ) : (
                  player.name.split(' ').map(n => n[0]).join('')
                )}
              </div>
              <span className="font-medium text-sm text-warm-900 truncate">
                {player.name}
              </span>
            </div>
            
            {/* Handicap + Trend */}
            <div className="text-right flex-shrink-0">
              <div className="font-bold text-warm-900">
                {player.handicap > 0 ? '+' : ''}{player.handicap.toFixed(1)}
              </div>
              <div className={cn(
                "flex items-center justify-end gap-0.5 mt-0.5",
                improved && "text-primary-600",
                declined && "text-red-500",
                !improved && !declined && "text-warm-400"
              )}>
                <TrendIcon className="w-3 h-3" />
                <span className="text-xs font-medium">
                  {Math.abs(player.change).toFixed(1)}
                </span>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}
```

---

## DASHBOARD PAGE EXAMPLE

```tsx
// src/app/(dashboard)/golf/coach/dashboard/page.tsx

'use client'

import { 
  UsersIcon, 
  TrophyIcon, 
  CalendarIcon, 
  MessageSquareIcon,
  PlusIcon,
  ClipboardListIcon,
  BarChart3Icon
} from 'lucide-react'
import { GlassCard } from '@/components/ui/glass-card'
import { StatCard } from '@/components/dashboard/stat-card'
import { QuickActions } from '@/components/dashboard/quick-actions'
import { ActivityFeed } from '@/components/dashboard/activity-feed'
import { TimelineSchedule } from '@/components/dashboard/timeline-schedule'
import { LeaderboardWidget } from '@/components/dashboard/leaderboard-widget'
import { DashboardCalendarWidget } from '@/components/dashboard/calendar-widget'

export default function GolfCoachDashboard() {
  return (
    <div className="min-h-screen bg-dashboard relative">
      {/* Noise texture (automatically added via bg-dashboard::before) */}
      
      <div className="relative z-10 p-6 lg:p-8 max-w-7xl mx-auto space-y-6">
        
        {/* ============================================ */}
        {/* HEADER */}
        {/* ============================================ */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-warm-900">Dashboard</h1>
            <p className="text-warm-500 mt-1">Welcome back, Coach</p>
          </div>
          
          <QuickActions actions={[
            { 
              label: 'Log Round', 
              icon: <PlusIcon className="w-4 h-4" />, 
              onClick: () => {},
              variant: 'primary'
            },
            { 
              label: 'New Event', 
              icon: <CalendarIcon className="w-4 h-4" />, 
              onClick: () => {} 
            },
            { 
              label: 'Message', 
              icon: <MessageSquareIcon className="w-4 h-4" />, 
              onClick: () => {} 
            },
          ]} />
        </div>
        
        {/* ============================================ */}
        {/* STATS ROW */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <StatCard
            label="Team Avg Handicap"
            value="+3.2"
            change={-0.4}
            changeLabel="this month"
            icon={<BarChart3Icon className="w-5 h-5" />}
            accent
          />
          <StatCard
            label="Active Players"
            value="12"
            icon={<UsersIcon className="w-5 h-5" />}
          />
          <StatCard
            label="Rounds This Week"
            value="28"
            change={-12}
            changeLabel="vs last week"
            icon={<ClipboardListIcon className="w-5 h-5" />}
          />
          <StatCard
            label="Upcoming Events"
            value="3"
            icon={<TrophyIcon className="w-5 h-5" />}
          />
        </div>
        
        {/* ============================================ */}
        {/* MAIN CONTENT */}
        {/* ============================================ */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          
          {/* Left Column: Schedule + Activity */}
          <div className="lg:col-span-2 space-y-6">
            
            {/* Today's Schedule */}
            <GlassCard>
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-bold text-warm-900">Today's Schedule</h2>
                <a 
                  href="/golf/coach/calendar" 
                  className="text-sm text-primary-600 hover:text-primary-700 font-medium"
                >
                  View Calendar →
                </a>
              </div>
              <TimelineSchedule items={[
                {
                  id: '1',
                  time: new Date(Date.now() - 3 * 60 * 60 * 1000),
                  title: 'Morning putting practice',
                  status: 'completed',
                  players: [{ name: 'Sarah J' }, { name: 'Mike C' }],
                },
                {
                  id: '2',
                  time: new Date(),
                  title: 'Team meeting - Strategy review',
                  status: 'active',
                },
                {
                  id: '3',
                  time: new Date(Date.now() + 2 * 60 * 60 * 1000),
                  title: 'Range session',
                  status: 'upcoming',
                  players: [
                    { name: 'Tom W' }, 
                    { name: 'Lisa K' }, 
                    { name: 'James R' }
                  ],
                },
              ]} />
            </GlassCard>
            
            {/* Activity Feed */}
            <ActivityFeed items={[
              {
                id: '1',
                type: 'milestone',
                title: 'Sarah Johnson set a new personal best',
                description: 'Shot 68 at Pebble Beach',
                timestamp: new Date(Date.now() - 30 * 60 * 1000),
                avatarFallback: 'SJ',
              },
              {
                id: '2',
                type: 'event',
                title: 'Practice round scheduled',
                description: 'Tomorrow at 2:00 PM',
                timestamp: new Date(Date.now() - 2 * 60 * 60 * 1000),
              },
              {
                id: '3',
                type: 'message',
                title: 'New message from Mike Chen',
                description: 'About equipment for the tournament',
                timestamp: new Date(Date.now() - 4 * 60 * 60 * 1000),
                avatarFallback: 'MC',
              },
            ]} />
          </div>
          
          {/* Right Column: Leaderboard + Calendar */}
          <div className="space-y-6">
            
            {/* Leaderboard */}
            <GlassCard>
              <h2 className="text-lg font-bold text-warm-900 mb-4">Team Leaderboard</h2>
              <LeaderboardWidget players={[
                { rank: 1, name: 'Sarah Johnson', handicap: 1.2, change: -0.3 },
                { rank: 2, name: 'Mike Chen', handicap: 2.4, change: 0.1 },
                { rank: 3, name: 'Tom Williams', handicap: 3.1, change: -0.5 },
                { rank: 4, name: 'Lisa Kim', handicap: 3.8, change: 0 },
                { rank: 5, name: 'James Rodriguez', handicap: 4.2, change: 0.2 },
              ]} />
            </GlassCard>
            
            {/* Calendar Widget */}
            <GlassCard>
              <h2 className="text-lg font-bold text-warm-900 mb-4">Schedule</h2>
              <DashboardCalendarWidget />
            </GlassCard>
            
          </div>
        </div>
        
      </div>
    </div>
  )
}
```

---

## FILES TO CREATE

### Core UI
1. `src/components/ui/glass-card.tsx`

### Dashboard Components  
2. `src/components/dashboard/stat-card.tsx`
3. `src/components/dashboard/section-header.tsx`
4. `src/components/dashboard/quick-actions.tsx`
5. `src/components/dashboard/activity-feed.tsx`
6. `src/components/dashboard/timeline-schedule.tsx`
7. `src/components/dashboard/leaderboard-widget.tsx`
8. `src/components/dashboard/calendar-widget.tsx`

### Dashboard Pages
9. `src/app/(dashboard)/golf/coach/dashboard/page.tsx`
10. `src/app/(dashboard)/golf/player/dashboard/page.tsx`
11. `src/app/(dashboard)/baseball/coach/dashboard/page.tsx`
12. `src/app/(dashboard)/baseball/player/dashboard/page.tsx`

### Styles
13. Add glass utilities to `src/app/globals.css`
14. Add shadow/background extensions to `tailwind.config.js`

---

## VERIFICATION CHECKLIST

### Glass Effects (Critical!)
- [ ] Primary cards: `bg-white/70 backdrop-blur-[12px]`
- [ ] Secondary cards: `bg-white/50 backdrop-blur-[8px]`
- [ ] Subtle elements: `bg-white/60 backdrop-blur-[4px]`
- [ ] All glass has `border border-white/40` (or /30 for secondary)
- [ ] **INSET HIGHLIGHT**: `inset 0 1px 0 rgba(255,255,255,0.6)` in EVERY box-shadow

### Shadows (Critical!)
- [ ] Multi-layer shadows: at least 2-3 layers
- [ ] Shadow increases on hover
- [ ] NO single harsh shadows
- [ ] Shadows use low opacity (0.02-0.04)

### Backgrounds
- [ ] Page uses 4-stop cream gradient (#FFFEFA → #EDE8DD)
- [ ] Noise texture at 1.5% opacity (optional)
- [ ] No pure white or gray backgrounds

### Interactions
- [ ] Cards lift on hover: `-translate-y-0.5` or `-translate-y-1`
- [ ] Background opacity increases: 70% → 75%
- [ ] Border becomes more visible: /40 → /50
- [ ] All transitions: 200-300ms
- [ ] Cubic bezier for lift: `cubic-bezier(0.4, 0, 0.2, 1)`

### Typography
- [ ] Page title: `text-2xl font-bold text-warm-900`
- [ ] Section titles: `text-lg font-bold text-warm-900`
- [ ] Stat values: `text-3xl font-bold text-warm-900 tracking-tight`
- [ ] Labels: `text-sm font-medium text-warm-500`
- [ ] Timestamps: `text-xs text-warm-400`

### Layout
- [ ] Section gap: `gap-6`
- [ ] Card padding: `p-5` or `p-6`
- [ ] Border radii: 20px (primary), 14px (secondary), 10px (subtle)

### Premium Details
- [ ] Stat cards have accent left border option
- [ ] Activity feed has colored type dots
- [ ] Leaderboard has gold/silver/bronze badges
- [ ] Timeline has animated "active" ping
- [ ] Inner gradients for extra depth

---

## NEXT BATCH
Proceed to **Batch 6: Calendar System**.

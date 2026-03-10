# Glass & Blur Stability — Deep Dive

## Why Glass Effects Cause Problems

`backdrop-filter: blur()` is one of the most GPU-intensive CSS properties. Each blurred element requires the browser to:
1. Render everything behind the element
2. Apply a Gaussian blur filter to that rendered area
3. Composite the blurred result with the semi-transparent foreground

With 10+ glass elements visible on mobile, this can easily drop below 60fps.

---

## Performance Budget

| Device | Max Glass Elements Visible | Max Blur Value | Notes |
|--------|:-:|:-:|-------|
| Desktop (modern) | 10-15 | `blur(24px)` | GPUs handle this well |
| Laptop (integrated GPU) | 8-10 | `blur(16px)` | Watch for fan spin |
| Tablet (iPad) | 5-8 | `blur(12px)` | Compositing is expensive |
| Phone (modern) | 3-5 | `blur(8px)` | Battery + heat concern |
| Phone (older/budget) | 1-2 | `blur(4px)` | Consider solid fallback |

---

## Three-Tier Glass System

Define three tiers with CSS variables so every glass element uses the same values:

```css
:root {
  /* Subtle: large areas, filter bars, secondary panels */
  --glass-subtle-bg: rgba(255, 255, 255, 0.55);
  --glass-subtle-blur: 12px;
  --glass-subtle-border: rgba(255, 255, 255, 0.4);

  /* Standard: cards, panels (DEFAULT — 80% of glass usage) */
  --glass-standard-bg: rgba(255, 255, 255, 0.7);
  --glass-standard-blur: 16px;
  --glass-standard-border: rgba(255, 255, 255, 0.5);

  /* Prominent: navigation, modals, critical overlays */
  --glass-prominent-bg: rgba(255, 255, 255, 0.8);
  --glass-prominent-blur: 20px;
  --glass-prominent-border: rgba(255, 255, 255, 0.6);
}
```

### When to use each tier:

| Tier | Use For | Avoid For |
|------|---------|-----------|
| **Subtle** | Background panels, filter bars, large areas | Small important elements |
| **Standard** | Cards, stat panels, list items | Navigation, modals |
| **Prominent** | Navbar, modals, bottom sheets, critical UI | Cards in grids (too many) |

---

## The overflow-clip Rule

`backdrop-filter` creates a stacking context. Combined with `overflow: hidden`, this can create scroll container conflicts. `overflow: clip` is the fix — it clips content without creating a scroll container.

```tsx
// CORRECT
<div className="overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl border border-white/20">

// PROBLEMATIC (can conflict with scrollable children)
<div className="overflow-hidden rounded-2xl bg-white/70 backdrop-blur-xl border border-white/20">
```

---

## Responsive Glass (Mobile Optimization)

The key technique: **reduce or remove blur on mobile**, increase on desktop.

```tsx
<div className={cn(
  "overflow-clip rounded-2xl border",
  // Mobile: solid or very light glass
  "bg-white/90 border-warm-200",
  // Small tablet: light glass
  "sm:bg-white/80 sm:backdrop-blur-sm sm:border-white/30",
  // Desktop: full glass effect
  "lg:bg-white/70 lg:backdrop-blur-xl lg:border-white/20",
)}>
  {children}
</div>
```

Or for a simpler approach:
```tsx
<div className="overflow-clip rounded-2xl bg-white/70 backdrop-blur-sm md:backdrop-blur-xl border border-white/20">
```

---

## Containment for Glass Performance

CSS `contain` tells the browser an element is independent — it doesn't affect (or get affected by) siblings. This lets the browser optimize rendering.

```tsx
<div className={cn(
  "overflow-clip rounded-2xl bg-white/70 backdrop-blur-xl",
  "isolate",          // Creates stacking context (prevents z-index leaks)
  "[contain:paint]",  // Tells browser this element is visually independent
)}>
  {children}
</div>
```

---

## Glass + Scroll Performance

Glass elements inside a scrolling container are the worst case for performance. Each frame, the browser must re-blur the background as it scrolls.

**Fix**: For glass cards in a scroll list, consider solid backgrounds:

```tsx
function ScrollableCardList({ items }) {
  return (
    <div className="overflow-y-auto max-h-[60vh] space-y-4">
      {items.map(item => (
        <div key={item.id} className={cn(
          "overflow-clip rounded-xl p-5",
          // SOLID background for scroll performance
          "bg-white border border-warm-200 shadow-sm",
          // Glass only on hover (brief, not constant)
          "hover:bg-white/70 hover:backdrop-blur-sm hover:border-white/20",
          "transition-all duration-200",
        )}>
          {item.content}
        </div>
      ))}
    </div>
  );
}
```

---

## Debugging Glass Issues

```bash
# Chrome DevTools → Rendering → Layer borders
# Each backdrop-filter element creates its own compositing layer
# Too many layers = GPU memory pressure

# Count glass elements in codebase
grep -rn "backdrop-blur" --include="*.tsx" src/ | wc -l

# Find large glass elements (potential performance issue)
grep -rn "backdrop-blur" --include="*.tsx" src/ | grep -i "w-full\|inset-0\|h-screen"
```

In Chrome DevTools:
1. Performance tab → Record a scroll interaction
2. Look for long "Composite Layers" tasks (>16ms)
3. If compositing is slow, reduce glass elements or blur values

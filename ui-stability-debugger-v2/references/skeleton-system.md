# Skeleton Loading System — Deep Dive

## The Golden Rule

**A skeleton must be the exact same height and width as the real content it replaces.**

If the skeleton is even 10px shorter than the loaded content, users see a layout jump (CLS). This makes the app feel broken even though everything works correctly.

---

## Measuring Real Content for Skeletons

```
Step 1: Render the real component with data
Step 2: Open DevTools → inspect the component
Step 3: Note the computed height, padding, and gap values
Step 4: Build skeleton with IDENTICAL dimensions

Example:
  StatCard rendered = 120px tall (p-6 + text-sm + mt-2 + text-3xl)
  StatCardSkeleton  = 120px tall (p-6 + h-5 + mt-2 + h-9)
  ✅ Zero CLS
```

---

## Skeleton Building Blocks

```tsx
// Reusable skeleton primitives
function SkeletonLine({ w = "w-full", h = "h-4" }: { w?: string; h?: string }) {
  return <div className={cn(w, h, "rounded-md bg-warm-200/60 animate-shimmer")} />;
}

function SkeletonCircle({ size = "h-10 w-10" }: { size?: string }) {
  return <div className={cn(size, "rounded-full bg-warm-200/60 animate-shimmer")} />;
}

function SkeletonRect({ w = "w-full", h = "h-24" }: { w?: string; h?: string }) {
  return <div className={cn(w, h, "rounded-lg bg-warm-200/60 animate-shimmer")} />;
}
```

---

## Shimmer Animation (Single Definition)

Only define shimmer ONCE in your entire app:

```css
/* globals.css */
@keyframes shimmer {
  0% { background-position: -200% 0; }
  100% { background-position: 200% 0; }
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

```tsx
// The shimmer class
// Option A: Tailwind's built-in animate-pulse (simple, gray pulse)
<div className="animate-pulse bg-warm-200/60 rounded-md" />

// Option B: Custom shimmer gradient (more premium, directional sweep)
<div className="animate-shimmer bg-gradient-to-r from-warm-200/40 via-warm-100/60 to-warm-200/40 bg-[length:200%_100%] rounded-md" />
```

---

## Suspense Boundary Strategy

### Per-card boundaries (recommended for dashboards)
```tsx
// Each card loads independently → fastest perceived loading
<div className="grid grid-cols-3 gap-6">
  <Suspense fallback={<StatCardSkeleton />}>
    <StatCard metric="rounds" />
  </Suspense>
  <Suspense fallback={<StatCardSkeleton />}>
    <StatCard metric="avg-score" />
  </Suspense>
  <Suspense fallback={<StatCardSkeleton />}>
    <StatCard metric="handicap" />
  </Suspense>
</div>
```

### Per-section boundaries (recommended for pages with distinct sections)
```tsx
// Header, stats, and activity each load independently
<div className="space-y-6">
  <PageHeader title="Dashboard" />  {/* No data = instant */}

  <Suspense fallback={<StatsGridSkeleton />}>
    <StatsGrid />  {/* 3 stat cards */}
  </Suspense>

  <Suspense fallback={<ActivityListSkeleton count={5} />}>
    <ActivityFeed />  {/* List of recent items */}
  </Suspense>
</div>
```

### loading.tsx files (Next.js route-level)
```tsx
// app/dashboard/loading.tsx
// This shows while the page's data loads
export default function Loading() {
  return <DashboardSkeleton />;
}
```

---

## Skeleton Coverage Checklist

Every page that fetches data needs skeleton coverage. Here's a quick audit:

```
□ Dashboard home → stat cards, activity feed, alerts
□ Roster page → player list, filters
□ Stats page → stat cards, charts, tables
□ Calendar → event list, calendar grid
□ Messages → thread list, message content
□ Player profile → bio, stats, rounds
□ Round review → scorecard, shot data
□ Settings → form fields (usually not needed, but loading state for save)
```

---

## Anti-patterns

| Pattern | Problem | Fix |
|---------|---------|-----|
| `{isLoading ? <Spinner /> : <Content />}` | Spinner reserves no space = CLS | Use skeleton with matched dimensions |
| `{data && <Content data={data} />}` | Blank space while loading | Wrap in Suspense with skeleton fallback |
| One skeleton for whole page | All-or-nothing loading | Break into per-section skeletons |
| Skeleton with `min-h-[200px]` | Doesn't match real height | Measure real component, match exactly |
| Different skeleton styles per page | Inconsistent loading experience | Use shared skeleton primitives |

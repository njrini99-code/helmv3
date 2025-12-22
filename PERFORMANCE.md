# Performance Optimization Guide

This document outlines all performance optimizations implemented in Helm Sports Labs and how to use them effectively.

## Table of Contents

1. [Bundle Size Optimization](#bundle-size-optimization)
2. [Code Splitting & Lazy Loading](#code-splitting--lazy-loading)
3. [Component Optimization](#component-optimization)
4. [Database Query Optimization](#database-query-optimization)
5. [Image Optimization](#image-optimization)
6. [Loading States](#loading-states)
7. [Performance Monitoring](#performance-monitoring)

---

## Bundle Size Optimization

### Configuration

We use webpack chunk splitting to reduce bundle size:

```javascript
// next.config.js
splitChunks: {
  cacheGroups: {
    vendor: { // Third-party libraries
      name: 'vendor',
      test: /node_modules/,
      priority: 20,
    },
    ui: { // UI components
      name: 'ui',
      test: /[\\/]src[\\/]components[\\/]ui[\\/]/,
      priority: 30,
    },
  },
}
```

### Analyze Bundle

```bash
npm run analyze
```

This generates an interactive visualization of your bundle size.

### Key Optimizations

- ✅ SWC minification enabled
- ✅ Code splitting by route
- ✅ Vendor chunk separation
- ✅ UI components chunked separately
- ✅ Package import optimization for `recharts`, `date-fns`, `framer-motion`

---

## Code Splitting & Lazy Loading

### Using Lazy Components

Import from `/src/lib/lazy-components.tsx` instead of direct imports:

```typescript
// ❌ BAD - Loads component immediately
import { VideoShowcase } from '@/components/player/VideoShowcase';

// ✅ GOOD - Loads component on demand
import { LazyVideoShowcase } from '@/lib/lazy-components';

// Use it the same way
<LazyVideoShowcase playerId={id} />
```

### Available Lazy Components

- `LazyVideoShowcase` - Video player (client-side only)
- `LazyChatWindow` - Messaging chat window
- `LazyConversationList` - Conversation list
- `LazyPipelineBoard` - Drag-and-drop pipeline (client-side only)
- `LazyUSAMap` - Map component (client-side only)
- `LazyShotTracking` - Golf shot tracking (client-side only)

### Creating Custom Lazy Components

```typescript
import { createLazyComponent } from '@/lib/lazy-components';

export const LazyMyComponent = createLazyComponent(
  () => import('@/components/MyComponent'),
  {
    loading: CustomLoadingComponent, // Optional
    ssr: false, // Disable SSR if needed
  }
);
```

### Preloading

Preload components before user needs them:

```typescript
import { preloadComponent, LazyVideoShowcase } from '@/lib/lazy-components';

// Preload when user hovers over button
function handleMouseEnter() {
  preloadComponent(LazyVideoShowcase);
}
```

---

## Component Optimization

### React.memo

Use memoization to prevent unnecessary re-renders:

```typescript
import { memoShallow, memoDeep } from '@/lib/performance';

// For components with primitive props
const OptimizedCard = memoShallow(PlayerCard, 'PlayerCard');

// For components with complex object props (use sparingly)
const OptimizedList = memoDeep(PlayerList, 'PlayerList');
```

### Debouncing & Throttling

```typescript
import { debounce, throttle } from '@/lib/performance';

// Debounce search input (waits for user to stop typing)
const handleSearch = debounce((query: string) => {
  fetchResults(query);
}, 300);

// Throttle scroll handler (limits to once per 100ms)
const handleScroll = throttle(() => {
  checkScrollPosition();
}, 100);
```

### Virtual Scrolling

For lists with 100+ items:

```typescript
import { getVisibleItems } from '@/lib/performance';

function LargeList({ items }: { items: Player[] }) {
  const [scrollTop, setScrollTop] = useState(0);
  const containerHeight = 600;
  const itemHeight = 80;

  const { visibleItems, startIndex } = getVisibleItems(
    items,
    scrollTop,
    containerHeight,
    itemHeight
  );

  return (
    <div
      style={{ height: containerHeight, overflow: 'auto' }}
      onScroll={(e) => setScrollTop(e.currentTarget.scrollTop)}
    >
      <div style={{ height: items.length * itemHeight, position: 'relative' }}>
        {visibleItems.map((item, i) => (
          <div
            key={item.id}
            style={{
              position: 'absolute',
              top: (startIndex + i) * itemHeight,
              height: itemHeight,
            }}
          >
            <PlayerCard player={item} />
          </div>
        ))}
      </div>
    </div>
  );
}
```

---

## Database Query Optimization

### Use Optimized Queries

Import from `/src/lib/queries/performance.ts`:

```typescript
import {
  getPlayersOptimized,
  getPlayerByIdOptimized,
  getWatchlistOptimized,
  searchPlayersOptimized,
} from '@/lib/queries/performance';

// ✅ Optimized - selects only needed columns, uses pagination
const players = await getPlayersOptimized({
  pagination: { page: 1, pageSize: 20 },
  filters: { gradYear: 2025 },
});

// ❌ Not optimized - selects all columns, no pagination
const players = await supabase.from('players').select('*');
```

### Key Optimizations

1. **Select Only Needed Columns**
   ```typescript
   // Instead of .select('*')
   .select('id, first_name, last_name, avatar_url')
   ```

2. **Use Pagination**
   ```typescript
   .range(from, to)
   .limit(20)
   ```

3. **Limit Joined Data**
   ```typescript
   .limit(4, { foreignTable: 'videos' })
   ```

4. **Batch Loading**
   ```typescript
   const players = await batchLoadPlayers([id1, id2, id3]);
   ```

5. **Prefetching**
   ```typescript
   // Warm up cache for anticipated data
   await prefetchPlayerData(playerId);
   ```

### Database Indexes

Ensure these indexes exist in Supabase:

```sql
-- Players table
CREATE INDEX idx_players_recruiting ON players(recruiting_activated);
CREATE INDEX idx_players_grad_year ON players(grad_year);
CREATE INDEX idx_players_position ON players(primary_position);
CREATE INDEX idx_players_state ON players(state);
CREATE INDEX idx_players_updated ON players(updated_at DESC);

-- Watchlists table
CREATE INDEX idx_watchlists_coach ON watchlists(coach_id);
CREATE INDEX idx_watchlists_player ON watchlists(player_id);
CREATE INDEX idx_watchlists_status ON watchlists(status);

-- Videos table
CREATE INDEX idx_videos_player ON videos(player_id);
CREATE INDEX idx_videos_primary ON videos(is_primary);

-- Messages table
CREATE INDEX idx_messages_conversation ON messages(conversation_id);
CREATE INDEX idx_messages_sender ON messages(sender_id);
CREATE INDEX idx_messages_sent ON messages(sent_at DESC);
```

---

## Image Optimization

### Use Next.js Image Component

```typescript
import Image from 'next/image';

// ✅ Optimized - automatic format conversion, lazy loading, sizing
<Image
  src={player.avatar_url}
  alt={player.name}
  width={64}
  height={64}
  className="rounded-full"
  priority={false} // Only set true for above-the-fold images
/>

// ❌ Not optimized
<img src={player.avatar_url} alt={player.name} />
```

### Formats

Images are automatically converted to:
- AVIF (best compression, modern browsers)
- WebP (fallback)
- Original format (final fallback)

### Responsive Sizing

```typescript
<Image
  src={thumbnail}
  alt="Video thumbnail"
  width={640}
  height={360}
  sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
/>
```

---

## Loading States

### Skeleton Components

Use skeleton loaders for better perceived performance:

```typescript
import {
  PlayerCardSkeleton,
  VideoCardSkeleton,
  DashboardSkeleton,
} from '@/components/ui/skeletons';

function PlayerList() {
  const { players, loading } = usePlayers();

  if (loading) {
    return (
      <div className="space-y-4">
        {Array.from({ length: 5 }).map((_, i) => (
          <PlayerCardSkeleton key={i} />
        ))}
      </div>
    );
  }

  return <>{/* Render players */}</>;
}
```

### Available Skeletons

- `Skeleton` - Base skeleton
- `PlayerCardSkeleton` - Player card
- `VideoCardSkeleton` - Video card
- `MessageSkeleton` - Chat message
- `ConversationItemSkeleton` - Conversation list item
- `StatCardSkeleton` - Stat card
- `ProfileHeaderSkeleton` - Profile header
- `DashboardSkeleton` - Full dashboard
- `ListSkeleton` - Generic list
- `FormSkeleton` - Form fields

---

## Performance Monitoring

### Measure Render Time (Development Only)

```typescript
import { measureRenderTime } from '@/lib/performance';

function MyComponent() {
  measureRenderTime('MyComponent', () => {
    // Component logic here
  });

  return <>{/* JSX */}</>;
}

// Output: [Performance] MyComponent rendered in 12.34ms
```

### Browser DevTools

1. **Lighthouse** - Run performance audit
   - Open DevTools → Lighthouse tab
   - Run audit for Performance

2. **React DevTools Profiler**
   - Record interactions
   - Identify slow components
   - Find unnecessary re-renders

3. **Network Tab**
   - Check bundle sizes
   - Verify code splitting
   - Monitor API response times

### Core Web Vitals

Monitor these metrics:

- **LCP (Largest Contentful Paint)** - Should be < 2.5s
- **FID (First Input Delay)** - Should be < 100ms
- **CLS (Cumulative Layout Shift)** - Should be < 0.1

---

## Best Practices

### Do's ✅

- Use lazy loading for heavy components
- Implement pagination for large lists
- Add loading skeletons for all async content
- Memoize expensive components
- Select only needed database columns
- Use Next.js Image for all images
- Debounce search inputs
- Throttle scroll handlers
- Prefetch data when possible

### Don'ts ❌

- Don't load all data at once
- Don't use `SELECT *` in queries
- Don't over-memoize (adds overhead)
- Don't skip loading states
- Don't use regular `<img>` tags
- Don't re-render unnecessarily
- Don't fetch data on every render
- Don't ignore bundle size

---

## Performance Checklist

Before deploying:

- [ ] Run `npm run analyze` to check bundle size
- [ ] All images use Next.js `Image` component
- [ ] Heavy components are lazy-loaded
- [ ] Database queries use optimized versions
- [ ] Loading skeletons added to all async content
- [ ] Expensive components are memoized
- [ ] Search inputs are debounced
- [ ] Large lists use pagination or virtual scrolling
- [ ] Lighthouse score > 90
- [ ] Core Web Vitals all in green

---

## Resources

- [Next.js Performance](https://nextjs.org/docs/pages/building-your-application/optimizing)
- [React Performance](https://react.dev/learn/render-and-commit)
- [Web Vitals](https://web.dev/vitals/)
- [Webpack Bundle Analyzer](https://www.npmjs.com/package/webpack-bundle-analyzer)

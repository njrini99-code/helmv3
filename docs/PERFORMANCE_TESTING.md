# Performance Testing Guide

This document outlines performance testing strategies and tools for Helm Sports Labs.

---

## Performance Targets

### Core Web Vitals (Google)

| Metric | Target | Description |
|--------|--------|-------------|
| **LCP** (Largest Contentful Paint) | < 2.5s | Main content load time |
| **FID** (First Input Delay) | < 100ms | Time to interactivity |
| **CLS** (Cumulative Layout Shift) | < 0.1 | Visual stability |
| **TTFB** (Time to First Byte) | < 600ms | Server response time |

### Application Targets

| Page | Load Time | First Paint | Interactive |
|------|-----------|-------------|-------------|
| Landing | < 1.5s | < 800ms | < 2s |
| Dashboard | < 2s | < 1s | < 2.5s |
| Discover | < 2.5s | < 1s | < 3s |
| Profile | < 2s | < 1s | < 2.5s |

### API Response Times

| Endpoint Type | Target | Max |
|---------------|--------|-----|
| Auth (login, signup) | < 500ms | 1s |
| Data fetch (list) | < 300ms | 800ms |
| Data fetch (single) | < 200ms | 500ms |
| Mutations (create/update) | < 400ms | 1s |
| File upload | < 2s | 5s |

---

## Testing Tools

### 1. Lighthouse (Built-in Chrome DevTools)

**What it tests:** Performance, accessibility, SEO, best practices

**How to use:**
```bash
# Install CLI
npm install -g lighthouse

# Run against local
lighthouse http://localhost:3000 --view

# Run against production
lighthouse https://helmlab.com --view

# Generate JSON report
lighthouse https://helmlab.com --output json --output-path ./report.json
```

**Targets:**
- Performance score: > 90
- Accessibility score: > 95
- Best Practices score: > 90
- SEO score: > 90

### 2. Web Vitals Monitoring

**Install package:**
```bash
npm install web-vitals
```

**Implementation:**
```typescript
// src/lib/web-vitals.ts
import { onCLS, onFID, onLCP } from 'web-vitals';

function sendToAnalytics(metric: any) {
  // Send to Google Analytics, PostHog, or custom endpoint
  console.log(metric);

  // Example: Send to API
  fetch('/api/analytics/vitals', {
    method: 'POST',
    body: JSON.stringify(metric),
    headers: { 'Content-Type': 'application/json' },
  });
}

onCLS(sendToAnalytics);
onFID(sendToAnalytics);
onLCP(sendToAnalytics);
```

**Add to layout:**
```typescript
// src/app/layout.tsx
'use client';

import { useEffect } from 'react';

export default function RootLayout({ children }) {
  useEffect(() => {
    import('@/lib/web-vitals');
  }, []);

  return <html>{children}</html>;
}
```

### 3. k6 (Load Testing)

**Install:**
```bash
brew install k6  # macOS
# OR
npm install -g k6
```

**Test script:**
```javascript
// tests/load/api-test.js
import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  vus: 10, // 10 virtual users
  duration: '30s',
  thresholds: {
    http_req_duration: ['p(95)<500'], // 95% of requests < 500ms
    http_req_failed: ['rate<0.01'], // Error rate < 1%
  },
};

export default function () {
  // Test dashboard load
  const res = http.get('http://localhost:3000/baseball/dashboard', {
    headers: {
      'Authorization': 'Bearer your-test-token',
    },
  });

  check(res, {
    'status is 200': (r) => r.status === 200,
    'response time < 500ms': (r) => r.timings.duration < 500,
  });

  sleep(1);
}
```

**Run test:**
```bash
k6 run tests/load/api-test.js
```

### 4. Artillery (Alternative to k6)

**Install:**
```bash
npm install -g artillery
```

**Test configuration:**
```yaml
# tests/load/artillery.yml
config:
  target: 'http://localhost:3000'
  phases:
    - duration: 60
      arrivalRate: 10
      name: Warm up
    - duration: 120
      arrivalRate: 50
      name: Sustained load
  processor: "./processor.js"

scenarios:
  - name: "Load dashboard"
    flow:
      - get:
          url: "/baseball/dashboard"
          headers:
            Authorization: "Bearer test-token"
      - think: 2
      - get:
          url: "/baseball/discover"
```

**Run:**
```bash
artillery run tests/load/artillery.yml
```

### 5. Next.js Bundle Analyzer

**Already configured!** Just run:

```bash
ANALYZE=true npm run build
```

**What to look for:**
- Total bundle size < 300kb (gzipped)
- No duplicate dependencies
- Code splitting working properly
- Largest chunks identified

---

## Performance Checklist

### Before Each Release

- [ ] Run Lighthouse on key pages (score > 90)
- [ ] Check bundle size (< 300kb gzipped)
- [ ] Test API response times (< targets)
- [ ] Load test with 100 concurrent users
- [ ] Check database query performance
- [ ] Test on slow 3G network (Chrome DevTools)
- [ ] Test on low-end device

### Database Performance

```sql
-- Check slow queries in Supabase
SELECT * FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;

-- Check table sizes
SELECT
  schemaname,
  tablename,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) AS size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Check index usage
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC;
```

### Optimizations Applied

✅ **Next.js:**
- Image optimization enabled
- Code splitting configured
- Bundle analyzer configured
- Turbopack enabled (experimental)
- Static page generation where possible
- Remove console logs in production

✅ **Webpack:**
- Vendor chunking
- Common code chunking
- UI components separate chunk
- Minification enabled

✅ **API:**
- Rate limiting (prevents abuse)
- Response caching headers
- Efficient database queries

✅ **Images:**
- Modern formats (WebP, AVIF)
- Responsive sizes
- Lazy loading
- CDN caching (31536000s)

---

## Load Testing Scenarios

### Scenario 1: Normal Traffic
```bash
# 50 concurrent users, 5 minutes
k6 run --vus 50 --duration 5m tests/load/normal.js
```

**Expected:**
- 95th percentile response time < 500ms
- Error rate < 0.1%
- Throughput > 100 req/s

### Scenario 2: Peak Traffic
```bash
# 200 concurrent users, 10 minutes
k6 run --vus 200 --duration 10m tests/load/peak.js
```

**Expected:**
- 95th percentile response time < 1s
- Error rate < 1%
- Throughput > 300 req/s

### Scenario 3: Stress Test
```bash
# Ramp up to 500 users
k6 run tests/load/stress.js
```

**Goal:** Find breaking point

### Scenario 4: Spike Test
```bash
# Sudden spike from 10 to 500 users
k6 run tests/load/spike.js
```

**Goal:** Test auto-scaling

---

## Monitoring in Production

### 1. Vercel Analytics (Built-in)

- Real User Monitoring (RUM)
- Core Web Vitals tracking
- Page load times
- Geographic performance

**Enable:**
```typescript
// next.config.mjs
const nextConfig = {
  experimental: {
    webVitalsAttribution: ['CLS', 'LCP'],
  },
};
```

### 2. Sentry Performance Monitoring

```typescript
// sentry.client.config.ts
Sentry.init({
  tracesSampleRate: 0.1, // 10% of transactions
  integrations: [
    new Sentry.BrowserTracing({
      tracePropagationTargets: ['localhost', 'helmlab.com'],
    }),
  ],
});
```

### 3. Custom Performance API

```typescript
// src/lib/performance.ts
export function trackPageLoad(pageName: string) {
  if (typeof window !== 'undefined' && window.performance) {
    const perfData = window.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;

    // Send to analytics
    fetch('/api/analytics/performance', {
      method: 'POST',
      body: JSON.stringify({
        page: pageName,
        loadTime: pageLoadTime,
        ttfb: perfData.responseStart - perfData.navigationStart,
        domReady: perfData.domContentLoadedEventEnd - perfData.navigationStart,
      }),
    });
  }
}
```

---

## Database Performance

### Optimization Checklist

- [ ] Indexes on foreign keys
- [ ] Indexes on frequently queried columns
- [ ] No N+1 queries
- [ ] Use select() to limit columns
- [ ] Pagination on large datasets
- [ ] Connection pooling configured

### Query Optimization

```typescript
// ❌ Bad - N+1 query
const players = await supabase.from('players').select('*');
for (const player of players) {
  const team = await supabase.from('teams').select('*').eq('id', player.team_id);
}

// ✅ Good - Single query with join
const players = await supabase
  .from('players')
  .select('*, teams(*)')
  .limit(50);

// ✅ Better - Limit columns
const players = await supabase
  .from('players')
  .select('id, name, teams(id, name)')
  .limit(50);
```

---

## Performance Budget

### JavaScript Bundle
- **Maximum:** 300kb (gzipped)
- **Target:** 200kb (gzipped)
- **Current:** Check with `ANALYZE=true npm run build`

### CSS Bundle
- **Maximum:** 50kb (gzipped)
- **Target:** 30kb (gzipped)

### Images
- **Homepage hero:** < 100kb
- **Profile photos:** < 50kb
- **Thumbnails:** < 20kb

### API Response
- **List endpoints:** < 300ms
- **Single item:** < 200ms
- **Mutations:** < 400ms

---

## Testing Schedule

### Daily (Automated)
- Lighthouse CI on PR
- Bundle size check
- TypeScript build

### Weekly (Manual)
- Load test staging environment
- Review Sentry performance data
- Check Vercel analytics

### Monthly (Manual)
- Full performance audit
- Database query analysis
- Dependency updates

### Quarterly (Manual)
- Professional load testing
- Capacity planning review
- Infrastructure optimization

---

## Tools Summary

| Tool | Purpose | When to Use |
|------|---------|-------------|
| **Lighthouse** | Overall performance score | Every PR, pre-deploy |
| **web-vitals** | Real user monitoring | Always on in production |
| **k6** | Load testing | Before major releases |
| **Artillery** | Alternative load testing | Spike/stress tests |
| **Bundle Analyzer** | Bundle size optimization | When adding dependencies |
| **Chrome DevTools** | Network/performance profiling | During development |
| **Vercel Analytics** | Production monitoring | Always on |
| **Sentry Performance** | Error + performance tracking | Always on |

---

## Quick Start

1. **Install tools:**
```bash
npm install -g lighthouse k6
npm install web-vitals
```

2. **Run baseline test:**
```bash
npm run build
npm run start
lighthouse http://localhost:3000 --view
```

3. **Check bundle size:**
```bash
ANALYZE=true npm run build
```

4. **Load test (if k6 installed):**
```bash
k6 run tests/load/basic.js
```

---

## Next Steps

1. Create load test scripts (`tests/load/`)
2. Set up CI/CD Lighthouse checks
3. Configure production monitoring
4. Establish performance baselines
5. Set up alerting for degradation

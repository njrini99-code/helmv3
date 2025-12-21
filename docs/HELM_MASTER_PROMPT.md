# HELM_MASTER_PROMPT.md

> **CLAUDE CODE:** Execute all phases in order. Do not skip anything.

---

# PHASE 1: DOCUMENTATION CLEANUP

Delete all duplicate/outdated files:

```bash
rm -f docs/CLAUDE.md
rm -rf helm-docs/
rm -rf docs/archive/
rm -rf profile-features/
rm -f docs/FULL_AUDIT_PROMPT.md
rm -f docs/CURSOR_AUDIT_PROMPT.md
rm -f docs/AUDIT_FIX_GUIDE.md
rm -f docs/COMPREHENSIVE_AUDIT_REPORT.md
rm -f docs/DASHBOARD_BY_DASHBOARD_AUDIT.md
rm -f docs/MVP_SPRINT_PLAN.md
rm -f docs/PHASE_1_ROADMAP.md
rm -f docs/TODO.md
rm -f docs/PROFILE_FEATURES_GUIDE.md
rm -f docs/SUBSCRIPTIONS.md
```

Say: "Phase 1 complete: Documentation cleaned up."

---

# PHASE 2: CODE FIXES

## Fix 2.1: Wrong Table Name
**File:** src/hooks/use-dashboard.ts

Find and replace ALL instances:
```
Find:    .from('recruit_watchlist')
Replace: .from('watchlists')
```

## Fix 2.2: Pipeline Stages
**File:** src/app/(dashboard)/dashboard/pipeline/page.tsx

Replace stages array:
```typescript
// FIND:
const stages: PipelineStage[] = ['watchlist', 'contacted', 'high_priority', 'campus_visit', 'offer_extended', 'committed'];

// REPLACE WITH:
const stages: PipelineStage[] = ['watchlist', 'high_priority', 'offer_extended', 'committed', 'uninterested'];
```

Also change grid-cols-6 to grid-cols-5.

## Fix 2.3: Pipeline Labels
**File:** src/lib/utils.ts

Replace getPipelineStageLabel function:
```typescript
export function getPipelineStageLabel(stage: string): string {
  const labels: Record<string, string> = {
    watchlist: 'Prospects',
    high_priority: 'High Priority',
    offer_extended: 'Offer Extended',
    committed: 'Committed',
    uninterested: 'Not Interested',
  };
  return labels[stage] || stage;
}
```

Replace getPipelineStageColor function:
```typescript
export function getPipelineStageColor(stage: string): string {
  const colors: Record<string, string> = {
    watchlist: 'bg-slate-100',
    high_priority: 'bg-amber-50',
    offer_extended: 'bg-blue-50',
    committed: 'bg-green-50',
    uninterested: 'bg-gray-50',
  };
  return colors[stage] || 'bg-gray-100';
}
```

## Fix 2.4: Delete Duplicate Type Files
```bash
rm -f src/types/database.ts
rm -f src/types/supabase.ts
```

## Fix 2.5: Update Type Imports
Search and replace across entire src/:
```
Find:    from '@/types/database'
Replace: from '@/lib/types'
```

## Fix 2.6: Remove Duplicate Functions
**File:** src/lib/types/index.ts

Delete these functions (they exist in lib/utils.ts):
- formatHeight
- getPipelineStageLabel
- getPipelineStageColor

## Fix 2.7: Remove @ts-ignore
**Files:**
- src/app/(dashboard)/dashboard/watchlist/page.tsx
- src/hooks/use-watchlist.ts

Delete lines containing: // @ts-ignore

## Fix 2.8: Add Package Scripts
**File:** package.json

Add to scripts:
```json
"typecheck": "tsc --noEmit",
"db:types": "npx supabase gen types typescript --project-id $SUPABASE_PROJECT_ID > src/lib/types/database.ts",
"check": "npm run typecheck && npm run lint"
```

## Fix 2.9: Create Error Boundary
**Create:** src/app/(dashboard)/dashboard/error.tsx

```typescript
'use client';

import { useEffect } from 'react';
import { Button } from '@/components/ui/button';

export default function DashboardError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('Dashboard error:', error);
  }, [error]);

  return (
    <div className="min-h-[400px] flex items-center justify-center p-8">
      <div className="text-center max-w-md">
        <div className="w-16 h-16 rounded-full bg-red-50 flex items-center justify-center mx-auto mb-4">
          <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <h2 className="text-xl font-semibold text-slate-900 mb-2">Something went wrong</h2>
        <p className="text-slate-500 mb-6">{error.message || 'An unexpected error occurred.'}</p>
        <div className="flex gap-3 justify-center">
          <Button variant="secondary" onClick={() => window.location.href = '/dashboard'}>
            Go to Dashboard
          </Button>
          <Button onClick={reset}>Try Again</Button>
        </div>
      </div>
    </div>
  );
}
```

Copy to: discover/error.tsx, watchlist/error.tsx, pipeline/error.tsx, messages/error.tsx

## Fix 2.10: Create Logger
**Create:** src/lib/logger.ts

```typescript
const isDev = process.env.NODE_ENV === 'development';

export const logger = {
  debug: (message: string, ...args: unknown[]) => {
    if (isDev) console.log(`[DEBUG] ${message}`, ...args);
  },
  info: (message: string, ...args: unknown[]) => {
    if (isDev) console.info(`[INFO] ${message}`, ...args);
  },
  warn: (message: string, ...args: unknown[]) => {
    console.warn(`[WARN] ${message}`, ...args);
  },
  error: (message: string, error?: unknown) => {
    console.error(`[ERROR] ${message}`, error);
  },
};
```

## Fix 2.11: Security Fix
**File:** src/lib/supabase/middleware.ts

Replace isDevMode check:
```typescript
// FIND:
const isDevMode = process.env.NODE_ENV === 'development' ||
                  process.env.NODE_ENV !== 'production' ||
                  !process.env.VERCEL;

// REPLACE WITH:
const isDevMode = process.env.NODE_ENV === 'development' &&
                  process.env.NEXT_PUBLIC_DEV_MODE === 'true';
```

---

# PHASE 3: VERIFY

Run:
```bash
npm run typecheck
npm run lint
grep -r "recruit_watchlist" src/
grep -r "from '@/types/database'" src/
```

All should pass/return nothing.

Say: "All phases complete. Ready to commit."

---

# RULES FOR FUTURE DEVELOPMENT

## The 5 Critical Rules

| # | Rule | Correct | Wrong |
|---|------|---------|-------|
| 1 | Type imports | `from '@/lib/types'` | `from '@/types/database'` |
| 2 | Watchlist table | `.from('watchlists')` | `.from('recruit_watchlist')` |
| 3 | Pipeline stages | 5 values only | `contacted`, `campus_visit` |
| 4 | Client components | Add `'use client'` | Missing directive |
| 5 | Server actions | Check auth first | No auth check |

## Valid Pipeline Stages (ONLY these 5)
- watchlist
- high_priority
- offer_extended
- committed
- uninterested

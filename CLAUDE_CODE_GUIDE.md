# CLAUDE_CODE_GUIDE.md - Read This First

> **Claude Code / Cursor:** Read this ENTIRE file before making ANY code changes.

---

## WHAT THIS PROJECT IS

**Helm Sports Labs** - A baseball recruiting platform connecting:
- **College Coaches** - Find and recruit high school players
- **High School Coaches** - Manage rosters, help players get recruited
- **Players** - Create profiles, track recruiting interest

**Stack:** Next.js 14 (App Router) + TypeScript + Supabase + Tailwind

---

## CORRECT IMPORTS

```typescript
// Types - ALWAYS from @/lib/types
import type { Player, Coach, Watchlist, PipelineStage } from '@/lib/types';

// Supabase - Server vs Client
import { createClient } from '@/lib/supabase/server';  // In server components/actions
import { createClient } from '@/lib/supabase/client';  // In client components/hooks

// Components
import { Button } from '@/components/ui/button';
import { PlayerCard } from '@/components/features/player-card';

// Hooks
import { useWatchlist } from '@/hooks/use-watchlist';

// Utils
import { cn, formatHeight, formatDate } from '@/lib/utils';
```

### NEVER IMPORT FROM
```typescript
import { Player } from '@/types/database';      // DELETED
import { Player } from '@/types/supabase';      // DELETED
```

---

## DATABASE TABLES

### Correct Table Names
| Use This | NOT This |
|----------|----------|
| `watchlists` | `recruit_watchlist` |
| `videos` | `player_videos` |
| `organizations` | `colleges` |

### Pipeline Stages (ONLY these 5 exist)
```typescript
type PipelineStage =
  | 'watchlist'
  | 'high_priority'
  | 'offer_extended'
  | 'committed'
  | 'uninterested';

// These DO NOT exist: 'contacted', 'campus_visit', 'priority'
```

---

## CODE PATTERNS

### Pattern A: Server Component Page
```typescript
// src/app/(dashboard)/dashboard/example/page.tsx
import { createClient } from '@/lib/supabase/server';

export default async function ExamplePage() {
  const supabase = await createClient();
  const { data, error } = await supabase.from('players').select('*');
  if (error) throw new Error('Failed to load');
  return <div>{/* content */}</div>;
}
```

### Pattern B: Client Component
```typescript
// src/components/features/example.tsx
'use client';

import { useState } from 'react';
import type { Player } from '@/lib/types';

export function Example({ players }: { players: Player[] }) {
  const [selected, setSelected] = useState<string | null>(null);
  return <div>{/* content */}</div>;
}
```

### Pattern C: Server Action
```typescript
// src/app/actions/example.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function createExample(name: string) {
  const supabase = await createClient();

  // 1. ALWAYS check auth
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: 'Unauthorized' };

  // 2. Do operation
  const { error } = await supabase.from('examples').insert({ name });
  if (error) return { error: 'Failed' };

  // 3. ALWAYS revalidate
  revalidatePath('/dashboard/examples');
  return { success: true };
}
```

### Pattern D: Custom Hook
```typescript
// src/hooks/use-example.ts
'use client';

import { useState, useEffect, useCallback } from 'react';
import { createClient } from '@/lib/supabase/client';
import type { Example } from '@/lib/types';

export function useExample() {
  const [data, setData] = useState<Example[]>([]);
  const [loading, setLoading] = useState(true);
  const supabase = createClient();

  const fetch = useCallback(async () => {
    const { data } = await supabase.from('examples').select('*');
    setData(data || []);
    setLoading(false);
  }, []);

  useEffect(() => { fetch(); }, [fetch]);
  return { data, loading, refetch: fetch };
}
```

---

## COMMON MISTAKES

| Mistake | Fix |
|---------|-----|
| `.from('recruit_watchlist')` | Use `.from('watchlists')` |
| `import from '@/types/database'` | Use `from '@/lib/types'` |
| `pipeline_stage: 'contacted'` | Only use valid 5 stages |
| Using hooks without `'use client'` | Add directive at top |
| Not checking auth in actions | Always verify user first |
| Not calling `revalidatePath` | Always revalidate after mutations |

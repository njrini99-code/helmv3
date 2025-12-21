# CLAUDE.md - Helm Sports Labs

> **MANDATORY:** Read this ENTIRE file before writing ANY code. These rules prevent bugs.

---

## Project Overview

**Helm Sports Labs** - Baseball recruiting platform
**Stack:** Next.js 14 (App Router) + TypeScript + Supabase + Tailwind
**Users:** College Coaches, HS Coaches, JUCO Coaches, Showcase Coaches, Players

---

## CRITICAL RULES (Memorize These)

### Rule 1: Type Imports
```typescript
// ALWAYS use this path
import type { Player, Coach, Watchlist, PipelineStage } from '@/lib/types';

// NEVER use these (deleted/deprecated)
import { Player } from '@/types/database';     // WRONG
import { Player } from '@/types/supabase';     // WRONG
```

### Rule 2: Correct Table Names
```typescript
// CORRECT table names
.from('watchlists')      // Coach's saved players
.from('videos')          // Player videos
.from('organizations')   // Schools/programs

// WRONG - these don't exist
.from('recruit_watchlist')  // Use 'watchlists'
.from('player_videos')      // Use 'videos'
.from('colleges')           // Use 'organizations'
```

### Rule 3: Pipeline Stages (Only 5 Valid Values)
```typescript
type PipelineStage =
  | 'watchlist'        // Just watching
  | 'high_priority'    // Very interested
  | 'offer_extended'   // Sent offer
  | 'committed'        // Player committed
  | 'uninterested';    // Passed

// These DO NOT exist in database:
// 'contacted', 'campus_visit', 'priority'
```

### Rule 4: Supabase Client Imports
```typescript
// Server Components & Server Actions
import { createClient } from '@/lib/supabase/server';

// Client Components & Hooks
import { createClient } from '@/lib/supabase/client';
```

### Rule 5: Client Component Directive
```typescript
// WRONG - will crash
import { useState } from 'react';
export function Thing() { const [x, setX] = useState(false); }

// CORRECT - add 'use client'
'use client';
import { useState } from 'react';
export function Thing() { const [x, setX] = useState(false); }
```

---

## File Structure

```
src/
├── app/
│   ├── (dashboard)/dashboard/   # All authenticated pages
│   │   └── [feature]/page.tsx
│   └── actions/                 # Server actions ONLY
├── components/
│   ├── ui/                      # Button, Input, Modal, Card
│   ├── features/                # PlayerCard, CollegeCard (shared)
│   ├── coach/                   # Coach-only components
│   └── player/                  # Player-only components
├── hooks/                       # use-watchlist.ts, use-players.ts
├── lib/
│   ├── supabase/               # server.ts, client.ts
│   ├── types/                  # ALL TYPES HERE (index.ts, database.ts)
│   ├── queries/                # Server query functions
│   └── utils.ts                # Utility functions
└── stores/                     # Zustand (auth-store.ts only)
```

---

## Before Submitting Code

- [ ] Types from `@/lib/types` (not `@/types/`)
- [ ] Table names correct (`watchlists` not `recruit_watchlist`)
- [ ] Pipeline stages valid (only 5 options)
- [ ] Client components have `'use client'`
- [ ] Server actions check auth first
- [ ] Mutations call `revalidatePath()`
- [ ] No `any` types
- [ ] No `console.log` in production code

---

## Commands

```bash
npm run dev          # Start dev server
npm run typecheck    # Check TypeScript
npm run lint         # Check linting
npm run build        # Production build
npm run db:types     # Regenerate Supabase types
```

---

## Documentation

| File | Purpose |
|------|---------|
| `/CLAUDE_CODE_GUIDE.md` | Detailed code patterns |
| `/docs/HELM_MASTER_PROMPT.md` | Full analysis & fixes |
| `/docs/DEVELOPMENT_RULES.md` | Architecture reference |

---

**Read this. Follow these rules. Don't deviate.**

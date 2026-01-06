# CLAUDE.md - Helm Sports Labs

> **Read this entire file before writing ANY code.**

---

## 🎯 What This Is

**Helm Sports Labs** - Multi-sport SaaS platform
- **BaseballHelm**: College baseball recruiting (coaches ↔ players)
- **GolfHelm**: College golf team management + CoachHelm AI layer

**Stack**: Next.js 14 (App Router) • TypeScript strict • Supabase • Tailwind
**Design**: Linear/Vercel-inspired, glassmorphism, premium aesthetics

---

## 🚨 CRITICAL RULES

### 1. Type Imports (ALWAYS use this path)
```typescript
import type { Player, Coach, Organization } from '@/lib/types';
// NEVER: @/types/database, @/types/supabase (don't exist)
```

### 2. Supabase Client
```typescript
// Server Components, Server Actions, Route Handlers
import { createClient } from '@/lib/supabase/server';
const supabase = await createClient();

// Client Components (hooks, interactivity)
'use client';
import { createClient } from '@/lib/supabase/client';
const supabase = createClient();
```

### 3. Client Components
```typescript
// WRONG - crashes without directive
import { useState } from 'react';

// CORRECT
'use client';
import { useState } from 'react';
```

### 4. Table Names
```typescript
// CORRECT
.from('watchlists')      // Coach's saved players
.from('videos')          // Player videos  
.from('organizations')   // Schools/programs
.from('golf_players')    // Golf team players
.from('golf_rounds')     // Round data
.from('golf_events')     // Calendar events

// WRONG (don't exist)
.from('recruit_watchlist')
.from('player_videos')
.from('colleges')
```

### 5. Pipeline Stages (Baseball - only 5 valid)
```typescript
type PipelineStage = 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
// 'contacted', 'campus_visit', 'priority' DO NOT EXIST
```

---

## 📁 File Structure

```
src/
├── app/
│   ├── baseball/           # Baseball product routes
│   │   ├── dashboard/      # Coach/player dashboards
│   │   └── (auth)/         # Login, signup, etc.
│   ├── golf/               # Golf product routes
│   │   └── dashboard/      # Coach dashboard
│   ├── actions/            # Server actions ONLY
│   └── api/                # API routes
├── components/
│   ├── ui/                 # Primitives (Button, Input, Card, Modal, GlassCard)
│   ├── baseball/           # Baseball-specific components
│   ├── golf/               # Golf-specific components
│   ├── shared/             # Cross-product components
│   └── features/           # Feature components (PlayerCard, etc.)
├── lib/
│   ├── supabase/           # server.ts, client.ts
│   ├── types/              # ALL TYPES (index.ts exports everything)
│   ├── queries/            # Server-side query functions
│   ├── coachhelm/          # CoachHelm AI types & constants
│   └── utils.ts            # cn(), formatters
├── hooks/                  # Custom hooks
└── stores/                 # Zustand stores
```

---

## 🎨 Design System

### Colors
```typescript
// Primary brand
primary-600: '#16A34A'     // Kelly green - buttons, accents
primary-500: '#22c55e'     // Lighter green

// Backgrounds  
cream: '#FFFEFA'           // Page background
glass-white: 'rgba(255,255,255,0.7)'

// Text
warm-900: '#1c1917'        // Primary text
warm-500: '#78716c'        // Secondary text
```

### Glassmorphism Pattern
```typescript
// Standard glass card
className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass"

// Hover state
className="hover:bg-white/80 hover:shadow-card-hover transition-all duration-200"

// Dark glass (modals, overlays)
className="bg-warm-900/97 backdrop-blur-xl"
```

### Component Patterns
```typescript
// Button
<Button variant="primary" size="md">Save</Button>

// Card with glass effect
<div className="bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl p-6 shadow-glass">

// Stats display
<div className="text-3xl font-semibold text-warm-900">{value}</div>
<div className="text-sm text-warm-500">{label}</div>
```

### Typography
```typescript
// Headings
h1: 'text-3xl font-semibold text-warm-900'     // 30px
h2: 'text-2xl font-semibold text-warm-900'     // 24px
h3: 'text-xl font-medium text-warm-900'        // 20px

// Body
body: 'text-base text-warm-700'                // 16px
small: 'text-sm text-warm-500'                 // 14px
```

### Spacing & Radius
```typescript
// Card padding: p-6 or p-8
// Card radius: rounded-2xl (20px)
// Button radius: rounded-lg (14px)
// Input radius: rounded-md (10px)
// Gap between cards: gap-6
```

---

## 🏌️ Current Focus: CoachHelm AI

Location: `src/lib/coachhelm/`

### Philosophy Settings
```typescript
interface CoachPhilosophy {
  // Priorities (1-5 ranking)
  priorityBallStriking: number;
  priorityShortGame: number;
  priorityPutting: number;
  priorityCourseManagement: number;
  priorityMentalGame: number;
  
  // Alert sensitivity
  alertSensitivity: 'aggressive' | 'balanced' | 'conservative';
  
  // Threshold values
  declineThreshold: number;      // 1.0-4.0
  pressureGapThreshold: number;  // 1.0-4.0
  bubbleZoneRange: number;       // 0.5-3.0
}
```

### Key Golf Tables
```typescript
golf_players       // Team roster
golf_rounds        // Round scores & stats
golf_events        // Calendar (practices, tournaments)
golf_qualifying_events  // Qualifying rounds
golf_team_settings // Team configuration
```

---

## ✅ Pre-Submit Checklist

- [ ] Types from `@/lib/types` only
- [ ] Correct Supabase client (server vs client)
- [ ] `'use client'` on interactive components
- [ ] Server actions check auth first
- [ ] Mutations call `revalidatePath()`
- [ ] No `any` types
- [ ] No `console.log` (use proper error handling)
- [ ] Matches existing component patterns
- [ ] Uses design system colors/spacing

---

## 🛠 Commands

```bash
npm run dev          # Start dev server (localhost:3000)
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run build        # Production build
npm run db:types     # Regenerate Supabase types
```

---

## 📚 Key Patterns

### Server Action Pattern
```typescript
// src/app/actions/example.ts
'use server';

import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function updatePlayer(id: string, data: PlayerUpdate) {
  const supabase = await createClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  
  const { error } = await supabase
    .from('players')
    .update(data)
    .eq('id', id);
    
  if (error) throw error;
  
  revalidatePath('/baseball/dashboard/roster');
  return { success: true };
}
```

### Data Fetching in Server Component
```typescript
// app/golf/dashboard/roster/page.tsx
import { createClient } from '@/lib/supabase/server';

export default async function RosterPage() {
  const supabase = await createClient();
  
  const { data: players } = await supabase
    .from('golf_players')
    .select('*, user:users(*)')
    .order('last_name');
    
  return <RosterTable players={players ?? []} />;
}
```

### Client Component with Data
```typescript
'use client';

import { createClient } from '@/lib/supabase/client';
import { useState, useEffect } from 'react';

export function LiveStats({ playerId }: { playerId: string }) {
  const [stats, setStats] = useState(null);
  const supabase = createClient();
  
  useEffect(() => {
    const channel = supabase
      .channel('stats')
      .on('postgres_changes', { 
        event: '*', 
        schema: 'public', 
        table: 'golf_rounds',
        filter: `player_id=eq.${playerId}`
      }, (payload) => {
        setStats(payload.new);
      })
      .subscribe();
      
    return () => { supabase.removeChannel(channel); };
  }, [playerId]);
  
  return <div>{/* render stats */}</div>;
}
```

---

## 🎯 Quality Bar

This codebase targets **premium SaaS quality**:
- Animations: Subtle, purposeful (framer-motion)
- Loading states: Skeleton loaders, not spinners
- Empty states: Helpful, actionable
- Error handling: User-friendly messages
- Accessibility: Proper labels, keyboard nav
- Performance: Server components by default

**Think Linear, Stripe, Vercel** - not generic Bootstrap.

---

## 📖 Additional Docs

| File | Purpose |
|------|---------|
| `CLAUDE_CODE_GUIDE.md` | Extended patterns |
| `docs/DEVELOPMENT_RULES.md` | Architecture deep-dive |
| `FEATURE_1_COACH_PHILOSOPHY_SETTINGS.md` | CoachHelm spec |

# CLAUDE.md - Helm Sports Labs

> **Read this entire file before writing ANY code.**

---

## What This Is

**Helm Sports Labs** - Multi-sport SaaS platform
- **BaseballHelm**: College baseball recruiting (coaches ↔ players) + team management
- **GolfHelm**: College golf team management + CoachHelm AI layer

**Stack**: Next.js 16 (App Router) • TypeScript strict • Supabase • Tailwind
**Design**: Linear/Vercel-inspired, glassmorphism, premium aesthetics

---

## Codebase Overview

**Key Directories:**
- `src/app/` - Routes: baseball/, golf/, api/
- `src/components/` - React components: ui/, baseball/, golf/
- `src/lib/` - Infrastructure: supabase/, types/, queries/, coachhelm/
- `src/hooks/` - React hooks: use-auth, use-players, use-watchlist
- `supabase/migrations/` - Production migrations with RLS

**For detailed architecture, see [docs/CODEBASE_MAP.md](docs/CODEBASE_MAP.md).**

---

## CRITICAL RULES

### 1. Type Imports
```typescript
import type { Player, Coach, Organization } from '@/lib/types';
// NEVER: @/types/database, @/types/supabase (don't exist)
```

### 2. Supabase Client
```typescript
// Server: await createClient() from '@/lib/supabase/server'
// Client: createClient() from '@/lib/supabase/client' (with 'use client')
```

### 3. Table Names — ALWAYS Use Sport Prefix
```typescript
// Baseball: baseball_coaches, baseball_players, baseball_teams, baseball_team_members,
//   baseball_watchlists, baseball_videos, baseball_events, baseball_event_attendance,
//   baseball_player_engagement_events, baseball_conversations, baseball_messages,
//   baseball_announcements, baseball_tasks, baseball_documents, baseball_travel_itineraries
// Golf: golf_coaches, golf_players, golf_teams, golf_rounds, golf_events, golf_shots
// Shared: users, organizations, notifications
// WRONG: coaches, players, teams, watchlists, recruit_watchlist (no prefix = doesn't exist)
```

### 4. Pipeline Stages (Baseball - only 5 valid)
```typescript
type PipelineStage = 'watchlist' | 'high_priority' | 'offer_extended' | 'committed' | 'uninterested';
```

### 5. Client Components
```typescript
// Any file using useState/useEffect/onClick MUST start with 'use client';
```

---

## Baseball Product: User Types & Roles

### Coach Types
| Type | Recruiting? | Team Mgmt? | Notes |
|------|-------------|------------|-------|
| **College** | Full suite | No | Primary recruiter |
| **High School** | No | Yes | Develops players, facilitates recruiting |
| **JUCO** | Toggle mode | Toggle mode | Recruit + prepare for transfer |
| **Showcase** | No | Multi-team | Manages travel ball orgs |

### Player Types
| Type | Recruiting? | Teams | Notes |
|------|-------------|-------|-------|
| **High School** | Opt-in activate | HS + optional Showcase | Primary recruiting target |
| **Showcase** | Opt-in activate | Showcase + optional HS | Travel ball |
| **JUCO** | Opt-in activate | JUCO only | Transfer recruiting |
| **College** | Never | College only | Team features only |

### Recruiting Activation Model
Players must **opt-in** to recruiting. Before activation: anonymous interest ("A D1 coach viewed your profile"). After: identified ("Coach Davis from Texas A&M viewed your profile"). College players cannot activate.

### Mode Toggles
- **JUCO Coach**: Toggle between Recruiting Mode ↔ Team Mode (changes entire sidebar)
- **HS/Showcase/JUCO Players**: If recruiting activated, toggle Recruiting ↔ Team mode

---

## File Structure

```
src/
├── app/
│   ├── baseball/           # Baseball routes
│   │   ├── (auth)/         # Login, signup, complete-signup
│   │   ├── (onboarding)/   # Coach onboarding flow
│   │   ├── (dashboard)/    # Dashboard pages
│   │   └── actions/        # Server actions (auth, watchlist, calendar, etc.)
│   ├── golf/               # Golf routes
│   │   ├── (auth)/, (onboarding)/, (dashboard)/
│   │   └── actions/        # Server actions
│   └── api/                # API routes
├── components/
│   ├── ui/                 # Primitives (Button, Input, Card, Modal, GlassCard)
│   ├── baseball/           # Baseball-specific components
│   ├── golf/               # Golf-specific components
│   └── landing/            # Landing page components
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

## Design System

### Colors
```
Primary:    #16A34A (Kelly green) - buttons, accents, active states
Background: #FFFEFA (cream)
Glass:      rgba(255,255,255,0.7) backdrop-blur-xl
Text:       #1c1917 (warm-900 primary), #78716c (warm-500 secondary)
Status:     #16A34A success, #DC2626 error, #F59E0B warning
```

### Key Patterns
```typescript
// Glass card
"bg-white/70 backdrop-blur-xl border border-white/20 rounded-2xl shadow-glass"
// Hover
"hover:bg-white/80 hover:shadow-card-hover transition-all duration-200"
// Typography: h1=text-3xl, h2=text-2xl, h3=text-xl, body=text-base, small=text-sm
// Spacing: card p-6/p-8, radius rounded-2xl, gap-6 between cards
```

### Quality Bar
Premium SaaS quality — think Linear, Stripe, Vercel:
- Skeleton loaders (not spinners), helpful empty states, user-friendly errors
- Subtle framer-motion animations, proper accessibility, server components by default

---

## CoachHelm AI (Golf)

Location: `src/lib/coachhelm/`

```typescript
interface CoachPhilosophy {
  priorityBallStriking: number;    // 1-5 ranking
  priorityShortGame: number;
  priorityPutting: number;
  priorityCourseManagement: number;
  priorityMentalGame: number;
  alertSensitivity: 'aggressive' | 'balanced' | 'conservative';
  declineThreshold: number;        // 1.0-4.0
  pressureGapThreshold: number;    // 1.0-4.0
  bubbleZoneRange: number;         // 0.5-3.0
}
```

---

## Key Patterns

### Server Action
```typescript
'use server';
import { createClient } from '@/lib/supabase/server';
import { revalidatePath } from 'next/cache';

export async function doThing(id: string) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error('Unauthorized');
  // ... mutation ...
  revalidatePath('/baseball/dashboard');
  return { success: true };
}
```

### Server Component Data Fetching
```typescript
import { createClient } from '@/lib/supabase/server';
export default async function Page() {
  const supabase = await createClient();
  const { data } = await supabase.from('golf_players').select('*').order('last_name');
  return <Component data={data ?? []} />;
}
```

### Client Component
```typescript
'use client';
import { createClient } from '@/lib/supabase/client';
import { useState, useEffect } from 'react';
// ... hooks and interactivity ...
```

---

## Pre-Submit Checklist

- [ ] Types from `@/lib/types` only
- [ ] Correct Supabase client (server vs client)
- [ ] `'use client'` on interactive components
- [ ] Server actions check auth first
- [ ] Mutations call `revalidatePath()`
- [ ] No `any` types, no `console.log`
- [ ] Uses design system colors/spacing
- [ ] Matches existing component patterns

---

## Commands

```bash
npm run dev          # Dev server (localhost:3000)
npm run typecheck    # TypeScript check
npm run lint         # ESLint
npm run build        # Production build
```

---

## Additional Docs

| File | Purpose |
|------|---------|
| `docs/CODEBASE_MAP.md` | Full architecture map |
| `docs/DEVELOPMENT_RULES.md` | Architecture deep-dive |
| `FEATURE_1_COACH_PHILOSOPHY_SETTINGS.md` | CoachHelm spec |

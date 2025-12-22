# Platform Architecture - Helm Sports Labs

> **Dual-Platform Repository Structure**
> This repository contains two independent sports management platforms sharing common infrastructure.

---

## Overview

Helm Sports Labs is organized as a **dual-platform application**:

1. **Baseball Recruiting Platform** (`/baseball/*` routes)
2. **Golf Team Management Platform** (`/golf/*`, `/player-golf/*` routes)

Both platforms share:
- Authentication infrastructure (`/lib/supabase/*`)
- UI component library (`/components/ui/*`)
- Design system (Tailwind configuration)
- Database connection (Supabase)
- Core utilities (`/lib/utils.ts`)

---

## Platform Separation

### Baseball Platform

**Primary Focus:** Recruiting platform connecting players with college coaches

**Routes:**
- `/baseball/dashboard/*` - Main authenticated area
- `/baseball/login`, `/baseball/signup` - Authentication
- `/baseball/(onboarding)/*` - Player/coach onboarding

**User Types:**
- College Coaches (recruiting)
- High School Coaches (team management)
- JUCO Coaches (dual mode: recruiting + team)
- Showcase Coaches (multi-team management)
- Players (HS, Showcase, JUCO, College)

**Key Directories:**
```
src/
├── app/baseball/              # Baseball app routes
├── components/
│   ├── coach/                # Baseball coach components
│   ├── player/               # Baseball player components
│   └── shared/               # Shared baseball components
├── hooks/
│   ├── use-auth.ts           # Baseball auth
│   ├── use-watchlist.ts      # Baseball-specific hooks
│   └── ...
└── stores/
    └── auth-store.ts         # Baseball auth store
```

**Database Tables:**
- `users`, `coaches`, `players`, `organizations`, `teams`
- `watchlists`, `videos`, `camps`, `messages`
- `player_engagement_events`, `recruiting_interests`

---

### Golf Platform

**Primary Focus:** Team management for golf coaches and players

**Routes:**
- `/golf/dashboard/*` - Golf coach dashboard
- `/player-golf/*` - Golf player dashboard
- `/golf/login`, `/golf/signup` - Golf authentication

**User Types:**
- Golf Coaches (team management)
- Golf Players (round tracking, shot tracking)

**Key Directories:**
```
src/
├── app/
│   ├── golf/                 # Golf coach app
│   ├── player-golf/          # Golf player app
│   └── dev-golf/             # Golf dev utilities
├── components/golf/          # Golf-specific components
├── hooks/golf/               # Golf-specific hooks
├── stores/
│   └── golf-auth-store.ts    # Golf auth store
└── lib/
    ├── types/golf.ts         # Golf TypeScript types
    └── golf-dev-mode.ts      # Golf dev utilities
```

**Database Tables:**
- `golf_teams`, `golf_players`, `golf_coaches`
- `golf_rounds`, `golf_holes`, `golf_shots`
- `golf_events`, `golf_courses`

---

## Shared Infrastructure

### Common Components (`/components/ui/*`)

Reusable UI components used by **both platforms**:
- `Button`, `Card`, `Input`, `Modal`, `Badge`, etc.
- 40+ components following consistent design system

### Authentication (`/lib/supabase/*`)

- `client.ts` - Browser Supabase client
- `server.ts` - Server Supabase client
- Shared authentication flow
- Separate auth stores per platform:
  - Baseball: `auth-store.ts`
  - Golf: `golf-auth-store.ts`

### Design System

**Shared across both platforms:**
- Tailwind CSS configuration
- Color palette (Kelly Green + Cream)
- Typography (Inter font)
- Spacing system
- Component patterns

---

## Development Guidelines

### Working on Baseball Features

1. Use routes under `/app/baseball/*`
2. Create components in `/components/coach/`, `/components/player/`, or `/components/shared/`
3. Use `/hooks/use-*.ts` for baseball-specific hooks
4. Import types from `@/lib/types`
5. Use `auth-store.ts` for auth state

### Working on Golf Features

1. Use routes under `/app/golf/*` or `/app/player-golf/*`
2. Create components in `/components/golf/*`
3. Use `/hooks/golf/use-*.ts` for golf-specific hooks
4. Import types from `@/lib/types/golf`
5. Use `golf-auth-store.ts` for auth state

### Creating Shared Components

1. Place in `/components/ui/*`
2. Make platform-agnostic (no baseball/golf-specific logic)
3. Export from `@/components/ui`
4. Document in component file

---

## Routing Structure

### Baseball Routes
```
/baseball/
├── /login                    # Baseball login
├── /signup                   # Baseball signup
├── /(onboarding)/
│   ├── /coach                # Coach onboarding
│   └── /player               # Player onboarding
└── /dashboard/
    ├── /discover             # Player discovery
    ├── /watchlist            # Recruiting watchlist
    ├── /pipeline             # Recruiting pipeline
    ├── /roster               # Team roster
    └── ...
```

### Golf Routes
```
/golf/
├── /login                    # Golf login
├── /signup                   # Golf signup
├── /(onboarding)/
│   ├── /coach                # Coach onboarding
│   └── /player               # Player onboarding
└── /dashboard/
    ├── /roster               # Team roster
    ├── /rounds               # Round management
    ├── /stats                # Team statistics
    └── ...

/player-golf/
├── /                         # Player dashboard
├── /rounds                   # Player rounds
├── /rounds/[id]/play         # Shot tracking
└── /stats                    # Player stats
```

---

## Database Separation

### Separate Tables Per Platform

**Baseball tables** use standard naming:
- `users`, `coaches`, `players`, `teams`, etc.

**Golf tables** use `golf_` prefix:
- `golf_coaches`, `golf_players`, `golf_teams`, etc.

This allows both platforms to:
- Share the same Supabase project
- Have independent data models
- Avoid naming conflicts

---

## Deployment

### Single Deployment (Current)

Both platforms deployed together:
- Same Vercel project
- Shared environment variables
- Unified build process
- Routes separated by path (`/baseball/*`, `/golf/*`)

### Future: Subdomain Separation (Optional)

Could be split into:
- `baseball.helm.app` → `/baseball/*` routes
- `golf.helm.app` → `/golf/*` routes

Requires:
- Vercel rewrites configuration
- Separate domain setup
- No code changes needed

---

## Type Safety

### Baseball Types
```typescript
import type { Player, Coach, Team } from '@/lib/types';
```

### Golf Types
```typescript
import type { GolfPlayer, GolfCoach, GolfRound } from '@/lib/types/golf';
```

---

## Testing

### Baseball Platform
```bash
# Run baseball dev server
npm run dev
# Navigate to http://localhost:3000/baseball
```

### Golf Platform
```bash
# Run golf dev server
npm run dev
# Navigate to http://localhost:3000/golf
```

---

## Key Files

| File | Purpose |
|------|---------|
| `/CLAUDE.md` | Baseball platform guide |
| `/README.md` | Project overview (both platforms) |
| `/docs/FEATURE_CHECKLIST.md` | Baseball feature tracking |
| `/PLATFORM_ARCHITECTURE.md` | This file - dual-platform guide |

---

## Migration Path (If Needed)

To fully separate platforms in the future:

1. **Monorepo Structure:**
   ```
   /apps/
     /baseball/          # Standalone Next.js app
     /golf/              # Standalone Next.js app
   /packages/
     /ui/                # Shared component library
     /auth/              # Shared auth utilities
   ```

2. **Separate Repositories:**
   - Fork into `helm-baseball` and `helm-golf`
   - Duplicate shared infrastructure
   - Independent deployments

---

**Current Status:** ✅ Well-separated in single repo with shared infrastructure

**Recommendation:** Keep current structure. Clear separation achieved through:
- Route prefixes (`/baseball/*`, `/golf/*`)
- Directory structure (`/components/golf/`, `/hooks/golf/`)
- Type namespacing (`golf.ts` types)
- Separate auth stores

---

*Last Updated: December 2024*

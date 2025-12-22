# Golf Platform - Helm Sports Labs

> **Golf Team Management System**
> Part of the Helm Sports Labs dual-platform repository

---

## Overview

The Golf platform provides comprehensive team management tools for golf coaches and shot tracking capabilities for players.

**Platform Routes:**
- `/golf/*` - Coach dashboard and management
- `/player-golf/*` - Player dashboard and round tracking

---

## User Types

### Golf Coach
- Manage team roster
- Track player rounds and statistics
- Schedule events and qualifiers
- Team communication and announcements
- Player development tracking

### Golf Player
- Record rounds and track shots
- View personal statistics
- Access team calendar and announcements
- Communicate with coach and teammates

---

## Directory Structure

```
src/
├── app/
│   ├── golf/                      # Golf coach app
│   │   ├── (auth)/                # Login/signup
│   │   ├── (dashboard)/           # Coach dashboard
│   │   │   ├── roster/            # Team roster management
│   │   │   ├── rounds/            # Round management
│   │   │   ├── stats/             # Team statistics
│   │   │   ├── qualifiers/        # Qualifier events
│   │   │   ├── calendar/          # Team calendar
│   │   │   ├── messages/          # Team messaging
│   │   │   └── settings/          # Coach settings
│   │   ├── (onboarding)/          # Coach onboarding
│   │   └── actions/golf.ts        # Server actions
│   │
│   └── player-golf/               # Golf player app
│       ├── rounds/                # Round listing
│       ├── rounds/[id]/play/      # Shot tracking
│       ├── stats/                 # Player stats
│       └── actions/               # Server actions
│
├── components/golf/               # Golf-specific components
│   ├── layout/GolfSidebar.tsx     # Golf sidebar navigation
│   ├── shot-tracking/             # Shot tracking components
│   └── features/                  # Golf feature components
│
├── hooks/golf/                    # Golf-specific hooks
│   ├── use-golf-team.ts           # Team management hook
│   └── use-golf-rounds.ts         # Round tracking hook
│
├── stores/
│   └── golf-auth-store.ts         # Golf authentication state
│
└── lib/
    ├── types/golf.ts              # Golf TypeScript types
    └── golf-dev-mode.ts           # Golf development utilities
```

---

## Key Features

### Coach Features
- ✅ Team roster management
- ✅ Round tracking and approval
- ✅ Player statistics dashboard
- ✅ Event and qualifier scheduling
- ✅ Team calendar
- ✅ Messaging system
- ⚠️ Tournament management (in progress)
- ⚠️ Player development plans (in progress)

### Player Features
- ✅ Round creation and tracking
- ✅ Shot-by-shot tracking with GPS
- ✅ Personal statistics
- ✅ Round history
- ⚠️ Performance analytics (in progress)
- ⚠️ Goal setting (in progress)

---

## Database Schema

### Core Tables
- `golf_teams` - Team records
- `golf_coaches` - Coach profiles
- `golf_players` - Player profiles
- `golf_rounds` - Round records
- `golf_holes` - Individual hole data
- `golf_shots` - Shot tracking data
- `golf_courses` - Golf course information
- `golf_events` - Team events and qualifiers

---

## Development

### Running Golf Platform

```bash
# Start dev server
npm run dev

# Navigate to:
# Coach: http://localhost:3000/golf
# Player: http://localhost:3000/player-golf
```

### Working on Golf Features

1. **Components:** Place in `/components/golf/`
2. **Hooks:** Place in `/hooks/golf/`
3. **Types:** Add to `/lib/types/golf.ts`
4. **Routes:** Add under `/app/golf/` or `/app/player-golf/`
5. **Auth:** Use `golf-auth-store.ts`

### Type Imports

```typescript
// Golf types
import type { GolfPlayer, GolfRound, GolfShot } from '@/lib/types/golf';

// Shared UI components
import { Button, Card } from '@/components/ui';
```

---

## Known Issues

⚠️ **TypeScript Errors:** The golf platform currently has TypeScript errors in:
- `src/app/player-golf/actions/rounds-dev.ts`
- `src/app/player-golf/actions/rounds.ts`
- `src/components/golf/ShotTrackingFinal.tsx`
- `src/components/golf/shot-tracking/ShotTracking.tsx`

These need to be addressed in future updates.

---

## Separation from Baseball Platform

The Golf platform is **completely independent** from the Baseball platform:

- ✅ Separate authentication (`golf-auth-store.ts`)
- ✅ Separate database tables (`golf_*` prefix)
- ✅ Separate routes (`/golf/*`, `/player-golf/*`)
- ✅ Separate components (`/components/golf/*`)
- ✅ Separate types (`/lib/types/golf.ts`)

**Shared Infrastructure:**
- UI component library (`/components/ui/*`)
- Supabase connection (`/lib/supabase/*`)
- Design system (Tailwind config)
- Utilities (`/lib/utils.ts`)

---

## Future Enhancements

### Planned Features
- Tournament system with brackets
- Player handicap tracking
- Course difficulty ratings
- Weather integration
- Advanced analytics dashboard
- Parent/guardian access
- Mobile app (React Native)

See [FEATURE_CHECKLIST.md](../../../docs/FEATURE_CHECKLIST.md) for full roadmap.

---

## Documentation

- **Platform Architecture:** See `/PLATFORM_ARCHITECTURE.md`
- **Baseball Platform:** See `/src/app/baseball/`
- **Main README:** See `/README.md`

---

*Part of Helm Sports Labs - Dual Platform Repository*

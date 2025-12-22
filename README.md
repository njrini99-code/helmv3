# Helm Sports Labs

> Dual-platform sports management system for baseball recruiting and golf team management

## Project Overview

**Baseball Recruiting Platform** — Connect high school/showcase players with college coaches
**Golf Team Management Platform** — Track rounds, shots, and player development

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Backend:** Supabase (Auth, Database, Storage, Realtime)
- **Styling:** Tailwind CSS
- **State:** Zustand
- **Charts:** Recharts
- **Interactions:** @dnd-kit (drag-and-drop)

## Key Documentation

| Document | Location | Purpose |
|----------|----------|---------|
| **Platform Architecture** | [`PLATFORM_ARCHITECTURE.md`](PLATFORM_ARCHITECTURE.md) | 📐 Dual-platform structure guide (Baseball + Golf separation) |
| **Feature Checklist** | [`docs/FEATURE_CHECKLIST.md`](docs/FEATURE_CHECKLIST.md) | ⭐ Full list of completed, in-progress, and planned features with implementation specs |
| **PRD** | `docs/PRD.md` | Product requirements document |
| **Developer Reference** | [`.claude/REFERENCE.md`](.claude/REFERENCE.md) | Quick reference guide for development |

**⚠️ Always check `docs/FEATURE_CHECKLIST.md` first when implementing features.**
**📐 For platform-specific work, see `PLATFORM_ARCHITECTURE.md` for Baseball vs Golf separation.**

## Quick Start

```bash
# Install dependencies
npm install

# Set up environment variables
cp .env.example .env.local
# Add your Supabase credentials

# Run development server
npm run dev

# Type checking
npm run typecheck

# Build for production
npm run build
```

## Project Status

- ✅ **55/100+ features complete (55%)**
- ⚠️ **17 features in progress (17%)**
- 🚀 **35 features planned (35%)**
- 🔧 **5 technical debt items**

### Platform Progress
- **Baseball Platform:** 65% complete
- **Golf Platform:** 40% complete

### User Type Progress
- **College Coach:** 95% complete ✅
- **HS Coach:** 40% complete ⚠️
- **JUCO Coach:** 30% complete 🚨 (blocked by mode toggle)
- **Showcase Coach:** 35% complete ⚠️
- **Players:** 60-80% complete depending on type

## Architecture

### Folder Structure

```
src/
├── app/                    # Next.js app directory
│   ├── baseball/          # Baseball platform routes
│   ├── golf/              # Golf platform routes
│   ├── player-golf/       # Golf player routes
│   └── join/              # Team invite system
│
├── components/            # React components
│   ├── ui/               # 40+ reusable UI components
│   ├── layout/           # Navigation, headers
│   ├── coach/            # Coach-specific components
│   ├── player/           # Player-specific components
│   ├── golf/             # Golf-specific components
│   └── shared/           # Shared components
│
├── lib/
│   ├── supabase/         # Database clients
│   ├── queries/          # Centralized queries
│   ├── actions/          # Server actions
│   ├── types.ts          # TypeScript types
│   └── utils.ts          # Utilities
│
├── stores/               # Zustand state management
├── hooks/                # Custom React hooks
└── middleware.ts         # Auth middleware

docs/                     # Documentation
.claude/                  # Claude Code configuration
```

### User Roles

| Role | Type | Key Features |
|------|------|--------------|
| **Coach** | College | Discover, Watchlist, Pipeline, Compare, Camps |
| **Coach** | High School | Roster, Videos, Dev Plans, College Interest |
| **Coach** | JUCO | Both (mode toggle) — ⚠️ NOT IMPLEMENTED |
| **Coach** | Showcase | Multi-team, Events, Roster, Videos |
| **Player** | HS/Showcase | Dashboard, Profile, Journey, Analytics |
| **Player** | JUCO/College | Dashboard, Profile (limited recruiting) |

## Current Priorities (P0)

🚨 **5 Critical Items - Must Complete First**

1. **CORE-001:** Implement JUCO Mode Toggle (3-5 days)
2. **CORE-002:** Implement Multi-Team Support (5-7 days)
3. **CORE-003:** Complete HS Coach Dashboard (7-10 days)
4. **CORE-004:** Separate Golf Platform (3-5 days)
5. **CORE-005:** Remove Dead Code (1-2 days)

See [`docs/FEATURE_CHECKLIST.md`](docs/FEATURE_CHECKLIST.md) for full details.

## Design System

| Element | Value |
|---------|-------|
| **Primary Color** | Kelly Green `#16A34A` |
| **Background** | Cream White `#FAF6F1` |
| **Cards** | White with glass morphism |
| **Typography** | Inter (system-ui fallback) |
| **Effects** | `backdrop-blur-xl`, `shadow-md`, `rounded-2xl` |

## Database

Key tables:
- `users` — Supabase Auth users
- `coaches` — Coach profiles
- `players` — Player profiles
- `organizations` — Schools/programs
- `teams` — Teams within organizations
- `watchlists` — Coach recruiting watchlists
- `messages` — Messaging system
- `videos` — Player videos
- `camps` — Camp events

See full schema in Supabase dashboard.

## Development Workflow

1. **Check the feature checklist:** `docs/FEATURE_CHECKLIST.md`
2. **Find the feature ID:** e.g., `CORE-001`, `FEATURE-001`
3. **Read the spec:** Implementation details, what exists, what's missing
4. **Follow patterns:** Match existing code patterns
5. **Use existing components:** Check `src/components/ui/` first
6. **Test thoroughly:** Run dev server, typecheck, build
7. **Mark complete:** Update feature checklist when done

## Custom Commands

Use these slash commands in Claude Code:

- `/status` — Get comprehensive project status report
- `/complete FEATURE-ID` — Mark feature as complete and update stats

See [`.claude/commands/`](.claude/commands/) for all available commands.

## Contributing

1. Always check `docs/FEATURE_CHECKLIST.md` before starting work
2. Follow existing code patterns and component structures
3. Use TypeScript types from `src/lib/types.ts`
4. Test all changes with `npm run typecheck` and `npm run build`
5. Update feature checklist when completing features

## License

Proprietary - Helm Sports Labs

---

**For detailed implementation specs, see [`docs/FEATURE_CHECKLIST.md`](docs/FEATURE_CHECKLIST.md)**

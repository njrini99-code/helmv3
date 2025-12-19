# Helm Sports Labs

> The operating system for baseball player development and recruitment.

---

## What is this?

Helm Sports Labs is a comprehensive platform connecting baseball players with college coaches. Two sides of the same coin:

1. **Players** get discovered, developed, and recruited
2. **Coaches** discover talent, develop their teams, and manage recruiting

---

## Documentation

This repository contains complete documentation for building Helm Sports Labs:

| Document | Description |
|----------|-------------|
| **CLAUDE.md** | Master context file for Claude CLI - read this first |
| **UI_SYSTEM.md** | Design system specifications (colors, typography, components) |
| **SCHEMA.sql** | Complete database schema with RLS policies |
| **globals.css** | Ready-to-use Tailwind CSS with all component classes |
| **API_REFERENCE.md** | All API endpoints with request/response formats |
| **COMPONENTS.md** | Complete component inventory with props and states |
| **FLOWS.md** | User journey documentation |
| **IMPLEMENTATION_PHASES.md** | Phase-by-phase build guide with Claude CLI prompts |

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Framework | Next.js 14+ (App Router) |
| Language | TypeScript (strict) |
| Styling | Tailwind CSS |
| Database | Supabase (PostgreSQL) |
| Auth | Supabase Auth with RLS |
| Real-time | Supabase Realtime |
| Storage | Supabase Storage |
| Video | Mux |
| Email | Resend |
| Payments | Stripe |

---

## User Types

### Coaches

| Type | Mode | Purpose |
|------|------|---------|
| **College** | Recruiting only | Recruit HS/Showcase/JUCO players |
| **JUCO** | Recruiting + Team | Recruit HS players, develop roster for transfer |
| **High School** | Team only | Develop players, track college interest |
| **Showcase** | Team only | Multi-team organization management |

### Players

| Type | Mode | Teams |
|------|------|-------|
| **HS/Showcase** | Recruiting + Team | Can be on HS team + Showcase team(s) |
| **JUCO** | Recruiting + Team | JUCO team only |
| **College** | Team only | College team only |

---

## Key Features

### For Recruiting Coaches
- **Discover** - Search players with map, filters, saved searches
- **Watchlist & Pipeline** - Track prospects through recruiting stages
- **Player Comparison** - Side-by-side stats and video comparison
- **Camps** - Create and manage recruiting camps
- **Messaging** - Direct communication with prospects

### For Team Coaches
- **Roster Management** - Manage team with invite links
- **Video Library** - Organized video per player
- **Development Plans** - Create training plans with goals and phases
- **College Interest** - See which programs are viewing your players
- **Team Calendar** - Practices, games, events

### For Players
- **Profile** - Showcase stats, metrics, and video
- **Video Clips** - Upload and clip highlight videos
- **Recruiting Activation** - Get discovered by college coaches
- **Journey Tracking** - Track offers, visits, decisions
- **Analytics** - See who's viewing your profile

---

## Design System

**Colors:** Kelly Green (#16A34A) + Cream (#FAF6F1) + Neutrals

**Philosophy:** Clean, professional, modern. Like Linear or Mercury - not a sports template.

See `UI_SYSTEM.md` for complete specifications.

---

## Getting Started

### 1. Clone and Install

```bash
git clone <repo>
cd helm-sports-labs
npm install
```

### 2. Set Up Supabase

```bash
# Create a new Supabase project
# Copy .env.example to .env.local
# Add your Supabase URL and keys
```

### 3. Run Migrations

```bash
supabase db push
supabase gen types typescript --local > types/database.ts
```

### 4. Start Development

```bash
npm run dev
```

---

## Build Order

Follow `IMPLEMENTATION_PHASES.md` for the recommended build sequence:

1. **Phase 0 (Days 1-3):** Foundation - setup, schema, auth, design system
2. **Phase 1 (Days 4-7):** Video Infrastructure - upload, player, clipping
3. **Phase 2 (Days 8-14):** College Coach - discover, pipeline, compare, camps
4. **Phase 3 (Days 15-20):** HS Coach - roster, invites, dev plans
5. **Phase 4 (Days 21-25):** Player Core - profile, videos, team hub
6. **Phase 5 (Days 26-28):** Player Recruiting - activation, discover, analytics
7. **Phase 6 (Days 29-31):** JUCO Coach - mode toggle, academics
8. **Phase 7 (Days 32-33):** Showcase Coach - multi-team
9. **Phase 8 (Days 34-35):** JUCO + College Players
10. **Phase 9 (Days 36-40):** Polish - mobile, performance, testing

---

## Claude CLI Usage

This project is optimized for building with Claude CLI. Start each session with:

```bash
claude
> Read CLAUDE.md and let me know when you're ready to continue building.
```

For specific features:

```bash
> Read CLAUDE.md and COMPONENTS.md, then build the PlayerCard component.
```

---

## Directory Structure

```
app/
├── (auth)/              # Auth pages
├── (dashboard)/         # Protected dashboard
│   ├── coach/
│   │   ├── college/     # College coach routes
│   │   ├── high-school/ # HS coach routes
│   │   ├── juco/        # JUCO coach routes
│   │   └── showcase/    # Showcase coach routes
│   └── player/          # Player routes
├── api/                 # API routes
└── join/[code]/         # Team invite page

components/
├── ui/                  # Primitives (button, input, etc.)
├── layout/              # Sidebar, header, etc.
├── dashboard/           # Dashboard components
├── player/              # Player-specific components
├── video/               # Video components
├── forms/               # Form components
└── shared/              # Shared components

lib/
├── supabase/            # Supabase clients
├── actions/             # Server actions
├── queries/             # Data fetching
├── hooks/               # React hooks
├── utils/               # Utilities
└── validators/          # Zod schemas
```

---

## Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

# Mux (Video)
MUX_TOKEN_ID=
MUX_TOKEN_SECRET=
MUX_WEBHOOK_SECRET=

# Stripe
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=

# Resend (Email)
RESEND_API_KEY=

# Google Places (Location)
NEXT_PUBLIC_GOOGLE_PLACES_API_KEY=
```

---

## License

Private - Helm Sports Labs

---

## Questions?

Refer to the documentation files. Everything you need to build this is in:
- `CLAUDE.md` - Architecture and patterns
- `UI_SYSTEM.md` - Design specifications
- `API_REFERENCE.md` - API endpoints
- `COMPONENTS.md` - Component specs
- `IMPLEMENTATION_PHASES.md` - Build order

# DEVELOPMENT_RULES.md - Helm Sports Labs

> **MANDATORY READING:** Read before making ANY changes.

---

## PROJECT ARCHITECTURE

### Tech Stack
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript (strict mode)
- **Database:** Supabase (PostgreSQL + Auth + Storage)
- **Styling:** Tailwind CSS
- **State:** Zustand (auth only), URL params (filters), React state (local)

### Directory Structure
```
src/
├── app/                    # Next.js App Router pages
│   ├── (auth)/            # Login, signup
│   ├── (dashboard)/       # All authenticated pages
│   ├── (public)/          # Public profiles
│   └── actions/           # Server actions ONLY
├── components/
│   ├── coach/             # Coach-specific components
│   ├── player/            # Player-specific components
│   ├── features/          # Shared components
│   └── ui/                # Base UI primitives
├── hooks/                 # Client-side React hooks
├── lib/
│   ├── supabase/          # Supabase client configs
│   ├── queries/           # Server-side query functions
│   ├── types/             # TypeScript types (SINGLE SOURCE OF TRUTH)
│   └── utils.ts           # Utility functions
└── stores/                # Zustand stores
```

---

## FILE SIZE LIMITS

| File Type | Max Lines | If exceeded... |
|-----------|-----------|----------------|
| Page component | 300 | Extract into sub-components |
| Component | 200 | Split or extract hooks |
| Hook | 150 | Split into smaller hooks |
| Server action file | 200 | Split by feature |

---

## DATABASE TABLES

| Table | Purpose |
|-------|---------|
| `users` | Auth users |
| `players` | Player profiles |
| `coaches` | Coach profiles |
| `organizations` | Schools/programs |
| `watchlists` | Coach's saved players |
| `recruiting_interests` | Player's target schools |
| `videos` | Player videos |
| `conversations` | Message threads |
| `messages` | Chat messages |

---

## BEFORE EVERY COMMIT

- [ ] Types from `@/lib/types`
- [ ] Table names correct
- [ ] Pipeline stages valid (5 only)
- [ ] Client components have `'use client'`
- [ ] Server actions check auth
- [ ] Mutations call `revalidatePath()`
- [ ] No `any` types
- [ ] No `console.log`

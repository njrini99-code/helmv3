---
paths:
  - "src/**/*"
---

## File Structure (Key Paths)

```
src/app/golf/
├── actions/              # Server action files (see memory/projects/golfhelm.md)
├── (dashboard)/dashboard/  # All dashboard routes
├── (auth)/               # Login, signup, forgot/reset password
├── (onboarding)/         # Coach (3-step) + Player (4-step)
├── join/[code]/          # Team join flow
└── admin/                # Admin panel

src/components/golf/      # 256+ components
├── coachhelm/            # 80+ CoachHelm AI components
├── calendar/             # 30+ Calendar components
├── player-hub/           # Player Hub home
└── ...                   # roster/, rounds/, messages/, tasks/, stats/, etc.

src/lib/
├── supabase/             # server.ts, client.ts
├── types/                # ALL types (index.ts re-exports)
│   ├── golf.ts           # Entity types
│   └── golf-course.ts    # Course types
├── coachhelm/            # AI engine (see memory/context/coachhelm-ai.md)
│   └── v2/               # V2: orchestrator, mining, prediction, learning, NLG
└── utils.ts              # cn(), formatters

src/hooks/golf/           # Realtime, data, offline hooks (see memory/projects/golfhelm.md)
src/stores/               # Zustand (auth-store.ts — shared across golf + baseball, not golf-specific)
```

---

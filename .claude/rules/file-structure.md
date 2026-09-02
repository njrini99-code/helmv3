---
paths:
  - "src/**/*"
verified: 2026-08-20-mechanical  # paths + table names machine-checked this date (docs:path-drift / docs:schema-drift); PROSE not re-read against code
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

src/components/fairway/   # THE SHIPPED GOLF DASHBOARD UI — pages/ organized
│                         # by surface (rounds-tracking, rounds-new, team-hub,
│                         # settings, qualifiers, …) plus the shared kit
│                         # (surfaces/, controls/, overlays/, charts/, …).
│                         # New golf dashboard UI goes here.

src/components/golf/      # Older component tree: coachhelm/ (CoachHelm AI),
├── coachhelm/            # calendar/, player-hub/, and a mix of live and
├── calendar/             # retired surfaces. Check whether a fairway/
├── player-hub/           # equivalent exists before adding here.
└── ...

src/lib/
├── supabase/             # server.ts, client.ts
├── types/                # ALL types (index.ts re-exports)
│   ├── golf.ts           # Entity types
│   └── golf-course.ts    # Course types
├── coachhelm/            # AI engine (see memory/context/coachhelm-ai.md)
│   ├── v2/               # V2: orchestrator, mining, prediction, learning, NLG
│   └── v3/               # V3 engine generation — both are live; check the
│                         # CoachHelm feature doc for which layer new work uses
└── utils.ts              # cn(), formatters

src/hooks/golf/           # Realtime, data, offline hooks (see memory/projects/golfhelm.md)
src/stores/               # Zustand (auth-store.ts — shared across golf + baseball, not golf-specific)
```

---

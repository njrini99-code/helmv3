# Reuse / Refactor / Replace Matrix

| Area | Current file/path | Current purpose | Decision | Reason | Future recommendation | Priority |
|---|---|---:|---|---|---|---|
| Next.js app shell | `src/app/` | App Router product | Reuse | Modern framework already in place | Keep route groups, improve loading/error states | High |
| Supabase client/types | `src/lib/supabase`, `src/lib/types/database.ts` | DB/auth layer | Reuse/refactor | Strong base but schema needs expansion | Add migrations, RLS, typed data services | High |
| Sidebar navigation | `src/components/layout/sidebar.tsx` | Role nav | Refactor | Hardcoded and strategy-coupled | Module registry + account-specific nav | High |
| Baseball dashboard query | `src/lib/queries/baseball-dashboard.ts` | Watchlist dashboard | Replace for core | Recruiting-first model | New command center read models | High |
| Roster page | `src/app/baseball/(dashboard)/dashboard/roster/page.tsx` | Team roster | Refactor | Strong identity entry point | Make roster central identity layer | High |
| Calendar page | `.../calendar/page.tsx` | Events | Refactor | Needed for ops | Add event types, conflicts, player visibility | High |
| Messages/announcements/tasks | dashboard routes | Communication/task primitives | Reuse/refactor | Good ops foundation | Add acknowledgements, targeting, due dates | Medium |
| Travel page | `.../travel/page.tsx` | Travel surface | Refactor | Useful but likely shallow | Itinerary, rooming, uniforms, academic conflicts | Medium |
| Academics page | `.../academics/page.tsx` | JUCO academics | Replace/refactor | Missing schema fields | Lightweight privacy-aware academic module | Medium |
| Stats page | `.../stats/page.tsx` | Stats | Refactor/expand | Core baseball need | Official stats + coach grades + imported metrics | High |
| Videos page | `.../videos/page.tsx` | Video storage/review | Merge | Video should attach to player timeline | Generic attachment/link + development sessions | Medium |
| Dev plans | `dev-plan`, `dev-plans` | Development plans | Refactor | Useful concept | Player timeline, hitting/pitching modules | High |
| Recruiting pages | discover/watchlist/pipeline/compare | Recruiting CRM | Defer | Wrong wedge for Phase 1 | Move to Phase 4 optional module | Low |
| Golf shared UI | `src/app/golf`, shared components | Parallel product | Reuse selectively | Some team ops concepts apply | Avoid baseball changes breaking GolfHelm | Medium |
| Import code | unknown/limited | Uploads | Build new | Missing generic mapper | Import Center with preview/rollback | High |
| CoachHelm scripts | package scripts | AI regeneration | Refactor | Potential seed | Real AI module registry + source citations | Medium |

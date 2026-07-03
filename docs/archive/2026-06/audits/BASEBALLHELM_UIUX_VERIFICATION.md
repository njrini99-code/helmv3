# BaseballHelm UI/UX + Product Verification Scorecard

**Date:** 2026-06-24
**Overall Score: 60 / 100**
**Verdict:** Product has strong architecture and real feature depth but is NOT shippable — 21 of 49 migrations unapplied, player signup broken, announcements and dev plans non-functional, and 28 routes invisible from navigation.

---

## Dimension Scores

| Dimension | Score | Summary |
|---|---|---|
| UX Architecture | 52 | Shell and nav-registry are well-designed; 28 routes have no nav entry and are effectively invisible |
| Premium / Anti-Slop | 68 | Strong design-system bones; raw CSS spinners, off-palette colors, and emoji in production UI undercut it |
| Motion / Interaction | 68 | Solid motion foundation; two high-traffic tab surfaces use bare hidden/block with no transition |
| Screen Acceptance | 72 | All 12 evaluated screens are real implementations; stats locked out for HS/showcase; privacy not server-enforced |
| Role / Permission | 52 | Server-side spine is correct; useTeamRouteProtection never called; college players can reach recruiting surfaces |
| Security / RLS | 72 | withBaseballAction and Wave-1 RLS are well-designed; coach video uploads always 403; anon grants too wide |
| Data Honesty | 77 | Best-in-class posture; demo_mode_enabled does nothing; trend_magnitude card permanently invisible |
| Wiring Completeness | 72 | 54+ action files correctly wired; Academics page hardcodes zeros; Events page bypasses server actions entirely |
| Coach–Player Parity | 38 | Showstopper: announcements writes golf-schema columns (always 500), dev plan status mismatch = always empty |
| Definition of Done | 28 | 21/49 migrations unapplied, player signup trigger missing, 71 tables absent from database.ts |

---

## Confirmed Must-Fix Findings

### UX Architecture

**28 routes orphaned from nav registry**
- File: `src/lib/baseball/nav-registry.ts`
- Missing: analytics, announcements, pipeline, discover, documents, travel, dev-plan, dev-plans, journey, lift, college-interest, colleges, compare, comparisons, scout-packets, watchlist, videos, academics, camps, events, organization, program, readiness, teams (list), players (list), activate, team, stats
- Fix: Audit each orphaned route; add to registry with correct `role`/`requiredCapability`/`section`, or ensure at least one reachable nav entry deep-links to it (e.g. Announcements from Roster, Dev Plan from Today CTA)

**Three near-identical shell layouts**
- Files: `src/app/baseball/(dashboard)/layout.tsx`, `(coach-dashboard)/coach/layout.tsx`, `(player-dashboard)/player/layout.tsx`
- Fix: Consolidate into single layout at `(dashboard)/layout.tsx` reading role from `useBaseballAuth()` dynamically; delete the other two shell layouts

---

### Premium / Anti-Slop

**Raw CSS spinners in 9+ loading states**
- Files: `src/components/baseball/travel/TravelClient.tsx`, `stats/StatsUploadClient.tsx`, `stats/UploadHistory.tsx`, `documents/DocumentPreview.tsx`, `command-center/BaseballInviteButton.tsx`
- Fix: Replace `animate-spin` div patterns with the `<Skeleton>` component or a primary-600 progress bar; the Skeleton component is already used correctly in every dashboard card

**Off-palette indigo/sky chip colors**
- File: `src/components/baseball/player-profile/PlayerNotesSection.tsx` lines 73, 87
- Fix: Replace `bg-indigo-100 text-indigo-700` with `bg-warm-200 text-warm-700`; replace `bg-sky-100 text-sky-700` with `bg-primary-50 text-primary-700`

---

### Motion / Interaction

**Tab switching: bare hidden/block in two high-traffic surfaces**
- Files: `src/components/baseball/command-center/CommandCenterClient.tsx` lines 682, 728, 826; `player-profile/PlayerProfileClient.tsx` lines 632, 949, 1101, 1203
- Fix: Wrap each tab panel in `<AnimatePresence mode="wait">` with `<motion.div key={activeTab} initial={{ opacity:0, y:6 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }} transition={{ duration:0.18 }}>` and a `useReducedMotion` guard

---

### Screen Acceptance

**Stats family locked out for HS/showcase coaches**
- File: `src/app/baseball/(dashboard)/dashboard/stats/season/page.tsx` line 20
- Fix: Role-aware redirect in `stats/page.tsx`; serve a basic player-aggregate view to HS/showcase rather than a hard redirect to dashboard

**Public player profile: privacy not server-enforced**
- File: `src/app/baseball/(public)/player/[id]/PlayerProfileClient.tsx`
- Fix: Strip suppressed fields (contact_email, phone, videos) in the server component before serializing props; client-only gates leak raw data via `__NEXT_DATA__`

---

### Role / Permission

**`useTeamRouteProtection` defined but never called**
- File: `src/hooks/use-route-protection.ts`
- Fix: Call it at the top of `CollegeInterestClient` and every other HS/Showcase-only page; or enforce at layout level server-side

**`college-interest` page missing coach_type gate**
- File: `src/app/baseball/(dashboard)/dashboard/college-interest/CollegeInterestClient.tsx` line 236
- Fix: Add `useTeamRouteProtection()` (allowedCoachTypes: ['high_school','showcase','juco']) after the authLoading check

**`colleges` and `journey` pages have no auth or player_type guard**
- Files: `src/app/baseball/(dashboard)/dashboard/colleges/page.tsx`, `dashboard/journey/...`
- Fix: Add `useAuth()` + `player?.player_type !== 'college'` gate in both pages; add DB CHECK constraint `CHECK (player_type != 'college' OR NOT recruiting_activated)`

**`baseball_players_update_own` RLS has no column restriction**
- File: `supabase/migrations/20260527000000_prod_public_baseline.sql` line ~18182
- Fix: Add DB-level CHECK constraint: `CONSTRAINT no_college_recruiting CHECK (player_type != 'college' OR recruiting_activated IS NOT TRUE)`

---

### Security / RLS

**Coach video uploads always 403 — orphaned storage objects accumulate**
- File: `src/components/baseball/team/BatchVideoUpload.tsx` line 149
- Fix: Add `baseball_videos_insert_coach` RLS policy gated on `has_baseball_staff_capability(team_id, 'can_manage_video')`; move upload+insert to a `withBaseballAction` server action; files upload to storage before the DB insert fails, leaving orphans

---

### Wiring Completeness

**Academics page hardcodes zeros — real table and action layer exist and are unused**
- File: `src/app/baseball/(dashboard)/dashboard/academics/page.tsx` lines 106–130
- Fix: Replace the inline `baseball_players` query with `getStudentAthletesWithAcademics` from `actions/academics.ts`; replace `supabase.update` with `updateAcademicEligibility`

**Events page bypasses `calendar.ts` server actions — errors silently swallowed**
- File: `src/app/baseball/(dashboard)/dashboard/events/page.tsx` lines 137–193
- Fix: Import `createBaseballEvent`/`deleteBaseballEvent` from `actions/calendar.ts`; call via `startTransition`; add toast on error

---

### Coach–Player Parity

**Announcements action writes golf-schema columns to baseball table (SHOWSTOPPER)**
- File: `src/app/baseball/actions/announcements.ts` lines 97–105
- Issue: Inserts `body`/`requires_acknowledgement`/`created_by`; real table has `content NOT NULL`/`created_by_id NOT NULL`/no `requires_acknowledgement`; every create violates NOT NULL; every read of `ann.body` returns null
- Fix: Rename `body` → `content`, `created_by` → `created_by_id` throughout the action file; update `AnnouncementsCoachView` and `AnnouncementsPlayerView` to consume `content`

**Player dev plan always empty — status literal mismatch (SHOWSTOPPER)**
- File: `src/app/baseball/actions/dev-plans.ts` line 85
- Issue: `getActiveDevPlan` queries `.eq('status', 'active')`; coach always creates with `status: 'sent'`; player sees permanent empty state even when plan exists in team dashboard widget
- Fix: Change line 85 to `.in('status', ['sent', 'in_progress'])` to match every other read path

**Stats/season page creates infinite redirect loop for players**
- File: `src/app/baseball/(dashboard)/dashboard/stats/season/page.tsx` lines 14–20
- Fix: In `stats/page.tsx`, detect role server-side and redirect players to `/baseball/dashboard/my-stats` before the season page is reached

---

### Definition of Done

**21 of 49 migrations not applied to any database**
- File: `supabase/migrations/` — confirmed in 20260624000050, 000060, 000063, 000070, 000080, 000090, 000092–000095, 000200, 000210, 000221, 000230, 000310, 000450, 000470, 001000, 001300, 001500, 001800
- Fix: Apply all 21 in dependency order via `supabase db push`; regenerate `src/lib/types/database.ts` via `supabase gen types typescript`

**Player signup golden-path broken — `baseball_players` row never seeded**
- File: `supabase/migrations/20260624001500_baseball_signup_creates_profile_row.sql` (NOT applied)
- Issue: `handle_new_user()` trigger does not seed `baseball_players`; player onboarding UPDATE matches 0 rows; `onboarding_completed` never true; infinite redirect loop
- Fix: Apply migration 20260624001500 immediately — this is the single highest-priority migration

**71 tables missing from `database.ts` — 66+ action files have zero type safety**
- Files: `src/app/baseball/actions/lifting-v11.ts` (`type Db = any` at line 1, 2308 lines); `actions/practice.ts` (15 `fromUntyped` calls); `src/lib/supabase/untyped.ts`
- Fix: After applying migrations, regenerate `database.ts` and remove `type Db = any` / `fromUntyped` casts

---

## Top 10 Priorities to Reach Shippable

Priority order — none of these are cosmetic:

1. **Apply migration 20260624001500** (`baseball_signup_creates_profile_row`) — player signup is completely broken without this; no new player can complete onboarding
2. **Apply all 20 remaining unapplied migrations** in dependency order and regenerate `database.ts` — practices, lifting, signals, postgame review, and 67 other tables do not exist on the production DB
3. **Fix announcements schema mismatch** (`body` → `content`, `created_by` → `created_by_id`) — every announcement create/read is broken for both coaches and players
4. **Fix dev plan status mismatch** (`getActiveDevPlan`: `.eq('status','active')` → `.in('status',['sent','in_progress'])`) — player dev plan page permanently empty despite working coach creation
5. **Add coach INSERT RLS policy for `baseball_videos`** and move `BatchVideoUpload` to a server action — coach video uploads silently fail; storage objects accumulate as orphans
6. **Add DB CHECK constraint on `recruiting_activated`** for college players and add `coach_type` gate on `college-interest` page — college players can bypass recruiting controls at the DB level
7. **Register the 28 orphaned routes** in `BASEBALL_NAV_REGISTRY` or surface explicit deep-links — pipeline, discover, announcements, dev plan, journey, lift, travel, documents, academics, and 19 more are unreachable from navigation
8. **Move privacy filtering server-side** for the public player profile — current client-only gates leak all suppressed fields via `__NEXT_DATA__` JSON
9. **Fix stats routing for HS/showcase coaches** — role-aware redirect in `stats/page.tsx`; these two coach types currently hit a silent redirect wall and cannot reach any stats surface
10. **Fix Academics page** to call `getStudentAthletesWithAcademics` and `updateAcademicEligibility` — page hardcodes zeros for every player despite the real table and action layer existing

---

*Audit methodology: static analysis of 699 source files + 49 migration files; adversarial verification on all high-severity findings.*

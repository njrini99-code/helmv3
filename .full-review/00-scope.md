# Review Scope

## Target

Comprehensive review of ALL working tree changes (modified + untracked files) across the Helm Sports Labs GolfHelm platform. This covers ~39 files with ~2,170 insertions and ~1,429 deletions spanning multiple feature areas.

## Change Summary

The working tree includes changes across these major areas:
1. **Shot Tracking Refactor** - Major refactor of `ShotTrackingComprehensive.tsx` (1479 lines changed), extraction of custom hooks
2. **Round Entry/Continue Flow** - Updates to new-round and continue-round clients
3. **Server Actions (golf.ts)** - 513 lines changed in the main golf actions file
4. **Round Drafts** - Changes to auto-save/draft system
5. **CRM Admin** - Email sending, coach detail panel, CRM dashboard updates
6. **Database Migrations** - 3 new SQL migrations (CRM email tracking, atomic partial round save, draft data column)
7. **Type System** - Updates to database.ts, database.types.ts, golf.ts types
8. **New Hooks** - 4 new extracted hooks (use-edit-shot-modal, use-penalty-handler, use-shot-state-machine, use-undo-manager)
9. **New Utilities** - shot-helpers.ts with tests
10. **Webhook Route** - New Resend webhook handler
11. **Calendar** - PremiumCalendarClient updates

## Files to Review

### Modified Files (23)
- `.env.example` - Environment variable changes
- `package.json` / `package-lock.json` - Dependency changes
- `src/app/api/admin/crm/send-email/route.ts` - CRM email API
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/continue-round-client.tsx` - Continue round flow
- `src/app/golf/(dashboard)/dashboard/rounds/continue/[id]/page.tsx` - Continue round page
- `src/app/golf/(dashboard)/dashboard/rounds/new/new-round-client.tsx` - New round flow
- `src/app/golf/actions/golf.ts` - Main golf server actions (513 lines changed)
- `src/app/golf/actions/round-drafts.ts` - Draft save/load actions
- `src/app/golf/admin/crm/components/CRMDashboard.tsx` - CRM admin dashboard
- `src/app/golf/admin/crm/components/CoachDetailPanel.tsx` - Coach detail panel
- `src/components/golf/MobileScoreEntry.tsx` - Mobile score entry
- `src/components/golf/RoundEntryModeToggle.tsx` - Round entry mode toggle
- `src/components/golf/ShotTrackingComprehensive.tsx` - Main shot tracking (1479 lines changed)
- `src/components/golf/ShotTrackingWithOffline.tsx` - Offline shot tracking wrapper
- `src/components/golf/calendar/PremiumCalendarClient.tsx` - Calendar client
- `src/hooks/golf/use-auto-save-round.ts` - Auto-save hook
- `src/hooks/golf/use-offline-sync.ts` - Offline sync hook
- `src/lib/types/database.ts` - Database types
- `src/lib/types/database.types.ts` - Supabase generated types (643 lines changed)
- `src/lib/types/golf.ts` - Golf entity types

### New Files (16)
- `src/app/api/webhooks/resend/route.ts` - Resend webhook handler
- `src/app/golf/actions/__tests__/golf-schemas.test.ts` - Golf action schema tests
- `src/hooks/golf/use-edit-shot-modal.ts` - Edit shot modal hook
- `src/hooks/golf/use-penalty-handler.ts` - Penalty handling hook
- `src/hooks/golf/use-shot-state-machine.ts` - Shot state machine hook
- `src/hooks/golf/use-undo-manager.ts` - Undo manager hook
- `src/lib/utils/__tests__/shot-helpers.test.ts` - Shot helpers tests
- `src/lib/utils/shot-helpers.ts` - Shot helper utilities
- `supabase/migrations/20260304000000_create_crm_email_tracking.sql` - CRM email tracking migration
- `supabase/migrations/20260304000001_atomic_partial_round_save.sql` - Atomic partial round save migration
- `supabase/migrations/20260304000002_add_draft_data_column.sql` - Draft data column migration

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js 16 (App Router) + Supabase + TypeScript

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report

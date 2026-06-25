# V6 Agent Efficiency Map

This file exists to help Claude Ultracode avoid wasting the first hour rediscovering the same structure. It should verify these findings live, then execute with this map in hand.

## First 20 Commands

Run these inspections before editing:

1. `find src/app/baseball -maxdepth 4 -type f | sort`
2. `find src/components/baseball -maxdepth 4 -type f | sort`
3. `find src/app/baseball/actions -maxdepth 1 -type f | sort`
4. `sed -n '1,260p' src/app/baseball/actions/stats.ts`
5. `sed -n '1,320p' src/app/baseball/actions/games.ts`
6. `sed -n '1,260p' src/lib/baseball/csv-utils.ts`
7. `sed -n '1,320p' src/app/baseball/actions/academics.ts`
8. `sed -n '1,280p' src/components/baseball/stats/StatsUploadClient.tsx`
9. `sed -n '1,280p' src/components/baseball/box-score/BoxScoreUpload.tsx`
10. `rg -n "baseball_player_stats|baseball_stat_uploads|baseball_box_score|baseball_player_classes|baseball_videos" src/lib/types/database.ts`
11. `sed -n '1850,2468p' src/lib/types/database.ts`
12. `sed -n '2468,3338p' src/lib/types/database.ts`
13. `find supabase/migrations -maxdepth 2 -type f | sort`
14. `find supabase/migrations_archive/pre_20260527 -maxdepth 1 -type f | rg "baseball|coachhelm|round_review|insight"`
15. `sed -n '1,260p' supabase/migrations_archive/pre_20260527/20260222200000_baseball_box_score_system.sql`
16. `sed -n '1,260p' supabase/migrations_archive/pre_20260527/20260208000000_baseball_team_management.sql`
17. `find src/lib/coachhelm -maxdepth 3 -type f | sort`
18. `sed -n '1,260p' src/lib/coachhelm/v2/orchestrator.ts`
19. `sed -n '1,220p' src/lib/coachhelm/v3/insight-visibility.ts`
20. `sed -n '1,260p' supabase/migrations/20260621160000_insight_event_ledger.sql`

## Known Current Gaps To Fix First

- `baseball_stat_uploads` type/action mismatch. The action writes richer upload fields than generated types show. Reconcile before building import UI.
- `baseball_player_stats` is too generic and shallow for elite player development. Add first-class event tables instead of cramming every metric into this table.
- Box score import currently covers batting/pitching only. Add fielding/catching/baserunning and official source provenance.
- PDF upload currently tells users to paste text. Replace with source attachment + extraction/review workflow or remove PDF as a fake feature until real extraction exists.
- Current aggregate calculation references fields that may not exist in generated `baseball_player_aggregates`. Verify and correct.
- Current CSV parser is simple comma splitting and will fail quoted values. Use a robust parser or implement safe parsing.
- Stats imports do not preserve raw rows enough for true rollback/reprocessing.
- Player matching needs persistent external IDs and manual resolution memory.
- Video exists but is not event-linked.
- Classes exist but are not deeply connected to conflicts/practice/lifts/travel.
- Baseball AI exists but lacks GolfHelm-level lifecycle, source, action, and outcome tracking.

## Recommended Implementation Order

1. Audit and write findings.
2. Fix source/import schema foundation.
3. Replace brittle CSV parsing and upload contract.
4. Add external identity model.
5. Add import run/row/mapping tables.
6. Extend official stats structure.
7. Add event-level development tables.
8. Add source trust UI primitives.
9. Upgrade Stats Upload to Import Dossier.
10. Add post-commit recalculation and timeline hooks.
11. Add CoachHelm insight/event ledger.
12. Add six MVP baseball generators.
13. Add video event linking.
14. Add classes conflict automation.
15. Add strength/readiness hooks.
16. Wire insights into Command Center, Stats, Practice, Player Profile, Staff Meeting.

## Migration Approach

Use `supabase migration new` if implementing in the repo. Migrations should:

- extend existing baseball tables cautiously
- add new source/import/event tables
- include indexes
- include RLS
- include helper functions only if needed
- avoid SECURITY DEFINER unless necessary and carefully scoped
- include rollback-friendly design through import refs

## Testing Requirements

Add or update tests for:

- import parser with quoted CSV fields
- field mapping aliases
- player matching confidence and manual override
- duplicate import prevention
- rollback
- RLS for coach/player/strength/academic roles
- insight visibility
- source drawer rendering
- postgame import creates timeline/signals/actions
- class conflict detection
- video event linking

## Acceptance Criteria

The V6 work is acceptable only when:

- Every stat row has a source or the UI marks it as legacy/unverified.
- Every import can be previewed before commit.
- Every import can be rolled back.
- Every unmatched player can be resolved and remembered.
- Official stats are separate from development metrics.
- Video can be linked to stats/insights/tasks.
- Classes affect calendar/practice/lift availability.
- CoachHelm insights cite evidence.
- CoachHelm actions and outcomes are tracked.
- Role visibility is tested.
- The product surfaces show baseball decisions, not generic chart filler.


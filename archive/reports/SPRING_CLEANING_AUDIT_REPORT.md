# GolfHelm Database Spring Cleaning Audit Report

**Date**: 2026-01-02
**Database**: https://dgvlnelygibgrrjehbyc.supabase.co

---

## Executive Summary

**Total Issues Found**: 38

- 🔴 **Critical**: 3 issues requiring immediate attention
- 🟠 **High**: 0 issues to fix this week
- 🟡 **Medium**: 0 issues to address this month
- 🟢 **Low**: 35 nice-to-have improvements

---

## 🔴 CRITICAL ISSUES (Fix Immediately)



### 1. golf_events table exposed to anonymous users

**Category**: Security
**Details**: 3 of 3 rows are publicly accessible
**Recommendation**: Apply RLS policies to restrict access to golf_events


### 2. golf_events has no RLS protection

**Category**: Security
**Details**: All 3 rows are publicly accessible
**Recommendation**: Enable RLS and create policies for golf_events


### 3. Service role key may be exposed

**Category**: Security
**Details**: Service role key found in .env.local with NEXT_PUBLIC_ prefix
**Recommendation**: Ensure SUPABASE_SERVICE_ROLE_KEY is NOT prefixed with NEXT_PUBLIC_


---

## 🟠 HIGH PRIORITY ISSUES (Fix This Week)

None found! ✅


---

## 🟡 MEDIUM PRIORITY ISSUES (Fix This Month)

None found! ✅


---

## 🟢 LOW PRIORITY ISSUES (Backlog)



### 1. Mixed naming conventions

**Category**: Naming
**Details**: Golf tables use golf_ prefix, baseball tables do not
**Recommendation**: Consider consistent prefixing (baseball_ or no prefix for both)


### 2. Empty table: users

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if users is needed or can be removed


### 3. Empty table: players

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if players is needed or can be removed


### 4. Empty table: coaches

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if coaches is needed or can be removed


### 5. Empty table: organizations

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if organizations is needed or can be removed


### 6. Empty table: teams

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if teams is needed or can be removed


### 7. Empty table: team_members

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if team_members is needed or can be removed


### 8. Empty table: watchlists

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if watchlists is needed or can be removed


### 9. Empty table: videos

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if videos is needed or can be removed


### 10. Empty table: messages

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if messages is needed or can be removed


### 11. Empty table: conversations

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if conversations is needed or can be removed


### 12. Empty table: golf_players

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_players is needed or can be removed


### 13. Empty table: golf_coaches

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_coaches is needed or can be removed


### 14. Empty table: golf_teams

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_teams is needed or can be removed


### 15. Empty table: golf_organizations

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_organizations is needed or can be removed


### 16. Empty table: golf_rounds

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_rounds is needed or can be removed


### 17. Empty table: golf_shots

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_shots is needed or can be removed


### 18. Empty table: golf_events

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_events is needed or can be removed


### 19. Empty table: golf_qualifiers

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_qualifiers is needed or can be removed


### 20. Empty table: golf_qualifier_rounds

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if golf_qualifier_rounds is needed or can be removed


### 21. Empty table: camps

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if camps is needed or can be removed


### 22. Empty table: camp_registrations

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if camp_registrations is needed or can be removed


### 23. Empty table: developmental_plans

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if developmental_plans is needed or can be removed


### 24. Empty table: player_stats

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if player_stats is needed or can be removed


### 25. Empty table: evaluations

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if evaluations is needed or can be removed


### 26. Empty table: recruiting_interests

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if recruiting_interests is needed or can be removed


### 27. Empty table: player_settings

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if player_settings is needed or can be removed


### 28. Empty table: player_achievements

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if player_achievements is needed or can be removed


### 29. Empty table: player_metrics

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if player_metrics is needed or can be removed


### 30. Empty table: team_invitations

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if team_invitations is needed or can be removed


### 31. Empty table: team_coach_staff

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if team_coach_staff is needed or can be removed


### 32. Empty table: logos

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if logos is needed or can be removed


### 33. Empty table: events

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if events is needed or can be removed


### 34. Empty table: player_engagement_events

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if player_engagement_events is needed or can be removed


### 35. Empty table: notifications

**Category**: Cleanup
**Details**: Table exists but has no data
**Recommendation**: Evaluate if notifications is needed or can be removed


---

## 📊 Detailed Findings by Category

### Tables Audited
- **Total Tables**: 34
- **Empty Tables**: 34
- **Tables with Data**: 0

### RLS Status
- **golf_players**: ✅ Protected (1 rows)
- **golf_teams**: ✅ Protected (3 rows)
- **golf_coaches**: Empty
- **golf_rounds**: ✅ Protected (1 rows)
- **golf_shots**: ✅ Protected (359 rows)
- **golf_events**: ❌ EXPOSED (3 rows)
- **golf_organizations**: ✅ Protected (3 rows)
- **users**: ✅ Protected (1 rows)
- **players**: Empty
- **coaches**: Empty
- **organizations**: ✅ Protected (33 rows)

### Empty Tables (Cleanup Candidates)
- users
- players
- coaches
- organizations
- teams
- team_members
- watchlists
- videos
- messages
- conversations
- golf_players
- golf_coaches
- golf_teams
- golf_organizations
- golf_rounds
- golf_shots
- golf_events
- golf_qualifiers
- golf_qualifier_rounds
- camps
- camp_registrations
- developmental_plans
- player_stats
- evaluations
- recruiting_interests
- player_settings
- player_achievements
- player_metrics
- team_invitations
- team_coach_staff
- logos
- events
- player_engagement_events
- notifications

---

## 🎯 Action Plan

### Phase 1: Critical (Do Immediately)
1. Apply RLS policies to restrict access to golf_events
2. Enable RLS and create policies for golf_events
3. Ensure SUPABASE_SERVICE_ROLE_KEY is NOT prefixed with NEXT_PUBLIC_

### Phase 2: High Priority (This Week)
✅ No high priority issues!

### Phase 3: Medium Priority (This Month)
✅ No medium priority issues!

### Phase 4: Low Priority (Backlog)
1. Consider consistent prefixing (baseball_ or no prefix for both)
2. Evaluate if users is needed or can be removed
3. Evaluate if players is needed or can be removed
4. Evaluate if coaches is needed or can be removed
5. Evaluate if organizations is needed or can be removed
6. Evaluate if teams is needed or can be removed
7. Evaluate if team_members is needed or can be removed
8. Evaluate if watchlists is needed or can be removed
9. Evaluate if videos is needed or can be removed
10. Evaluate if messages is needed or can be removed
11. Evaluate if conversations is needed or can be removed
12. Evaluate if golf_players is needed or can be removed
13. Evaluate if golf_coaches is needed or can be removed
14. Evaluate if golf_teams is needed or can be removed
15. Evaluate if golf_organizations is needed or can be removed
16. Evaluate if golf_rounds is needed or can be removed
17. Evaluate if golf_shots is needed or can be removed
18. Evaluate if golf_events is needed or can be removed
19. Evaluate if golf_qualifiers is needed or can be removed
20. Evaluate if golf_qualifier_rounds is needed or can be removed
21. Evaluate if camps is needed or can be removed
22. Evaluate if camp_registrations is needed or can be removed
23. Evaluate if developmental_plans is needed or can be removed
24. Evaluate if player_stats is needed or can be removed
25. Evaluate if evaluations is needed or can be removed
26. Evaluate if recruiting_interests is needed or can be removed
27. Evaluate if player_settings is needed or can be removed
28. Evaluate if player_achievements is needed or can be removed
29. Evaluate if player_metrics is needed or can be removed
30. Evaluate if team_invitations is needed or can be removed
31. Evaluate if team_coach_staff is needed or can be removed
32. Evaluate if logos is needed or can be removed
33. Evaluate if events is needed or can be removed
34. Evaluate if player_engagement_events is needed or can be removed
35. Evaluate if notifications is needed or can be removed

---

## ✅ Audit Complete

**Next Steps**:
1. Review critical issues immediately
2. Create migration files for fixes
3. Test changes in development first
4. Apply fixes systematically by priority

*Report generated: 2026-01-02T05:49:17.262Z*

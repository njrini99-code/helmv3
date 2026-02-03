# BaseballHelm Production Audit - Master Orchestration

> **Version**: 1.0
> **Date**: January 25, 2026
> **Platform**: BaseballHelm (Helm Sports Labs)
> **Location**: `/Users/ricknini/Downloads/helmv3`

---

## 🎯 PURPOSE

This document orchestrates two specialized Claude Code agents to conduct a comprehensive production readiness audit of the BaseballHelm platform. Each agent focuses on a specific user persona to ensure thorough coverage.

---

## 🤖 AGENT OVERVIEW

| Agent | File | Focus Area | Primary Users |
|-------|------|------------|---------------|
| **Coach Dashboard Agent** | `AUDIT_COACH_DASHBOARD.md` | All coach-facing features | College, JUCO, HS, Showcase coaches |
| **Player Dashboard Agent** | `AUDIT_PLAYER_DASHBOARD.md` | All player-facing features | HS, Showcase, JUCO, College players |

---

## 📊 CURRENT PLATFORM STATE (as of Jan 25, 2026)

### Codebase Metrics
```
Total Files: 1,752
Total Tokens: 3.4M
Source Files: ~800+ TypeScript files
Components: 392 files
Hooks: 41 files
Migrations: 70+ SQL files
```

### Technology Stack
- **Frontend**: Next.js 16 (App Router), React, TypeScript (strict)
- **Styling**: Tailwind CSS, Glassmorphism design system
- **Database**: Supabase (PostgreSQL + RLS + Realtime)
- **Auth**: Supabase Auth (JWT)
- **Storage**: Supabase Storage (videos, images)
- **Hosting**: Vercel

### Known Issue Count (from TODO.md)
- **Total Tasks**: 126
- **Critical/High**: 47
- **Missing Routes**: 39
- **Broken Links**: 7
- **Console Statements**: 28

---

## 🏗️ ARCHITECTURE SUMMARY

### Coach Experience Flow
```
Login → Auth Check → Coach Type Detection
    ↓
    college/juco (recruiting) → Recruiting Dashboard
    high_school → Team Dashboard (HS)
    juco (team mode) → Team Dashboard + Academics
    showcase → Organization Dashboard
```

### Player Experience Flow
```
Signup → Onboarding → Profile Setup
    ↓
    player_type = college → Team Mode Only
    recruiting_activated = false → Team Mode + Activation Banner
    recruiting_activated = true → Full Recruiting Dashboard
```

### Database Table Naming
```
baseball_*     - All baseball-specific tables
golf_*         - All golf-specific tables (GolfHelm product)
organizations  - Shared table for schools/programs
users          - Shared auth-linked user records
notifications  - Shared notifications
```

---

## 📁 KEY FILES TO AUDIT

### Coach Dashboard
| File | Purpose |
|------|---------|
| `src/app/baseball/(dashboard)/layout.tsx` | Auth + routing logic |
| `src/app/baseball/(dashboard)/dashboard/page.tsx` | Main coach/player dashboard |
| `src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx` | Kanban recruiting pipeline |
| `src/app/baseball/(dashboard)/dashboard/discover/page.tsx` | Player discovery |
| `src/app/baseball/(dashboard)/dashboard/compare/page.tsx` | Player comparison |
| `src/app/baseball/(dashboard)/dashboard/messages/page.tsx` | Messaging |
| `src/components/layout/sidebar.tsx` | Navigation structure |
| `src/hooks/use-auth.ts` | Authentication state |
| `src/hooks/use-watchlist.ts` | Pipeline management |
| `src/hooks/use-baseball-dashboard.ts` | Dashboard data |

### Player Dashboard
| File | Purpose |
|------|---------|
| `src/app/baseball/(dashboard)/dashboard/profile/page.tsx` | Profile editor |
| `src/app/baseball/(dashboard)/dashboard/videos/page.tsx` | Video management |
| `src/app/baseball/(dashboard)/dashboard/colleges/page.tsx` | College discovery |
| `src/app/baseball/(dashboard)/dashboard/journey/page.tsx` | Recruiting journey |
| `src/app/baseball/(dashboard)/dashboard/analytics/page.tsx` | Player analytics |
| `src/app/baseball/(dashboard)/dashboard/activate/page.tsx` | Recruiting activation |
| `src/components/features/profile-editor.tsx` | Profile form component |

### Shared/Infrastructure
| File | Purpose |
|------|---------|
| `src/lib/types/index.ts` | All TypeScript types |
| `src/lib/supabase/server.ts` | Server-side Supabase client |
| `src/lib/supabase/client.ts` | Client-side Supabase client |
| `supabase/migrations/*.sql` | Database schema |
| `CLAUDE.md` | Project rules and patterns |

---

## 🚀 HOW TO RUN THE AUDITS

### Option 1: Sequential (Recommended)
Run one agent at a time, allowing full context focus:

```bash
# Step 1: Run Coach Dashboard Audit
# Open Claude Code and send:
"Please read AUDIT_COACH_DASHBOARD.md and conduct a full production readiness audit of the coach dashboard. Save findings to docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md"

# Step 2: After completion, run Player Dashboard Audit
# Open a new Claude Code session and send:
"Please read AUDIT_PLAYER_DASHBOARD.md and conduct a full production readiness audit of the player dashboard. Save findings to docs/audits/PLAYER_DASHBOARD_AUDIT_REPORT.md"
```

### Option 2: Parallel (If using multiple sessions)
Run both audits simultaneously in separate Claude Code sessions.

---

## 📋 AUDIT OUTPUT LOCATIONS

After running both agents, reports will be saved to:
```
docs/audits/COACH_DASHBOARD_AUDIT_REPORT.md
docs/audits/PLAYER_DASHBOARD_AUDIT_REPORT.md
```

---

## 🔍 PRIORITY AREAS

Based on my analysis of the codebase, here are the highest priority areas to investigate:

### Critical (Must Audit First)
1. **RLS Policies** - Ensure data isolation between users
2. **Auth Flow** - Login, session, logout all secure
3. **Pipeline Stage Management** - Only 5 valid stages exist
4. **Message Security** - No cross-user message access

### High Priority
1. **Profile Completion Logic** - Calculation accuracy
2. **Video Upload/Storage** - Working correctly
3. **Real-time Subscriptions** - Messages update live
4. **Error Handling** - No silent failures

### Medium Priority
1. **Console Statement Cleanup** - 28 instances to remove
2. **Missing Detail Pages** - 39 routes need [id] pages
3. **Broken Links** - 7 links to fix
4. **Empty States** - All lists need empty UI

---

## 🧪 TESTING CHECKLIST

Before declaring production-ready, verify these flows work end-to-end:

### Coach Flows
- [ ] College coach: Login → Discover → Add to Pipeline → Send Message
- [ ] JUCO coach: Toggle between Recruiting and Team modes
- [ ] HS coach: Manage roster, create dev plans
- [ ] Showcase coach: Switch between teams

### Player Flows
- [ ] New player: Signup → Onboarding → Dashboard
- [ ] Activate recruiting → Profile visible to coaches
- [ ] Upload video → Appears on profile
- [ ] Receive message → Reply works
- [ ] Register for camp → Confirmation received

---

## 📊 SUCCESS CRITERIA

### Production Ready Threshold: 85%+

| Category | Weight | Passing Criteria |
|----------|--------|-----------------|
| Security | 30% | No critical RLS gaps, auth works |
| Core Features | 25% | All primary flows functional |
| Data Integrity | 20% | No data loss, accurate calculations |
| UX/UI | 15% | Consistent design, mobile works |
| Performance | 10% | Pages load <3s, no memory leaks |

---

## 🛠️ POST-AUDIT WORKFLOW

1. **Triage Findings**: Sort by Critical → High → Medium → Low
2. **Create Issues**: Add to GitHub/Linear for tracking
3. **Estimate Effort**: Hours per fix
4. **Sprint Planning**: Batch fixes by category
5. **Re-Audit**: Run agents again after fixes
6. **Sign-Off**: Mark production-ready when >85%

---

## 📞 ESCALATION CRITERIA

Immediately flag to team lead if audit finds:
- ❌ User can access another user's private data
- ❌ Authentication can be bypassed
- ❌ Data deletion is possible without confirmation
- ❌ Financial/payment data exposure risk
- ❌ Personally identifiable information leak

---

## 📝 NOTES FOR AUDITORS

1. **Be Thorough**: Check every page, every flow, every edge case
2. **Document Everything**: Screenshots, code references, reproduction steps
3. **Suggest Fixes**: Don't just identify problems, propose solutions
4. **Estimate Effort**: Help prioritize with time estimates
5. **Think Like Users**: Would a real coach/player be confused or frustrated?

---

## 🔗 RELATED DOCUMENTS

- `CLAUDE.md` - Project rules (READ FIRST)
- `docs/CODEBASE_MAP.md` - Full architecture
- `TODO.md` - Known issues
- `docs/DEVELOPMENT_RULES.md` - Coding standards
- `supabase/migrations/` - Database schema

---

**Good luck with the audit. Build something great! ⚾**

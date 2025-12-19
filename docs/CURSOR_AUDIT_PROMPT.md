# CURSOR_AUDIT_PROMPT.md

## Comprehensive Codebase Audit Prompt for Cursor

Copy and paste the sections below into Cursor to run systematic audits.

---

## PROMPT 1: Button & Link Pathway Audit

```
I need you to audit the entire codebase for broken or missing button/link pathways. Do the following:

### STEP 1: Find All Interactive Elements
Scan the codebase for:
- All `<Link href="...">` components
- All `<button onClick={...}>` elements
- All `router.push()` calls
- All `redirect()` calls
- All `<a href="...">` tags

### STEP 2: For Each Element, Verify:
1. **Links**: Does the destination route exist in `/app` directory?
2. **Buttons with navigation**: Does the onClick handler navigate somewhere? If so, does that route exist?
3. **Buttons with actions**: Does the server action or API route exist?
4. **Dynamic routes**: Are dynamic segments like `[id]` or `[teamId]` properly handled?

### STEP 3: Create a Report
Output a markdown table with these columns:
| File | Line | Element Type | Target Path/Action | Status | Issue |

Status should be:
- ✅ VALID - Route/action exists and is properly connected
- ⚠️ INCOMPLETE - Route exists but page is empty/placeholder
- ❌ BROKEN - Route/action does not exist
- 🔄 DYNAMIC - Dynamic route, needs runtime verification

### STEP 4: Check These Specific High-Risk Areas

1. **Navigation Menus** - Check all sidebar nav items have valid routes
2. **Dashboard Quick Actions** - All CTA buttons on dashboards
3. **Table Row Actions** - Edit, Delete, View buttons in data tables
4. **Modal Submit Buttons** - Form submissions in modals
5. **Card Click Handlers** - Clickable cards that navigate
6. **Dropdown Menu Items** - All items in dropdown menus
7. **Pagination Controls** - Next/Previous/Page number buttons
8. **Filter/Search Submissions** - Form submissions for filtering
9. **Back/Cancel Buttons** - Navigation back to previous pages
10. **Empty State CTAs** - Buttons in "no data" empty states

### STEP 5: List All Orphan Routes
Find any routes in `/app` that are NOT linked to from anywhere in the codebase.

Please start the audit now and provide the complete report.
```

---

## PROMPT 2: Feature Completeness Audit

```
I need you to audit the codebase against our feature requirements. Check each feature and determine if it's complete, partial, or missing.

### FEATURE CHECKLIST BY USER TYPE

## FOUNDATION (Required for all)
Check these exist and are functional:

| Feature | Files to Check | Required Elements |
|---------|----------------|-------------------|
| Auth - Login | app/(auth)/login/page.tsx | Form, validation, redirect |
| Auth - Signup | app/(auth)/signup/page.tsx | Form, role selection, validation |
| Auth - Logout | Logout button in layout | Clears session, redirects |
| Onboarding - Player | app/onboarding/player/page.tsx | Multi-step form, saves to DB |
| Onboarding - Coach | app/onboarding/coach/page.tsx | Multi-step form, org selection |
| Dashboard Layout | app/(dashboard)/layout.tsx | Sidebar, header, auth check |
| Database Types | types/database.ts | Generated from Supabase |
| Supabase Clients | lib/supabase/server.ts, client.ts | Both exist and work |

## COLLEGE COACH FEATURES
| Feature | Route | Status Check |
|---------|-------|--------------|
| Dashboard | /coach/college | Stats, activity feed, pipeline overview |
| Discover Players | /coach/college/discover | Grid, filters, pagination, player cards |
| Player Detail Modal | Component or route | Full player info, videos, add to watchlist |
| Watchlist | /coach/college/watchlist | Table, status updates, remove, notes |
| Pipeline | /coach/college/pipeline | Kanban board, drag-drop, stage management |
| Compare Players | /coach/college/compare | Side-by-side, stat comparison, add/remove |
| Camps Management | /coach/college/camps | List, create, edit, registrations |
| Program Profile | /coach/college/program | Edit info, upload logo, social links |
| Messages | /coach/college/messages | Conversation list, message view, send |
| Calendar | /coach/college/calendar | Month view, events, create event |
| Settings | /coach/college/settings | Account, notifications, preferences |

## HS COACH FEATURES
| Feature | Route | Status Check |
|---------|-------|--------------|
| Dashboard | /coach/high-school | Stats, roster preview, college interest |
| Roster Management | /coach/high-school/roster | Table, add/remove players, player detail |
| Join Link System | Component | Generate link, copy, track signups |
| Video Library | /coach/high-school/videos | Grid, upload, organize by player |
| Dev Plans | /coach/high-school/dev-plans | List, create, assign, track progress |
| College Interest | /coach/high-school/interest | Feed of coach views/actions |
| Team Settings | /coach/high-school/team-settings | Team info, permissions |

## PLAYER FEATURES
| Feature | Route | Status Check |
|---------|-------|--------------|
| Dashboard | /player | Stats, profile completion, team info |
| Profile Editor | /player/profile | 5 tabs: Personal, Baseball, Academics, Media, Preferences |
| Video Upload | /player/videos | Upload, URL add, organize |
| Video Clipping | /player/videos/[id]/clip | Timeline, set start/end, save clip |
| Team Hub | /player/team | Team info, schedule, roster, messages |
| Recruiting Activation | /player/activate | 3-step flow, terms, activate |
| Discover Colleges | /player/discover | Grid, filters, add to interests |
| My Journey | /player/journey | Timeline, status updates, notes |
| Analytics | /player/analytics | Views chart, top schools, engagement |
| Camps Browser | /player/camps | Browse, register, show interest |

## JUCO COACH FEATURES
| Feature | Route | Status Check |
|---------|-------|--------------|
| Mode Toggle | Component | Switch recruiting/team, URL state |
| Dual Dashboard | /coach/juco | Shows correct dashboard per mode |
| Academics Tracking | /coach/juco/academics | GPA table, eligibility status |
| (Inherits College Coach recruiting features) | | |
| (Inherits HS Coach team features) | | |

## SHOWCASE COACH FEATURES
| Feature | Route | Status Check |
|---------|-------|--------------|
| Team Switcher | Component | Dropdown, all teams, quick switch |
| Org Dashboard | /coach/showcase | All teams overview, aggregate stats |
| Team Dashboard | /coach/showcase/team/[teamId] | Per-team stats and roster |
| Events Management | /coach/showcase/events | Create, edit, list events |
| (Inherits HS Coach team features per team) | | |

## SHARED SYSTEMS
| Feature | Location | Status Check |
|---------|----------|--------------|
| Messaging | /[role]/messages | Conversations, real-time, send |
| Notifications | NotificationBell component | Dropdown, mark read, links |
| Calendar | /[role]/calendar | Month view, events, CRUD |
| Global Search | GlobalSearch component | ⌘K, search all, navigate |
| Public Player Profile | /player/[id] (public) | View-only, engagement tracking |
| Public Program Profile | /program/[id] (public) | View-only, camps list |

## SUBSCRIPTION SYSTEM
| Feature | Location | Status Check |
|---------|----------|--------------|
| Subscription Plans | Database seed | Plans exist in DB |
| Feature Gating | FeatureGate component | Checks subscription, shows upgrade |
| Stripe Checkout | /api/checkout | Creates session, redirects |
| Stripe Webhooks | /api/webhooks/stripe | Handles events, activates features |
| Subscription Page | /settings/subscription | View plan, upgrade, cancel |

### OUTPUT FORMAT

For each feature, report:
```
## [Feature Name]
- Route: /path/to/feature
- Status: ✅ COMPLETE | 🟡 PARTIAL | ❌ MISSING | 🔲 NOT STARTED
- Files Found: [list files]
- Missing Elements: [what's missing]
- Blocking Issues: [any errors or blockers]
```

### SUMMARY TABLE
At the end, provide:
| Category | Total Features | Complete | Partial | Missing |
|----------|----------------|----------|---------|---------|
| Foundation | X | X | X | X |
| College Coach | X | X | X | X |
| HS Coach | X | X | X | X |
| Player | X | X | X | X |
| JUCO Coach | X | X | X | X |
| Showcase Coach | X | X | X | X |
| Shared Systems | X | X | X | X |
| Subscriptions | X | X | X | X |
| **TOTAL** | X | X | X | X |

Please run this audit now.
```

---

## PROMPT 3: Server Actions & API Routes Audit

```
Audit all server actions and API routes in the codebase:

### STEP 1: Find All Server Actions
Look in:
- app/actions/*.ts
- Any file with 'use server' directive

For each action, check:
1. Does it have proper auth verification?
2. Does it validate input?
3. Does it call revalidatePath()?
4. Is it imported and used somewhere?
5. Does it handle errors properly?

### STEP 2: Find All API Routes
Look in:
- app/api/**/route.ts

For each route, check:
1. Which HTTP methods are implemented (GET, POST, PUT, DELETE)?
2. Does it verify authentication?
3. Does it validate request body/params?
4. Is it called from somewhere in the frontend?

### STEP 3: Cross-Reference
For each form or button that should call an action:
1. Is the action imported?
2. Is it called correctly?
3. Are the parameters correct?

### OUTPUT
Create tables:

**Server Actions:**
| Action Name | File | Used By | Auth Check | Validation | Revalidate | Status |

**API Routes:**
| Route | Methods | Used By | Auth Check | Status |

**Orphan Actions/Routes:**
List any that exist but are never called.

**Missing Actions:**
List any that are imported/called but don't exist.
```

---

## PROMPT 4: Database & Type Safety Audit

```
Audit database queries and type safety:

### STEP 1: Check All Supabase Queries
Find all instances of:
- supabase.from('table_name')
- .select()
- .insert()
- .update()
- .delete()

For each query:
1. Does the table exist in our schema?
2. Are the column names correct?
3. Is the query properly typed?
4. Are there proper error handlers?

### STEP 2: Check Type Definitions
In types/database.ts:
1. Are all 37 tables represented?
2. Do types match current schema?
3. Are there any 'any' types that should be specific?

### STEP 3: Check for Type Errors
Run: npx tsc --noEmit

List all type errors with:
| File | Line | Error |

### STEP 4: RLS Policy Check
For each table being queried:
1. Is there a corresponding RLS policy?
2. Does the query respect the expected RLS behavior?
3. Are service role queries only in webhooks/admin?

### OUTPUT
- List of type mismatches
- List of potential RLS issues
- List of untyped queries
```

---

## PROMPT 5: UI Component Completeness Audit

```
Audit all UI components for completeness:

### CHECK EACH COMPONENT FOR:

1. **Loading States**
   - Does it show a skeleton/spinner when loading?
   - Check: loading.tsx files, Suspense boundaries

2. **Empty States**
   - What happens when there's no data?
   - Does it show a helpful message and CTA?

3. **Error States**
   - Is there try/catch around data fetching?
   - Does it show user-friendly error messages?
   - Is there error.tsx for the route?

4. **Mobile Responsiveness**
   - Are there responsive classes (sm:, md:, lg:)?
   - Does the layout work on mobile?

5. **Accessibility**
   - Do interactive elements have proper labels?
   - Is there keyboard navigation support?
   - Are there aria attributes where needed?

### SPECIFIC CHECKS

| Component Type | Required States |
|---------------|-----------------|
| Data Tables | Loading, Empty, Error, Pagination |
| Forms | Validation errors, Submit loading, Success |
| Modals | Open/Close, Submit loading, Error |
| Cards | Hover state, Click feedback |
| Buttons | Loading state, Disabled state |
| Dropdowns | Empty option, Loading options |

### OUTPUT
For each major component/page:
| Component | Loading | Empty | Error | Mobile | A11y | Status |
```

---

## PROMPT 6: Quick Fix List Generator

```
Based on all the audits above, generate a prioritized fix list:

### FORMAT

## 🔴 CRITICAL (Blocking)
These prevent core functionality from working:
1. [Issue] - [File] - [Suggested Fix]

## 🟠 HIGH (User-Facing Bugs)
These cause visible problems for users:
1. [Issue] - [File] - [Suggested Fix]

## 🟡 MEDIUM (Incomplete Features)
These are partial implementations:
1. [Issue] - [File] - [Suggested Fix]

## 🟢 LOW (Polish & Enhancement)
These improve quality but aren't blocking:
1. [Issue] - [File] - [Suggested Fix]

## 📋 IMPLEMENTATION QUEUE
Order to tackle fixes:
1. [ ] Fix X (30 min)
2. [ ] Fix Y (1 hour)
3. [ ] Implement Z (2 hours)
...

Estimate total time to reach MVP: X hours/days
```

---

## HOW TO USE THESE PROMPTS

1. **Start with Prompt 2** (Feature Completeness) - Get the big picture
2. **Run Prompt 1** (Button Pathways) - Find navigation breaks
3. **Run Prompt 3** (Server Actions) - Find data layer gaps
4. **Run Prompt 5** (UI States) - Find UX gaps
5. **Finish with Prompt 6** - Generate your fix list

For each issue found, you can then ask Cursor:
```
Fix the [issue] in [file]. Here's what it should do: [description]
```

---

## QUICK SINGLE-PROMPT VERSION

If you want one prompt that does everything:

```
Audit this Helm Sports Labs codebase completely:

1. **Routes Check**: List every route in /app and whether it has a working page
2. **Links Check**: Find all Links/buttons and verify their destinations exist
3. **Actions Check**: List all server actions and whether they're used
4. **Feature Status**: For each user type (College Coach, HS Coach, Player, JUCO, Showcase), list features as Complete/Partial/Missing
5. **Broken Items**: List anything that would cause an error or 404
6. **Missing Items**: List required features that don't exist yet

Output as markdown with clear sections and a summary table showing overall completion percentage.
```

---

## AFTER THE AUDIT

Once you have the audit results, use this prompt to fix issues:

```
I have this audit finding:
[paste the specific issue]

Please fix it by:
1. Creating/updating the necessary files
2. Ensuring proper types and error handling
3. Adding loading and empty states
4. Making sure it connects to existing navigation

Show me the complete code for all files that need to change.
```

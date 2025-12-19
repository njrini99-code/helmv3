# FULL_AUDIT_PROMPT.md

## Post-Task Comprehensive Audit

Copy this ENTIRE prompt into Cursor after completing your current task. It will systematically check everything and tell you exactly where you are.

---

```
I need you to run a FULL AUDIT of the Helm Sports Labs codebase. Go through each section systematically and report findings.

## SECTION 1: FILE STRUCTURE CHECK

First, verify the project structure exists. Run these commands and report what exists vs what's missing:

```bash
# Check main directories
ls -la app/
ls -la app/(dashboard)/
ls -la app/(dashboard)/coach/
ls -la app/(dashboard)/player/
ls -la app/actions/
ls -la components/
ls -la lib/
ls -la types/
```

Report format:
- ✅ EXISTS: [path]
- ❌ MISSING: [path]

## SECTION 2: ROUTE INVENTORY

List EVERY route in the app directory with its status:

| Route | File Exists | Has Content | Functional |
|-------|-------------|-------------|------------|
| /coach/college | ? | ? | ? |
| /coach/college/discover | ? | ? | ? |
| ... etc

Check these specific routes:
- /coach/college (dashboard)
- /coach/college/discover
- /coach/college/watchlist
- /coach/college/pipeline
- /coach/college/compare
- /coach/college/camps
- /coach/college/messages
- /coach/college/calendar
- /coach/college/program
- /coach/college/settings
- /coach/high-school (dashboard)
- /coach/high-school/roster
- /coach/high-school/videos
- /coach/high-school/dev-plans
- /coach/high-school/interest
- /coach/high-school/calendar
- /coach/juco
- /coach/showcase
- /player (dashboard)
- /player/profile
- /player/videos
- /player/team
- /player/activate
- /player/discover
- /player/journey
- /player/analytics
- /player/camps
- /player/messages
- /player/settings

## SECTION 3: FEATURE COMPLETION BY USER TYPE

For each feature, check if it:
1. Has a route/page
2. Fetches real data from Supabase
3. Has working UI
4. Has working actions (create/update/delete)

### COLLEGE COACH FEATURES

| Feature | Route | Data | UI | Actions | Status |
|---------|-------|------|-----|---------|--------|
| Dashboard with stats | | | | | |
| Discover players (grid + filters) | | | | | |
| Player detail modal | | | | | |
| Add to watchlist | | | | | |
| Watchlist table | | | | | |
| Update watchlist status | | | | | |
| Pipeline kanban | | | | | |
| Drag-drop between stages | | | | | |
| Compare players | | | | | |
| Camps list | | | | | |
| Create/edit camp | | | | | |
| Messages | | | | | |
| Send message | | | | | |
| Calendar | | | | | |
| Program profile editor | | | | | |

### HS COACH FEATURES

| Feature | Route | Data | UI | Actions | Status |
|---------|-------|------|-----|---------|--------|
| Dashboard | | | | | |
| Roster table | | | | | |
| Add/remove players | | | | | |
| Generate join link | | | | | |
| Video library | | | | | |
| Upload videos | | | | | |
| Dev plans list | | | | | |
| Create dev plan | | | | | |
| Assign dev plan | | | | | |
| College interest feed | | | | | |
| Calendar | | | | | |
| Team settings | | | | | |

### PLAYER FEATURES

| Feature | Route | Data | UI | Actions | Status |
|---------|-------|------|-----|---------|--------|
| Dashboard | | | | | |
| Profile editor (5 tabs) | | | | | |
| Save profile changes | | | | | |
| Video upload | | | | | |
| Video from URL | | | | | |
| Video clipping | | | | | |
| Team hub | | | | | |
| Recruiting activation | | | | | |
| Discover colleges | | | | | |
| Add to interests | | | | | |
| Journey timeline | | | | | |
| Update school status | | | | | |
| Analytics dashboard | | | | | |
| Real engagement data | | | | | |
| Messages | | | | | |
| Settings/privacy | | | | | |

### JUCO COACH FEATURES

| Feature | Status |
|---------|--------|
| Mode toggle (recruiting/team) | |
| Recruiting mode (reuses College Coach) | |
| Team mode (reuses HS Coach) | |
| Academics tracking | |

### SHOWCASE COACH FEATURES

| Feature | Status |
|---------|--------|
| Team switcher | |
| Org dashboard | |
| Per-team dashboard | |
| Events management | |

## SECTION 4: SERVER ACTIONS CHECK

List all files in app/actions/ and what functions they export:

```bash
ls -la app/actions/
```

For each action file, verify:
- Function exists
- Has auth check
- Calls Supabase correctly
- Has revalidatePath

Expected actions:
- [ ] watchlist.ts (add, remove, update status)
- [ ] messages.ts (send, create conversation)
- [ ] players.ts (update profile, upload avatar)
- [ ] videos.ts (upload, add URL, delete)
- [ ] recruiting.ts (activate, deactivate)
- [ ] interests.ts (add, remove, update status)
- [ ] dev-plans.ts (create, assign, update)
- [ ] events.ts (create, update, delete)
- [ ] profile-settings.ts (privacy toggles)

## SECTION 5: DATABASE CHECK

Verify these tables exist and have data:

```sql
-- Run in Supabase SQL editor or check via code
SELECT COUNT(*) FROM players;
SELECT COUNT(*) FROM coaches;
SELECT COUNT(*) FROM organizations;
SELECT COUNT(*) FROM teams;
SELECT COUNT(*) FROM player_videos;
SELECT COUNT(*) FROM recruit_watchlist;
SELECT COUNT(*) FROM player_engagement_events;
SELECT COUNT(*) FROM conversations;
SELECT COUNT(*) FROM messages;
```

## SECTION 6: COMPONENT INVENTORY

Check these key components exist:

```bash
ls -la components/shared/
ls -la components/coach/
ls -la components/player/
```

Expected shared components:
- [ ] PlayerCard.tsx
- [ ] Calendar.tsx
- [ ] Toggle.tsx
- [ ] Modal.tsx (or Dialog)

## SECTION 7: TYPESCRIPT CHECK

```bash
npx tsc --noEmit 2>&1 | head -50
```

Report:
- Total errors: X
- Critical errors (blocking): list them
- Type definition issues: list them

## SECTION 8: NAVIGATION CHECK

For each sidebar, verify all links work:

1. Open /coach/college - click each sidebar item
2. Open /coach/high-school - click each sidebar item
3. Open /player - click each sidebar item

Report any 404s or broken links.

## SECTION 9: BUILD CHECK

```bash
npm run build 2>&1 | tail -100
```

Report:
- Build successful? Y/N
- Any errors? List them
- Any warnings? List critical ones

---

## FINAL SUMMARY

After completing all sections, provide:

### Overall Completion Percentage
Based on feature completion above, calculate:
- College Coach: X% (Y of Z features)
- HS Coach: X% (Y of Z features)
- Player: X% (Y of Z features)
- JUCO Coach: X% (Y of Z features)
- Showcase Coach: X% (Y of Z features)
- Shared Systems: X% (Y of Z features)
- **TOTAL: X%**

### Priority Fix List
Top 5 things to fix/complete in order:
1. [Most critical]
2. [Second priority]
3. [Third priority]
4. [Fourth priority]
5. [Fifth priority]

### Recommended Next Sprint
Based on current state, recommend what to build next and estimate hours.

### Blocking Issues
List anything that prevents progress (missing dependencies, broken builds, etc.)

---

Run this audit NOW and provide the complete report.
```

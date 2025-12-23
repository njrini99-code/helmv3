# CRITICAL PRE-LAUNCH AUDIT - HELM SPORTS LABS
## Presentation in 3 hours - Zero tolerance for breaks

You are performing an emergency production audit. This app is being presented in 3 hours. Your job is to find and fix EVERY issue that could cause embarrassment during a live demo.

---

## PROJECT CONTEXT

- **Stack:** Next.js 14+, TypeScript, Supabase, Tailwind CSS
- **Project Path:** /Users/ricknini/Downloads/helmv3
- **Supabase Project ID:** dgvlnelygibgrrjehbyc
- **Two main modules:** Baseball (recruiting) and Golf (team management)

---

## PHASE 1: BUILD VERIFICATION (Do This First)

```bash
cd /Users/ricknini/Downloads/helmv3
npm install
npm run build
```

**If build fails:** Fix ALL errors before proceeding. Do not skip any.

**Check for:**
- [ ] Missing imports
- [ ] Type errors
- [ ] Undefined variables
- [ ] Incorrect paths (@/ aliases)

---

## PHASE 2: DATABASE SCHEMA VERIFICATION

The database has these critical tables. Verify the code matches:

### Users & Auth
```sql
-- users table expects:
-- id (uuid from auth.users)
-- email (text)
-- role (enum: 'player' | 'coach' | 'admin')
```
**Check:** Does signup create a user in `public.users`? There should be a trigger.

### Coaches Table - CRITICAL FIELDS:
```sql
coaches.user_id -> users.id (UNIQUE)
coaches.organization_id -> organizations.id (THIS IS OFTEN NULL - BUG!)
coaches.coach_type (enum: 'college' | 'juco' | 'high_school' | 'showcase')
coaches.onboarding_completed (boolean)
```
**Check:** Does coach onboarding set `organization_id`? This causes "No Program Found" error.

### Players Table - CRITICAL FIELDS:
```sql
players.user_id -> users.id (UNIQUE)
players.player_type (enum: 'high_school' | 'showcase' | 'juco' | 'college')
players.recruiting_activated (boolean) -- enables discovery
players.onboarding_completed (boolean)
```

### Watchlists Table - Pipeline:
```sql
watchlists.coach_id -> coaches.id
watchlists.player_id -> players.id
watchlists.pipeline_stage (enum: 'watchlist' | 'priority' | 'offer' | 'committed')
```
**Check:** Does the Pipeline component use these exact enum values?

### Messages:
```sql
conversations (id, created_at, updated_at)
conversation_participants (conversation_id, user_id, last_read_at)
messages (conversation_id, sender_id, content, read, sent_at)
```
**Check:** Does messaging query these tables correctly?

### Demo Requests - LANDING PAGE:
```sql
demo_requests (
  email text NOT NULL,
  name text,
  organization text,
  product text DEFAULT 'both', -- 'baseball' | 'golf' | 'both'
  status text DEFAULT 'pending'
)
```
**Check:** The demo form on landing page should INSERT into this table!

### Golf Tables:
```sql
golf_coaches.user_id -> auth.users (NOT public.users!)
golf_players.user_id -> auth.users (NOT public.users!)
golf_teams, golf_rounds, golf_holes, golf_qualifiers, etc.
```
**Check:** Golf auth might work differently than baseball!

---

## PHASE 3: CRITICAL CODE CHECKS

### 3.1 Demo Form - Wire to Database
**File:** `/src/app/page.tsx`

The demo form currently just shows a success message. It should save to `demo_requests` table:

```typescript
// FIND THIS and verify it saves to Supabase:
const handleDemoSubmit = async (e: React.FormEvent) => {
  // Should INSERT into demo_requests table
}
```

**FIX if needed:**
```typescript
const handleDemoSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!demoEmail) return;
  
  setDemoLoading(true);
  
  const supabase = createClient();
  const { error } = await supabase
    .from('demo_requests')
    .insert({ email: demoEmail });
  
  if (error) {
    console.error('Demo request error:', error);
    // Still show success to user
  }
  
  setDemoSubmitted(true);
  setDemoLoading(false);
};
```

### 3.2 Coach Onboarding - Organization Link
**File:** `/src/app/baseball/(onboarding)/coach/page.tsx`

Verify the `handleComplete` function:
1. Creates organization in `organizations` table
2. Updates coach with `organization_id`
3. Sets `onboarding_completed = true`

```typescript
// MUST do these steps:
// 1. Insert into organizations
const { data: org } = await supabase.from('organizations').insert({...}).select().single();

// 2. Update coach with org ID
await supabase.from('coaches').update({ 
  organization_id: org.id,
  onboarding_completed: true 
}).eq('user_id', user.id);
```

### 3.3 Pipeline Stage Values
**File:** `/src/app/baseball/(dashboard)/dashboard/pipeline/page.tsx` or similar

The database enum is: `'watchlist' | 'priority' | 'offer' | 'committed'`

**Check:** Do the column names in the UI match these exact values?

### 3.4 User Creation Trigger
**Check Supabase:** Run this SQL to verify trigger exists:
```sql
SELECT trigger_name, event_manipulation, action_statement 
FROM information_schema.triggers 
WHERE trigger_schema = 'public' AND trigger_name = 'on_auth_user_created';
```

If missing, this causes RLS errors on signup. Run:
```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
  INSERT INTO public.users (id, email, role)
  VALUES (NEW.id, NEW.email, 'player')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
```

### 3.5 Golf vs Baseball Auth Difference
Golf tables reference `auth.users` directly, not `public.users`.

**Check:** `/src/app/golf/(onboarding)/` - does it handle this correctly?

---

## PHASE 4: ROUTE AUDIT - Check Every Single Page Exists

### Test each route manually. Open the app and click through EVERYTHING.

```bash
npm run dev
```

### Landing & Auth Routes
- [ ] `/` - Landing page loads, demo form works
- [ ] `/about` - About page loads
- [ ] `/help` - Help page loads
- [ ] `/baseball/login` - Login form works
- [ ] `/baseball/signup` - Signup works (check console for RLS errors)
- [ ] `/golf/login` - Golf login works
- [ ] `/golf/signup` - Golf signup works

### Baseball Coach Dashboard Routes
- [ ] `/baseball/dashboard` - Main dashboard loads
- [ ] `/baseball/dashboard/discover` - Player discovery with map
- [ ] `/baseball/dashboard/watchlist` - Watchlist page
- [ ] `/baseball/dashboard/pipeline` - Pipeline/kanban board (drag-drop works)
- [ ] `/baseball/dashboard/compare` - Compare players
- [ ] `/baseball/dashboard/camps` - Camps listing
- [ ] `/baseball/dashboard/messages` - Messages inbox
- [ ] `/baseball/dashboard/program` - **CRITICAL: Check this shows org info, not "No Program Found"**
- [ ] `/baseball/dashboard/settings` - Settings page
- [ ] `/baseball/dashboard/calendar` - Calendar view
- [ ] `/baseball/dashboard/roster` - Team roster
- [ ] `/baseball/dashboard/videos` - Videos page

### Baseball Player Dashboard Routes
- [ ] `/baseball/dashboard` - Player dashboard
- [ ] `/baseball/dashboard/profile` - Player profile
- [ ] `/baseball/dashboard/colleges` - College browser
- [ ] `/baseball/dashboard/journey` - Recruiting journey
- [ ] `/baseball/dashboard/camps` - Camps for players
- [ ] `/baseball/dashboard/messages` - Player messages
- [ ] `/baseball/dashboard/analytics` - Player analytics

### Golf Routes
- [ ] `/golf/dashboard` - Golf dashboard
- [ ] `/golf/dashboard/roster` - Golf roster
- [ ] `/golf/dashboard/rounds` - Rounds tracking
- [ ] `/golf/dashboard/calendar` - Golf calendar
- [ ] `/golf/dashboard/qualifiers` - Qualifiers
- [ ] `/golf/dashboard/stats` - Golf stats
- [ ] `/golf/dashboard/messages` - Golf messages
- [ ] `/golf/dashboard/settings` - Golf settings

### Onboarding Routes
- [ ] `/baseball/onboarding/coach` - Coach onboarding flow (creates org?)
- [ ] `/baseball/onboarding/player` - Player onboarding flow

---

## PHASE 5: AUTHENTICATION FLOW - TEST THOROUGHLY

### New User Signup (MOST IMPORTANT)
1. [ ] Go to `/baseball/signup`
2. [ ] Fill in email and password
3. [ ] Click signup
4. [ ] **CHECK CONSOLE** - Any RLS errors? "new row violates row-level security"?
5. [ ] Should redirect to onboarding
6. [ ] **CHECK SUPABASE** - Is user in `public.users` table?

### Coach Onboarding (CRITICAL PATH)
1. [ ] Complete all onboarding steps
2. [ ] **CHECK SUPABASE:** 
   - Is organization created in `organizations` table?
   - Does coach have `organization_id` set?
   - Is `onboarding_completed = true`?
3. [ ] After onboarding, go to `/baseball/dashboard/program`
4. [ ] **MUST show organization info, NOT "No Program Found"**

### Login Flow
1. [ ] Go to `/baseball/login`
2. [ ] Enter valid credentials
3. [ ] Should redirect to dashboard
4. [ ] User data loads in sidebar (name, role)

---

## PHASE 6: DATABASE OPERATIONS - Verify Saves

### Watchlist
```sql
-- After adding player to watchlist, check:
SELECT * FROM watchlists WHERE coach_id = 'YOUR_COACH_ID';
```
- [ ] Add player → row appears
- [ ] Remove player → row deleted
- [ ] Persists after refresh

### Pipeline
```sql
-- After dragging player between columns:
SELECT player_id, pipeline_stage FROM watchlists WHERE coach_id = 'YOUR_COACH_ID';
```
- [ ] Drag to "Priority" → `pipeline_stage = 'priority'`
- [ ] Drag to "Offer" → `pipeline_stage = 'offer'`
- [ ] Changes persist after refresh

### Messages
```sql
-- After sending message:
SELECT * FROM messages ORDER BY sent_at DESC LIMIT 5;
```
- [ ] Send message → row appears in messages
- [ ] Conversation created if new
- [ ] Recipient can see message

### Demo Form
```sql
-- After submitting demo form on landing page:
SELECT * FROM demo_requests ORDER BY created_at DESC LIMIT 5;
```
- [ ] Submit form → row appears with email
- [ ] Status = 'pending'

---

## PHASE 7: UI COMPONENT AUDIT

### Forms - Test Every Form
- [ ] All inputs accept text
- [ ] Required fields show errors when empty
- [ ] Submit buttons show loading state
- [ ] Success/error messages display

### Sidebar Navigation
- [ ] All links work
- [ ] Messages badge shows unread count (not static dot)
- [ ] "Free Plan / BETA" shows (not "Upgrade to Pro")
- [ ] Sign out works

### Images
- [ ] Landing page logos load
- [ ] Dashboard logos load
- [ ] No white backgrounds on PNG logos (check mixBlendMode)

---

## PHASE 8: SPECIFIC FEATURES DEEP DIVE

### Discover Page (Coach)
- [ ] Map renders with real state shapes (not rectangles)
- [ ] Filters work (position, grad year, state)
- [ ] Player cards display
- [ ] **If empty:** Need seed data in `players` table with `recruiting_activated = true`

### Pipeline/Kanban
- [ ] Columns: Watchlist, Priority, Offer, Committed
- [ ] Drag and drop works
- [ ] Updates save to database
- [ ] **Check enum values match:** `'watchlist' | 'priority' | 'offer' | 'committed'`

### Program Page
- [ ] Shows organization name, division, conference
- [ ] **If "No Program Found":** `coaches.organization_id` is NULL
- [ ] Fix by running: `UPDATE coaches SET organization_id = 'ORG_ID' WHERE id = 'COACH_ID'`

### Messages
- [ ] Conversations load
- [ ] Can send new message
- [ ] Unread count in sidebar updates
- [ ] Real-time updates work (open 2 tabs)

---

## PHASE 9: ERROR HANDLING

### Console Errors - CHECK THESE
Open DevTools Console on every page:
- [ ] No red errors
- [ ] No "undefined" property access
- [ ] No RLS policy violations
- [ ] No hydration errors
- [ ] No unhandled promise rejections

### Common Errors and Fixes:

**"new row violates row-level security policy"**
→ User not in `public.users` table. Run the trigger SQL.

**"No Program Found" on program page**
→ `coaches.organization_id` is NULL. Link coach to org.

**"TypeError: Cannot read property 'X' of undefined"**
→ Data not loading. Check Supabase query.

**Blank page with no errors**
→ Check for `use client` directive, check component returns valid JSX.

---

## PHASE 10: MOBILE RESPONSIVE

Test on mobile viewport (Chrome DevTools → Toggle device toolbar):

- [ ] Landing page looks good
- [ ] Login/signup forms work
- [ ] Dashboard sidebar collapses
- [ ] All content readable
- [ ] Buttons tappable

---

## PHASE 11: QUICK FIXES TO APPLY

### Fix Demo Form to Save to Database
**File:** `/src/app/page.tsx`

Add this import at top:
```typescript
import { createClient } from '@/lib/supabase/client';
```

Update the handleDemoSubmit function:
```typescript
const handleDemoSubmit = async (e: React.FormEvent) => {
  e.preventDefault();
  if (!demoEmail) return;
  
  setDemoLoading(true);
  
  try {
    const supabase = createClient();
    await supabase.from('demo_requests').insert({ 
      email: demoEmail,
      product: 'both',
      status: 'pending'
    });
  } catch (error) {
    console.error('Demo request error:', error);
  }
  
  setDemoSubmitted(true);
  setDemoLoading(false);
};
```

### Seed Players for Discover Page (if empty)
Run in Supabase SQL Editor:
```sql
INSERT INTO players (
  id, player_type, first_name, last_name, primary_position, 
  grad_year, high_school_name, high_school_city, high_school_state,
  height_feet, height_inches, weight_lbs, bats, throws,
  gpa, recruiting_activated, onboarding_completed
) VALUES 
  (gen_random_uuid(), 'high_school', 'Marcus', 'Johnson', 'SS', 2026, 'Lincoln High', 'Dallas', 'TX', 5, 11, 175, 'R', 'R', 3.8, true, true),
  (gen_random_uuid(), 'high_school', 'Tyler', 'Williams', 'RHP', 2026, 'Westview Academy', 'Phoenix', 'AZ', 6, 3, 205, 'R', 'R', 3.5, true, true),
  (gen_random_uuid(), 'high_school', 'Derek', 'Thompson', 'C', 2027, 'Riverside Prep', 'San Diego', 'CA', 6, 0, 195, 'L', 'R', 3.9, true, true),
  (gen_random_uuid(), 'high_school', 'Jordan', 'Davis', 'OF', 2026, 'Mountain View HS', 'Denver', 'CO', 5, 10, 170, 'R', 'R', 3.7, true, true),
  (gen_random_uuid(), 'high_school', 'Cameron', 'Martinez', 'LHP', 2025, 'Central Catholic', 'Miami', 'FL', 6, 2, 190, 'L', 'L', 3.4, true, true),
  (gen_random_uuid(), 'high_school', 'Austin', 'Brown', '2B', 2026, 'Oak Park HS', 'Chicago', 'IL', 5, 9, 165, 'R', 'R', 3.6, true, true),
  (gen_random_uuid(), 'high_school', 'Ryan', 'Garcia', '3B', 2027, 'St. Augustine', 'Los Angeles', 'CA', 6, 1, 200, 'R', 'R', 3.7, true, true),
  (gen_random_uuid(), 'high_school', 'Jake', 'Wilson', 'OF', 2026, 'North Central', 'Atlanta', 'GA', 6, 0, 185, 'L', 'L', 3.5, true, true);
```

### Fix Coach-Organization Link (if needed)
```sql
-- Find unlinked coaches
SELECT c.id, c.full_name, c.school_name, c.organization_id, o.id as org_id
FROM coaches c
LEFT JOIN organizations o ON o.name = c.school_name
WHERE c.organization_id IS NULL;

-- Auto-link by matching school name
UPDATE coaches c
SET organization_id = o.id
FROM organizations o
WHERE o.name = c.school_name AND c.organization_id IS NULL;
```

---

## PHASE 12: FINAL DEMO DRY RUN

Run through exactly what you'll show in the presentation:

### Demo Script
1. [ ] **Landing Page** - Beautiful, logos show, scroll through sections
2. [ ] **Demo Form** - Enter email, submit, show success message
3. [ ] **Click "BaseballHelm"** - Goes to login page
4. [ ] **Login as Coach** - Dashboard loads with data
5. [ ] **Discover Page** - Map shows, players display, filters work
6. [ ] **Add to Watchlist** - Click player, add to watchlist
7. [ ] **Pipeline** - Show kanban, drag player between columns
8. [ ] **Messages** - Show inbox, send a message
9. [ ] **Program Page** - Shows your organization info
10. [ ] **Help Page** - FAQ loads, search works
11. [ ] **Sign Out** - Returns to landing page

### Backup Plan
If something breaks during demo:
- Have a second browser tab ready with a "known good" state
- Know which features are 100% working vs risky
- Have SQL queries ready to fix data issues live

---

## OUTPUT CHECKLIST

After completing audit, confirm:

```
BUILD: ✅ Passing / ❌ Failing

CRITICAL ISSUES FOUND:
1. 
2. 
3. 

FIXES APPLIED:
1. 
2. 
3. 

DATABASE STATUS:
- User trigger exists: ✅/❌
- Coach-org links: ✅/❌
- Seed data exists: ✅/❌

ROUTES TESTED: __/__ passing

DEMO READY: Yes / No (confidence: __%)

REMAINING RISKS:
1. 
2. 
```

---

## START NOW

```bash
cd /Users/ricknini/Downloads/helmv3
npm run build
```

If build passes, proceed to route testing. Report issues as you find them.

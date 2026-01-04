# 🔴 CRITICAL: RLS Policy Fix Required

## Problem Summary

Your account **cannot access the dashboard** because of missing Row Level Security (RLS) policies.

### Console Errors Seen:
```
golf_players?select=...&user_id=eq.aa6746b8... → 500 (Internal Server Error)
golf_coaches?select=...&user_id=eq.aa6746b8... → 500 (Internal Server Error)
```

### Root Cause:
1. RLS is **enabled** on `golf_players` and `golf_coaches` tables
2. But **no policies exist** to allow users to read their own data
3. When dashboard tries to load your profile → 500 error
4. Dashboard can't load → redirects you back to onboarding

## Solution

Apply the SQL in `FIX_GOLF_RLS_POLICIES.sql` to create proper RLS policies.

## How to Apply the Fix

### Option 1: Supabase Dashboard (RECOMMENDED)

1. Go to [Supabase Dashboard](https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc)
2. Click **SQL Editor** in left sidebar
3. Click **New Query**
4. Copy the entire contents of `FIX_GOLF_RLS_POLICIES.sql`
5. Paste into the SQL editor
6. Click **Run** button
7. Verify you see: "Success. No rows returned"

### Option 2: Command Line (if you have psql access)

```bash
PGPASSWORD='EHl4yASa9zM1sb1k' psql \
  "postgresql://postgres:EHl4yASa9zM1sb1k@db.dgvlnelygibgrrjehbyc.supabase.co:5432/postgres" \
  -f FIX_GOLF_RLS_POLICIES.sql
```

## What the Fix Does

Creates 3 policies for each table (`golf_players` and `golf_coaches`):

1. **SELECT policy**: Users can view their own profile
2. **UPDATE policy**: Users can update their own profile
3. **INSERT policy**: Users can create their own profile (onboarding)

## After Applying

1. **Clear browser cache/cookies** or use incognito
2. Go to `/golf/login`
3. Login with your credentials
4. Dashboard should load normally ✅

## Why This Happened

This is exactly what **Batch 2** of the database audit was supposed to catch:
> "CRITICAL Security Check - Tables without proper RLS policies"

The golf tables had RLS **enabled** (good for security) but **no policies defined** (blocks all access, including legitimate users).

---

**Status**: Ready to apply. This will fix your login issue immediately.

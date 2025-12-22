# Golf Dev Mode Setup

## Quick Fix for "Unauthorized" Error

The database has Row Level Security (RLS) enabled which requires at least one player to exist. Here's how to fix it:

### Option 1: Create Test Account (Recommended - 30 seconds)

1. Go to: `http://localhost:3000/player-golf/dev/create-account`
2. Click **"Create Test Account & Sign In"**
3. Wait for success message
4. Now go to: `http://localhost:3000/player-golf/round/new`
5. ✅ **Dev mode will now work** - it will use your test player

### Option 2: Disable RLS (Advanced - if Supabase is running locally)

Run this SQL in Supabase SQL Editor:

```sql
-- Temporarily disable RLS for dev testing
ALTER TABLE golf_players DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_rounds DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_holes DISABLE ROW LEVEL SECURITY;
ALTER TABLE golf_hole_shots DISABLE ROW LEVEL SECURITY;

-- Create a dev test player
INSERT INTO golf_players (first_name, last_name, handicap_index)
VALUES ('Dev', 'Tester', 10.0)
ON CONFLICT DO NOTHING;
```

### Option 3: Sign in with test@golfhelm.com

If you already created the account:
1. Go to: `http://localhost:3000/golf/login`
2. Email: `test@golfhelm.com`
3. Password: `TestGolf123!`
4. Then use dev mode

---

## Why This Happens

- Supabase RLS requires authentication to insert/update data
- Dev mode tries to bypass auth, but RLS still blocks it
- We need at least one player in the database to work with

## After Setup

Once you have a player in the database, dev mode will:
- ✅ Auto-detect and use existing players
- ✅ Work without authentication
- ✅ Let you create rounds and track shots freely

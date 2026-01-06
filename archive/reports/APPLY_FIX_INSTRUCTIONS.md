# 🔧 How to Apply the Golf Signup Fix

## Quick Instructions (2 minutes)

### Step 1: Copy the SQL

Open the file: **`fix_golf_signup_trigger.sql`**

Or copy this SQL:

```sql
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
SECURITY DEFINER
SET search_path = public, auth
LANGUAGE plpgsql
AS $$
DECLARE
  user_role text;
  user_sport text;
BEGIN
  user_role := COALESCE(NEW.raw_user_meta_data->>'role', 'player');
  user_sport := COALESCE(NEW.raw_user_meta_data->>'sport', 'baseball');

  INSERT INTO public.users (id, email, role, created_at, updated_at)
  VALUES (
    NEW.id,
    NEW.email,
    user_role::user_role,
    NOW(),
    NOW()
  )
  ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    updated_at = NOW();

  IF user_sport = 'baseball' THEN
    IF user_role = 'player' THEN
      INSERT INTO public.players (user_id, player_type, first_name, last_name, created_at, updated_at)
      VALUES (
        NEW.id,
        'high_school',
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;
    ELSIF user_role = 'coach' THEN
      INSERT INTO public.coaches (user_id, coach_type, full_name, created_at, updated_at)
      VALUES (
        NEW.id,
        'college',
        CONCAT(
          COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
          ' ',
          COALESCE(NEW.raw_user_meta_data->>'last_name', '')
        ),
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  ELSIF user_sport = 'golf' THEN
    IF user_role = 'player' THEN
      INSERT INTO public.golf_players (
        user_id,
        first_name,
        last_name,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
        COALESCE(NEW.raw_user_meta_data->>'last_name', ''),
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;
    ELSIF user_role = 'coach' THEN
      INSERT INTO public.golf_coaches (
        user_id,
        full_name,
        created_at,
        updated_at
      )
      VALUES (
        NEW.id,
        CONCAT(
          COALESCE(NEW.raw_user_meta_data->>'first_name', ''),
          ' ',
          COALESCE(NEW.raw_user_meta_data->>'last_name', '')
        ),
        NOW(),
        NOW()
      )
      ON CONFLICT (user_id) DO NOTHING;
    END IF;
  END IF;

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE WARNING 'handle_new_user error: %', SQLERRM;
    RETURN NEW;
END;
$$;
```

### Step 2: Go to Supabase Dashboard

1. Open: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc
2. Click **SQL Editor** in the left sidebar
3. Click **New Query**

### Step 3: Paste and Run

1. Paste the SQL from Step 1
2. Click **Run** (or press Cmd/Ctrl + Enter)
3. You should see: ✅ "Success. No rows returned"

### Step 4: Verify

Test the signup flows:

**Golf Player:**
- Go to: http://localhost:3001/golf/signup
- Fill form: Role = Player, First = "Test", Last = "Player"
- Submit and check if it works

**Golf Coach:**
- Go to: http://localhost:3001/golf/signup
- Fill form: Role = Coach, First = "Test", Last = "Coach"
- Submit and check if it works

---

## What This Fix Does

**Before:**
- Golf signups fail silently (user created in auth, but no profile)

**After:**
- Golf player signup creates profile with first_name and last_name ✅
- Golf coach signup creates profile with full_name ✅
- Baseball signups continue to work ✅

---

## Alternative: Using psql (If you have it configured)

```bash
cat fix_golf_signup_trigger.sql | psql "YOUR_DATABASE_URL"
```

---

**Questions?** Check the full analysis in `AUTH_FLOW_BUG_REPORT.md`

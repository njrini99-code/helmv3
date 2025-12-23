# Fix Supabase Signup RLS Error - Application Instructions

## Problem
Signup was failing with: "new row violates row-level security policy for table users"

## Solution Applied
✅ Updated signup pages to use UPDATE instead of INSERT for users table
✅ Created database migration with automatic user profile trigger
✅ **MIGRATION APPLIED** - Successfully pushed to remote Supabase database on 2024-12-22

---

## ✅ MIGRATION COMPLETED

The database migration has been successfully applied to your remote Supabase database using `supabase db push`.

**What was created:**
- ✅ Trigger function `handle_new_user()`
- ✅ Database trigger `on_auth_user_created` on auth.users table
- ✅ RLS policy "Users can read own profile"
- ✅ RLS policy "Users can update own profile"

### Step 1: Open Supabase SQL Editor

1. Go to: https://supabase.com/dashboard/project/dgvlnelygibgrrjehbyc
2. Click **SQL Editor** in the left sidebar
3. Click **New query**

### Step 2: Run the Migration

Copy and paste the **ENTIRE** contents of this file:
`supabase/migrations/20241222_fix_user_signup_trigger.sql`

Then click **Run** (or press Cmd+Enter)

### Step 3: Verify

You should see:
```
Success. No rows returned
```

---

## How It Works Now

### Old Flow (Broken ❌)
```
1. Create auth user with supabase.auth.signUp()
2. Try to INSERT into users table ← FAILS with RLS error
3. Never gets to create coach/player profile
```

### New Flow (Fixed ✅)
```
1. Create auth user with supabase.auth.signUp()
   → Database trigger automatically creates users row
2. UPDATE users table to set role field
3. Create coach/player profile
4. Redirect to dashboard
```

### What the Trigger Does

When someone signs up via Supabase Auth:
1. Supabase creates a row in `auth.users`
2. Our trigger (`on_auth_user_created`) fires automatically
3. Trigger creates a matching row in `public.users` with `id` and `email`
4. Signup flow then updates that row to set the `role` field

---

## RLS Policies Added

The migration also creates these policies:

1. **Users can read own profile**
   - Allows users to SELECT their own row

2. **Users can update own profile**
   - Allows users to UPDATE their own row (needed for setting role)

---

## Testing After Migration

1. Go to http://localhost:3000/baseball/signup
2. Try creating a test account
3. Should complete successfully and redirect to dashboard

Test with:
- Email: `test@example.com`
- Password: `test123`
- Any coach/player type

---

## Troubleshooting

### If signup still fails after running migration:

1. **Check if trigger exists:**
   ```sql
   SELECT * FROM pg_trigger WHERE tgname = 'on_auth_user_created';
   ```

2. **Check if function exists:**
   ```sql
   SELECT proname FROM pg_proc WHERE proname = 'handle_new_user';
   ```

3. **Manually test trigger:**
   ```sql
   -- This should create both auth.users AND public.users rows
   INSERT INTO auth.users (email, encrypted_password)
   VALUES ('test@test.com', crypt('password', gen_salt('bf')));

   -- Check if users row was created
   SELECT * FROM public.users WHERE email = 'test@test.com';
   ```

4. **Check RLS policies:**
   ```sql
   SELECT * FROM pg_policies WHERE tablename = 'users';
   ```

---

## Files Modified

✅ `/src/app/baseball/(auth)/signup/page.tsx` - Updated to use UPDATE
✅ `/src/app/golf/(auth)/signup/page.tsx` - Updated to use UPDATE
✅ `/supabase/migrations/20241222_fix_user_signup_trigger.sql` - Migration file created

---

## Next Steps

1. ✅ ~~Apply the migration in Supabase SQL Editor~~ **DONE**
2. 🔄 **TEST signup flow for both baseball and golf** (see SIGNUP_TEST_GUIDE.md)
3. 🔄 Verify dashboard redirects work correctly

The migration has been applied - signup should now work perfectly! 🎉

**Ready to test**: See [SIGNUP_TEST_GUIDE.md](./SIGNUP_TEST_GUIDE.md) for comprehensive testing instructions.

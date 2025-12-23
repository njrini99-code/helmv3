# Signup Testing Guide

## ✅ Migration Applied Successfully

The database trigger and RLS policies have been applied to your remote Supabase database.

---

## How to Test Signup

### 1. Start Dev Server

```bash
npm run dev
```

### 2. Test Baseball Signup

**Navigate to**: http://localhost:3000

Click "Try BaseballHelm" → Sign Up

**Test all 8 user types:**

#### Coach Types:
1. **College Coach** → Select "College" → Fill out form
2. **High School Coach** → Select "High School" → Fill out form
3. **JUCO Coach** → Select "JUCO" → Fill out form
4. **Showcase Coach** → Select "Showcase" → Fill out form

#### Player Types:
5. **HS Player** → Select "Player" → "High School" → Fill out form
6. **Showcase Player** → Select "Player" → "Showcase" → Fill out form
7. **JUCO Player** → Select "Player" → "JUCO" → Fill out form
8. **College Player** → Select "Player" → "College" → Fill out form

### 3. Test Golf Signup

**Navigate to**: http://localhost:3000

Click "Try GolfHelm" → Sign Up

**Test 1 user type:**

9. **Golf Coach** → Fill out form (auto-assigned as coach)

---

## What Should Happen

### ✅ Successful Signup Flow:

1. Fill out signup form → Click "Create account"
2. **Loading state** appears on button
3. **No RLS error** (previous error is fixed!)
4. Automatically redirected to appropriate dashboard:
   - College Coach → `/baseball/dashboard`
   - HS Coach → `/baseball/dashboard`
   - JUCO Coach → `/baseball/dashboard`
   - Showcase Coach → `/baseball/dashboard`
   - Players → `/baseball/dashboard` (or `/golf/dashboard` for golf)
   - Golf Coach → `/golf/coach`

5. Dashboard loads with user's profile data

### ❌ If You See Errors:

**RLS Error**: "new row violates row-level security policy"
- This should NOT happen anymore
- If it does, check Supabase logs

**Database Error**: "relation does not exist"
- Check that tables exist in Supabase dashboard

**Auth Error**: "Email already in use"
- Use a different email or delete the user from Supabase Auth

---

## Behind the Scenes

When you sign up, here's what happens:

```
1. supabase.auth.signUp({ email, password })
   ✅ Creates auth.users row

2. Trigger fires automatically
   ✅ handle_new_user() creates public.users row

3. Signup page updates the role
   ✅ supabase.from('users').update({ role }).eq('id', userId)

4. Signup page creates coach/player profile
   ✅ supabase.from('coaches').insert() OR
   ✅ supabase.from('players').insert()

5. Redirect to dashboard
   ✅ router.push('/baseball/dashboard')
```

---

## Quick Test Commands

```bash
# Start dev server
npm run dev

# In another terminal - check for errors
npm run typecheck

# Check Supabase status (local)
supabase status
```

---

## Test Credentials Template

Use these patterns for testing:

```
Email: test-college-coach@example.com
Password: test123456

Email: test-hs-player@example.com
Password: test123456

# etc...
```

---

## Success Criteria

- ✅ All 9 user types can sign up without errors
- ✅ Each redirects to correct dashboard
- ✅ User data appears in Supabase database
- ✅ No console errors in browser
- ✅ No TypeScript errors

---

## If Everything Works

**The signup flow is production-ready!** You can now:

1. Deploy to Vercel
2. Test on production URL
3. Invite real users to sign up

**Next recommended steps:**
- Test login flow
- Test dashboard features for each user type
- Test team join links
- Test video upload (if implemented)

---

**Generated:** 2024-12-22

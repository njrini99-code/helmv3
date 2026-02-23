# Review Scope

## Target

The complete Baseball sign up → onboarding → dashboard redirect flow in Helm Sports Labs. This covers:
- User authentication (signup, login, complete-signup, auth callback)
- Coach onboarding (coach-onboarding page, hooks)
- Player onboarding
- Dashboard layout redirect logic (coach-dashboard, player-dashboard, generic dashboard)
- Middleware (auth routing)
- Auth server actions

## Files

### Auth Pages
- `src/app/baseball/(auth)/signup/page.tsx`
- `src/app/baseball/(auth)/login/page.tsx`
- `src/app/baseball/(auth)/complete-signup/page.tsx`
- `src/app/baseball/(auth)/complete-signup/CompleteSignupClient.tsx`
- `src/app/baseball/(auth)/forgot-password/page.tsx`
- `src/app/baseball/(auth)/reset-password/page.tsx`

### Auth Components
- `src/components/auth/baseball-sign-up-form.tsx`
- `src/components/auth/baseball-sign-in-form.tsx`

### Auth Actions & Callback
- `src/app/baseball/actions/auth.ts`
- `src/app/auth/callback/route.ts`

### Onboarding Pages
- `src/app/baseball/(onboarding)/coach-onboarding/page.tsx`
- `src/app/baseball/(onboarding)/coach-onboarding/hooks/useOnboardingFlow.ts`
- `src/app/baseball/(onboarding)/coach/page.tsx`
- `src/app/baseball/(onboarding)/player/page.tsx`
- `src/app/baseball/(onboarding)/player/layout.tsx`

### Dashboard Layouts (Redirect Logic)
- `src/app/baseball/(dashboard)/layout.tsx`
- `src/app/baseball/(coach-dashboard)/coach/layout.tsx`
- `src/app/baseball/(player-dashboard)/player/layout.tsx`

### Middleware
- `middleware.ts`
- `src/lib/supabase/middleware.ts`

## Flags

- Security Focus: no
- Performance Critical: no
- Strict Mode: no
- Framework: Next.js (App Router)

## Review Phases

1. Code Quality & Architecture
2. Security & Performance
3. Testing & Documentation
4. Best Practices & Standards
5. Consolidated Report

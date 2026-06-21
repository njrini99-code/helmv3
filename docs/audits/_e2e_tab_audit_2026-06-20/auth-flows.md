## Auth (login/signup/forgot/reset/demo) [both]

End-to-end audit of the GolfHelm auth surface: login, signup (access-gated), forgot-password,
reset-password, and the public demo gate. Both coach and player code paths traced. Date: 2026-06-20.

---

### End-to-end wiring (actual)

**Login** — `src/app/golf/(auth)/login/page.tsx`
- `LoginContent` (client) mounts a Supabase browser client and, on mount, calls `supabase.auth.getUser()`
  (line 56). If already authed it reads `users.role` (line 58), computes `dest` with `isSafeInternalPath(returnTo)`
  guard (line 62), and `router.replace('/golf/welcome?next=<dest>')` (line 63).
- The form is `GolfSignInForm` (`src/components/auth/golf-sign-in-form.tsx`). On submit it calls the
  `loginAction` server action (`src/app/golf/actions/auth.ts:49`) with `(email, password, storedRef)`.
- `loginAction`: lockout check → email/IP rate limits → `signInWithPassword` → on success resets counters,
  fire-and-forget `logLogin` + demo trace, then reads `users.role` + `golf_coaches`/`golf_players`
  (`id, onboarding_completed`) to compute `redirectTo` (`/golf/admin` for admin, `/golf/coach` or
  `/golf/player` if onboarding incomplete, else `/golf/dashboard`). `revalidatePath('/golf/dashboard')`.
- Back in the form: `router.refresh()` → 100ms wait → reads `golf_login_returnTo` from sessionStorage,
  validates with local `isValidReturnTo`, and `router.push('/golf/welcome?next=<dest>')` (or straight to
  onboarding path if `needsOnboarding`).
- Welcome (`src/app/golf/(auth)/welcome/page.tsx`) re-resolves identity (getUser + `users.role` + coach/player
  name), validates `next` with `isSafeInternalPath`, plays the greeting animation, then navigates to
  `destRef` via `useSequencedNavigation` (with a 6s `window.location` failsafe).
- Role-gate enforcement is in the dashboard layout (`src/app/golf/(dashboard)/layout.tsx`):
  `getGolfSessionProfile()` → redirect `/golf/login` if no session; resolves role from profile presence;
  redirects to `/golf/coach` or `/golf/player` if onboarding incomplete. Middleware
  (`src/lib/supabase/middleware.ts:205`) redirects unauthenticated `/golf/dashboard*` requests to
  `/golf/login?returnTo=<path>`. Golf role-authorization is intentionally NOT done in middleware
  (line 214-216 comment: "golf handles auth in its own layout").

**Signup** — `src/app/golf/(auth)/signup/page.tsx`
- Two-stage: access-code gate → `GolfSignUpForm`. Gate submit calls `validateAccessCode`
  (`src/app/golf/actions/access-code.ts`), which accepts `SIGNUP_ACCESS_CODE` (default `1881`) OR any real
  `golf_teams.join_code` (admin-client lookup, best-effort, returns false on any failure).
- Invite-link join codes are prefilled from `?joinCode`/`?code` or extracted from `returnTo=/golf/join/<CODE>`
  (lines 61-75) and forwarded to onboarding.
- `GolfSignUpForm` (`src/components/auth/golf-sign-up-form.tsx`) collects role (player/coach), names,
  grad year (players), email, password; client-validates age≥13 and password≥8; calls `signupAction`
  (`auth.ts:231`). On success: `router.refresh()` → 150ms wait → `router.push('/golf/coach'|'/golf/player')`
  (player carries `?joinCode` when present). Always routes to onboarding (never returnTo) after signup.
- `signupAction`: validates password via `validatePassword`, IP rate limit, `supabase.auth.signUp` with
  metadata `{role, sport:'golf', first_name, last_name}`; maps duplicate/weak/rate-limit errors to friendly
  messages; requires `data.session` else returns "session could not be established"; `logSignup`.

**Forgot password** — `src/app/golf/(auth)/forgot-password/page.tsx`
- Client-only. Calls `supabase.auth.resetPasswordForEmail(email, { redirectTo: `${origin}/golf/reset-password` })`
  DIRECTLY (line 28). Shows success card on no-error, surfaces `resetError.message` on error.

**Reset password** — `src/app/golf/(auth)/reset-password/page.tsx`
- Client-only. Validates match + length≥8, then `supabase.auth.updateUser({ password })` (line 42) and
  `router.push('/golf/login?message=password_reset')`. Relies on the browser client's implicit
  recovery-session establishment from the link (no explicit `exchangeCodeForSession` / `verifyOtp`).

**Demo gate** — `src/app/golf/(auth)/demo/page.tsx` + `src/app/golf/actions/demo-access.ts`
- Public identity form (name/email/school). Already-authed visitors get a "Continue to dashboard" shortcut
  (`router.push(DEMO_LANDING_PATH)`). On submit calls `enterDemo` (server action).
- `enterDemo` (INTENTIONALLY public, documented): validates input → IP rate limit (`DEMO_GATE`: 5/5min) →
  reads `getDemoCoachCredentials()` (env `DEMO_COACH_EMAIL`/`DEMO_COACH_PASSWORD`) → inserts a
  `golf_demo_sessions` row via admin client (best-effort) → `signInWithPassword(creds)` on the shared
  account → `logLogin` → `redirect('/golf/dashboard?demo=1')`.
- The `?demo=1` PostHog client event is fired by `DemoEnterTracker` (`src/components/demo/DemoEnterTracker.tsx`),
  which is mounted ONLY in `GolfDashboardShell` (legacy), NOT in `FairwayDashboardShell`.

---

### Expected vs actual

There is no dedicated "Auth + demo gate" section in `memory/context/golfhelm-features.md` (it documents the 28
dashboard features; auth is described only incidentally — e.g. Player Hub step "Check authentication (redirect
to login if needed)", Admin "Failed logins & locked accounts"). So spec comparison is against the documented
project rules in CLAUDE.md / the demo project-memory notes rather than a feature doc section.

- Routing: matches CLAUDE.md coach/player ownership — coaches → `/golf/coach` onboarding then `/golf/dashboard`;
  players → `/golf/player`; admin → `/golf/admin`. Correct.
- Demo: matches the documented shared-account design (`demo@golfhelmdemo.com`, Demo University Golf, server-side
  sign-in via gate). Correct in shape.
- DIVERGENCE (demo telemetry): project memory states the redesign (Fairway shell) is LIVE on prod. With
  `NEXT_PUBLIC_REDESIGN` truthy, the dashboard renders `FairwayDashboardShell`, which does not mount
  `DemoEnterTracker`, so the client `demo_coach_entered` event never fires on prod. The gate's `enterDemo`
  has no server-side PostHog capture (only the comment "posthog capture handled client-side via ?demo=1"),
  so demo-entry analytics are silently lost in the live configuration.
- DIVERGENCE (forgot-password): a dedicated `requestPasswordResetAction` exists in `auth.ts` with rate-limiting
  and email-enumeration protection (generic response), but the page does not use it — it calls the client SDK
  directly, losing both protections and leaking SDK error text.

---

### Findings

| Severity | Category | file:line | Issue | Impact | Fix |
|---|---|---|---|---|---|
| HIGH | broken-wiring | src/app/golf/(dashboard)/GolfDashboardShell.tsx:288 / FairwayDashboardShell (absent) | `DemoEnterTracker` (the `?demo=1` → `demo_coach_entered` PostHog capture) is mounted only in the legacy shell; the Fairway shell never mounts it. Prod runs the Fairway shell (redesign LIVE). | Every gate-driven demo entry on prod fires NO client analytics event; demo funnel is blind. `enterDemo` has no server-side capture to compensate. | Mount `<DemoEnterTracker />` in `FairwayDashboardShell` too (or add a server-side `captureServer(DEMO_ENTER_EVENT, …)` inside `enterDemo` before redirect). |
| MEDIUM | broken-wiring | src/app/golf/(auth)/forgot-password/page.tsx:28-33 | Page calls `supabase.auth.resetPasswordForEmail` directly instead of the existing `requestPasswordResetAction` server action. | Bypasses the per-email rate limit (`RATE_LIMITS.PASSWORD_RESET`) and the email-enumeration-safe generic response; raw `resetError.message` is shown to the user. `requestPasswordResetAction` is effectively dead code. | Call `requestPasswordResetAction(email)` from the page; render its generic `message`. |
| MEDIUM | correctness | src/app/golf/(auth)/reset-password/page.tsx:42 | `updateUser({ password })` is called with no explicit recovery-session establishment; the forgot-password link points straight at `/golf/reset-password` (not `/auth/callback`), and the browser client has no explicit `flowType`/`detectSessionInUrl`/`exchangeCodeForSession` handling. | If the Supabase project is on the PKCE flow (default for `@supabase/ssr`), a `?code=` lands on the page and must be exchanged before `updateUser` has a session; if implicit auto-detect does not fire first, the reset fails with "Auth session missing". Needs live verification. | Verify reset E2E on prod; if it fails, add an `exchangeCodeForSession` (or route the link through `/auth/callback?next=/golf/reset-password`) before allowing `updateUser`, and handle the no-session case with a clear "link expired" state. |
| LOW | role-leak | src/app/golf/(auth)/login/page.tsx:214 | The already-signed-in "Continue" button uses raw `returnTo` (`router.push(returnTo || …)`) WITHOUT `isSafeInternalPath`, unlike the auth-effect path on line 62 which guards it. | A crafted `?returnTo=` could push to an unintended internal path on the Continue button (open-redirect surface is limited to same-origin client navigation, so low risk). | Reuse `isSafeInternalPath(returnTo)` for the Continue button destination, mirroring line 62. |
| LOW | revalidation | src/app/golf/actions/auth.ts:344-354 | `signupAction` performs auth mutations (signUp + session) but does not `revalidatePath` (unlike `loginAction` which revalidates `/golf/dashboard`). | After signup the new session may not be reflected in the Next.js router cache until the form's manual `router.refresh()`; relies entirely on the client 150ms timing hack. | Add `revalidatePath('/golf/dashboard')` (and/or the onboarding path) in `signupAction` on success. |
| INFO | type-mismatch | src/app/golf/actions/demo-access.ts:127-139 | `golf_demo_sessions` is now present in `database.ts` (line 6464), but the action still casts through `as unknown as { from: (table: string) => any }` with a stale "isn't in the generated type until migration lands" comment. | No runtime impact; loses type-safety on the insert and the comment is now false. | Drop the cast and insert with the generated typed client. |
| INFO | correctness | src/app/golf/(auth)/signup/page.tsx:80-87 | The access gate validates the code but does NOT confirm the typed code is the team the player intends; any valid team join code (or the global code) unlocks signup, and the typed code is carried to onboarding as `joinCode`. This is by design (documented in access-code.ts) — noted for completeness, not a defect. | None — intended behavior. | None. |

---

### Coverage notes

- All five page files, both auth forms, the `auth.ts`/`access-code.ts`/`demo-access.ts` actions, session
  resolution (`getGolfSessionProfile`), the dashboard layout role-gate, the middleware, the welcome page, the
  `/auth/callback` route, and the demo config were read in full.
- Could not confirm at runtime: (1) whether reset-password's implicit recovery-session establishment actually
  works on prod (depends on the Supabase project flow setting) — MEDIUM finding flagged `needsLiveVerify`;
  (2) whether the demo coach account on prod is fully onboarded so the gate lands on the dashboard rather than
  being bounced to `/golf/coach` (prod-data dependent; per project memory the demo team is fully populated);
  (3) whether `NEXT_PUBLIC_REDESIGN` is truthy in the live Vercel env (project memory says the Fairway shell
  is LIVE, which is the basis for the HIGH demo-tracker finding).

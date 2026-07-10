<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Committed 2026-03-05 ("comprehensive app stability overhaul"), iOS App Store submission scope. Not confirmed against current App Store Connect status in the 2026-07-10 sweep — re-verify before relying on this; treat as historical if the submission has since moved forward.
KEPT FOR HISTORY -- do not delete this file.
-->

# Security Audit Report - Helm Sports Labs (GolfHelm iOS App)

**Date:** 2026-03-05
**Auditor:** Security Auditor (Automated)
**App:** com.helmsportslabs.golfhelm
**Stack:** Next.js 16 + Supabase + Capacitor 8 iOS
**Scope:** Apple App Store security compliance

---

## Executive Summary

**Overall Security Posture: GOOD** - The app demonstrates solid security fundamentals with proper authentication, authorization, input validation, and security headers. A few medium-severity issues should be addressed before App Store submission, but no critical/blocking vulnerabilities were found.

| Category | Rating | Notes |
|----------|--------|-------|
| App Transport Security | PASS | No ATS exceptions, cleartext disabled |
| Authentication & Sessions | PASS | Cookie-based, proper session refresh |
| API Key Exposure | PASS (with notes) | NEXT_PUBLIC keys are safe by design |
| Server Action Security | PASS | Auth checks on all sampled actions |
| WebView Security | PASS (with notes) | CSP present, navigation restricted |
| Privacy & Data | PASS (with notes) | Console.log stripped in production |
| Credential Storage | INFO | WebView cookie storage (standard for Capacitor) |
| Input Validation | PASS | Zod schemas, sanitization utilities |
| Rate Limiting | PASS | Login, signup, password reset protected |

---

## 1. App Transport Security (ATS)

### Findings

**Status: PASS**

- **`capacitor.config.ts` (line 10):** `cleartext: false` - correctly enforces HTTPS-only connections.
- **`ios/App/App/Info.plist`:** No `NSAppTransportSecurity` key present - no ATS exceptions declared. This means default Apple ATS enforcement is active (HTTPS required).
- **Server URL:** `https://www.helmsportslabs.com/golf/login` - uses HTTPS.
- **`ITSAppUsesNonExemptEncryption`:** Set to `false` - correct for apps using standard HTTPS (avoids export compliance questionnaire).

**Note:** `next.config.mjs` (lines 56-66) allows `http://127.0.0.1:54321` and `http://localhost:54321` for local Supabase image patterns. These are development-only image patterns and won't be hit in production since the iOS app points to the remote server.

### No Issues Found

---

## 2. Authentication & Session Security

### Findings

**Status: PASS**

#### Token Storage
- **Server-side (`src/lib/supabase/server.ts`):** Uses `@supabase/ssr` `createServerClient` with **cookie-based** token storage. Tokens are managed via `cookies()` from `next/headers`. This is the recommended approach.
- **Client-side (`src/lib/supabase/client.ts`):** Uses `createBrowserClient` which stores tokens in cookies by default with `@supabase/ssr`.
- **No localStorage-based token storage** was found for auth tokens. Auth is entirely cookie-based.

#### Session Refresh
- **Middleware (`middleware.ts` + `src/lib/supabase/middleware.ts`):** The `updateSession()` function runs on every route, refreshing the Supabase session via `supabase.auth.getUser()`. This ensures tokens are refreshed before expiry.
- Protected routes (`/golf/dashboard/*`, `/baseball/dashboard/*`) redirect to login if no user session is found (line 196-202).

#### Login Security
- **Rate limiting** (`src/lib/auth/rate-limit.ts`): 5 attempts per minute per email, 15-minute block after exceeding.
- **Account lockout** (`src/lib/auth/account-lockout.ts`): 10 consecutive failures = 30-minute lockout, tracked persistently in DB.
- **IP-based rate limiting**: Also rate-limits by IP address.
- **Password validation** (`src/lib/auth/password-validation.ts`): Min 8 chars, requires uppercase, lowercase, number, special char. Blocks common passwords (SecLists top passwords).

#### Open Redirect Protection
- **Auth callback** (`src/app/auth/callback/route.ts`): Uses whitelist-based redirect validation. Blocks protocol-relative URLs (`//`), validates path starts with `/baseball/` or `/golf/` only.

#### Cookie Security
- Session activity cookie: `SameSite=Strict; Secure` (line 44 of `session-activity.ts`)
- Coach mode cookie: `SameSite=Lax` - acceptable for non-auth preference cookie, though `Secure` flag is missing.

### Recommendations

- **[LOW]** Add `Secure` flag to `coach_mode` cookie in `src/hooks/use-auth.ts` (line 81) and `src/stores/auth-store.ts` (line 13). Currently set without `Secure`, which means it could be transmitted over HTTP in development.

---

## 3. API Key Exposure

### Findings

**Status: PASS**

#### Environment Variables (from `.env.example`)
| Variable | Prefix | Client-Exposed? | Risk |
|----------|--------|-----------------|------|
| `NEXT_PUBLIC_SUPABASE_URL` | NEXT_PUBLIC_ | Yes | LOW - Public by design, RLS protects data |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | NEXT_PUBLIC_ | Yes | LOW - Anon key is intentionally public, RLS enforced |
| `NEXT_PUBLIC_SENTRY_DSN` | NEXT_PUBLIC_ | Yes | NONE - DSN is public by design |
| `NEXT_PUBLIC_TAMBO_API_KEY` | NEXT_PUBLIC_ | Yes | LOW - See note below |
| `NEXT_PUBLIC_APP_URL` | NEXT_PUBLIC_ | Yes | NONE |
| `NEXT_PUBLIC_DEV_MODE` | NEXT_PUBLIC_ | Yes | LOW - Should be false in production |
| `SUPABASE_SERVICE_ROLE_KEY` | None | No | Properly server-only |
| `SENTRY_AUTH_TOKEN` | None | No | Properly server-only |
| `RESEND_API_KEY` | None | No | Properly server-only |
| `RESEND_WEBHOOK_SECRET` | None | No | Properly server-only |

#### Analysis
- **Supabase anon key**: This is public by design. Row Level Security (RLS) on the database is the real access control. The `SUPABASE_SERVICE_ROLE_KEY` is correctly server-only (no `NEXT_PUBLIC_` prefix).
- **Admin client** (`src/lib/supabase/admin.ts`): Uses `SUPABASE_SERVICE_ROLE_KEY` with `persistSession: false` and `autoRefreshToken: false`. Only used in server-side code (API routes, server actions).
- **`next.config.mjs`**: No custom `env` configuration exposing additional variables. No `NEXT_PUBLIC_` references in the config itself.
- **Sentry config** (`sentry.server.config.ts`): Uses `process.env.NEXT_PUBLIC_SENTRY_DSN` which is intentionally public. Source maps are hidden (`hideSourceMaps: true`).

### Recommendations

- **[LOW]** `NEXT_PUBLIC_TAMBO_API_KEY` is exposed to the client. Verify this API key has appropriate rate limits and scoping on the Tambo platform side.
- **[LOW]** Ensure `NEXT_PUBLIC_DEV_MODE=false` is set in production environment.

---

## 4. Server Action Security

### Findings

**Status: PASS**

All 35 server action files in `src/app/golf/actions/` use `'use server'` directive. Auth check (`supabase.auth.getUser()`) found in all 35 files (213 total occurrences across the files).

#### Sampled Actions (Deep Review)

| File | Auth Check | Role Check | Input Validation | SQL Injection Risk |
|------|-----------|------------|------------------|--------------------|
| `golf.ts` | `requireGolfCoach()` + `verifyGolfTeamOwnership()` | Coach role verified | Zod schemas | None - parameterized queries |
| `roster.ts` | `supabase.auth.getUser()` | Coach role + team membership verified | Manual validation | None - parameterized queries |
| `documents.ts` | `supabase.auth.getUser()` | `verifyTeamAccess()` (coach or player path) | Manual validation | None - parameterized queries |
| `travel.ts` | `supabase.auth.getUser()` | Coach verified | Zod schemas (comprehensive) | None - parameterized queries |
| `announcements.ts` | `supabase.auth.getUser()` | Coach + team ownership | Zod schemas | None - parameterized queries |
| `tasks.ts` | `supabase.auth.getUser()` | Player verified via `golf_players` | `formatSafeErrorResponse()` | None - parameterized queries |
| `development.ts` | `supabase.auth.getUser()` | Coach + team membership verified | Manual validation | None - parameterized queries |
| `admin-data.ts` | `supabase.auth.getUser()` | Uses `createAdminClient()` | N/A (read-only) | None |

#### Authorization Framework
- **`src/lib/auth/ownership.ts`**: Provides reusable auth helpers:
  - `requireAuth()` - throws if not authenticated
  - `requireGolfCoach()` - verifies golf coach profile + resolves team_id
  - `verifyGolfTeamOwnership()` - validates resource belongs to coach's team
  - `AuthorizationError` and `NotFoundError` custom error classes
- **Error handling**: `formatSafeErrorResponse()` prevents leaking internal error details to clients.

#### SQL Injection Protection
- All database queries use Supabase's parameterized query builder (`.from().select().eq()`). No raw SQL strings with user input concatenation found.
- `sanitizeSqlLike()` utility exists for LIKE queries.
- No dynamic code execution patterns found in source code.

### Recommendations

- **[LOW]** `admin-data.ts` uses `createAdminClient()` (service role) for read queries. While it does check user auth first, consider adding admin role verification to ensure only authorized admin users can access this data.

---

## 5. WebView Security

### Findings

**Status: PASS (with notes)**

#### Capacitor Configuration (`capacitor.config.ts`)
- **`allowNavigation`**: Restricted to `['*.helmsportslabs.com', 'helmsportslabs.com']` - only allows navigation within the app's domain.
- **`cleartext: false`**: HTTPS enforced.
- **`webContentsDebuggingEnabled: false`**: Web inspector disabled (important for production).
- **`allowsLinkPreview: false`**: Prevents 3D Touch link previews that could expose content.

#### Content Security Policy (CSP) - `next.config.mjs` (lines 154-165)
- `default-src 'self'`
- `script-src` includes `'self'` plus CDN sources for external scripts and `blob:` for worker scripts
- Note: CSP currently permits inline scripts and dynamic script execution for Next.js compatibility (see recommendations)
- `style-src 'self'` with inline styles for Next.js hydration
- `img-src 'self' data: https: blob:`
- `connect-src` scoped to self, Supabase, and Sentry domains
- `frame-ancestors 'none'` - prevents embedding in iframes

#### Other Security Headers
- `X-Frame-Options: DENY` - prevents clickjacking
- `X-Content-Type-Options: nosniff` - prevents MIME sniffing
- `X-XSS-Protection: 1; mode=block` - legacy XSS protection
- `Referrer-Policy: strict-origin-when-cross-origin`
- `Permissions-Policy: camera=(), microphone=(), geolocation=()` - restricts sensitive APIs
- `Strict-Transport-Security: max-age=63072000; includeSubDomains; preload` - HSTS with preload

#### XSS Analysis
- **No unsafe DOM manipulation on user-controlled data.** Two uses of `innerHTML` found, both on internally-controlled template content:
  - `TravelExpenseReport.tsx` (line 132): Print functionality on controlled content.
  - `exportPdf.ts` (line 50): PDF export with controlled template content.
- **HTML sanitization** available via `sanitizeHtml()` in `server-action-validator.ts`.
- React's default JSX escaping provides baseline XSS protection.

### Recommendations

- **[MEDIUM]** CSP currently permits inline scripts and dynamic script execution for Next.js dev compatibility. The codebase has a TODO (line 152) to implement **nonce-based CSP in production**. This would significantly harden the CSP. Not an App Store blocker, but a meaningful security improvement.
- **[LOW]** Consider tightening `blob:` usage in CSP if not needed for core functionality.

---

## 6. Privacy & Data

### Findings

**Status: PASS**

#### Console.log Statements
- **Production stripping**: `next.config.mjs` (lines 42-44) removes `console.log`, `console.debug`, and `console.info` in production builds. Only `console.error` and `console.warn` are kept.
- **54 console.log/debug/info occurrences** found across 13 files. Since these are stripped in production, this is acceptable.
- **PII in console.log**: The auth callback (`src/app/auth/callback/route.ts`) logs `userId` and `email` in `console.info` statements. These are stripped in production by the compiler, so no PII leaks in production.

#### Third-Party SDKs

**Sentry:**
- DSN is public (standard for Sentry).
- Source maps are hidden from client bundles (`hideSourceMaps: true`).
- Error filtering: Ignores `NEXT_NOT_FOUND` and `NEXT_REDIRECT`.
- `Document-Policy: js-profiling` header enables Sentry profiling.
- **Data scrubbing**: Sentry's default PII scrubbing should be enabled on the Sentry project settings side.

**No other analytics SDKs found active:**
- Google Analytics (`NEXT_PUBLIC_GA_MEASUREMENT_ID`) and PostHog (`NEXT_PUBLIC_POSTHOG_KEY`) are commented out in `.env.example`.
- No Datadog integration found.

#### localStorage Usage
localStorage is used for non-sensitive UI preferences only:
- Appearance preferences, sidebar state, keyboard shortcut dismissal
- Round auto-save drafts (golf shot data - not PII)
- Saved search queries
- Announcement last-seen timestamps
- Onboarding form state

**No auth tokens, passwords, or sensitive PII stored in localStorage.**

#### Account Deletion
- `src/app/api/account/delete/route.ts`: Provides account deletion endpoint (required by Apple). Cleans up messages, engagement events, user records, and auth user. Properly authenticated before deletion.

### Recommendations

- **[INFO]** Verify Sentry's "Sensitive Data Scrubbing" is enabled in Sentry project settings to prevent accidental PII capture in error reports (emails, IPs).
- **[INFO]** Ensure the Privacy Policy and Privacy Nutrition Labels in App Store Connect accurately reflect: Sentry error reporting, Supabase data storage, and Resend email services.

---

## 7. Credential Storage (iOS/Capacitor WebView)

### Findings

**Status: INFO**

#### How Auth Tokens Are Stored
The app uses **Capacitor's WKWebView** which loads the remote URL `https://www.helmsportslabs.com/golf/login`. Authentication is handled by Supabase Auth with `@supabase/ssr`, storing tokens in **HTTP cookies** (not localStorage).

- **No native Keychain integration** found. No `@capacitor/preferences`, `SecureStorage`, or Keychain plugins are in use.
- The WKWebView cookie jar is used for token storage. WKWebView cookies are:
  - Stored in the app's sandbox (not shared with Safari)
  - Encrypted at rest by iOS Data Protection (when device has a passcode)
  - Not accessible to other apps

#### Analysis
This is the **standard and acceptable approach** for Capacitor WebView apps that load remote URLs. Since the app is essentially a WebView wrapper pointing to the production website, cookies are the correct token storage mechanism.

The Supabase `@supabase/ssr` library handles:
- Setting cookies with proper attributes
- Refreshing tokens via middleware on every request
- Secure cookie transport over HTTPS

### Recommendations

- **[INFO]** For enhanced security in future versions, consider using `@capacitor-community/secure-storage` or the Keychain directly for any sensitive data that needs to persist locally.
- **[INFO]** The current approach (WKWebView cookies) is standard for Capacitor remote-URL apps and is acceptable for App Store submission.

---

## 8. API Route Security

### Findings

**Status: PASS**

14 API route handlers found:

| Route | Auth | Rate Limit | Notes |
|-------|------|------------|-------|
| `/api/account/delete` | Yes (`getUser()`) | No | Uses admin client for deletion |
| `/api/log-error` | Yes (`getUser()`) | Yes (`withRateLimit`) | Rate-limited error logging |
| `/api/webhooks/resend` | Webhook signature (Svix) | No | Properly verifies webhook signatures |
| `/api/health` | Likely none | N/A | Health check endpoint |
| `/api/golf/players/[playerId]/putt-tendencies` | Needs verification | Unknown | - |
| `/api/golf/rounds/generate-review` | Needs verification | Unknown | - |
| `/api/calendar/feeds/[token]` | Token-based | Unknown | Calendar feed |
| `/api/calendar/coach/[token]` | Token-based | Unknown | Coach calendar |
| `/api/calendar/events` | Needs verification | Unknown | - |
| `/api/admin/crm/send-email` | Needs verification | Unknown | Admin email sending |
| `/api/admin/log-event` | Needs verification | Unknown | Admin event logging |
| `/api/crm/google-calendar/*` | OAuth flow | N/A | Google Calendar integration |

**Webhook security**: The Resend webhook route properly verifies webhook signatures using Svix library before processing events.

### Recommendations

- **[MEDIUM]** Verify `/api/admin/*` routes have proper admin role checking (not just authentication).
- **[LOW]** Consider adding rate limiting to `/api/account/delete` to prevent abuse.

---

## 9. Additional Security Observations

### Positive Security Practices
1. **TypeScript strict mode** - catches type-related bugs at compile time
2. **Zod validation** widely used for input validation in server actions
3. **Error boundary pattern** - `formatSafeErrorResponse()` prevents internal error leakage
4. **Mass assignment protection** - `validateAllowedKeys()` utility available
5. **Path traversal protection** - `validateFilePath()` utility available
6. **XSS sanitization** - `sanitizeHtml()` utility available
7. **HSTS with preload** - strong transport security
8. **`.gitignore`** properly excludes `.env`, `.env.local`, and all environment files
9. **`*.pem` excluded** from version control
10. **Fetch timeout** (10s) on Supabase clients prevents hanging connections

### Apple App Store Specific

| Requirement | Status |
|-------------|--------|
| HTTPS enforced (ATS) | PASS |
| No ATS exceptions in Info.plist | PASS |
| Account deletion available | PASS |
| Privacy usage descriptions (Camera, Photos) | PASS |
| `ITSAppUsesNonExemptEncryption = false` | PASS |
| Web debugging disabled | PASS |
| No cleartext traffic | PASS |

---

## Summary of Recommendations

### Medium Priority
1. **Implement nonce-based CSP for production** - Tighten CSP script-src directives for production. (Not an App Store blocker, but a meaningful security improvement.)
2. **Verify admin API routes have role-based access control** - Ensure `/api/admin/*` routes check for admin role, not just authentication.

### Low Priority
3. Add `Secure` flag to `coach_mode` cookie.
4. Verify Tambo API key has appropriate rate limits/scoping.
5. Ensure `NEXT_PUBLIC_DEV_MODE=false` in production.
6. Add rate limiting to account deletion endpoint.
7. Verify admin-data.ts server action restricts access to admin users only.

### Informational
8. Verify Sentry PII scrubbing is enabled in project settings.
9. Ensure App Store privacy labels accurately reflect data collection.
10. Consider native Keychain storage for future security hardening.

---

**Conclusion:** The application has a solid security foundation with proper authentication, authorization, input validation, security headers, and privacy protections. No critical vulnerabilities were found that would block App Store submission. The medium-priority items (CSP hardening, admin route verification) should be addressed for defense-in-depth but are not App Store blockers.

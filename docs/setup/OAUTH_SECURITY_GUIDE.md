# OAuth Security Configuration Guide

## Overview

This document provides comprehensive security guidelines for configuring OAuth providers in Helm Sports Labs. OAuth authentication adds significant attack surface and must be configured with security-first practices.

---

## 1. Provider Configuration (Supabase Dashboard)

### 1.1 Google OAuth Configuration

**Navigate to:** Supabase Dashboard → Authentication → Providers → Google

**Required Settings:**

```yaml
Status: Enabled
Client ID: [From Google Cloud Console]
Client Secret: [From Google Cloud Console - Store securely]

Authorized Redirect URLs:
  Production:
    - https://helm.app/auth/callback
    - https://[your-project].supabase.co/auth/v1/callback

  Staging:
    - https://staging.helm.app/auth/callback

  Development:
    - http://localhost:3000/auth/callback
    - http://127.0.0.1:3000/auth/callback
```

**Security Settings:**

- ✅ **Enable Email Verification**: ON
- ✅ **Disable Signup**: OFF (Allow new users)
- ✅ **Confirm Email**: ON (Require email verification)
- ✅ **Secure Email Change**: ON (Require confirmation)
- ✅ **Email Link Validity**: 1 hour (Default: 24 hours)

### 1.2 Google Cloud Console Configuration

**OAuth Consent Screen:**

```yaml
Application Type: Public
Application Name: Helm Sports Labs
User Support Email: support@helm.app
Developer Contact Email: dev@helm.app

Scopes:
  - userinfo.email (Required)
  - userinfo.profile (Required)
  - openid (Required)

Authorized Domains:
  - helm.app
  - supabase.co
```

**OAuth 2.0 Client ID Configuration:**

```yaml
Application Type: Web Application
Name: Helm Sports Labs Production

Authorized JavaScript Origins:
  - https://helm.app
  - https://[your-project].supabase.co

Authorized Redirect URIs:
  - https://[your-project].supabase.co/auth/v1/callback
  - https://helm.app/auth/callback (for custom flows)

CRITICAL: Never include http:// URLs in production
```

---

## 2. Security Best Practices

### 2.1 Redirect URI Validation

**Current Implementation:** `/src/app/auth/callback/route.ts`

```typescript
// Whitelist approach (SECURE)
const ALLOWED_REDIRECTS = [
  '/baseball/dashboard',
  '/baseball/complete-signup',
  // ... other allowed paths
];

// Prefix-based validation (SECURE)
const allowedPrefixes = ['/baseball/', '/golf/'];
```

**Security Checks:**

- ✅ Whitelist exact paths
- ✅ Allow safe prefixes only
- ✅ Block protocol-relative URLs (`//evil.com`)
- ✅ Require paths to start with `/`
- ✅ Log all blocked attempts with IP/User-Agent

**DO NOT:**

- ❌ Accept arbitrary redirect parameters
- ❌ Allow external domains
- ❌ Trust URL query parameters without validation
- ❌ Use blacklist-based validation

### 2.2 State Parameter (CSRF Protection)

**Status:** ⚠️ NOT YET IMPLEMENTED

**Required Implementation:**

```typescript
// On OAuth initiation:
const state = crypto.randomUUID();
await supabase.auth.signInWithOAuth({
  provider: 'google',
  options: {
    redirectTo: `${origin}/auth/callback`,
    queryParams: {
      state: state,
    },
  },
});

// Store state in session/cookie
cookies().set('oauth_state', state, {
  httpOnly: true,
  secure: true,
  sameSite: 'lax',
  maxAge: 600, // 10 minutes
});

// On callback:
const receivedState = request.searchParams.get('state');
const storedState = cookies().get('oauth_state');

if (receivedState !== storedState) {
  throw new Error('Invalid state - possible CSRF attack');
}
```

**Why This Matters:**

- Prevents CSRF attacks where attacker initiates OAuth on victim's behalf
- Ensures OAuth callback matches the original request
- OWASP Top 10 protection

### 2.3 Rate Limiting

**Status:** ⚠️ NOT YET IMPLEMENTED

**Required Implementation:**

```typescript
import { checkRateLimit, RATE_LIMITS } from '@/lib/auth/rate-limit';

export async function GET(request: NextRequest) {
  const ip = request.headers.get('x-forwarded-for') || 'unknown';

  // Rate limit OAuth callbacks to prevent abuse
  const rateLimit = checkRateLimit(
    `oauth_callback:ip:${ip}`,
    {
      maxAttempts: 10, // 10 callbacks per hour per IP
      windowMs: 60 * 60 * 1000,
    }
  );

  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many authentication attempts' },
      { status: 429 }
    );
  }

  // ... rest of callback logic
}
```

**Why This Matters:**

- Prevents brute force attacks via OAuth callback
- Mitigates account enumeration
- Protects against DoS via callback spamming

### 2.4 Token Handling

**Current Status:** ✅ SECURE (Handled by Supabase)

**Supabase Automatically:**

- ✅ Stores tokens in httpOnly cookies
- ✅ Implements token rotation
- ✅ Sets secure and sameSite flags
- ✅ Handles token refresh automatically

**Developer Responsibilities:**

- ❌ NEVER access tokens directly in client code
- ❌ NEVER store tokens in localStorage
- ❌ NEVER send tokens in URL parameters
- ✅ ALWAYS use Supabase client methods
- ✅ ALWAYS check session server-side

### 2.5 Email Verification

**Required Configuration:**

```sql
-- Enable email verification requirement
UPDATE auth.config
SET enable_signup = true,
    confirm_email = true,
    secure_email_change_enabled = true;

-- Set email link validity
UPDATE auth.config
SET email_link_validity = 3600; -- 1 hour (default: 86400 = 24 hours)
```

**Post-OAuth Signup Flow:**

1. User signs in with Google
2. OAuth callback creates user record
3. User receives verification email
4. User must verify email before full access
5. Redirect to complete profile

**Implementation in Callback:**

```typescript
if (data.user && !data.user.email_confirmed_at) {
  return NextResponse.redirect(
    new URL('/verify-email?email=' + encodeURIComponent(data.user.email), requestUrl.origin)
  );
}
```

---

## 3. Security Monitoring

### 3.1 Logging Requirements

**Log ALL of the following:**

```typescript
// Successful OAuth login
console.info('[OAuth] Successful login:', {
  provider: 'google',
  userId: data.user.id,
  email: data.user.email,
  ip: request.headers.get('x-forwarded-for'),
  timestamp: new Date().toISOString(),
});

// Failed OAuth attempt
console.warn('[OAuth] Failed callback:', {
  error: error.message,
  code: code,
  ip: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
  timestamp: new Date().toISOString(),
});

// Blocked redirect attempt
console.warn('[Security] Blocked OAuth redirect:', {
  attemptedRedirect: rawNext,
  ip: request.headers.get('x-forwarded-for'),
  userAgent: request.headers.get('user-agent'),
  timestamp: new Date().toISOString(),
});

// Rate limit exceeded
console.warn('[Security] OAuth rate limit exceeded:', {
  ip: ip,
  attempts: rateLimit.attempts,
  resetAt: new Date(rateLimit.resetAt),
  timestamp: new Date().toISOString(),
});
```

### 3.2 Monitoring Alerts

**Set up alerts for:**

- ✅ >10 failed OAuth callbacks from same IP in 1 hour
- ✅ >5 blocked redirect attempts in 1 hour
- ✅ Any callback from non-whitelisted redirect URI
- ✅ OAuth callback during scheduled maintenance
- ✅ New user signup spike (>100/hour)

---

## 4. Testing Checklist

### 4.1 Functional Testing

- [ ] Google OAuth signup creates user account
- [ ] Google OAuth login works for existing users
- [ ] Email verification email sent after OAuth signup
- [ ] Redirect to correct dashboard after verification
- [ ] Onboarding flow triggered for new OAuth users
- [ ] Profile completion required after OAuth signup

### 4.2 Security Testing

- [ ] Attempt OAuth callback with invalid `code`
- [ ] Attempt OAuth callback with expired `code`
- [ ] Attempt OAuth callback with manipulated `state`
- [ ] Attempt redirect to external domain (e.g., `https://evil.com`)
- [ ] Attempt protocol-relative redirect (e.g., `//evil.com`)
- [ ] Exceed rate limit and verify 429 response
- [ ] Test OAuth callback without email verification
- [ ] Test account takeover via OAuth email change

### 4.3 Integration Testing

- [ ] Baseball OAuth flow end-to-end
- [ ] Golf OAuth flow end-to-end
- [ ] Coach signup via OAuth
- [ ] Player signup via OAuth
- [ ] Existing email + new OAuth provider linkage
- [ ] Multiple OAuth providers for same user

---

## 5. Incident Response

### 5.1 Compromised OAuth Credentials

**If Google Client Secret is leaked:**

1. **Immediate:** Rotate credentials in Google Cloud Console
2. **Update:** Supabase provider settings with new secret
3. **Invalidate:** All existing OAuth sessions via Supabase
4. **Audit:** Review auth logs for suspicious activity
5. **Notify:** Users if any suspicious logins detected

### 5.2 OAuth Callback Attack Detected

**If suspicious OAuth activity detected:**

1. **Block:** IP address at CDN/firewall level
2. **Revoke:** Any sessions created from suspicious IPs
3. **Investigate:** Review logs for pattern analysis
4. **Patch:** Update redirect validation if bypass found
5. **Report:** File incident report with timestamps and IPs

---

## 6. Compliance & Privacy

### 6.1 GDPR Compliance

**OAuth Data Collection:**

- ✅ Only request minimum scopes (email, profile)
- ✅ Provide clear consent UI before OAuth
- ✅ Allow users to disconnect OAuth provider
- ✅ Delete OAuth data when user deletes account
- ✅ Document OAuth data usage in Privacy Policy

### 6.2 User Data Handling

**From Google OAuth:**

- Email address (required for account)
- Profile picture (optional, stored in Supabase Storage)
- Display name (used to populate profile)

**Data Retention:**

- Active accounts: Indefinite
- Deleted accounts: 30 days for recovery, then permanent deletion
- OAuth tokens: Refreshed automatically, old tokens expired

---

## 7. Quick Reference Commands

### 7.1 Test OAuth Callback Locally

```bash
# Start local server
npm run dev

# Initiate OAuth (copy URL from browser)
# Visit: http://localhost:3000/baseball/login
# Click "Sign in with Google"

# Callback will hit: http://localhost:3000/auth/callback?code=...

# Check logs for security events
tail -f .next/server.log | grep "\[OAuth\]"
```

### 7.2 Regenerate OAuth Credentials

```bash
# Google Cloud Console → APIs & Services → Credentials
# 1. Click on OAuth 2.0 Client ID
# 2. Click "Reset Secret"
# 3. Copy new Client Secret
# 4. Update in Supabase Dashboard
# 5. Test OAuth flow
```

---

## 8. Future Enhancements

### 8.1 Planned (Q1 2026)

- [ ] Add GitHub OAuth provider
- [ ] Implement MFA for OAuth users
- [ ] Add "Sign in with Apple" for GDPR regions
- [ ] Implement account linking (multiple OAuth providers)
- [ ] Add OAuth session device management

### 8.2 Consideration (Q2 2026)

- [ ] Add LinkedIn OAuth for coach verification
- [ ] Implement OAuth scope escalation (gradual permissions)
- [ ] Add OAuth consent screen customization
- [ ] Implement OAuth provider-specific branding

---

## 9. Support Contacts

**OAuth Issues:**
- Email: oauth-support@helm.app
- Slack: #auth-security
- On-call: +1-XXX-XXX-XXXX

**Supabase Support:**
- Dashboard: https://supabase.com/dashboard/support
- Discord: https://discord.supabase.com
- Docs: https://supabase.com/docs/guides/auth/social-login

---

**Last Updated:** December 30, 2025
**Next Review:** January 30, 2026
**Document Owner:** Security Team

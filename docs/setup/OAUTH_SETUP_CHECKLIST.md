# OAuth Setup Checklist

Use this checklist to configure OAuth providers for Helm Sports Labs.

---

## Pre-Deployment Checklist

### 1. Google OAuth Setup ✅

#### A. Google Cloud Console

- [ ] Create OAuth 2.0 Client ID
- [ ] Configure OAuth Consent Screen
  - [ ] Set application name: "Helm Sports Labs"
  - [ ] Add support email
  - [ ] Add authorized domains: `helm.app`, `supabase.co`
  - [ ] Configure scopes: `email`, `profile`, `openid`
- [ ] Add authorized redirect URIs:
  - [ ] Production: `https://[project-id].supabase.co/auth/v1/callback`
  - [ ] Staging: `https://[staging-project-id].supabase.co/auth/v1/callback`
  - [ ] Development: `http://localhost:3000/auth/callback`
- [ ] Copy Client ID and Client Secret

#### B. Supabase Dashboard

- [ ] Navigate to Authentication → Providers → Google
- [ ] Enable Google provider
- [ ] Paste Client ID
- [ ] Paste Client Secret
- [ ] Save configuration

#### C. Testing

- [ ] Test Google login in development
- [ ] Verify email is captured correctly
- [ ] Verify redirect to `/baseball/complete-signup` for new users
- [ ] Verify redirect to dashboard for existing users
- [ ] Test error handling for canceled OAuth

---

## Security Validation

### 2. Rate Limiting ✅ (IMPLEMENTED)

- [x] OAuth callback rate limited to 10/hour per IP
- [x] Rate limit errors redirect to login with retry time
- [x] All rate limit violations logged

### 3. Redirect Validation ✅ (IMPLEMENTED)

- [x] Whitelist of allowed redirect paths
- [x] Blocks external domains
- [x] Blocks protocol-relative URLs
- [x] Logs all blocked redirect attempts

### 4. Security Logging ✅ (IMPLEMENTED)

- [x] Log successful OAuth authentications
- [x] Log failed OAuth attempts
- [x] Log rate limit violations
- [x] Include IP and User-Agent in logs

---

## Post-Deployment Verification

### 5. Production Testing

- [ ] Test Google OAuth on production domain
- [ ] Verify SSL/HTTPS enforced
- [ ] Confirm redirect URIs match exactly
- [ ] Test error handling in production
- [ ] Monitor logs for suspicious activity

### 6. Monitoring Setup

- [ ] Set up alerts for OAuth failures >10/hour
- [ ] Set up alerts for rate limit violations
- [ ] Set up alerts for blocked redirect attempts
- [ ] Add OAuth metrics to dashboard

---

## Optional Providers (Future)

### 7. GitHub OAuth

- [ ] Create OAuth App in GitHub
- [ ] Configure callback URL
- [ ] Enable in Supabase
- [ ] Test integration

### 8. Microsoft/LinkedIn (Enterprise)

- [ ] Evaluate business need
- [ ] Configure provider
- [ ] Test integration

---

## Security Audit

### 9. Regular Reviews

- [ ] **Monthly:** Review OAuth logs for anomalies
- [ ] **Quarterly:** Rotate OAuth client secrets
- [ ] **Annually:** Full security audit of OAuth implementation

### 10. Documentation

- [x] OAuth Security Guide created (`/docs/OAUTH_SECURITY_GUIDE.md`)
- [x] Setup checklist created (this file)
- [ ] Update user-facing documentation with OAuth instructions

---

## Emergency Contacts

**OAuth Issues:**
- Developer: [Your Name]
- Email: dev@helm.app
- On-call: [Phone Number]

**Supabase Support:**
- Dashboard: https://supabase.com/dashboard/support
- Emergency: [Supabase support contact]

---

**Last Updated:** December 30, 2025
**Next Review:** January 30, 2026

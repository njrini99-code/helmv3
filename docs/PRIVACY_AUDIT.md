<!--
STATUS: STALE
DATE: 2026-07-10
SUPERSEDED BY / WHY: Committed 2026-03-05 ("comprehensive app stability overhaul"), iOS App Store submission scope. Not confirmed against current App Store Connect status in the 2026-07-10 sweep — re-verify before relying on this; treat as historical if the submission has since moved forward.
KEPT FOR HISTORY -- do not delete this file.
-->

# Privacy & Data Compliance Audit Report

**App:** Helm Sports Labs (GolfHelm / BaseballHelm)
**Auditor:** Database & Privacy Auditor (Automated)
**Date:** 2026-03-05
**Target:** Apple App Store Submission Readiness

---

## Executive Summary

| Area | Status | Severity |
|------|--------|----------|
| Privacy Policy | PASS | - |
| Terms of Service | PASS | - |
| Account Deletion | PASS | - |
| COPPA Compliance | CRITICAL FAIL | Blocker |
| Consent Flows | PARTIAL | High |
| Supabase RLS | PASS (with history of issues) | Medium |
| Third-Party Data Sharing | NEEDS DISCLOSURE | High |
| Data Export (GDPR) | FAIL | Medium |
| Cookie/Tracking Consent | FAIL | High |
| Apple Privacy Labels | NEEDS COMPLETION | Blocker |

**Overall Verdict: NOT READY for App Store submission until COPPA and privacy label issues are resolved.**

---

## 1. Privacy Policy

**Status: PASS**

- Privacy policy exists at `/privacy` (`src/app/(legal)/privacy/page.tsx`)
- Last updated: March 1, 2026
- Covers: information collected, how used, how shared, user choices, data retention, contact
- Linked from both Golf and Baseball settings pages
- Linked from sign-up form footer

**Issues:**
- Privacy policy does NOT mention minors/children specifically (required for COPPA)
- Does not enumerate specific third-party services (Sentry, Datadog, Vercel Analytics)
- Does not mention push notification data collection
- Does not specify data retention periods (just says "as long as necessary")
- No mention of California CCPA rights or international data transfers

**Required Actions:**
1. Add a "Children's Privacy" section addressing COPPA/minors
2. List all third-party analytics/monitoring services by name
3. Add specific data retention periods
4. Add CCPA disclosure section
5. Mention push notification tokens and device data

---

## 2. Terms of Service

**Status: PASS**

- Terms page exists at `/terms` (`src/app/(legal)/terms/page.tsx`)
- Last updated: March 1, 2026
- States minimum age of 13 and requires parental permission under 18
- Covers eligibility, account responsibilities, acceptable use, content ownership, termination

**Issues:**
- Parental permission is stated but NOT enforced in the app (see COPPA section)
- No arbitration clause (standard for US apps)
- No limitation of liability section

---

## 3. Account Deletion

**Status: PASS**

Apple requires users to be able to delete their account from within the app. This is implemented.

**Implementation:**
- **API Route:** `src/app/api/account/delete/route.ts` - DELETE endpoint
- **Golf Settings:** `src/app/golf/(dashboard)/dashboard/settings/page.tsx` - "Danger Zone" section with Delete Account button (lines 491-508), uses `window.confirm()` dialog
- **Baseball Settings:** `src/app/baseball/(dashboard)/dashboard/settings/page.tsx` - More robust flow with type-to-confirm "DELETE" (lines 296-369)
- **Backend script:** `delete_user.mjs` (admin utility, hardcoded user ID)

**Deletion Process:**
1. Authenticates user via session
2. Deletes from `baseball_messages` (by sender_id)
3. Deletes from `golf_messages` (by sender_id)
4. Deletes from `baseball_player_engagement_events` (by coach_id)
5. Deletes from `users` table (cascades to golf_players/golf_coaches)
6. Deletes from Supabase Auth

**Issues:**
- Golf deletion uses basic `window.confirm()` instead of type-to-confirm like Baseball (inconsistent UX but functional)
- Deletion does NOT explicitly clean up: golf_rounds, golf_shots, golf_holes, golf_documents, golf_tasks, golf_travel_itineraries, golf_announcements, golf_messages (attachments), golf_coach_insights, golf_patterns_v2, push_subscriptions, golf_round_drafts
  - These may cascade via foreign keys, but this should be verified
- No email confirmation is sent before deletion (recommended best practice)
- Storage bucket files (avatars, attachments) are NOT cleaned up
- No grace period / undo window

**Required Actions:**
1. Verify CASCADE deletes cover all golf/baseball child tables
2. Add storage bucket cleanup (avatars, document uploads, message attachments)
3. Consider adding email confirmation before irreversible deletion

---

## 4. COPPA Compliance (CRITICAL)

**Status: CRITICAL FAIL - App Store Blocker**

This app serves HIGH SCHOOL student athletes (minors under 18, potentially under 13). COPPA applies to users under 13; additional protections needed for 13-17.

### What the app collects from minors (players):
- **PII:** First name, last name, email, phone number
- **Location:** Hometown, state
- **Academic:** GPA, graduation year, class schedules
- **Athletic:** Handicap, round scores, shot-by-shot data, performance stats
- **Media:** Avatar photos, message attachments
- **Behavioral:** App usage via Datadog RUM, Sentry error tracking, Vercel Analytics
- **Device:** Push notification tokens, device info

### What is MISSING:

1. **No age verification at signup**
   - Sign-up form (`src/components/auth/golf-sign-up-form.tsx`) collects: first name, last name, email, password, role
   - No date of birth field, no age gate, no age question
   - Graduation year is collected during onboarding but NOT used for age verification

2. **No parental consent flow**
   - Terms say "must have permission from a parent or guardian" (line 36 of terms)
   - This is NEVER enforced in code
   - No parent email collection, no parent verification, no consent mechanism
   - No parental access to child's account

3. **No age-appropriate data handling**
   - Same data is collected from minors as from adult coaches
   - No reduced data collection mode for under-13 users
   - No way for parents to review/delete child's data

4. **Onboarding collects sensitive data without consent gates**
   - Player onboarding (`src/app/golf/(onboarding)/player/page.tsx`) immediately collects: name, graduation year, handicap, hometown, state, GPA, avatar photo
   - No consent screen before data collection
   - No parent/guardian notification

### Apple's Specific Requirements:
- Apps collecting data from minors must comply with COPPA
- Apps targeting children must participate in Apple's "Kids" category OR clearly gate minors
- Must declare the app's age rating appropriately
- Privacy Nutrition Labels must disclose data linked to identity

### Required Actions (CRITICAL - must fix before submission):
1. **Add age gate:** Collect date of birth at signup or require graduation year to calculate age
2. **Under-13 block OR parental consent:** Either block users under 13 entirely, or implement verifiable parental consent (COPPA requirement)
3. **13-17 consent flow:** Add parent/guardian email + consent confirmation for 13-17 year olds
4. **Update Privacy Policy:** Add "Children's Privacy" section
5. **Minimize data collection for minors:** Consider what data is truly necessary
6. **Set appropriate age rating** in App Store Connect (likely 12+ or 17+)

---

## 5. Data Collection Inventory & Apple Privacy Labels

### Personal Data Collected:

| Data Type | Apple Category | Linked to Identity? | Tables |
|-----------|---------------|---------------------|--------|
| Name (first, last) | Contact Info | Yes | users, golf_players, golf_coaches, players, coaches |
| Email | Contact Info | Yes | users (via auth) |
| Phone | Contact Info | Yes | golf_players |
| Location (city, state) | Location | Yes | golf_players, golf_organizations |
| Photos (avatar) | Photos or Videos | Yes | golf_players, golf_coaches (avatar_url) |
| GPA | Sensitive Info | Yes | golf_players |
| Athletic performance | Fitness & Health | Yes | golf_rounds, golf_holes, golf_shots, golf_player_stats_cache |
| Messages | User Content | Yes | golf_messages, baseball_messages |
| Documents | User Content | Yes | golf_documents |
| App usage/interactions | Usage Data | Yes (via Datadog user context) | Datadog RUM |
| Crashes/errors | Diagnostics | Possibly (via Sentry) | Sentry |
| Page views | Analytics | No | Vercel Analytics |
| Device info | Identifiers | Yes (via push tokens) | push_subscriptions |
| Graduation year | Sensitive Info | Yes | golf_players |

### Apple Privacy Label Categories to Declare:
1. **Contact Info** - Name, Email, Phone Number
2. **Location** - Coarse Location (city/state, not GPS)
3. **Health & Fitness** - Fitness Data (athletic performance stats)
4. **User Content** - Photos, Messages, Other (documents)
5. **Browsing History** - No
6. **Search History** - No
7. **Identifiers** - User ID, Device ID (push tokens)
8. **Usage Data** - Product Interaction (Datadog RUM)
9. **Diagnostics** - Crash Data (Sentry), Performance Data (Datadog)
10. **Sensitive Info** - May apply (GPA, minor status)

### Required Actions:
1. Complete Apple Privacy Label questionnaire in App Store Connect
2. Declare all third-party SDKs and their data practices
3. Create a privacy manifest file (PrivacyInfo.xcprivacy) for required API usage

---

## 6. Third-Party Data Sharing

### Sentry (Error Monitoring)
- **Config:** `sentry.server.config.ts`, `sentry.edge.config.ts`
- **Data sent:** Error stack traces, request context, environment info
- **User data:** Not explicitly setting user context, but errors may contain user IDs in stack traces
- **Sample rate:** 100% in production (traces), 30% profiling
- **Issue:** No explicit PII scrubbing configured

### Datadog (RUM + Logs)
- **Config:** `src/lib/datadog/index.ts`
- **Data sent:** Session replays (20% sample), user interactions, resource timing, long tasks, errors
- **User data:** EXPLICITLY sets user context: `{ id, email, name }` via `setDatadogUser()`
- **Privacy setting:** `defaultPrivacyLevel: 'mask-user-input'` (good - masks form inputs in replays)
- **Issue:** User email and name are sent to Datadog - must be disclosed in privacy policy
- **Database monitoring:** `datadog/setup-datadog-user.sql` creates a `datadog` DB user with `pg_monitor` role and query explain access

### Vercel Analytics
- **Config:** `src/app/layout.tsx` imports `@vercel/analytics/next`
- **Data sent:** Page views, web vitals, anonymous usage data
- **User data:** Generally anonymous, no PII by default
- **Issue:** Must still be disclosed in privacy policy

### Required Actions:
1. Add Sentry PII scrubbing (`beforeSend` callback to strip emails/names)
2. Disclose Datadog, Sentry, and Vercel Analytics in privacy policy by name
3. Consider making Datadog user context opt-in or anonymized for minors
4. Add these services to App Store Connect privacy declarations

---

## 7. Supabase RLS (Row Level Security)

**Status: PASS (with history of issues)**

### Current State:
- Comprehensive RLS migration exists: `supabase/migrations/034_all_rls_policies.sql`
- RLS enabled on ALL tables (100+ tables covered)
- Policies follow principle of least privilege:
  - Users can only see/edit own data
  - Coaches can see team data
  - Players can see shared content
  - Service role used for admin operations

### Historical Issues:
- `FIX_RLS_URGENT.sql` - Emergency fix for user signup RLS (users table)
- `044_fix_messaging_rls.sql` - Messaging RLS fix
- `061_fix_golf_rls_recursion.sql` - RLS infinite recursion fix
- `20260119000001_fix_golf_team_members_rls_recursion.sql` - Another recursion fix
- `20260120215905_fix_golf_conversations_rls.sql` - Conversation RLS fix
- `20260204200000_fix_golf_rls_infinite_recursion.sql` - Yet another recursion fix
- `20260204210000_fix_golf_rls_recursion_v2.sql` - And another
- `20260204235000_fix_golf_rls_recursion_final.sql` - Final recursion fix
- `20260212000003_fix_security_rls.sql` - Security RLS fixes
- `20260213000000_fix_broken_coach_select_rls.sql` - Broken coach select
- `20260125000000_fix_baseball_rls_comprehensive.sql` - Comprehensive baseball fix

### Observations:
- Pattern of RLS recursion issues suggests complex policy chains (tables referencing each other in USING clauses)
- Multiple "urgent" and "final" fixes suggest production RLS issues were discovered in real usage
- Current policies in `034_all_rls_policies.sql` are comprehensive and well-structured

### Potential Concerns:
- Some RLS policies use subqueries that could be slow at scale
- `login_attempts` table has `USING (false)` which completely blocks client access (correct for security)
- No DELETE policies on some tables (intentional? or oversight?)
- Admin bypass exists via `20260209100000_add_admin_read_bypass_rls.sql`

---

## 8. Data Export (GDPR Right to Portability)

**Status: FAIL**

- **No user-facing data export feature exists**
- The `DataExportButton` component (`src/app/golf/admin/components/DataExportButton.tsx`) is admin-only and exports generic CSV data, not personal data
- Users cannot download their own data
- No API endpoint for data export

### Required Actions:
1. Implement a "Download My Data" feature in Settings
2. Should export: profile info, rounds, shots, stats, messages, documents metadata
3. Format: JSON or CSV download
4. Required for GDPR compliance (EU users) and good practice for App Store

---

## 9. Consent Flows

### Terms of Service Acceptance
**Status: PARTIAL**

- Sign-up form (`golf-sign-up-form.tsx`, line 315-320) includes: "By creating an account, you agree to our Terms and Privacy Policy" with links
- This is **passive consent** (no checkbox) - acceptable in most jurisdictions but NOT for COPPA
- No record is stored of when/how consent was given
- No re-consent mechanism when terms are updated

### Cookie/Tracking Consent
**Status: FAIL**

- No cookie consent banner exists
- No tracking consent mechanism
- Datadog RUM, Sentry, and Vercel Analytics all load automatically without user consent
- Required for GDPR (EU users) and recommended for App Store
- iOS App Tracking Transparency (ATT) framework may be needed if using IDFA

### Required Actions:
1. Add checkbox consent at signup (especially for minors)
2. Store consent timestamp in database
3. Add cookie/tracking consent banner for web
4. Implement ATT prompt for iOS if using IDFA
5. Add re-consent flow when privacy policy changes

---

## 10. Additional Findings

### Hardcoded Credentials in Source
- `delete_user.mjs` contains a hardcoded user ID (not a security issue, but poor practice)
- `datadog/setup-datadog-user.sql` has placeholder password `YOUR_SECURE_PASSWORD`

### Missing Privacy Features
- No "Do Not Track" respect
- No data anonymization pipeline
- No automated data retention/deletion (data retained indefinitely)
- No audit log of data access (who viewed what player data)
- No data processing agreement references for third-party services

### Push Notification Privacy
- `push_subscriptions` table stores device tokens
- Tokens are linked to user IDs (PII)
- Must be disclosed in privacy labels
- Must be deleted on account deletion

---

## Priority Action Items

### P0 - App Store Blockers (Must fix before submission)

1. **COPPA: Add age gate at signup** - Collect DOB or use graduation year to determine age
2. **COPPA: Add parental consent flow for minors** - Parent email + verification for under-18
3. **Apple Privacy Labels** - Complete the privacy questionnaire in App Store Connect
4. **Privacy manifest** - Create PrivacyInfo.xcprivacy for required API declarations

### P1 - High Priority (Should fix before submission)

5. **Update Privacy Policy** - Add children's section, list third-parties, add CCPA section
6. **Add tracking consent** - Cookie/tracking consent banner or ATT prompt
7. **Sentry PII scrubbing** - Add beforeSend callback to strip user PII
8. **Verify CASCADE deletes** - Ensure account deletion removes ALL user data
9. **Storage cleanup on deletion** - Delete avatar/attachment files from Supabase Storage

### P2 - Medium Priority (Fix soon after launch)

10. **Data export feature** - "Download My Data" for GDPR compliance
11. **Consent record keeping** - Store when/how users consented to terms
12. **Anonymize Datadog user context for minors**
13. **Add data retention policy** - Auto-delete/anonymize data after retention period

### P3 - Low Priority (Best practices)

14. **Audit logging** - Track who accessed whose data
15. **Re-consent mechanism** - Notify users of privacy policy changes
16. **Do Not Track** support
17. **Data processing agreements** - Document third-party processor relationships

---

*This audit covers code-level analysis only. A legal review of the privacy policy and terms of service by qualified counsel is strongly recommended, especially given the involvement of minors.*

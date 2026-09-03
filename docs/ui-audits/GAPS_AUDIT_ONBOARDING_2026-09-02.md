# GolfHelm Gaps Audit — Empty States, Password Reset, Invite Flow

**Date:** 2026-09-02
**Scope:** Golf only. Mobile viewport 390×844 (iPhone 13 emulation), Chrome (OpenClaw managed profile).
**Screenshots:** `mobile-viewport-shots-2026-09-02/gaps-onboarding/` (25 images, numbered in walkthrough order)

This is a follow-up to two prior audit rounds, closing three specific coverage gaps: empty states for a brand-new coach, the password-reset flow, and invite-acceptance for a new player.

---

## 1. Empty states — BLOCKED for coach signup, tested via a genuinely new player instead

### What happened
There is **no self-serve path to create a brand-new, empty coach account** on the golf product. I traced every entry point from `/golf/login`:

- `/golf/signup` (linked from "Create an account" on login) is **not** a coach signup form — it's a "Enter your team code" screen for **players joining an existing team**. (`03-signup-is-team-code-join-only.png`)
- The only other option on that screen, "See a live demo," goes to `/golf/demo`, a lead-gen form ("Your name / Work email / School") that explicitly states: **"You'll be signed into a shared demo account instantly. No password needed."** This drops you into a fully-populated pre-built roster, not an empty one. (`04-golf-demo-shared-account-only.png`)
- There is no coach registration form, invite-yourself flow, or trial-account creation reachable from the public site.

**Verdict:** Coach accounts are provisioned out-of-band (sales/onboarding), not self-serve. This is a legitimate product/business decision, not a bug — but it means **empty-state coverage for the coach role could not be tested as originally scoped**, and wasn't tested in either of the two prior audit rounds either, as far as I can tell from existing reports.

### What I did instead
I confirmed the two existing demo accounts (coach "Nick Rini" / Demo University Golf, and player "Cole Bennett") are **fully populated across every section** — dashboard, roster, recruiting HQ, calendar, tasks/operations, messages, announcements, qualifiers, and team stats all had real data. None of these surfaced a natural empty state under the coach account.

To still deliver genuine empty-state coverage, I used the coach's own **"Invite player"** feature to add a brand-new player account with zero history to the existing team (see Section 3), then audited every screen that account sees. **This is real empty-state data, not a guess** — it's what any newly-invited player actually sees today.

### Empty-state findings (new player account, zero rounds/messages/focus areas)

| Screen | Verdict | Screenshot |
|---|---|---|
| Dashboard — "log your first round" panel | **Good.** Icon, clear headline ("Log your first round to wake up your game profile"), explanatory copy, strong CTA ("Submit your first round"), plus a preview grid of what unlocks (Scoring average, Best round, etc.) | `16-new-player-dashboard-empty-state-good.png` |
| Dashboard — "My focus areas" | **Good.** Inbox icon, "No focus areas yet," correctly explains this is coach-driven (no dead-end CTA for something the player can't do themselves) | `17-new-player-no-focus-areas-empty-state.png` |
| Rounds tab | **Good.** Stat tiles show "Awaiting rounds / Not enough data yet — 3 more rounds needed" with a 0/3 progress readout, then a full-width "No rounds yet" panel with a "Log your first round" CTA | `18-new-player-rounds-empty-state.png`, `19-new-player-no-rounds-yet-good.png` |
| Stats tab | **Good.** "More rounds needed — Log 5+ rounds and the strokes-gained standing vs PGA Tour and the team fills in" | `20-new-player-stats-empty-state.png` |
| Messages tab | **Good.** "No conversations yet — Reach out to a teammate or coach to get a thread started," with "New message" CTA | `22-new-player-messages-empty-state-good.png` |
| My Qualifiers tab | **Good.** "No qualifiers yet — No qualifiers have been posted by your coach yet. When one is, it shows up here," with secondary "View your rounds" action | `24-new-player-qualifiers-empty-state-good.png` |

**Overall assessment:** every empty state I found is well-designed and on-brand — consistent icon-in-circle + bold headline + one-line explanation + CTA pattern repeated across the app. This is a genuine strength, not a gap, for the states I could reach. I did not find any broken/blank/error-looking empty state in this account.

**Caveat / what's still unverified:** the coach-side empty states (empty roster, empty calendar, empty qualifiers list, empty recruiting HQ, empty announcements, empty tasks board, day-one "no players yet" dashboard) remain **untested**, because there is no way to reach a coach account with zero data through the product itself. If this matters, it needs either a database-level test account or a product decision to add a self-serve coach trial signup.

---

## 2. Password reset flow

### What works
- `/golf/forgot-password` is a clean, on-brand screen: heading, one-line instruction, single email field, "Send reset link" button, "Remember your password? Sign in," and "← Back to HelmLabs." (`01-forgot-password-form.png`)
- Submitting shows a clear confirmation screen: "Check your email — We've sent a reset link to `<email>`," a mail icon, "Click the link in the email to reset your password. The link expires in 1 hour," a "Didn't get it? Check your spam folder, or try again with a different email" hint, and a "Back to sign in" button.
- I could not go further without real email access (as instructed), but everything up to that point is functionally clear and well-copywritten.

### Bug found: no email format validation
I submitted the literal string `not-an-email` (no @ sign, no domain) into the email field. The form accepted it with **zero client-side or server-visible validation** and rendered:

> "We've sent a reset link to **not-an-email**"

(`02-forgot-password-invalid-email-accepted-BUG.png`)

**Severity:** Low-to-medium. Not a security hole by itself (Supabase's `resetPasswordForEmail` will just silently no-op or error server-side for a non-existent/malformed address), but it's a real functional/UX defect:
- **Functionality:** the field has no `type="email"` validation or regex check, so it will accept obviously malformed input and give false positive success feedback.
- **UX quality:** confirming "we sent a reset link" to something that cannot possibly be a real email address undermines trust in the message and could mask genuine typos (e.g., a coach fat-fingering their email would get the same false "sent" confirmation with no way to know they need to retype it).

**Confidence:** Verified/observed directly — not inferred. I did not additionally re-test a syntactically-valid-but-nonexistent email to check for user-enumeration behavior (e.g., does it show a different message for an account that doesn't exist?) — the one test performed already surfaces the validation gap, and I judged that redundant given the invalid-format test already demonstrated no server-side rejection was visible.

**Suggested fix:** add basic email format validation (regex or `type="email"` + required pattern) before allowing submission, matching the same rigor already present on the signup form's password field (which does have a live strength/requirements checklist — see Section 3).

---

## 3. Invite-acceptance flow — fully tested end to end, works correctly

### How I retrieved the invite (no real email needed)
As coach, Roster → **"Invite player"** opens a modal titled "Invite players to Demo University Golf" that directly displays:
- An **invite code** (`PRH4UJF5`)
- A full **invite link** (`https://helmsportslabs.com/golf/join/PRH4UJF5`)
- A "Copy invite link" button and a "How it works" explainer

(`05-invite-player-modal.png`, `06-invite-modal-scrolled-no-email-field.png`)

**Finding — naming mismatch (worth a product decision, not a bug):** the button is labeled **"Invite player"** (singular, implying a targeted invite to one specific person), but the feature it opens is a **generic, reusable team-join link/code** — there is no email field anywhere in this modal, no per-invitee tracking, and no way to see who has or hasn't used the link. Anyone who obtains the code or link (e.g., forwarded, screenshotted, leaked in a group chat) can join the team as a player. If the intent is "one invite per player, sent to their specific email, single-use," that's not what's currently built — what's built is "one shareable link per team." Worth confirming with product whether this is intentional (simpler for coaches, lower friction) or a gap versus what coaches expect from a button that says "Invite player."

### What a brand-new invited player sees, step by step
I signed out completely and opened the raw invite link in a logged-out session — genuinely simulating a new recruit clicking a link for the first time.

1. **`/golf/join/PRH4UJF5`** — "Enter your team code" screen, with the code **pre-filled** from the URL. Clean, on-brand, single "Continue" action. (`07-invite-link-prefilled-code.png`)
2. **Account setup** — "Join Demo University Golf — Choose how you're joining, then create your account." Toggle between **Player** / **Assistant coach** roles, then First/Last name, Expected graduation year (dropdown), Email, Password. Small compliance note ("a parent or guardian acknowledges and consents...") appears unconditionally regardless of stated age — minor copy oddity for a college-recruiting product, not a functional issue. (`08-invite-join-account-setup-form.png`, `09-invite-signup-year-dropdown.png`)
3. **Password field** has a live strength meter ("Strong") and a real-time checklist (8+ characters, uppercase, lowercase, number, special character) — nicely done, better UX than the reset-password field's total lack of validation. (`10-invite-signup-form-filled.png`, `11-invite-signup-password-checklist.png`)
4. **3-step onboarding wizard** appears immediately after account creation, with a progress tracker (About You → Profile → Done):
   - **Step 1, "About You"** — first/last name and graduation year pre-filled from signup, plus optional Handicap Index and Hometown (City/State) with helpful placeholder examples. (`12-onboarding-step1-about-you.png`)
   - **Step 2, "Profile"** — auto-generated avatar from initials ("AT"), "Upload Photo" option, optional GPA field with a one-line rationale ("Helps your coach with eligibility tracking"). (`13-onboarding-step2-profile.png`)
   - **Step 3, "Done"** — "Welcome, Audit!" confirmation with a "Go to Dashboard" CTA. (`14-onboarding-step3-welcome.png`)
5. **Landed on a genuinely fresh dashboard** — "Good evening, Audit," correctly scoped to Demo University Golf, immediately showing the "log your first round" empty state described in Section 1.

### Functional verification the invite actually worked
- Team roster count moved from 7 → 8 players immediately after signup (visible on the new player's own Team Hub: "8 players"). (`23-new-player-team-hub-8-players.png`)
- The new player's own "Team Roster" view correctly shows **7 teammates** (i.e., excludes self), each with handicap and class year. (`25-new-player-roster-view-confirms-join.png`)
- The new account was correctly attached to "Demo University Golf" (confirmed via the account menu header and Team Hub). (`21-new-player-more-menu.png`)

**Overall assessment:** functionally, this flow works cleanly end to end — no errors, no dead ends, no broken redirects. Visually it's on-brand and consistent with the rest of the product (same golf-course illustration, same green/cream palette, same card style). The only real product question is the "Invite player" labeling vs. its actual generic-link behavior, noted above.

---

## Summary

| Area | Status | Key finding |
|---|---|---|
| Coach empty states | **Blocked** (no self-serve coach signup exists) | Documented the block; substituted a genuinely empty new-player account and found all its empty states well-designed |
| Player empty states | **Tested, passed** | 6/6 screens checked show good, on-brand, actionable empty states |
| Password reset — happy path | **Tested, passed** | Clean copy and confirmation screen |
| Password reset — validation | **Bug found** | Malformed email (`not-an-email`) accepted with false "sent" confirmation — no format validation |
| Invite generation | **Tested, works** | Code/link surfaced directly in coach UI, no email needed to retrieve |
| Invite acceptance (new player) | **Tested end-to-end, works** | Full signup → 3-step onboarding → live dashboard, roster count updated correctly |
| Invite UX naming | **Worth a product call** | "Invite player" button produces a generic reusable link, not a targeted per-person invite |

**Total defects found:** 1 confirmed functional bug (password-reset email validation), 1 naming/behavior mismatch worth a product decision (invite-player labeling), 1 structural gap that blocked part of the original scope (no self-serve coach signup for empty-state testing).

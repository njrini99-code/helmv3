# App Store copy — 2.0 (9)

> Paste-ready for App Store Connect. Companion to `SUBMISSION.md` (which holds
> name/subtitle/description/keywords/privacy) and `RELEASE_CANDIDATE_2.0-9.md`
> (runbook). Written 2026-08-26.

## What's New (release notes)

```text
A complete rebuild of the app you already use.

• An entirely new interface — calmer, denser, and faster on every screen.
• Full dark mode, with Light / Dark / System control in Settings.
• CoachHelm rebuilt: a grounded command center that tells you what changed, why it changed, and what to do next.
• A coach triage workspace that puts each day's signals in priority order.
• Round review rebuilt with shot-by-shot visuals.
• Navigation consolidated into a simpler set of coach hubs and player tabs — far less hunting.
• Stats reorganized into a single cockpit with team and player views.
• Development plans and focus areas redesigned, with progress tracked over the goal window rather than your all-time average.
• Premium password reset and branded account emails.
• Haptic feedback throughout, tuned per interaction.

Refined this update:
• Round entry and the scorecard no longer sit under the status bar or Dynamic Island — every screen now respects the full safe area on notched iPhones.
• Tuned for the portrait, one-handed experience the app was actually designed for.
• A new dark app icon so Helm fits your Home Screen whether you run Light, Dark, or Tinted mode.
• Tab switches now use a lighter, more precise tap.

Plus hundreds of fixes to performance, accessibility, and reliability.
```

## App Review notes (Guideline 4.2 / 4.2.2 positioning)

```text
Helm Sports Labs (GolfHelm) is a team-management and round-tracking platform
for college golf programs. The iPhone app is a hybrid app with substantial
native integration — not a repackaged website:

1. PUSH NOTIFICATIONS with deep-link routing. A value-first native permission
   flow (Enable Notifications sheet) precedes the system prompt; pushes for
   team messages, schedule changes, and qualifier updates route to the exact
   in-app screen. To see: sign in with the demo account → the notification
   sheet appears on first dashboard load.
2. UNIVERSAL LINKS. helmsportslabs.com links open directly in the app
   (associated domains, apex + www), signed-in or signed-out.
3. NATIVE HAPTIC GRAMMAR. Scoring controls, tab bar, and segmented controls
   fire UIKit impact/selection feedback via the Taptic Engine, honoring the
   in-app haptics preference. To feel: Rounds → New round → tap par chips /
   club and shot-result choices during shot entry.
4. SYSTEM APPEARANCE INTEGRATION. Light/dark/system theme with native
   status-bar synchronization; the app icon ships Default, Dark, and Tinted
   variants.
5. OFFLINE RESILIENCE. A bundled native offline surface handles no-network
   launches; in-round autosave + checkpointing protect scoring data on weak
   on-course connections.
6. PLATFORM COMPLIANCE BY DESIGN. The native app hides all membership/
   pricing/marketing surfaces (Guideline 3.1.1) via server-side native-app
   detection; portrait-locked, safe-area-native chrome.

DEMO ACCOUNT: see the App Review Information section of this submission
(credentials on file with representative team data: rounds, stats, an active
qualifier, schedule, messages, and CoachHelm insights). The backend is
production and stays available throughout review.

Suggested 5-minute reviewer path: sign in → notification pre-prompt →
dashboard → Rounds → New round (course picker → tee → hole editor → shot
entry with haptics) → Stats → Helm tab (CoachHelm) → More sheet → Calendar.
```

## Console reminders (blocking, owner)

- Re-answer the 2026 age-rating questionnaire (new 4+/9+/13+/16+/18+ tiers;
  the Social Media question: team-scoped private messaging — answer
  deliberately, likely No).
- Declare NO Accessibility Nutrition Label features this release.
- Screenshots: upload `screenshots-2.0/` (6.9-inch, 1320×2868).
